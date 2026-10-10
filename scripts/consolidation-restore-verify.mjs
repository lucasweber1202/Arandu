#!/usr/bin/env node
// Restore isolado e reconciliação do MESMO export criptografado. Destino só
// loopback, sem dados, descartável. Nunca restaura em projeto hospedado, nunca
// aplica o arquivo de roles e nunca aprova conversão: grava um registro de
// verificação ao lado do manifest, que permanece intocado.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { digestFile } from '../lib/recovery-transfer.mjs';
import { majorVersion } from '../lib/pilot-backup-preflight.mjs';
import { COUNTS_SQL, parseCounts, compareCounts, countsDigest, loopbackTarget } from '../lib/recovery-reconciliation.mjs';

export class RestoreVerificationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new RestoreVerificationError(code, message); };

function privateFile(file, root, label) {
  if (!path.isAbsolute(file || '')) fail('invalid_input', `${label}: caminho absoluto obrigatório.`);
  let real;
  try { real = fs.realpathSync(file); } catch { fail('invalid_input', `${label} inexistente.`); }
  const relative = path.relative(fs.realpathSync(root), real);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) fail('invalid_input', `${label} deve ficar fora do repositório.`);
  return real;
}

export async function verifyRestore({ env = process.env, root = process.cwd() } = {}) {
  if (env.ARANDU_RESTORE_CONFIRM !== 'ARANDU-ISOLATED-RESTORE') fail('invalid_input', 'Confirmação de restore isolado ausente.');
  const backup = privateFile(env.ARANDU_RESTORE_BACKUP, root, 'Diretório do export');
  const identity = privateFile(env.ARANDU_RESTORE_IDENTITY, root, 'Identidade age');
  const idStat = fs.statSync(identity);
  if (!idStat.isFile() || (idStat.mode & 0o077) !== 0) fail('invalid_input', 'Identidade age deve ser arquivo 0600.');
  const target = loopbackTarget(env.ARANDU_RESTORE_TARGET_URL);
  const targetEnv = { PATH: env.PATH, HOME: env.HOME, ...target, PGOPTIONS: '-c statement_timeout=600000' };

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8')); } catch { fail('invalid_manifest', 'Manifest ausente ou ilegível.'); }
  if (manifest.result !== 'exported_unverified' || !Array.isArray(manifest.files)) fail('invalid_manifest', 'Export incompleto: só um export concluído pode ser verificado.');
  if (manifest.snapshot !== 'exported_snapshot_shared_with_pg_dump' || !manifest.snapshot_counts) fail('invalid_manifest', 'Export sem contagens do snapshot do dump: reconciliação impossível; refaça o export.');
  const sourceCounts = parseCounts(JSON.stringify(manifest.snapshot_counts));
  if (manifest.snapshot_counts_sha256 !== countsDigest(sourceCounts)) fail('invalid_manifest', 'Contagens do manifest adulteradas.');
  const expected = new Map(manifest.files.map((f) => [f.name, f]));
  for (const name of ['database.dump.age', 'roles.sql.age']) {
    const entry = expected.get(name);
    if (!entry) fail('invalid_manifest', 'Artefato ausente no manifest.');
    let actual;
    try { actual = await digestFile(path.join(backup, name)); } catch { fail('hash_mismatch', 'Artefato ausente.'); }
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) fail('hash_mismatch', 'Hash ou tamanho divergente do manifest; nada foi descriptografado.');
  }

  const run = (binary, args, input = '') => {
    const result = spawnSync(binary, args, { env: binary === 'age' ? { PATH: env.PATH } : targetEnv, input, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    if (result.error || result.status !== 0) fail('tooling', `Falha em ${binary}; detalhes sensíveis omitidos.`);
    return result.stdout;
  };
  for (const binary of ['psql', 'pg_restore']) if (majorVersion(run(binary, ['--version'])) !== 17) fail('tooling', 'Clientes PostgreSQL 17 obrigatórios.');
  run('age', ['--version']);
  const sql = (query) => run('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1'], query).trim();
  if (Number(sql('select current_setting(\'server_version_num\')::int/10000;')) !== 17) fail('target_not_isolated', 'Destino precisa ser PostgreSQL 17.');
  // Destino sem dados: qualquer linha em public/auth/storage/migrations recusa
  // (o restore usa --clean e só é aceitável num cluster descartável).
  const before = parseCounts(sql(COUNTS_SQL));
  if (Object.values(before).some((count) => count > 0)) fail('target_not_empty', 'Destino contém dados; use um cluster loopback novo.');

  const restore = async (args) => {
    const decrypt = spawn('age', ['--decrypt', '--identity', identity, path.join(backup, 'database.dump.age')], { env: { PATH: env.PATH }, stdio: ['ignore', 'pipe', 'ignore'] });
    const consumer = spawn('pg_restore', args, { env: targetEnv, stdio: ['pipe', 'ignore', 'ignore'] });
    const done = (child) => new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code) => (code === 0 ? resolve() : reject(new Error('exit')))); });
    consumer.stdin.on('error', () => {});
    const tasks = [done(decrypt), done(consumer), pipeline(decrypt.stdout, consumer.stdin)];
    try { await Promise.all(tasks); }
    catch { decrypt.kill('SIGKILL'); consumer.kill('SIGKILL'); await Promise.allSettled(tasks); return false; }
    return true;
  };
  const started = new Date();
  if (!await restore(['--list'])) fail('decrypt_failed', 'Descriptografia ou leitura do dump falhou (identidade errada ou artefato corrompido).');
  // Roles de plataforma devem existir antes (reconciliadas e revisadas); o
  // arquivo de roles do export nunca é aplicado aqui. Falta de role aborta tudo.
  if (!await restore(['--exit-on-error', '--single-transaction', '--clean', '--if-exists', `--dbname=${target.PGDATABASE}`])) fail('restore_failed', 'Restore abortado e revertido (single transaction). Reconciliar roles/extensões do destino antes de repetir.');
  const restoredCounts = parseCounts(sql(COUNTS_SQL));
  const comparison = compareCounts(sourceCounts, restoredCounts);
  const record = {
    format_version: 1, export_project_ref: manifest.project_ref, export_started_at: manifest.started_at,
    verified_at: new Date().toISOString(), restore_seconds: Math.round((Date.now() - started.getTime()) / 1000),
    target: 'loopback_disposable_postgresql17', restore: 'RESTORED_ISOLATED', reconciliation: comparison.result,
    tables: comparison.tables, differences: comparison.differences, source_counts_sha256: manifest.snapshot_counts_sha256,
    target_counts_sha256: countsDigest(restoredCounts), files: manifest.files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
    roles_file: 'NOT APPLIED', conversion: 'BLOCKED',
    supabase_services: 'NOT PROVEN (Auth/Storage como serviços exigem imagem Supabase e jornada; contagens cobrem só os metadados)'
  };
  fs.writeFileSync(path.join(backup, `restore-verification-${record.verified_at.replace(/[:.]/g, '-')}.json`), JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  if (comparison.result !== 'MATCH') fail('reconciliation_mismatch', `Reconciliação divergente em ${comparison.differences.length} tabela(s); registro gravado, conversão continua bloqueada.`);
  return record;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  try {
    const record = await verifyRestore();
    console.log(`Restore isolado e reconciliação: ${record.reconciliation} em ${record.tables} tabela(s) (${record.restore_seconds}s). Conversão continua BLOCKED até aprovação.`);
  } catch (error) {
    console.error(`BLOQUEADO (${error.code || 'unexpected'}): ${error.code ? error.message : 'falha inesperada; detalhes omitidos.'}`);
    process.exitCode = 1;
  }
}

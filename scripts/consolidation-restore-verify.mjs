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
import { majorVersion, RECOVERY_REFS } from '../lib/pilot-backup-preflight.mjs';
import { SCHEMA_SQL, SCHEMA_FINGERPRINT_VERSION, validSchemaDigest } from '../lib/recovery-schema.mjs';
import { COUNTS_SQL, parseCounts, compareCounts, countsDigest, loopbackTarget } from '../lib/recovery-reconciliation.mjs';
import { syncPath, assertIdentityFile } from '../lib/recovery-doctor.mjs';

export class RestoreVerificationError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const fail = (code, message) => { throw new RestoreVerificationError(code, message); };

function privateFile(file, root, label) {
  if (!path.isAbsolute(file || '')) fail('invalid_input', `${label}: caminho absoluto obrigatório.`);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && stat.uid !== process.getuid())) fail('invalid_input', `${label}: custódia privada obrigatória.`);
  let real;
  try { real = fs.realpathSync(file); } catch { fail('invalid_input', `${label} inexistente.`); }
  const relative = path.relative(fs.realpathSync(root), real);
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) fail('invalid_input', `${label} deve ficar fora do repositório.`);
  return real;
}

export async function verifyRestore({ env = process.env, root = process.cwd(), syntheticLocal = false } = {}) {
  if (env.ARANDU_RESTORE_CONFIRM !== 'ARANDU-ISOLATED-RESTORE') fail('invalid_input', 'Confirmação de restore isolado ausente.');
  const backup = privateFile(env.ARANDU_RESTORE_BACKUP, root, 'Diretório do export');
  if (!fs.statSync(backup).isDirectory()) fail('invalid_input', 'Export deve ser diretório privado.');
  let identity;
  try { identity = assertIdentityFile(env.ARANDU_RESTORE_IDENTITY, { root, store: backup }); }
  catch { fail('invalid_input', 'Identidade age deve ser arquivo privado separado do export.'); }
  const identityStat = fs.statSync(identity);
  if (identityStat.nlink !== 1 || (typeof process.getuid === 'function' && identityStat.uid !== process.getuid())) fail('invalid_input', 'Identidade age deve pertencer ao operador e não possuir hardlinks.');
  const target = loopbackTarget(env.ARANDU_RESTORE_TARGET_URL);
  const targetEnv = { PATH: env.PATH, HOME: env.HOME, ...target, PGOPTIONS: '-c statement_timeout=600000' };

  let manifest;
  const artifact = name => {
    const file = path.join(backup, name);
    const s = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!s || !s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || (s.mode & 0o077) !== 0 ||
        (typeof process.getuid === 'function' && s.uid !== process.getuid())) fail('invalid_input', 'Artefato deve ser arquivo privado, sem links.');
    return file;
  };
  const manifestFile = artifact('manifest.json');
  try { manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8')); } catch { fail('invalid_manifest', 'Manifest ausente ou ilegível.'); }
  if (manifest.result !== 'exported_unverified' || !Array.isArray(manifest.files)) fail('invalid_manifest', 'Export incompleto: só um export concluído pode ser verificado.');
  // Explicit caller intent; never infer the expected project from the artifact.
  // Synthetic bypass is available only to the imported local test harness.
  if (syntheticLocal) {
    if (manifest.classification !== 'synthetic_encrypted_export' || manifest.project_ref !== null) fail('source_identity_mismatch', 'Ensaio exige export sintético local.');
  } else if (manifest.classification !== 'encrypted_logical_export' || !RECOVERY_REFS.includes(env.ARANDU_RECOVERY_PROJECT_REF) ||
      manifest.project_ref !== env.ARANDU_RECOVERY_PROJECT_REF) fail('source_identity_mismatch', 'Projeto do export não corresponde à origem explicitamente aprovada.');
  if (manifest.schema_fingerprint_version !== SCHEMA_FINGERPRINT_VERSION || !validSchemaDigest(manifest.snapshot_schema_sha256)) fail('invalid_manifest', 'Export sem fingerprint de schema compatível; preserve o artefato e gere nova evidência.');
  if (manifest.snapshot !== 'exported_snapshot_shared_with_pg_dump' || !manifest.snapshot_counts) fail('invalid_manifest', 'Export sem contagens do snapshot do dump: reconciliação impossível; refaça o export.');
  const sourceCounts = parseCounts(JSON.stringify(manifest.snapshot_counts));
  if (manifest.snapshot_counts_sha256 !== countsDigest(sourceCounts)) fail('invalid_manifest', 'Contagens do manifest adulteradas.');
  if (manifest.files.length !== 2 || new Set(manifest.files.map(f => f.name)).size !== 2) fail('invalid_manifest', 'Conjunto de artefatos inválido.');
  const expected = new Map(manifest.files.map((f) => [f.name, f]));
  for (const name of ['database.dump.age', 'roles.sql.age']) {
    const entry = expected.get(name);
    if (!entry) fail('invalid_manifest', 'Artefato ausente no manifest.');
    let actual;
    const file = artifact(name);
    try { actual = await digestFile(file); } catch { fail('hash_mismatch', 'Artefato ausente.'); }
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) fail('hash_mismatch', 'Hash ou tamanho divergente do manifest; nada foi descriptografado.');
  }

  const run = (binary, args, input = '') => {
    const result = spawnSync(binary, args, { env: binary === 'age' ? { PATH: env.PATH } : targetEnv, input, encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
    if (result.error || result.status !== 0) fail('tooling', `Falha em ${binary}; detalhes sensíveis omitidos.`);
    return result.stdout;
  };
  for (const binary of ['psql', 'pg_restore']) if (majorVersion(run(binary, ['--version'])) !== 17) fail('tooling', 'Clientes PostgreSQL 17 obrigatórios.');
  run('age', ['--version']);
  const sql = (query) => run('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], query).trim();
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
  const targetSchema = sql(`begin read only;\n${SCHEMA_SQL}\ncommit;`);
  if (!validSchemaDigest(targetSchema)) fail('tooling', 'Fingerprint do destino inválido.');
  const schemaMatch = targetSchema === manifest.snapshot_schema_sha256;
  const record = {
    format_version: 1, export_project_ref: manifest.project_ref, export_started_at: manifest.started_at,
    verified_at: new Date().toISOString(), restore_seconds: Math.round((Date.now() - started.getTime()) / 1000),
    target: 'loopback_disposable_postgresql17', restore: 'RESTORED_ISOLATED', reconciliation: schemaMatch ? comparison.result : 'MISMATCH',
    row_reconciliation: comparison.result,
    tables: comparison.tables, differences: comparison.differences, source_counts_sha256: manifest.snapshot_counts_sha256,
    target_counts_sha256: countsDigest(restoredCounts), files: manifest.files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })),
    schema_fingerprint_version: SCHEMA_FINGERPRINT_VERSION, schema_reconciliation: schemaMatch ? 'MATCH' : 'MISMATCH',
    source_schema_sha256: manifest.snapshot_schema_sha256, target_schema_sha256: targetSchema,
    roles_file: 'NOT APPLIED', conversion: 'BLOCKED',
    supabase_services: 'NOT PROVEN (Auth/Storage como serviços exigem imagem Supabase e jornada; contagens cobrem só os metadados)'
  };
  const recordFile = path.join(backup, `restore-verification-${record.verified_at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(recordFile, JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  try { syncPath(recordFile); syncPath(backup); } catch { fail('tooling', 'Registro de verificação não pôde ser gravado de forma durável.'); }
  if (!schemaMatch) fail('schema_mismatch', 'Schema divergente; registro gravado, conversão continua bloqueada.');
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

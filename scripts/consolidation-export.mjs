#!/usr/bin/env node
// Read-only preservation. This never restores, migrates or approves conversion.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { sourceConnection, majorVersion } from '../lib/pilot-backup-preflight.mjs';
import { COUNTS_SQL, parseCounts, countsDigest } from '../lib/recovery-reconciliation.mjs';

const SESSION_END = '__ARANDU_SNAPSHOT_STEP__';
// Sessão read-only que exporta um snapshot e o mantém aberto: as contagens da
// reconciliação e o pg_dump enxergam exatamente o mesmo estado do banco.
function snapshotSession(env) {
  const child = spawn('psql', ['-X', '-At', '-q', '-v', 'ON_ERROR_STOP=1', '-f', '-'], { env, stdio: ['pipe', 'pipe', 'ignore'] });
  let buffer = ''; let waiting = null; let failed = null;
  const settle = () => {
    if (!waiting) return;
    const index = buffer.indexOf(`${SESSION_END}\n`);
    if (index >= 0) { const lines = buffer.slice(0, index).split('\n').filter(Boolean); buffer = buffer.slice(index + SESSION_END.length + 1); const done = waiting; waiting = null; done.resolve(lines); }
    else if (failed) { const done = waiting; waiting = null; done.reject(failed); }
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { buffer += chunk; settle(); });
  const exited = new Promise((resolve) => child.once('close', (code) => { failed = new Error('Sessão de snapshot encerrada.'); settle(); resolve(code); }));
  child.once('error', () => { failed = new Error('Executável indisponível.'); settle(); });
  child.stdin.on('error', () => {});
  const step = (sql) => new Promise((resolve, reject) => {
    if (failed) return reject(failed);
    waiting = { resolve, reject };
    child.stdin.write(`${sql}\n\\echo ${SESSION_END}\n`);
  });
  return {
    async open() {
      const [snapshot, counts] = await step(`begin isolation level repeatable read read only;\nset local row_security = off;\nselect pg_export_snapshot();\n${COUNTS_SQL}`);
      if (!/^[0-9A-F]{8}-[0-9A-F]{8}(-[0-9]+)?$/i.test(snapshot || '')) throw new Error('Snapshot inválido.');
      return { snapshot, counts: parseCounts(counts) };
    },
    async close() { child.stdin.end('commit;\n'); if (await exited !== 0) throw new Error('Sessão de snapshot falhou.'); },
    abort() { child.kill('SIGKILL'); }
  };
}

export async function exportRecovery({ env = process.env, root = process.cwd(), syntheticLocal = false } = {}) {
  if (env.ARANDU_RECOVERY_CONFIRM !== 'ARANDU-ENCRYPTED-EXPORT') throw new Error('Confirmação de export ausente.');
  const connection = sourceConnection(env.ARANDU_RECOVERY_DATABASE_URL, { projectRef: env.ARANDU_RECOVERY_PROJECT_REF, local: syntheticLocal });
  if (syntheticLocal && connection.mode !== 'local') throw new Error('Ensaio sintético exige loopback.');
  if (!env.ARANDU_RECOVERY_PROJECT_REF || !/^age1[0-9a-z]{58}$/.test(env.ARANDU_RECOVERY_RECIPIENT || '')) throw new Error('Projeto e destinatário age X25519 obrigatórios.');
  // Resolve symlinks before checking boundaries; require an existing private mount.
  if (!path.isAbsolute(env.ARANDU_RECOVERY_DIRECTORY || '')) throw new Error('Diretório privado absoluto obrigatório.');
  const destination = fs.realpathSync(env.ARANDU_RECOVERY_DIRECTORY);
  const repository = fs.realpathSync(root);
  const relative = path.relative(repository, destination);
  if (!relative || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) throw new Error('Destino deve ficar fora do repositório.');
  const stat = fs.statSync(destination);
  if (!stat.isDirectory() || (stat.mode & 0o077) !== 0) throw new Error('Destino deve ter permissões 0700.');
  const queryEnv = { ...env, ...connection.env };
  queryEnv.PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=600000';
  // No URI/password in argv, no libpq defaults inherited from the caller.
  for (const key of ['PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE', 'PGHOSTADDR', 'PGSSLNEGOTIATION', 'PGREQUIRESSL']) delete queryEnv[key];
  const run = (binary, args) => {
    const result = spawnSync(binary, args, { env: binary === 'age' ? { PATH: env.PATH } : queryEnv, input: '', encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error(`Falha em ${binary}; detalhes sensíveis omitidos.`);
    return result.stdout;
  };
  for (const binary of ['psql', 'pg_dump', 'pg_dumpall', 'pg_restore']) {
    if (majorVersion(run(binary, ['--version'])) !== 17) throw new Error('Clientes PostgreSQL 17 obrigatórios.');
  }
  run('age', ['--version']);
  // Validate the actual recipient checksum before touching the source database.
  run('age', ['--encrypt', '--recipient', env.ARANDU_RECOVERY_RECIPIENT]);
  const state = JSON.parse(run('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c',
    "select json_build_object('server_major',current_setting('server_version_num')::int/10000,'storage_objects',(select count(*) from storage.objects),'auth_users',(select count(*) from auth.users),'mfa_factors',(select count(*) from auth.mfa_factors))::text"]));
  if (state.server_major !== 17 || ![state.storage_objects, state.auth_users, state.mfa_factors].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Versão ou inventário inválido.');
  if (state.storage_objects !== 0) throw new Error('Storage possui arquivos; preparar export dos binários antes desta operação.');
  const directory = path.join(destination, `arandu-${connection.projectRef}-${randomUUID()}`);
  fs.mkdirSync(directory, { mode: 0o700 });
  const manifest = { format_version: 1, classification: syntheticLocal ? 'synthetic_encrypted_export' : 'encrypted_logical_export', project_ref: connection.projectRef,
    started_at: new Date().toISOString(), result: 'failed', restore: 'NOT RUN', conversion: 'BLOCKED',
    scope: 'database including public/Auth/Storage metadata/migration history; roles without passwords; Storage binaries absent at preflight',
    source_counts: state, executor_sha: env.GITHUB_SHA || null, reconciliation: 'NOT RUN', subprocesses: [], files: [] };
  const manifestPath = path.join(directory, 'manifest.json');
  const writeManifest = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  writeManifest();
  const encrypted = async (binary, args, filename) => {
    const file = path.join(directory, filename);
    const producer = spawn(binary, args, { env: queryEnv, stdio: ['ignore', 'pipe', 'ignore'] });
    const encoder = spawn('age', ['--encrypt', '--recipient', env.ARANDU_RECOVERY_RECIPIENT], { env: { PATH: env.PATH }, stdio: ['pipe', 'pipe', 'ignore'] });
    const timer = setTimeout(() => { producer.kill('SIGKILL'); encoder.kill('SIGKILL'); }, 10 * 60 * 1000);
    const completed = child => new Promise((resolve, reject) => {
      child.once('error', () => reject(new Error('Executável indisponível.')));
      child.once('close', code => code === 0 ? resolve() : reject(new Error('Export ou criptografia falhou.')));
    });
    const tasks = [completed(producer), completed(encoder), pipeline(producer.stdout, encoder.stdin),
      pipeline(encoder.stdout, fs.createWriteStream(file, { flags: 'wx', mode: 0o600 }))];
    try {
      await Promise.all(tasks);
      const hash = createHash('sha256');
      for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
      const bytes = fs.statSync(file).size;
      if (bytes < 128) throw new Error('Artefato criptografado inválido.');
      manifest.files.push({ name: filename, bytes, sha256: hash.digest('hex') });
      manifest.subprocesses.push({ producer: binary, producer_exit: 0, age_exit: 0 });
    } catch {
      producer.kill('SIGKILL'); encoder.kill('SIGKILL');
      await Promise.allSettled(tasks);
      fs.rmSync(file, { force: true });
      throw new Error('Export falhou; artefato incompleto removido e detalhes omitidos.');
    } finally { clearTimeout(timer); }
  };
  let session = null;
  try {
    // pg_dump importa o snapshot exportado pela sessão: contagens de
    // reconciliação e dump descrevem o mesmo estado. Roles são outro snapshot
    // do cluster, reconciliado no restore.
    session = snapshotSession(queryEnv);
    const { snapshot, counts } = await session.open();
    manifest.snapshot = 'exported_snapshot_shared_with_pg_dump';
    manifest.snapshot_counts = counts;
    manifest.snapshot_counts_sha256 = countsDigest(counts);
    await encrypted('pg_dump', ['--format=custom', '--lock-wait-timeout=10000', `--snapshot=${snapshot}`], 'database.dump.age');
    await session.close(); session = null;
    await encrypted('pg_dumpall', ['--roles-only', '--no-role-passwords'], 'roles.sql.age');
    manifest.result = 'exported_unverified';
    manifest.completed_at = new Date().toISOString();
    writeManifest();
    return manifest;
  } catch (error) { session?.abort(); writeManifest(); throw error; }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  try { const result = await exportRecovery(); console.log(`Export criptografado concluído para ${result.project_ref}; restore NOT RUN; conversão BLOCKED.`); }
  catch { console.error('BLOQUEADO: export não concluído. Verifique identidade, confirmação, destino privado, destinatário, clientes PG17 e conectividade. Nenhum detalhe sensível foi registrado.'); process.exitCode = 1; }
}

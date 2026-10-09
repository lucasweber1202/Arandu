#!/usr/bin/env node
// Read-only preservation. This never restores, migrates or approves conversion.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { sourceConnection, majorVersion } from '../lib/pilot-backup-preflight.mjs';

export async function exportRecovery({ env = process.env, root = process.cwd() } = {}) {
  if (env.ARANDU_RECOVERY_CONFIRM !== 'ARANDU-ENCRYPTED-EXPORT') throw new Error('Confirmação de export ausente.');
  const connection = sourceConnection(env.ARANDU_RECOVERY_DATABASE_URL, { projectRef: env.ARANDU_RECOVERY_PROJECT_REF });
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
    const result = spawnSync(binary, args, { env: queryEnv, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) throw new Error(`Falha em ${binary}; detalhes sensíveis omitidos.`);
    return result.stdout;
  };
  for (const binary of ['psql', 'pg_dump', 'pg_dumpall', 'pg_restore']) {
    if (majorVersion(run(binary, ['--version'])) !== 17) throw new Error('Clientes PostgreSQL 17 obrigatórios.');
  }
  run('age', ['--version']);
  const state = JSON.parse(run('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c',
    "select json_build_object('server_major',current_setting('server_version_num')::int/10000,'storage_objects',(select count(*) from storage.objects),'auth_users',(select count(*) from auth.users),'mfa_factors',(select count(*) from auth.mfa_factors))::text"]));
  if (state.server_major !== 17 || ![state.storage_objects, state.auth_users, state.mfa_factors].every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Versão ou inventário inválido.');
  if (state.storage_objects !== 0) throw new Error('Storage possui arquivos; preparar export dos binários antes desta operação.');
  const directory = path.join(destination, `arandu-${connection.projectRef}-${randomUUID()}`);
  fs.mkdirSync(directory, { mode: 0o700 });
  const manifest = { format_version: 1, classification: 'encrypted_logical_export', project_ref: connection.projectRef,
    started_at: new Date().toISOString(), result: 'failed', restore: 'NOT RUN', conversion: 'BLOCKED',
    scope: 'database including public/Auth/Storage metadata/migration history; roles without passwords; Storage binaries absent at preflight',
    source_counts: state, files: [] };
  const manifestPath = path.join(directory, 'manifest.json');
  const writeManifest = () => fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  writeManifest();
  const encrypted = async (binary, args, filename) => {
    const file = path.join(directory, filename);
    const producer = spawn(binary, args, { env: queryEnv, stdio: ['ignore', 'pipe', 'ignore'] });
    const encoder = spawn('age', ['--encrypt', '--recipient', env.ARANDU_RECOVERY_RECIPIENT], { stdio: ['pipe', 'pipe', 'ignore'] });
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
    } catch {
      producer.kill('SIGKILL'); encoder.kill('SIGKILL');
      await Promise.allSettled(tasks);
      fs.rmSync(file, { force: true });
      throw new Error('Export falhou; artefato incompleto removido e detalhes omitidos.');
    } finally { clearTimeout(timer); }
  };
  try {
    // pg_dump owns one consistent snapshot for all database schemas/data/ACLs.
    // Role definitions are a separate cluster snapshot, reconciled during restore.
    await encrypted('pg_dump', ['--format=custom', '--lock-wait-timeout=10000'], 'database.dump.age');
    await encrypted('pg_dumpall', ['--roles-only', '--no-role-passwords'], 'roles.sql.age');
    manifest.result = 'exported_unverified';
    manifest.completed_at = new Date().toISOString();
    writeManifest();
    return manifest;
  } catch (error) { writeManifest(); throw error; }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  try { const result = await exportRecovery(); console.log(`Export criptografado concluído para ${result.project_ref}; restore NOT RUN; conversão BLOCKED.`); }
  catch { console.error('BLOQUEADO: export não concluído. Verifique identidade, confirmação, destino privado, destinatário, clientes PG17 e conectividade. Nenhum detalhe sensível foi registrado.'); process.exitCode = 1; }
}

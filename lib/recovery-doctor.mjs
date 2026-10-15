// Preflight de recuperação: classifica a PRIMEIRA falha por código, sem nunca
// imprimir valores (conexão, senha, destinatário, URLs, caminhos privados).
// Só lê configuração e ferramentas locais: não conecta no banco nem na rede.
//
// Duas estratégias de destino do ciphertext (docs/SUPABASE_ENCRYPTED_PRESERVATION.md):
//   private-store  diretório privado durável numa máquina do operador ou runner
//                  dedicado (sem AWS); exige marcador criado por `recovery store-init`.
//   s3             URLs SigV4 aprovadas (lib/recovery-transfer.mjs), exportando
//                  num diretório temporário do runner e verificando o readback.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { RECOVERY_REFS, sourceConnection, majorVersion } from './pilot-backup-preflight.mjs';
import { approvedDestination } from './recovery-transfer.mjs';
import { hostedStorageEndpointValid } from './storage-recovery.mjs';

export const STORE_MARKER = '.arandu-recovery-store.json';
export const STRATEGIES = Object.freeze(['private-store', 's3']);
export const RECIPIENT = /^age1[0-9a-z]{58}$/;

export class RecoveryError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const recoveryFail = (code, message) => { throw new RecoveryError(code, message); };

/**
 * Estados da recuperação, do mais fraco ao mais forte. Só o restore isolado do
 * MESMO export, com reconciliação MATCH, chega a RESTORE_VERIFIED; nenhum
 * estado aqui libera conversão.
 */
export const RECOVERY_STATES = Object.freeze({
  blocked: 'RECOVERY_BLOCKED',
  codeReady: 'RECOVERY_CODE_READY',
  configurationReady: 'RECOVERY_CONFIGURATION_READY',
  exportVerified: 'RECOVERY_EXPORT_VERIFIED',
  restoreVerified: 'RECOVERY_RESTORE_VERIFIED'
});

/**
 * Persiste no disco o conteúdo e a entrada de diretório. Sem isso um export
 * "verificado" pela releitura do cache de página ainda pode sumir numa queda de
 * energia do executor privado. Falha vira RECOVERY_PERSISTENCE_FAILED.
 */
export function syncPath(target) {
  let fd;
  try { fd = fs.openSync(target, 'r'); fs.fsyncSync(fd); }
  catch { recoveryFail('RECOVERY_PERSISTENCE_FAILED', 'Gravação durável (fsync) falhou; detalhes omitidos.'); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};
const realOrNull = (value) => { try { return fs.realpathSync(value); } catch { return null; } };

/** Diretórios que somem com o processo/máquina: nunca valem como backup durável. */
export function ephemeralRoots(env = process.env) {
  return [os.tmpdir(), '/tmp', '/var/tmp', '/dev/shm', '/run', env.RUNNER_TEMP, env.RUNNER_WORKSPACE, env.GITHUB_WORKSPACE]
    .filter((value) => value && path.isAbsolute(value)).map((value) => realOrNull(value) || path.resolve(value));
}

/**
 * Valida o armazenamento privado durável. Lança RecoveryError com código; nunca
 * inclui o caminho na mensagem. Retorna o marcador (id, retenção) do store.
 */
export function assertPrivateStore(directory, { env = process.env, root = process.cwd() } = {}) {
  if (!directory) recoveryFail('RECOVERY_DESTINATION_MISSING', 'Diretório privado de recuperação não configurado.');
  if (!path.isAbsolute(directory)) recoveryFail('RECOVERY_DESTINATION_INVALID', 'Diretório privado precisa ser absoluto.');
  if (String(env.RUNNER_ENVIRONMENT || '').toLowerCase() === 'github-hosted') {
    recoveryFail('RECOVERY_STORAGE_NOT_DURABLE', 'Runner hospedado do GitHub é efêmero: use máquina ou runner dedicado com disco persistente, ou a estratégia s3.');
  }
  const stat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!stat) recoveryFail('RECOVERY_DESTINATION_MISSING', 'Diretório privado inexistente; prepare-o com recovery store-init.');
  if (stat.isSymbolicLink()) recoveryFail('RECOVERY_DESTINATION_INVALID', 'Diretório privado não pode ser symlink.');
  if (!stat.isDirectory()) recoveryFail('RECOVERY_DESTINATION_INVALID', 'Destino privado não é diretório.');
  const real = fs.realpathSync(directory);
  if (inside(fs.realpathSync(root), real)) recoveryFail('RECOVERY_DESTINATION_INVALID', 'Destino deve ficar fora do repositório.');
  if (ephemeralRoots(env).some((ephemeral) => inside(ephemeral, real))) recoveryFail('RECOVERY_STORAGE_NOT_DURABLE', 'Destino em área temporária não é backup durável.');
  if ((stat.mode & 0o077) !== 0) recoveryFail('RECOVERY_DESTINATION_PERMISSIONS', 'Diretório privado deve ter permissão 0700.');
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) recoveryFail('RECOVERY_DESTINATION_PERMISSIONS', 'Diretório privado deve pertencer ao operador que executa o export.');
  const markerPath = path.join(real, STORE_MARKER);
  const markerStat = fs.lstatSync(markerPath, { throwIfNoEntry: false });
  if (!markerStat) recoveryFail('RECOVERY_STORE_NOT_INITIALIZED', 'Store sem marcador; execute recovery store-init no diretório aprovado.');
  if (markerStat.isSymbolicLink() || !markerStat.isFile() || (markerStat.mode & 0o077) !== 0) recoveryFail('RECOVERY_DESTINATION_PERMISSIONS', 'Marcador do store deve ser arquivo 0600.');
  let marker;
  try { marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')); } catch { recoveryFail('RECOVERY_STORE_NOT_INITIALIZED', 'Marcador do store ilegível.'); }
  if (marker?.purpose !== 'arandu-database-recovery' || !/^[0-9a-f-]{36}$/.test(marker.store_id || '') ||
      !Number.isSafeInteger(marker.retention_days) || marker.retention_days < 30 || marker.durability !== 'operator_attested_persistent') {
    recoveryFail('RECOVERY_STORE_NOT_INITIALIZED', 'Marcador do store inválido.');
  }
  return { real, marker };
}

/** Identidade age privada: fora do repositório, fora do store do ciphertext, arquivo 0600. */
export function assertIdentityFile(file, { root = process.cwd(), store = null } = {}) {
  if (!file || !path.isAbsolute(file)) recoveryFail('RECOVERY_IDENTITY_MISSING', 'Caminho absoluto da identidade age não configurado.');
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) recoveryFail('RECOVERY_IDENTITY_MISSING', 'Identidade age inexistente.');
  if (stat.isSymbolicLink() || !stat.isFile()) recoveryFail('RECOVERY_IDENTITY_INVALID', 'Identidade age deve ser arquivo regular.');
  const real = fs.realpathSync(file);
  if (inside(fs.realpathSync(root), real)) recoveryFail('RECOVERY_IDENTITY_INVALID', 'Identidade age não pode ficar no repositório.');
  if (store && inside(fs.realpathSync(store), real)) recoveryFail('RECOVERY_IDENTITY_INVALID', 'Identidade age deve ficar separada do ciphertext.');
  if ((stat.mode & 0o077) !== 0) recoveryFail('RECOVERY_IDENTITY_INVALID', 'Identidade age deve ter permissão 0600.');
  return real;
}

const STATUS = { ok: 'VALID', missing: 'NOT CONFIGURED', invalid: 'INVALID', unavailable: 'UNAVAILABLE', skipped: 'NOT CHECKED' };

/**
 * Diagnóstico sanitizado. `checks` nunca contém valores; `code` é a primeira falha.
 * `requireConfirmation` só no caminho de export real.
 */
export function diagnoseRecovery({ env = process.env, strategy = 'private-store', root = process.cwd(), run = spawnSync, requireConfirmation = false } = {}) {
  const checks = [];
  const add = (id, label, status, code = null) => checks.push({ id, label, status, code });
  if (!STRATEGIES.includes(strategy)) add('strategy', 'Storage strategy', STATUS.invalid, 'RECOVERY_STRATEGY_INVALID');

  const ref = String(env.ARANDU_RECOVERY_PROJECT_REF || '');
  if (!ref) add('source', 'Source identity', STATUS.missing, 'RECOVERY_SOURCE_IDENTITY_INVALID');
  else if (!RECOVERY_REFS.includes(ref)) add('source', 'Source identity', STATUS.invalid, 'RECOVERY_SOURCE_IDENTITY_INVALID');
  else add('source', 'Source identity', STATUS.ok);

  if (!env.ARANDU_RECOVERY_DATABASE_URL) add('database', 'Database credentials', STATUS.missing, 'RECOVERY_DATABASE_URL_MISSING');
  else if (!RECOVERY_REFS.includes(ref)) add('database', 'Database credentials', STATUS.skipped);
  else {
    try { sourceConnection(env.ARANDU_RECOVERY_DATABASE_URL, { projectRef: ref }); add('database', 'Database credentials', STATUS.ok); }
    catch { add('database', 'Database credentials', STATUS.invalid, 'RECOVERY_SOURCE_IDENTITY_INVALID'); }
  }

  const tool = (binary, args) => { const result = run(binary, args, { encoding: 'utf8', timeout: 15000, env: { PATH: env.PATH }, input: '' }); return result.error || result.status !== 0 ? null : String(result.stdout || ''); };
  const ageVersion = tool('age', ['--version']);
  const recipient = String(env.ARANDU_RECOVERY_RECIPIENT || '');
  if (!recipient) add('recipient', 'Encryption recipient', STATUS.missing, 'RECOVERY_RECIPIENT_MISSING');
  else if (!RECIPIENT.test(recipient)) add('recipient', 'Encryption recipient', STATUS.invalid, 'RECOVERY_RECIPIENT_INVALID');
  else if (!ageVersion) add('recipient', 'Encryption recipient', STATUS.skipped);
  // O age valida o checksum bech32 do destinatário sem criptografar nada útil.
  else if (tool('age', ['--encrypt', '--recipient', recipient]) === null) add('recipient', 'Encryption recipient', STATUS.invalid, 'RECOVERY_RECIPIENT_INVALID');
  else add('recipient', 'Encryption recipient', STATUS.ok);

  let store = null;
  if (strategy === 's3') {
    if (!env.ARANDU_RECOVERY_DESTINATION) add('destination', 'Private destination (s3)', STATUS.missing, 'RECOVERY_DESTINATION_MISSING');
    else {
      try { approvedDestination(env.ARANDU_RECOVERY_DESTINATION, ref, env.GITHUB_SHA); add('destination', 'Private destination (s3)', STATUS.ok); }
      catch { add('destination', 'Private destination (s3)', STATUS.invalid, 'RECOVERY_DESTINATION_INVALID'); }
    }
  } else if (strategy === 'private-store') {
    try { store = assertPrivateStore(env.ARANDU_RECOVERY_DIRECTORY, { env, root }); add('destination', 'Private destination (private-store)', STATUS.ok); }
    catch (error) { add('destination', 'Private destination (private-store)', error.code === 'RECOVERY_DESTINATION_MISSING' ? STATUS.missing : STATUS.invalid, error.code || 'RECOVERY_DESTINATION_INVALID'); }
  }

  // Binários do Storage (scripts/storage-recovery.mjs): só configuração, sem rede.
  // Sem a declaração, o export recusa a origem que tiver arquivos.
  if (env.ARANDU_RECOVERY_STORAGE_BINARIES === 'separate-export') {
    const endpoint = RECOVERY_REFS.includes(ref) && hostedStorageEndpointValid(env.ARANDU_STORAGE_SOURCE_URL, ref);
    if (!env.ARANDU_STORAGE_SOURCE_URL || !env.ARANDU_STORAGE_SOURCE_SERVICE_KEY) add('storage', 'Storage binaries (separate export)', STATUS.missing, 'RECOVERY_STORAGE_BINARIES_MISSING');
    else if (!endpoint) add('storage', 'Storage binaries (separate export)', STATUS.invalid, 'RECOVERY_STORAGE_BINARIES_INVALID');
    else add('storage', 'Storage binaries (separate export)', STATUS.ok);
  } else if (env.ARANDU_RECOVERY_STORAGE_BINARIES) add('storage', 'Storage binaries (separate export)', STATUS.invalid, 'RECOVERY_STORAGE_BINARIES_INVALID');
  else add('storage', 'Storage binaries (separate export)', STATUS.skipped);

  const pg = ['psql', 'pg_dump', 'pg_dumpall', 'pg_restore'].map((binary) => majorVersion(tool(binary, ['--version']) || ''));
  add('postgres', 'PostgreSQL tooling', pg.every((major) => major === 17) ? STATUS.ok : pg.some((major) => major === null) ? STATUS.unavailable : STATUS.invalid,
    pg.every((major) => major === 17) ? null : 'RECOVERY_PG_VERSION_INVALID');
  add('age', 'Encryption tooling', ageVersion ? STATUS.ok : STATUS.unavailable, ageVersion ? null : 'RECOVERY_AGE_UNAVAILABLE');
  if (requireConfirmation) {
    const ok = env.ARANDU_RECOVERY_CONFIRM === 'ARANDU-ENCRYPTED-EXPORT';
    add('confirmation', 'Explicit export confirmation', ok ? STATUS.ok : STATUS.missing, ok ? null : 'RECOVERY_CONFIRMATION_MISSING');
  }
  const failed = checks.filter((check) => check.code);
  return {
    classification: 'recovery_preflight', strategy, generated_at: new Date().toISOString(),
    result: failed.length ? 'BLOCKED' : 'READY', code: failed[0]?.code || null, codes: failed.map((check) => check.code),
    // Preflight READY prova configuração, nunca export: o estado máximo aqui é CONFIGURATION_READY.
    state: failed.length ? RECOVERY_STATES.blocked : RECOVERY_STATES.configurationReady,
    checks, store: store ? { id: store.marker.store_id, retention_days: store.marker.retention_days } : null,
    database_accessed: 'NO', backup_generated: 'NO', restore_verified: 'NO'
  };
}

export function formatDiagnosis(report) {
  const width = Math.max(...report.checks.map((check) => check.label.length));
  return [
    `Recovery preflight (${report.strategy})`, '',
    ...report.checks.map((check) => `${`${check.label}:`.padEnd(width + 2)}${check.status}${check.code ? `  [${check.code}]` : ''}`), '',
    `Result: ${report.result}${report.code ? ` (first failure: ${report.code})` : ''}`,
    `Recovery state: ${report.state}`,
    `Database accessed: ${report.database_accessed}`, `Backup generated: ${report.backup_generated}`, `Restore verified: ${report.restore_verified}`
  ].join('\n');
}

#!/usr/bin/env node
// Operação de recuperação sem AWS obrigatória (docs/SUPABASE_ENCRYPTED_PRESERVATION.md).
//
//   npm run recovery:doctor [-- --strategy=s3]       preflight sanitizado, sem acessar o banco
//   npm run recovery:key:prepare [-- --generate]     identidade age local + prova de ida e volta
//   npm run recovery:store:init -- --attest-persistent [--retention-days=365]
//   npm run recovery:export:private                   doctor + export criptografado no store + verify
//   npm run recovery:verify                           integridade do export no store (não é restore)
//   npm run recovery:restore:verify                   restore isolado + reconciliação (inalterado)
//
// Nada aqui imprime conexão, senha, identidade privada, URL assinada ou caminho
// privado. A identidade privada nunca vai para o CI nem para o store do ciphertext.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { exportRecovery } from './consolidation-export.mjs';
import { digestFile } from '../lib/recovery-transfer.mjs';
import { RECOVERY_REFS } from '../lib/pilot-backup-preflight.mjs';
import { countsDigest, parseCounts } from '../lib/recovery-reconciliation.mjs';
import { recoveryCompleteness } from '../lib/storage-recovery.mjs';
import { storageEvidence } from './storage-recovery.mjs';
import {
  STORE_MARKER, RECIPIENT, RecoveryError, recoveryFail, assertPrivateStore, assertIdentityFile,
  diagnoseRecovery, formatDiagnosis, ephemeralRoots, RECOVERY_STATES, syncPath
} from '../lib/recovery-doctor.mjs';

const ARTIFACTS = ['database.dump.age', 'roles.sql.age'];
const inside = (parent, child) => { const r = path.relative(parent, child); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
const option = (args, name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const inCi = (env) => ['true', '1'].includes(String(env.CI || '').toLowerCase()) || env.GITHUB_ACTIONS === 'true';

/** Store privado durável: o operador atesta a persistência; o código recusa o que é comprovadamente efêmero. */
export function initStore({ env = process.env, root = process.cwd(), args = [] } = {}) {
  const directory = env.ARANDU_RECOVERY_DIRECTORY;
  if (!args.includes('--attest-persistent')) recoveryFail('RECOVERY_STORAGE_NOT_DURABLE', 'Declare --attest-persistent: o diretório sobrevive a reinício e é de acesso restrito.');
  const retention = Number(option(args, 'retention-days') ?? 365);
  if (!Number.isSafeInteger(retention) || retention < 30 || retention > 3650) recoveryFail('RECOVERY_DESTINATION_INVALID', '--retention-days entre 30 e 3650.');
  if (!directory || !path.isAbsolute(directory)) recoveryFail('RECOVERY_DESTINATION_MISSING', 'ARANDU_RECOVERY_DIRECTORY absoluto obrigatório.');
  if (String(env.RUNNER_ENVIRONMENT || '').toLowerCase() === 'github-hosted') recoveryFail('RECOVERY_STORAGE_NOT_DURABLE', 'Runner hospedado do GitHub é efêmero.');
  const parent = fs.lstatSync(path.dirname(directory), { throwIfNoEntry: false });
  if (!parent?.isDirectory()) recoveryFail('RECOVERY_DESTINATION_INVALID', 'Diretório pai precisa existir e não ser symlink.');
  const realParent = fs.realpathSync(path.dirname(directory));
  const target = path.join(realParent, path.basename(directory));
  if (inside(fs.realpathSync(root), target)) recoveryFail('RECOVERY_DESTINATION_INVALID', 'Destino deve ficar fora do repositório.');
  if (ephemeralRoots(env).some((root) => inside(root, target))) recoveryFail('RECOVERY_STORAGE_NOT_DURABLE', 'Destino em área temporária não é backup durável.');
  const existing = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!existing) fs.mkdirSync(target, { mode: 0o700 });
  else if (existing.isSymbolicLink() || !existing.isDirectory()) recoveryFail('RECOVERY_DESTINATION_INVALID', 'Destino precisa ser diretório real.');
  fs.chmodSync(target, 0o700);
  const marker = { format_version: 1, purpose: 'arandu-database-recovery', store_id: randomUUID(), created_at: new Date().toISOString(),
    retention_days: retention, durability: 'operator_attested_persistent', content: 'age ciphertext + manifest only; identity kept elsewhere' };
  try { fs.writeFileSync(path.join(target, STORE_MARKER), JSON.stringify(marker, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); }
  catch { recoveryFail('RECOVERY_DESTINATION_INVALID', 'Store já inicializado ou não gravável; nada foi sobrescrito.'); }
  syncPath(path.join(target, STORE_MARKER));
  syncPath(target);
  syncPath(realParent);
  assertPrivateStore(target, { env, root });
  return { store_id: marker.store_id, retention_days: retention };
}

/** Identidade age em máquina confiável do operador. Nunca no CI, nunca impressa. */
export function prepareKey({ env = process.env, root = process.cwd(), args = [], run = spawnSync } = {}) {
  if (inCi(env)) recoveryFail('RECOVERY_IDENTITY_INVALID', 'Identidade privada não é preparada em CI: use a máquina confiável do operador.');
  const file = env.ARANDU_RECOVERY_IDENTITY_FILE;
  if (!file || !path.isAbsolute(file)) recoveryFail('RECOVERY_IDENTITY_MISSING', 'ARANDU_RECOVERY_IDENTITY_FILE absoluto obrigatório.');
  const store = env.ARANDU_RECOVERY_DIRECTORY && fs.existsSync(env.ARANDU_RECOVERY_DIRECTORY) ? env.ARANDU_RECOVERY_DIRECTORY : null;
  const tool = (binary, toolArgs, input) => {
    const result = run(binary, toolArgs, { env: { PATH: env.PATH }, input, timeout: 30000, maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0) recoveryFail('RECOVERY_AGE_UNAVAILABLE', `Falha em ${binary}; detalhes omitidos.`);
    return result.stdout;
  };
  let generated = false;
  if (!fs.lstatSync(file, { throwIfNoEntry: false })) {
    if (!args.includes('--generate')) recoveryFail('RECOVERY_IDENTITY_MISSING', 'Identidade inexistente; repita com --generate para criá-la neste caminho.');
    const parent = fs.lstatSync(path.dirname(file), { throwIfNoEntry: false });
    if (!parent?.isDirectory() || (parent.mode & 0o077) !== 0) recoveryFail('RECOVERY_IDENTITY_INVALID', 'Diretório da identidade precisa existir com permissão 0700.');
    const target = path.join(fs.realpathSync(path.dirname(file)), path.basename(file));
    if (inside(fs.realpathSync(root), target)) recoveryFail('RECOVERY_IDENTITY_INVALID', 'Identidade age não pode ficar no repositório.');
    if (store && inside(fs.realpathSync(store), target)) recoveryFail('RECOVERY_IDENTITY_INVALID', 'Identidade age deve ficar separada do ciphertext.');
    if (ephemeralRoots(env).some((ephemeral) => inside(ephemeral, target))) recoveryFail('RECOVERY_IDENTITY_INVALID', 'Identidade em área temporária seria perdida.');
    tool('age-keygen', ['-o', target]);
    fs.chmodSync(target, 0o600);
    generated = true;
  }
  const identity = assertIdentityFile(file, { root, store });
  const recipient = String(tool('age-keygen', ['-y', identity])).trim();
  if (!RECIPIENT.test(recipient)) recoveryFail('RECOVERY_IDENTITY_INVALID', 'Identidade não é X25519 nativa do age.');
  // Prova de posse: criptografa um fixture aleatório para o destinatário e decripta com a identidade.
  const fixture = randomBytes(4096);
  const cipher = tool('age', ['--encrypt', '--recipient', recipient], fixture);
  const plain = tool('age', ['--decrypt', '--identity', identity], cipher);
  if (!Buffer.from(plain).equals(fixture)) recoveryFail('RECOVERY_IDENTITY_INVALID', 'Ida e volta com a identidade falhou.');
  return { recipient, fingerprint: createHash('sha256').update(recipient).digest('hex').slice(0, 16), generated, roundtrip: 'VERIFIED' };
}

/**
 * Registros de restore que valem para ESTE export: arquivo regular 0600 (nunca
 * symlink), gravado por consolidation-restore-verify para a mesma origem e o
 * mesmo início de export, alvo loopback descartável, roles não aplicadas,
 * reconciliação MATCH sem diferenças e contagens idênticas às do snapshot.
 * Um registro copiado de outro export, ou com MATCH sem prova, não eleva o nível.
 */
export function restoreRecords(directory, manifest) {
  const files = manifest.files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 }));
  return fs.readdirSync(directory).filter((name) => /^restore-verification-[0-9TZ-]+\.json$/.test(name)).flatMap((name) => {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o077) !== 0) return [];
    if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) return [];
    let r;
    try { r = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; }
    const valid = r?.format_version === 1 && r.restore === 'RESTORED_ISOLATED' && r.reconciliation === 'MATCH' &&
      Array.isArray(r.differences) && r.differences.length === 0 && Number.isSafeInteger(r.tables) && r.tables > 0 &&
      r.target === 'loopback_disposable_postgresql17' && r.roles_file === 'NOT APPLIED' &&
      r.export_project_ref === manifest.project_ref && r.export_started_at === manifest.started_at &&
      r.source_counts_sha256 === manifest.snapshot_counts_sha256 && r.target_counts_sha256 === manifest.snapshot_counts_sha256 &&
      JSON.stringify(r.files) === JSON.stringify(files) && Date.parse(r.verified_at) >= Date.parse(manifest.completed_at || manifest.started_at);
    return valid ? [{ name, verified_at: r.verified_at }] : [];
  });
}

/** Integridade do export no store. Não é restore: só prova que o ciphertext persistido confere com o manifest. */
export async function verifyExport({ env = process.env, root = process.cwd() } = {}) {
  const backup = env.ARANDU_RECOVERY_BACKUP;
  if (!backup || !path.isAbsolute(backup)) recoveryFail('RECOVERY_DESTINATION_MISSING', 'ARANDU_RECOVERY_BACKUP absoluto obrigatório.');
  const stat = fs.lstatSync(backup, { throwIfNoEntry: false });
  if (!stat) recoveryFail('RECOVERY_READBACK_FAILED', 'Export inexistente no store.');
  if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0) recoveryFail('RECOVERY_DESTINATION_PERMISSIONS', 'Diretório do export deve ser real e 0700.');
  const real = fs.realpathSync(backup);
  const { marker } = assertPrivateStore(path.dirname(real), { env, root });
  const read = (name) => {
    const file = path.join(real, name);
    const s = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!s) recoveryFail('RECOVERY_READBACK_FAILED', 'Artefato ausente no store.');
    if (s.isSymbolicLink() || !s.isFile() || (s.mode & 0o077) !== 0) recoveryFail('RECOVERY_DESTINATION_PERMISSIONS', 'Artefato deve ser arquivo regular 0600.');
    return file;
  };
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(read('manifest.json'), 'utf8')); } catch (error) { if (error instanceof RecoveryError) throw error; recoveryFail('RECOVERY_MANIFEST_INVALID', 'Manifest ilegível.'); }
  if (manifest.result !== 'exported_unverified' || !Array.isArray(manifest.files) || manifest.files.length !== 2 ||
      manifest.files.some((f, i) => f.name !== ARTIFACTS[i])) recoveryFail('RECOVERY_MANIFEST_INVALID', 'Manifest de export incompleto.');
  const synthetic = manifest.classification === 'synthetic_encrypted_export';
  if (!(synthetic ? manifest.project_ref === null : RECOVERY_REFS.includes(manifest.project_ref))) recoveryFail('RECOVERY_SOURCE_IDENTITY_INVALID', 'Origem do manifest não aprovada.');
  if (manifest.storage?.store_id !== marker.store_id) recoveryFail('RECOVERY_MANIFEST_INVALID', 'Export não pertence a este store.');
  if (manifest.snapshot !== 'exported_snapshot_shared_with_pg_dump' || manifest.snapshot_counts_sha256 !== countsDigest(parseCounts(JSON.stringify(manifest.snapshot_counts || {})))) {
    recoveryFail('RECOVERY_MANIFEST_INVALID', 'Contagens do snapshot ausentes ou adulteradas.');
  }
  for (const entry of manifest.files) {
    const actual = await digestFile(read(entry.name));
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) recoveryFail('RECOVERY_READBACK_FAILED', 'Hash ou tamanho divergente do manifest.');
  }
  const restored = restoreRecords(real, manifest).length > 0;
  // Banco restaurado não basta: com arquivos na origem, exige os binários
  // exportados neste export e restaurados/reconciliados (scripts/storage-recovery.mjs).
  const storageObjects = manifest.source_counts?.storage_objects;
  const storage = Number.isSafeInteger(storageObjects) && storageObjects > 0 ? await storageEvidence(real, storageObjects) : [];
  const completeness = recoveryCompleteness({ databaseVerified: restored, storageObjects, storageVerified: storage.length > 0 });
  const complete = completeness === 'COMPLETE';
  return {
    classification: 'recovery_export_verification', export: path.basename(real), project_ref: manifest.project_ref,
    store_id: marker.store_id, retention_days: marker.retention_days, integrity: 'VERIFIED', files: manifest.files,
    storage_objects: storageObjects ?? null, storage_binaries: storageObjects > 0 ? (storage.length ? 'RESTORE_VERIFIED' : 'NOT_VERIFIED') : 'NONE',
    completeness, level: complete ? 5 : 4,
    recovery: complete ? 'RECOVERY_VERIFIED' : restored ? 'RECOVERY_DATABASE_ONLY' : 'RECOVERY_RESTORE_NOT_VERIFIED',
    state: complete ? RECOVERY_STATES.restoreVerified : RECOVERY_STATES.exportVerified, conversion: 'BLOCKED'
  };
}

export async function privateExport({ env = process.env, root = process.cwd(), syntheticLocal = false, log = console.log } = {}) {
  const report = diagnoseRecovery({ env, root, strategy: 'private-store', requireConfirmation: true, run: spawnSync });
  // Ensaio sintético usa loopback; a identidade da origem é checada pelo exportador.
  const blocking = syntheticLocal ? report.checks.filter((c) => c.code && !['source', 'database'].includes(c.id)) : report.checks.filter((c) => c.code);
  log(formatDiagnosis(report));
  if (blocking.length) recoveryFail(blocking[0].code, 'Preflight bloqueado; o banco não foi acessado.');
  const store = assertPrivateStore(env.ARANDU_RECOVERY_DIRECTORY, { env, root });
  const before = new Set(fs.readdirSync(store.real));
  const manifest = await exportRecovery({ env: { ...env, ARANDU_RECOVERY_DIRECTORY: store.real }, root, syntheticLocal, store });
  const created = fs.readdirSync(store.real).filter((name) => !before.has(name));
  if (created.length !== 1) recoveryFail('RECOVERY_PERSISTENCE_FAILED', 'Export não identificável no store.');
  return { manifest, verification: await verifyExport({ env: { ...env, ARANDU_RECOVERY_BACKUP: path.join(store.real, created[0]) }, root }) };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const strategy = option(args, 'strategy') || 'private-store';
  switch (command) {
    case 'doctor': {
      const report = diagnoseRecovery({ strategy, requireConfirmation: args.includes('--export') });
      console.log(formatDiagnosis(report));
      if (args.includes('--json')) console.log(JSON.stringify(report));
      return report.result === 'READY' ? 0 : 1;
    }
    case 'store-init': { const store = initStore({ args }); console.log(`Store privado inicializado (id ${store.store_id}, retenção ${store.retention_days} dias). Guarde a identidade age em outro local.`); return 0; }
    case 'key': {
      const key = prepareKey({ args });
      console.log(`Identidade age ${key.generated ? 'gerada' : 'existente'}; ida e volta ${key.roundtrip}.`);
      console.log(`Destinatário público (pode ir para ARANDU_RECOVERY_RECIPIENT): ${key.recipient}`);
      console.log(`Fingerprint: ${key.fingerprint}`);
      console.log('A identidade privada não foi impressa. Faça uma cópia offline separada do store antes do primeiro export.');
      return 0;
    }
    case 'export': {
      const { manifest, verification } = await privateExport();
      console.log(JSON.stringify({ project_ref: manifest.project_ref, export: verification.export, store_id: verification.store_id,
        files: manifest.files, integrity: verification.integrity, level: verification.level, recovery: verification.recovery, state: verification.state, conversion: 'BLOCKED' }));
      console.log('Próximo passo: npm run recovery:restore:verify num PostgreSQL 17 loopback descartável.');
      return 0;
    }
    case 'verify': { console.log(JSON.stringify(await verifyExport())); return 0; }
    default:
      console.error('uso: node scripts/recovery.mjs doctor [--strategy=private-store|s3] [--export] [--json] | key [--generate] | store-init --attest-persistent [--retention-days=N] | export | verify');
      return 2;
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  try { process.exitCode = await main(); }
  catch (error) {
    const known = /^RECOVERY_[A-Z_]+$/.test(error?.code || '');
    console.error(`BLOQUEADO (${known ? error.code : 'RECOVERY_UNEXPECTED'}): ${known ? error.message : 'falha inesperada; detalhes omitidos.'}`);
    process.exitCode = 1;
  }
}

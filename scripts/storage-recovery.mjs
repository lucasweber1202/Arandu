#!/usr/bin/env node
// Binários do Supabase Storage: export cifrado, restore isolado e reconciliação.
// Complementa o export do banco (scripts/consolidation-export.mjs e o ensaio
// scripts/pilot-restore-drill.sh), que leva só os metadados de storage.objects.
//
//   node scripts/storage-recovery.mjs export    origem → diretório privado (age por objeto + índice cifrado)
//   node scripts/storage-recovery.mjs restore   export → Storage loopback descartável, releitura e reconciliação
//   node scripts/storage-recovery.mjs verify    só reconcilia o destino (prova que metadado sem binário falha)
//
// Bytes saem e entram pela API oficial do Storage (download autenticado com
// service role; upload com upsert). Conteúdo em claro só existe em memória. A
// origem é loopback ou um dos projetos de recuperação aprovados; o destino é
// sempre loopback. Nada impresso contém nome de objeto, conteúdo, chave ou URL.
import fs from 'node:fs';
import path from 'node:path';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { RECOVERY_REFS, sourceConnection } from '../lib/pilot-backup-preflight.mjs';
import { loopbackTarget } from '../lib/recovery-reconciliation.mjs';
import { digestFile } from '../lib/recovery-transfer.mjs';
import {
  INVENTORY_SQL, MAX_OBJECT_BYTES, STORAGE_DIR, STORAGE_INDEX, STORAGE_MANIFEST, STORAGE_FORMAT_VERSION,
  StorageRecoveryError, storageFail, parseInventory, assessInventory, indexEntry, objectFile, parseIndex,
  storageManifest, checkManifest, reconcileStorage, digest, sha256, STORAGE_RECORD, validStorageRecord, validPermissionEvidence, STORAGE_DENIED_STATUSES
} from '../lib/storage-recovery.mjs';

const RECIPIENT = /^age1[0-9a-z]{58}$/;
const LOOPBACK = ['127.0.0.1', 'localhost', '::1'];
const inside = (parent, child) => { const r = path.relative(parent, child); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
const encodeName = (name) => name.split('/').map(encodeURIComponent).join('/');

/** Diretório privado: absoluto, real, 0700, fora do repositório. */
function privateDirectory(value, root, code) {
  if (!value || !path.isAbsolute(value)) storageFail(code, 'Diretório privado absoluto obrigatório.');
  const stat = fs.lstatSync(value, { throwIfNoEntry: false });
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0) storageFail(code, 'Diretório precisa existir, ser real e ter permissão 0700.');
  const real = fs.realpathSync(value);
  if (inside(fs.realpathSync(root), real)) storageFail(code, 'Diretório deve ficar fora do repositório.');
  return real;
}

/**
 * Base da API do Storage: o serviço direto em loopback (http ou https, sem
 * caminho) ou atrás do gateway (`/storage/v1`), obrigatório no projeto aprovado.
 */
function storageEndpoint(value, { projectRef = null, allowHosted = false } = {}) {
  let url;
  try { url = new URL(value); } catch { storageFail('STORAGE_ENDPOINT_INVALID', 'Endereço do Storage inválido.'); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const prefix = url.pathname.replace(/\/+$/, '');
  if (url.username || url.password || url.search || url.hash || !['', '/storage/v1'].includes(prefix)) storageFail('STORAGE_ENDPOINT_INVALID', 'Endereço do Storage deve ser só a base da API.');
  if (LOOPBACK.includes(host) && ['http:', 'https:'].includes(url.protocol)) return { base: url.origin + prefix, mode: 'local' };
  if (allowHosted && RECOVERY_REFS.includes(projectRef) && url.protocol === 'https:' && host === `${projectRef}.supabase.co` && !url.port && prefix === '/storage/v1') return { base: url.origin + prefix, mode: 'hosted' };
  storageFail('STORAGE_ENDPOINT_INVALID', allowHosted ? 'Origem do Storage deve ser loopback ou o projeto de recuperação aprovado.' : 'Destino do Storage só em loopback descartável.');
}

function ageTool(env) {
  return (args, input) => {
    const result = spawnSync('age', args, { env: { PATH: env.PATH }, input, maxBuffer: MAX_OBJECT_BYTES * 2, timeout: 120000 });
    if (result.error || result.status !== 0) return null;
    return result.stdout;
  };
}

function psqlJson(connectionEnv, env, code) {
  const result = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
    env: { PATH: env.PATH, HOME: env.HOME, ...connectionEnv }, input: INVENTORY_SQL, encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024
  });
  if (result.error || result.status !== 0) storageFail(code, 'Inventário do Storage falhou; detalhes sensíveis omitidos.');
  return parseInventory(result.stdout);
}

async function http(fetchImpl, url, init, timeout = 60000) {
  try { return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeout) }); }
  catch { return null; }
}

async function download(fetchImpl, base, token, entry) {
  const response = await http(fetchImpl, `${base}/object/authenticated/${entry.bucket}/${encodeName(entry.name)}`,
    { headers: { apikey: token, Authorization: `Bearer ${token}` } });
  if (!response) return { status: 0 };
  if (response.status !== 200) { await response.arrayBuffer().catch(() => {}); return { status: response.status }; }
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: 200, bytes };
}

/** JWT HS256 para o Storage descartável do destino (segredo gerado pelo próprio ensaio). */
export function signJwt(secret, claims) {
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iat: now, exp: now + 3600, ...claims })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export async function exportStorage({ env = process.env, root = process.cwd(), fetchImpl = globalThis.fetch } = {}) {
  if (env.ARANDU_STORAGE_CONFIRM !== 'ARANDU-STORAGE-EXPORT') storageFail('STORAGE_CONFIRMATION_MISSING', 'Confirmação de export do Storage ausente.');
  const local = env.ARANDU_STORAGE_SOURCE_KIND === 'local-synthetic';
  const projectRef = local ? null : env.ARANDU_STORAGE_PROJECT_REF;
  let connection;
  try { connection = sourceConnection(env.ARANDU_STORAGE_DATABASE_URL, { local, projectRef: projectRef || RECOVERY_REFS[0] }); }
  catch { storageFail('STORAGE_SOURCE_IDENTITY_INVALID', 'Banco de origem não corresponde ao projeto aprovado.'); }
  if (local !== (connection.mode === 'local')) storageFail('STORAGE_SOURCE_IDENTITY_INVALID', 'Ensaio sintético exige loopback; projeto hospedado exige o ref aprovado.');
  const endpoint = storageEndpoint(env.ARANDU_STORAGE_SOURCE_URL, { projectRef, allowHosted: !local });
  if ((endpoint.mode === 'local') !== local) storageFail('STORAGE_SOURCE_IDENTITY_INVALID', 'Banco e Storage de origem precisam ser do mesmo projeto.');
  const key = env.ARANDU_STORAGE_SOURCE_SERVICE_KEY;
  if (!key) storageFail('STORAGE_SOURCE_KEY_MISSING', 'Chave de serviço do Storage de origem ausente.');
  if (!RECIPIENT.test(env.ARANDU_STORAGE_RECIPIENT || '')) storageFail('STORAGE_RECIPIENT_INVALID', 'Destinatário age X25519 obrigatório.');
  const age = ageTool(env);
  if (!age(['--encrypt', '--recipient', env.ARANDU_STORAGE_RECIPIENT], Buffer.from('preflight'))) storageFail('STORAGE_RECIPIENT_INVALID', 'age indisponível ou destinatário inválido.');
  const destination = privateDirectory(env.ARANDU_STORAGE_DIRECTORY, root, 'STORAGE_DESTINATION_INVALID');

  const inventory = psqlJson(connection.env, env, 'STORAGE_INVENTORY_FAILED');
  const assessment = assessInventory(inventory);
  if (!assessment.ok) storageFail('STORAGE_REFERENCES_INCONSISTENT', `Origem inconsistente (${assessment.problems.join(', ')}); export recusado para não preservar um estado incompleto.`);

  const directory = path.join(destination, `arandu-storage-${projectRef || 'local'}-${randomUUID()}`);
  fs.mkdirSync(path.join(directory, STORAGE_DIR), { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const manifestPath = path.join(directory, STORAGE_MANIFEST);
  const startedAt = new Date().toISOString();
  // Nasce failed: interrupção deixa o export explicitamente incompleto.
  fs.writeFileSync(manifestPath, JSON.stringify({ format_version: STORAGE_FORMAT_VERSION, result: 'failed', started_at: startedAt }, null, 2) + '\n', { mode: 0o600 });
  const references = new Map(inventory.references.map((r) => [`${r.bucket}\u0000${r.name}`, r]));
  const files = [];
  const write = (relative, bytes) => {
    const file = path.join(directory, relative);
    fs.writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' });
    files.push({ name: relative, bytes: bytes.length, sha256: sha256(bytes) });
  };
  try {
    const objects = [];
    for (const [i, object] of inventory.objects.entries()) {
      const seq = i + 1;
      const fetched = await download(fetchImpl, endpoint.base, key, object);
      if (fetched.status !== 200) storageFail('STORAGE_OBJECT_UNAVAILABLE', `Objeto ${seq}: binário indisponível na origem (HTTP ${fetched.status}).`);
      const entry = indexEntry({ seq, object, bytes: fetched.bytes, reference: references.get(`${object.bucket}\u0000${object.name}`) });
      const cipher = age(['--encrypt', '--recipient', env.ARANDU_STORAGE_RECIPIENT], fetched.bytes);
      if (!cipher) storageFail('STORAGE_ENCRYPTION_FAILED', `Objeto ${seq}: criptografia falhou.`);
      objects.push({ entry, cipher });
    }
    const index = { format_version: STORAGE_FORMAT_VERSION, buckets: inventory.buckets, objects: objects.map((o) => o.entry) };
    const indexCipher = age(['--encrypt', '--recipient', env.ARANDU_STORAGE_RECIPIENT], Buffer.from(JSON.stringify(index)));
    if (!indexCipher) storageFail('STORAGE_ENCRYPTION_FAILED', 'Criptografia do índice falhou.');
    write(STORAGE_INDEX, indexCipher);
    for (const { entry, cipher } of objects) write(entry.file, cipher);
    const manifest = storageManifest({ source: projectRef || 'local-synthetic', startedAt, inventory, assessment, index, files });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    return { directory, manifest };
  } catch (error) {
    fs.writeFileSync(manifestPath, JSON.stringify({ format_version: STORAGE_FORMAT_VERSION, result: 'failed', started_at: startedAt,
      failure: error instanceof StorageRecoveryError ? error.code : 'STORAGE_EXPORT_FAILED' }, null, 2) + '\n', { mode: 0o600 });
    throw error;
  }
}

/**
 * Evidência de binários para um export do banco: algum `arandu-storage-*` dentro
 * dele com manifesto e ciphertexts íntegros, a mesma quantidade de objetos do
 * snapshot do banco, mesma origem/classificação e digest do conjunto capturado
 * no mesmo snapshot do dump, e registro de restore isolado reconciliado (MATCH,
 * permissões negadas). Nunca descriptografa nada.
 */
export async function storageEvidence(databaseExport, databaseManifest) {
  const expectedObjects = databaseManifest?.snapshot_counts?.['storage.objects'];
  const expectedInventory = databaseManifest?.storage_snapshot_inventory_sha256;
  if (!Number.isSafeInteger(expectedObjects) || !/^[a-f0-9]{64}$/.test(expectedInventory || '')) return [];
  const synthetic = databaseManifest.classification === 'synthetic_encrypted_export';
  const source = synthetic ? 'local-synthetic' : databaseManifest.project_ref;
  const classification = synthetic ? 'synthetic_storage_export' : 'storage_binary_export';
  const found = [];
  for (const name of fs.readdirSync(databaseExport).filter((n) => /^arandu-storage-[a-z0-9-]+$/.test(n))) {
    const dir = path.join(databaseExport, name);
    const stat = fs.lstatSync(dir);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0) continue;
    let manifest;
    try { manifest = await openExport(dir); } catch { continue; }
    if (manifest.object_count !== expectedObjects || manifest.source !== source || manifest.classification !== classification ||
        manifest.snapshot_inventory_sha256 !== expectedInventory) continue;
    const records = fs.readdirSync(dir).filter((n) => STORAGE_RECORD.test(n)).flatMap((n) => {
      const file = path.join(dir, n);
      const s = fs.lstatSync(file);
      if (s.isSymbolicLink() || !s.isFile() || (s.mode & 0o077) !== 0) return [];
      try { return validStorageRecord(JSON.parse(fs.readFileSync(file, 'utf8')), manifest) ? [n] : []; } catch { return []; }
    });
    if (records.length) found.push({ export: name, objects: manifest.object_count, record: records.at(-1) });
  }
  return found;
}

/** Manifesto + ciphertexts conferidos ANTES de qualquer descriptografia. */
async function openExport(backup) {
  const manifestFile = path.join(backup, STORAGE_MANIFEST);
  const manifestStat = fs.lstatSync(manifestFile, { throwIfNoEntry: false });
  if (!manifestStat || manifestStat.isSymbolicLink() || !manifestStat.isFile() || (manifestStat.mode & 0o077) !== 0) {
    storageFail('STORAGE_MANIFEST_INVALID', 'Manifesto do Storage precisa ser arquivo privado regular.');
  }
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(backup, STORAGE_MANIFEST), 'utf8')); }
  catch { storageFail('STORAGE_MANIFEST_INVALID', 'Manifesto do Storage ausente ou ilegível.'); }
  checkManifest(manifest);
  const binaryDirectory = fs.lstatSync(path.join(backup, STORAGE_DIR), { throwIfNoEntry: false });
  if (manifest.object_count > 0 && (!binaryDirectory || binaryDirectory.isSymbolicLink() || !binaryDirectory.isDirectory() || (binaryDirectory.mode & 0o077) !== 0)) {
    storageFail('STORAGE_ARTIFACT_INVALID', 'Diretório de binários precisa ser privado e regular.');
  }
  for (const entry of manifest.files) {
    const file = path.join(backup, entry.name);
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (!stat) storageFail('STORAGE_ARTIFACT_MISSING', 'Artefato do Storage ausente; nada foi descriptografado.');
    if (stat.isSymbolicLink() || !stat.isFile()) storageFail('STORAGE_ARTIFACT_INVALID', 'Artefato do Storage precisa ser arquivo regular.');
    if ((stat.mode & 0o077) !== 0) storageFail('STORAGE_ARTIFACT_INVALID', 'Artefato do Storage precisa ter permissão privada.');
    const actual = await digestFile(file);
    if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) storageFail('STORAGE_HASH_MISMATCH', 'Hash ou tamanho divergente do manifesto; nada foi descriptografado.');
  }
  return manifest;
}

/** O destino descartável usa HS256; a chave privilegiada e os probes devem ter o mesmo emissor. */
function validateTargetServiceKey(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part)) || parts[2].length !== 43) throw new Error();
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const actual = Buffer.from(parts[2], 'base64url');
    if (header.alg !== 'HS256' || claims.role !== 'service_role' || !Number.isSafeInteger(claims.exp) ||
        claims.exp <= Math.floor(Date.now() / 1000) || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
  } catch {
    storageFail('STORAGE_TARGET_SECRET_INVALID', 'Chave de serviço local deve ser JWT HS256 service_role vigente assinado pelo segredo do destino.');
  }
}

function targetContext({ env, root }) {
  const backup = privateDirectory(env.ARANDU_STORAGE_BACKUP, root, 'STORAGE_BACKUP_INVALID');
  const identity = env.ARANDU_STORAGE_IDENTITY;
  const idStat = identity && path.isAbsolute(identity) ? fs.lstatSync(identity, { throwIfNoEntry: false }) : null;
  if (!idStat || idStat.isSymbolicLink() || !idStat.isFile() || (idStat.mode & 0o077) !== 0) storageFail('STORAGE_IDENTITY_INVALID', 'Identidade age deve ser arquivo regular 0600.');
  if (inside(fs.realpathSync(root), fs.realpathSync(identity)) || inside(backup, fs.realpathSync(identity))) storageFail('STORAGE_IDENTITY_INVALID', 'Identidade age fora do repositório e separada do ciphertext.');
  let database;
  try { database = loopbackTarget(env.ARANDU_STORAGE_TARGET_DATABASE_URL); } catch { storageFail('STORAGE_TARGET_NOT_ISOLATED', 'Banco de destino só em loopback descartável.'); }
  const endpoint = storageEndpoint(env.ARANDU_STORAGE_TARGET_URL);
  const secret = env.ARANDU_STORAGE_TARGET_JWT_SECRET || '';
  if (secret.length < 32) storageFail('STORAGE_TARGET_SECRET_INVALID', 'Segredo JWT do Storage descartável ausente.');
  // Chave de serviço do Storage descartável: a configurada no próprio serviço, ou emitida com o segredo dele.
  const service = env.ARANDU_STORAGE_TARGET_SERVICE_KEY || signJwt(secret, { role: 'service_role', iss: 'supabase' });
  validateTargetServiceKey(service, secret);
  return { backup, identity: fs.realpathSync(identity), database, endpoint, secret, service };
}

/**
 * Permissões depois do restore: bucket privado não serve leitura pública nem
 * anônima, e um usuário autenticado restaurado não lê direto do Storage nem o
 * objeto da própria organização nem o de outra (só a API do Arandu, com RPC de
 * autorização e service role, entrega documentos).
 */
export async function permissionProbe(fetchImpl, base, secret, index, target) {
  const anon = signJwt(secret, { role: 'anon' });
  const checks = [];
  const privateObjects = index.objects.filter((o) => index.buckets.find((b) => b.id === o.bucket)?.public === false);
  const sample = privateObjects[0];
  if (!sample) return { result: 'NO_PRIVATE_OBJECTS', checks };
  const tenantOf = (o) => o.name.split('/')[0];
  const foreign = privateObjects.find((o) => tenantOf(o) !== tenantOf(sample));
  const user = target.members.find((m) => m.organization_id === tenantOf(sample));
  const probe = async (name, url, token) => {
    const response = await http(fetchImpl, url, { headers: token ? { apikey: token, Authorization: `Bearer ${token}` } : {} });
    const status = response?.status ?? 0;
    await response?.arrayBuffer().catch(() => {});
    checks.push({ name, status, denied: STORAGE_DENIED_STATUSES.includes(status) });
  };
  const at = (o, mode = 'authenticated') => `${base}/object/${mode}/${o.bucket}/${encodeName(o.name)}`;
  await probe('public_url', at(sample, 'public'), null);
  await probe('anon_jwt', at(sample), anon);
  if (user) {
    const member = signJwt(secret, { role: 'authenticated', sub: user.user_id, aud: 'authenticated' });
    await probe('member_own_org_direct', at(sample), member);
    if (foreign) await probe('member_other_org_direct', at(foreign), member);
  }
  const cross_tenant_required = Boolean(foreign);
  const complete = Boolean(user) && (!foreign || checks.some((c) => c.name === 'member_other_org_direct'));
  const result = !complete ? 'INCONCLUSIVE' : checks.every((c) => c.denied) ? 'DENIED_AS_EXPECTED' : 'EXPOSED';
  return { result, cross_tenant_required, checks: checks.map(({ name, status, denied }) => ({ name, status, denied })) };
}

/** Subprocesso inválido nunca equivale a ausência comprovada de membros. */
export function parseTargetMembers(result) {
  if (result.error || result.status !== 0) storageFail('STORAGE_TARGET_MEMBERS_FAILED', 'Consulta de membros restaurados falhou; detalhes omitidos.');
  let members;
  try { members = JSON.parse(result.stdout.trim()); } catch { storageFail('STORAGE_TARGET_MEMBERS_FAILED', 'Consulta de membros restaurados ilegível.'); }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!Array.isArray(members) || !members.every((m) => uuid.test(m?.organization_id || '') && uuid.test(m?.user_id || ''))) {
    storageFail('STORAGE_TARGET_MEMBERS_FAILED', 'Consulta de membros restaurados inválida.');
  }
  return members;
}

function targetInventory(context, env) {
  const inventory = psqlJson(context.database, env, 'STORAGE_TARGET_INVENTORY_FAILED');
  const members = spawnSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c',
    "select coalesce(json_agg(json_build_object('organization_id', organization_id, 'user_id', user_id)), '[]'::json) from public.fin_members"],
  { env: { PATH: env.PATH, HOME: env.HOME, ...context.database }, encoding: 'utf8', timeout: 30000 });
  return { ...inventory, members: parseTargetMembers(members) };
}

async function reconcileTarget({ context, index, env, fetchImpl }) {
  const { service } = context;
  const target = targetInventory(context, env);
  const readbacks = new Map();
  for (const entry of index.objects) {
    const read = await download(fetchImpl, context.endpoint.base, service, entry);
    readbacks.set(entry.seq, read.status === 200 ? { status: 200, bytes: read.bytes.length, sha256: sha256(read.bytes) } : { status: read.status });
  }
  const comparison = reconcileStorage({ index, target, readbacks });
  const permissions = await permissionProbe(fetchImpl, context.endpoint.base, context.secret, index, target);
  return { comparison, permissions };
}

function writeRecord(backup, manifest, { mode, comparison, permissions, seconds }) {
  const record = {
    format_version: STORAGE_FORMAT_VERSION, verified_at: new Date().toISOString(), mode,
    target: 'loopback_disposable_supabase_storage', restore: mode === 'restore' ? 'RESTORED_ISOLATED' : 'NOT RESTORED (verify only)',
    reconciliation: comparison.result, reconciliation_version: comparison.version, objects: comparison.objects, differences: comparison.differences,
    index_sha256: manifest.index_sha256, files_sha256: digest(manifest.files), permissions, restore_seconds: seconds, conversion: 'BLOCKED'
  };
  const file = path.join(backup, `storage-restore-verification-${record.verified_at.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(record, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  return record;
}

async function decryptIndex(context, manifest, env) {
  const age = ageTool(env);
  const plain = age(['--decrypt', '--identity', context.identity], fs.readFileSync(path.join(context.backup, STORAGE_INDEX)));
  if (!plain) storageFail('STORAGE_DECRYPT_FAILED', 'Índice não pôde ser descriptografado (identidade errada ou artefato corrompido).');
  return { index: parseIndex(plain.toString('utf8'), manifest), age };
}

export async function restoreStorage({ env = process.env, root = process.cwd(), fetchImpl = globalThis.fetch } = {}) {
  if (env.ARANDU_STORAGE_RESTORE_CONFIRM !== 'ARANDU-ISOLATED-STORAGE-RESTORE') storageFail('STORAGE_CONFIRMATION_MISSING', 'Confirmação de restore isolado ausente.');
  const context = targetContext({ env, root });
  const manifest = await openExport(context.backup);
  const { index, age } = await decryptIndex(context, manifest, env);
  const started = Date.now();
  const { service } = context;
  for (const entry of index.objects) {
    const plain = age(['--decrypt', '--identity', context.identity], fs.readFileSync(path.join(context.backup, entry.file)));
    if (!plain) storageFail('STORAGE_DECRYPT_FAILED', `Objeto ${entry.seq}: descriptografia falhou.`);
    if (plain.length !== entry.size || sha256(plain) !== entry.sha256) storageFail('STORAGE_OBJECT_HASH_MISMATCH', `Objeto ${entry.seq}: conteúdo decifrado não confere com o índice.`);
    const response = await http(fetchImpl, `${context.endpoint.base}/object/${entry.bucket}/${encodeName(entry.name)}`, {
      method: 'POST', body: plain,
      headers: { apikey: service, Authorization: `Bearer ${service}`, 'x-upsert': 'true', 'Content-Type': entry.mimetype || 'application/octet-stream' }
    });
    const status = response?.status ?? 0;
    const body = await response?.text().catch(() => '') ?? '';
    // Só o código curto do Storage (ex.: InvalidJWT), nunca a mensagem, que pode citar o objeto.
    let reason = '';
    try { const error = JSON.parse(body).error; if (/^[A-Za-z ]{1,40}$/.test(error || '')) reason = `, ${error}`; } catch { /* sem código */ }
    if (status !== 200) storageFail('STORAGE_UPLOAD_FAILED', `Objeto ${entry.seq}: envio ao Storage de destino falhou (HTTP ${status}${reason}).`);
  }
  const { comparison, permissions } = await reconcileTarget({ context, index, env, fetchImpl });
  const record = writeRecord(context.backup, manifest, { mode: 'restore', comparison, permissions, seconds: Math.round((Date.now() - started) / 1000) });
  if (comparison.result !== 'MATCH') storageFail('STORAGE_RECONCILIATION_MISMATCH', `Reconciliação do Storage divergente (${[...new Set(comparison.differences.map((d) => d.kind))].join(', ')}).`);
  if (!validPermissionEvidence(permissions)) storageFail('STORAGE_PERMISSIONS_EXPOSED', 'Permissões Storage não comprovadas ou expostas fora do caminho autorizado.');
  return record;
}

export async function verifyStorage({ env = process.env, root = process.cwd(), fetchImpl = globalThis.fetch } = {}) {
  const context = targetContext({ env, root });
  const manifest = await openExport(context.backup);
  const { index } = await decryptIndex(context, manifest, env);
  const { comparison, permissions } = await reconcileTarget({ context, index, env, fetchImpl });
  const record = writeRecord(context.backup, manifest, { mode: 'verify', comparison, permissions, seconds: 0 });
  if (comparison.result !== 'MATCH') storageFail('STORAGE_RECONCILIATION_MISMATCH', `Reconciliação do Storage divergente (${[...new Set(comparison.differences.map((d) => d.kind))].join(', ')}).`);
  if (!validPermissionEvidence(permissions)) storageFail('STORAGE_PERMISSIONS_EXPOSED', 'Permissões Storage não comprovadas ou expostas fora do caminho autorizado.');
  return record;
}

const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url)); } catch { return false; } };
if (isMain()) {
  const command = process.argv[2];
  const run = { export: exportStorage, restore: restoreStorage, verify: verifyStorage }[command];
  if (!run) { console.error('uso: node scripts/storage-recovery.mjs export|restore|verify'); process.exit(2); }
  try {
    const out = await run();
    if (command === 'export') console.log(JSON.stringify({ export: path.basename(out.directory), objects: out.manifest.object_count, bytes: out.manifest.total_bytes, references: out.manifest.references, unreferenced: out.manifest.unreferenced, restore: 'NOT RUN' }));
    else console.log(JSON.stringify({ mode: out.mode, reconciliation: out.reconciliation, objects: out.objects, permissions: out.permissions.result,
      permission_checks: out.permissions.checks.map((c) => `${c.name}=${c.status}`), restore_seconds: out.restore_seconds }));
  } catch (error) {
    const known = error instanceof StorageRecoveryError;
    console.error(`BLOQUEADO (${known ? error.code : 'STORAGE_UNEXPECTED'}): ${known ? error.message : 'falha inesperada; detalhes omitidos.'}`);
    process.exitCode = 1;
  }
}

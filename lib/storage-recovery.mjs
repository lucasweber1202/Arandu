// Preservação e restauração dos BINÁRIOS do Supabase Storage (o pg_dump leva só
// os metadados de storage.objects). Lógica pura, sem rede nem disco: inventário,
// avaliação das referências do produto, índice, manifesto e reconciliação.
// O transporte (API oficial do Storage, age, arquivos) fica em
// scripts/storage-recovery.mjs. Nada aqui imprime nome de objeto, conteúdo,
// chave ou URL: relatórios usam número de sequência e contagens.
import { createHash } from 'node:crypto';

export const STORAGE_FORMAT_VERSION = 1;
// v2 acrescenta prova do conjunto de buckets e das restrições de upload.
export const STORAGE_RECONCILIATION_VERSION = 2;
export const STORAGE_MANIFEST = 'storage-manifest.json';
export const STORAGE_INDEX = 'storage-index.json.age';
export const STORAGE_DIR = 'storage';
export const STORAGE_RECORD = /^storage-restore-verification-[0-9TZ-]+\.json$/;
export const MAX_OBJECT_BYTES = 52428800;
// Storage usa 400/404 para ocultar objeto inacessível; rate limit/timeout não provam autorização.
export const STORAGE_DENIED_STATUSES = Object.freeze([400, 401, 403, 404]);

const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BUCKET = /^[a-z0-9][a-z0-9._-]{0,62}$/;

export class StorageRecoveryError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export const storageFail = (code, message) => { throw new StorageRecoveryError(code, message); };

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => JSON.stringify(value, (key, val) => (val && typeof val === 'object' && !Array.isArray(val)
  ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b))) : val));
export const digest = (value) => sha256(Buffer.from(canonical(value)));

/**
 * Inventário somente leitura: buckets, objetos (metadados) e as versões de
 * documento que o produto dá como disponíveis. Roda com row_security=off numa
 * transação read only; falha (em vez de filtrar) se o RLS se aplicar.
 */
export const STORAGE_SNAPSHOT_SQL = `select json_build_object(
 'buckets', (select coalesce(json_agg(json_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit,
   'allowed_mime_types', allowed_mime_types) order by id), '[]'::json) from storage.buckets),
 'objects', (select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name,
   'size', (metadata->>'size')::bigint, 'mimetype', metadata->>'mimetype') order by bucket_id, name), '[]'::json) from storage.objects)
)::text;`;

export const INVENTORY_SQL = `begin transaction isolation level repeatable read read only;
set local row_security = off;
select json_build_object(
 'buckets', (select coalesce(json_agg(json_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit,
   'allowed_mime_types', allowed_mime_types) order by id), '[]'::json) from storage.buckets),
 'objects', (select coalesce(json_agg(json_build_object('bucket', bucket_id, 'name', name,
   'size', (metadata->>'size')::bigint, 'mimetype', metadata->>'mimetype') order by bucket_id, name), '[]'::json) from storage.objects),
 'references', (select coalesce(json_agg(json_build_object('bucket', v.storage_bucket, 'name', v.storage_path, 'size', v.size_bytes,
   'sha256', v.sha256, 'organization_id', d.organization_id) order by v.storage_path), '[]'::json)
   from public.fin_document_versions v join public.fin_private_documents d on d.id = v.document_id where v.status = 'available')
)::text;
commit;`;

export function parseInventory(text) {
  let value;
  try { value = JSON.parse(String(text).trim().split('\n').filter((line) => line.startsWith('{')).at(-1)); }
  catch { storageFail('STORAGE_INVENTORY_INVALID', 'Inventário do Storage ilegível.'); }
  const ok = value && Array.isArray(value.buckets) && Array.isArray(value.objects) && Array.isArray(value.references) &&
    value.buckets.every((b) => BUCKET.test(b?.id || '') && typeof b.public === 'boolean') &&
    value.objects.every((o) => BUCKET.test(o?.bucket || '') && typeof o.name === 'string' && o.name.length > 0 && o.name.length <= 1024 &&
      !o.name.split('/').some((part) => part === '..' || part === '') && Number.isSafeInteger(o.size) && o.size >= 0) &&
    value.references.every((r) => BUCKET.test(r?.bucket || '') && typeof r.name === 'string' && Number.isSafeInteger(r.size) &&
      (r.sha256 === null || SHA256.test(r.sha256)) && UUID.test(r.organization_id || ''));
  if (!ok) storageFail('STORAGE_INVENTORY_INVALID', 'Inventário do Storage com formato inesperado.');
  return value;
}

const key = (bucket, name) => `${bucket}\u0000${name}`;

/** Mesmo conjunto de metadados capturado pelo dump, sem expor nomes no manifesto. */
export function storageSnapshotDigest(inventory) {
  return digest({
    buckets: [...inventory.buckets].sort((a, b) => a.id.localeCompare(b.id)),
    objects: [...inventory.objects].sort((a, b) => key(a.bucket, a.name).localeCompare(key(b.bucket, b.name)))
  });
}

/**
 * Referências do produto contra os objetos: versão disponível sem objeto, objeto
 * com tamanho diferente do registrado ou caminho cujo primeiro segmento não é a
 * organização dona do documento bloqueiam o export (backup incompleto ou
 * documento atribuído a outra organização). Objetos sem referência (envio
 * pendente, versão falha) são preservados e contados à parte.
 */
export function assessInventory(inventory) {
  const objects = new Map(inventory.objects.map((o) => [key(o.bucket, o.name), o]));
  const problems = [];
  for (const ref of inventory.references) {
    const object = objects.get(key(ref.bucket, ref.name));
    if (!object) problems.push('reference_without_object');
    else if (object.size !== ref.size) problems.push('reference_size_mismatch');
    if (ref.name.split('/')[0] !== ref.organization_id) problems.push('reference_cross_tenant_path');
  }
  const referenced = new Set(inventory.references.map((r) => key(r.bucket, r.name)));
  const oversized = inventory.objects.filter((o) => o.size > MAX_OBJECT_BYTES).length;
  if (oversized) problems.push('object_too_large');
  return {
    ok: problems.length === 0, problems: [...new Set(problems)].sort(),
    objects: inventory.objects.length, references: inventory.references.length,
    unreferenced: inventory.objects.filter((o) => !referenced.has(key(o.bucket, o.name))).length,
    bytes: inventory.objects.reduce((sum, o) => sum + o.size, 0)
  };
}

/** Linha do índice cifrado: único lugar com nome do objeto e hash do conteúdo. */
export function indexEntry({ seq, object, bytes, reference }) {
  if (bytes.length !== object.size) storageFail('STORAGE_OBJECT_SIZE_MISMATCH', `Objeto ${seq}: bytes baixados diferem do tamanho registrado.`);
  const hash = sha256(bytes);
  if (reference?.sha256 && reference.sha256 !== hash) storageFail('STORAGE_OBJECT_HASH_MISMATCH', `Objeto ${seq}: conteúdo diferente do hash registrado pelo produto.`);
  return { seq, file: objectFile(seq), bucket: object.bucket, name: object.name, size: object.size, mimetype: object.mimetype || null, sha256: hash };
}

export const objectFile = (seq) => `${STORAGE_DIR}/obj-${String(seq).padStart(6, '0')}.age`;

export function parseIndex(text, manifest) {
  let index;
  try { index = JSON.parse(String(text)); } catch { storageFail('STORAGE_INDEX_INVALID', 'Índice do Storage ilegível.'); }
  if (index?.format_version !== STORAGE_FORMAT_VERSION || !Array.isArray(index.objects) || !Array.isArray(index.buckets)) storageFail('STORAGE_INDEX_INVALID', 'Índice do Storage com formato inesperado.');
  if (digest(index) !== manifest.index_sha256) storageFail('STORAGE_INDEX_INVALID', 'Índice não confere com o manifesto.');
  if (index.objects.length !== manifest.object_count) storageFail('STORAGE_INDEX_INVALID', 'Índice e manifesto divergem na quantidade de objetos.');
  index.objects.forEach((entry, i) => {
    if (entry.seq !== i + 1 || entry.file !== objectFile(entry.seq) || !SHA256.test(entry.sha256 || '') || !BUCKET.test(entry.bucket || '') ||
        typeof entry.name !== 'string' || !Number.isSafeInteger(entry.size)) storageFail('STORAGE_INDEX_INVALID', `Índice inválido na posição ${i + 1}.`);
  });
  return index;
}

/** Manifesto em claro: contagens e hashes de ciphertext, nunca nomes de objeto. */
export function storageManifest({ source, startedAt, inventory, assessment, index, files }) {
  return {
    format_version: STORAGE_FORMAT_VERSION, classification: source === 'local-synthetic' ? 'synthetic_storage_export' : 'storage_binary_export',
    source, started_at: startedAt, completed_at: new Date().toISOString(), result: 'exported_unverified', restore: 'NOT RUN',
    object_count: index.objects.length, total_bytes: index.objects.reduce((sum, o) => sum + o.size, 0),
    references: assessment.references, unreferenced: assessment.unreferenced,
    cross_tenant_required: new Set(index.objects.filter((o) => index.buckets.find((b) => b.id === o.bucket)?.public === false).map((o) => o.name.split('/')[0])).size > 1,
    buckets: inventory.buckets.map((b) => ({ id: b.id, public: b.public })),
    inventory_sha256: digest(inventory), snapshot_inventory_sha256: storageSnapshotDigest(inventory), index_sha256: digest(index), files
  };
}

export function checkManifest(manifest) {
  const ok = manifest?.format_version === STORAGE_FORMAT_VERSION && manifest.result === 'exported_unverified' &&
    Number.isSafeInteger(manifest.object_count) && manifest.object_count >= 0 && Array.isArray(manifest.files) &&
    SHA256.test(manifest.index_sha256 || '') && SHA256.test(manifest.inventory_sha256 || '') &&
    manifest.files.length === manifest.object_count + 1 && manifest.files[0]?.name === STORAGE_INDEX &&
    manifest.files.slice(1).every((f, i) => f.name === objectFile(i + 1)) &&
    manifest.files.every((f) => SHA256.test(f.sha256 || '') && Number.isSafeInteger(f.bytes) && f.bytes > 0);
  if (!ok) storageFail('STORAGE_MANIFEST_INVALID', 'Manifesto do Storage incompleto ou de outro formato.');
  return manifest;
}

/**
 * Reconciliação do destino com o índice: mesmo conjunto (bucket, nome), mesmo
 * tamanho, binário presente e com o mesmo SHA-256, buckets com a mesma
 * visibilidade, limites de tamanho e tipos MIME; referências do produto satisfeitas.
 * Metadado sem binário é
 * `missing_binary`: um restore só do banco nunca passa.
 */
export function reconcileStorage({ index, target, readbacks }) {
  const differences = [];
  const add = (kind, seq = null) => differences.push(seq === null ? { kind } : { kind, seq });
  const targetObjects = new Map(target.objects.map((o) => [key(o.bucket, o.name), o]));
  const expected = new Set();
  for (const entry of index.objects) {
    const k = key(entry.bucket, entry.name);
    expected.add(k);
    const object = targetObjects.get(k);
    if (!object) { add('missing_object', entry.seq); continue; }
    if (object.size !== entry.size) add('size_mismatch', entry.seq);
    const read = readbacks.get(entry.seq);
    if (!read || read.status !== 200) add('missing_binary', entry.seq);
    else if (read.sha256 !== entry.sha256 || read.bytes !== entry.size) add('binary_mismatch', entry.seq);
  }
  for (const object of target.objects) if (!expected.has(key(object.bucket, object.name))) add('extra_object');
  const buckets = new Map(index.buckets.map((b) => [b.id, b]));
  for (const bucket of target.buckets) {
    const expectedBucket = buckets.get(bucket.id);
    if (!expectedBucket) { add('extra_bucket'); continue; }
    if (expectedBucket.public !== bucket.public) add('bucket_visibility_changed');
    if (expectedBucket.file_size_limit !== bucket.file_size_limit) add('bucket_file_size_limit_changed');
    // A ordem de uma allowlist não muda sua política; null não equivale a [].
    const mimePolicy = (value) => Array.isArray(value) ? [...new Set(value)].sort() : value;
    if (digest(mimePolicy(expectedBucket.allowed_mime_types)) !== digest(mimePolicy(bucket.allowed_mime_types))) add('bucket_allowed_mime_types_changed');
  }
  for (const id of buckets.keys()) if (!target.buckets.some((b) => b.id === id)) add('missing_bucket');
  const verdict = assessInventory(target);
  for (const problem of verdict.problems) add(`target_${problem}`);
  return { version: STORAGE_RECONCILIATION_VERSION, result: differences.length ? 'MISMATCH' : 'MATCH', objects: index.objects.length, differences };
}

/** A prova requer as sondas reais, incluindo membro restaurado, sem inferir sucesso de ausência. */
export function validPermissionEvidence(permissions) {
  const checks = permissions?.checks;
  return permissions?.result === 'DENIED_AS_EXPECTED' && typeof permissions.cross_tenant_required === 'boolean' && Array.isArray(checks) &&
    ['public_url', 'anon_jwt', 'member_own_org_direct'].every((name) => checks.some((c) => c.name === name)) &&
    (permissions.cross_tenant_required !== true || checks.some((c) => c.name === 'member_other_org_direct')) &&
    new Set(checks.map((c) => c.name)).size === checks.length &&
    checks.every((c) => c.denied === true && STORAGE_DENIED_STATUSES.includes(c.status));
}

/** Registro de restore que vale para ESTE export (mesmo índice e mesmos ciphertexts). */
export function validStorageRecord(record, manifest) {
  return record?.format_version === STORAGE_FORMAT_VERSION && record.reconciliation_version === STORAGE_RECONCILIATION_VERSION && record.restore === 'RESTORED_ISOLATED' && record.reconciliation === 'MATCH' &&
    Array.isArray(record.differences) && record.differences.length === 0 && record.objects === manifest.object_count &&
    record.index_sha256 === manifest.index_sha256 && record.files_sha256 === digest(manifest.files) &&
    record.target === 'loopback_disposable_supabase_storage' && validPermissionEvidence(record.permissions) &&
    typeof manifest.cross_tenant_required === 'boolean' && record.permissions.cross_tenant_required === manifest.cross_tenant_required &&
    Date.parse(record.verified_at) >= Date.parse(manifest.completed_at);
}

/**
 * Classificação do recovery completo: banco restaurado e reconciliado E, havendo
 * objetos na origem, binários restaurados e reconciliados. Só banco nunca é
 * recovery completo.
 */
export function recoveryCompleteness({ databaseVerified, storageObjects, storageVerified }) {
  if (!databaseVerified) return 'NOT_RECOVERED';
  if (!Number.isSafeInteger(storageObjects) || storageObjects < 0) return 'UNKNOWN_STORAGE';
  if (storageObjects === 0) return 'COMPLETE';
  return storageVerified ? 'COMPLETE' : 'DATABASE_ONLY';
}

/** Endereço do Storage hospedado do projeto aprovado (sem rede): https://<ref>.supabase.co/storage/v1. */
export function hostedStorageEndpointValid(value, projectRef) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === `${projectRef}.supabase.co` && !url.port && !url.username && !url.password &&
      !url.search && !url.hash && url.pathname.replace(/\/+$/, '') === '/storage/v1';
  } catch { return false; }
}

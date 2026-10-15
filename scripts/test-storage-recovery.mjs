// Binários do Storage: lógica de inventário, manifesto, índice e reconciliação, e
// as guardas da CLI que recusam antes de tocar rede, banco ou descriptografia.
// Sem credencial e sem serviço: o caminho completo (API oficial do Storage, age,
// restore e permissões) roda no ensaio scripts/pilot-restore-drill.sh dentro do
// laboratório efêmero (fase recovery de scripts/ci-demo/run.sh).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  assessInventory, parseInventory, indexEntry, objectFile, parseIndex, storageManifest, checkManifest,
  reconcileStorage, validStorageRecord, recoveryCompleteness, digest, sha256, STORAGE_INDEX, STORAGE_MANIFEST
} from '../lib/storage-recovery.mjs';
import { exportStorage, restoreStorage, verifyStorage, signJwt, storageEvidence } from './storage-recovery.mjs';
import { initStore, verifyExport } from './recovery.mjs';
import { countsDigest } from '../lib/recovery-reconciliation.mjs';
import { diagnoseRecovery } from '../lib/recovery-doctor.mjs';

const ORG_A = '00000000-0000-4000-8000-00000000000a';
const ORG_B = '00000000-0000-4000-8000-00000000000b';
const name = (org, n) => `${org}/00000000-0000-4000-8000-0000000000d${n}/v1-00000000-0000-4000-8000-0000000000e${n}`;
const bytesA = Buffer.from('%PDF sintético A'), bytesB = Buffer.from('%PDF sintético B');
const inventory = {
  buckets: [{ id: 'fin-documents', public: false, file_size_limit: 10485760, allowed_mime_types: ['application/pdf'] }],
  objects: [
    { bucket: 'fin-documents', name: name(ORG_A, 1), size: bytesA.length, mimetype: 'application/pdf' },
    { bucket: 'fin-documents', name: name(ORG_B, 2), size: bytesB.length, mimetype: 'application/pdf' }
  ],
  references: [
    { bucket: 'fin-documents', name: name(ORG_A, 1), size: bytesA.length, sha256: sha256(bytesA), organization_id: ORG_A },
    { bucket: 'fin-documents', name: name(ORG_B, 2), size: bytesB.length, sha256: null, organization_id: ORG_B }
  ]
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const code = (fn, expected) => assert.throws(fn, (e) => e.code === expected, expected);
const codeAsync = (promise, expected) => assert.rejects(promise, (e) => e.code === expected, expected);

// Inventário: formato e referências do produto.
assert.deepEqual(parseInventory(`BEGIN\n${JSON.stringify(inventory)}\nCOMMIT`), inventory);
code(() => parseInventory('{"buckets":[]}'), 'STORAGE_INVENTORY_INVALID');
code(() => parseInventory(JSON.stringify({ ...inventory, objects: [{ ...inventory.objects[0], name: `${ORG_A}/../x` }] })), 'STORAGE_INVENTORY_INVALID');
const ok = assessInventory(inventory);
assert.deepEqual({ ok: ok.ok, objects: ok.objects, references: ok.references, unreferenced: ok.unreferenced }, { ok: true, objects: 2, references: 2, unreferenced: 0 });
{
  const missing = clone(inventory); missing.objects.pop();
  assert.deepEqual(assessInventory(missing).problems, ['reference_without_object']);
  const resized = clone(inventory); resized.objects[0].size += 1;
  assert.deepEqual(assessInventory(resized).problems, ['reference_size_mismatch']);
  // Documento da organização B gravado sob o prefixo da A: atribuição cruzada.
  const crossed = clone(inventory); crossed.references[1].organization_id = ORG_A;
  assert.deepEqual(assessInventory(crossed).problems, ['reference_cross_tenant_path']);
  const orphan = clone(inventory); orphan.references.pop();
  assert.equal(assessInventory(orphan).ok, true); assert.equal(assessInventory(orphan).unreferenced, 1);
}

// Índice: tamanho e hash do produto conferidos no download.
const entries = [indexEntry({ seq: 1, object: inventory.objects[0], bytes: bytesA, reference: inventory.references[0] }),
  indexEntry({ seq: 2, object: inventory.objects[1], bytes: bytesB, reference: inventory.references[1] })];
code(() => indexEntry({ seq: 1, object: inventory.objects[0], bytes: Buffer.concat([bytesA, Buffer.from('x')]), reference: null }), 'STORAGE_OBJECT_SIZE_MISMATCH');
code(() => indexEntry({ seq: 1, object: inventory.objects[0], bytes: Buffer.from('%PDF sintético X'), reference: inventory.references[0] }), 'STORAGE_OBJECT_HASH_MISMATCH');
assert.equal(entries[1].file, 'storage/obj-000002.age');
const index = { format_version: 1, buckets: inventory.buckets, objects: entries };
const files = [{ name: STORAGE_INDEX, bytes: 300, sha256: 'a'.repeat(64) }, { name: objectFile(1), bytes: 250, sha256: 'b'.repeat(64) }, { name: objectFile(2), bytes: 250, sha256: 'c'.repeat(64) }];
const manifest = storageManifest({ source: 'local-synthetic', startedAt: new Date(Date.now() - 1000).toISOString(), inventory, assessment: ok, index, files });
assert.equal(manifest.classification, 'synthetic_storage_export');
assert(!JSON.stringify(manifest).includes(ORG_A), 'manifesto em claro não pode conter nomes de objeto');
assert.equal(checkManifest(manifest), manifest);
code(() => checkManifest({ ...manifest, files: files.slice(0, 2) }), 'STORAGE_MANIFEST_INVALID');
code(() => checkManifest({ ...manifest, result: 'failed' }), 'STORAGE_MANIFEST_INVALID');
assert.deepEqual(parseIndex(JSON.stringify(index), manifest), index);
code(() => parseIndex(JSON.stringify({ ...index, objects: [entries[1], entries[0]] }), manifest), 'STORAGE_INDEX_INVALID');
code(() => parseIndex(JSON.stringify(index), { ...manifest, index_sha256: digest({ other: true }) }), 'STORAGE_INDEX_INVALID');

// Reconciliação: só passa com todos os binários presentes e idênticos.
const read = (bytes) => ({ status: 200, bytes: bytes.length, sha256: sha256(bytes) });
const full = new Map([[1, read(bytesA)], [2, read(bytesB)]]);
assert.equal(reconcileStorage({ index, target: inventory, readbacks: full }).result, 'MATCH');
const kinds = (args) => reconcileStorage({ index, target: inventory, readbacks: full, ...args }).differences.map((d) => d.kind).sort();
// Restore só do banco: metadados presentes, arquivos ausentes (404).
assert.deepEqual(kinds({ readbacks: new Map([[1, { status: 404 }], [2, { status: 404 }]]) }), ['missing_binary', 'missing_binary']);
assert.deepEqual(kinds({ readbacks: new Map([[1, read(Buffer.from('%PDF sintético Z'))], [2, read(bytesB)]]) }), ['binary_mismatch']);
{
  const lost = clone(inventory); lost.objects.pop(); lost.references.pop();
  assert.deepEqual(kinds({ target: lost }), ['missing_object']);
  const extra = clone(inventory); extra.objects.push({ bucket: 'fin-documents', name: name(ORG_A, 9), size: 3, mimetype: 'application/pdf' });
  assert.deepEqual(kinds({ target: extra }), ['extra_object']);
  const opened = clone(inventory); opened.buckets[0].public = true;
  assert.deepEqual(kinds({ target: opened }), ['bucket_visibility_changed']);
  const nobucket = clone(inventory); nobucket.buckets = [];
  assert.deepEqual(kinds({ target: nobucket }), ['missing_bucket']);
  const crossed = clone(inventory); crossed.references[1].organization_id = ORG_A;
  assert.deepEqual(kinds({ target: crossed }), ['target_reference_cross_tenant_path']);
}

// Registro de restore vale só para o mesmo export, com MATCH e permissões negadas.
const record = { format_version: 1, restore: 'RESTORED_ISOLATED', reconciliation: 'MATCH', differences: [], objects: 2,
  index_sha256: manifest.index_sha256, files_sha256: digest(manifest.files), target: 'loopback_disposable_supabase_storage',
  permissions: { result: 'DENIED_AS_EXPECTED' }, verified_at: new Date().toISOString() };
assert.equal(validStorageRecord(record, manifest), true);
for (const forged of [{ reconciliation: 'MISMATCH' }, { differences: [{ kind: 'missing_binary' }] }, { objects: 1 }, { index_sha256: 'f'.repeat(64) },
  { files_sha256: 'f'.repeat(64) }, { permissions: { result: 'EXPOSED' } }, { restore: 'NOT RESTORED (verify only)' }, { verified_at: '2000-01-01T00:00:00Z' }]) {
  assert.equal(validStorageRecord({ ...record, ...forged }, manifest), false, JSON.stringify(forged));
}
assert.equal(recoveryCompleteness({ databaseVerified: true, storageObjects: 6, storageVerified: false }), 'DATABASE_ONLY');
assert.equal(recoveryCompleteness({ databaseVerified: true, storageObjects: 6, storageVerified: true }), 'COMPLETE');
assert.equal(recoveryCompleteness({ databaseVerified: true, storageObjects: 0, storageVerified: false }), 'COMPLETE');
assert.equal(recoveryCompleteness({ databaseVerified: false, storageObjects: 0, storageVerified: true }), 'NOT_RECOVERED');
assert.equal(recoveryCompleteness({ databaseVerified: true, storageObjects: null, storageVerified: true }), 'UNKNOWN_STORAGE');

// JWT do Storage descartável: HS256 válido, sem segredo no corpo.
const jwt = signJwt('s'.repeat(40), { role: 'service_role' });
assert.equal(jwt.split('.').length, 3);
assert.equal(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url')).role, 'service_role');

// Guardas da CLI: recusam antes de rede, banco ou descriptografia.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'arandu-storage-recovery-'));
try {
  fs.chmodSync(home, 0o700);
  const neverFetch = async () => { throw new Error('rede não deveria ser usada'); };
  const recipient = `age1${'q'.repeat(58)}`;
  const exportEnv = { PATH: process.env.PATH, ARANDU_STORAGE_CONFIRM: 'ARANDU-STORAGE-EXPORT', ARANDU_STORAGE_SOURCE_KIND: 'local-synthetic',
    ARANDU_STORAGE_DATABASE_URL: 'postgresql://postgres@127.0.0.1:54322/postgres', ARANDU_STORAGE_SOURCE_URL: 'http://127.0.0.1:5000',
    ARANDU_STORAGE_SOURCE_SERVICE_KEY: 'k', ARANDU_STORAGE_RECIPIENT: recipient, ARANDU_STORAGE_DIRECTORY: home };
  await codeAsync(exportStorage({ env: { ...exportEnv, ARANDU_STORAGE_CONFIRM: '' }, fetchImpl: neverFetch }), 'STORAGE_CONFIRMATION_MISSING');
  // Projeto hospedado fora da lista de recuperação, ou Storage de outro projeto.
  await codeAsync(exportStorage({ env: { ...exportEnv, ARANDU_STORAGE_SOURCE_KIND: 'hosted', ARANDU_STORAGE_PROJECT_REF: 'abcdefghijklmnopqrst',
    ARANDU_STORAGE_DATABASE_URL: 'postgresql://postgres:x@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=require' }, fetchImpl: neverFetch }), 'STORAGE_SOURCE_IDENTITY_INVALID');
  await codeAsync(exportStorage({ env: { ...exportEnv, ARANDU_STORAGE_SOURCE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }, fetchImpl: neverFetch }), 'STORAGE_ENDPOINT_INVALID');
  await codeAsync(exportStorage({ env: { ...exportEnv, ARANDU_STORAGE_SOURCE_URL: 'http://127.0.0.1:5000/?token=x' }, fetchImpl: neverFetch }), 'STORAGE_ENDPOINT_INVALID');
  await codeAsync(exportStorage({ env: { ...exportEnv, ARANDU_STORAGE_SOURCE_SERVICE_KEY: '' }, fetchImpl: neverFetch }), 'STORAGE_SOURCE_KEY_MISSING');
  await codeAsync(exportStorage({ env: { ...exportEnv, ARANDU_STORAGE_RECIPIENT: 'age1curto' }, fetchImpl: neverFetch }), 'STORAGE_RECIPIENT_INVALID');

  // Export sintético forjado para os negativos de restore (sem age: tudo recusa antes de decifrar).
  const backup = path.join(home, 'export'); fs.mkdirSync(path.join(backup, 'storage'), { recursive: true, mode: 0o700 }); fs.chmodSync(backup, 0o700);
  const blobs = [Buffer.alloc(300, 1), Buffer.alloc(250, 2), Buffer.alloc(250, 3)];
  const realFiles = [STORAGE_INDEX, objectFile(1), objectFile(2)].map((n, i) => { fs.writeFileSync(path.join(backup, n), blobs[i], { mode: 0o600 }); return { name: n, bytes: blobs[i].length, sha256: sha256(blobs[i]) }; });
  fs.writeFileSync(path.join(backup, STORAGE_MANIFEST), JSON.stringify({ ...manifest, files: realFiles }), { mode: 0o600 });
  const identity = path.join(home, 'id.agekey'); fs.writeFileSync(identity, 'AGE-SECRET-KEY-SINTETICA', { mode: 0o600 });
  const restoreEnv = { PATH: process.env.PATH, ARANDU_STORAGE_RESTORE_CONFIRM: 'ARANDU-ISOLATED-STORAGE-RESTORE', ARANDU_STORAGE_BACKUP: backup,
    ARANDU_STORAGE_IDENTITY: identity, ARANDU_STORAGE_TARGET_DATABASE_URL: 'postgresql://postgres@127.0.0.1:54329/postgres',
    ARANDU_STORAGE_TARGET_URL: 'http://127.0.0.1:54330', ARANDU_STORAGE_TARGET_JWT_SECRET: 's'.repeat(64) };
  await codeAsync(restoreStorage({ env: { ...restoreEnv, ARANDU_STORAGE_RESTORE_CONFIRM: '' }, fetchImpl: neverFetch }), 'STORAGE_CONFIRMATION_MISSING');
  // Destino nunca hospedado: banco e Storage só em loopback.
  await codeAsync(restoreStorage({ env: { ...restoreEnv, ARANDU_STORAGE_TARGET_DATABASE_URL: 'postgresql://postgres:x@db.offgpyysgdhfemjlchod.supabase.co:5432/postgres' }, fetchImpl: neverFetch }), 'STORAGE_TARGET_NOT_ISOLATED');
  await codeAsync(restoreStorage({ env: { ...restoreEnv, ARANDU_STORAGE_TARGET_URL: 'https://offgpyysgdhfemjlchod.supabase.co' }, fetchImpl: neverFetch }), 'STORAGE_ENDPOINT_INVALID');
  await codeAsync(restoreStorage({ env: { ...restoreEnv, ARANDU_STORAGE_TARGET_JWT_SECRET: 'curto' }, fetchImpl: neverFetch }), 'STORAGE_TARGET_SECRET_INVALID');
  fs.chmodSync(identity, 0o644);
  await codeAsync(restoreStorage({ env: restoreEnv, fetchImpl: neverFetch }), 'STORAGE_IDENTITY_INVALID');
  fs.chmodSync(identity, 0o600);
  fs.chmodSync(backup, 0o755);
  await codeAsync(restoreStorage({ env: restoreEnv, fetchImpl: neverFetch }), 'STORAGE_BACKUP_INVALID');
  fs.chmodSync(backup, 0o700);
  // Artefato ausente e artefato adulterado: recusa antes de qualquer descriptografia.
  fs.renameSync(path.join(backup, objectFile(2)), path.join(home, 'moved'));
  await codeAsync(restoreStorage({ env: restoreEnv, fetchImpl: neverFetch }), 'STORAGE_ARTIFACT_MISSING');
  await codeAsync(verifyStorage({ env: restoreEnv, fetchImpl: neverFetch }), 'STORAGE_ARTIFACT_MISSING');
  fs.renameSync(path.join(home, 'moved'), path.join(backup, objectFile(2)));
  fs.appendFileSync(path.join(backup, objectFile(1)), 'x');
  await codeAsync(restoreStorage({ env: restoreEnv, fetchImpl: neverFetch }), 'STORAGE_HASH_MISMATCH');
  fs.writeFileSync(path.join(backup, objectFile(1)), blobs[1]);
  fs.writeFileSync(path.join(backup, STORAGE_MANIFEST), JSON.stringify({ ...manifest, result: 'failed', files: realFiles }));
  await codeAsync(restoreStorage({ env: restoreEnv, fetchImpl: neverFetch }), 'STORAGE_MANIFEST_INVALID');
} finally {
  fs.rmSync(home, { recursive: true, force: true });
}
// Doctor (sem rede nem banco): binários declarados exigem endereço do projeto aprovado e chave, sem expor valores.
{
  const fakeRun = () => ({ status: 1, stdout: '' });
  const secretKey = 'chave-de-servico-que-nao-pode-aparecer';
  const storageCheck = (extra) => diagnoseRecovery({ env: { PATH: process.env.PATH, ARANDU_RECOVERY_PROJECT_REF: 'offgpyysgdhfemjlchod', ...extra }, run: fakeRun });
  const pick = (report) => report.checks.find((c) => c.id === 'storage');
  assert.deepEqual(pick(storageCheck({})), { id: 'storage', label: 'Storage binaries (separate export)', status: 'NOT CHECKED', code: null });
  const valid = storageCheck({ ARANDU_RECOVERY_STORAGE_BINARIES: 'separate-export', ARANDU_STORAGE_SOURCE_URL: 'https://offgpyysgdhfemjlchod.supabase.co/storage/v1', ARANDU_STORAGE_SOURCE_SERVICE_KEY: secretKey });
  assert.equal(pick(valid).status, 'VALID');
  assert(!JSON.stringify(valid).includes(secretKey), 'doctor não pode ecoar a chave');
  for (const url of ['https://igacnfjeuqhxcmfyepgj.supabase.co/storage/v1', 'https://offgpyysgdhfemjlchod.supabase.co', 'http://offgpyysgdhfemjlchod.supabase.co/storage/v1', 'https://offgpyysgdhfemjlchod.supabase.co/storage/v1?x=1']) {
    assert.equal(pick(storageCheck({ ARANDU_RECOVERY_STORAGE_BINARIES: 'separate-export', ARANDU_STORAGE_SOURCE_URL: url, ARANDU_STORAGE_SOURCE_SERVICE_KEY: secretKey })).code, 'RECOVERY_STORAGE_BINARIES_INVALID', url);
  }
  assert.equal(pick(storageCheck({ ARANDU_RECOVERY_STORAGE_BINARIES: 'separate-export', ARANDU_STORAGE_SOURCE_URL: 'https://offgpyysgdhfemjlchod.supabase.co/storage/v1' })).code, 'RECOVERY_STORAGE_BINARIES_MISSING');
  assert.equal(pick(storageCheck({ ARANDU_RECOVERY_STORAGE_BINARIES: 'yes' })).code, 'RECOVERY_STORAGE_BINARIES_INVALID');
}

// Cadeia canônica: banco restaurado com arquivos na origem é DATABASE_ONLY (nível 4);
// só com os binários exportados DENTRO do export e restaurados vira RECOVERY_VERIFIED.
{
  const home = fs.mkdtempSync(path.join(os.homedir(), '.arandu-storage-chain-test-'));
  try {
    fs.chmodSync(home, 0o700);
    const storeDir = path.join(home, 'store');
    const store = initStore({ env: { PATH: process.env.PATH, ARANDU_RECOVERY_DIRECTORY: storeDir }, args: ['--attest-persistent'] });
    const dbExport = path.join(storeDir, 'arandu-local-export'); fs.mkdirSync(dbExport, { mode: 0o700 });
    const dbFiles = ['database.dump.age', 'roles.sql.age'].map((n, i) => { const b = Buffer.alloc(200 + i, i + 7); fs.writeFileSync(path.join(dbExport, n), b, { mode: 0o600 }); return { name: n, bytes: b.length, sha256: sha256(b) }; });
    const counts = { 'public.fin_private_documents': 2, 'storage.objects': 2 };
    const started = new Date(Date.now() - 60000).toISOString(), completed = new Date(Date.now() - 50000).toISOString();
    const dbManifest = { format_version: 1, classification: 'synthetic_encrypted_export', project_ref: null, started_at: started, completed_at: completed,
      result: 'exported_unverified', storage: { strategy: 'private-store', store_id: store.store_id }, snapshot: 'exported_snapshot_shared_with_pg_dump',
      snapshot_counts: counts, snapshot_counts_sha256: countsDigest(counts), source_counts: { storage_objects: 2 }, storage_binaries: 'SEPARATE_EXPORT_REQUIRED', files: dbFiles };
    fs.writeFileSync(path.join(dbExport, 'manifest.json'), JSON.stringify(dbManifest), { mode: 0o600 });
    const dbRecord = { format_version: 1, restore: 'RESTORED_ISOLATED', reconciliation: 'MATCH', differences: [], tables: 2, target: 'loopback_disposable_postgresql17',
      roles_file: 'NOT APPLIED', export_project_ref: null, export_started_at: started, source_counts_sha256: dbManifest.snapshot_counts_sha256,
      target_counts_sha256: dbManifest.snapshot_counts_sha256, files: dbFiles, verified_at: new Date(Date.now() - 40000).toISOString() };
    fs.writeFileSync(path.join(dbExport, 'restore-verification-2026-10-15T00-00-00-000Z.json'), JSON.stringify(dbRecord), { mode: 0o600 });
    const verify = () => verifyExport({ env: { PATH: process.env.PATH, ARANDU_RECOVERY_BACKUP: dbExport } });
    let result = await verify();
    assert.deepEqual([result.level, result.recovery, result.completeness, result.storage_binaries], [4, 'RECOVERY_DATABASE_ONLY', 'DATABASE_ONLY', 'NOT_VERIFIED']);
    // Binários exportados dentro do export do banco, com restore reconciliado.
    const sx = path.join(dbExport, 'arandu-storage-local-0001'); fs.mkdirSync(path.join(sx, 'storage'), { recursive: true, mode: 0o700 }); fs.chmodSync(sx, 0o700);
    const blobs = [Buffer.alloc(300, 1), Buffer.alloc(250, 2), Buffer.alloc(250, 3)];
    const sFiles = [STORAGE_INDEX, objectFile(1), objectFile(2)].map((n, i) => { fs.writeFileSync(path.join(sx, n), blobs[i], { mode: 0o600 }); return { name: n, bytes: blobs[i].length, sha256: sha256(blobs[i]) }; });
    const sManifest = { ...manifest, files: sFiles, completed_at: new Date(Date.now() - 30000).toISOString() };
    fs.writeFileSync(path.join(sx, STORAGE_MANIFEST), JSON.stringify(sManifest), { mode: 0o600 });
    const sRecord = { ...record, files_sha256: digest(sFiles), index_sha256: sManifest.index_sha256, verified_at: new Date().toISOString() };
    const recordFile = path.join(sx, 'storage-restore-verification-2026-10-15T00-00-01-000Z.json');
    fs.writeFileSync(recordFile, JSON.stringify(sRecord), { mode: 0o600 });
    assert.equal((await storageEvidence(dbExport, 2)).length, 1);
    result = await verify();
    assert.deepEqual([result.level, result.recovery, result.completeness, result.storage_binaries], [5, 'RECOVERY_VERIFIED', 'COMPLETE', 'RESTORE_VERIFIED']);
    // Quantidade diferente da do snapshot, registro legível por outros, forjado ou ciphertext adulterado: volta a 4.
    assert.equal((await storageEvidence(dbExport, 3)).length, 0);
    fs.chmodSync(recordFile, 0o644); assert.equal((await verify()).level, 4); fs.chmodSync(recordFile, 0o600);
    fs.writeFileSync(recordFile, JSON.stringify({ ...sRecord, permissions: { result: 'EXPOSED' } })); assert.equal((await verify()).level, 4);
    fs.writeFileSync(recordFile, JSON.stringify(sRecord)); assert.equal((await verify()).level, 5);
    fs.appendFileSync(path.join(sx, objectFile(2)), 'x'); assert.equal((await verify()).recovery, 'RECOVERY_DATABASE_ONLY');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
}
console.log('Storage recovery: inventário com referências do produto, índice cifrado, manifesto sem nomes, reconciliação (metadado sem binário falha), registro preso ao export e guardas da CLI aprovados.');

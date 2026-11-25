// Exclusão do Storage no reset/cleanup da Demo (Arandu 12.1 / P1-B).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scopedStoragePaths, deleteStorageObjects, StorageCleanupError } from '../lib/demo/storage-cleanup.mjs';

const u = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = u(1), doc = u(2), otherOrg = u(9), otherDoc = u(8);
const path = (o, d, v = 1) => `${o}/${d}/v${v}-${u(100 + v)}`;
const scope = { orgs: [org], documents: [doc] };
const noSleep = async () => {};

// Escopo: só objetos do workspace; intrusos (outro workspace, baseline, outro bucket) recusam tudo.
assert.deepEqual(scopedStoragePaths([{ document_id: doc, storage_bucket: 'fin-documents', storage_path: path(org, doc) }, { storage_path: null }], scope), [path(org, doc)]);
for (const intruder of [
  { document_id: otherDoc, storage_path: path(otherOrg, otherDoc) },
  { document_id: doc, storage_path: path(otherOrg, doc) },
  { document_id: otherDoc, storage_path: path(org, otherDoc) },
  { document_id: doc, storage_bucket: 'outro', storage_path: path(org, doc) },
  { document_id: doc, storage_path: `${org}/../${doc}` },
  { document_id: otherDoc, storage_path: path(org, doc) }
]) assert.throws(() => scopedStoragePaths([{ storage_path: path(org, doc), document_id: doc }, intruder], scope), StorageCleanupError);

const paths = Array.from({ length: 250 }, (_, i) => path(org, doc, i + 1));

// Sucesso em lotes; objetos ausentes não são erro (remove resolve).
let calls = [];
assert.deepEqual(await deleteStorageObjects(paths, { remove: async (b) => { calls.push(b.length); }, sleep: noSleep }), { removed: 250 });
assert.deepEqual(calls, [100, 100, 50]);

// Falha de rede transitória: nova tentativa e conclusão.
let failures = 1; calls = [];
await deleteStorageObjects(paths.slice(0, 10), { remove: async (b) => { if (failures-- > 0) throw new TypeError('fetch failed'); calls.push(b.length); }, sleep: noSleep });
assert.deepEqual(calls, [10]);

// Erro de resposta não transitório (403): sem retry, erro explícito, nada contado como limpo.
let tries = 0;
await assert.rejects(deleteStorageObjects(paths.slice(0, 10), { remove: async () => { tries += 1; throw Object.assign(new Error('DELETE: 403'), { status: 403 }); }, sleep: noSleep }),
  (e) => e instanceof StorageCleanupError && e.removed === 0 && e.remaining.length === 10);
assert.equal(tries, 1);

// 5xx persistente: tentativas esgotadas; exclusão parcial informa o que resta para retomar.
let batch = 0;
const partial = await deleteStorageObjects(paths, { remove: async () => { batch += 1; if (batch > 1) throw Object.assign(new Error('DELETE: 503'), { status: 503 }); }, sleep: noSleep }).catch((e) => e);
assert.ok(partial instanceof StorageCleanupError);
assert.equal(partial.removed, 100);
assert.deepEqual(partial.remaining, paths.slice(100));
assert.equal(batch, 1 + 3, 'um lote ok + três tentativas do segundo');

// Retomada: a nova execução apaga o restante (o que já saiu some do Storage; a API idempotente aceita).
assert.deepEqual(await deleteStorageObjects(partial.remaining, { remove: async () => {}, sleep: noSleep }), { removed: 150 });

// Integração no seed: Storage antes das tabelas, sem engolir erro.
const seed = readFileSync('scripts/demo/seed.mjs', 'utf8');
const reset = seed.slice(seed.indexOf('async function resetDemo'), seed.indexOf('// ---------------------------------------------------------------- seed'));
assert.ok(reset.indexOf('deleteStorageObjects') < reset.indexOf('scopedTables(scope)'), 'Storage antes das tabelas');
assert.doesNotMatch(reset.slice(0, reset.indexOf('scopedTables(scope)')), /catch\(\(\) => null\)/, 'falha do Storage não pode ser ignorada');
console.log('Demo Storage cleanup: escopo, lotes, retry, erro explícito, exclusão parcial e retomada aprovados.');

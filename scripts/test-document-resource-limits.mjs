import assert from 'node:assert/strict';
import { createDocumentStorage, StorageUnavailable } from '../lib/finance/document-storage.mjs';
import { readZip, ExtractionFailure } from '../lib/finance/extraction-providers.mjs';
import { makeZip } from '../tests/fixtures/document-intelligence/builders.mjs';

const env = { SUPABASE_URL: 'https://fixture.example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server-key' };
const path = '00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/v1-00000000-0000-4000-8000-000000000003';
const limit = (error) => error instanceof StorageUnavailable && /limite/i.test(error.message);

// A dishonest/absent Content-Length must not cause whole-response buffering.
for (const headers of [{}, { 'content-length': '1' }]) {
  let cancelled = false, pulls = 0;
  const body = new ReadableStream({
    pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(8)); },
    cancel() { cancelled = true; }
  }, { highWaterMark: 0 });
  const response = new Response(body, { headers });
  response.arrayBuffer = async () => { throw new Error('whole response buffering is forbidden'); };
  const store = createDocumentStorage({ env, fetchImpl: async () => response });
  await assert.rejects(() => store.read(path, 12), limit);
  assert.equal(cancelled, true);
  assert.equal(pulls, 2, 'stop reading at the first overflowing chunk');
}
for (const bytes of [Buffer.from('abc'), Buffer.alloc(12)]) {
  const store = createDocumentStorage({ env, fetchImpl: async () => new Response(bytes) });
  assert.deepEqual(await store.read(path, 12), bytes, 'valid bytes, including the exact limit, are preserved');
}
let calls = 0;
const store = createDocumentStorage({ env, fetchImpl: async () => { calls += 1; return new Response('x'); } });
for (const budget of [0, -1, NaN, Infinity, 1.5, 10 * 1024 * 1024 + 1]) await assert.rejects(() => store.read(path, budget), limit);
await assert.rejects(() => store.read('../foreign-tenant/object'), StorageUnavailable);
assert.equal(calls, 0, 'invalid paths and budgets never reach privileged Storage');
console.log('Document transport: bounded streaming, cancellation, exact limits and path validation passed.');

// Central-directory sizes are untrusted: compare the real inflated length.
const zip = makeZip({ 'word/document.xml': 'x'.repeat(1024) });
const central = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
const forged = Buffer.from(zip);
forged.writeUInt32LE(1, central + 24);
assert.throws(() => readZip(forged).get('word/document.xml')(), (e) => e instanceof ExtractionFailure && e.code === 'parse_error');
assert.equal(readZip(zip).get('word/document.xml')().length, 1024);
const badCrc = Buffer.from(zip);
badCrc.writeUInt32LE((zip.readUInt32LE(central + 16) + 1) >>> 0, central + 16);
assert.throws(() => readZip(badCrc).get('word/document.xml')(), (e) => e.code === 'parse_error');
const truncated = Buffer.from(zip);
truncated.writeUInt32LE(zip.length, central + 20);
assert.throws(() => readZip(truncated), (e) => e.code === 'parse_error');
// Duplicate names must not silently replace financial terms with a later entry.
const duplicate = makeZip({ 'word/first.xml': 'Valor: 10', 'word/other.xml': 'Valor: 99' });
Buffer.from('word/first.xml').copy(duplicate, duplicate.lastIndexOf(Buffer.from('word/other.xml')));
assert.throws(() => readZip(duplicate), (e) => e.code === 'parse_error');
console.log('Document ZIP: forged inflation sizes rejected; valid archive preserved.');

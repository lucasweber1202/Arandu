import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

process.env.SUPABASE_URL = 'https://arandu-collections-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-collections-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-collections-test';

const { default: handler } = await import(`../api/collections.js?collections-test=${Date.now()}`);

function req(url) {
  const request = Readable.from([]);
  request.method = 'GET';
  request.url = url;
  request.headers = {};
  return request;
}

function res() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = '') { this.body = String(value); }
  };
}

async function call(url) {
  const response = res();
  await handler(req(url), response);
  return { status: response.statusCode, body: JSON.parse(response.body) };
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' }
});
const originalFetch = global.fetch;

try {
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    assert.match(String(url), /v_catalog_readiness/);
    return json([{ id: 'production', verified_ready: false, dataset_version: 'draft' }]);
  };
  const blocked = await call('/api/collections');
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.code, 'catalog_not_verified');
  assert.equal(calls, 1);

  const urls = [];
  global.fetch = async (url) => {
    const value = String(url);
    urls.push(value);
    if (value.includes('v_catalog_readiness')) {
      return json([{ id: 'production', verified_ready: true, dataset_version: 'real-v1' }]);
    }
    if (value.includes('v_public_collections')) {
      assert.doesNotMatch(value, /payload|source_reference|verification_notes/);
      return json([{ id: 'primeira', slug: 'primeira-colecao', title: 'Primeira coleção', artwork_count: 4 }]);
    }
    throw new Error(`URL inesperada: ${value}`);
  };
  const list = await call('/api/collections');
  assert.equal(list.status, 200);
  assert.equal(list.body.verifiedReady, true);
  assert.equal(list.body.release, 'real-v1');
  assert.equal(list.body.collections.length, 1);
  assert.ok(urls.some((url) => url.includes('v_public_collections')));

  global.fetch = async (url) => {
    assert.match(String(url), /v_catalog_readiness/);
    return json([{ id: 'production', verified_ready: true, dataset_version: 'real-v1' }]);
  };
  const invalid = await call('/api/collections?id=primeira),status.eq.draft');
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, 'invalid_collection_id');

  console.log('Arandu Collections API Contract Tests');
  console.log('3 cenários aprovados.');
} finally {
  global.fetch = originalFetch;
}

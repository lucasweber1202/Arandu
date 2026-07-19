import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

process.env.SUPABASE_URL = 'https://arandu-catalog-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-catalog-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-catalog-test';

const { default: handler } = await import(`../api/[...path].js?catalog-test=${Date.now()}`);

function req(url) {
  const request = Readable.from([]);
  request.method = 'GET';
  request.url = url;
  request.headers = {};
  request.socket = { remoteAddress: '127.0.0.2' };
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

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const originalFetch = global.fetch;

try {
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    assert.match(String(url), /v_catalog_readiness/);
    return json([{ id: 'production', verified_ready: false, dataset_version: 'draft' }]);
  };
  const blocked = await call('/api/catalog');
  assert.equal(blocked.status, 503);
  assert.equal(blocked.body.code, 'catalog_not_verified');
  assert.equal(calls, 1);

  const catalogUrls = [];
  global.fetch = async (url) => {
    const value = String(url);
    catalogUrls.push(value);
    if (value.includes('v_catalog_readiness')) return json([{ id: 'production', verified_ready: true, dataset_version: 'real-v1' }]);
    if (value.includes('v_public_catalog')) return json([{ id: 'obra-1', title: 'Obra validada', artist_name: 'Artista validado' }]);
    throw new Error(`URL inesperada: ${value}`);
  };
  const catalog = await call('/api/catalog');
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.verifiedReady, true);
  assert.equal(catalog.body.release, 'real-v1');
  assert.equal(catalog.body.items.length, 1);
  assert.ok(catalogUrls.some((url) => url.includes('v_public_catalog')));
  assert.ok(catalogUrls.every((url) => !url.includes('source_reference')));

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('v_catalog_readiness')) return json([{ id: 'production', verified_ready: true, dataset_version: 'real-v1' }]);
    if (value.includes('/v_public_artists?')) {
      assert.doesNotMatch(value, /source_reference/);
      return json([{ id: 'artista-1', name: 'Artista validado' }]);
    }
    throw new Error(`URL inesperada: ${value}`);
  };
  const artists = await call('/api/artists');
  assert.equal(artists.status, 200);
  assert.equal(artists.body.verifiedReady, true);
  assert.equal(artists.body.items.length, 1);

  console.log('Arandu Catalog API Contract Tests');
  console.log('3 cenários aprovados.');
} finally {
  global.fetch = originalFetch;
}

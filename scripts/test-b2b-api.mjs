import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleB2b } from '../lib/api/domains/b2b.mjs';

process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const org = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const actor = '00000000-0000-4000-8000-000000000003';
const requests = [];
globalThis.fetch = async (url, options) => {
  requests.push({ url: String(url), body: JSON.parse(options.body || '{}'), authorization: options.headers.Authorization });
  return new Response(JSON.stringify([{ id: org }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
function request(method, body = {}, url = '/api/b2b/products') {
  return Object.assign(Readable.from(method === 'POST' ? [Buffer.from(JSON.stringify(body))] : []),
    { method, url, headers: {} });
}
function response() {
  return { headers: {}, setHeader(k,v) { this.headers[k] = v; }, end(value) { this.body = JSON.parse(value); } };
}
const deps = {
  requireUser: async () => ({ user: { id: actor }, accessToken: 'user-jwt', headers: {} }),
  enforceRateLimit: async () => {}
};
const res = response();
await handleB2b(request('POST', { organization_id: org, sku: 'DEMO', name: 'Product', status: 'published', created_by: other }), res, 'products', deps);
assert.equal(res.statusCode, 201);
assert.deepEqual(requests[0].body, { organization_id: org, sku: 'DEMO', name: 'Product' });
assert.equal(requests[0].authorization, 'Bearer user-jwt');
assert.ok(!requests[0].url.includes('service_role'));
await assert.rejects(() => handleB2b(request('POST', { organization_id: org, provider_organization_id: other, invitation_id: other, category: 'credit', terms: {} }), response(), 'quotes', deps),
  error => error.status === 400);
assert.equal(requests.length, 1);
await assert.rejects(() => handleB2b(request('GET', {}, '/api/b2b/products?organization_id=bad'), response(), 'products', deps),
  error => error.status === 400);
await assert.rejects(() => handleB2b(request('GET', {}, '/api/b2b/passport/bad'), response(), 'passport/bad', deps),
  error => error.status === 404);
console.log('B2B API boundary tests approved.');

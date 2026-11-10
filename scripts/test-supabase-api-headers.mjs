import assert from 'node:assert/strict';
import { isOpaqueSupabaseApiKey, supabaseApiKeyHeaders } from '../lib/supabase-api-headers.mjs';
const anon = 'sb_publishable_' + 'P'.repeat(32);
const service = 'sb_secret_' + 'S'.repeat(32);
const legacy = 'eyJ' + 'A'.repeat(35) + '.eyJ' + 'B'.repeat(35) + '.signatureTest123';
const jwt = 'eyJ' + 'U'.repeat(35) + '.eyJ' + 'V'.repeat(35) + '.userSignature321';
assert.equal(isOpaqueSupabaseApiKey(anon), true);
assert.equal(isOpaqueSupabaseApiKey(service), true);
assert.equal(isOpaqueSupabaseApiKey(legacy), false);
assert.equal(isOpaqueSupabaseApiKey('sb_secret_short'), false);
for (const key of [anon, service]) {
  const h = supabaseApiKeyHeaders(key);
  assert.deepEqual(h, { apikey: key }, 'opaque keys must never be sent as Bearer JWT');
  assert.equal(Object.hasOwn(h, 'Authorization'), false);
}
assert.deepEqual(supabaseApiKeyHeaders(legacy), { apikey: legacy, Authorization: `Bearer ${legacy}` });
assert.deepEqual(supabaseApiKeyHeaders(anon, { accessToken: jwt }), { apikey: anon, Authorization: `Bearer ${jwt}` });
assert.deepEqual(supabaseApiKeyHeaders(legacy, { accessToken: jwt }), { apikey: legacy, Authorization: `Bearer ${jwt}` });
assert.deepEqual(supabaseApiKeyHeaders(service, { headers: { Prefer: 'count=exact' } }), { apikey: service, Prefer: 'count=exact' });
assert.notEqual(supabaseApiKeyHeaders(anon, { accessToken: jwt }).Authorization, `Bearer ${anon}`);

const previous = {
  fetch: globalThis.fetch,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
};
try {
  const calls = [];
  process.env.SUPABASE_URL = 'https://abcdefghijabcdefghij.supabase.co';
  process.env.SUPABASE_ANON_KEY = anon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = service;
  globalThis.fetch = async (url, init) => {
    calls.push({ path: String(url).split('/rest/v1/')[1], method: init.method, headers: init.headers });
    return new Response('[]', { status: 200, headers: { 'content-range': '*/0' } });
  };
  const { adminSupabaseRequest, publicSupabaseRequest, userSupabaseRequest, adminSupabaseCount } = await import('../lib/supabase.mjs');
  await adminSupabaseRequest('fin_settings?select=key');
  await publicSupabaseRequest('fin_rfqs?select=id');
  await userSupabaseRequest(jwt, 'fin_organizations?select=id');
  await adminSupabaseCount('fin_job_runs');
  assert.equal(calls.length, 4);
  assert.equal(calls[0].headers.apikey, service);
  assert.equal(Object.hasOwn(calls[0].headers, 'Authorization'), false);
  assert.equal(calls[1].headers.apikey, anon);
  assert.equal(Object.hasOwn(calls[1].headers, 'Authorization'), false);
  assert.equal(calls[2].headers.apikey, anon);
  assert.equal(calls[2].headers.Authorization, `Bearer ${jwt}`);
  assert.equal(calls[3].method, 'HEAD');
  assert.equal(calls[3].headers.apikey, service);
  assert.equal(Object.hasOwn(calls[3].headers, 'Authorization'), false);
  process.env.SUPABASE_ANON_KEY = legacy;
  process.env.SUPABASE_SERVICE_ROLE_KEY = legacy;
  await adminSupabaseRequest('fin_job_runs?select=id');
  assert.equal(calls[4].headers.Authorization, `Bearer ${legacy}`);
} finally {
  globalThis.fetch = previous.fetch;
  for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
}
console.log('Supabase HTTP runtime: admin/public/user/count calls keep API keys and user JWT in distinct headers.');

console.log('Supabase API headers: modern key-only, legacy JWT Bearer, user JWT Bearer, no accidental opaque Authorization.');

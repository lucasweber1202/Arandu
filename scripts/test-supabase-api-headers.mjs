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
console.log('Supabase API headers: modern key-only, legacy JWT Bearer, user JWT Bearer, no accidental opaque Authorization.');

import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';
const org = '00000000-0000-4000-8000-000000000021';
process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_ANON_KEY = 'anon'; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let calls = [], denied = false;
globalThis.fetch = async (url, options) => {
  calls.push({ url: String(url), options });
  if (String(url).includes('fin_organizations?')) return Response.json([{ id: org, kind: 'PROVIDER' }]);
  if (denied) return Response.json({ message: 'invalid invitation' }, { status: 400 });
  return Response.json({ invite_id: org, status: 'declined', replayed: false });
};
async function call(body) {
  const req = Object.assign(Readable.from([JSON.stringify(body)]), { method: 'POST', url: '/api/finance/invites/decline', headers: {} });
  const res = { setHeader() {}, end(v) { this.body = JSON.parse(v); } };
  await handleFinance(req, res, 'invites/decline', { requireUser: async () => ({ user: { id: org }, accessToken: 'provider-jwt' }), enforceRateLimit: async () => {} });
  return res.body;
}
const body = { provider_organization_id: org, token: 'a'.repeat(64), expected_status: 'invited', confirmed: true, reason: 'capacity' };
assert.equal((await call(body)).status, 'declined');
assert.equal(JSON.parse(calls.at(-1).options.body).p_provider_org, org);
assert.ok(calls.every(c => c.options.headers.Authorization === 'Bearer provider-jwt'));
assert.equal(calls.some(c => c.url.includes('fin_accept_provider_invite')), false);
for (const change of [{ confirmed: false }, { expected_status: 'accepted' }, { token: 'bad' }, { reason: 'competitor_price' }, { buyer_id: org }]) {
  calls = [];
  await assert.rejects(() => call({ ...body, ...change }), e => e.status === 400);
  assert.equal(calls.length, 0);
}
denied = true;
await assert.rejects(() => call(body), e => e.status === 409 && e.code === 'invite_invalid' && !/fin_|@/.test(e.message));
console.log('Institutional API: confirmation, identity, JWT and generic rejection PASS (HTTP mocks)');

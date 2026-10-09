import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';

process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon';
const ACTOR = '00000000-0000-4000-8000-000000000001';
const ORG = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const RFQ = '00000000-0000-4000-8000-000000000004';
const PROPOSAL = '00000000-0000-4000-8000-000000000005';
const DECISION = '00000000-0000-4000-8000-000000000006';
const events = [];
let timeline = [];
let denied = false;
let failRpc = false;
let failedAnalytics = false;
const organization = [{ id: ORG, kind: 'BUYER', legal_name: 'private name' }];
let proposalRows = [{ id: PROPOSAL, rfq_id: RFQ, provider_id: OTHER, provider_organization_id: OTHER,
  product: 'credit', status: 'submitted', current_version: 2 }];
let versionRows = [{ proposal_id: PROPOSAL, version: 2, terms: { interest_spread_year: 4.5 }, note: 'private note' },
  { proposal_id: PROPOSAL, version: 1, terms: { interest_spread_year: 5.5 } }];
globalThis.fetch = async (url, options = {}) => {
  const path = new URL(url).pathname;
  let value = [];
  if (path.includes('/rpc/')) {
    timeline.push('rpc');
    if (failRpc) return new Response(JSON.stringify({ message: 'forbidden' }), { status: 403 });
    if (path.endsWith('fin_create_organization')) value = ORG;
    else if (path.endsWith('fin_record_decision')) value = DECISION;
    else if (path.endsWith('fin_submit_proposal')) value = 2;
    else value = RFQ;
  } else if (path.endsWith('/fin_organizations')) value = denied ? [] : organization;
  else if (path.endsWith('/fin_rfqs')) value = [{ id: RFQ, organization_id: ORG, product: 'credit', status: 'published', demand: { amount: 500000 }, title: 'private title' }];
  else if (path.endsWith('/fin_proposals')) value = proposalRows;
  else if (path.endsWith('/fin_proposal_versions')) value = versionRows;
  else if (path.endsWith('/fin_providers')) value = [{ id: OTHER, name: 'private provider' }];
  return new Response(JSON.stringify(value), { status: 200 });
};
const deps = { requireUser: async () => ({ user: { id: ACTOR, email: 'private@example.com' }, accessToken: 'private-jwt', headers: {} }),
  enforceRateLimit: async () => {}, productAnalytics: (event) => { timeline.push('analytics'); if (failedAnalytics) throw new Error('unavailable'); events.push(event); } };
async function call(path, body, method = 'POST') {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), { method, url: `/api/finance/${path}`, headers: {} });
  const res = { setHeader() {}, end(value) { this.payload = JSON.parse(value); timeline.push('response'); } };
  await handleFinance(req, res, path, deps);
  return res;
}
const demand = { organization_id: ORG, product: 'credit', title: 'Private financial demand',
  demand: { amount: 500000, purpose: 'capital_de_giro', term_months: 24 }, email: 'private@example.com', token: 'private-token' };
await call('organizations', { kind: 'BUYER', legal_name: 'Private company' });
assert.equal(events.at(-1).event, 'organization_created');
assert.equal(events.at(-1).organizationId, ORG);
assert.deepEqual(timeline, ['rpc', 'analytics', 'response']);
timeline = [];
await call('rfqs', demand);
assert.equal(events.at(-1).event, 'rfq_created');
assert.equal(events.at(-1).organizationId, ORG);
assert.deepEqual(events.at(-1).properties, { product: 'credit' });
assert.deepEqual(timeline, ['rpc', 'analytics', 'response']);
let count = events.length;
denied = true;
await assert.rejects(call('rfqs', { ...demand, organization_id: OTHER }), (e) => e.status === 403);
assert.equal(events.length, count, 'foreign tenant emits no event'); denied = false;
failRpc = true;
await assert.rejects(call('rfqs', demand));
assert.equal(events.length, count, 'failed persistence never reports success'); failRpc = false;
failedAnalytics = true;
const succeeded = await call('rfqs', demand);
assert.equal(succeeded.statusCode, 201);
assert.equal(succeeded.payload.id, RFQ); failedAnalytics = false;
await call('proposals', { proposal_id: PROPOSAL, terms: { institution: 'Private institution', product_name: 'Private credit', offered_amount: 500000, term_months: 24, interest_rate_month: 1.9 }, note: 'private note' });
assert.equal(events.at(-1).event, 'proposal_submitted');
assert.equal(events.at(-1).organizationId, OTHER, 'provider scope comes from RLS-visible row');
assert.equal(events.at(-1).operationVersion, 2);
await call('decisions', { rfq_id: RFQ, proposal_id: PROPOSAL, rationale: 'Private rationale' });
assert.equal(events.at(-1).event, 'decision_recorded');
assert.equal(events.at(-1).operationId, DECISION);
const comparison = await call('comparison', { rfq_id: RFQ });
assert.equal(events.at(-1).event, 'proposal_comparison_generated');
assert.equal(comparison.payload.ok, true);
const detail = await call(`rfq/${RFQ}`, {}, 'GET');
assert.equal(detail.payload.proposals[0].versions_count, 2);
assert.equal(detail.payload.proposals[0].terms.interest_spread_year, 4.5);
for (const forbidden of ['private-jwt', 'private@example.com', 'private-token', 'Private financial demand', 'private note', 'Private rationale', '500000']) {
  assert.ok(!JSON.stringify(events).includes(forbidden), forbidden);
}
count = events.length; denied = true;
await assert.rejects(call('comparison', { rfq_id: RFQ }), (e) => e.status === 403);
assert.equal(events.length, count); denied = false;
// Verify the indexed join at realistic bounded batch size, including historical
// version counts and withdrawn proposals. No extra database round trips.
proposalRows = Array.from({ length: 500 }, (_, i) => ({ ...proposalRows[0], id: `00000000-0000-4000-8000-${String(i + 100).padStart(12, '0')}` }));
versionRows = proposalRows.flatMap((p) => Array.from({ length: 4 }, (_, i) => ({ proposal_id: p.id, version: i + 1, terms: { interest_spread_year: i + 1 } })));
const bulk = await call(`rfq/${RFQ}`, {}, 'GET');
assert.equal(bulk.payload.proposals.length, 500);
assert.ok(bulk.payload.proposals.every((p) => p.versions_count === 4 && p.terms.interest_spread_year === 2));
console.log('Analytics API: confirmed writes only, denied/failed operations, trusted tenant, failure isolation, payload minimization and 500-proposal indexed join passed.');

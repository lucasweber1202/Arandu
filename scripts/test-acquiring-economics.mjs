import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { compareAcquiringEconomics, validateAcquiringProfile } from '../lib/finance/acquiring-economics.mjs';
import { handleFinance } from '../lib/api/domains/finance.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1), cid = id(2), pid = id(3), rid = id(4);
const profile = { period_start: '2026-11-01', period_end: '2026-11-30', currency: 'BRL', monthly_volume: 100000, share_debit: 40, share_credit_cash: 30, share_credit_installment: 20, share_pix: 10, terminals: 2, source_reference: 'Relatório sintético novembro' };
const terms = { currency: 'BRL', mdr_debit_pct: 1, mdr_credit_pct: 2, mdr_installment_pct: 3, pix_pct: 0.5, fees: [{ service: 'Aluguel e gateway', unit: 'per_month', amount: 100 }], settlement_days: 2, anticipation_pct_month: 1.5 };
const offer = { mdr_debit: 1, mdr_credit_cash: 2, mdr_credit_installment: 3, pix_fee: 0.5, gateway_cost: 20, terminal_rent: 40, settlement_days: 30, anticipation_rate: 1, valid_until: '2026-12-31' };
const input = { contract: { id: cid, currency: 'BRL', starts_on: '2026-01-01', ends_on: '2027-12-31' }, versions: [{ version: 1, effective_from: '2026-01-01', source: 'declared', terms }], proposal: { id: pid, rfq_id: rid }, proposalVersion: { version: 2, terms: offer }, profile };
const compare = change => compareAcquiringEconomics({ ...structuredClone(input), ...change });
const result = compare();
assert.deepEqual(result.totals, { currency: 'BRL', unit: 'period_total', contract_cost: 1750, proposal_cost: 1750, estimated_difference: 0 });
assert.deepEqual(result, compare(), 'same persisted inputs yield identical output');
assert.equal(result.sources.contract.version, 1);
assert.equal(result.sources.proposal.version, 2);
assert.equal(compare({ profile: { ...profile, share_debit: 10, share_pix: 40 } }).totals.contract_cost, 1600, 'mix changes weighted costs');
for (const key of ['monthly_volume', 'share_pix', 'source_reference', 'terminals']) {
  const p = { ...profile }; delete p[key];
  assert.equal(compare({ profile: p }).valid, false, `missing ${key}`);
}
for (const value of [null, '', false, [], NaN, Infinity, -1]) assert.ok(validateAcquiringProfile({ ...profile, monthly_volume: value }).length);
assert.equal(compare({ profile: { ...profile, monthly_volume: 0, terminals: 0 }, proposalVersion: { version: 2, terms: { ...offer, gateway_cost: 0 } }, versions: [{ ...input.versions[0], terms: { ...terms, fees: [{ service: 'Tarifa mensal', unit: 'per_month', amount: 0 }] } }] }).totals.contract_cost, 0, 'explicit zero is a real value');
for (const p of [{ ...profile, currency: 'USD' }, { ...profile, period_end: '2026-12-31' }, { ...profile, period_start: '2026-02-30' }, { ...profile, share_pix: 9 }]) assert.equal(compare({ profile: p }).valid, false);
const missing = { ...offer }; delete missing.mdr_debit;
const partial = compare({ proposalVersion: { version: 2, terms: missing } });
assert.equal(partial.components[0].comparable, false);
assert.equal(partial.components[1].comparable, true, 'comparability is per component');
assert.equal(partial.totals.estimated_difference, null);
assert.equal(compare({ versions: [{ ...input.versions[0], terms: { ...terms, currency: 'USD' } }] }).comparable, false);
assert.equal(compare({ proposalVersion: { version: 2, terms: { ...offer, gateway_cost: 2000 } } }).totals.estimated_difference, -1980, 'negative result remains negative');
for (const fees of [undefined, [{ service: 'TED', unit: 'per_transaction', amount: 1 }], [{ unit: 'per_month', amount: 10 }]]) {
  const c = compare({ versions: [{ ...input.versions[0], terms: { ...terms, fees } }] });
  assert.equal(c.components.at(-1).comparable, false);
  assert.equal(c.totals.contract_cost, null);
}
const versions = [...input.versions, { version: 2, effective_from: '2026-12-01', terms: { ...terms, mdr_debit_pct: 2 } }];
assert.equal(compare({ versions }).sources.contract.version, 1, 'future version does not rewrite original');
assert.equal(compare({ versions, profile: { ...profile, period_start: '2026-12-01', period_end: '2026-12-31' } }).sources.contract.version, 2);
assert.ok(compare({ versions: [...input.versions, { ...versions[1], effective_from: '2026-11-15' }] }).reasons.includes('contract_changed_in_period'));
const noCurrency = { ...terms }; delete noCurrency.currency;
assert.equal(compare({ versions: [{ ...input.versions[0], terms: noCurrency }] }).comparable, false, 'immutable version must declare currency; mutable contract header is insufficient');
assert.equal(compare({ proposalVersion: { version: 2, terms: { ...offer, extra_services: 'Additional service without price reference' } } }).totals.contract_cost, null);
assert.ok(result.limitations.includes('anticipation_not_modeled'));
assert.equal('savings' in result, false);

process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_ANON_KEY = 'anon'; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let calls = [], invisible = false, wrongEntity = false;
globalThis.fetch = async (url, options) => {
  const path = String(url); calls.push({ path, options });
  let rows = [];
  if (path.includes('fin_organizations?')) rows = [{ id: org, kind: 'BUYER' }];
  if (path.includes('fin_contracts?') && !invisible) rows = [{ ...input.contract, product: 'acquiring', organization_id: org, legal_entity_id: null }];
  if (path.includes('fin_proposals?')) rows = [{ ...input.proposal, product: 'acquiring' }];
  if (path.includes('fin_rfqs?')) rows = [{ id: rid, legal_entity_id: wrongEntity ? id(7) : null }];
  if (path.includes('fin_contract_versions?')) rows = input.versions;
  if (path.includes('fin_proposal_versions?')) rows = [input.proposalVersion];
  return Response.json(rows);
};
async function call(body, requireUser = async () => ({ user: { id: id(8) }, accessToken: 'actor-jwt' })) {
  const req = Object.assign(Readable.from([JSON.stringify(body)]), { method: 'POST', url: '/api/finance/acquiring-economics', headers: {} });
  const res = { setHeader() {}, end(v) { this.body = JSON.parse(v); } };
  await handleFinance(req, res, 'acquiring-economics', { requireUser, enforceRateLimit: async () => {} });
  return res.body;
}
const body = { organization_id: org, contract_id: cid, proposal_id: pid, proposal_version: 2, profile };
assert.equal((await call(body)).analysis.totals.contract_cost, 1750);
assert.ok(calls.every(c => c.options.headers.Authorization === 'Bearer actor-jwt'));
assert.ok(calls.every(c => !c.options.method || c.options.method === 'GET'), 'analysis never persists value or decision');
calls = []; invisible = true;
await assert.rejects(() => call(body), e => e.status === 404);
assert.equal(calls.some(c => c.path.includes('fin_proposals?')), false, 'denied root stops traversal');
invisible = false; wrongEntity = true;
await assert.rejects(() => call(body), e => e.status === 404);
calls = [];
await assert.rejects(() => call({ ...body, profile: { ...profile, monthly_volume: null } }), e => e.status === 400);
assert.equal(calls.length, 0);
await assert.rejects(() => call(body, async () => { throw Object.assign(new Error('session required'), { status: 401 }); }), e => e.status === 401);
console.log('Acquiring economics: deterministic calculations, incomparability, versions and JWT API PASS');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { validateFeeSchedule, validateFeeVersion, validateFeeObservation, validateFeeReview, feeFilters, REVIEW_TRANSITIONS, MODEL_UNITS, OBSERVATION_SOURCES, feeCoverage } from '../lib/finance/fee-intelligence.mjs';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { graphHref } from '../lib/finance/graph.mjs';
import { DATA_REGISTRY } from '../lib/finance/data-governance.mjs';
import { presentFeePage, presentFeeDetail, parseTiers, providerLines } from '../lib/finance/fee-presenter.mjs';

const ORG = '00000000-0000-4000-8000-0000000000a1';
const ID = '00000000-0000-4000-8000-0000000000b1';
const schedule = { service: 'TED', category: 'transfers', charging_unit: 'per_transaction', pricing_model: 'per_unit', currency: 'BRL', rate: 5, source: 'contract_terms', source_reference: 'CONTRACT-ANNEX-1' };
assert.equal(validateFeeSchedule(schedule), null);
for (const patch of [{ charging_unit: 'per_month' }, { pricing_model: 'percentage', charging_unit: 'percent_of_volume', rate: 150 }, { pricing_model: 'basis_points', charging_unit: 'percent_of_amount', rate: 10001 },
  { currency: 'ZZZ' }, { rate: NaN }, { rate: -1 }, { rate: Infinity }, { source: 'guess' }, { source_reference: '' }, { service: '<b>' }, { minimum_amount: 10, maximum_amount: 5 }, { tiers: [{ up_to: null, rate: 1 }] },
  { pricing_model: 'tiered_per_unit', rate: null, tiers: [{ up_to: 100, rate: 2 }, { up_to: 50, rate: 1 }, { up_to: null, rate: 1 }] }, { pricing_model: 'tiered_per_unit', rate: null, tiers: [{ up_to: 100, rate: 2 }, { up_to: 200, rate: 1 }] }]) {
  assert.ok(validateFeeSchedule({ ...schedule, ...patch }), JSON.stringify(patch));
}
assert.equal(validateFeeVersion('per_item', { ...schedule, pricing_model: 'tiered_per_unit', rate: null, tiers: [{ up_to: 100, rate: 2 }, { up_to: null, rate: 1 }], minimum_amount: 50 }), null);
for (const [model, units] of Object.entries(MODEL_UNITS)) for (const unit of units) assert.equal(validateFeeVersion(unit, { ...schedule, pricing_model: model, ...(model === 'tiered_per_unit' ? { rate: null, tiers: [{ up_to: 1, rate: 1 }, { up_to: null, rate: 1 }] } : {}) }), null, `${model}/${unit}`);

const observation = { service: 'TED', charging_unit: 'per_transaction', currency: 'BRL', period_start: '2025-03-01', period_end: '2025-03-31', volume: 100, observed_amount: 520, source_type: 'bank_statement', source_reference: 'STATEMENT-03', evidence_reference: 'EVIDENCE-03' };
assert.equal(validateFeeObservation(observation, '2026-01-01'), null);
for (const patch of [{ observed_amount: 10.001 }, { observed_amount: -1 }, { observed_amount: NaN }, { currency: 'ZZZ' }, { period_end: '2025-02-30' }, { period_start: '2025-04-01' }, { period_end: '2026-06-01' },
  { period_start: '2024-01-01', period_end: '2025-03-31' }, { source_type: 'api' }, { source_type: 'confirmed_document_extraction' }, { evidence_reference: '' }, { volume: -2 }]) {
  assert.ok(validateFeeObservation({ ...observation, ...patch }, '2026-01-01'), JSON.stringify(patch));
}
// Nenhuma origem aceita alega integração automática inexistente.
assert.ok(!('api' in OBSERVATION_SOURCES) && !('confirmed_document_extraction' in OBSERVATION_SOURCES));

assert.equal(validateFeeReview('new', { to_status: 'under_review', reason_code: 'review_started', notes: 'Starting review' }), null);
assert.ok(validateFeeReview('new', { to_status: 'confirmed', reason_code: 'contract_terms_confirmed', notes: 'skip', evidence_reference: 'EV-1' }));
assert.ok(validateFeeReview('under_review', { to_status: 'confirmed', reason_code: 'contract_terms_confirmed', notes: 'no evidence' }));
assert.ok(validateFeeReview('confirmed', { to_status: 'resolved', reason_code: 'credit_received', notes: 'missing resolution', evidence_reference: 'EV-2' }));
assert.equal(validateFeeReview('confirmed', { to_status: 'resolved', reason_code: 'credit_received', notes: 'credit posted', evidence_reference: 'EV-2', resolution: 'Credited next statement' }), null);
for (const terminal of ['resolved', 'dismissed', 'not_required']) assert.equal(REVIEW_TRANSITIONS[terminal], undefined);
assert.throws(() => feeFilters(new URLSearchParams('start=2019-01-01&end=2026-01-01')));
assert.throws(() => feeFilters(new URLSearchParams('limit=51')));
assert.throws(() => feeFilters(new URLSearchParams('review_status=fraud')));
assert.deepEqual(feeCoverage({ schedules: 40, schedules_observed: 32, observations: 50, verified: 39 }), { schedules: '32/40 tarifas contratadas com observação comparável', verified: '39/50 observações verificadas' });

// Links do Graph só para IDs válidos.
assert.equal(graphHref({ object_type: 'fee_variance', object_id: ID }), `/finance/fees.html?id=${ID}`);
assert.equal(graphHref({ object_type: 'fee_variance', object_id: 'javascript:alert(1)' }), null);
assert.equal(graphHref({ object_type: 'fee_review', object_id: ID, facts: { variance_id: ID } }), `/finance/fees.html?id=${ID}`);
assert.equal(graphHref({ object_type: 'fee_review', object_id: ID, facts: { variance_id: 'x' } }), null);
for (const table of ['fin_fee_schedules', 'fin_fee_schedule_versions', 'fin_fee_observations', 'fin_fee_variances', 'fin_fee_reviews']) {
  assert.ok(DATA_REGISTRY[table]?.contains_financial_data && DATA_REGISTRY[table].export_dataset && DATA_REGISTRY[table].legal_hold_applicable, table);
}

// Linguagem segura: nada de acusação automática na interface nem no domínio.
for (const file of ['finance/src/views/fees.js', 'finance/src/views/ledger.js', 'lib/finance/fee-intelligence.mjs', 'lib/finance/fee-presenter.mjs', 'lib/api/domains/finance-fees.mjs']) {
  const source = readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(source, /cobran[çc]a indevida|erro do banco|fraude|overcharge|bank error|wrong charge|breach|economia gerada|savings/i, file);
}

process.env.SUPABASE_URL = 'https://fixture.example.invalid';
process.env.SUPABASE_ANON_KEY = 'fixture-public';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let sent = [];
let invisible = false;
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url);
  sent.push({ url: u.pathname, search: u.search, headers: options.headers, payload: options.body ? JSON.parse(options.body) : null });
  if (u.pathname.endsWith('/fin_organizations')) return new Response(JSON.stringify([{ id: ORG, kind: 'BUYER' }]));
  if (u.pathname.endsWith('/fin_list_fee_variances')) return new Response(JSON.stringify([{ id: ID }, { id: ORG }]));
  if (u.pathname.endsWith('/fin_fee_summary')) return new Response(JSON.stringify([{ currency: 'BRL', observations: 2 }]));
  if (u.pathname.endsWith('/fin_fee_schedules')) return new Response(JSON.stringify([{ id: ID, charging_unit: 'per_transaction', service: 'TED', category: 'transfers', current_version: 1, versions: [] }]));
  if (u.pathname.endsWith('/fin_contracts')) return new Response(JSON.stringify([{ id: ID, title: 'Contrato' }]));
  if (u.pathname.endsWith('/fin_fee_variances')) return new Response(JSON.stringify(invisible ? [] : [{ id: ID, observation_id: ID, schedule_id: null }]));
  if (u.pathname.endsWith('/fin_record_fee_observation')) return new Response(JSON.stringify({ message: 'fee observation conflict' }), { status: 400 });
  if (u.pathname.includes('/rpc/fin_')) return new Response(JSON.stringify(ID));
  return new Response('[]');
};
const deps = { requireUser: async () => ({ user: { id: ORG }, accessToken: 'caller-jwt', headers: {} }), enforceRateLimit: async () => {} };
async function call(method, path, body = null) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), { method, url: `/api/finance/${path}`, headers: {} });
  const res = { setHeader() {}, end(raw) { this.payload = JSON.parse(raw); } };
  await handleFinance(req, res, path.split('?')[0], deps);
  return res.payload;
}
let data = await call('GET', `fees?organization_id=${ORG}&start=2025-01-01&end=2025-12-31&category=transfers&review_status=new&limit=1`);
assert.equal(data.rows.length, 1); assert.equal(data.next, ID); assert.ok(data.cards.length && data.forms.length && data.options.category.length);
const list = sent.find((s) => s.url.endsWith('fin_list_fee_variances')).payload;
assert.equal(list.p_limit, 1); assert.equal(list.p_category, 'transfers'); assert.equal(list.p_review, 'new');
assert.equal(sent.find((s) => s.url.endsWith('fin_fee_summary')).payload.p_category, 'transfers', 'list and summary share filters');
for (const s of sent) assert.equal(s.headers.Authorization, 'Bearer caller-jwt', 'no service role fallback');
sent = [];
await assert.rejects(() => call('POST', 'fees/observe', { organization_id: ORG, contract_id: ID, ...observation, source_type: 'api' }), (e) => e.status === 400);
await assert.rejects(() => call('POST', 'fees/schedules', { organization_id: ORG, contract_id: ID, ...schedule, rate: -1 }), (e) => e.status === 400);
await assert.rejects(() => call('POST', 'fees/review', { variance_id: ID, expected_status: 'new', to_status: 'resolved', reason_code: 'other', notes: 'skip' }), (e) => e.status === 400);
await assert.rejects(() => call('POST', 'fees/version', { schedule: `${ID}|1`, ...schedule }), (e) => e.status === 400, 'version without reason');
await assert.rejects(() => call('POST', 'fees/version', { schedule: `${ID}|x`, ...schedule, reason: 'New contract version' }), (e) => e.status === 400, 'version without expected');
assert.ok(!sent.some((s) => s.url.includes('/rpc/')), 'invalid input reached a write RPC');
data = await call('POST', 'fees/version', { schedule: `${ID}|1`, ...schedule, pricing_model: 'tiered_per_unit', charging_unit: undefined, rate: null, tiers: '100:2; :1', reason: 'Amendment tiers' });
const versioned = sent.find((s) => s.url.endsWith('fin_version_fee_schedule')).payload;
assert.equal(versioned.p_expected, 1); assert.deepEqual(versioned.p_input.tiers, [{ up_to: 100, rate: 2 }, { up_to: null, rate: 1 }]); assert.ok(!('rate' in versioned.p_input) && !('schedule' in versioned.p_input));
data = await call('POST', 'fees/schedules', { organization_id: ORG, contract_id: ID, ...schedule });
assert.equal(data.id, ID);
const created = sent.find((s) => s.url.endsWith('fin_create_fee_schedule')).payload;
assert.equal(created.p_contract, ID); assert.ok(!('organization_id' in created.p_input) && !('contract_id' in created.p_input));
await assert.rejects(() => call('POST', 'fees/observe', { organization_id: ORG, contract_id: ID, ...observation }), (e) => e.status === 409 && e.code === 'fee_observation_conflict');
invisible = true;
await assert.rejects(() => call('GET', `fees/detail?id=${ID}`), (e) => e.status === 404);
await assert.rejects(() => call('GET', 'fees/detail?id=forged'), (e) => e.status === 400);
await assert.rejects(() => call('GET', `fees?organization_id=${ORG}&limit=500`), (e) => e.status === 400);
// Apresentação composta no servidor: linguagem segura e sem número forçado.
const page = presentFeePage({ rows: [{ id: ID, service: 'TED', period_start: '2025-03-01', period_end: '2025-03-31', currency: 'BRL', comparison_status: 'not_comparable', reasons: ['currency_mismatch'], contracted_amount: null, observed_amount: 520, variance_amount: null, review_status: 'new' }],
  summary: [{ currency: 'BRL', contracted_total: 500, observed_total: 520, above: 1, below: 0, equal: 0, above_total: 20, below_total: null, not_comparable: 1, missing_reference: 0, open_review: 1, under_review: 0, closed_review: 0, schedules: 2, schedules_observed: 1, verified: 0, observations: 2 }], next: null, schedules: [], contracts: [] });
assert.equal(page.rows[0].cells[4], '—'); assert.match(page.rows[0].cells[5], /Não comparável: Moeda diferente/); assert.match(page.cards[0].note, /1\/2 tarifas contratadas/);
assert.equal(page.cards[1].actions.length, 0, 'no version form without schedules');
const det = presentFeeDetail({ variance: { id: ID, contract_id: ID, service: 'TED', currency: 'BRL', comparison_status: 'comparable', direction: 'above', reasons: [], contracted_amount: 500, observed_amount: 520, variance_amount: 20, review_status: 'new', methodology: { version: 1, formula: 'observed_amount - contracted_reference' }, reference_snapshot: null, period_start: '2025-03-01', period_end: '2025-03-31' }, observation: { id: ID, verification_status: 'unverified', source_type: 'bank_statement' } });
assert.deepEqual(det.actions.map((a) => a.fixed.to_status || 'verify'), ['under_review', 'dismissed', 'verify']);
assert.match(det.lines[0], /Acima da referência contratada · Revisão necessária/);
const notComparable = presentFeeDetail({ variance: { ...det, id: ID, contract_id: ID, service: 'TED', currency: 'BRL', comparison_status: 'not_comparable', reasons: ['missing_volume'], review_status: 'under_review', methodology: {} }, observation: {} });
assert.ok(!notComparable.actions.some((a) => a.fixed.to_status === 'confirmed'), 'not comparable cannot be confirmed');
assert.deepEqual(parseTiers('100:2; :1'), [{ up_to: 100, rate: 2 }, { up_to: null, rate: 1 }]);
assert.match(providerLines([])[0], /Sem tarifas/);
for (const text of JSON.stringify([page, det]).match(/"[^"]{12,}"/g)) assert.doesNotMatch(text, /indevid|erro do banco|fraude|overcharge|economia/i, text);
console.log('Fee intelligence: contracted shapes, observed provenance, no fake integrations, review transitions, bounded filters, JWT-only API, safe links and safe language passed.');

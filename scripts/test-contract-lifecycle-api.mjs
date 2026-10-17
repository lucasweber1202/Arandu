import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { presentImplementationDetail } from '../lib/finance/implementation-presenter.mjs';

// Transport contract tests. PostgreSQL tests separately exercise actual RLS.
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const [ORG, OTHER, ENTITY, ENTITY_B, PROVIDER, C1, C2, HIDDEN, ACTOR, DECISION] = Array.from({ length: 10 }, (_, i) => id(i + 1));
const plans = Array.from({ length: 28 }, (_, i) => ({ id: id(100 + i), organization_id: ORG, legal_entity_id: ENTITY, provider_id: PROVIDER, contract_id: C1, owner_id: ACTOR, title: `Plano ${i}`, status: 'planned', target_go_live: '2026-10-29' }));
plans.push({ ...plans[0], id: id(200), contract_id: C2, legal_entity_id: ENTITY_B, title: 'Outro contrato, mesma instituição' });
const periods = plans.map((p, i) => ({ ...p, id: id(300 + i), obligation_id: id(400 + i), period_start: '2026-10-01', period_end: '2026-10-31', due_on: '2026-11-01', kind: 'reporting_covenant', facts: { status: 'not_due', has_data: false } }));
const previousFetch = globalThis.fetch;
const originalEnv = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].map(k => [k, process.env[k]]));
process.env.SUPABASE_URL = 'https://lifecycle.example.invalid';
process.env.SUPABASE_ANON_KEY = 'lifecycle-fixture-public';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let sent = [], actor = 'buyer', visibleContract = true;
const eq = (q, key) => q.get(key)?.replace(/^eq\./, '');
globalThis.fetch = async (url, options = {}) => {
  const u = new URL(url), table = u.pathname.split('/').pop(), q = u.searchParams;
  sent.push({ table, q, options });
  let rows = [];
  if (actor === 'revoked') return new Response(JSON.stringify({ message: 'session_revoked' }), { status: 401 });
  if (table === 'fin_organizations') rows = eq(q, 'id') === ORG ? [{ id: ORG, kind: actor === 'provider' ? 'PROVIDER' : 'BUYER' }] : [];
  if (table === 'fin_implementation_plans' || table === 'fin_obligation_monitor') {
    rows = actor === 'buyer' ? (table === 'fin_implementation_plans' ? plans : periods) : [];
    for (const key of ['id', 'organization_id', 'contract_id', 'legal_entity_id', 'provider_id', 'obligation_id']) if (q.has(key)) rows = rows.filter(r => r[key] === eq(q, key));
    rows = rows.slice(Number(q.get('offset') || 0), Number(q.get('offset') || 0) + Number(q.get('limit') || 500));
  }
  if (table === 'fin_contracts' && visibleContract) rows = [{ id: C1, organization_id: ORG, title: 'Crédito Atlas', status: 'terminated' }];
  if (table === 'fin_decisions') rows = [{ id: DECISION, organization_id: ORG, decided_at: '2026-10-01T23:30:00Z' }];
  if (table === 'fin_providers') rows = [{ id: PROVIDER, name: 'Banco Atlas' }];
  if (table === 'fin_legal_entities') rows = [{ id: ENTITY, legal_name: 'Atlas Operações' }];
  if (table === 'fin_members') rows = [{ user_id: ACTOR, display_name: 'Gestora sintética', role: 'finance_manager' }];
  return new Response(JSON.stringify(rows), { status: 200 });
};
const deps = { requireUser: async () => ({ user: { id: ACTOR }, accessToken: 'lifecycle-user-jwt', headers: {} }), enforceRateLimit: async () => {} };
async function call(path) {
  sent = [];
  const req = Object.assign(Readable.from([]), { method: 'GET', url: `/api/finance/${path}`, headers: {} });
  const res = { setHeader() {}, end(raw) { this.body = JSON.parse(raw); } };
  await handleFinance(req, res, path.split('?')[0], deps);
  assert(sent.every(s => s.options.headers.Authorization === 'Bearer lifecycle-user-jwt' && s.options.headers.apikey === 'lifecycle-fixture-public'));
  return res.body;
}
try {
  for (const [route, table] of [['implementations', 'fin_implementation_plans'], ['covenants', 'fin_obligation_monitor']]) {
    const first = await call(`${route}?organization_id=${ORG}&contract_id=${C1}`);
    const query = sent.find(s => s.table === table).q;
    assert.equal(query.get('contract_id'), `eq.${C1}`, `${route}: contract filter cannot be silently ignored`);
    assert.equal(first.rows.length, 25); assert.equal(first.next, '25');
    const second = await call(`${route}?organization_id=${ORG}&contract_id=${C1}&after=${first.next}`);
    assert.equal(second.rows.length, 3); assert.equal(second.next, null);
    assert.equal(new Set([...first.rows, ...second.rows].map(r => r.id)).size, 28);
    const other = await call(`${route}?organization_id=${ORG}&contract_id=${C2}&provider_id=${PROVIDER}&legal_entity_id=${ENTITY_B}`);
    assert.equal(other.rows.length, 1, 'same provider is not the same contract');
    assert.equal((await call(`${route}?organization_id=${ORG}&contract_id=${C1}&legal_entity_id=${ENTITY_B}`)).rows.length, 0);
    for (const contract of [HIDDEN, id(999)]) assert.deepEqual((await call(`${route}?organization_id=${ORG}&contract_id=${contract}`)).rows, []);
    for (const invalid of ['', 'invalid', `${C1}&contract_id=${C2}`]) await assert.rejects(() => call(`${route}?organization_id=${ORG}&contract_id=${invalid}`), e => e.status === 400);
    await assert.rejects(() => call(`${route}?organization_id=${OTHER}&contract_id=${C1}`), e => e.status === 403);
    await assert.rejects(() => call(`${route}?organization_id=${ORG}&contract_id=${C1}&after=5001`), e => e.status === 400);
    actor = 'restricted'; assert.deepEqual((await call(`${route}?organization_id=${ORG}&contract_id=${C1}`)).rows, []);
    actor = 'provider'; await assert.rejects(() => call(`${route}?organization_id=${ORG}&contract_id=${C1}`), e => e.status === 400);
    actor = 'revoked'; await assert.rejects(() => call(`${route}?organization_id=${ORG}&contract_id=${C1}`), e => e.status === 401);
    actor = 'buyer';
  }
  await assert.rejects(() => call(`covenants/summary?organization_id=${ORG}&contract_id=${C1}`), e => e.status === 400 && e.code === 'invalid_query');
  plans[0].decision_id = DECISION;
  const detail = await call(`implementations/detail?id=${plans[0].id}`);
  assert.match(JSON.stringify(detail.lines), /Crédito Atlas/);
  assert.match(JSON.stringify(detail.lines), /Banco Atlas/);
  for (const table of ['fin_contracts', 'fin_decisions', 'fin_providers', 'fin_legal_entities']) {
    const read = sent.find(s => s.table === table);
    assert.equal(read.q.get('organization_id'), `eq.${ORG}`);
    assert.ok(read.q.get('id')?.startsWith('eq.'), `${table} must be a bounded reference lookup`);
  }
  assert.equal(sent.find(s => s.table === 'fin_contracts').q.has('status'), false, 'closed contract provenance remains visible');
  visibleContract = false;
  assert.match(JSON.stringify((await call(`implementations/detail?id=${plans[0].id}`)).lines), /Contrato indisponível/);
  actor = 'restricted'; await assert.rejects(() => call(`implementations/detail?id=${plans[0].id}`), e => e.status === 404);
  assert.equal(sent.length, 1, 'hidden plan must not trigger reference enrichment');
  console.log('Lifecycle API: exact contract scopes, combined filters, 25-row pages, hidden/revoked/provider actors and bounded caller-JWT provenance passed.');
} finally {
  globalThis.fetch = previousFetch;
  for (const [key, value] of Object.entries(originalEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
}

const plan = { ...plans[0], starts_on: '2026-10-01', actual_go_live: null, updated_at: '2026-10-15T23:30:00Z', source_reference: C1, template_version: 'credit:v1', version: 1 };
const context = { plan, milestones: [], dependencies: [], issues: [], acceptances: [{ actual_go_live: '2026-10-15', accepted_by: ACTOR, accepted_at: '2026-10-15T23:30:00Z', evidence_reference: 'Aceite formal', value_record_id: id(500) }], members: [], today: '2026-10-16' };
const shown = x => JSON.stringify([x.lines, x.sections]);
const output = presentImplementationDetail({ ...context, contracts: [{ id: C1, title: 'Crédito Atlas' }], decisions: [{ id: DECISION, decided_at: '2026-10-01T23:30:00Z' }] });
assert.doesNotMatch(shown(output), /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
assert.doesNotMatch(shown(output), /T\d{2}:\d{2}/);
assert.match(shown(output), /Crédito Atlas/); assert.match(shown(output), /01\/10\/2026/);
assert.equal(output.origin.contract_id, C1); assert.equal(output.origin.decision_id, DECISION); assert.equal(output.origin.source_reference, C1);
assert.match(shown(presentImplementationDetail(context)), /Contrato indisponível/);
assert.match(shown(presentImplementationDetail({ ...context, contracts: [{ id: C2, title: 'Foreign title' }] })), /Contrato indisponível/);
assert.doesNotMatch(shown(presentImplementationDetail({ ...context, contracts: [{ id: C2, title: 'Foreign title' }] })), /Foreign title/);
assert.match(shown(presentImplementationDetail({ ...context, plan: { ...plan, decision_id: null, starts_on: '2026-02-30', updated_at: 'invalid' } })), /Não informado/);
console.log('Implementation provenance: authorized names, neutral missing references, valid dates and unchanged machine identifiers passed.');

assert.match(shown(presentImplementationDetail({ ...context, contracts: [{ id: C1, title: null }] })), /Contrato sem título/);
assert.match(shown(presentImplementationDetail({ ...context, plan: { ...plan, source_reference: null, template_version: 'unknown', decision_id: id(999) } })), /Decisão indisponível/);
assert.match(shown(presentImplementationDetail({ ...context, plan: { ...plan, source_reference: null, template_version: 'unknown' } })), /Template indisponível/);

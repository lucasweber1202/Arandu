import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { portfolioViews, latestBalances, relationshipMetrics, relationshipMap, PORTFOLIO_DEFINITIONS } from '../lib/finance/portfolio.mjs';

// Relationship & Portfolio: visões por moeda (sem somar moedas), saldo mais
// recente, ausência explícita, métricas factuais de relacionamento, mapa por
// entidade e fronteira da API.

process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const ORG = '00000000-0000-4000-8000-0000000000b1';
const PROVIDER = '00000000-0000-4000-8000-0000000000d1';
const OTHER_PROVIDER = '00000000-0000-4000-8000-0000000000d2';
const FACILITY = '00000000-0000-4000-8000-0000000000f1';
const ACTOR = '00000000-0000-4000-8000-0000000000a1';
const ENTITY = '00000000-0000-4000-8000-00000000e0a1';

// ---------------------------------------------------------------- domínio
{
  const facilities = [
    { id: 'f1', provider_id: 'p1', currency: 'BRL', status: 'active', approved_limit: 10000000, indexer: 'cdi', maturity_on: '2027-06-30', schedule_version: 1, verified_at: '2026-09-30', review_after_days: 90, name: 'Conta garantida' },
    { id: 'f2', provider_id: 'p2', currency: 'BRL', status: 'active', principal_amount: 5000000, indexer: 'pre', maturity_on: '2028-03-31', schedule_version: 0, verified_at: '2026-01-01', review_after_days: 90, name: 'CCB' },
    { id: 'f3', provider_id: 'p2', currency: 'USD', status: 'active', approved_limit: 2000000, indexer: 'sofr', maturity_on: '2026-12-31', schedule_version: 0, verified_at: '2026-09-30', review_after_days: 90, name: 'Trade' },
    { id: 'f4', provider_id: 'p1', currency: 'BRL', status: 'matured', approved_limit: 999, name: 'Antiga' }
  ];
  const balances = [
    { facility_id: 'f1', as_of: '2026-08-31', recorded_at: '2026-09-01T00:00:00Z', used_limit_amount: 2000000, outstanding_amount: 2000000 },
    { facility_id: 'f1', as_of: '2026-09-30', recorded_at: '2026-10-01T00:00:00Z', used_limit_amount: 6000000, outstanding_amount: 6000000 },
    { facility_id: 'f2', as_of: '2026-09-30', recorded_at: '2026-10-01T00:00:00Z', outstanding_amount: 4000000 }
  ];
  const repayments = [
    { facility_id: 'f1', schedule_version: 1, due_on: '2027-06-30', principal_amount: 6000000 },
    { facility_id: 'f1', schedule_version: 0, due_on: '2026-12-31', principal_amount: 999999 }
  ];
  assert.equal(latestBalances(balances).get('f1').as_of, '2026-09-30');
  const views = portfolioViews({ facilities, balances, repayments, providers: [{ id: 'p1', name: 'Banco Um' }, { id: 'p2', name: 'Banco Dois' }],
    guarantees: [{ currency: 'BRL', status: 'active', kind: 'receivables', committed_amount: 3000000 }, { currency: 'BRL', status: 'released', kind: 'aval', committed_amount: 1 }, { currency: 'BRL', status: 'active', kind: 'aval', committed_amount: null }],
    today: '2026-10-03', horizonMonths: 12 });
  const brl = views.currencies.find((row) => row.currency === 'BRL');
  const usd = views.currencies.find((row) => row.currency === 'USD');
  assert.equal(views.currencies.length, 2, 'uma visão por moeda');
  assert.equal(brl.facilities, 2, 'facility encerrada não entra');
  assert.equal(brl.approved_limit, 10000000);
  assert.equal(brl.used_limit, 6000000, 'só a fotografia mais recente');
  assert.equal(brl.available_limit, 4000000);
  assert.equal(brl.outstanding, 10000000);
  assert.equal(usd.outstanding, 0);
  assert.equal(usd.outstanding_unknown, 1, 'ausência de saldo contada, não zerada');
  assert.equal(usd.limit_without_usage, 1);
  assert.deepEqual(brl.indexer_mix.map((row) => `${row.key}:${row.share_pct}`), ['cdi:60', 'pre:40']);
  assert.deepEqual(brl.provider_concentration.outstanding.map((row) => `${row.provider}:${row.share_pct}`), ['Banco Um:60', 'Banco Dois:40']);
  assert.deepEqual(brl.maturity_wall, [{ year: '2027', scheduled: 6000000, final_balance: 0 }, { year: '2028', scheduled: 0, final_balance: 4000000 }], 'cronograma vigente + saldo no vencimento final');
  assert.deepEqual(views.refinancing_windows.map((row) => row.name), ['Trade', 'Conta garantida']);
  assert.deepEqual(views.review_due.map((row) => row.name), ['CCB']);
  assert.equal(views.guarantees[0].committed, 3000000);
  assert.equal(views.guarantees[0].unknown_amount, 1);
  assert.ok(!JSON.stringify(views).match(/"(score|rank|recommend|best)"/), 'sem nota, ranking ou recomendação');
  assert.ok(Object.keys(PORTFOLIO_DEFINITIONS).length >= 9, 'cada métrica tem definição');

  const metrics = relationshipMetrics({
    invites: [{ id: 'i1', created_at: '2026-09-01T00:00:00Z' }, { id: 'i2', created_at: '2026-09-01T00:00:00Z' }, { id: 'i3', created_at: '2026-09-01T00:00:00Z' }],
    proposals: [{ id: 'pr1', invite_id: 'i1', current_version: 2 }, { id: 'pr2', invite_id: 'i2', current_version: 0 }],
    firstVersions: [{ proposal_id: 'pr1', submitted_at: '2026-09-04T00:00:00Z' }],
    contracts: [{ status: 'active' }, { status: 'expired' }],
    issues: [{ status: 'open' }, { status: 'resolved', opened_on: '2026-09-01', resolved_at: '2026-09-11T00:00:00Z' }],
    reviews: [{ period_end: '2026-06-30', weighted_result: '80.000', answered_weight: '60.000' }]
  });
  assert.equal(metrics.invited, 3);
  assert.equal(metrics.responded, 1, 'rascunho sem versão não conta como resposta');
  assert.equal(metrics.response_rate, 33.33);
  assert.equal(metrics.median_response_days, 3);
  assert.equal(metrics.active_contracts, 1);
  assert.equal(metrics.open_issues, 1);
  assert.equal(metrics.median_resolution_days, 10);
  assert.match(metrics.last_review.label, /definidos pela sua empresa/);
  assert.equal(relationshipMetrics({}).response_rate, null, 'sem convite, taxa é nula e não zero');

  const map = relationshipMap({ contracts: [{ legal_entity_id: 'e1', product: 'cash_management', status: 'active', ends_on: '2027-01-01' }],
    facilities: [{ id: 'f1', legal_entity_id: 'e1', status: 'active', currency: 'BRL', approved_limit: 100, maturity_on: '2026-12-01' }], balances: [], relationships: [{ legal_entity_id: 'e1', status: 'active' }] });
  const credit = map.find((row) => row.category === 'credit');
  assert.equal(credit.limits[0].used, null, 'uso desconhecido não vira zero');
  assert.equal(credit.relationship_status, 'active');
}

// -------------------------------------------------------------------- API
let sent = [];
let responder = () => [];
globalThis.fetch = async (url, options = {}) => {
  const entry = { url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, authorization: options.headers?.Authorization };
  sent.push(entry);
  const result = responder(entry);
  if (result instanceof Error) return new Response(JSON.stringify({ message: result.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const reset = (handler = () => []) => { sent = []; responder = handler; };
const deps = { requireUser: async () => ({ user: { id: ACTOR }, accessToken: 'user-jwt', headers: {} }), enforceRateLimit: async () => {} };
async function call(method, path, { body = null, url = null } = {}) {
  const stream = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  const req = Object.assign(stream, { method, url: url || `/api/finance/${path}`, headers: {} });
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.payload = JSON.parse(value); } };
  await handleFinance(req, res, path, deps);
  return res;
}
async function rejects(method, path, options, status, code = null) {
  await assert.rejects(() => call(method, path, options), (error) => {
    assert.equal(error.status, status, `${path}: esperado ${status}, recebido ${error.status} (${error.message})`);
    if (code) assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /fin_|postgres|relation|select /i);
    return true;
  });
}
const buyer = (entry) => (entry.url.includes('fin_organizations?select=id') ? [{ id: ORG, legal_name: 'Grupo', kind: 'BUYER' }] : null);
const provider = (entry) => (entry.url.includes('fin_organizations?select=id') ? [{ id: ORG, legal_name: 'Banco', kind: 'PROVIDER' }] : null);

// Provedor (organização) não alcança nada de portfólio.
reset(provider);
await rejects('GET', 'portfolio', { url: `/api/finance/portfolio?organization_id=${ORG}` }, 400, 'organization_kind');
await rejects('GET', 'provider-relationship', { url: `/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}` }, 400, 'organization_kind');
assert.ok(!sent.some((entry) => /fin_facilities|fin_provider_/.test(entry.url)));

// Relacionamento: provedor de outra organização = 404, sem consultas extras.
reset((entry) => buyer(entry) ?? []);
await rejects('GET', 'provider-relationship', { url: `/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${OTHER_PROVIDER}` }, 404, 'provider_not_found');
assert.ok(!sent.some((entry) => entry.url.includes('fin_provider_contacts')));

// Relacionamento completo: todas as leituras com filtro da organização e do provedor.
reset((entry) => buyer(entry)
  ?? (entry.url.includes('fin_providers?select=id,name,kind') ? [{ id: PROVIDER, name: 'Banco Um' }]
    : entry.url.includes('fin_rfq_invites') ? [{ id: 'i1', rfq_id: 'r1', created_at: '2026-09-01T00:00:00Z' }]
      : entry.url.includes('fin_proposals') ? [{ id: '00000000-0000-4000-8000-0000000000e1', invite_id: 'i1', current_version: 1 }]
        : entry.url.includes('fin_proposal_versions') ? [{ proposal_id: '00000000-0000-4000-8000-0000000000e1', submitted_at: '2026-09-03T00:00:00Z' }] : []));
{
  const res = await call('GET', 'provider-relationship', { url: `/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}` });
  assert.equal(res.payload.metrics.response_rate, 100);
  assert.equal(res.payload.metrics.median_response_days, 2);
  assert.match(res.payload.neutrality, /não classifica nem recomenda/);
  for (const entry of sent.filter((item) => /fin_provider_|fin_rfq_invites|fin_proposals\?|fin_contracts|fin_facilities/.test(item.url))) {
    assert.ok(entry.url.includes(`provider_id=eq.${PROVIDER}`), `consulta sem filtro de provedor: ${entry.url}`);
  }
  assert.ok(sent.every((entry) => entry.authorization === 'Bearer user-jwt'));
}

// Contato: e-mail validado, nome não carrega e-mail, corpo forjado ignorado.
reset((entry) => buyer(entry) ?? 'c1');
await call('POST', 'provider-contacts', { body: { organization_id: ORG, provider_id: PROVIDER, name: 'Ana Gerente', email: 'ANA@BANCO.EXAMPLE', is_primary: true, created_by: 'x' } });
assert.deepEqual(sent.find((entry) => entry.url.includes('rpc/fin_add_provider_contact')).body, { p_org: ORG, p_provider: PROVIDER, p_name: 'Ana Gerente', p_title: null, p_email: 'ana@banco.example', p_phone: null, p_entity: null, p_primary: true });
reset(buyer);
await rejects('POST', 'provider-contacts', { body: { organization_id: ORG, provider_id: PROVIDER, name: 'ana@banco.example' } }, 400, 'invalid_contact');
await rejects('POST', 'provider-contacts', { body: { organization_id: ORG, provider_id: PROVIDER, name: 'Ana', email: 'não-é-email' } }, 400, 'invalid_contact');

// Relação e issue.
reset(buyer);
await rejects('POST', 'provider-relationships', { body: { organization_id: ORG, provider_id: PROVIDER, legal_entity_id: ENTITY, categories: ['crypto'] } }, 400, 'invalid_relationship');
await rejects('POST', 'provider-relationships', { body: { organization_id: ORG, provider_id: PROVIDER, categories: ['credit'] } }, 400);
await rejects('POST', 'provider-issues', { body: { organization_id: ORG, provider_id: PROVIDER, title: 'Tarifa', severity: 'critical' } }, 400, 'invalid_issue');
reset(() => new Error('resolution required'));
await rejects('PATCH', 'provider-issues', { body: { issue_id: FACILITY, status: 'resolved' } }, 400, 'resolution_required');

// Scorecard: critérios do cliente; peso, escala e identificador validados.
reset(buyer);
await rejects('POST', 'scorecard-templates', { body: { organization_id: ORG, template_key: 'rel', name: 'Relacionamento', criteria: [{ key: 'a1', label: 'Atendimento', weight: 0, scale_max: 5 }] } }, 400, 'invalid_scorecard');
await rejects('POST', 'scorecard-templates', { body: { organization_id: ORG, template_key: 'rel', name: 'Relacionamento', criteria: [{ key: 'a1', label: 'Atendimento', weight: 50, scale_max: 7 }] } }, 400, 'invalid_scorecard');
reset((entry) => buyer(entry) ?? 't1');
await call('POST', 'scorecard-templates', { body: { organization_id: ORG, template_key: 'rel', name: 'Relacionamento', criteria: [{ key: 'atendimento', label: 'Atendimento', weight: 60, scale_max: 5, extra: 'x' }] } });
assert.deepEqual(sent.find((entry) => entry.url.includes('rpc/')).body.p_criteria, [{ key: 'atendimento', label: 'Atendimento', weight: 60, scale_max: 5 }]);
reset(buyer);
await rejects('POST', 'provider-reviews', { body: { organization_id: ORG, provider_id: PROVIDER, template_id: FACILITY, period_start: '2026-01-01', period_end: '2026-06-30', scores: {} } }, 400, 'invalid_review');
await rejects('POST', 'provider-reviews', { body: { organization_id: ORG, provider_id: PROVIDER, template_id: FACILITY, period_start: '2026-07-01', period_end: '2026-06-30', scores: { atendimento: 1 } } }, 400, 'invalid_period');

// Facility: limite ou principal obrigatório; valores e datas validados antes do banco.
const facility = { organization_id: ORG, provider_id: PROVIDER, kind: 'revolving_credit', name: 'Conta garantida', currency: 'brl', approved_limit: '10000000', indexer: 'cdi', maturity_on: '2027-06-30' };
reset((entry) => buyer(entry) ?? FACILITY);
await call('POST', 'facilities', { body: { ...facility, verified_at: '2020-01-01', created_by: 'x' } });
{
  const body = sent.find((entry) => entry.url.includes('rpc/fin_save_facility')).body;
  assert.equal(body.p_currency, 'BRL');
  assert.equal(body.p_approved_limit, 10000000);
  assert.equal(body.p_facility, null);
  assert.ok(!('p_verified_at' in body), 'verified_at nunca vem do cliente');
}
reset(buyer);
await rejects('POST', 'facilities', { body: { ...facility, approved_limit: '' } }, 400, 'invalid_facility');
await rejects('POST', 'facilities', { body: { ...facility, kind: 'swap' } }, 400, 'invalid_facility');
await rejects('POST', 'facilities', { body: { ...facility, approved_limit: -1 } }, 400, 'invalid_amount');
await rejects('POST', 'facilities', { body: { ...facility, indexer: 'bitcoin' } }, 400, 'invalid_facility');
await rejects('POST', 'facilities', { body: { ...facility, maturity_on: '30/06/2027' } }, 400, 'invalid_date');
assert.ok(!sent.some((entry) => entry.url.includes('rpc/')));
reset(() => new Error('used limit exceeds approved'));
await rejects('POST', 'facility-balances', { body: { facility_id: FACILITY, as_of: '2026-09-30', used_limit_amount: 1 } }, 400, 'used_limit_exceeds_approved');
reset(() => null);
await rejects('POST', 'facility-balances', { body: { facility_id: FACILITY, as_of: '2026-09-30' } }, 400, 'invalid_balance');
await rejects('POST', 'facility-schedule', { body: { facility_id: FACILITY, expected_version: 0, items: [] } }, 400, 'invalid_schedule');
await rejects('POST', 'facility-schedule', { body: { facility_id: FACILITY, items: [{ due_on: '2027-01-01', principal_amount: 1 }] } }, 400, 'invalid_version');
reset(() => new Error('schedule version conflict'));
await rejects('POST', 'facility-schedule', { body: { facility_id: FACILITY, expected_version: 0, items: [{ due_on: '2027-01-01', principal_amount: 1 }] } }, 409, 'schedule_version_conflict');

// Portfólio: leituras sob RLS e visões por moeda.
reset((entry) => buyer(entry)
  ?? (entry.url.includes('fin_facilities') ? [{ id: FACILITY, provider_id: PROVIDER, currency: 'BRL', status: 'active', approved_limit: 100, schedule_version: 0 }]
    : entry.url.includes('fin_providers') ? [{ id: PROVIDER, name: 'Banco Um' }]
      : entry.url.includes('fin_facility_balances') ? [{ facility_id: FACILITY, as_of: '2026-09-30', recorded_at: '2026-10-01', used_limit_amount: 40 }] : []));
{
  const res = await call('GET', 'portfolio', { url: `/api/finance/portfolio?organization_id=${ORG}&horizon_months=6` });
  assert.equal(res.payload.views.currencies[0].available_limit, 60);
  assert.equal(res.payload.facilities[0].provider_name, 'Banco Um');
  assert.match(res.payload.boundary, /não calcula juros/);
  assert.ok(!sent.some((entry) => entry.url.includes('rpc/')));
}
reset(buyer);
await rejects('GET', 'portfolio', { url: `/api/finance/portfolio?organization_id=${ORG}&horizon_months=1000` }, 400, 'invalid_horizon');

console.log('Relationship & Portfolio: visões por moeda sem soma entre moedas, saldo mais recente, ausência explícita, métricas factuais, scorecard do cliente e API aprovados.');

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

// O link canônico consulta uma única tarefa sob a organização e o JWT do leitor.
for (const status of ['open', 'done', 'cancelled']) {
  reset(entry => buyer(entry) ?? (entry.url.includes('fin_tasks?') ? [{id: FACILITY, status, assignee_id: null}] : []));
  const {payload} = await call('GET', 'tasks', {url: `/api/finance/tasks?organization_id=${ORG}&task_id=${FACILITY}`});
  assert.equal(payload.rows[0].status, status);
  assert.deepEqual(payload.page, {limit: 1, has_more: false, next_cursor: null});
  const request = sent.find(entry => entry.url.includes('fin_tasks?'));
  const params = new URL(request.url).searchParams;
  assert.equal(params.get('id'), `eq.${FACILITY}`);
  assert.equal(params.get('organization_id'), `eq.${ORG}`);
  assert.equal(params.get('limit'), '1');
  assert.equal(params.has('status'), false);
  assert.equal(request.authorization, 'Bearer user-jwt');
}
reset(entry => buyer(entry) ?? []);
assert.deepEqual((await call('GET', 'tasks', {url: `/api/finance/tasks?organization_id=${ORG}&task_id=${FACILITY}`})).payload.rows, []);
for (const filter of ['status=open', 'assignee_id='+ACTOR, 'unassigned=true', 'cursor=invalid']) {
  reset(entry => buyer(entry) ?? []);
  await rejects('GET', 'tasks', {url: `/api/finance/tasks?organization_id=${ORG}&task_id=${FACILITY}&${filter}`}, 400, 'invalid_task_filter');
  assert.ok(!sent.some(entry => entry.url.includes('fin_tasks?')));
}
reset(entry => buyer(entry) ?? []);
await rejects('GET', 'tasks', {url: `/api/finance/tasks?organization_id=${ORG}&task_id=invalid`}, 400, 'invalid_id');
assert.ok(!sent.some(entry => entry.url.includes('fin_tasks?')));
reset(() => []);
await rejects('GET', 'tasks', {url: `/api/finance/tasks?organization_id=${ORG}&task_id=${FACILITY}`}, 403);
assert.ok(!sent.some(entry => entry.url.includes('fin_tasks?')));

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
        : entry.url.includes('fin_proposal_versions') ? [{ proposal_id: '00000000-0000-4000-8000-0000000000e1', submitted_at: '2026-09-03T00:00:00Z' }]
          : entry.url.includes('fin_events?') ? [{ event_type: 'provider_contact_added', happened_at: '2026-09-04T00:00:00Z' }] : []));
{
  const res = await call('GET', 'provider-relationship', { url: `/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}` });
  assert.equal(res.payload.metrics.response_rate, 100);
  assert.ok(res.payload.timeline.some(row => row.text === 'Contato adicionado'));
  assert.ok(res.payload.timeline.every(row => !row.text.includes('provider_contact_added')));
  assert.equal(res.payload.coverage.partial, true);
  assert.equal(res.payload.coverage.limits.contracts, 200);
  assert.equal(res.payload.invites.length, 1);
  assert.ok(Array.isArray(res.payload.rfqs));
  assert.ok(sent.find(entry => entry.url.includes('fin_rfqs?')).url.includes(`organization_id=eq.${ORG}`));
  assert.ok(sent.find(entry => entry.url.includes('fin_rfqs?')).url.includes('id=in.'));
  assert.equal(res.payload.metrics.median_response_days, 2);
  assert.match(res.payload.neutrality, /não classifica nem recomenda/);
  for (const entry of sent.filter((item) => /fin_provider_|fin_rfq_invites|fin_proposals\?|fin_contracts|fin_facilities/.test(item.url))) {
    assert.ok(entry.url.includes(`provider_id=eq.${PROVIDER}`), `consulta sem filtro de provedor: ${entry.url}`);
  }
  assert.ok(sent.every((entry) => entry.authorization === 'Bearer user-jwt'));
}

// As pendências vêm dos contratos autorizados, sem depender do overview global.
reset((entry) => buyer(entry) ?? (
  entry.url.includes('fin_providers?') ? [{ id: PROVIDER }] :
  entry.url.includes('fin_contracts?') ? [{ id: FACILITY, status: 'active', renewal_notice_days: 60 }] :
  entry.url.includes('fin_provider_contract_tasks?') ? Array.from({ length: 201 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`, status: 'open', due_on: null, created_at: '2026-10-01T00:00:00Z', assignee_id: ACTOR, related_id: FACILITY })) :
  entry.url.includes('fin_members?') ? [{ user_id: ACTOR, display_name: 'Ana' }] : []));
{
  const { payload } = await call('GET', 'provider-relationship', { url: `/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}` });
  assert.equal(payload.tasks.length, 200);
  assert.equal(payload.tasks[0].assignee_name, 'Ana');
  assert.equal(payload.coverage.tasks_truncated, true);
  const taskQuery = sent.find(row => row.url.includes('fin_provider_contract_tasks?')).url;
  for (const filter of [`organization_id=eq.${ORG}`, 'related_type=eq.contract', `provider_id=eq.${PROVIDER}`, 'status=eq.open', 'limit=201']) assert.ok(taskQuery.includes(filter), filter);
  assert.ok(sent.find(row => row.url.includes('fin_contracts?')).url.includes('renewal_notice_days'));
  assert.ok(sent.find(row => row.url.includes('fin_members?')).url.includes(`organization_id=eq.${ORG}`));
  assert.ok(sent.every(row => row.authorization === 'Bearer user-jwt'));
}
reset((entry) => buyer(entry) ?? (entry.url.includes('fin_providers?') ? [{ id: PROVIDER }] : []));
{
  const { payload } = await call('GET', 'provider-relationship', { url: `/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}` });
  assert.deepEqual(payload.tasks, []);
  assert.equal(payload.coverage.tasks_truncated, false);
  assert.ok(sent.some(row => row.url.includes('fin_provider_contract_tasks?')));
  assert.ok(!sent.some(row => row.url.includes('fin_members?')));
}

// Erro no recorte de tarefas falha a leitura; não vira uma lista vazia de sucesso.
reset((entry) => buyer(entry) ?? (entry.url.includes('fin_providers?') ? [{ id: PROVIDER }] : entry.url.includes('fin_contracts?') ? [{ id: FACILITY }] : entry.url.includes('fin_provider_contract_tasks?') ? new Error('backend unavailable') : []));
await assert.rejects(() => call('GET', 'provider-relationship', { url: `/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}` }));
assert.ok(sent.every(row => row.authorization === 'Bearer user-jwt'));

// Uma pendência no contrato 201 não pode desaparecer pelo recorte de contratos.
const contractBeyondPage = '00000000-0000-4000-8000-00000000c201';
reset(entry => buyer(entry) ?? (
 entry.url.includes('fin_providers?') ? [{ id: PROVIDER }] :
 entry.url.includes('fin_contracts?') ? Array.from({length:201}, (_, i) => ({ id: i === 200 ? contractBeyondPage : `00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`, created_at: '2026-10-01T00:00:00Z', status: 'active' })).slice(0, Number(new URL(entry.url).searchParams.get('limit'))) :
 entry.url.includes('fin_provider_contract_tasks?') || entry.url.includes(contractBeyondPage) && entry.url.includes('fin_tasks?') ? [{ id: FACILITY, related_id: contractBeyondPage, related_type: 'contract', title: 'Revisar obrigação fora do recorte', status: 'open', due_on: '2026-10-01', created_at: '2026-10-01T00:00:00Z' }] : []));
{
 const {payload} = await call('GET','provider-relationship',{url:`/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}`});
 assert.equal(payload.tasks[0]?.related_id, contractBeyondPage, 'tarefa de contrato fora da primeira página precisa ser consultada');
 assert.equal(payload.pages.contracts.has_more,true);
 assert.equal(payload.contracts.length,200);
}

// Continuação é escopada e não repete as consultas secundárias do relacionamento.
const pageRows = Array.from({length:3}, (_, i) => ({ id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`, due_on:null, created_at:'2026-10-01T00:00:00.000Z', status:'open', assignee_id:null }));
reset(entry => buyer(entry) ?? (entry.url.includes('fin_providers?') ? [{id:PROVIDER}] : entry.url.includes('fin_provider_contract_tasks?') ? (new URL(entry.url).searchParams.has('or') ? pageRows.slice(2) : pageRows) : []));
{
 const url=`/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}&section=tasks&limit=2`;
 const first=(await call('GET','provider-relationship',{url})).payload;
 assert.equal(first.rows.length,2);assert.equal(first.page.has_more,true);
 const last=(await call('GET','provider-relationship',{url:`${url}&cursor=${first.page.next_cursor}`})).payload;
 assert.equal(last.rows.length,1);assert.equal(last.page.has_more,false);assert.equal(last.page.next_cursor,null);
 assert.equal(new Set([...first.rows,...last.rows].map(r=>r.id)).size,3);
 assert.ok(new URL(sent.filter(r=>r.url.includes('fin_provider_contract_tasks?')).at(-1).url).searchParams.get('or').includes('due_on.is.null'));
 assert.ok(!sent.some(r=>/fin_provider_contacts|fin_rfq_invites|fin_facilities|fin_members/.test(r.url)));
 const forged=JSON.parse(Buffer.from(first.page.next_cursor,'base64url').toString());forged.provider=OTHER_PROVIDER;
 await rejects('GET','provider-relationship',{url:`${url}&cursor=${Buffer.from(JSON.stringify(forged)).toString('base64url')}`},400,'invalid_relationship_page');
 for(const extra of ['limit=0','limit=201','limit=1.5','section=other','cursor=bad']) await rejects('GET','provider-relationship',{url:`/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}&${extra}`},400,'invalid_relationship_page');
}

// Toda página revalida a organização antes de consultar dados de instituição.
reset(()=>[]);
for(const section of ['tasks','contracts']) await rejects('GET','provider-relationship',{url:`/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}&section=${section}`},403,'organization_forbidden');
assert.ok(!sent.some(r=>r.url.includes('fin_providers?')||r.url.includes('fin_provider_contract_tasks?')));
reset(entry=>buyer(entry)??(entry.url.includes('fin_providers?')?[{id:PROVIDER}]:entry.url.includes('fin_contracts?')?Array.from({length:3},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,created_at:'2026-10-01T00:00:00Z'})):[]));
{
 const url=`/api/finance/provider-relationship?organization_id=${ORG}&provider_id=${PROVIDER}&section=contracts&limit=2`;
 const first=(await call('GET','provider-relationship',{url})).payload;
 assert.equal(first.rows.length,2);assert.equal(first.page.has_more,true);
 await call('GET','provider-relationship',{url:`${url}&cursor=${first.page.next_cursor}`});
 assert.match(new URL(sent.filter(r=>r.url.includes('fin_contracts?')).at(-1).url).searchParams.get('or'),/created_at.lt/);
 await rejects('GET','provider-relationship',{url:`${url.replace('section=contracts','section=tasks')}&cursor=${first.page.next_cursor}`},400,'invalid_relationship_page');
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

// Trabalho contextual: parent autorizado antes de consultar tarefas; cursor ligado ao contexto/filtro.
const contextualRows=Array.from({length:3},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,status:'open',due_on:null,created_at:'2026-10-01T00:00:00Z',related_type:'contract',related_id:FACILITY}));
reset(entry=>buyer(entry) ?? (entry.url.includes('fin_contracts?')?[{id:FACILITY}]:entry.url.includes('fin_tasks?')?contextualRows:[]));
const contextualUrl=`/api/finance/tasks?organization_id=${ORG}&contract_id=${FACILITY}&status=open&limit=2`;
const contextual=(await call('GET','tasks',{url:contextualUrl})).payload;
assert.equal(contextual.rows.length,2);assert.equal(contextual.page.has_more,true);
const scopedRequest=new URL(sent.find(entry=>entry.url.includes('fin_tasks?')).url);
assert.equal(scopedRequest.searchParams.get('related_type'),'eq.contract');
assert.equal(scopedRequest.searchParams.get('related_id'),`eq.${FACILITY}`);
assert.ok(sent.every(entry=>entry.authorization==='Bearer user-jwt'));
await call('GET','tasks',{url:`${contextualUrl}&cursor=${contextual.page.next_cursor}`});
await rejects('GET','tasks',{url:`${contextualUrl.replace('status=open','status=done')}&cursor=${contextual.page.next_cursor}`},400,'invalid_task_cursor');
await rejects('GET','tasks',{url:`${contextualUrl}&task_id=${ACTOR}`},400,'invalid_task_filter');
reset(entry=>buyer(entry) ?? []);
await rejects('GET','tasks',{url:contextualUrl},404,'task_context_not_found');
assert.ok(!sent.some(entry=>entry.url.includes('fin_tasks?')));
reset(provider);
await rejects('GET','tasks',{url:contextualUrl},403);
assert.ok(!sent.some(entry=>entry.url.includes('fin_tasks?')));

// Revisão antiga fora da página de vinte: leitura exata continua limitada e sob o JWT.
reset(entry=>buyer(entry) ?? []);
await call('GET','rfq-revisions',{url:`/api/finance/rfq-revisions?organization_id=${ORG}&rfq_id=${FACILITY}&from_revision=1&to_revision=25`});
assert.match(sent.find(entry=>entry.url.includes('fin_rfq_revisions?')).url,/revision=in\.\(1,25\).*limit=2/);
assert.ok(sent.every(entry=>entry.authorization==='Bearer user-jwt'));
for(const args of ['from_revision=1','from_revision=0&to_revision=25','from_revision=1&to_revision=2.5','from_revision=1&to_revision=9999999999']) {
 reset(entry=>buyer(entry) ?? []);
 await rejects('GET','rfq-revisions',{url:`/api/finance/rfq-revisions?organization_id=${ORG}&rfq_id=${FACILITY}&${args}`},400,'invalid_rfq_revision');
 assert.ok(!sent.some(entry=>entry.url.includes('fin_rfq_revisions?')));
}
console.log('Contextual task authorization, pagination, scope-bound cursor and exact historical RFQ revision reads passed.');

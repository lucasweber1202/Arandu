import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { validateCrmRecord, CRM_NOTICE } from '../lib/finance/crm.mjs';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1), actor = id(2), contact = id(3), provider = id(4), request = id(5);
const good = { name: 'Pessoa teste', source_reference: 'Reunião registrada' };
assert.deepEqual(validateCrmRecord('contact', good), []);
for (const values of [{ ...good, name: '<b>Nome</b>' }, { ...good, email: 'not-an-email' }, { ...good, phone: 1234567 }, { ...good, owner_id: null }, { ...good, status: null }, { ...good, organization_id: org }, { ...good, source_reference: '' }]) assert(validateCrmRecord('contact', values).length);
assert.deepEqual(validateCrmRecord('process', { title: 'Revisar relação', stage: 'negotiation', next_action: 'Conferir oferta', source_reference: 'Reunião' }), []);
assert(validateCrmRecord('process', { title: 'Revisar relação', stage: 'won', next_action: 'Acompanhar', source_reference: 'Reunião' }).includes('outcome'));
assert(validateCrmRecord('activity', { kind: 'send_email', subject: 'Atividade', source_reference: 'Registro' }).length, 'no real email command');
assert(validateCrmRecord('activity', { kind: 'note', subject: 'Atividade', source_reference: 'Registro', related_type: 'contract' }).includes('reference_pair'));

const originalFetch = globalThis.fetch;
const previousEnv = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'].map(key => [key, process.env[key]]));
process.env.SUPABASE_URL = 'https://supabase.example.invalid'; process.env.SUPABASE_ANON_KEY = 'anon'; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
let calls = [], hidden = false, upstreamError = null, missingView = false;
globalThis.fetch = async (url, options) => {
  const parsed = new URL(url), path = parsed.pathname, q = parsed.searchParams;
  calls.push({ path, q, options });
  if (path.endsWith('/fin_organizations')) return Response.json([{ id: org, kind: 'BUYER' }]);
  if (path.endsWith('/fin_members')) return Response.json([{ role: 'admin' }]);
  if (path.endsWith('/rpc/fin_crm_command')) return upstreamError ? Response.json({ message: upstreamError }, { status: 400 }) : Response.json({ id: contact, version: 1, replayed: false });
  if (path.endsWith('/fin_providers')) return Response.json(hidden ? [] : [{ id: provider }]);
  if (path.endsWith('/fin_provider_contacts')) return Response.json(hidden ? [] : q.get('select') === 'id' ? [{ id: contact }] : [{ id: id(10), name: 'Pessoa Um' }, { id: id(11), name: 'Pessoa Dois' }]);
  if (path.endsWith('/fin_events')) return Response.json([30, 31].map(n => ({ id: id(n), happened_at: '2026-10-30T10:00:00.000000+00:00', event_type: 'crm_command_recorded', metadata: { changed_fields: ['name'] } })));
  if (path.endsWith('/rpc/fin_query_graph')) return Response.json([]);
  if (path.endsWith('/fin_crm_institution_records') && missingView) return Response.json({ code: 'PGRST205', message: 'schema cache miss' }, { status: 404 });
  if (path.endsWith('/fin_crm_institution_records')) return Response.json([40,41].map(n => ({ id: id(n), record_type: 'activity', title: 'Interação declarada' })));
  if (path.endsWith('/fin_crm_activities')) return Response.json([40, 41].map(n => ({ id: id(n), due_on: '2026-11-03', subject: 'Interação declarada' })));
  return Response.json([]);
};
async function call(path, method = 'GET', body = null) {
  const req = Object.assign(Readable.from(body ? [JSON.stringify(body)] : []), { method, url: `/api/finance/${path}`, headers: {} });
  const res = { statusCode: 200, setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  await handleFinance(req, res, path.split('?')[0], { requireUser: async () => ({ user: { id: actor }, accessToken: 'crm-user-jwt' }), enforceRateLimit: async () => {} });
  return res;
}
try {
  await assert.rejects(() => call('constructor', 'POST', {}), error => error.status === 404);
  let response = await call(`crm-contacts?organization_id=${org}&search=Pessoa&limit=1`);
  assert.equal(response.body.rows.length, 1); assert(response.body.next);
  assert.equal(response.body.notice, CRM_NOTICE);
  assert.equal(calls.at(-1).q.get('name'), 'ilike.*Pessoa*');
  const after = response.body.next;
  await call(`crm-contacts?organization_id=${org}&search=Pessoa&limit=1&after=${after}`);
  assert.equal(calls.at(-1).q.get('id'), `gt.${id(10)}`);
  await assert.rejects(() => call(`crm-contacts?organization_id=${org}&search=Different&after=${after}`), error => error.status === 400);
  await assert.rejects(() => call(`crm-processes?organization_id=${org}&search=Pessoa&limit=1&after=${after}`), error => error.status === 400);
  for (const suffix of ['limit=101', 'limit=0', 'search=xx%25', 'sort=name.desc', 'stage=won', 'unknown=1']) await assert.rejects(() => call(`crm-contacts?organization_id=${org}&${suffix}`), error => error.status === 400);
  const create = { organization_id: org, provider_id: provider, request_key: request, values: good };
  response = await call('crm-contacts', 'POST', create);
  assert.equal(response.statusCode, 201);
  const sent = JSON.parse(calls.at(-1).options.body);
  assert.deepEqual(sent, { p_org: org, p_kind: 'contact', p_id: null, p_expected: null, p_request: request, p_scope: { legal_entity_id: null, provider_id: provider, counterparty_organization_id: null }, p_values: good });
  await call('crm-contacts', 'PATCH', { organization_id: org, id: contact, expected_version: 1, request_key: request, values: { status: 'archived' } });
  assert.equal(JSON.parse(calls.at(-1).options.body).p_expected, 1);
  for (const body of [{ ...create, updated_at: 'fake' }, { ...create, values: { ...good, name: '<script>' } }, { ...create, values: { ...good, status: null } }]) {
    const count = calls.length; await assert.rejects(() => call('crm-contacts', 'POST', body), error => error.status === 400); assert.equal(calls.length, count);
  }
  await assert.rejects(() => call('crm-contacts', 'PATCH', { organization_id: org, id: contact, request_key: request, expected_version: 0, values: { name: 'Changed' } }), error => error.status === 400);
  for (const [message, status] of [['crm version conflict', 409], ['crm request conflict', 409], ['crm not found', 404], ['invalid crm reference', 400]]) {
    upstreamError = message; await assert.rejects(() => call('crm-contacts', 'POST', create), error => error.status === status);
  }
  upstreamError = null; calls = [];
  response = await call(`crm-history?organization_id=${org}&object_type=contact&object_id=${contact}`);
  assert.equal(response.body.rows[0].event_type, 'crm_command_recorded');
  assert.equal(calls.at(-1).q.get('entity_id'), `eq.${contact}`);
  response = await call(`crm-history?organization_id=${org}&object_type=contact&object_id=${contact}&limit=1`);
  await call(`crm-history?organization_id=${org}&object_type=contact&object_id=${contact}&limit=1&after=${response.body.next}`);
  assert.equal(calls.at(-1).q.get('order'), 'happened_at.asc,id.asc');
  assert.match(calls.at(-1).q.get('or'), /happened_at\.gt\.2026-10-30T10:00:00/);
  hidden = true; calls = [];
  await assert.rejects(() => call(`crm-history?organization_id=${org}&object_type=contact&object_id=${contact}`), error => error.status === 404);
  assert(!calls.some(c => c.path.endsWith('/fin_events')), 'inaccessible root stops history traversal');
  hidden = false; calls = [];
  response = await call(`crm-activities?organization_id=${org}&status=planned&sort=due_on.asc.nullslast,id.asc&limit=1&due_after=2026-11-01&due_before=2026-11-30&related_type=contract&process_id=${request}`);
  assert.deepEqual(calls.at(-1).q.getAll('due_on'), ['lte.2026-11-30', 'gte.2026-11-01']);
  assert.equal(calls.at(-1).q.get('related_type'), 'eq.contract');
  assert.equal(calls.at(-1).q.get('process_id'), `eq.${request}`);
  const agendaQuery = `crm-activities?organization_id=${org}&sort=due_on.asc.nullslast,id.asc&limit=1`;
  response = await call(agendaQuery);
  await call(`${agendaQuery}&after=${response.body.next}`);
  assert.equal(calls.at(-1).q.get('or'), `(due_on.gt.2026-11-03,and(due_on.eq.2026-11-03,id.gt.${id(40)}),due_on.is.null)`);
  await assert.rejects(() => call(`crm-activities?organization_id=${org}&after=${response.body.next}`), e => e.status === 400);
  await call(`crm-processes?organization_id=${org}&next_step=missing`);
  assert.equal(calls.at(-1).q.get('due_on'), 'is.null');
  for (const suffix of ['due_after=2026-02-30', 'due_after=2026-12-01&due_before=2026-11-01', 'next_step=missing', 'related_type=bad']) await assert.rejects(() => call(`crm-activities?organization_id=${org}&${suffix}`), e => e.status === 400);
  await assert.rejects(() => call(`crm-processes?organization_id=${org}&next_step=missing&due_before=2026-11-01`), e => e.status === 400);
  await assert.rejects(() => call(`crm-contacts?organization_id=${org}&sort=due_on.asc.nullslast,id.asc`), e => e.status === 400);
  calls = [];
  const institutionQuery = `crm-institution-records?organization_id=${org}&provider_id=${provider}&record_type=activity&limit=1`;
  response = await call(institutionQuery); assert(response.body.next); assert.equal(response.body.rows.length, 1);
  assert.equal(calls.at(-1).q.get('provider_ids'), `cs.{${provider}}`);
  await call(`${institutionQuery}&after=${response.body.next}`);
  assert.equal(calls.at(-1).q.get('or'), `(record_type.gt.activity,and(record_type.eq.activity,id.gt.${id(40)}))`);
  await assert.rejects(() => call(`${institutionQuery.replace('record_type=activity', 'record_type=process')}&after=${response.body.next}`), e => e.status === 400);
  hidden = true; calls = [];
  await assert.rejects(() => call(institutionQuery), e => e.status === 404);
  assert(!calls.some(c => c.path.endsWith('/fin_crm_institution_records')));
  hidden = false; calls = [];
  await call(`graph/provider?organization_id=${org}&id=${provider}`);
  assert(!calls.some(c => /fin_crm_/.test(c.path)), 'old Graph clients do not require CRM schema');
  response = await call(`graph/provider?organization_id=${org}&id=${provider}&include_crm=true`);
  assert.equal(response.body.crm.activities.rows[0].title, 'Interação declarada');
  assert.equal(response.body.crm.activities.continuation.filters.provider_id, provider);
  assert.equal(response.body.crm.activities.coverage, 'explicit_institution_associations');
  missingView = true;
  await assert.rejects(() => call(`graph/provider?organization_id=${org}&id=${provider}&include_crm=true`), e => e.status === 503 && e.code === 'schema_incompatible');
  missingView = false;
  assert(calls.every(c => c.options.headers.Authorization === 'Bearer crm-user-jwt'), 'all queries retain user JWT');
  console.log('CRM domain/API: typed declarations, commands, optimistic versions, scoped pagination/search/history and opt-in Graph PASS (HTTP mocks; SQL evidence separate).');
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(previousEnv)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
}

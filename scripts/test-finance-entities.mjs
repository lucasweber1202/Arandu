import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { validateEntityInput, validateScopeInput, consolidateByEntity, entityTree, entityLabel } from '../lib/finance/entities.mjs';

// Multi-entity: regras de entrada, consolidação sem vazamento e fronteira da
// API (organização confirmada no banco, escrita só por RPC, JWT do usuário,
// erros do banco traduzidos sem vazar SQL). Nenhuma chamada real ao Supabase.

process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const ORG = '00000000-0000-4000-8000-0000000000b1';
const OTHER = '00000000-0000-4000-8000-0000000000d1';
const ACTOR = '00000000-0000-4000-8000-0000000000a1';
const ENTITY_A = '00000000-0000-4000-8000-00000000e0a1';
const ENTITY_B = '00000000-0000-4000-8000-00000000e0b1';
const UNIT = '00000000-0000-4000-8000-00000000e0a2';
const RFQ = '00000000-0000-4000-8000-0000000000f1';

// ---------------------------------------------------------------- domínio
{
  const ok = validateEntityInput({ legal_name: ' Vitta Alimentos Ltda ', short_name: 'Alimentos', tax_identifier: '11.222.333/0001-81', currency: 'brl' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.values, { kind: 'legal_entity', legal_name: 'Vitta Alimentos Ltda', short_name: 'Alimentos', tax_identifier: '11222333000181', country: 'BR', currency: 'BRL', parent_id: null });
  assert.equal(validateEntityInput({ legal_name: 'X' }).ok, false, 'nome curto demais');
  assert.equal(validateEntityInput({ legal_name: '<b>Vitta</b>' }).ok, false, 'HTML no nome');
  assert.equal(validateEntityInput({ legal_name: 'Vitta', tax_identifier: '11222333000182' }).ok, false, 'dígito verificador');
  assert.equal(validateEntityInput({ legal_name: 'Vitta Chile', country: 'CL', tax_identifier: '11222333000181' }).ok, false, 'CNPJ fora do Brasil');
  assert.equal(validateEntityInput({ legal_name: 'Vitta', currency: 'REAIS' }).ok, false, 'moeda fora do ISO');
  assert.equal(validateEntityInput({ legal_name: 'Unidade', kind: 'business_unit' }).ok, false, 'unidade sem entidade-mãe');
  assert.equal(validateEntityInput({ legal_name: 'Entidade', parent_id: ENTITY_A }).ok, false, 'entidade legal abaixo de outra');
  assert.equal(validateEntityInput({ legal_name: 'Unidade', kind: 'business_unit', parent_id: ENTITY_A }).ok, true);
  assert.equal(validateEntityInput({ legal_name: 'Holding', kind: 'group' }).ok, false, 'tipo fora do catálogo');

  assert.deepEqual(validateScopeInput({ scope: 'group', entity_ids: [ENTITY_A] }).values, { scope: 'group', entity_ids: [] }, 'escopo de grupo ignora lista');
  assert.deepEqual(validateScopeInput({ scope: 'entities', entity_ids: [ENTITY_A, ENTITY_A] }).values.entity_ids, [ENTITY_A], 'deduplica');
  assert.equal(validateScopeInput({ scope: 'entities', entity_ids: [] }).ok, false);
  assert.equal(validateScopeInput({ scope: 'entities', entity_ids: ["x' or 1=1"] }).ok, false);
  assert.equal(validateScopeInput({ scope: 'admin' }).ok, false);

  const entities = [
    { id: ENTITY_B, legal_name: 'Vitta Logística', short_name: 'Log', kind: 'legal_entity', currency: 'BRL', status: 'active' },
    { id: UNIT, legal_name: 'Unidade Nordeste', short_name: 'Nordeste', kind: 'business_unit', parent_id: ENTITY_A, currency: 'BRL', status: 'active' },
    { id: ENTITY_A, legal_name: 'Vitta Alimentos', short_name: 'Alimentos', kind: 'legal_entity', currency: 'BRL', status: 'active' }
  ];
  assert.deepEqual(entityTree(entities).map((row) => `${row.depth}:${row.short_name}`), ['0:Alimentos', '1:Nordeste', '0:Log']);
  assert.equal(entityLabel(entities[1], new Map(entities.map((row) => [row.id, row]))), 'Alimentos › Nordeste');
  // Unidade sem a entidade-mãe visível (concessão só da unidade) continua listada.
  assert.deepEqual(entityTree([entities[1]]).map((row) => row.short_name), ['Nordeste']);

  const summary = consolidateByEntity({
    entities,
    today: '2026-10-03',
    rfqs: [
      { id: '1', status: 'collecting', legal_entity_id: ENTITY_A },
      { id: '2', status: 'contracted', legal_entity_id: ENTITY_A },
      { id: '3', status: 'draft', legal_entity_id: UNIT },
      { id: '4', status: 'open', legal_entity_id: null }
    ],
    contracts: [
      { id: 'c1', status: 'active', ends_on: '2026-12-01', renewal_notice_days: 60, legal_entity_id: ENTITY_A },
      { id: 'c2', status: 'active', ends_on: '2027-12-01', renewal_notice_days: 60, legal_entity_id: ENTITY_A },
      { id: 'c3', status: 'expired', ends_on: '2026-01-01', renewal_notice_days: 60, legal_entity_id: ENTITY_B }
    ]
  });
  const byKey = Object.fromEntries(summary.map((row) => [row.key, row]));
  assert.deepEqual(summary.map((row) => row.key), [ENTITY_A, UNIT, ENTITY_B, 'group'], 'ordem: árvore e depois o nível de grupo');
  assert.equal(byKey[ENTITY_A].rfqs_open, 1);
  assert.equal(byKey[ENTITY_A].rfqs_decided, 1);
  assert.equal(byKey[ENTITY_A].contracts_active, 2);
  assert.equal(byKey[ENTITY_A].contracts_notice_due, 1, 'aviso prévio em 2026-10-02 já está na janela de 30 dias');
  assert.equal(byKey[ENTITY_A].next_contract_end, '2026-12-01');
  assert.equal(byKey[UNIT].rfqs_open, 1, 'unidade tem a própria linha; não soma na entidade-mãe');
  assert.equal(byKey[ENTITY_B].contracts_active, 0, 'contrato encerrado não conta');
  assert.equal(byKey.group.rfqs_open, 1);
  for (const row of summary) {
    assert.ok(!('amount' in row) && !('score' in row) && !('rank' in row), 'consolidado não soma valores nem ordena por nota');
  }
  // Pessoa com escopo restrito: sem linha de grupo porque o RLS não devolveu nenhuma.
  const restricted = consolidateByEntity({ entities: [entities[2]], rfqs: [{ id: '1', status: 'open', legal_entity_id: ENTITY_A }], contracts: [] });
  assert.deepEqual(restricted.map((row) => row.key), [ENTITY_A]);
}

// -------------------------------------------------------------------- API
let sent = [];
let responder = () => [];
globalThis.fetch = async (url, options = {}) => {
  const entry = { url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, authorization: options.headers?.Authorization, apikey: options.headers?.apikey };
  sent.push(entry);
  const result = responder(entry);
  if (result instanceof Error) {
    return new Response(JSON.stringify({ message: result.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const reset = (handler = () => []) => { sent = []; responder = handler; };
const deps = { requireUser: async () => ({ user: { id: ACTOR }, accessToken: 'user-jwt', headers: {} }), enforceRateLimit: async () => {} };
function request(method, url, body) {
  const stream = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  return Object.assign(stream, { method, url, headers: {} });
}
async function call(method, path, { body = null, url = null } = {}) {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.payload = JSON.parse(value); } };
  await handleFinance(request(method, url || `/api/finance/${path}`, body), res, path, deps);
  return res;
}
async function rejects(method, path, options, status, code = null) {
  await assert.rejects(() => call(method, path, options), (error) => {
    assert.equal(error.status, status, `${path}: esperado ${status}, recebido ${error.status} (${error.message})`);
    if (code) assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /fin_|postgres|supabase|select |relation/i, 'mensagem crua do banco vazou');
    return true;
  });
}
const buyer = (entry) => (entry.url.includes('fin_organizations?select=id') ? [{ id: ORG, legal_name: 'Grupo', kind: 'BUYER' }] : null);
const provider = (entry) => (entry.url.includes('fin_organizations?select=id') ? [{ id: ORG, legal_name: 'Banco', kind: 'PROVIDER' }] : null);

// Organização forjada nunca chega a uma RPC; provedor não administra entidades.
reset(() => []);
await rejects('GET', 'entities', { url: `/api/finance/entities?organization_id=${OTHER}` }, 403);
await rejects('GET', 'entities', { url: '/api/finance/entities?organization_id=nao-uuid' }, 400);
assert.ok(!sent.some((entry) => entry.url.includes('rpc/')));
reset(provider);
await rejects('POST', 'entities', { body: { organization_id: ORG, legal_name: 'Vitta' } }, 400, 'organization_kind');
assert.ok(!sent.some((entry) => entry.url.includes('rpc/')));

// Listagem: árvore, escopo e moeda base do próprio usuário, sob o JWT dele.
reset((entry) => buyer(entry)
  ?? (entry.url.includes('fin_legal_entities') ? [{ id: UNIT, legal_name: 'Nordeste', kind: 'business_unit', parent_id: ENTITY_A }, { id: ENTITY_A, legal_name: 'Alimentos', kind: 'legal_entity' }]
    : entry.url.includes('fin_members') ? [{ role: 'admin', entity_scope: 'group' }]
      : entry.url.includes('fin_organizations?select=base_currency') ? [{ base_currency: 'BRL' }] : []));
{
  const res = await call('GET', 'entities', { url: `/api/finance/entities?organization_id=${ORG}` });
  assert.deepEqual(res.payload.rows.map((row) => row.id), [ENTITY_A, UNIT]);
  assert.equal(res.payload.scope, 'group');
  assert.equal(res.payload.can_admin, true);
  assert.equal(res.payload.base_currency, 'BRL');
  assert.ok(sent.every((entry) => entry.authorization === 'Bearer user-jwt' && entry.apikey === 'test-anon-key'), 'sempre JWT do usuário e chave anônima');
  assert.ok(sent.some((entry) => entry.url.includes(`user_id=eq.${ACTOR}`)), 'escopo lido do próprio usuário da sessão');
}

// Criação: só campos da allowlist chegam à RPC; o CNPJ vai só com dígitos.
reset((entry) => buyer(entry) ?? (entry.url.includes('rpc/fin_create_legal_entity') ? ENTITY_A : []));
{
  const res = await call('POST', 'entities', { body: { organization_id: ORG, legal_name: 'Vitta Alimentos', tax_identifier: '11.222.333/0001-81', status: 'archived', created_by: OTHER, organization: OTHER } });
  const rpcCall = sent.find((entry) => entry.url.includes('rpc/fin_create_legal_entity'));
  assert.deepEqual(Object.keys(rpcCall.body).sort(), ['p_country', 'p_currency', 'p_kind', 'p_legal_name', 'p_org', 'p_parent', 'p_short_name', 'p_tax_identifier']);
  assert.equal(rpcCall.body.p_org, ORG);
  assert.equal(rpcCall.body.p_tax_identifier, '11222333000181');
  assert.equal(res.payload.tax_identifier.externally_verified, false, 'não afirma verificação externa do CNPJ');
}
reset(buyer);
await rejects('POST', 'entities', { body: { organization_id: ORG, legal_name: 'Vitta', tax_identifier: '123' } }, 400, 'invalid_legal_entity');
assert.ok(!sent.some((entry) => entry.url.includes('rpc/')), 'entrada inválida não chega ao banco');

// Erros do banco viram mensagens fixas, sem SQL.
for (const [message, status, code] of [
  ['forbidden', 403, 'forbidden'],
  ['legal entity conflict', 409, 'entity_conflict'],
  ['invalid legal entity', 400, 'invalid_legal_entity'],
  ['legal entity has active units', 409, 'entity_has_active_units']
]) {
  reset((entry) => buyer(entry) ?? (entry.url.includes('rpc/') ? new Error(message) : []));
  await rejects('POST', 'entities', { body: { organization_id: ORG, legal_name: 'Vitta Alimentos' } }, status, code);
}

// Atualização e moeda base.
reset((entry) => (entry.url.includes('rpc/') ? null : []));
await call('PATCH', 'entities', { body: { entity_id: ENTITY_A, status: 'archived', organization_id: OTHER } });
{
  const rpcCall = sent.find((entry) => entry.url.includes('rpc/fin_update_legal_entity'));
  assert.deepEqual(rpcCall.body, { p_entity: ENTITY_A, p_legal_name: null, p_short_name: null, p_currency: null, p_status: 'archived' });
}
await rejects('PATCH', 'entities', { body: { entity_id: ENTITY_A, status: 'deleted' } }, 400);
await rejects('PATCH', 'entities', { body: { entity_id: ENTITY_A, currency: 'real' } }, 400, 'invalid_currency');
reset((entry) => buyer(entry) ?? null);
await call('POST', 'entities/currency', { body: { organization_id: ORG, base_currency: 'usd' } });
assert.equal(sent.find((entry) => entry.url.includes('rpc/fin_set_base_currency')).body.p_currency, 'USD');
await rejects('POST', 'entities/currency', { body: { organization_id: ORG, base_currency: 'dólar' } }, 400, 'invalid_currency');

// Escopo de membro: escopo restrito vazio é recusado antes do banco.
reset(buyer);
await rejects('PUT', 'entity-scopes', { body: { organization_id: ORG, user_id: ACTOR, scope: 'entities', entity_ids: [] } }, 400, 'invalid_scope');
await rejects('PUT', 'entity-scopes', { body: { organization_id: ORG, user_id: 'x', scope: 'group' } }, 400);
assert.ok(!sent.some((entry) => entry.url.includes('rpc/')));
reset((entry) => buyer(entry) ?? null);
await call('PUT', 'entity-scopes', { body: { organization_id: ORG, user_id: ACTOR, scope: 'entities', entity_ids: [ENTITY_A, ENTITY_B] } });
assert.deepEqual(sent.find((entry) => entry.url.includes('rpc/fin_set_member_entity_scope')).body, { p_org: ORG, p_user: ACTOR, p_scope: 'entities', p_entities: [ENTITY_A, ENTITY_B] });
reset((entry) => buyer(entry) ?? (entry.url.includes('rpc/') ? new Error('invalid scope') : []));
await rejects('PUT', 'entity-scopes', { body: { organization_id: ORG, user_id: ACTOR, scope: 'entities', entity_ids: [ENTITY_A] } }, 400, 'invalid_scope');

// Leitura de escopos: e-mail nunca sai; concessões agrupadas por pessoa.
reset((entry) => buyer(entry)
  ?? (entry.url.includes('fin_members') ? [{ user_id: ACTOR, role: 'finance_manager', entity_scope: 'entities', display_name: 'Ana', job_title: 'Tesouraria' }]
    : entry.url.includes('fin_member_entity_grants') ? [{ user_id: ACTOR, entity_id: ENTITY_A }] : []));
{
  const res = await call('GET', 'entity-scopes', { url: `/api/finance/entity-scopes?organization_id=${ORG}` });
  assert.deepEqual(res.payload.rows[0].entity_ids, [ENTITY_A]);
  assert.ok(!JSON.stringify(res.payload).includes('@'));
  assert.ok(!sent.some((entry) => /email/.test(entry.url)), 'nenhuma consulta pede e-mail');
}

// Consolidado: leituras sob RLS, nenhuma RPC privilegiada, definição explícita.
reset((entry) => buyer(entry)
  ?? (entry.url.includes('fin_legal_entities') ? [{ id: ENTITY_A, legal_name: 'Alimentos', kind: 'legal_entity', currency: 'BRL' }]
    : entry.url.includes('fin_rfqs') ? [{ id: RFQ, status: 'open', legal_entity_id: ENTITY_A }]
      : entry.url.includes('fin_contracts') ? []
        : entry.url.includes('base_currency') ? [{ base_currency: 'BRL' }] : []));
{
  const res = await call('GET', 'entity-summary', { url: `/api/finance/entity-summary?organization_id=${ORG}` });
  assert.equal(res.payload.rows.length, 1);
  assert.equal(res.payload.rows[0].rfqs_open, 1);
  assert.match(res.payload.definition, /Sem soma de valores entre moedas/);
  assert.ok(!sent.some((entry) => entry.url.includes('rpc/')));
  assert.ok(sent.filter((entry) => entry.url.includes('fin_rfqs') || entry.url.includes('fin_contracts')).every((entry) => entry.url.includes(`organization_id=eq.${ORG}`)));
}

// Reatribuição: identificadores validados; null é "nível de grupo".
reset(() => null);
await call('POST', 'rfq-entity', { body: { rfq_id: RFQ, legal_entity_id: null } });
assert.deepEqual(sent[0].body, { p_rfq: RFQ, p_entity: null });
await rejects('POST', 'rfq-entity', { body: { rfq_id: RFQ, legal_entity_id: 'abc' } }, 400);
await rejects('POST', 'contract-entity', { body: { contract_id: RFQ } }, 400);
reset(() => new Error('legal entity already assigned'));
await rejects('POST', 'contract-entity', { body: { contract_id: RFQ, legal_entity_id: ENTITY_A } }, 409, 'entity_already_assigned');

// RFQ: com entidade usa a RPC dedicada; filtro de lista validado.
reset((entry) => buyer(entry) ?? (entry.url.includes('rpc/') ? RFQ : []));
await call('POST', 'rfqs', { body: { organization_id: ORG, product: 'credit', title: 'Capital de giro DEMO', legal_entity_id: ENTITY_A, demand: { amount: 100000, purpose: 'capital_de_giro', term_months: 12 } } });
{
  const rpcCall = sent.find((entry) => entry.url.includes('rpc/'));
  assert.ok(rpcCall.url.endsWith('rpc/fin_create_rfq_in_entity'));
  assert.equal(rpcCall.body.p_entity, ENTITY_A);
  assert.equal(rpcCall.body.p_usage, null);
}
reset(buyer);
await rejects('POST', 'rfqs', { body: { organization_id: ORG, product: 'credit', title: 'Capital de giro DEMO', legal_entity_id: 'nope', demand: { amount: 100000, purpose: 'capital_de_giro', term_months: 12 } } }, 400);
assert.ok(!sent.some((entry) => entry.url.includes('rpc/')));
reset((entry) => buyer(entry) ?? []);
await call('GET', 'rfqs', { url: `/api/finance/rfqs?organization_id=${ORG}&legal_entity_id=group` });
assert.ok(sent.some((entry) => entry.url.includes('legal_entity_id=is.null')));
reset((entry) => buyer(entry) ?? []);
await rejects('GET', 'rfqs', { url: `/api/finance/rfqs?organization_id=${ORG}&legal_entity_id=1%20or%201` }, 400);

console.log('Multi-entity: entrada, árvore, consolidação sem soma entre moedas, API sob JWT do usuário, escrita só por RPC e erros traduzidos aprovados.');

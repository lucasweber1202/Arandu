import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';

// Testes de fronteira da API financeira. Nada aqui fala com o Supabase real:
// o `fetch` é substituído para inspecionar exatamente o que sairia daqui.

process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const BUYER = '00000000-0000-4000-8000-0000000000b1';
const PROVIDER_ORG = '00000000-0000-4000-8000-0000000000c1';
const OTHER_ORG = '00000000-0000-4000-8000-0000000000d1';
const PROPOSAL = '00000000-0000-4000-8000-0000000000e1';
const RFQ = '00000000-0000-4000-8000-0000000000f1';
const ACTOR = '00000000-0000-4000-8000-0000000000a1';

let sent = [];
let responder = () => [];

globalThis.fetch = async (url, options = {}) => {
  const entry = {
    url: String(url),
    method: options.method || 'GET',
    body: options.body ? JSON.parse(options.body) : null,
    authorization: options.headers?.Authorization,
    apikey: options.headers?.apikey
  };
  sent.push(entry);
  const payload = responder(entry);
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

function request(method, { body = null, url = '/api/finance/rfqs' } = {}) {
  const stream = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  return Object.assign(stream, { method, url, headers: {} });
}

function response() {
  return {
    headers: {},
    setHeader(key, value) { this.headers[key] = value; },
    end(value) { this.payload = JSON.parse(value); }
  };
}

const deps = {
  requireUser: async () => ({ user: { id: ACTOR }, accessToken: 'user-jwt', headers: {} }),
  enforceRateLimit: async () => {}
};

function reset(handler = () => []) {
  sent = [];
  responder = handler;
}

const orgRow = (id, kind) => [{ id, legal_name: 'Demo', kind, country: 'BR' }];

async function call(method, path, options = {}) {
  const res = response();
  await handleFinance(request(method, { ...options, url: options.url || `/api/finance/${path}` }), res, path, deps);
  return res;
}

async function rejects(method, path, options, code) {
  await assert.rejects(
    () => call(method, path, options),
    (error) => {
      assert.equal(error.status, code, `${path}: esperado ${code}, recebido ${error.status} (${error.message})`);
      return true;
    }
  );
}

// ------------------------------------------- catálogo público de produtos

reset();
{
  const res = await call('GET', 'products');
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.products.length, 2);
  assert.equal(sent.length, 0, 'catálogo de produtos não deve consultar o banco');
  assert.ok(res.payload.notice.includes('não recomenda'));
}

// ------------------------------------------------- identificadores forjados

reset(() => []);
await rejects('GET', 'rfqs', { url: '/api/finance/rfqs?organization_id=nao-e-uuid' }, 400);
await rejects('GET', 'rfqs', { url: "/api/finance/rfqs?organization_id=1' or '1'='1" }, 400);
assert.equal(sent.length, 0, 'organization_id inválido não pode chegar ao banco');

// Organização que o RLS não devolve vira 403, sem vazar se ela existe.
reset(() => []);
await rejects('GET', 'rfqs', { url: `/api/finance/rfqs?organization_id=${OTHER_ORG}` }, 403);

// ------------------------------------------------------ mass assignment

reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : [{ id: RFQ }]));
{
  await call('POST', 'rfqs', {
    body: {
      organization_id: BUYER, product: 'credit', title: 'Capital de giro DEMO',
      demand: {
        amount: 500000, purpose: 'capital_de_giro', term_months: 24,
        // Campos privilegiados injetados pelo navegador.
        status: 'contracted', owner_id: ACTOR, organization_id: OTHER_ORG, internal_rating: 'AAA'
      },
      status: 'contracted', owner_id: OTHER_ORG
    }
  });
  const rpcCall = sent.find((entry) => entry.url.includes('rpc/fin_create_rfq'));
  assert.deepEqual(rpcCall.body.p_demand, { amount: 500000, purpose: 'capital_de_giro', term_months: 24 });
  assert.equal(rpcCall.body.p_org, BUYER);
  assert.ok(!('status' in rpcCall.body) && !('owner_id' in rpcCall.body));
  assert.equal(rpcCall.authorization, 'Bearer user-jwt');
  // Nenhuma chamada usa a chave de serviço: o RLS continua sendo a fronteira.
  assert.ok(sent.every((entry) => entry.apikey === 'test-anon-key'));
}

// Organização de provedor não abre RFQ de comprador.
reset(() => orgRow(PROVIDER_ORG, 'PROVIDER'));
await rejects('POST', 'rfqs', { body: { organization_id: PROVIDER_ORG, product: 'credit', title: 'X DEMO', demand: {} } }, 400);

// Produto desconhecido não cria RFQ.
reset(() => orgRow(BUYER, 'BUYER'));
await rejects('POST', 'rfqs', { body: { organization_id: BUYER, product: 'cripto', title: 'X DEMO', demand: {} } }, 400);

// Demanda inválida não chega ao banco.
reset(() => orgRow(BUYER, 'BUYER'));
await rejects('POST', 'rfqs', { body: { organization_id: BUYER, product: 'credit', title: 'Giro DEMO', demand: { amount: -5, purpose: 'outro', term_months: 12 } } }, 400);
assert.ok(!sent.some((entry) => entry.url.includes('rpc/fin_create_rfq')));

// ---------------------------------------------- spoofing de provedor

reset((entry) => (entry.url.includes('fin_proposals') ? [{ id: PROPOSAL, product: 'credit', status: 'draft', provider_organization_id: PROVIDER_ORG }] : [1]));
{
  await call('POST', 'proposals', {
    body: {
      proposal_id: PROPOSAL,
      // O corpo tenta declarar outro produto e outra identidade de provedor.
      product: 'acquiring', provider_organization_id: OTHER_ORG,
      terms: {
        institution: 'Banco Alfa Demo', product_name: 'Giro', offered_amount: 300000,
        interest_rate_month: 1.9, term_months: 24,
        mdr_debit: 0.1, status: 'accepted', provider_organization_id: OTHER_ORG
      }
    }
  });
  const submit = sent.find((entry) => entry.url.includes('rpc/fin_submit_proposal'));
  // O produto veio da linha do banco (credit), então campos de adquirência caem.
  assert.deepEqual(Object.keys(submit.body.p_terms).sort(), ['institution', 'interest_rate_month', 'offered_amount', 'product_name', 'term_months']);
  assert.equal(submit.body.p_proposal, PROPOSAL);
  assert.ok(!('p_provider_org' in submit.body));
}

// Aceitar convite exige organização provedora da qual a conta é membro.
reset(() => orgRow(PROVIDER_ORG, 'BUYER'));
await rejects('POST', 'invites/accept', { body: { token: 'a'.repeat(64), provider_organization_id: PROVIDER_ORG } }, 400);
reset(() => []);
await rejects('POST', 'invites/accept', { body: { token: 'nao-e-token', provider_organization_id: PROVIDER_ORG } }, 400);
assert.equal(sent.length, 0);

// ------------------------------------------------------------- comparação

reset((entry) => {
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, product: 'credit', demand: { amount: 500000 }, status: 'comparing', organization_id: BUYER }];
  if (entry.url.includes('fin_proposal_versions')) {
    return [
      { proposal_id: 'p1', version: 1, terms: { institution: 'Alfa Demo', interest_rate_month: 1.7, term_months: 24 }, submitted_at: '2026-01-02T00:00:00Z' },
      { proposal_id: 'p2', version: 1, terms: { institution: 'Beta Demo', interest_rate_month: 2.2, term_months: 36 }, submitted_at: '2026-01-03T00:00:00Z' }
    ];
  }
  if (entry.url.includes('fin_proposals')) {
    return [
      { id: 'p1', provider_id: BUYER, provider_organization_id: PROVIDER_ORG, status: 'submitted', current_version: 1 },
      { id: 'p2', provider_id: OTHER_ORG, provider_organization_id: OTHER_ORG, status: 'submitted', current_version: 1 }
    ];
  }
  if (entry.url.includes('fin_providers')) return [{ id: BUYER, name: 'Banco Alfa Demo', kind: 'bank' }, { id: OTHER_ORG, name: 'Fintech Beta Demo', kind: 'fintech' }];
  return [];
});
{
  const res = await call('POST', 'comparison', { body: { rfq_id: RFQ } });
  assert.equal(res.payload.comparison.columns.length, 2);
  assert.equal(res.payload.weighted.applied, false, 'sem pesos do usuário não existe ordenação ponderada');
  assert.ok(res.payload.comparison.notice.includes('não recomenda'));

  const weightedRes = await call('POST', 'comparison', { body: { rfq_id: RFQ, weights: { interest_rate_month: 70, term_months: 30 } } });
  assert.equal(weightedRes.payload.weighted.applied, true);
  assert.equal(weightedRes.payload.weighted.notice, 'Resultado conforme os pesos definidos por você.');
}

// ------------------------------------------------------------- transições

reset(() => []);
await rejects('POST', 'transition', { body: { kind: 'rfq', id: RFQ, from: 'draft', status: 'decided' } }, 409);
await rejects('POST', 'transition', { body: { kind: 'rfq', id: RFQ, from: 'draft', status: 'qualquer-coisa' } }, 409);
await rejects('POST', 'transition', { body: { kind: 'orcamento', id: RFQ, from: 'draft', status: 'open' } }, 400);
assert.equal(sent.length, 0, 'transição inválida não chega ao banco');

reset(() => []);
{
  await call('POST', 'transition', { body: { kind: 'rfq', id: RFQ, from: 'draft', status: 'open' } });
  const transition = sent.find((entry) => entry.url.includes('rpc/fin_transition'));
  assert.deepEqual(transition.body, { p_kind: 'rfq', p_id: RFQ, p_status: 'open' });
}

// ------------------------------------------------------ contratos e rotas

reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : []));
await rejects('POST', 'contracts', { body: { decision_id: RFQ, starts_on: '2026-05-01', ends_on: '2026-01-01' } }, 400);
await rejects('POST', 'contracts', { body: { decision_id: RFQ, starts_on: '2026-05-01', ends_on: '2027-01-01', document_reference: 'http://inseguro.example' } }, 400);
await rejects('GET', 'nao-existe', {}, 404);
await rejects('DELETE', 'products', {}, 404);

console.log('Financial Procurement API: allowlist de campos, isolamento de organização, anti-spoofing de provedor, transições e comparação neutra aprovados.');

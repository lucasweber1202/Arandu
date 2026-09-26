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
const DECISION_ID = '00000000-0000-4000-8000-0000000000a2';

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
  if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'BUYER');
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

// ------------------------------------------------- completar organização

reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : []));
{
  const res = await call('PATCH', 'organizations', {
    body: { organization_id: BUYER, trade_name: 'Acme', tax_identifier: '11.222.333/0001-81', sector: 'Indústria', revenue_band: '30m_300m' }
  });
  const rpcCall = sent.find((entry) => entry.url.includes('rpc/fin_update_organization'));
  assert.equal(rpcCall.body.p_tax_identifier, '11222333000181', 'CNPJ deve ser normalizado para dígitos');
  // O produto afirma formato conferido, nunca existência verificada.
  assert.deepEqual(res.payload.tax_identifier, { format_valid: true, externally_verified: false });
}
reset(() => orgRow(BUYER, 'BUYER'));
await rejects('PATCH', 'organizations', { body: { organization_id: BUYER, tax_identifier: '11222333000182' } }, 400);
await rejects('PATCH', 'organizations', { body: { organization_id: BUYER, revenue_band: 'gigante' } }, 400);
assert.ok(!sent.some((entry) => entry.url.includes('rpc/fin_update_organization')), 'CNPJ inválido não chega ao banco');

// ------------------------------------------------ evidência regulatória

reset(() => []);
await rejects('POST', 'providers/evidence', {
  body: { provider_id: BUYER, regulator_authority: 'A', regulator_registry: '1', regulator_evidence_url: 'http://x.example', regulator_checked_at: '2026-01-01' }
}, 400);
await rejects('POST', 'providers/evidence', {
  body: { provider_id: BUYER, regulator_authority: 'A', regulator_registry: '1', regulator_evidence_url: 'https://x.example', regulator_checked_at: 'ontem' }
}, 400);
assert.equal(sent.length, 0, 'evidência malformada não chega ao banco');

// --------------------------------------------------- mix de adquirência

reset(() => orgRow(BUYER, 'BUYER'));
// 80 + 60 + 40 = 180% é erro de preenchimento, não arredondamento.
await rejects('POST', 'rfqs', {
  body: {
    organization_id: BUYER, product: 'acquiring', title: 'Adquirência DEMO',
    demand: { monthly_volume: 100000, share_debit: 80, share_credit_cash: 60, share_credit_installment: 40 }
  }
}, 400);
assert.ok(!sent.some((entry) => entry.url.includes('rpc/fin_create_rfq')));

reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : [{ id: RFQ }]));
{
  // 95% passa, mas o desvio volta como aviso em vez de ser normalizado calado.
  const res = await call('POST', 'rfqs', {
    body: {
      organization_id: BUYER, product: 'acquiring', title: 'Adquirência DEMO',
      demand: { monthly_volume: 100000, share_debit: 40, share_credit_cash: 30, share_credit_installment: 20, share_pix: 5 }
    }
  });
  assert.equal(res.payload.warnings.length, 1);
  assert.match(res.payload.warnings[0], /95%/);
  const rpcCall = sent.find((entry) => entry.url.includes('rpc/fin_create_rfq'));
  assert.equal(rpcCall.body.p_demand.share_pix, 5, 'o valor informado não pode ser alterado pelo servidor');
}

// ------------------------------------------- mensagens úteis do upstream

// A mensagem do Postgres nunca atravessa: o que chega é o motivo em português,
// sem revelar tabela, policy nem a existência de registro de terceiro.
reset((entry) => {
  if (entry.url.includes('fin_organizations')) return orgRow(PROVIDER_ORG, 'PROVIDER');
  const error = new Error('invalid invitation'); error.status = 400; throw error;
});
await assert.rejects(
  () => call('POST', 'invites/accept', { body: { token: 'a'.repeat(64), provider_organization_id: PROVIDER_ORG } }),
  (error) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /expirado|usado|revogado/);
    assert.ok(!/invalid invitation|fin_|supabase|postgres/i.test(error.message), 'mensagem crua do banco vazou');
    return true;
  }
);

reset((entry) => {
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, organization_id: BUYER, product: 'credit', status: 'comparing', demand: {} }];
  const error = new Error('decision already recorded'); error.status = 400; throw error;
});
await assert.rejects(
  () => call('POST', 'decisions', { body: { rfq_id: RFQ, proposal_id: PROPOSAL } }),
  (error) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /já tem uma decisão/);
    return true;
  }
);

// --------------------------------------------- documentos e tarefas

reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : [{ id: PROPOSAL }]));
await rejects('POST', 'documents', { body: { organization_id: BUYER, entity_type: 'rfq', entity_id: RFQ, title: 'Contrato', reference_url: 'http://inseguro.example' } }, 400);
await rejects('POST', 'documents', { body: { organization_id: BUYER, entity_type: 'inventado', entity_id: RFQ, title: 'X', reference_url: 'https://ok.example' } }, 400);
{
  const res = await call('POST', 'documents', {
    body: { organization_id: BUYER, entity_type: 'rfq', entity_id: RFQ, title: 'Proposta assinada', reference_url: 'https://drive.example/doc', storage_path: '/etc/passwd' }
  });
  assert.equal(res.payload.ok, true);
  const write = sent.find((entry) => entry.method === 'POST' && entry.url.includes('fin_documents'));
  // Não existe upload nesta fase: nenhum caminho de storage é aceito.
  assert.ok(!('storage_path' in write.body));
  assert.equal(write.body.created_by, ACTOR);
}
reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : []));
await rejects('PATCH', 'tasks', { body: { organization_id: BUYER, task_id: RFQ, status: 'inventado' } }, 400);

// ----------------------------------- comparação é da empresa compradora

reset((entry) => {
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, organization_id: BUYER, product: 'credit', status: 'comparing', demand: {} }];
  if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'PROVIDER');
  return [];
});
await rejects('POST', 'comparison', { body: { rfq_id: RFQ } }, 400);

// --------------------------------- visão do provedor não vaza concorrente

reset((entry) => {
  if (entry.url.includes('fin_organizations')) return orgRow(PROVIDER_ORG, 'PROVIDER');
  if (entry.url.includes('fin_proposal_versions')) return [{ proposal_id: PROPOSAL, version: 1, terms: { institution: 'Meu Banco' }, submitted_at: '2026-01-01T00:00:00Z', rfq_revision: 2 }];
  if (entry.url.includes('fin_proposals')) return [{ id: PROPOSAL, rfq_id: RFQ, product: 'credit', status: 'submitted', current_version: 1 }];
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, title: 'RFQ', product: 'credit', status: 'collecting', demand: { amount: 500000 }, description: 'necessidade', revision: 3 }];
  return [];
});
{
  const res = await call('GET', 'assignments', { url: `/api/finance/assignments?organization_id=${PROVIDER_ORG}` });
  const row = res.payload.rows[0];
  // O provedor recebe a necessidade para conseguir responder...
  assert.equal(row.demand.amount, 500000);
  assert.equal(row.title, 'RFQ');
  // A linhagem vem da versão enviada: a proposta respondeu à revisão 2 e a
  // RFQ já está na 3. Antes, o campo não era lido e aparecia sempre como 1.
  assert.equal(row.submitted_rfq_revision, 2);
  assert.equal(row.rfq_revision, 3);
  assert.equal(row.history[0].rfq_revision, 2);
  assert.match(sent.find((entry) => entry.url.includes('fin_proposal_versions')).url, /rfq_revision/);
  // ...e nada sobre concorrentes, notas internas ou comparação.
  const serialized = JSON.stringify(res.payload);
  assert.ok(!/notes|comparison|weights|decision/i.test(serialized), 'visão do provedor expôs campo indevido');
  // A consulta de propostas é sempre filtrada pela própria organização.
  const proposalQuery = sent.find((entry) => entry.url.includes('fin_proposals'));
  assert.match(proposalQuery.url, new RegExp(`provider_organization_id=eq.${PROVIDER_ORG}`));
}

// ------------------------------------------ overview sem consulta por RFQ

reset((entry) => {
  if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'BUYER');
  if (entry.url.includes('fin_rfqs')) return Array.from({ length: 12 }, (_, index) => ({
    id: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
    organization_id: BUYER, product: 'credit', status: 'open', demand: { amount: 1000 }
  }));
  return [];
});
{
  await call('GET', 'overview', { url: `/api/finance/overview?organization_id=${BUYER}` });
  // Com 12 RFQs o número de consultas não pode crescer com a quantidade.
  assert.ok(sent.length <= 8, `overview fez ${sent.length} consultas para 12 RFQs`);
}

// =========================================================================
// Reteste do threat model sobre o código novo desta rodada
// =========================================================================

// --- aceite de termos não pode ser forjado nem inventado ---

reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : []));
await rejects('POST', 'terms', { body: { organization_id: BUYER, terms_version: 'v1' } }, 400);
await rejects('POST', 'terms', { body: { organization_id: BUYER, terms_version: '2026-09-23', context: 'legal' } }, 400);
assert.ok(!sent.some((entry) => entry.url.includes('rpc/fin_accept_terms')), 'versão inválida não chega ao banco');
{
  const res = await call('POST', 'terms', { body: { organization_id: BUYER, terms_version: '2026-09-23-pilot' } });
  // O produto nunca deixa de dizer que o texto não foi revisado.
  assert.equal(res.payload.legal_review_required, true);
}

// --- sinais de produto: vocabulário fechado, metadata não passa ---

reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : []));
await rejects('POST', 'signals', { body: { organization_id: BUYER, event: 'taxa_negociada', entity_type: 'rfq', entity_id: RFQ } }, 400);
await rejects('POST', 'signals', { body: { organization_id: BUYER, event: 'comparison_viewed', entity_type: 'segredo', entity_id: RFQ } }, 400);
assert.equal(sent.filter((entry) => entry.url.includes('rpc/fin_record_client_event')).length, 0);
{
  await call('POST', 'signals', {
    body: {
      organization_id: BUYER, event: 'comparison_viewed', entity_type: 'rfq', entity_id: RFQ,
      // Tentativa de carregar termo financeiro junto do sinal.
      metadata: { interest_rate_month: 1.72 }, terms: { mdr_debit: 0.9 }
    }
  });
  const call_ = sent.find((entry) => entry.url.includes('rpc/fin_record_client_event'));
  assert.deepEqual(Object.keys(call_.body).sort(), ['p_entity_id', 'p_entity_type', 'p_event', 'p_org']);
  assert.ok(!/interest_rate|mdr/i.test(JSON.stringify(call_.body)), 'termo financeiro entrou no sinal');
}

// --- exportação é do comprador e não vira parecer ---

reset((entry) => {
  if (entry.url.includes('fin_organizations')) return orgRow(PROVIDER_ORG, 'PROVIDER');
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, organization_id: BUYER, product: 'credit', status: 'decided', demand: {} }];
  return [];
});
await rejects('GET', 'export', { url: `/api/finance/export?rfq_id=${RFQ}` }, 400);

reset((entry) => {
  if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'BUYER');
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, organization_id: BUYER, product: 'credit', status: 'decided', demand: { amount: 1000 } }];
  if (entry.url.includes('fin_decisions')) return [{ id: DECISION_ID, rfq_id: RFQ, proposal_id: PROPOSAL, decided_at: '2026-09-23T00:00:00Z', criteria: {}, rationale: null, snapshot: {} }];
  return [];
});
{
  const res = await call('GET', 'export', { url: `/api/finance/export?rfq_id=${RFQ}` });
  assert.ok(res.payload.export.disclaimer.includes('não emite recomendação'));
  assert.ok(!/recommended|best_provider|ranking/i.test(JSON.stringify(res.payload.export)));
}

// --- métricas do piloto: contagens, nunca benchmark ---

reset((entry) => {
  if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'BUYER');
  if (entry.url.includes('fin_events')) return [
    { entity_type: 'organization', entity_id: BUYER, event_type: 'buyer_onboarded', happened_at: '2026-09-01T00:00:00Z' },
    { entity_type: 'rfq', entity_id: RFQ, event_type: 'rfq_created', happened_at: '2026-09-01T00:00:00Z' },
    { entity_type: 'rfq', entity_id: RFQ, event_type: 'provider_invited', happened_at: '2026-09-01T01:00:00Z' },
    { entity_type: 'rfq', entity_id: RFQ, event_type: 'provider_invited', happened_at: '2026-09-01T01:00:00Z' },
    { entity_type: 'proposal', entity_id: PROPOSAL, event_type: 'proposal_submitted', happened_at: '2026-09-03T00:00:00Z' }
  ];
  return [];
});
{
  const res = await call('GET', 'pilot-metrics', { url: `/api/finance/pilot-metrics?organization_id=${BUYER}` });
  const metrics = res.payload.metrics;
  assert.equal(metrics.invites_sent, 2);
  assert.equal(metrics.proposals_submitted, 1);
  assert.equal(metrics.response_rate, 0.5);
  assert.equal(metrics.days_to_first_proposal, 2);
  // Dois convites, nenhum aceito ainda: zero é medição de verdade aqui.
  assert.equal(metrics.invite_acceptance_rate, 0);
  assert.ok(metrics.note.includes('Não são benchmark'));
}
reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : []));
{
  const res = await call('GET', 'pilot-metrics', { url: `/api/finance/pilot-metrics?organization_id=${BUYER}` });
  // Sem tráfego nenhum, as taxas são nulas em vez de zero disfarçado de medição.
  assert.equal(res.payload.metrics.response_rate, null);
  assert.equal(res.payload.metrics.days_to_first_proposal, null);
  assert.equal(res.payload.metrics.proposals_per_rfq, null);
}

console.log('Financial Procurement API: allowlist de campos, isolamento de organização, anti-spoofing de provedor, transições, comparação neutra, CNPJ, mix de recebimentos, mensagens redigidas, consultas limitadas, aceite de termos, sinais fechados, exportação factual e métricas sem invenção aprovados.');


/* Enterprise approval boundary: only typed IDs and actions reach privileged RPCs. */
reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : []);
await rejects('POST', 'approvals/request', { body: { rfq_id: RFQ, proposal_id: PROPOSAL, approver_ids: [OTHER_ORG, 'forged'], rationale: 'Revisão' } }, 400);
assert.equal(sent.filter((entry) => entry.url.includes('rpc/fin_request_approval')).length, 0);
reset(() => []);
await rejects('POST', 'approvals/act', { body: { request_id: RFQ, action: 'force_approved' } }, 400);
assert.equal(sent.length, 0);
reset((entry) => {
  if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'BUYER');
  if (entry.url.includes('fin_approval_requests')) return [{ id: RFQ, organization_id: BUYER, rfq_id: RFQ, status: 'pending' }];
  if (entry.url.includes('fin_approval_steps')) return [{ id: PROPOSAL, request_id: RFQ, position: 1, approver_id: ACTOR, status: 'pending' }];
  return [];
});
{
  const res = await call('GET', 'approvals', { url: `/api/finance/approvals?organization_id=${BUYER}&rfq_id=${RFQ}` });
  assert.equal(res.payload.rows[0].steps[0].approver_id, ACTOR);
  assert.ok(sent.every((entry) => entry.authorization === 'Bearer user-jwt'));
}
reset(() => []);
await rejects('GET', 'approvals', { url: `/api/finance/approvals?organization_id=${OTHER_ORG}` }, 403);

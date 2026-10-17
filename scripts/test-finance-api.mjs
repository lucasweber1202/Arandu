import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance, withRenewalWindow } from '../lib/api/domains/finance.mjs';
import { UPSTREAM_MESSAGES, upstream } from '../lib/api/domains/finance-core.mjs';
import { readFileSync } from 'node:fs';
import { createDocumentStorage, downloadName, signedUrlTtl } from '../lib/finance/document-storage.mjs';
import { createOpsMfa } from '../lib/finance/ops-access.mjs';

// Testes de fronteira da API financeira. Nada aqui fala com o Supabase real:
// o `fetch` é substituído para inspecionar exatamente o que sairia daqui.

process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

// Schema antigo deve ser diagnosticável, sem expor RPC, SQL ou dados do erro.
await assert.rejects(upstream(Promise.reject(Object.assign(new Error('private RPC signature'), {
  status: 404, details: { code: 'PGRST202', message: 'private RPC signature' }
}))), (error) => error.status === 503 && error.code === 'schema_incompatible' && !error.message.includes('RPC'));

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
    prefer: options.headers?.Prefer,
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
    statusCode: null,
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

// Datas de contrato são DATE: a API usa calendário UTC, como seus jobs, sem
// depender do fuso do processo ou da duração dos dias locais durante DST.
{
  const originalNow = Date.now;
  const originalTimezone = process.env.TZ;
  try {
    for (const timezone of ['UTC', 'America/Sao_Paulo', 'America/New_York', 'Pacific/Kiritimati']) {
      process.env.TZ = timezone;
      for (const [now, endsOn, expected] of [
        ['2026-10-15T00:00:00Z', '2027-01-08', 85],
        ['2026-10-15T12:00:00Z', '2027-01-08', 85],
        ['2026-10-15T23:59:59.999Z', '2027-01-08', 85],
        ['2026-10-16T00:00:00Z', '2027-01-08', 84],
        ['2026-10-15T23:59:59Z', '2026-10-15', 0],
        ['2026-10-15T23:59:59Z', '2026-10-14', -1],
        ['2026-12-31T23:59:59Z', '2027-01-01', 1],
        ['2028-02-28T23:59:59Z', '2028-03-01', 2],
        ['2026-03-08T23:30:00-04:00', '2026-03-10', 1],
        ['2026-11-01T23:30:00-05:00', '2026-11-03', 1]
      ]) {
        Date.now = () => Date.parse(now);
        const contract = { ends_on: endsOn, renewal_notice_days: 30 };
        const result = withRenewalWindow(contract);
        assert.equal(result.days_to_end, expected, `${timezone} ${now} → ${endsOn}`);
        assert.deepEqual(contract, { ends_on: endsOn, renewal_notice_days: 30 });
      }
    }
    assert.equal(withRenewalWindow({ ends_on: 'invalid' }).days_to_end, null);
    assert.equal(withRenewalWindow({ ends_on: '2027-01-08', renewal_notice_days: 30 }).review_from, '2026-12-09');
  } finally {
    Date.now = originalNow;
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
}

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

// Criação idempotente: a chave vira cabeçalho para o PostgREST; repetição
// recusada pelo banco devolve a RFQ já registrada, sem criar outra.
{
  const KEY = '7c1d1e9a-3b44-4f0a-9d2e-1a2b3c4d5e6f';
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    seen.push({ url: target, key: options.headers?.['x-arandu-request-key'] });
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (target.includes('fin_organizations')) return reply(orgRow(BUYER, 'BUYER'));
    if (target.includes('rpc/fin_create_rfq')) return reply({ code: 'P0001', message: 'duplicate request' }, 400);
    if (target.includes('fin_request_receipts')) return reply([{ rfq_id: RFQ }]);
    return reply([]);
  };
  try {
    const body = { organization_id: BUYER, product: 'credit', title: 'Capital de giro DEMO', demand: { amount: 500000, purpose: 'capital_de_giro', term_months: 24 }, request_key: KEY.toUpperCase() };
    const replay = await call('POST', 'rfqs', { body });
    assert.deepEqual({ id: replay.payload.id, replayed: replay.payload.replayed }, { id: RFQ, replayed: true });
    assert.equal(seen.find((entry) => entry.url.includes('rpc/fin_create_rfq')).key, KEY, 'chave normalizada repassada ao banco');
    assert.match(seen.find((entry) => entry.url.includes('fin_request_receipts')).url, new RegExp(`request_key=eq\\.${KEY}&organization_id=eq\\.${BUYER}`));
    // Sem chave, a recusa não é tratada como repetição.
    delete body.request_key;
    await rejects('POST', 'rfqs', { body }, 409);
    await rejects('POST', 'rfqs', { body: { ...body, request_key: 'nao-e-uuid' } }, 400);
  } finally { globalThis.fetch = original; }
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
      { proposal_id: 'p1', version: 2, terms: { index: 'pre', institution: 'Alfa Demo', interest_rate_month: 1.7, term_months: 24 }, submitted_at: '2026-01-02T00:00:00Z' },
      { proposal_id: 'p1', version: 1, terms: { index: 'pre', interest_rate_month: 2.5 }, submitted_at: '2025-12-01T00:00:00Z' },
      { proposal_id: 'p2', version: 1, terms: { index: 'pre', institution: 'Beta Demo', interest_rate_month: 2.2, term_months: 36 }, submitted_at: '2026-01-03T00:00:00Z' }
    ];
  }
  if (entry.url.includes('fin_proposals')) {
    return [
      { id: 'p1', provider_id: BUYER, provider_organization_id: PROVIDER_ORG, status: 'submitted', current_version: 2 },
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
  assert.equal(res.payload.comparison.columns[0].previous_version.version, 1);
  assert.ok(res.payload.comparison.columns[0].changed_keys.includes('interest_rate_month'));
  assert.equal(res.payload.comparison.columns[0].provenance.document, null);
  assert.ok(sent.every(entry => entry.authorization === 'Bearer user-jwt'), 'consulta usa JWT do usuário e RLS');

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

// Recusa por destinatário ou vínculo chega como null do banco (a trilha fica só
// no console operacional) e sai exatamente como um token inválido.
let invalidMessage = null;
await assert.rejects(() => call('POST', 'invites/accept', { body: { token: 'a'.repeat(64), provider_organization_id: PROVIDER_ORG } }),
  (error) => { invalidMessage = error.message; return true; });
reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(PROVIDER_ORG, 'PROVIDER') : null));
await assert.rejects(
  () => call('POST', 'invites/accept', { body: { token: 'a'.repeat(64), provider_organization_id: PROVIDER_ORG } }),
  (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, 'invite_invalid');
    assert.equal(error.message, invalidMessage, 'recusa por destinatário precisa ser indistinguível de token inválido');
    assert.doesNotMatch(error.message, /@|organiza/i, 'erro externo não pode citar e-mail ou organização esperada');
    return true;
  }
);

reset((entry) => {
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, organization_id: BUYER, product: 'credit', status: 'comparing', demand: {} }];
  const error = new Error('decision already recorded'); error.status = 400; throw error;
});
await assert.rejects(
  () => call('POST', 'decisions', { body: { rfq_id: RFQ, proposal_id: PROPOSAL, expected_version: 2 } }),
  (error) => {
    assert.equal(error.status, 409);
    assert.match(error.message, /já tem uma decisão/);
    return true;
  }
);

// Decisão sem a versão exibida é recusada antes de qualquer RPC (cliente antigo).
reset((entry) => {
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, organization_id: BUYER, product: 'credit', status: 'comparing', demand: {} }];
  throw new Error('nenhuma RPC deveria ser chamada sem expected_version');
});
for (const expected of [undefined, null, 0, -1, 1.5, '2a']) {
  await assert.rejects(() => call('POST', 'decisions', { body: { rfq_id: RFQ, proposal_id: PROPOSAL, expected_version: expected } }),
    (error) => error.status === 400 && error.code === 'expected_version_required');
}
// A versão vai para fin_record_decision_v2; versão desatualizada vira 409 acionável.
reset((entry) => {
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, organization_id: BUYER, product: 'credit', status: 'comparing', demand: {} }];
  assert.match(entry.url, /rpc\/fin_record_decision_v2$/);
  assert.equal(entry.body.p_expected_version, 3);
  const error = new Error('proposal version changed'); error.status = 400; throw error;
});
await assert.rejects(() => call('POST', 'decisions', { body: { rfq_id: RFQ, proposal_id: PROPOSAL, expected_version: 3 } }),
  (error) => error.status === 409 && error.code === 'proposal_version_changed' && /versão nova/.test(error.message) && /Nada foi registrado/.test(error.message));

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

// PostgREST can return HTTP 200 with an empty representation when RLS hides
// the row or a concurrent delete wins. Never report this as a successful edit.
reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : []);
await assert.rejects(call('PATCH', 'tasks', { body: { organization_id: BUYER, task_id: RFQ, status: 'done' } }),
  (error) => error.status === 404 && error.code === 'not_found');

// Atribuição persistida: a API projeta nomes apenas para IDs das tarefas que
// o RLS já devolveu e nunca aceita papel/proveniência do navegador.
{
  const ASSIGNEE = '00000000-0000-4000-8000-0000000000a3';
  const REMOVED = '00000000-0000-4000-8000-0000000000a4';
  reset((entry) => {
    if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'BUYER');
    if (entry.url.includes('fin_tasks?')) return [
      { id: RFQ, title: 'Tarefa visível', status: 'open', assignee_id: ASSIGNEE },
      { id: DECISION_ID, title: 'Atribuição removida', status: 'open', assignee_id: REMOVED },
      { id: '00000000-0000-4000-8000-0000000000a5', title: 'Sem responsável', status: 'open', assignee_id: null }
    ];
    if (entry.url.includes('fin_members?')) return [{ user_id: ASSIGNEE, display_name: 'Pessoa da organização' }];
    return [];
  });
  const listed = await call('GET', 'tasks', { url: `/api/finance/tasks?organization_id=${BUYER}` });
  assert.deepEqual(listed.payload.rows.map(({ assignee_id, assignee_name }) => [assignee_id, assignee_name]), [
    [ASSIGNEE, 'Pessoa da organização'], [REMOVED, null], [null, null]
  ]);
  assert.deepEqual(listed.payload.page, { limit: 200, has_more: false, next_cursor: null });
  const nameLookup = sent.find((entry) => entry.url.includes('fin_members?'));
  assert.match(nameLookup.url, new RegExp(`organization_id=eq\\.${BUYER}`));
  assert.match(nameLookup.url, new RegExp(`user_id=in\\.\\(${ASSIGNEE},${REMOVED}\\)`));
  assert.ok(!nameLookup.url.includes(OTHER_ORG), 'lookup never queries identities outside visible task assignees');

  reset((entry) => {
    if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'BUYER');
    if (entry.url.includes('fin_tasks?')) return [];
    return [];
  });
  await call('GET', 'tasks', { url: `/api/finance/tasks?organization_id=${BUYER}&status=done&unassigned=true&limit=25` });
  const filtered = new URL(sent.find((entry) => entry.url.includes('fin_tasks?')).url).searchParams;
  assert.equal(filtered.get('status'), 'eq.done');
  assert.equal(filtered.get('assignee_id'), 'is.null');
  assert.equal(filtered.get('limit'), '26', 'busca uma linha extra para calcular has_more sem count global');
  assert.equal(filtered.get('order'), 'due_on.asc.nullslast,created_at.asc,id.asc');
  await rejects('GET', 'tasks', { url: `/api/finance/tasks?organization_id=${BUYER}&status=archived` }, 400);
  await rejects('GET', 'tasks', { url: `/api/finance/tasks?organization_id=${BUYER}&assignee_id=${ASSIGNEE}&unassigned=true` }, 400);
  await rejects('GET', 'tasks', { url: `/api/finance/tasks?organization_id=${BUYER}&limit=201` }, 400);
  await rejects('GET', 'tasks', { url: `/api/finance/tasks?organization_id=${BUYER}&cursor=not-a-cursor` }, 400);
  reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : []);
  await call('GET', 'tasks', { url: `/api/finance/tasks?organization_id=${BUYER}&assignee_id=${ASSIGNEE}` });
  assert.equal(new URL(sent.find((entry) => entry.url.includes('fin_tasks?')).url).searchParams.get('assignee_id'), `eq.${ASSIGNEE}`);

  const pageRows = [
    { id: '00000000-0000-4000-8000-0000000000b1', title: 'Página 1', due_on: '2026-10-20', created_at: '2026-10-01T00:00:00.000Z', status: 'open' },
    { id: '00000000-0000-4000-8000-0000000000b2', title: 'Página 2', due_on: '2026-10-20', created_at: '2026-10-02T00:00:00.000Z', status: 'open' },
    { id: '00000000-0000-4000-8000-0000000000b3', title: 'Página 3', due_on: null, created_at: '2026-10-03T00:00:00.000Z', status: 'open' }
  ];
  reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : pageRows);
  const firstPage = await call('GET', 'tasks', { url: `/api/finance/tasks?organization_id=${BUYER}&limit=2` });
  assert.deepEqual(firstPage.payload.rows.map((row) => row.id), pageRows.slice(0, 2).map((row) => row.id));
  assert.equal(firstPage.payload.page.has_more, true);
  assert.ok(firstPage.payload.page.next_cursor);
  const cursorValue = JSON.parse(Buffer.from(firstPage.payload.page.next_cursor, 'base64url').toString('utf8'));
  assert.deepEqual(cursorValue, { due_on: '2026-10-20', created_at: pageRows[1].created_at, id: pageRows[1].id });
  reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : [pageRows[2]]);
  const lastPage = await call('GET', 'tasks', { url: `/api/finance/tasks?organization_id=${BUYER}&limit=2&cursor=${encodeURIComponent(firstPage.payload.page.next_cursor)}` });
  assert.deepEqual(lastPage.payload.rows.map((row) => row.id), [pageRows[2].id]);
  assert.equal(lastPage.payload.page.has_more, false);
  const continuation = new URL(sent.find((entry) => entry.url.includes('fin_tasks?')).url).searchParams.get('or');
  assert.match(continuation, /due_on\.gt\.2026-10-20/);
  assert.match(continuation, new RegExp(`id\\.gt\\.${pageRows[1].id}`));
  const nullDueCursor = Buffer.from(JSON.stringify({ due_on: null, created_at: pageRows[2].created_at, id: pageRows[2].id })).toString('base64url');
  reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : []);
  await call('GET', 'tasks', { url: `/api/finance/tasks?organization_id=${BUYER}&cursor=${nullDueCursor}` });
  const nullContinuation = new URL(sent.find((entry) => entry.url.includes('fin_tasks?')).url).searchParams.get('or');
  assert.match(nullContinuation, /and\(due_on\.is\.null,created_at\.gt\./);

  const taskBody = { organization_id: BUYER, title: 'Tarefa atribuída', assignee_id: ASSIGNEE,
    assignee_source: 'inherited', role: 'admin', created_by: OTHER_ORG, assignee_name: 'spoofed' };
  const assignmentMember = (entry) => entry.url.includes('fin_members?select=role') ? [{ role: 'admin' }] : [];
  reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : entry.method === 'POST' && entry.url.includes('fin_tasks') ? [{ id: RFQ, idempotency_key: 'private', idempotency_hash: 'private' }] : assignmentMember(entry));
  const createdTask = await call('POST', 'tasks', { body: taskBody });
  assert.equal(createdTask.statusCode, 201);
  assert.deepEqual(createdTask.payload.row, { id: RFQ }, 'successful creation has an ID and no private idempotency metadata');
  const insert = sent.find((entry) => entry.method === 'POST' && entry.url.includes('fin_tasks'));
  assert.deepEqual(insert.body, {
    organization_id: BUYER, title: 'Tarefa atribuída', due_on: null, related_type: null, related_id: null,
    created_by: ACTOR, assignee_id: ASSIGNEE, assignee_source: 'manual'
  });
  assert.equal(insert.authorization, 'Bearer user-jwt');
  const roleProbe = sent.find((entry) => entry.url.includes('fin_members?select=role'));
  assert.match(roleProbe.url, new RegExp(`organization_id=eq\\.${BUYER}`));
  assert.match(roleProbe.url, new RegExp(`user_id=eq\\.${ACTOR}`));
  assert.equal(roleProbe.authorization, 'Bearer user-jwt', 'actor authorization uses caller JWT and same-org membership');

  // A 2xx response from PostgREST without an inserted representation is not
  // proof of creation, including response loss or an upstream protocol error.
  for (const representation of [[], null, {}, [null], [{ id: null }], [{ id: 'invalid' }], [{ id: RFQ }, { id: DECISION_ID }]]) {
    reset(entry => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : representation);
    await assert.rejects(call('POST', 'tasks', { body: { organization_id: BUYER, title: 'Criação sem confirmação' } }),
      error => error.status === 409 && error.code === 'task_creation_unknown');
    assert.equal(sent.filter(entry => entry.method === 'POST' && entry.url.includes('fin_tasks')).length, 1, 'uncertain creation must not automatically retry the write');
  }

  const taskKey = '00000000-0000-4000-8000-0000000000a6';
  let storedTaskHash = null;
  reset((entry) => {
    if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'BUYER');
    if (entry.url.includes('fin_tasks?on_conflict=')) {
      assert.match(entry.url, /on_conflict=organization_id,created_by,idempotency_key/);
      assert.match(entry.prefer || '', /resolution=ignore-duplicates/);
      storedTaskHash ??= entry.body.idempotency_hash;
      return [];
    }
    if (entry.url.includes('fin_tasks?select=id,title')) return [{ id: DECISION_ID, title: 'Tarefa idempotente', status: 'open', idempotency_hash: storedTaskHash }];
    return [];
  });
  const retried = await call('POST', 'tasks', { body: { organization_id: BUYER, title: 'Tarefa idempotente', idempotency_key: taskKey } });
  assert.equal(retried.statusCode, 200, 'replay returns the already-created row');
  assert.equal(retried.payload.row.id, DECISION_ID);
  assert.ok(!Object.hasOwn(retried.payload.row, 'idempotency_hash'), 'internal hash is not projected');
  await assert.rejects(call('POST', 'tasks', { body: { organization_id: BUYER, title: 'Payload diferente', idempotency_key: taskKey } }),
    (error) => error.status === 409 && error.code === 'idempotency_key_reused');

  // A committed write may lose its network response. Retry the SAME intent
  // through the existing database uniqueness key, not a second logical task.
  let committed = null, creations = 0, attempts = 0;
  reset(entry => {
    if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'BUYER');
    if (entry.url.includes('fin_tasks?on_conflict=')) {
      attempts++;
      if (!committed) {
        creations++;
        committed = { id: RFQ, title: entry.body.title, status: 'open', idempotency_hash: entry.body.idempotency_hash };
        throw new TypeError('controlled response loss after commit');
      }
      return [];
    }
    if (entry.url.includes('fin_tasks?select=id,title')) return [committed];
    return [];
  });
  const intent = { organization_id: BUYER, title: 'Retry da mesma intenção', idempotency_key: '00000000-0000-4000-8000-0000000000a7' };
  await assert.rejects(call('POST', 'tasks', { body: intent }), /controlled response loss/);
  const recovered = await call('POST', 'tasks', { body: intent });
  assert.equal(recovered.statusCode, 200); assert.equal(recovered.payload.row.id, RFQ);
  assert.equal(creations, 1); assert.equal(attempts, 2);

  reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER')
    : entry.url.includes('fin_members?select=role') ? [{ role: 'admin' }]
      : entry.method === 'PATCH' && entry.url.includes('fin_tasks') ? [{ id: RFQ }] : []);
  await call('PATCH', 'tasks', { body: { organization_id: BUYER, task_id: RFQ, assignee_id: null, assignee_source: 'inherited' } });
  const unassign = sent.find((entry) => entry.method === 'PATCH' && entry.url.includes('fin_tasks'));
  assert.deepEqual(unassign.body, { assignee_id: null, assignee_source: 'manual' }, 'explicit null is a manual unassignment');

  reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER')
    : entry.url.includes('fin_members?select=role') ? [{ role: 'finance_manager' }]
      : entry.method === 'PATCH' && entry.url.includes('fin_tasks') ? [{ id: RFQ }] : []);
  await call('PATCH', 'tasks', { body: { organization_id: BUYER, task_id: RFQ, assignee_id: ASSIGNEE } });
  assert.deepEqual(sent.find((entry) => entry.method === 'PATCH' && entry.url.includes('fin_tasks')).body,
    { assignee_id: ASSIGNEE, assignee_source: 'manual' });

  reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER')
    : entry.method === 'PATCH' && entry.url.includes('fin_tasks') ? [{ id: RFQ }] : []));
  await call('PATCH', 'tasks', { body: { organization_id: BUYER, task_id: RFQ, status: 'done' } });
  const complete = sent.find((entry) => entry.method === 'PATCH' && entry.url.includes('fin_tasks'));
  assert.deepEqual(complete.body, { status: 'done' }, 'status-only update leaves assignment untouched');
  await rejects('PATCH', 'tasks', { body: { organization_id: BUYER, task_id: RFQ, assignee_id: 'invalid' } }, 400);
  await rejects('PATCH', 'tasks', { body: { organization_id: BUYER, task_id: RFQ } }, 400);
  assert.ok(!sent.some((entry) => entry.method === 'PATCH' && entry.body?.assignee_id === 'invalid'));

  reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER')
    : entry.url.includes('fin_members?select=role') ? [{ role: 'analyst' }] : []);
  await assert.rejects(call('PATCH', 'tasks', { body: { organization_id: BUYER, task_id: RFQ, assignee_id: ASSIGNEE } }),
    (error) => error.status === 403 && error.code === 'task_assignment_forbidden');
  assert.ok(!sent.some((entry) => entry.method === 'PATCH' && entry.url.includes('fin_tasks')), 'non-authorized actor never attempts assignment write');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('fin_organizations')) return new Response(JSON.stringify(orgRow(BUYER, 'BUYER')), { status: 200 });
    if (target.includes('fin_members?select=role')) return new Response(JSON.stringify([{ role: 'admin' }]), { status: 200 });
    if (target.includes('fin_tasks') && options.method === 'PATCH') {
      return new Response(JSON.stringify({ message: 'invalid task assignee' }), { status: 400 });
    }
    return new Response('[]', { status: 200 });
  };
  try {
    await assert.rejects(call('PATCH', 'tasks', { body: { organization_id: BUYER, task_id: RFQ, assignee_id: ASSIGNEE } }),
      (error) => error.status === 403 && error.code === 'task_assignee_unavailable');
  } finally { globalThis.fetch = originalFetch; }

  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('fin_organizations')) return new Response(JSON.stringify(orgRow(BUYER, 'BUYER')), { status: 200 });
    if (target.includes('fin_tasks') && options.method === 'PATCH') {
      return new Response(JSON.stringify({ message: 'forbidden' }), { status: 403 });
    }
    return new Response('[]', { status: 200 });
  };
  try {
    await assert.rejects(call('PATCH', 'tasks', { body: { organization_id: BUYER, task_id: RFQ, status: 'done' } }),
      (error) => error.status === 403 && error.code === 'forbidden');
  } finally { globalThis.fetch = originalFetch; }
}

// ----------------------------------- comparação é da empresa compradora

reset((entry) => {
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, organization_id: BUYER, product: 'credit', status: 'comparing', demand: {} }];
  if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'PROVIDER');
  return [];
});
await rejects('POST', 'comparison', { body: { rfq_id: RFQ } }, 400);
assert.ok(!sent.some(entry => entry.url.includes('fin_proposals')), 'provedor recusado antes de consultar concorrentes');
reset(() => []);
await rejects('POST', 'comparison', { body: { rfq_id: RFQ } }, 404);
assert.ok(!sent.some(entry => entry.url.includes('fin_proposals')), 'RFQ invisível de outro tenant não consulta propostas');
reset(() => []);
await rejects('POST', 'comparison', { body: { rfq_id: 'malformed' } }, 400);
assert.equal(sent.length, 0);

// --------------------------------- visão do provedor não vaza concorrente

let missingBuyerRpc = false;
reset((entry) => {
  if (entry.url.includes('rpc/fin_assignment_buyer_names')) {
    if (missingBuyerRpc) throw Object.assign(new Error('private missing function'), { status: 404, details: { code: 'PGRST202' } });
    return [{ rfq_id: RFQ, buyer_name: 'Compradora sintética' }];
  }
  if (entry.url.includes('fin_organizations')) return orgRow(PROVIDER_ORG, 'PROVIDER');
  if (entry.url.includes('fin_proposal_versions')) return [{ proposal_id: PROPOSAL, version: 1, terms: { institution: 'Meu Banco' }, submitted_at: '2026-01-01T00:00:00Z', rfq_revision: 2 }];
  if (entry.url.includes('fin_proposals')) return [{ id: PROPOSAL, rfq_id: RFQ, product: 'credit', status: 'submitted', current_version: 1 }];
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, title: 'RFQ', product: 'credit', status: 'collecting', demand: { amount: 500000 }, description: 'necessidade', revision: 3 }];
  return [];
});
{
  const res = await call('GET', 'assignments', { url: `/api/finance/assignments?organization_id=${PROVIDER_ORG}` });
  const row = res.payload.rows[0];
  assert.equal(row.buyer_name, 'Compradora sintética');
  const buyerLookup = sent.find((entry) => entry.url.includes('rpc/fin_assignment_buyer_names'));
  assert.deepEqual(buyerLookup.body, { p_org: PROVIDER_ORG, p_rfqs: [RFQ] });
  assert.equal(buyerLookup.authorization, 'Bearer user-jwt');
  assert.equal(buyerLookup.apikey, 'test-anon-key');
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
  assert.equal(row.has_draft, false, 'sem rascunho salvo');
}
missingBuyerRpc = true;
await assert.rejects(call('GET', 'assignments', { url: `/api/finance/assignments?organization_id=${PROVIDER_ORG}` }),
  error => error.status === 503 && error.code === 'schema_incompatible');
assert(sent.every(entry => entry.authorization === 'Bearer user-jwt' && entry.apikey === 'test-anon-key'), 'schema antigo não ativa fallback privilegiado');
// Rascunho salvo e não enviado vira "Continuar" no portal; a leitura usa o token do provedor (RLS).
// Cada versão enviada conserva suas próprias condições e revisão de origem.
// Uma versão extra fora dos IDs solicitados jamais entra na resposta.
for (const resource of ['assignments', 'proposals']) {
  const snapshots = [
    { proposal_id: PROPOSAL, version: 2, terms: { rate_month: 1.24, fees: 1500, guarantees: 'Aval' }, submitted_at: '2026-10-15T12:00:00Z', note: 'Revisão', rfq_revision: 3 },
    { proposal_id: PROPOSAL, version: 1, terms: { rate_month: 1.29, fees: 2000, guarantees: 'Recebíveis' }, submitted_at: '2026-10-14T12:00:00Z', note: 'Inicial', rfq_revision: 2 },
    { proposal_id: OTHER_ORG, version: 1, terms: { institution: 'Concorrente privado' }, submitted_at: '2026-10-15T12:00:00Z' }
  ];
  reset((entry) => {
    if (entry.url.includes('fin_organizations')) return orgRow(PROVIDER_ORG, 'PROVIDER');
    if (entry.url.includes('fin_proposal_versions')) return structuredClone(snapshots);
    if (entry.url.includes('fin_proposals')) return [{ id: PROPOSAL, rfq_id: RFQ, product: 'credit', status: 'submitted', current_version: 2 }];
    if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, title: 'RFQ', revision: 4 }];
    return [];
  });
  const res = await call('GET', resource, { url: `/api/finance/${resource}?organization_id=${PROVIDER_ORG}` });
  const row = res.payload.rows[0];
  assert.equal(row.history.length, 2);
  for (const [index, snapshot] of snapshots.slice(0, 2).entries()) {
    assert.deepEqual(row.history[index].terms, snapshot.terms, `${resource}: termos financeiros históricos perdidos`);
    assert.equal(row.history[index].rfq_revision, snapshot.rfq_revision);
    assert.equal(row.history[index].submitted_at, snapshot.submitted_at);
    assert.equal(row.history[index].note, snapshot.note);
    assert.equal(row.history[index].version, snapshot.version);
  }
  assert.deepEqual(row.terms, snapshots[0].terms, 'termos atuais não podem substituir o snapshot anterior');
  assert.ok(!JSON.stringify(res.payload).includes('Concorrente privado'));
  const versionsQuery = sent.find((entry) => entry.url.includes('fin_proposal_versions'));
  assert.match(versionsQuery.url, new RegExp(`proposal_id=in.\\(${PROPOSAL}\\)`));
  assert.match(versionsQuery.url, /rfq_revision/);
  assert.ok(sent.every((entry) => entry.authorization === 'Bearer user-jwt' && entry.apikey === 'test-anon-key'), 'histórico usa JWT/RLS, nunca service role');

  reset(() => []);
  await rejects('GET', resource, { url: `/api/finance/${resource}?organization_id=${OTHER_ORG}` }, 403);
  assert.equal(sent.length, 1, 'organização invisível não consulta propostas nem snapshots');

  reset((entry) => entry.url.includes('fin_organizations') ? orgRow(PROVIDER_ORG, 'PROVIDER') : []);
  const empty = await call('GET', resource, { url: `/api/finance/${resource}?organization_id=${PROVIDER_ORG}` });
  assert.deepEqual(empty.payload.rows, []);
  assert.ok(!sent.some((entry) => entry.url.includes('fin_proposal_versions')), 'sem propostas não lê snapshots');
}

reset((entry) => {
  if (entry.url.includes('fin_organizations')) return orgRow(PROVIDER_ORG, 'PROVIDER');
  if (entry.url.includes('fin_proposal_drafts')) return [{ proposal_id: PROPOSAL }];
  if (entry.url.includes('fin_proposals')) return [{ id: PROPOSAL, rfq_id: RFQ, product: 'credit', status: 'draft', current_version: 0 }];
  if (entry.url.includes('fin_rfqs')) return [{ id: RFQ, title: 'RFQ', product: 'credit', status: 'collecting', demand: {}, revision: 1 }];
  return [];
});
{
  const res = await call('GET', 'assignments', { url: `/api/finance/assignments?organization_id=${PROVIDER_ORG}` });
  assert.equal(res.payload.rows[0].has_draft, true);
  assert.match(sent.find((entry) => entry.url.includes('fin_proposal_drafts')).url, new RegExp(`proposal_id=in.\\(${PROPOSAL}\\)`));
}

// ------------------------------------------ respostas usam o pai do banco
{
  const PARENT = '00000000-0000-4000-8000-0000000000a3';
  const CLIENT = '00000000-0000-4000-8000-0000000000a4';
  reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : entry.url.includes('rpc/fin_reply_comment') ? CLIENT : []));
  const res = await call('POST', 'comments', { body: { organization_id: BUYER, object_type: 'rfq', object_id: RFQ, visibility: 'provider_visible',
    body: 'Resposta', parent_id: PARENT, client_id: CLIENT, mention_ids: [] } });
  assert.equal(res.payload.id, CLIENT);
  const rpcCall = sent.find((entry) => entry.url.includes('/rpc/'));
  assert.match(rpcCall.url, /rpc\/fin_reply_comment$/);
  // Objeto e visibilidade da resposta vêm do pai, no banco — o corpo não decide.
  assert.deepEqual(Object.keys(rpcCall.body).sort(), ['p_body', 'p_client_id', 'p_mention_ids', 'p_parent']);
  await rejects('POST', 'comments', { body: { organization_id: BUYER, object_type: 'rfq', object_id: RFQ, body: 'x', parent_id: 'nao-uuid', client_id: CLIENT } }, 400);
}

// ------------------------------------------ overview sem consulta por RFQ

reset((entry) => {
  if (entry.url.includes('fin_organizations')) return orgRow(BUYER, 'BUYER');
  if (entry.url.includes('fin_rfqs')) return Array.from({ length: 12 }, (_, index) => ({
    id: `00000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
    organization_id: BUYER, product: 'credit', status: 'open', demand: { amount: 1000 }
  }));
  if (entry.url.includes('fin_tasks')) return [{ id: DECISION_ID, title: 'Tarefa contextual', status: 'open', assignee_id: ACTOR }];
  if (entry.url.includes('fin_members')) return [{ user_id: ACTOR, display_name: 'Responsável' }];
  return [];
});
{
  const overview = await call('GET', 'overview', { url: `/api/finance/overview?organization_id=${BUYER}` });
  assert.deepEqual(overview.payload.tasks, [{ id: DECISION_ID, title: 'Tarefa contextual', status: 'open', assignee_id: ACTOR, assignee_name: 'Responsável' }]);
  // Com 12 RFQs o número de consultas não pode crescer com a quantidade: a
  // consulta adicional de nomes é fixa e limitada aos assignees de tarefas visíveis.
  assert.ok(sent.length <= 13, `overview fez ${sent.length} consultas para 12 RFQs`);
  assert.equal(sent.filter((entry) => entry.url.includes('fin_rfq_invites')).length, 1, 'convites lidos uma vez para todas as RFQs');
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
  assert.equal(res.payload.export.comparison.methodology, 'comparison-context-v1');
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

// Contato do provedor define quem pode aceitar o convite: formato conferido.
reset((entry) => (entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : [{ id: 'p1' }]));
await rejects('POST', 'providers', { body: { organization_id: BUYER, name: 'Banco X', kind: 'bank', contact_email: 'joao@' } }, 400);
{
  const res = await call('POST', 'providers', { body: { organization_id: BUYER, name: 'Banco X', kind: 'bank', contact_email: ' Joao@Banco.Example ' } });
  assert.equal(res.statusCode, 201);
  assert.equal(sent.at(-1).body.contact_email, 'joao@banco.example', 'contato normalizado');
}

/* Documentos privados: autorização no banco, assinatura curta no servidor, nada persistido. */
{
  const DOC = '00000000-0000-4000-8000-0000000000a9';
  const PATH = `${BUYER}/${DOC}/v1-00000000-0000-4000-8000-0000000000aa`;
  const signed = [];
  const adminCalls = [];
  // Tokens no formato do Storage: a API informa exp - iat, não um número fixo.
  const storageToken = (ttl) => `h.${Buffer.from(JSON.stringify({ iat: 1_800_000_000, exp: 1_800_000_000 + ttl })).toString('base64url')}.s`;
  const storage = {
    signUpload: async (path) => { signed.push(['upload', path]); return `https://supabase.example.invalid/storage/v1/object/upload/sign/fin-documents/${path}?token=${storageToken(7200)}`; },
    inspect: async () => ({ size: 2048, mime: 'application/pdf' }),
    signDownload: async (path, name) => { signed.push(['download', path, name]); return `https://supabase.example.invalid/storage/v1/object/sign/fin-documents/${path}?token=${storageToken(60)}&download=${name}`; }
  };
  const docDeps = { ...deps, documentStorage: storage, adminRpc: async (name, body) => { adminCalls.push([name, body]); return 'available'; } };
  const docCall = async (method, path, options = {}) => {
    const res = response();
    await handleFinance(request(method, { ...options, url: options.url || `/api/finance/${path}` }), res, path, docDeps);
    return res;
  };
  const docRejects = async (method, path, options, code) => assert.rejects(() => docCall(method, path, options), (error) => { assert.equal(error.status, code, `${path}: ${error.message}`); return true; });

  // Tipo fora da lista e tamanho acima do limite não chegam ao banco nem ao Storage.
  reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER') : []);
  await docRejects('POST', 'private-documents/upload', { body: { organization_id: BUYER, entity_type: 'rfq', entity_id: RFQ, title: 'Script', mime_type: 'text/html', size: 10 } }, 400);
  await docRejects('POST', 'private-documents/upload', { body: { organization_id: BUYER, entity_type: 'rfq', entity_id: RFQ, title: 'Grande', mime_type: 'application/pdf', size: 10 * 1024 * 1024 + 1 } }, 413);
  assert.equal(sent.filter((entry) => entry.url.includes('rpc/')).length, 0);
  assert.equal(signed.length, 0);

  reset((entry) => entry.url.includes('fin_organizations') ? orgRow(BUYER, 'BUYER')
    : entry.url.includes('rpc/fin_document_begin_upload') ? [{ document_id: DOC, version: 1, bucket: 'fin-documents', path: PATH }] : []);
  {
    const res = await docCall('POST', 'private-documents/upload', { body: { organization_id: BUYER, entity_type: 'rfq', entity_id: RFQ, title: 'Balanço', visibility: 'internal', mime_type: 'application/pdf', size: 2048, sha256: 'A'.repeat(64) } });
    assert.equal(res.statusCode, 201);
    // O Storage hospedado dá 2 h à URL de upload, ignorando o pedido; a API diz
    // isso e o banco limita a reserva a 10 minutos.
    assert.equal(res.payload.expires_in, 7200);
    assert.equal(res.payload.complete_within, 600);
    assert.match(res.payload.upload_url, /upload\/sign\/fin-documents\//);
    const begin = sent.find((entry) => entry.url.includes('rpc/fin_document_begin_upload'));
    assert.equal(begin.authorization, 'Bearer user-jwt', 'reserva do envio precisa rodar como o usuário');
    assert.equal(begin.body.p_sha256, 'a'.repeat(64));
    assert.deepEqual(signed[0], ['upload', PATH]);
  }
  // Concluir: só o próprio envio pendente, conferido no Storage, publicado pelo service role.
  reset((entry) => entry.url.includes('rpc/fin_document_pending_upload') ? [{ bucket: 'fin-documents', path: PATH, mime_type: 'application/pdf', size_bytes: 2048 }] : []);
  {
    const res = await docCall('POST', 'private-documents/complete', { body: { document_id: DOC, version: 1 } });
    assert.equal(res.payload.status, 'available');
    assert.deepEqual(adminCalls[0], ['fin_document_finalize_upload', { p_document: DOC, p_version: 1, p_size: 2048, p_mime: 'application/pdf' }]);
  }
  reset(() => []);
  await docRejects('POST', 'private-documents/complete', { body: { document_id: DOC, version: 1 } }, 404);
  // Download: URL assinada gerada sob demanda e só depois da RPC de autorização.
  reset((entry) => entry.url.includes('rpc/fin_document_authorize_download') ? [{ bucket: 'fin-documents', path: PATH, mime_type: 'application/pdf', title: 'Balanço 2025', version: 2 }] : []);
  {
    const res = await docCall('POST', 'private-documents/download', { body: { document_id: DOC } });
    assert.equal(res.payload.expires_in, 60);
    assert.match(res.payload.url, /token=h\./);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(signed.at(-1), ['download', PATH, 'Balanco-2025-v2.pdf']);
  }
  reset(() => { throw Object.assign(new Error('x'), { status: 400 }); });
  globalThis.fetch = (fetchImpl => async (url, options) => {
    if (String(url).includes('rpc/fin_document_authorize_download')) return new Response(JSON.stringify({ message: 'forbidden' }), { status: 403 });
    return fetchImpl(url, options);
  })(globalThis.fetch);
  const before = signed.length;
  await docRejects('POST', 'private-documents/download', { body: { document_id: DOC } }, 403);
  assert.equal(signed.length, before, 'negado no banco não pode gerar URL assinada');
}

/* Console operacional: papel de plataforma finance_ops + MFA antes de qualquer chamada. */
{
  const token = (aal, role) => `x.${Buffer.from(JSON.stringify({ sub: ACTOR, aal, ...(role ? { app_metadata: { arandu_role: role } } : {}) })).toString('base64url')}.y`;
  const opsDeps = (aal, role, extra = {}) => ({ ...deps, requireUser: async () => ({ user: { id: ACTOR }, accessToken: token(aal, role), headers: {} }), env: { SUPABASE_URL: 'https://x', SUPABASE_ANON_KEY: 'k', CRON_SECRET: 'curto' }, ...extra });
  const opsRejects = async (aal, role, code) => assert.rejects(async () => { const res = response(); await handleFinance(request('GET', { url: '/api/finance/ops/overview' }), res, 'ops/overview', opsDeps(aal, role)); },
    (error) => { assert.equal(error.status, 403); assert.equal(error.code, code, `${role || 'sem papel'}/${aal}`); return true; });
  reset(() => ({ jobs: [] }));
  await opsRejects('aal2', null, 'finance_ops_required');       // admin/gestor de empresa, com MFA
  await opsRejects('aal2', 'operator', 'finance_ops_required'); // operador legado de arte, com MFA
  await opsRejects('aal2', 'admin', 'finance_ops_required');    // admin legado de arte, com MFA
  await opsRejects('aal1', 'finance_ops', 'mfa_required');      // finance_ops sem MFA
  assert.equal(sent.length, 0, 'sem papel e MFA nada chega ao banco');
  const res = response();
  await handleFinance(request('GET', { url: '/api/finance/ops/overview' }), res, 'ops/overview', opsDeps('aal2', 'finance_ops'));
  assert.equal(res.payload.health.cron_secret_configured, false);
  assert.equal(res.payload.health.server_key_configured, false);
  assert.doesNotMatch(JSON.stringify(res.payload.health), /curto|https:\/\/x/, 'saúde expõe só booleanos, nunca valores');
  assert.match(sent[0].url, /rpc\/fin_ops_overview$/);

  // Segundo fator do finance_ops pelo próprio console (o login administrativo
  // legado não aceita finance_ops).
  const FACTOR = '00000000-0000-4000-8000-00000000fac7';
  const CHALLENGE = '00000000-0000-4000-8000-00000000c4a1';
  const authCalls = [];
  const fakeAuth = async (url, init) => {
    authCalls.push([String(url).replace('https://x/auth/v1/', ''), init.method]);
    if (String(url).endsWith('/user')) return new Response(JSON.stringify({ factors: [{ id: FACTOR, factor_type: 'totp', status: 'verified' }] }), { status: 200 });
    if (String(url).endsWith('/challenge')) return new Response(JSON.stringify({ id: CHALLENGE }), { status: 200 });
    if (String(url).endsWith('/verify')) return new Response(JSON.stringify({ access_token: token('aal2', 'finance_ops'), refresh_token: 'r', expires_in: 3600 }), { status: 200 });
    return new Response('{}', { status: 404 });
  };
  const opsMfa = createOpsMfa({ env: { SUPABASE_URL: 'https://x', SUPABASE_ANON_KEY: 'k' }, fetchImpl: fakeAuth });
  const mfaCall = async (aal, role, body) => { const r = response(); await handleFinance(request('POST', { url: '/api/finance/ops/mfa', body }), r, 'ops/mfa', opsDeps(aal, role, { opsMfa })); return r; };
  await assert.rejects(() => mfaCall('aal1', 'operator', { step: 'challenge' }), (error) => error.code === 'finance_ops_required');
  assert.equal(authCalls.length, 0, 'papel errado não chega ao Supabase Auth');
  const challenge = await mfaCall('aal1', 'finance_ops', { step: 'challenge' });
  assert.deepEqual([challenge.payload.factor_id, challenge.payload.challenge_id], [FACTOR, CHALLENGE]);
  await assert.rejects(() => mfaCall('aal1', 'finance_ops', { step: 'verify', factor_id: FACTOR, challenge_id: CHALLENGE, code: '12ab56' }), (error) => error.code === 'mfa_payload_invalid');
  const verified = await mfaCall('aal1', 'finance_ops', { step: 'verify', factor_id: FACTOR, challenge_id: CHALLENGE, code: '123456' });
  assert.equal(verified.payload.mfa_verified, true);
  assert.match(verified.headers['Set-Cookie'], /^arandu_session=.+HttpOnly; SameSite=Lax; Secure/);
  assert.doesNotMatch(JSON.stringify(verified.payload), /access_token|refresh/, 'tokens só no cookie HttpOnly');
}
console.log('Financial Procurement API: documentos privados (autorização antes da assinatura, limites, sem persistir URL) e console operacional só para finance_ops com MFA aprovados.');

/* Storage: só caminhos gerados pelo banco, service role só no servidor, URLs curtas. */
{
  const seen = [];
  const fake = async (url, init) => { seen.push({ url, init }); return new Response(JSON.stringify({ url: '/object/upload/sign/fin-documents/p?token=u', signedURL: '/object/sign/fin-documents/p?token=s' }), { status: 200, headers: { 'content-length': '10', 'content-type': 'application/pdf' } }); };
  const env = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  const store = createDocumentStorage({ env, fetchImpl: fake });
  const path = '00000000-0000-4000-8000-0000000000b1/00000000-0000-4000-8000-0000000000a9/v1-00000000-0000-4000-8000-0000000000aa';
  assert.match(await store.signUpload(path), /^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/upload\/sign\//);
  assert.equal(JSON.parse(seen[0].init.body).expiresIn, 120);
  const url = await store.signDownload(path, 'x.pdf');
  assert.equal(JSON.parse(seen[1].init.body).expiresIn, 60);
  assert.match(url, /download=x\.pdf$/);
  await assert.rejects(() => store.signDownload('../outra-empresa/arquivo'), /inválido/);
  await assert.rejects(() => createDocumentStorage({ env: {}, fetchImpl: fake }).signUpload(path), /indisponível/);
  assert.equal(signedUrlTtl('https://x.invalid/storage/v1/object/sign/b/p?token=h.eyJpYXQiOjEwMCwiZXhwIjoxNjB9.s'), 60);
  assert.equal(signedUrlTtl('https://x.invalid/storage/v1/object/sign/b/p?token=sem-jwt'), null);
  assert.equal(downloadName('Balanço <script> 2025', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 3), 'Balanco-script-2025-v3.xlsx');
}
console.log('Document storage: caminhos validados; pede 120 s (envio) e 60 s (download) e informa o prazo real lido do token.');

// ------------------------- toda exceção do banco que alcança a pessoa é traduzida
// Sem tradução, a API devolve só "Operação inválida ou sem permissão.": seguro,
// mas não diz o que houve nem o que fazer. Exceções que nunca chegam a uma tela
// (envelope próprio da Public API v1 e do SSO, jobs, guardas de migration e o
// pool da Demo) ficam numa lista explícita e justificada.
{
  const INTERNAL = new Map([
    [/^(api unauthorized|api scope denied|invalid api query|idempotency key required|idempotency key reuse|invalid api payload|api entity denied|invalid api owner|stale lease)$/, 'Public API v1: envelope próprio'],
    [/^sso /, 'SSO: rotas próprias com motivo de recusa'],
    [/^(invalid job|invalid job result|job already finished|export too large|unknown template)$/, 'jobs/cron: falha registrada no próprio job'],
    [/ requires schema /, 'guarda de ordem de migration'],
    [/^versioned decision owner cannot call internal implementation$/, 'guarda de permissões executada somente pela migration'],
    [/^(demo workspaces unavailable outside demo|invalid demo workspace claim|invalid demo workspace resume|invalid demo pool lease)$/, 'pool da Demo: controlador e login por persona']
  ]);
  const manifest = JSON.parse(readFileSync('docs/supabase-migrations.json', 'utf8'));
  const raised = new Set();
  for (const file of manifest.cleanInstall.filter((f) => /financial/.test(f))) {
    for (const match of readFileSync(file, 'utf8').matchAll(/raise exception '([^'%]+)'/g)) raised.add(match[1].trim());
  }
  const untranslated = [...raised].filter((message) => !UPSTREAM_MESSAGES.some(([pattern]) => pattern.test(message)) && ![...INTERNAL.keys()].some((pattern) => pattern.test(message)));
  assert.deepEqual(untranslated, [], `exceções do banco sem mensagem para a pessoa: ${untranslated.join(', ')}`);
  for (const [pattern, status, message, code] of UPSTREAM_MESSAGES) {
    assert.ok([400, 401, 403, 404, 409, 410, 413, 422, 429].includes(status), `${pattern}: status ${status}`);
    // client_id é o nome do campo OIDC que o admin preenche: vocabulário do público, não detalhe interno.
    assert.ok(message.length >= 12 && !/[a-z]+_[a-z_]+|\bnull\b|exception|violat/i.test(message.replace(/\bclient_id\b/g, '')), `${pattern}: mensagem técnica`);
    assert.match(code, /^[a-z][a-z0-9_]+$/);
  }
  console.log(`Exceções do banco: ${raised.size} distintas, todas traduzidas ou internas por desenho.`);
}

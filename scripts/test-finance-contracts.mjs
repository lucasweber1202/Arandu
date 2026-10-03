import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { normalizeContractTerms, diffContractTerms, effectiveTerms, nextOccurrence, contractTermFields } from '../lib/finance/contract-terms.mjs';

// Contract & Renewal Center v2: catálogo de termos (allowlist), diff factual,
// termos efetivos por data, recorrência e fronteira da API.

process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const ORG = '00000000-0000-4000-8000-0000000000b1';
const CONTRACT = '00000000-0000-4000-8000-0000000000c1';
const PROVIDER = '00000000-0000-4000-8000-0000000000d1';
const ACTOR = '00000000-0000-4000-8000-0000000000a1';

// ---------------------------------------------------------------- domínio
{
  const ok = normalizeContractTerms('credit', {
    principal_amount: '5000000', spread_pct_year: '2,1', indexer: 'cdi', currency: 'brl',
    fees: [{ service: 'TAC', unit: 'one_off', amount: 5000 }], guarantees: ' Recebíveis ', status: 'approved', score: 9
  });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.rejected.sort(), ['score', 'status'], 'chaves fora do catálogo são listadas e descartadas');
  assert.deepEqual(ok.values, { currency: 'BRL', principal_amount: 5000000, indexer: 'cdi', spread_pct_year: 2.1, guarantees: 'Recebíveis', fees: [{ service: 'TAC', unit: 'one_off', amount: 5000 }] });
  assert.ok(!('mdr_debit_pct' in normalizeContractTerms('credit', { mdr_debit_pct: 1 }).values), 'campo de adquirência não vale em crédito');
  assert.equal(normalizeContractTerms('acquiring', { mdr_debit_pct: 1.2 }).values.mdr_debit_pct, 1.2);
  for (const bad of [{ indexer: 'bitcoin' }, { spread_pct_year: -1 }, { principal_amount: 'muito' }, { guarantees: '<b>x</b>' }, { currency: 'REAL' },
    { fees: [{ service: 'X', unit: 'per_month', amount: 1 }] }, { fees: [{ service: 'Tarifa', unit: 'hourly', amount: 1 }] }, { fees: 'TAC' }, { settlement_days: 1.5 }]) {
    const category = 'settlement_days' in bad ? 'acquiring' : 'credit';
    assert.ok(normalizeContractTerms(category, bad).errors.length, `deveria recusar ${JSON.stringify(bad)}`);
  }
  assert.ok(contractTermFields('credit').every((field) => !/score|rank|recomend/i.test(field.key)), 'catálogo sem nota/ranking');

  const diff = diffContractTerms('credit', { spread_pct_year: 2.1, guarantees: 'Recebíveis', rate_pct_month: 1 }, { spread_pct_year: 1.9, guarantees: 'Recebíveis', indexer: 'cdi' });
  assert.deepEqual(diff.map((item) => `${item.key}:${item.change}`), ['indexer:added', 'spread_pct_year:changed', 'rate_pct_month:removed']);
  assert.ok(diff.every((item) => !('better' in item) && !('impact' in item)), 'diff é só fato, sem juízo');

  const versions = [{ version: 1, effective_from: '2026-01-01', terms: { a: 1 } }, { version: 2, effective_from: '2026-06-01', terms: { a: 2 } }, { version: 3, effective_from: '2027-01-01', terms: { a: 3 } }];
  assert.equal(effectiveTerms(versions, '2026-07-01').version, 2, 'aditivo futuro ainda não vale');
  assert.equal(effectiveTerms(versions, '2025-01-01'), null);
  assert.equal(nextOccurrence('2026-01-31', 'monthly'), '2026-02-28', 'fim de mês não pula mês');
  assert.equal(nextOccurrence('2026-11-15', 'quarterly'), '2027-02-15');
  assert.equal(nextOccurrence('2026-11-15', 'none'), null);
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
const contractRow = (entry) => (entry.url.includes(`fin_contracts?select=id,product&id=eq.${CONTRACT}`) ? [{ id: CONTRACT, product: 'credit' }] : null);

// Importação: só catálogo, categoria válida, datas e provedor validados antes do banco.
const importBody = { organization_id: ORG, provider_id: PROVIDER, product: 'cash_management', title: 'Pacote de serviços', starts_on: '2026-01-01', ends_on: '2027-12-31', terms: { fees: [{ service: 'PIX enviado', unit: 'per_transaction', amount: 0.5 }] } };
reset((entry) => buyer(entry) ?? (entry.url.includes('rpc/fin_import_contract') ? CONTRACT : []));
await call('POST', 'contract-import', { body: { ...importBody, owner_id: 'x', origin: 'sourcing', status: 'active' } });
{
  const rpcCall = sent.find((entry) => entry.url.includes('rpc/fin_import_contract'));
  assert.deepEqual(Object.keys(rpcCall.body).sort(), ['p_auto_renew', 'p_currency', 'p_ends', 'p_entity', 'p_notice', 'p_org', 'p_parent', 'p_product', 'p_provider', 'p_starts', 'p_terms', 'p_title']);
  assert.equal(rpcCall.body.p_notice, 60);
  assert.equal(rpcCall.authorization, 'Bearer user-jwt');
}
reset(buyer);
await rejects('POST', 'contract-import', { body: { ...importBody, product: 'crypto' } }, 400, 'invalid_product');
await rejects('POST', 'contract-import', { body: { ...importBody, ends_on: '2025-01-01' } }, 400, 'invalid_period');
await rejects('POST', 'contract-import', { body: { ...importBody, starts_on: '01/01/2026' } }, 400, 'invalid_date');
await rejects('POST', 'contract-import', { body: { ...importBody, terms: { secret_rating: 'AAA' } } }, 400, 'unknown_contract_terms');
await rejects('POST', 'contract-import', { body: { ...importBody, provider_id: 'banco' } }, 400);
assert.ok(!sent.some((entry) => entry.url.includes('rpc/')), 'entrada inválida não chega ao banco');

// Termos: versão esperada obrigatória; categoria vem do banco, não do corpo.
reset((entry) => contractRow(entry) ?? (entry.url.includes('rpc/') ? 2 : []));
// Categoria vem do banco (crédito): campo de adquirência é recusado mesmo com product forjado.
await rejects('POST', 'contract-terms', { body: { contract_id: CONTRACT, expected_version: 1, reason: 'Valor corrigido', terms: { principal_amount: 100, mdr_debit_pct: 1 }, product: 'acquiring' } }, 400, 'unknown_contract_terms');
assert.ok(!sent.some((entry) => entry.url.includes('rpc/')));
reset((entry) => contractRow(entry) ?? (entry.url.includes('rpc/') ? 2 : []));
await rejects('POST', 'contract-terms', { body: { contract_id: CONTRACT, terms: {} } }, 400, 'invalid_version');
reset(() => []);
await rejects('POST', 'contract-terms', { body: { contract_id: CONTRACT, expected_version: 0, terms: {} } }, 404, 'contract_not_found');
for (const [message, status, code] of [['contract version conflict', 409, 'contract_version_conflict'], ['correction reason required', 400, 'correction_reason_required'], ['forbidden', 403, 'forbidden']]) {
  reset((entry) => contractRow(entry) ?? (entry.url.includes('rpc/') ? new Error(message) : []));
  await rejects('POST', 'contract-terms', { body: { contract_id: CONTRACT, expected_version: 1, terms: { principal_amount: 1 } } }, status, code);
}

// Aditivo: sem termos não envia versão esperada; com termos, sim.
reset((entry) => contractRow(entry) ?? (entry.url.includes('rpc/') ? 'a1' : []));
await call('POST', 'contract-amendments', { body: { contract_id: CONTRACT, title: 'Prorrogação', effective_from: '2026-10-01', new_ends_on: '2028-12-31', new_notice_days: 120 } });
{
  const body = sent.find((entry) => entry.url.includes('rpc/fin_record_contract_amendment')).body;
  assert.equal(body.p_terms, null);
  assert.equal(body.p_expected, null);
  assert.equal(body.p_new_notice_days, 120);
}
reset((entry) => contractRow(entry) ?? null);
await rejects('POST', 'contract-amendments', { body: { contract_id: CONTRACT, title: 'X', effective_from: '2026-10-01' } }, 400, 'invalid_title');
await rejects('POST', 'contract-amendments', { body: { contract_id: CONTRACT, title: 'Aviso', effective_from: '2026-10-01', new_notice_days: 9999 } }, 400);

// Marcos.
reset(() => 'm1');
await call('POST', 'contract-milestones', { body: { contract_id: CONTRACT, kind: 'obligation', title: 'Enviar balancete', due_on: '2026-12-01', recurrence: 'quarterly' } });
assert.equal(sent[0].body.p_lead_days, 30);
await rejects('POST', 'contract-milestones', { body: { contract_id: CONTRACT, kind: 'birthday', title: 'Festa', due_on: '2026-12-01' } }, 400, 'invalid_milestone');
await rejects('POST', 'contract-milestones', { body: { contract_id: CONTRACT, kind: 'custom', title: 'Marco', due_on: '2026-12-01', recurrence: 'daily' } }, 400, 'invalid_milestone');
await rejects('PATCH', 'contract-milestones', { body: { milestone_id: CONTRACT, action: 'postpone' } }, 400, 'invalid_milestone');
reset(() => new Error('milestone closed'));
await rejects('PATCH', 'contract-milestones', { body: { milestone_id: CONTRACT, action: 'done' } }, 409, 'milestone_closed');

// Detalhe: RLS vazio = 404 indistinguível; diff calculado entre versões.
reset(() => []);
await rejects('GET', 'contract-detail', { url: `/api/finance/contract-detail?id=${CONTRACT}` }, 404, 'contract_not_found');
reset((entry) => entry.url.includes(`fin_contracts?select=*&id=eq.${CONTRACT}`) ? [{ id: CONTRACT, organization_id: ORG, product: 'credit', provider_id: PROVIDER }]
  : entry.url.includes('fin_contract_versions') ? [{ version: 2, effective_from: '2026-06-01', source: 'amendment', terms: { spread_pct_year: 1.9 } }, { version: 1, effective_from: '2026-01-01', source: 'import', terms: { spread_pct_year: 2.1 } }]
    : entry.url.includes('fin_providers') ? [{ id: PROVIDER, name: 'Banco' }] : []);
{
  const res = await call('GET', 'contract-detail', { url: `/api/finance/contract-detail?id=${CONTRACT}` });
  assert.equal(res.payload.contract.provider_name, 'Banco');
  assert.deepEqual(res.payload.versions[0].changes, [{ key: 'spread_pct_year', label: 'Spread (% a.a.)', change: 'changed', before: 2.1, after: 1.9 }]);
  assert.deepEqual(res.payload.versions[1].changes, []);
  assert.ok(sent.every((entry) => entry.method === 'GET'), 'detalhe só lê');
}

console.log('Contract Center v2: catálogo de termos (allowlist), diff factual, termos efetivos, recorrência e API (importação, versões, aditivos, marcos) aprovados.');

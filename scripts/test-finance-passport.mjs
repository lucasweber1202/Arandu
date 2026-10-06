import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  PASSPORT_FIELDS, DOMAINS, PASSPORT_TO_DEMAND, WRITABLE_SOURCES, RESERVED_SOURCES,
  buildPassport, freshness, passportPrefill, validatePassportUsage, validatePassportValue, typedValue, reviewDays
} from '../lib/finance/passport.mjs';
import { PRODUCTS } from '../lib/finance/products.mjs';

// Financial Passport: domínio puro (catálogo, frescor, cobertura, reuso em RFQ)
// e fronteira da API (nada fala com o Supabase real; o fetch é substituído).

// ------------------------------------------------------------------ catálogo
{
  assert.deepEqual(DOMAINS.map((domain) => domain.id), ['empresa', 'credito', 'adquirencia', 'documentacao']);
  const keys = PASSPORT_FIELDS.map((field) => field.key);
  assert.equal(new Set(keys).size, keys.length, 'chave duplicada no catálogo');
  for (const field of PASSPORT_FIELDS) {
    assert.match(field.key, /^[a-z][a-z0-9_]{1,48}$/, `${field.key}: chave fora do formato do banco`);
    assert.ok(DOMAINS.some((domain) => domain.id === field.domain), `${field.key}: contexto inexistente`);
    if (field.origin !== 'organization') assert.ok(field.review_days >= 7 && field.review_days <= 1825, `${field.key}: período fora do intervalo do banco`);
  }
  // O mapeamento para a RFQ só aponta para campos que existem dos dois lados.
  for (const [product, mapping] of Object.entries(PASSPORT_TO_DEMAND)) {
    const demandKeys = PRODUCTS[product].demandFields.map((field) => field.key);
    for (const [demandKey, passportKey] of Object.entries(mapping)) {
      assert.ok(demandKeys.includes(demandKey), `${product}.${demandKey} não é campo da demanda`);
      assert.ok(keys.includes(passportKey), `${passportKey} não é campo do Passport`);
    }
  }
  // Origens automáticas não são declaráveis num formulário.
  assert.ok(RESERVED_SOURCES.every((source) => !WRITABLE_SOURCES.includes(source)));
}

// ---------------------------------------------------------------- validação
{
  assert.deepEqual(validatePassportValue('receita_anual', '182000000'), { ok: true, value: '182000000' });
  assert.deepEqual(validatePassportValue('antecipacao_atual', '1,45'), { ok: true, value: '1.45' });
  assert.equal(validatePassportValue('receita_anual', 'R$ 182 milhões').ok, false, 'texto livre em campo monetário');
  assert.equal(validatePassportValue('receita_anual', '182.000.000').ok, false, 'separador de milhar ambíguo');
  assert.equal(validatePassportValue('receita_anual', '-1').ok, false);
  assert.equal(validatePassportValue('colaboradores', '10.5').ok, false, 'inteiro');
  assert.equal(validatePassportValue('porte', 'gigante').ok, false, 'enum');
  assert.equal(validatePassportValue('porte', 'grande').ok, true);
  assert.equal(validatePassportValue('sector', 'Alimentos').ok, false, 'campo do cadastro não é gravado no perfil');
  assert.equal(validatePassportValue('campo_livre_antigo', 'qualquer texto').ok, true, 'campo livre continua aceito');
  assert.equal(validatePassportValue('garantias_disponiveis', '   ').ok, false);
  // Valor antigo em texto livre não vira número por adivinhação.
  assert.equal(typedValue('receita_anual', 'R$ 182 milhões (auditado)'), null);
  assert.equal(typedValue('receita_anual', '182000000'), 182000000);
}

// ------------------------------------------------------------------- frescor
{
  const now = new Date('2026-10-01T15:00:00Z');
  const row = (updated, extra = {}) => ({ field_key: 'volume_cartoes_mensal', updated_at: updated, ...extra });
  // Catálogo: volume revisa a cada 90 dias.
  assert.equal(reviewDays(row('2026-09-01')), 90);
  assert.deepEqual(freshness(row('2026-09-01T10:00:00Z'), now), { state: 'current', due_on: '2026-11-30', days_left: 60 });
  assert.equal(freshness(row('2026-07-30T10:00:00Z'), now).state, 'review_due');
  assert.equal(freshness(row('2026-07-03T10:00:00Z'), now).state, 'review_due', 'no dia do vencimento');
  assert.equal(freshness(row('2026-07-02T10:00:00Z'), now).state, 'stale', 'um dia depois do vencimento');
  assert.equal(freshness(row('2026-07-01T10:00:00Z'), now).state, 'stale');
  // Confirmação renova a referência; validade explícita antecipa o vencimento.
  assert.equal(freshness(row('2026-01-01T10:00:00Z', { verified_at: '2026-09-20T10:00:00Z' }), now).state, 'current');
  assert.equal(freshness(row('2026-09-20T10:00:00Z', { valid_until: '2026-09-30' }), now).state, 'stale');
  // Período escolhido pela empresa vence o padrão do catálogo.
  assert.equal(freshness(row('2026-09-01T10:00:00Z', { review_after_days: 7 }), now).state, 'stale');
  assert.equal(freshness({ field_key: 'x' }, now).state, 'untracked');
  // Mesma regra do banco (tests/database/financial-passport.sql, seção 4).
  assert.equal(freshness({ field_key: 'x', updated_at: '2026-01-01T12:00:00Z', verified_at: '2026-03-01T12:00:00Z', review_after_days: 90 }, new Date('2026-04-30T00:00:00Z')).state, 'review_due');
  assert.equal(freshness({ field_key: 'x', updated_at: '2026-01-01T12:00:00Z', verified_at: '2026-03-01T12:00:00Z', review_after_days: 90 }, new Date('2026-04-29T00:00:00Z')).state, 'current');
  assert.equal(freshness({ field_key: 'x', updated_at: '2026-01-01T12:00:00Z', verified_at: '2026-03-01T12:00:00Z', review_after_days: 90 }, new Date('2026-05-31T00:00:00Z')).state, 'stale');
}

// ---------------------------------------------------- cobertura e documentos
{
  const now = new Date('2026-10-01T15:00:00Z');
  const passport = buildPassport({
    now,
    organization: { legal_name: 'Vitta Foods S.A.', tax_identifier: '11222333000181', sector: 'Alimentos', revenue_band: null },
    rows: [
      { id: 'r1', field_key: 'receita_anual', field_value: '182000000', source: 'documento_interno', updated_at: '2026-09-01T10:00:00Z', updated_by: 'u1' },
      { id: 'r2', field_key: 'volume_cartoes_mensal', field_value: '12400000', source: 'extrato', updated_at: '2026-05-01T10:00:00Z' },
      { id: 'r3', field_key: 'doc_contrato_social', field_value: 'Consolidado', source: 'documento_interno', updated_at: '2026-09-01T10:00:00Z', document_id: 'd1' },
      { id: 'r4', field_key: 'doc_certidoes', field_value: 'Certidão federal', source: 'documento_interno', updated_at: '2026-09-01T10:00:00Z', document_id: 'd-removido' },
      { id: 'r5', field_key: 'colaboradores_antigo', field_value: '612 colaboradores', source: 'declarado_pela_empresa', updated_at: '2026-09-01T10:00:00Z' }
    ],
    documents: [{ id: 'd1', title: 'Contrato social', current_version: 2 }],
    members: new Map([['u1', 'Helena Duarte']])
  });
  const empresa = passport.domains.find((domain) => domain.id === 'empresa');
  assert.deepEqual(empresa.coverage, { filled: 4, relevant: 10 }, 'razão social, CNPJ, setor e faturamento');
  const docs = passport.domains.find((domain) => domain.id === 'documentacao');
  // Documento removido (ou de outra empresa) não conta como preenchido.
  assert.deepEqual(docs.coverage, { filled: 1, relevant: 4 });
  assert.equal(docs.fields.find((field) => field.key === 'doc_certidoes').document_missing, true);
  assert.equal(docs.fields.find((field) => field.key === 'doc_contrato_social').document.title, 'Contrato social');
  const adq = passport.domains.find((domain) => domain.id === 'adquirencia');
  assert.equal(adq.stale, 1, 'volume de maio está desatualizado');
  assert.deepEqual(passport.attention.map((item) => item.key), ['volume_cartoes_mensal']);
  assert.equal(empresa.fields.find((field) => field.key === 'receita_anual').updated_by_name, 'Helena Duarte');
  // Campo livre aparece, mas fora da cobertura.
  assert.deepEqual(passport.custom.map((field) => field.key), ['colaboradores_antigo']);
  assert.equal(passport.coverage.relevant, PASSPORT_FIELDS.length);
  // Cobertura nunca vira nota.
  assert.match(passport.notice, /Não é nota de risco/);
  assert.ok(!JSON.stringify(passport).match(/score|rating|recomend/i));
}

// ------------------------------------------------------------ reuso na RFQ
{
  const now = new Date('2026-10-01T15:00:00Z');
  const rows = [
    { field_key: 'receita_anual', field_value: '182000000', source: 'documento_interno', updated_at: '2026-09-01T10:00:00Z' },
    { field_key: 'garantias_disponiveis', field_value: 'Recebíveis de cartão', source: 'declarado_pela_empresa', updated_at: '2025-01-01T10:00:00Z' },
    { field_key: 'tempo_operacao_anos', field_value: 'desde 1998', source: 'declarado_pela_empresa', updated_at: '2026-09-01T10:00:00Z' },
    { field_key: 'volume_cartoes_mensal', field_value: '12400000', source: 'extrato', updated_at: '2026-09-01T10:00:00Z' }
  ];
  const credit = passportPrefill('credit', { organization: { sector: 'Alimentos' }, rows, now });
  assert.deepEqual(credit.map((item) => [item.demand_key, item.value, item.freshness]), [
    ['annual_revenue', 182000000, 'current'], ['sector', 'Alimentos', 'untracked'], ['collateral', 'Recebíveis de cartão', 'stale']
  ], 'texto livre em campo numérico (tempo de operação) não é sugerido');
  const acquiring = passportPrefill('acquiring', { rows, now });
  assert.deepEqual(acquiring.map((item) => item.demand_key), ['monthly_volume']);
  assert.deepEqual(passportPrefill('inexistente', { rows }), []);

  assert.deepEqual(validatePassportUsage('credit', [{ demand_key: 'annual_revenue', field_key: 'receita_anual' }]), [{ demand_key: 'annual_revenue', field_key: 'receita_anual' }]);
  assert.deepEqual(validatePassportUsage('credit', undefined), []);
  assert.equal(validatePassportUsage('credit', [{ demand_key: 'amount', field_key: 'receita_anual' }]), null, 'par fora do mapeamento');
  assert.equal(validatePassportUsage('credit', [{ demand_key: 'monthly_volume', field_key: 'volume_cartoes_mensal' }]), null, 'par de outro produto');
  assert.equal(validatePassportUsage('credit', [{ demand_key: 'annual_revenue', field_key: 'receita_anual' }, { demand_key: 'annual_revenue', field_key: 'receita_anual' }]), null, 'duplicado');
  assert.equal(validatePassportUsage('credit', 'receita_anual'), null);
}

// ----------------------------------------------------------- fronteira da API
process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
const { handleFinance } = await import('../lib/api/domains/finance.mjs');

const BUYER = '00000000-0000-4000-8000-0000000000b1';
const PROVIDER_ORG = '00000000-0000-4000-8000-0000000000c1';
const DOC = '00000000-0000-4000-8000-0000000000d9';
const ACTOR = '00000000-0000-4000-8000-0000000000a1';
let sent = [];
let responder = () => [];
globalThis.fetch = async (url, options = {}) => {
  const entry = { url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, apikey: options.headers?.apikey };
  sent.push(entry);
  return new Response(JSON.stringify(responder(entry)), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const deps = { requireUser: async () => ({ user: { id: ACTOR }, accessToken: 'user-jwt', headers: {} }), enforceRateLimit: async () => {} };
function request(method, url, body = null) {
  return Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), { method, url, headers: {} });
}
async function call(method, path, body = null) {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.payload = JSON.parse(value); } };
  await handleFinance(request(method, `/api/finance/${path}`, body), res, path.split('?')[0], deps);
  return res;
}
async function rejects(method, path, body, status, code = null) {
  await assert.rejects(() => call(method, path, body), (error) => {
    assert.equal(error.status, status, `${path}: esperado ${status}, recebido ${error.status} (${error.message})`);
    if (code) assert.equal(error.code, code);
    return true;
  });
}
const reset = (handler = () => []) => { sent = []; responder = handler; };
const buyerOrg = (entry) => (entry.url.includes('fin_organizations') ? [{ id: BUYER, legal_name: 'Demo', kind: 'BUYER', country: 'BR', sector: 'Alimentos', tax_identifier: '11222333000181' }] : null);

// Gravação vai pela RPC com valor canonizado e período do catálogo.
reset((entry) => buyerOrg(entry) || 'id-1');
await call('POST', 'profile', { organization_id: BUYER, field_key: 'antecipacao_atual', field_value: '1,45', source: 'extrato' });
{
  const rpc = sent.find((entry) => entry.url.endsWith('rpc/fin_passport_set_field'));
  assert.deepEqual(rpc.body, { p_org: BUYER, p_key: 'antecipacao_atual', p_value: '1.45', p_source: 'extrato', p_document_id: null, p_valid_until: null, p_review_after_days: 90 });
  assert.ok(!sent.some((entry) => entry.url.includes('fin_company_profiles') && entry.method === 'POST'), 'nenhuma escrita direta na tabela');
  assert.ok(sent.every((entry) => entry.apikey === 'test-anon-key'), 'nada usa a chave de serviço');
}
// Recusas antes do banco.
for (const [body, code] of [
  [{ field_key: 'receita_anual', field_value: 'R$ 182 milhões' }, 'invalid_field_value'],
  [{ field_key: 'porte', field_value: 'grande', source: 'integracao' }, 'invalid_source'],
  [{ field_key: 'porte', field_value: 'grande', source: 'ia_confirmado' }, 'invalid_source'],
  [{ field_key: 'doc_certidoes', field_value: 'Certidão' }, 'document_required'],
  [{ field_key: 'doc_certidoes', field_value: 'Certidão', document_id: 'nao-uuid' }, 'invalid_id'],
  [{ field_key: 'porte', field_value: 'grande', review_after_days: 3 }, 'invalid_review_period'],
  [{ field_key: 'porte', field_value: 'grande', valid_until: '01/10/2026' }, 'invalid_valid_until'],
  [{ field_key: 'Receita Anual', field_value: '1' }, 'invalid_field_key'],
  [{ field_key: 'sector', field_value: 'Alimentos' }, 'invalid_field_value']
]) {
  reset((entry) => buyerOrg(entry) || 'id-1');
  await rejects('POST', 'profile', { organization_id: BUYER, ...body }, 400, code);
  assert.ok(!sent.some((entry) => entry.url.includes('rpc/')), `${code}: chegou ao banco`);
}
// Documento vinculado segue para a RPC, que confere organização e tipo.
reset((entry) => buyerOrg(entry) || 'id-1');
await call('POST', 'profile', { organization_id: BUYER, field_key: 'doc_certidoes', field_value: 'Certidão federal', source: 'documento_interno', document_id: DOC, valid_until: '2026-12-31' });
assert.equal(sent.find((entry) => entry.url.endsWith('rpc/fin_passport_set_field')).body.p_document_id, DOC);

// Provedor não usa as rotas do Passport (nem para ler o próprio perfil vazio).
for (const [method, path, body] of [
  ['GET', `profile?organization_id=${PROVIDER_ORG}`, null],
  ['POST', 'profile', { organization_id: PROVIDER_ORG, field_key: 'porte', field_value: 'me' }],
  ['POST', 'profile/confirm', { organization_id: PROVIDER_ORG, field_key: 'porte' }],
  ['GET', `profile/history?organization_id=${PROVIDER_ORG}&field_key=porte`, null],
  ['GET', `rfq-passport?organization_id=${PROVIDER_ORG}&rfq_id=${DOC}`, null]
]) {
  reset((entry) => (entry.url.includes('fin_organizations') ? [{ id: PROVIDER_ORG, legal_name: 'Banco', kind: 'PROVIDER', country: 'BR' }] : []));
  await rejects(method, path, body, 400, 'organization_kind');
  assert.ok(!sent.some((entry) => /fin_company_profile|fin_rfq_profile_snapshots|rpc\//.test(entry.url)), `${path}: provedor alcançou o Passport`);
}
// Organização alheia: o RLS devolve vazio e a API fecha com 403.
reset(() => []);
await rejects('GET', `profile?organization_id=${BUYER}`, null, 403, 'organization_forbidden');

// Leitura monta o Passport com documentos e nomes, sem e-mail.
reset((entry) => {
  if (entry.url.includes('fin_organizations')) return buyerOrg(entry);
  if (entry.url.includes('fin_company_profiles')) return [{ id: 'r1', field_key: 'receita_anual', field_value: '182000000', source: 'documento_interno', updated_at: new Date().toISOString(), updated_by: ACTOR }];
  if (entry.url.includes('fin_private_documents')) return [{ id: DOC, title: 'Contrato social', current_version: 1, removed_at: null }];
  if (entry.url.includes('fin_members')) return [{ user_id: ACTOR, display_name: 'Helena Duarte' }];
  return [];
});
{
  const res = await call('GET', `profile?organization_id=${BUYER}`);
  const empresa = res.payload.passport.domains.find((domain) => domain.id === 'empresa');
  assert.equal(empresa.fields.find((field) => field.key === 'tax_identifier').value, '11222333000181');
  assert.equal(empresa.fields.find((field) => field.key === 'receita_anual').updated_by_name, 'Helena Duarte');
  assert.deepEqual(res.payload.documents, [{ id: DOC, title: 'Contrato social', current_version: 1 }]);
  const docQuery = sent.find((entry) => entry.url.includes('fin_private_documents')).url;
  assert.match(docQuery, /entity_type=eq\.profile/);
  assert.match(docQuery, new RegExp(`entity_id=eq\\.${BUYER}`));
  assert.ok(!JSON.stringify(res.payload).includes('@'));
}

// Confirmação e histórico.
reset((entry) => buyerOrg(entry) || '2026-10-01T10:00:00Z');
await call('POST', 'profile/confirm', { organization_id: BUYER, field_key: 'receita_anual' });
assert.deepEqual(sent.find((entry) => entry.url.endsWith('rpc/fin_passport_confirm_field')).body, { p_org: BUYER, p_key: 'receita_anual' });
reset((entry) => buyerOrg(entry) || (entry.url.includes('fin_members') ? [{ user_id: ACTOR, display_name: 'Helena Duarte' }] : [{ change_type: 'updated', previous_value: '1', new_value: '2', changed_by: ACTOR, changed_at: '2026-10-01T10:00:00Z' }]));
{
  const res = await call('GET', `profile/history?organization_id=${BUYER}&field_key=receita_anual`);
  assert.deepEqual(res.payload.rows, [{ change_type: 'updated', previous_value: '1', new_value: '2', changed_at: '2026-10-01T10:00:00Z', changed_by_name: 'Helena Duarte' }]);
  assert.match(sent.find((entry) => entry.url.includes('fin_company_profile_history')).url, new RegExp(`organization_id=eq\\.${BUYER}`));
}

// RFQ a partir do Passport: só pares válidos do produto, e só o que está na demanda.
reset((entry) => buyerOrg(entry) || 'rfq-id');
await call('POST', 'rfqs', {
  organization_id: BUYER, product: 'credit', title: 'Capital de giro DEMO',
  demand: { amount: 500000, purpose: 'capital_de_giro', term_months: 24, annual_revenue: 182000000 },
  passport_fields: [{ demand_key: 'annual_revenue', field_key: 'receita_anual' }, { demand_key: 'collateral', field_key: 'garantias_disponiveis' }]
});
{
  const rpc = sent.find((entry) => entry.url.endsWith('rpc/fin_create_rfq_from_passport'));
  assert.deepEqual(rpc.body.p_usage, [{ demand_key: 'annual_revenue', field_key: 'receita_anual' }], 'campo apagado na RFQ não é fotografado');
  assert.ok(!sent.some((entry) => entry.url.endsWith('rpc/fin_create_rfq')));
}
reset((entry) => buyerOrg(entry) || 'rfq-id');
await call('POST', 'rfqs', { organization_id: BUYER, product: 'credit', title: 'Sem Passport DEMO', demand: { amount: 1, purpose: 'outro', term_months: 1 } });
assert.ok(sent.some((entry) => entry.url.endsWith('rpc/fin_create_rfq')), 'sem Passport usa a criação original');
reset((entry) => buyerOrg(entry) || 'rfq-id');
await rejects('POST', 'rfqs', {
  organization_id: BUYER, product: 'credit', title: 'Par inválido DEMO', demand: { amount: 1, purpose: 'outro', term_months: 1 },
  passport_fields: [{ demand_key: 'amount', field_key: 'receita_anual' }]
}, 400, 'invalid_passport_usage');
assert.ok(!sent.some((entry) => entry.url.includes('rpc/')));

console.log('Financial Passport: catálogo, validação, frescor, cobertura, reuso em RFQ e fronteira da API aprovados.');

// Entity resolution never imports another entity's balances or custom fields.
{
 const A = '00000000-0000-4000-8000-000000000e01', B = '00000000-0000-4000-8000-000000000e02';
 const rows = [
  {field_key:'receita_anual',field_value:'900'},
  {field_key:'moeda_base',field_value:'BRL'},
  {field_key:'receita_anual',field_value:'100',legal_entity_id:A,source:'extrato',updated_at:'2026-10-01',updated_by:ACTOR},
  {field_key:'receita_anual',field_value:'200',legal_entity_id:B},
  {field_key:'campo_livre',field_value:'secret B',legal_entity_id:B}
 ];
 const view = buildPassport({rows,legalEntityId:A,entity:{legal_name:'Entity A',tax_identifier:'11222333000181'}});
 const fields=view.domains.flatMap(d=>d.fields);
 assert.equal(fields.find(f=>f.key==='receita_anual').value,'100');
 assert.equal(fields.find(f=>f.key==='moeda_base').inherited,true);
 assert.equal(fields.find(f=>f.key==='legal_name').value,'Entity A');
 assert.equal(view.custom.length,0);
 assert(!JSON.stringify(view).includes('secret B'));
 assert.equal(passportPrefill('credit',{rows,legalEntityId:A}).find(f=>f.field_key==='receita_anual').value,100);
 assert.equal(passportPrefill('credit',{rows,legalEntityId:'unknown'}).some(f=>f.field_key==='receita_anual'),false);
 assert.equal(passportPrefill('credit',{rows}).find(f=>f.field_key==='receita_anual').value,900);
 reset(entry=>buyerOrg(entry) || (entry.url.includes('fin_legal_entities') ? [{id:A,kind:'legal_entity',legal_name:'Entity A'}] : entry.url.includes('fin_company_profiles') ? rows : []));
 const res=await call('GET',`profile?organization_id=${BUYER}&legal_entity_id=${A}`);
 assert.equal(res.payload.passport.legal_entity_id,A);
 assert(!JSON.stringify(res.payload).includes('secret B'));
 reset(entry=>buyerOrg(entry) || []);
 await rejects('GET',`profile?organization_id=${BUYER}&legal_entity_id=${B}`,null,404,'entity_not_found');
 assert(!sent.some(entry=>entry.url.includes('fin_company_profiles')));
 reset(entry=>buyerOrg(entry) || (entry.url.includes('fin_legal_entities') ? [{id:A,kind:'legal_entity'}] : 'id'));
 await call('POST','profile',{organization_id:BUYER,legal_entity_id:A,field_key:'receita_anual',field_value:'100'});
 assert.equal(sent.find(entry=>entry.url.endsWith('rpc/fin_passport_set_scoped_field')).body.p_entity,A);
}
console.log('Passport entity scope: precedence, no sibling leakage, identity, prefill and API negatives passed.');

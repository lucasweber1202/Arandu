#!/usr/bin/env node
// Policy & Approval Engine v2: validação espelho do banco, leitura humana sem
// opinião e fronteira da API (JWT do usuário, nenhuma RPC com entrada inválida,
// erros do banco traduzidos sem vazar detalhes). A avaliação real é provada em
// tests/database/financial-policy-engine.sql.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import {
  validatePolicyDocument, validateCondition, validateAssignments, cleanDeclaredFacts, describeCondition, describeRule, describeStage,
  POLICY_FACTS, STEP_REASON_CODES, EXCEPTION_REASON_CODES
} from '../lib/finance/policy.mjs';
import { handleFinance } from '../lib/api/domains/finance.mjs';

process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_ANON_KEY = 'anon';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

// ------------------------------------------------------------ validação
const stage = (extra = {}) => ({ key: 'group_treasury', label: 'Tesouraria do grupo', sequence: 2, roles: ['admin', 'finance_manager'], scope: 'group', min_approvals: 1, due_hours: 24, ...extra });
const groupDocument = {
  rules: [
    { id: 'above_1m', label: 'Acima de R$ 1 milhão', when: [{ fact: 'amount', op: 'gte', value: 1000000, currency: 'BRL' }], stages: [stage()] },
    { id: 'competition', label: 'Crédito exige duas propostas', when: [{ fact: 'product', op: 'in', value: ['credit'] }], requirements: { min_proposals: 2 } }
  ],
  fallback: { stages: [{ key: 'controller', label: 'Controladoria', sequence: 3, roles: ['admin'], scope: 'group', min_approvals: 1 }] },
  sod: { requester_cannot_decide: true }, exception_approver_roles: ['admin'], expire_after_hours: 336
};
assert.deepEqual(validatePolicyDocument(groupDocument), { ok: true });
assert.deepEqual(validatePolicyDocument({ rules: [] }), { ok: true }, 'policy sem regras (só aposentadoria/fallback) é válida');
const invalid = {
  'valor sem moeda': { rules: [{ id: 'x1', label: 'Valor', when: [{ fact: 'amount', op: 'gte', value: 10 }], stages: [stage()] }] },
  'fato proprietário': { rules: [{ id: 'x1', label: 'Score', when: [{ fact: 'arandu_score', op: 'gte', value: 10 }], stages: [stage()] }] },
  'regra repetida': { rules: [{ id: 'x1', label: 'Uma', stages: [stage()] }, { id: 'x1', label: 'Duas', stages: [stage()] }] },
  'etapa com dois sentidos': { rules: [{ id: 'x1', label: 'Uma', stages: [stage()] }, { id: 'x2', label: 'Duas', stages: [stage({ sequence: 1 })] }] },
  'regra que não exige nada': { rules: [{ id: 'x1', label: 'Vazia', when: [] }] },
  'HTML': { rules: [{ id: 'x1', label: '<b>x</b>', requirements: { justification: true } }] },
  'data inexistente': { rules: [{ id: 'x1', label: 'Data', when: [{ fact: 'maturity_date', op: 'after', value: '2030-02-30' }], requirements: { justification: true } }] },
  'papel de provedor': { rules: [{ id: 'x1', label: 'Provedor', stages: [stage({ roles: ['provider_user'] })] }] },
  'mínimo fora da faixa': { rules: [{ id: 'x1', label: 'Mínimo', stages: [stage({ min_approvals: 9 })] }] },
  'campo desconhecido': { rules: [], auto_approve: true },
  'muitas regras': { rules: Array.from({ length: 31 }, (_, index) => ({ id: `r_${index}`, label: 'Regra', requirements: { justification: true } })) }
};
for (const [label, document] of Object.entries(invalid)) {
  const out = validatePolicyDocument(document);
  assert.equal(out.ok, false, `aceitou policy inválida: ${label}`);
  assert.ok(out.error.length > 5, `sem mensagem útil: ${label}`);
}
assert.equal(validateCondition({ fact: 'currency', op: 'in', value: ['BRL', 'usd'] }) !== null, true, 'moeda minúscula aceita');
assert.equal(validateCondition({ fact: 'flag', op: 'present', value: 'sanctions_review' }), null);
assert.equal(validateCondition({ fact: 'provider_new', op: 'eq', value: 'sim' }) !== null, true);

// ------------------------------------------------------------ leitura humana
assert.equal(describeCondition({ fact: 'amount', op: 'gte', value: 1000000, currency: 'BRL' }), 'Valor da operação maior ou igual a BRL 1.000.000');
assert.equal(describeCondition({ fact: 'legal_entity', op: 'in', value: ['e1'] }, { entities: [{ id: 'e1', legal_name: 'Vitta Alimentos Ltda', short_name: 'Vitta' }] }), 'Entidade legal é uma de Vitta');
const described = describeRule(groupDocument.rules[0]);
assert.equal(described.when, 'Valor da operação maior ou igual a BRL 1.000.000');
assert.match(described.requires[0], /Tesouraria do grupo: 1 aprovação\(ões\) de Administração ou Gestão financeira/);
assert.equal(describeRule({ ...groupDocument.rules[1] }).requires[0], 'Ao menos 2 propostas (ou exceção aprovada)');
assert.match(describeStage(stage({ due_hours: null })), /Tesouraria do grupo \(escopo de grupo\)$/);
// O engine não fala em melhor, score ou recomendação: a policy é do cliente.
const vocabulary = JSON.stringify({ POLICY_FACTS, STEP_REASON_CODES, EXCEPTION_REASON_CODES }) + readFileSync('finance/src/views/policy.js', 'utf8') + readFileSync('lib/finance/policy.mjs', 'utf8');
assert.doesNotMatch(vocabulary, /melhor (banco|proposta|provedor)|score do arandu|recomendamos|ranking/i);

// ------------------------------------------------------------ indicações e fatos
const U = (n) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
const plan = [{ key: 'entity.local', label: 'Local', min_approvals: 1 }, { key: 'group.group_treasury', label: 'Tesouraria', min_approvals: 2 }];
assert.deepEqual(validateAssignments({ 'entity.local': [U(1)], 'group.group_treasury': [U(2), U(3)] }, plan), { ok: true });
assert.equal(validateAssignments({ 'entity.local': [U(1)], 'group.group_treasury': [U(1), U(3)] }, plan).ok, false, 'mesma pessoa em duas etapas');
assert.equal(validateAssignments({ 'entity.local': [U(1)], 'group.group_treasury': [U(2)] }, plan).ok, false, 'mínimo da etapa');
assert.equal(validateAssignments({ 'entity.local': [U(1)], 'group.extra': [U(2)] }, plan).ok, false, 'etapa inventada');
assert.equal(validateAssignments({ 'entity.local': ['forjado'] }).ok, false);
assert.deepEqual(cleanDeclaredFacts({ covenant_present: true, flags: ['sanctions_review', 'Bad Flag', 'sanctions_review'], amount: 1, provider_status: 'EVIDENCIA_REGISTRADA' }),
  { covenant_present: true, flags: ['sanctions_review'] }, 'fato declarado só covenant e sinalizador; o resto vem do banco');

// ------------------------------------------------------------ API
const ORG = '00000000-0000-4000-8000-000000000201', ACTOR = '00000000-0000-4000-8000-000000000202', OTHER = '00000000-0000-4000-8000-000000000203';
const RFQ = '00000000-0000-4000-8000-000000000204', PROPOSAL = '00000000-0000-4000-8000-000000000205', REQUEST = '00000000-0000-4000-8000-000000000206';
const VERSION = '00000000-0000-4000-8000-000000000207', DELEGATOR = '00000000-0000-4000-8000-000000000208';
let sent = [];
let responder = () => [];
globalThis.fetch = async (url, options = {}) => {
  const entry = { url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, authorization: options.headers?.Authorization, apikey: options.headers?.apikey };
  sent.push(entry);
  const result = responder(entry);
  if (result instanceof Error) return new Response(JSON.stringify({ message: result.message }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  return new Response(JSON.stringify(result ?? []), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const reset = (handler = () => []) => { sent = []; responder = handler; };
const deps = { requireUser: async () => ({ user: { id: ACTOR }, accessToken: 'user-jwt', headers: {} }), enforceRateLimit: async () => {} };
function request(method, url, body) {
  return Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), { method, url, headers: {} });
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
    assert.doesNotMatch(error.message, /fin_|postgres|supabase|relation|segredo/i, 'mensagem crua do banco vazou');
    return true;
  });
}
const buyer = (entry) => (entry.url.includes('fin_organizations?select=id') ? [{ id: ORG, legal_name: 'Grupo', kind: 'BUYER' }] : null);
const rpcCalls = () => sent.filter((entry) => entry.url.includes('/rpc/'));

// Documento inválido não chega ao banco; válido sai com o JWT do usuário.
reset((entry) => buyer(entry) ?? []);
await rejects('POST', 'approval-policies', { body: { organization_id: ORG, name: 'Grupo', document: invalid['fato proprietário'] } }, 400, 'invalid_policy');
assert.equal(rpcCalls().length, 0);
reset((entry) => buyer(entry) ?? (entry.url.includes('rpc/fin_save_policy_draft') ? VERSION : []));
const saved = await call('POST', 'approval-policies', { body: { organization_id: ORG, legal_entity_id: '', name: 'Alçadas do grupo', document: groupDocument, change_note: 'v1' } });
assert.equal(saved.statusCode, 201);
assert.equal(saved.payload.version_id, VERSION);
const draft = rpcCalls()[0];
assert.equal(draft.authorization, 'Bearer user-jwt');
assert.equal(draft.apikey, 'anon', 'service role nunca é usada pela API de policy');
assert.deepEqual({ ...draft.body, p_document: undefined }, { p_org: ORG, p_entity: null, p_name: 'Alçadas do grupo', p_document: undefined, p_change_note: 'v1' });

// Outra organização: RLS devolve vazio e a API recusa antes de qualquer RPC.
reset(() => []);
await rejects('GET', 'approval-policies', { url: `/api/finance/approval-policies?organization_id=${OTHER}` }, 403);
await rejects('POST', 'approval-policies/flags', { body: { organization_id: OTHER, key: 'x_flag', label: 'Flag', kind: 'risk', active: true } }, 403);
assert.equal(rpcCalls().length, 0);

// Prévia: fatos declarados limpos; o resto dos fatos vem do banco.
reset((entry) => (entry.url.includes('rpc/fin_preview_approval_policy') ? { engine: 'policy', stages: [] } : []));
await call('POST', 'approval-policies/preview', { body: { rfq_id: RFQ, proposal_id: PROPOSAL, declared: { covenant_present: false, amount: 1, flags: ['ok_flag', '<x>'] } } });
assert.deepEqual(rpcCalls()[0].body, { p_rfq: RFQ, p_proposal: PROPOSAL, p_declared: { covenant_present: false, flags: ['ok_flag'] } });

// Pedido com policy: indicações conferidas antes do banco.
reset(() => []);
await rejects('POST', 'approvals/request', { body: { rfq_id: RFQ, proposal_id: PROPOSAL, rationale: 'Ok', assignments: { 'entity.local': [ACTOR], 'group.t': [ACTOR] } } }, 400, 'invalid_approvers');
assert.equal(rpcCalls().length, 0);
reset((entry) => (entry.url.includes('rpc/fin_request_policy_approval') ? REQUEST : []));
const requested = await call('POST', 'approvals/request', { body: { rfq_id: RFQ, proposal_id: PROPOSAL, rationale: 'Ok', justification: 'Banco único no prazo', assignments: { 'entity.local': [DELEGATOR] }, declared: { covenant_present: true } } });
assert.equal(requested.payload.engine, 'policy');
assert.equal(rpcCalls()[0].url.endsWith('/rpc/fin_request_policy_approval'), true);
assert.deepEqual(rpcCalls()[0].body.p_declared, { covenant_present: true });
// Erros do engine viram mensagens úteis, sem detalhe do banco.
for (const [message, status, code] of [
  ['policy approver ineligible', 400, 'policy_approver_ineligible'], ['policy assignment required', 409, 'policy_assignment_required'],
  ['segregation of duties', 403, 'segregation_of_duties'], ['approver no longer eligible', 403, 'approver_ineligible'],
  ['policy justification required', 400, 'policy_justification_required'], ['invalid policy exception', 400, 'invalid_policy_exception'],
  ['policy exception already open', 409, 'policy_exception_open'], ['approval expired', 409, 'approval_expired']
]) {
  reset((entry) => (entry.url.includes('/rpc/') ? new Error(`${message} (relation fin_approval_stages segredo)`) : []));
  await rejects('POST', 'approvals/request', { body: { rfq_id: RFQ, proposal_id: PROPOSAL, rationale: 'Ok', assignments: { 'entity.local': [DELEGATOR] } } }, status, code);
}

// Voto: motivo estruturado validado; a RPC v2 recebe o código.
reset(() => []);
await rejects('POST', 'approvals/act', { body: { request_id: REQUEST, action: 'rejected', comment: 'Não', reason_code: 'made_up' } }, 400);
assert.equal(rpcCalls().length, 0);
reset((entry) => (entry.url.includes('rpc/fin_act_on_approval_v2') ? 'rejected' : []));
await call('POST', 'approvals/act', { body: { request_id: REQUEST, action: 'rejected', comment: 'Revisar garantia', reason_code: 'risk_review' } });
assert.deepEqual(rpcCalls()[0].body, { p_request: REQUEST, p_action: 'rejected', p_comment: 'Revisar garantia', p_reason_code: 'risk_review' });

// Substituição exige motivo; exceção exige motivo estruturado e explicação.
reset(() => []);
await rejects('POST', 'approvals/supersede', { body: { request_id: REQUEST, reason: '' } }, 400);
await rejects('POST', 'approval-exceptions', { body: { request_id: REQUEST, policy_version_id: VERSION, rule_id: 'competition', reason_code: 'because', reason: 'Explicação longa o bastante' } }, 400);
await rejects('POST', 'approval-exceptions', { body: { request_id: REQUEST, policy_version_id: VERSION, rule_id: 'competition', reason_code: 'urgent_operation', reason: 'curto' } }, 400);
await rejects('POST', 'approval-exceptions/decide', { body: { exception_id: VERSION, decision: 'auto', comment: 'ok ok' } }, 400);
await rejects('POST', 'approval-delegations', { body: { organization_id: ORG, delegate_id: DELEGATOR, ends_at: 'amanhã', reason: 'Férias' } }, 403);
assert.equal(rpcCalls().length, 0);
reset((entry) => buyer(entry) ?? []);
await rejects('POST', 'approval-delegations', { body: { organization_id: ORG, delegate_id: DELEGATOR, ends_at: 'amanhã', reason: 'Férias' } }, 400, 'invalid_delegation');
assert.equal(rpcCalls().length, 0);

// Leitura: `viewer_can_act` vale para etapa ativa própria ou delegada vigente.
const now = Date.now();
reset((entry) => {
  if (buyer(entry)) return buyer(entry);
  if (entry.url.includes('fin_approval_requests?')) return [{ id: REQUEST, rfq_id: RFQ, requested_by: OTHER, status: 'pending', policy_snapshot: { engine: 'policy' } }];
  if (entry.url.includes('fin_approval_steps?')) return [{ id: 's1', request_id: REQUEST, position: 1, approver_id: DELEGATOR, status: 'pending', stage_id: 'st1' }];
  if (entry.url.includes('fin_approval_stages?')) return [{ id: 'st1', request_id: REQUEST, status: 'active', allow_delegation: true }];
  if (entry.url.includes('fin_policy_exceptions?')) return [];
  if (entry.url.includes('fin_approval_delegations?')) return [{ delegator_id: DELEGATOR, starts_at: new Date(now - 60000).toISOString(), ends_at: new Date(now + 3600000).toISOString() }];
  return [];
});
const listed = await call('GET', 'approvals', { url: `/api/finance/approvals?organization_id=${ORG}` });
assert.equal(listed.payload.rows[0].viewer_can_act, true);
assert.equal(listed.payload.rows[0].engine, 'policy');
assert.ok(sent.some((entry) => entry.url.includes(`delegate_id=eq.${ACTOR}`)), 'delegação lida só do próprio usuário');
console.log('Policy Engine v2: validação espelho, leitura humana sem opinião, indicações por etapa e fronteira da API aprovadas.');

import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { validatePolicyRules, describeRule } from '../lib/finance/policy.mjs';

// Policy & Approval Engine v2: forma das regras (espelho da validação do
// banco), descrição legível e fronteira da API (só RPC, JWT do usuário, erros
// da policy traduzidos). A avaliação real é testada em
// tests/database/financial-policy-engine.sql.

process.env.SUPABASE_URL = 'https://supabase.example.invalid';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const ORG = '00000000-0000-4000-8000-0000000000b1';
const RFQ = '00000000-0000-4000-8000-0000000000f1';
const PROPOSAL = '00000000-0000-4000-8000-0000000000e1';
const MEMBER = '00000000-0000-4000-8000-0000000000a2';
const ACTOR = '00000000-0000-4000-8000-0000000000a1';

{
  const ok = validatePolicyRules([{ id: 'acima_5mi', label: 'Acima de 5 mi', when: { products: ['credit', 'credit'], amount_gte: '5000000', provider_new: true, term_months_gt: '' },
    require: { approvals: '2', approver_groups: [{ roles: ['admin', 'finance_manager'], scope: 'group', label: 'Tesouraria do grupo' }], step_hours: 24, escalate_to: MEMBER, sod_decider: true, justification: false } }]);
  assert.equal(ok.ok, true, ok.error);
  assert.deepEqual(ok.rules[0], { id: 'acima_5mi', label: 'Acima de 5 mi', when: { products: ['credit'], amount_gte: 5000000, provider_new: true },
    require: { approvals: 2, approver_groups: [{ roles: ['admin', 'finance_manager'], scope: 'group', label: 'Tesouraria do grupo' }], step_hours: 24, escalate_to: MEMBER, sod_decider: true } });
  for (const [rules, why] of [
    [[], 'vazia'],
    [[{ id: 'r1', label: 'Sem requisito', when: {}, require: {} }], 'sem requisito'],
    [[{ id: 'r1', label: 'Condição inventada', when: { rating: 'AAA' }, require: { approvals: 1 } }], 'condição desconhecida'],
    [[{ id: 'r1', label: 'Recomendar', when: {}, require: { recommend_provider: true } }], 'requisito desconhecido'],
    [[{ id: 'r1', label: 'Seis', when: {}, require: { approvals: 6 } }], 'aprovadores demais'],
    [[{ id: 'r1', label: 'Papel', when: {}, require: { approver_groups: [{ roles: ['provider_user'], label: 'Banco' }] } }], 'papel de provedor'],
    [[{ id: 'r1', label: 'Escala', when: {}, require: { escalate_to: 'fulano' } }], 'escalação sem membro'],
    [[{ id: 'r1', label: 'Dup', when: {}, require: { approvals: 1 } }, { id: 'r1', label: 'Dup', when: {}, require: { approvals: 1 } }], 'id repetido'],
    [[{ id: 'r1', label: '<b>x</b>', when: {}, require: { approvals: 1 } }], 'HTML']
  ]) assert.equal(validatePolicyRules(rules).ok, false, why);
  const text = describeRule({ when: { products: ['credit'], amount_gte: 5000000, proposals_lt: 3 }, require: { approvals: 2, min_proposals: 3, sod_decider: true } });
  assert.match(text, /^Quando crédito, valor ≥ 5\.000\.000, menos de 3 propostas: 2 aprovador\(es\), 3 propostas ou justificativa, quem pediu não decide\.$/);
  assert.doesNotMatch(text, /melhor|recomend/i);
}

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
    assert.doesNotMatch(error.message, /fin_|postgres|relation/i);
    return true;
  });
}
const buyer = (entry) => (entry.url.includes('fin_organizations?select=id') ? [{ id: ORG, legal_name: 'Grupo', kind: 'BUYER' }] : null);

reset((entry) => buyer(entry) ?? 'p1');
await call('POST', 'policies', { body: { organization_id: ORG, policy_key: 'alcadas', name: 'Alçadas', rules: [{ id: 'r1', label: 'Tudo', when: {}, require: { approvals: 1 } }], status: 'active', created_by: 'x' } });
{
  const rpcCall = sent.find((entry) => entry.url.includes('rpc/fin_publish_policy'));
  assert.deepEqual(Object.keys(rpcCall.body).sort(), ['p_entity', 'p_key', 'p_name', 'p_org', 'p_rules']);
  assert.equal(rpcCall.authorization, 'Bearer user-jwt');
}
reset(buyer);
await rejects('POST', 'policies', { body: { organization_id: ORG, policy_key: 'Alçadas!', name: 'X', rules: [] } }, 400, 'invalid_policy');
await rejects('POST', 'policies', { body: { organization_id: ORG, policy_key: 'alcadas', name: 'Alçadas', rules: [{ id: 'r1', label: 'Rank', when: { score: 1 }, require: { approvals: 1 } }] } }, 400, 'invalid_policy');
assert.ok(!sent.some((entry) => entry.url.includes('rpc/')));

reset(() => ({ requirements: { approvals: 2 } }));
{
  const res = await call('GET', 'policy-preview', { url: `/api/finance/policy-preview?rfq_id=${RFQ}&proposal_id=${PROPOSAL}` });
  assert.equal(res.payload.evaluation.requirements.approvals, 2);
  assert.deepEqual(sent[0].body, { p_rfq: RFQ, p_proposal: PROPOSAL });
}
await rejects('GET', 'policy-preview', { url: '/api/finance/policy-preview?rfq_id=abc' }, 400);

// Pedido de aprovação vai sempre pela v2 (policy avaliada no banco).
reset(() => 'req1');
await call('POST', 'approvals/request', { body: { rfq_id: RFQ, proposal_id: PROPOSAL, approver_ids: [MEMBER], rationale: 'Contexto', justification: 'Só um banco ofertou no prazo.' } });
assert.ok(sent[0].url.endsWith('rpc/fin_request_approval_v2'));
assert.equal(sent[0].body.p_justification, 'Só um banco ofertou no prazo.');
for (const [message, status, code] of [
  ['policy approvers required', 400, 'policy_approvers_required'],
  ['policy approver group missing', 400, 'policy_approver_group_missing'],
  ['policy justification required', 400, 'policy_justification_required']
]) {
  reset(() => new Error(message));
  await rejects('POST', 'approvals/request', { body: { rfq_id: RFQ, proposal_id: PROPOSAL, approver_ids: [MEMBER], rationale: 'Contexto' } }, status, code);
}
reset((entry) => (entry.url.includes('fin_rfqs?') ? [{ id: RFQ, product: 'credit', organization_id: ORG }] : new Error('segregation of duties')));
await rejects('POST', 'decisions', { body: { rfq_id: RFQ, proposal_id: PROPOSAL, rationale: 'Decisão' } }, 403, 'segregation_of_duties');

console.log('Policy Engine v2: forma das regras, descrição sem juízo, publicação só por RPC, prévia e pedido pela avaliação do banco aprovados.');

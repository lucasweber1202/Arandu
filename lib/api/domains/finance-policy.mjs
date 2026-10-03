import { HttpError, json, readBody, clean, limited } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { validatePolicyRules } from '../../finance/policy.mjs';

// Policy & Approval Engine v2: publicação versionada (só admin, no banco),
// prévia da avaliação para um processo e leitura das versões. A avaliação em
// si mora no banco (fin_evaluate_policies) e é gravada no pedido de aprovação.

/**
 * @returns {Promise<boolean>} true quando a rota foi tratada aqui.
 */
export async function handleFinancePolicy(req, res, { resource, sub, token, headers }) {
  if (resource === 'policies' && !sub && req.method === 'GET') {
    const organization = await memberOrganization(token, query(req).get('organization_id'), ['BUYER']);
    const rows = await rest(token, `fin_policy_versions?select=id,policy_key,version,name,legal_entity_id,rules,status,created_by,created_at,retired_at&organization_id=eq.${organization.id}&order=policy_key.asc,version.desc&limit=500`);
    json(res, 200, { ok: true, rows: rows || [], notice: 'Policies são da sua empresa: definem quais fatos exigem quais etapas humanas. Mudanças valem para pedidos novos; pedidos em andamento mantêm a avaliação gravada.' }, headers);
    return true;
  }
  if (resource === 'policies' && !sub && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const key = clean(body.policy_key);
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(key)) throw new HttpError(400, 'Identificador da policy inválido (letras minúsculas, números e _).', 'invalid_policy');
    const name = limited(body.name, 160);
    if (name.length < 2 || /[<>]/.test(name)) throw new HttpError(400, 'Dê um nome à policy (2 a 160 caracteres, sem HTML).', 'invalid_policy');
    const checked = validatePolicyRules(body.rules);
    if (!checked.ok) throw new HttpError(400, checked.error, 'invalid_policy');
    const id = await rpc(token, 'fin_publish_policy', {
      p_org: organization.id, p_key: key, p_name: name,
      p_entity: clean(body.legal_entity_id) ? requireUuid(body.legal_entity_id, 'legal_entity_id') : null,
      p_rules: checked.rules
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }
  if (resource === 'policies' && sub === 'retire' && req.method === 'POST') {
    const body = await readBody(req);
    await rpc(token, 'fin_retire_policy', { p_policy: requireUuid(body.policy_id, 'policy_id') });
    json(res, 200, { ok: true }, headers);
    return true;
  }
  if (resource === 'policy-preview' && req.method === 'GET') {
    const params = query(req);
    const evaluation = await rpc(token, 'fin_preview_policy', {
      p_rfq: requireUuid(params.get('rfq_id'), 'rfq_id'),
      p_proposal: clean(params.get('proposal_id')) ? requireUuid(params.get('proposal_id'), 'proposal_id') : null
    });
    json(res, 200, { ok: true, evaluation }, headers);
    return true;
  }
  if (resource === 'approval-deadlines' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
    const escalated = await rpc(token, 'fin_process_approval_deadlines', { p_org: organization.id });
    json(res, 200, { ok: true, escalated: Number(escalated) || 0 }, headers);
    return true;
  }
  return false;
}

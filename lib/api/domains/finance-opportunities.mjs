import { HttpError, json, readBody } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { presentOpportunityPage, presentOpportunityDetail, OPPORTUNITY_TYPES, OPPORTUNITY_STATUS, OPPORTUNITY_TRANSITIONS, DISMISSAL_REASONS, SOURCES, RULES } from '../../finance/opportunity-presenter.mjs';

// Opportunity Engine. Leitura e escrita com o JWT de quem chama; o motor roda
// só no job agendado e por evento no banco, nunca como varredura por request.
const optionalUuid = (q, key) => (q.get(key) ? requireUuid(q.get(key), key) : null);
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
const text = (v, max = 1000) => typeof v === 'string' && v.trim().length >= 1 && v.length <= max && !/[<>]/.test(v);

export function opportunityFilters(q) {
  const f = { type: q.get('opportunity_type') || null, status: q.get('status') || null, source: q.get('source') || null, due: q.get('due_before') || null, limit: Number(q.get('limit') || 25) };
  if ((f.type && !OPPORTUNITY_TYPES[f.type]) || (f.status && !OPPORTUNITY_STATUS[f.status]) || (f.source && !SOURCES[f.source]) || (f.due && !isDay(f.due)) || !Number.isInteger(f.limit) || f.limit < 1 || f.limit > 50) {
    throw new HttpError(400, 'Filtros de oportunidades inválidos.', 'invalid_opportunity_filters');
  }
  return f;
}
export function validateTransition(b) {
  if (!OPPORTUNITY_STATUS[b.expected_status] || !(OPPORTUNITY_TRANSITIONS[b.expected_status] || []).includes(b.to_status)) return 'Transição não permitida a partir do estado atual.';
  if (b.to_status === 'dismissed' && !DISMISSAL_REASONS[b.dismissal_reason]) return 'Informe o motivo do descarte.';
  if (b.to_status === 'acted' && !(text(b.resolution) && b.resolution.trim().length >= 3)) return 'Descreva a ação tomada por uma pessoa.';
  if (b.note !== undefined && b.note !== null && !text(b.note)) return 'Nota inválida (até 1000 caracteres, sem HTML).';
  return null;
}
export function ruleInput(b) {
  const [key, seen] = String(b.rule || '').split('|');
  if (!RULES[key]) return { error: 'Regra desconhecida.' };
  const parameters = {};
  for (const k of Object.keys(RULES[key])) if (b[k] !== undefined && b[k] !== null && b[k] !== '') parameters[k] = Number(b[k]);
  const enabled = b.enabled === true || b.enabled === 'true' ? true : b.enabled === false || b.enabled === 'false' ? false : null;
  if (enabled === null || !text(b.reason) || b.reason.trim().length < 3) return { error: 'Informe situação e justificativa.' };
  return { key, expected: Number(seen || 0), input: { enabled, parameters, reason: b.reason } };
}

export async function handleFinanceOpportunities(req, res, { resource, sub, token, headers }) {
  if (resource !== 'opportunities') return false;
  const q = query(req);
  if (req.method === 'GET' && !sub) {
    const org = await memberOrganization(token, q.get('organization_id'), ['BUYER']);
    const f = opportunityFilters(q);
    const entity = optionalUuid(q, 'legal_entity_id');
    const provider = optionalUuid(q, 'provider_id');
    const today = new Date().toISOString().slice(0, 10);
    const [rows, summary, rules] = await Promise.all([
      rpc(token, 'fin_list_opportunities', { p_org: org.id, p_entity: entity, p_type: f.type, p_provider: provider, p_status: f.status, p_due_before: f.due, p_source: f.source, p_after: optionalUuid(q, 'after'), p_limit: f.limit }),
      rpc(token, 'fin_opportunity_summary', { p_org: org.id, p_entity: entity, p_provider: provider, p_day: today }),
      rest(token, `fin_opportunity_rules?select=rule_key,version,enabled,parameters&organization_id=eq.${org.id}&order=rule_key.asc,version.desc&limit=500`)
    ]);
    const page = rows.slice(0, f.limit);
    json(res, 200, { ok: true, summary, ...presentOpportunityPage({ rows: page, summary, next: rows.length > f.limit ? page.at(-1).id : null, rules: rules || [], today }) }, headers);
    return true;
  }
  if (req.method === 'GET' && sub === 'detail') {
    const id = requireUuid(q.get('id'), 'id');
    const rows = await rest(token, `fin_opportunities?select=*&id=eq.${id}&limit=1`);
    const o = rows?.[0];
    if (!o) throw new HttpError(404, 'Oportunidade indisponível para sua conta.', 'opportunity_not_found');
    const [events, reviewers, entity] = await Promise.all([
      rest(token, `fin_opportunity_events?select=*&opportunity_id=eq.${id}&order=created_at.asc&limit=200`),
      rest(token, `fin_members?select=user_id,display_name,role&organization_id=eq.${o.organization_id}&role=in.(admin,finance_manager)&limit=200`),
      o.legal_entity_id ? rest(token, `fin_legal_entities?select=legal_name&id=eq.${o.legal_entity_id}&limit=1`) : []
    ]);
    json(res, 200, { ok: true, ...presentOpportunityDetail({ opportunity: o, events, reviewers, entity: entity?.[0]?.legal_name }) }, headers);
    return true;
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Método indisponível.', 'method_not_allowed');
  const b = await readBody(req);
  if (sub === 'transition') {
    const error = validateTransition(b);
    if (error) throw new HttpError(400, error, 'invalid_opportunity_transition');
    const input = { to_status: b.to_status, ...(b.reviewer_id ? { reviewer_id: requireUuid(b.reviewer_id, 'reviewer_id') } : {}), ...(b.dismissal_reason ? { dismissal_reason: b.dismissal_reason } : {}),
      ...(b.resolution ? { resolution: b.resolution } : {}), ...(b.note ? { note: b.note } : {}) };
    json(res, 201, { ok: true, status: await rpc(token, 'fin_transition_opportunity', { p_id: requireUuid(b.opportunity_id, 'opportunity_id'), p_expected: b.expected_status, p_input: input }) }, headers);
    return true;
  }
  if (sub === 'rfq') {
    if (b.confirmed !== true) throw new HttpError(400, 'Confirme a criação do rascunho de RFQ.', 'opportunity_rfq_confirmation');
    json(res, 201, { ok: true, id: await rpc(token, 'fin_opportunity_start_rfq', { p_id: requireUuid(b.opportunity_id, 'opportunity_id'), p_confirmed: true }) }, headers);
    return true;
  }
  if (sub === 'rules') {
    const org = await memberOrganization(token, b.organization_id, ['BUYER']);
    const parsed = ruleInput(b);
    if (parsed.error) throw new HttpError(400, parsed.error, 'invalid_opportunity_rule');
    json(res, 201, { ok: true, version: await rpc(token, 'fin_set_opportunity_rule', { p_org: org.id, p_key: parsed.key, p_expected: parsed.expected, p_input: parsed.input }) }, headers);
    return true;
  }
  throw new HttpError(404, 'Recurso indisponível.', 'not_found');
}

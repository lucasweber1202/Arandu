import { HttpError, json, readBody } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { CATEGORIES, STATUS, validateRequirement, validateEvidence, validateTransition, consultStatus } from '../../finance/qualification.mjs';
import { presentQualificationPage, presentQualificationDetail } from '../../finance/qualification-presenter.mjs';

// Provider Qualification & Due Diligence. JWT de quem chama, RLS e RPCs.
// Exigências são do cliente; decisão é humana e auditada no banco.
const PAGE = 25;
const today = () => new Date().toISOString().slice(0, 10);
const optionalUuid = (v, label) => (v === undefined || v === null || v === '' ? null : requireUuid(v, label));

async function context(token, orgId) {
  const [providers, entities, members, requirements] = await Promise.all([
    rest(token, `fin_providers?select=id,name&organization_id=eq.${orgId}&order=name.asc&limit=500`),
    rest(token, `fin_legal_entities?select=id,legal_name&organization_id=eq.${orgId}&order=legal_name.asc&limit=500`),
    rest(token, `fin_members?select=user_id,role,display_name&organization_id=eq.${orgId}&limit=500`),
    rest(token, `fin_qualification_requirements?select=*&organization_id=eq.${orgId}&status=eq.active&order=area.asc,title.asc&limit=500`)
  ]);
  return { providers: providers || [], entities: entities || [], members: members || [], requirements: requirements || [] };
}

export async function handleFinanceQualifications(req, res, { resource, sub, token, headers }) {
  if (resource !== 'qualifications') return false;
  const q = query(req);
  if (req.method === 'GET' && !sub) {
    const org = await memberOrganization(token, q.get('organization_id'), ['BUYER']);
    const filters = [`organization_id=eq.${org.id}`];
    if (q.get('status')) { if (!STATUS[q.get('status')]) throw new HttpError(400, 'Estado inválido.', 'invalid_qualification_filters'); filters.push(`status=eq.${q.get('status')}`); }
    if (q.get('category')) { if (!CATEGORIES[q.get('category')]) throw new HttpError(400, 'Categoria inválida.', 'invalid_qualification_filters'); filters.push(`category=eq.${q.get('category')}`); }
    for (const k of ['provider_id', 'legal_entity_id']) if (q.get(k)) filters.push(`${k}=eq.${requireUuid(q.get(k), k)}`);
    const offset = Math.max(0, Math.min(5000, Number(q.get('after')) || 0));
    const [rows, ctx] = await Promise.all([rest(token, `fin_provider_qualifications?select=*&${filters.join('&')}&order=updated_at.desc,id.desc&limit=${PAGE + 1}&offset=${offset}`), context(token, org.id)]);
    json(res, 200, { ok: true, ...presentQualificationPage({ rows: (rows || []).slice(0, PAGE), ...ctx, next: (rows || []).length > PAGE ? String(offset + PAGE) : null, today: today() }) }, headers);
    return true;
  }
  if (req.method === 'GET' && sub === 'detail') {
    const id = requireUuid(q.get('id'), 'id');
    const found = await rest(token, `fin_provider_qualifications?select=*&id=eq.${id}&limit=1`);
    const row = found?.[0];
    if (!row) throw new HttpError(404, 'Qualificação indisponível para sua conta.', 'qualification_not_found');
    const [ctx, evidence, exceptions, events] = await Promise.all([
      context(token, row.organization_id),
      rest(token, `fin_qualification_evidence?select=*&qualification_id=eq.${id}&order=created_at.asc&limit=500`),
      rest(token, `fin_qualification_exceptions?select=*&qualification_id=eq.${id}&order=requested_at.asc&limit=200`),
      rest(token, `fin_qualification_events?select=*&qualification_id=eq.${id}&order=created_at.asc&limit=500`)
    ]);
    const applicable = ctx.requirements.filter((r) => (r.category === 'all' || r.category === row.category) && (!r.legal_entity_id || r.legal_entity_id === row.legal_entity_id));
    json(res, 200, { ok: true, ...presentQualificationDetail({ qualification: row, provider: ctx.providers.find((p) => p.id === row.provider_id), entity: ctx.entities.find((e) => e.id === row.legal_entity_id)?.legal_name,
      requirements: applicable, evidence: evidence || [], exceptions: exceptions || [], events: events || [], today: today() }) }, headers);
    return true;
  }
  // Consulta para RFQ/policy: informa o estado; não decide.
  if (req.method === 'GET' && sub === 'status') {
    const org = await memberOrganization(token, q.get('organization_id'), ['BUYER']);
    const category = q.get('category') || 'all';
    if (!CATEGORIES[category]) throw new HttpError(400, 'Categoria inválida.', 'invalid_qualification_filters');
    const status = await rpc(token, 'fin_provider_qualification_status', { p_org: org.id, p_provider: requireUuid(q.get('provider_id'), 'provider_id'), p_entity: optionalUuid(q.get('legal_entity_id'), 'legal_entity_id'), p_category: category });
    json(res, 200, { ok: true, status, notice: 'Estado informativo segundo as exigências da sua empresa; não escolhe provedor nem decide.' }, headers);
    return true;
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Método indisponível.', 'method_not_allowed');
  const b = await readBody(req);
  let error = null;
  let call;
  if (sub === 'requirement') {
    const org = await memberOrganization(token, b.organization_id, ['BUYER']);
    const input = { area: b.area, title: b.title, description: b.description || undefined, category: b.category || 'all', legal_entity_id: optionalUuid(b.legal_entity_id, 'legal_entity_id'),
      validity_days: b.validity_days === '' || b.validity_days === undefined || b.validity_days === null ? null : Number(b.validity_days), critical: b.critical === true || b.critical === 'true',
      ...(b.requirement_key ? { requirement_key: requireUuid(b.requirement_key, 'requirement_key') } : {}) };
    error = validateRequirement(input);
    call = () => rpc(token, 'fin_set_qualification_requirement', { p_org: org.id, p_input: input });
  } else if (sub === 'retire-requirement') {
    call = () => rpc(token, 'fin_retire_qualification_requirement', { p_requirement: requireUuid(b.requirement_id, 'requirement_id') });
  } else if (sub === 'open') {
    const org = await memberOrganization(token, b.organization_id, ['BUYER']);
    if (!CATEGORIES[b.category]) error = 'Categoria inválida.';
    call = () => rpc(token, 'fin_open_provider_qualification', { p_org: org.id, p_provider: requireUuid(b.provider_id, 'provider_id'), p_entity: optionalUuid(b.legal_entity_id, 'legal_entity_id'), p_category: b.category, p_owner: optionalUuid(b.owner_id, 'owner_id'), p_review_due: b.review_due_on || null });
  } else if (sub === 'evidence') {
    const input = { requirement_id: requireUuid(b.requirement_id, 'requirement_id'), source: b.source, evidence_reference: b.evidence_reference, ...(b.external_service ? { external_service: b.external_service } : {}),
      ...(b.document_id ? { document_id: requireUuid(b.document_id, 'document_id') } : {}), ...(b.valid_until ? { valid_until: b.valid_until } : {}) };
    error = validateEvidence(input, today());
    call = () => rpc(token, 'fin_record_qualification_evidence', { p_qualification: requireUuid(b.qualification_id, 'qualification_id'), p_input: input });
  } else if (sub === 'evidence-review') {
    error = ['accepted', 'rejected'].includes(b.status) && (b.status === 'accepted' || (typeof b.reason === 'string' && b.reason.trim().length >= 3)) ? null : 'Informe o resultado e, para recusar, o motivo.';
    call = () => rpc(token, 'fin_review_qualification_evidence', { p_evidence: requireUuid(b.evidence_id, 'evidence_id'), p_input: { status: b.status, ...(b.reason ? { reason: b.reason } : {}) } });
  } else if (sub === 'exception') {
    error = typeof b.reason === 'string' && b.reason.trim().length >= 10 && /^\d{4}-\d{2}-\d{2}$/.test(b.expires_on || '') ? null : 'Exceção exige motivo (10+ caracteres) e data de vencimento.';
    call = () => rpc(token, 'fin_request_qualification_exception', { p_qualification: requireUuid(b.qualification_id, 'qualification_id'), p_input: { requirement_id: requireUuid(b.requirement_id, 'requirement_id'), reason: b.reason, expires_on: b.expires_on, ...(b.compensating_controls ? { compensating_controls: b.compensating_controls } : {}) } });
  } else if (sub === 'exception-decision') {
    error = ['approved', 'rejected'].includes(b.status) && typeof b.reason === 'string' && b.reason.trim().length >= 3 ? null : 'Informe a decisão e o motivo.';
    call = () => rpc(token, 'fin_decide_qualification_exception', { p_exception: requireUuid(b.exception_id, 'exception_id'), p_input: { status: b.status, reason: b.reason } });
  } else if (sub === 'transition') {
    const input = { to_status: b.to_status, ...(b.reason ? { reason: b.reason } : {}), ...(b.conditions ? { conditions: b.conditions } : {}), ...(b.valid_until ? { valid_until: b.valid_until } : {}) };
    error = validateTransition(b.expected_status, input);
    call = () => rpc(token, 'fin_transition_provider_qualification', { p_qualification: requireUuid(b.qualification_id, 'qualification_id'), p_expected: b.expected_status, p_input: input });
  } else throw new HttpError(404, 'Recurso indisponível.', 'not_found');
  if (error) throw new HttpError(400, error, 'invalid_qualification_input');
  json(res, 201, { ok: true, id: await call() }, headers);
  return true;
}

export { consultStatus };

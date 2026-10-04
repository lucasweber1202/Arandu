import { HttpError, json, readBody } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { validateValueInput, validateObservation, valueFilters } from '../../finance/value-realization.mjs';

export async function handleFinanceValue(req, res, { resource, sub, token, headers }) {
  if (resource !== 'value') return false;
  if (req.method === 'GET' && sub === 'detail') {
    const id = requireUuid(query(req).get('id'), 'id');
    const rows = await rest(token, `fin_value_records?select=*&id=eq.${id}&limit=1`);
    if (!rows?.[0]) throw new HttpError(404, 'Registro indisponível para sua conta.', 'value_not_found');
    const [observations, methodology] = await Promise.all([
      rest(token, `fin_value_observations?select=*&record_id=eq.${id}&order=created_at.desc&limit=50`),
      rest(token, `fin_value_methodologies?select=*&id=eq.${rows[0].methodology_id}&limit=1`)
    ]);
    json(res, 200, { ok: true, record: rows[0], observations, methodology: methodology?.[0] }, headers);
    return true;
  }
  if (req.method === 'GET' && !sub) {
    const q = query(req);
    const org = await memberOrganization(token, q.get('organization_id'), ['BUYER']);
    let f;
    try { f = valueFilters(q); } catch (e) { throw new HttpError(400, e.message, 'invalid_value_filters'); }
    const entity = q.get('legal_entity_id') ? requireUuid(q.get('legal_entity_id'), 'legal_entity_id') : null;
    const provider = q.get('provider_id') ? requireUuid(q.get('provider_id'), 'provider_id') : null;
    const after = q.get('after') ? requireUuid(q.get('after'), 'after') : null;
    const common = { p_org: org.id, p_start: f.start, p_end: f.end, p_kind: f.kind, p_currency: f.currency, p_entity: entity, p_provider: provider, p_product: f.product };
    const [rows, totals] = await Promise.all([
      rpc(token, 'fin_list_value', { ...common, p_after: after, p_limit: f.limit }),
      rpc(token, 'fin_value_totals', common)
    ]);
    const more = rows.length > f.limit;
    const page = rows.slice(0, f.limit);
    json(res, 200, { ok: true, rows: page, totals, next: more ? page.at(-1).id : null, filters: f }, headers);
    return true;
  }
  if (req.method === 'POST' && !sub) {
    const b = await readBody(req);
    const org = await memberOrganization(token, b.organization_id, ['BUYER']);
    const error = validateValueInput(b);
    if (error) throw new HttpError(400, error, 'invalid_value');
    const id = await rpc(token, 'fin_record_value', { p_org: org.id, p_contract: requireUuid(b.contract_id, 'contract_id'), p_input: b });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }
  if (req.method === 'POST' && ['observe', 'invalidate'].includes(sub)) {
    const b = await readBody(req);
    const id = requireUuid(b.record_id, 'record_id');
    if (sub === 'observe') {
      const error = validateObservation(b);
      if (error) throw new HttpError(400, error, 'invalid_value_observation');
    } else if (typeof b.reason !== 'string' || b.reason.trim().length < 3 || b.reason.length > 1000 || /[<>]/.test(b.reason)) throw new HttpError(400, 'Justifique a invalidação (3 a 1000 caracteres, sem HTML).', 'invalid_value_reason');
    const result = await rpc(token, sub === 'observe' ? 'fin_observe_value' : 'fin_invalidate_value', { p_record: id, p_input: b });
    json(res, 201, { ok: true, id: result }, headers);
    return true;
  }
  throw new HttpError(405, 'Método indisponível.', 'method_not_allowed');
}

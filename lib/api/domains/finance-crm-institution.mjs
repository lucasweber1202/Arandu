import { createHash } from 'node:crypto';
import { HttpError, json } from '../../api-core.mjs';
import { query, requireUuid, rest, upstream, memberOrganization } from './finance-core.mjs';
import { CRM_NOTICE, CRM_STAGES, CRM_KINDS } from '../../finance/crm.mjs';
import { isProductDay } from '../../finance/product-terms.mjs';
export async function handleCrmInstitution(req, res, { resource, sub, token, headers }) {
  if (resource !== 'crm-institution-records' || sub) return false;
  if (req.method !== 'GET') throw new HttpError(405, 'Consulta somente de leitura.', 'method_not_allowed');
  const q = query(req), invalid = () => new HttpError(400, 'Confira os filtros da instituição.', 'invalid_crm');
  const allowed = ['organization_id', 'provider_id', 'legal_entity_id', 'owner_id', 'record_type', 'status', 'stage', 'kind', 'due_before', 'due_after', 'limit', 'after'];
  if ([...q.keys()].some(k => !allowed.includes(k)) || [...q.keys()].some(k => q.getAll(k).length !== 1)) throw invalid();
  const org = await memberOrganization(token, requireUuid(q.get('organization_id'), 'organization_id'), ['BUYER']);
  const provider = requireUuid(q.get('provider_id'), 'provider_id');
  const roots = await rest(token, `fin_providers?select=id&organization_id=eq.${org.id}&id=eq.${provider}&limit=1`);
  if (!roots?.length) throw new HttpError(404, 'Instituição indisponível.', 'crm_not_found');
  const limit = q.has('limit') ? Number(q.get('limit')) : 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid();
  const p = new URLSearchParams({ select: '*', organization_id: `eq.${org.id}`, provider_ids: `cs.{${provider}}`, order: 'record_type.asc,id.asc', limit: String(limit + 1) });
  for (const k of ['legal_entity_id', 'owner_id']) if (q.has(k)) p.set(k, `eq.${requireUuid(q.get(k), k)}`);
  const type = q.get('record_type');
  if (type && !['activity', 'process'].includes(type)) throw invalid();
  if (type) p.set('record_type', `eq.${type}`);
  for (const [key, values, applies] of [['stage', CRM_STAGES, 'process'], ['kind', CRM_KINDS, 'activity'], ['status', type === 'activity' ? ['planned', 'recorded', 'cancelled', 'archived'] : ['active', 'archived'], type]]) if (q.has(key)) {
    if (!type || type !== applies || !values.includes(q.get(key))) throw invalid();
    p.set(key, `eq.${q.get(key)}`);
  }
  for (const [key, op] of [['due_before', 'lte'], ['due_after', 'gte']]) if (q.has(key)) {
    if (!isProductDay(q.get(key))) throw invalid();
    p.append('due_on', `${op}.${q.get(key)}`);
  }
  if (q.has('due_after') && q.has('due_before') && q.get('due_after') > q.get('due_before')) throw invalid();
  const scope = createHash('sha256').update(JSON.stringify([...q].filter(([k]) => !['after', 'limit'].includes(k)).sort())).digest('hex');
  if (q.has('after')) {
    try {
      if (q.get('after').length > 1024) throw invalid();
      const c = JSON.parse(Buffer.from(q.get('after'), 'base64url'));
      if (c.v !== 1 || c.scope !== scope || !['activity', 'process'].includes(c.type)) throw invalid();
      p.set('or', `(record_type.gt.${c.type},and(record_type.eq.${c.type},id.gt.${requireUuid(c.id, 'cursor')}))`);
    } catch { throw invalid(); }
  }
  const all = await upstream(rest(token, `fin_crm_institution_records?${p}`)) || [], rows = all.slice(0, limit), last = rows.at(-1);
  const next = all.length > limit ? Buffer.from(JSON.stringify({ v: 1, scope, type: last.record_type, id: last.id })).toString('base64url') : null;
  json(res, 200, { ok: true, api_version: 'financial-crm-institution-v1', rows, next, sort: 'record_type.asc,id.asc', coverage: 'explicit_institution_associations', notice: CRM_NOTICE }, headers); return true;
}

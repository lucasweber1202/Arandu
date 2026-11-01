import { createHash } from 'node:crypto';
import { HttpError, json, readBody } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { CRM_VERSION, CRM_NOTICE, CRM_KINDS, CRM_STAGES, validateCrmRecord } from '../../finance/crm.mjs';

const resources = { 'crm-contacts': ['contact', 'fin_provider_contacts'], 'crm-activities': ['activity', 'fin_crm_activities'], 'crm-processes': ['process', 'fin_crm_processes'] };
const invalid = () => new HttpError(400, 'Confira campos, estado esperado, fonte e escopo do registro comercial.', 'invalid_crm');

export async function handleFinanceCrm(req, res, { resource, sub, token, headers }) {
  if (!Object.hasOwn(resources, resource) && resource !== 'crm-history') return false;
  if (sub) return false;
  if (req.method === 'GET') {
    const q = query(req), org = requireUuid(q.get('organization_id'), 'organization_id');
    await memberOrganization(token, org, ['BUYER', 'PROVIDER']);
    const historical = resource === 'crm-history';
    const agenda = !historical && q.get('sort') === 'due_on.asc.nullslast,id.asc';
    const sort = historical ? 'happened_at.asc,id.asc' : agenda ? 'due_on.asc.nullslast,id.asc' : 'id.asc';
    const allowedQuery = historical ? ['organization_id', 'object_type', 'object_id', 'limit', 'after', 'sort'] : ['organization_id', 'id', 'provider_id', 'legal_entity_id', 'owner_id', 'contact_id', 'process_id', 'related_type', 'related_id', 'status', 'search', 'stage', 'kind', 'due_before', 'due_after', 'next_step', 'limit', 'after', 'sort'];
    if ([...q.keys()].some(key => !allowedQuery.includes(key)) || q.has('sort') && q.get('sort') !== sort) throw invalid();
    const kind = historical ? q.get('object_type') : resources[resource][0];
    const table = Object.values(resources).find(([type]) => type === kind)?.[1];
    if (!table || agenda && kind === 'contact') throw invalid();
    const limit = q.has('limit') ? Number(q.get('limit')) : 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid();
    const params = new URLSearchParams({ select: '*', organization_id: `eq.${org}`, order: sort, limit: String(limit + 1) });
    if (historical) {
      const id = requireUuid(q.get('object_id'), 'object_id');
      const root = await rest(token, `${table}?select=id&organization_id=eq.${org}&id=eq.${id}&limit=1`);
      if (!root?.length) throw new HttpError(404, 'Registro não disponível.', 'crm_not_found');
      params.set('entity_type', `eq.crm_${kind}`); params.set('entity_id', `eq.${id}`);
    } else {
      for (const name of ['id', 'provider_id', 'legal_entity_id', 'owner_id', 'contact_id', 'process_id', 'related_id']) if (q.has(name)) {
        if (kind === 'contact' && ['contact_id', 'related_id'].includes(name) || kind !== 'contact' && name === 'provider_id') throw invalid();
        if (name === 'process_id' && kind !== 'activity') throw invalid();
        params.set(name, `eq.${requireUuid(q.get(name), name)}`);
      }
      if (q.has('related_type')) {
        if (kind === 'contact' || !['provider', 'rfq', 'contract', 'opportunity', 'proposal', 'task'].includes(q.get('related_type'))) throw invalid();
        params.set('related_type', `eq.${q.get('related_type')}`);
      }
      if (q.has('next_step')) {
        if (kind !== 'process' || !['missing', 'present'].includes(q.get('next_step'))) throw invalid();
        // A process without a dated next step needs attention even if it has
        // a textual next_action. Do not infer a financial state from its stage.
        params.set('due_on', q.get('next_step') === 'missing' ? 'is.null' : 'not.is.null');
      }
      const status = q.get('status') || (kind === 'activity' ? null : 'active');
      if (status) {
        if (!(kind === 'activity' ? ['planned', 'recorded', 'cancelled', 'archived'] : ['active', 'archived']).includes(status)) throw invalid();
        if (kind === 'contact') params.set('archived_at', status === 'archived' ? 'not.is.null' : 'is.null'); else params.set('status', `eq.${status}`);
      }
      if (q.has('search')) {
        const term = q.get('search').trim();
        if (!/^[\p{L}\p{N} .@+-]{2,100}$/u.test(term)) throw invalid();
        params.set(kind === 'contact' ? 'name' : kind === 'activity' ? 'subject' : 'title', `ilike.*${term}*`);
      }
      for (const [field, applicable, options] of [['stage', 'process', CRM_STAGES], ['kind', 'activity', CRM_KINDS]]) if (q.has(field)) {
        if (kind !== applicable || !options.includes(q.get(field))) throw invalid();
        params.set(field, `eq.${q.get(field)}`);
      }
      for (const [key, operator] of [['due_before', 'lte'], ['due_after', 'gte']]) if (q.has(key)) {
        const value = q.get(key);
        if (kind === 'contact' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw invalid();
        if (q.get('next_step') === 'missing') throw invalid();
        params.append('due_on', `${operator}.${value}`);
      }
      if (q.has('due_before') && q.has('due_after') && q.get('due_after') > q.get('due_before')) throw invalid();
    }
    const scope = createHash('sha256').update(JSON.stringify([resource, [...q].filter(([key]) => !['after', 'limit'].includes(key)).sort()])).digest('hex');
    if (q.has('after')) {
      if (q.has('id')) throw invalid();
      try {
        if (q.get('after').length > 1024) throw invalid();
        const cursor = JSON.parse(Buffer.from(q.get('after'), 'base64url').toString());
        if (cursor.version !== 1 || cursor.scope !== scope) throw invalid();
        const id = requireUuid(cursor.id, 'cursor');
        if (historical) {
          const stamp = cursor.happened_at;
          if (typeof stamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(stamp) || !Number.isFinite(Date.parse(stamp))) throw invalid();
          params.set('or', `(happened_at.gt.${stamp},and(happened_at.eq.${stamp},id.gt.${id}))`);
        } else if (agenda) {
          const due = cursor.due_on;
          if (due !== null && !(typeof due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(due) && Number.isFinite(Date.parse(due)) && new Date(due).toISOString().slice(0, 10) === due)) throw invalid();
          params.set('or', due === null ? `(and(due_on.is.null,id.gt.${id}))` : `(due_on.gt.${due},and(due_on.eq.${due},id.gt.${id}),due_on.is.null)`);
        } else params.set('id', `gt.${id}`);
      } catch { throw invalid(); }
    }
    const rows = await rest(token, `${historical ? 'fin_events' : table}?${params}`) || [];
    const page = rows.slice(0, limit), next = rows.length > limit ? Buffer.from(JSON.stringify({ version: 1, scope, id: page.at(-1).id, ...(historical ? { happened_at: page.at(-1).happened_at } : {}), ...(agenda ? { due_on: page.at(-1).due_on ?? null } : {}) })).toString('base64url') : null;
    json(res, 200, { ok: true, api_version: CRM_VERSION, rows: page, next, sort, notice: CRM_NOTICE }, headers); return true;
  }
  if (!Object.hasOwn(resources, resource) || !['POST', 'PATCH'].includes(req.method)) return false;
  const body = await readBody(req), [kind] = resources[resource], patch = req.method === 'PATCH';
  const allowed = patch ? ['organization_id', 'id', 'expected_version', 'request_key', 'values'] : ['organization_id', 'legal_entity_id', 'provider_id', 'counterparty_organization_id', 'request_key', 'values'];
  if (Object.keys(body).some(key => !allowed.includes(key)) || validateCrmRecord(kind, body.values, { partial: patch }).length || patch && (!Object.keys(body.values).length || !Number.isInteger(body.expected_version) || body.expected_version < 1)) throw invalid();
  const org = requireUuid(body.organization_id, 'organization_id');
  await memberOrganization(token, org, ['BUYER', 'PROVIDER']);
  const result = await rpc(token, 'fin_crm_command', {
    p_org: org, p_kind: kind, p_id: patch ? requireUuid(body.id, 'id') : null,
    p_expected: patch ? body.expected_version : null, p_request: requireUuid(body.request_key, 'request_key'),
    p_scope: patch ? {} : { legal_entity_id: body.legal_entity_id ? requireUuid(body.legal_entity_id, 'legal_entity_id') : null, provider_id: body.provider_id ? requireUuid(body.provider_id, 'provider_id') : null, counterparty_organization_id: body.counterparty_organization_id ? requireUuid(body.counterparty_organization_id, 'counterparty_organization_id') : null },
    p_values: body.values
  });
  json(res, patch || result.replayed ? 200 : 201, { ok: true, api_version: CRM_VERSION, ...result, notice: CRM_NOTICE }, headers); return true;
}

import { HttpError } from '../../api-core.mjs';
import { rest } from './finance-core.mjs';

const CONTRACT_FIELDS = 'id,legal_entity_id,product,status,starts_on,ends_on,title,origin,renewal_notice_days,created_at';
const TASK_FIELDS = 'id,title,due_on,status,related_type,related_id,created_at,assignee_id';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) && day(value.slice(0, 10));
const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const invalid = () => new HttpError(400, 'Confira a paginação do relacionamento e atualize a consulta.', 'invalid_relationship_page');

export function relationshipPageControls(params, scope) {
  const section = params.get('section');
  if (section !== null && !['contracts', 'tasks'].includes(section)) throw invalid();
  const raw = params.get('limit');
  const limit = raw === null ? (section ? 50 : 200) : Number(raw);
  if (raw !== null && (!/^[1-9]\d{0,2}$/.test(raw) || limit > 200)) throw invalid();
  let cursor = null;
  if (params.has('cursor')) {
    const value = params.get('cursor');
    if (!section || !value || value.length > 2048 || !/^[\w-]+$/.test(value)) throw invalid();
    try {
      cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
      if (cursor.version !== 1 || cursor.organization !== scope.org || cursor.provider !== scope.provider || cursor.section !== section
        || !uuid.test(cursor.id) || !stamp(cursor.created_at) || section === 'tasks' && cursor.due_on !== null && !day(cursor.due_on)) throw invalid();
    } catch { throw invalid(); }
  }
  return { section, limit, cursor };
}

export async function readRelationshipPage(token, scope, section, limit, cursor = null) {
  const tasks = section === 'tasks';
  const filters = new URLSearchParams({ select: tasks ? TASK_FIELDS : CONTRACT_FIELDS,
    organization_id: `eq.${scope.org}`, provider_id: `eq.${scope.provider}`,
    order: tasks ? 'due_on.asc.nullslast,created_at.asc,id.asc' : 'created_at.desc,id.desc', limit: String(limit + 1) });
  if (tasks) { filters.set('status', 'eq.open'); filters.set('related_type', 'eq.contract'); }
  if (cursor) {
    const { id, created_at: at, due_on: due } = cursor;
    filters.set('or', !tasks ? `(created_at.lt.${at},and(created_at.eq.${at},id.lt.${id}))`
      : due === null ? `(and(due_on.is.null,created_at.gt.${at}),and(due_on.is.null,created_at.eq.${at},id.gt.${id}))`
        : `(due_on.gt.${due},and(due_on.eq.${due},created_at.gt.${at}),and(due_on.eq.${due},created_at.eq.${at},id.gt.${id}),due_on.is.null)`);
  }
  const fetched = await rest(token, `${tasks ? 'fin_provider_contract_tasks' : 'fin_contracts'}?${filters}`);
  let rows = (fetched || []).slice(0, limit);
  const hasMore = (fetched || []).length > limit;
  const last = rows.at(-1);
  const next = hasMore && last ? Buffer.from(JSON.stringify({ version: 1, organization: scope.org, provider: scope.provider, section,
    id: last.id, created_at: last.created_at, ...(tasks ? { due_on: last.due_on } : {}) })).toString('base64url') : null;
  if (tasks) {
    const ids = [...new Set(rows.map(row => row.assignee_id).filter(Boolean))];
    const members = ids.length ? await rest(token, `fin_members?select=user_id,display_name&organization_id=eq.${scope.org}&user_id=in.(${ids.join(',')})&limit=${ids.length}`) : [];
    const names = new Map((members || []).map(row => [row.user_id, row.display_name]));
    rows = rows.map(row => ({ ...row, assignee_name: row.assignee_id ? names.get(row.assignee_id) || null : null }));
  }
  return { rows, page: { limit, has_more: hasMore, next_cursor: next } };
}

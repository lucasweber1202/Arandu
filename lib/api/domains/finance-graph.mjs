import { HttpError, json } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { GRAPH_ROOTS, graphFilters } from '../../finance/graph.mjs';

export async function handleFinanceGraph(req, res, { resource, sub, token, session, headers }) {
  if (resource !== 'graph') return false;
  if (req.method !== 'GET' || !GRAPH_ROOTS.includes(sub)) throw new HttpError(400, 'Consulta financeira inválida.', 'invalid_graph_query');
  const params = query(req);
  const root = requireUuid(params.get('id'), 'id');
  const filters = graphFilters(params);
  if (!filters) throw new HttpError(400, 'Confira filtros e paginação.', 'invalid_graph_query');
  const organization = await memberOrganization(token, params.get('organization_id'), ['BUYER']);
  const members = await rest(token, `fin_members?select=role&organization_id=eq.${organization.id}&user_id=eq.${requireUuid(session.user.id, 'user_id')}&limit=1`);
  if (!['admin', 'finance_manager', 'analyst', 'viewer'].includes(members?.[0]?.role)) throw new HttpError(403, 'Consulta indisponível para esta conta.', 'forbidden');
  const result = await rpc(token, 'fin_query_graph', { p_org: organization.id, p_root_type: sub, p_root: root, ...filters });
  const rows = Array.isArray(result) ? result : [];
  const hasMore = rows.length > filters.p_limit;
  json(res, 200, { ok: true, rows: rows.slice(0, filters.p_limit), limit: filters.p_limit, offset: filters.p_offset, has_more: hasMore, next_offset: hasMore ? filters.p_offset + filters.p_limit : null }, headers);
  return true;
}

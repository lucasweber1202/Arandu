import { HttpError } from '../../api-core.mjs';
import { rest, rpc } from './finance-core.mjs';
import { operationalPage, orderedPageFilters, operationalPageResult } from './finance-operational-pages.mjs';

// Opt-in list DTOs: full proposal history belongs to the existing detail route.
// The sentinel is never enriched, and no organization-level inventory is implied.
export async function institutionalPage(token, actor, organization, resource, params) {
  const allowed = new Set(['organization_id', 'paged', 'limit', 'cursor', 'status']);
  const states = resource === 'invites' ? ['invited', 'accepted', 'expired', 'revoked', 'declined'] : ['draft', 'submitted', 'revised', 'withdrawn'];
  const status = params.get('status');
  if ([...params.keys()].some(k => !allowed.has(k) || params.getAll(k).length !== 1)
      || (status !== null && !states.includes(status))) {
    throw new HttpError(400, 'Filtro institucional inválido.', 'invalid_institutional_query');
  }
  const controls = operationalPage(params, { resource, actor, organization: organization.id, status }, [{ name: 'id', direction: 'asc', type: 'uuid' }]);
  const filters = orderedPageFilters(controls);
  if (status) filters.set('status', `eq.${status}`);
  if (resource === 'invites') {
    filters.set('select', 'id,rfq_id,provider_id,provider_organization_id,status,expires_at,accepted_at');
    // Keep tenant OR and cursor OR in distinct logical groups. Overwriting or
    // duplicating PostgREST's or parameter could remove the tenant boundary.
    const tenant = `or(buyer_organization_id.eq.${organization.id},provider_organization_id.eq.${organization.id})`;
    const cursor = filters.get('or');
    filters.delete('or');
    filters.set('and', `(${tenant}${cursor ? `,or${cursor}` : ''})`);
    return operationalPageResult(await rest(token, `fin_rfq_invites?${filters}`), controls);
  }
  if (organization.kind !== 'PROVIDER') throw new HttpError(403, 'Organização provedora necessária.', 'organization_forbidden');
  filters.set('select', 'id,rfq_id,product,status,current_version,updated_at');
  filters.set('provider_organization_id', `eq.${organization.id}`);
  const result = operationalPageResult(await rest(token, `fin_proposals?${filters}`), controls);
  const submitted = result.rows.filter(row => row.current_version > 0);
  // Exact composite pairs, not all historical versions of every proposal.
  const versions = [];
  // Keep each upstream request below common 8 KiB request-line limits even
  // when the public page has 100 proposals and large revision numbers.
  for (let offset = 0; offset < submitted.length; offset += 50) {
    const batch = submitted.slice(offset, offset + 50);
    const versionsQuery = new URLSearchParams({ select: 'proposal_id,version,terms,submitted_at,note,rfq_revision', limit: String(batch.length + 1) });
    versionsQuery.set('or', `(${batch.map(row => `and(proposal_id.eq.${row.id},version.eq.${row.current_version})`).join(',')})`);
    const fetched = await rest(token, `fin_proposal_versions?${versionsQuery}`);
    if (!Array.isArray(fetched)) throw new HttpError(502, 'A fonte não retornou versões válidas.', 'invalid_operational_response');
    versions.push(...fetched);
  }
  const byId = new Map(versions.map(row => [row.proposal_id, row]));
  if (versions.length !== submitted.length || submitted.some(row => byId.get(row.id)?.version !== row.current_version)) {
    throw new HttpError(409, 'A proposta mudou durante a consulta. Atualize a página.', 'proposal_snapshot_conflict');
  }
  return { ...result, rows: result.rows.map(row => ({ ...row, current_snapshot: byId.get(row.id) ?? null })),
    coverage: { history: 'current_snapshot_only', full_history: 'assignments?proposal_id=<id>' } };
}

export async function assignmentPage(token, actor, organization, params) {
  const result = await institutionalPage(token, actor, organization, 'assignments', params);
  const proposals = result.rows;
  if (!proposals.length) return result;
  const ids = [...new Set(proposals.map(row => row.rfq_id))];
  const [rfqs, drafts, buyers] = await Promise.all([
    rest(token, `fin_rfqs?select=id,title,description,status,response_deadline,demand,revision&id=in.(${ids.join(',')})&limit=${ids.length}`),
    rest(token, `fin_proposal_drafts?select=proposal_id&proposal_id=in.(${proposals.map(row => row.id).join(',')})&limit=${proposals.length}`),
    rpc(token, 'fin_assignment_buyer_names', { p_org: organization.id, p_rfqs: ids })
  ]);
  const rfqById = new Map(rfqs.map(row => [row.id, row]));
  const drafted = new Set(drafts.map(row => row.proposal_id));
  const buyerById = new Map(buyers.map(row => [row.rfq_id, row.buyer_name]));
  if (ids.some(id => !rfqById.has(id))) throw new HttpError(409, 'A solicitação mudou de acesso. Atualize a página.', 'assignment_context_conflict');
  return { ...result, rows: proposals.map(proposal => {
    const rfq = rfqById.get(proposal.rfq_id), snapshot = proposal.current_snapshot;
    return { proposal_id: proposal.id, rfq_id: proposal.rfq_id, product: proposal.product,
      status: proposal.status, version: proposal.current_version, title: rfq.title,
      buyer_name: buyerById.get(rfq.id) ?? null, description: rfq.description,
      rfq_status: rfq.status, rfq_revision: rfq.revision,
      submitted_rfq_revision: snapshot?.rfq_revision ?? null,
      response_deadline: rfq.response_deadline, has_draft: drafted.has(proposal.id),
      demand: rfq.demand, terms: snapshot?.terms ?? {}, current_snapshot: snapshot };
  }) };
}

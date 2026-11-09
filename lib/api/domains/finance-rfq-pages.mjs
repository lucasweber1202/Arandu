import { HttpError } from '../../api-core.mjs';
import { rest } from './finance-core.mjs';

export async function rfqEntityScope(token, organization, entity, includeChildren) {
  if (!includeChildren) return entity ? (entity === 'group' ? 'is.null' : `eq.${entity}`) : null;
  const rows = await rest(token, `fin_legal_entities?select=id,parent_id&organization_id=eq.${organization}&limit=501`);
  if (rows.length > 500) throw new HttpError(422, 'A estrutura de entidades excede o limite desta consulta.', 'entity_coverage_limit');
  if (!rows.some(row => row.id === entity)) throw new HttpError(404, 'Entidade não encontrada ou sem acesso.', 'entity_not_found');
  const selected = new Set([entity]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of rows) if (selected.has(row.parent_id) && !selected.has(row.id)) { selected.add(row.id); changed = true; }
  }
  return `in.(${[...selected].sort().join(',')})`;
}

// Context for the visible RFQ page only; never load historical financial terms.
export async function rfqPageContext(token, organization, rows) {
  if (!rows.length) return rows;
  const ids = rows.map(row => row.id).join(',');
  const owners = [...new Set(rows.map(row => row.owner_id).filter(Boolean))];
  const [invites, proposals, approvals, decisions, members] = await Promise.all([
    rest(token, `fin_rfq_invites?select=id,rfq_id,provider_id,status&rfq_id=in.(${ids})&limit=1001`),
    rest(token, `fin_proposals?select=id,rfq_id,provider_id,status,current_version&rfq_id=in.(${ids})&current_version=gt.0&status=neq.withdrawn&limit=1001`),
    rest(token, `fin_approval_requests?select=rfq_id&organization_id=eq.${organization}&rfq_id=in.(${ids})&status=eq.pending&limit=1001`),
    rest(token, `fin_decisions?select=id,rfq_id&organization_id=eq.${organization}&rfq_id=in.(${ids})&limit=101`),
    owners.length ? rest(token, `fin_members?select=user_id,display_name&organization_id=eq.${organization}&user_id=in.(${owners.join(',')})&limit=${owners.length}`) : []
  ]);
  if (invites.length > 1000 || proposals.length > 1000 || approvals.length > 1000 || decisions.length > 100)
    throw new HttpError(422, 'Reduza a quantidade de solicitações por página para carregar o contexto completo.', 'rfq_context_coverage_limit');
  const versions = [];
  for (let offset = 0; offset < proposals.length; offset += 50) {
    const batch = proposals.slice(offset, offset + 50);
    const query = new URLSearchParams({ select: 'proposal_id,version,rfq_revision', limit: String(batch.length + 1) });
    query.set('or', `(${batch.map(p => `and(proposal_id.eq.${p.id},version.eq.${p.current_version})`).join(',')})`);
    versions.push(...await rest(token, `fin_proposal_versions?${query}`));
  }
  const versionById = new Map(versions.map(v => [v.proposal_id, v]));
  if (versions.length !== proposals.length || proposals.some(p => versionById.get(p.id)?.version !== p.current_version))
    throw new HttpError(409, 'As propostas mudaram durante a consulta. Atualize a página.', 'proposal_snapshot_conflict');
  const group = items => {
    const result = new Map();
    for (const item of items) { if (!result.has(item.rfq_id)) result.set(item.rfq_id, []); result.get(item.rfq_id).push(item); }
    return result;
  };
  const inviteByRfq = group(invites), proposalByRfq = group(proposals.map(p => ({ ...p, rfq_revision: versionById.get(p.id).rfq_revision })));
  const pending = new Set(approvals.map(a => a.rfq_id)), decisionByRfq = new Map(decisions.map(d => [d.rfq_id, d.id]));
  const ownerById = new Map(members.map(member => [member.user_id, member.display_name]));
  return rows.map(row => ({ ...row, invites: inviteByRfq.get(row.id) || [], proposals: proposalByRfq.get(row.id) || [],
    invites_count: (inviteByRfq.get(row.id) || []).length, owner_name: ownerById.get(row.owner_id) ?? null,
    pending_approval: pending.has(row.id), decision_id: decisionByRfq.get(row.id) ?? null }));
}

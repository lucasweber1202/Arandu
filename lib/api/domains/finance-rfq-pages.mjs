import { HttpError } from '../../api-core.mjs';
import { rest } from './finance-core.mjs';

// Context for the visible RFQ page only; never load historical financial terms.
export async function rfqPageContext(token, organization, rows) {
  if (!rows.length) return rows;
  const ids = rows.map(row => row.id).join(',');
  const [invites, proposals, approvals, decisions] = await Promise.all([
    rest(token, `fin_rfq_invites?select=id,rfq_id,provider_id,status&rfq_id=in.(${ids})&limit=1001`),
    rest(token, `fin_proposals?select=id,rfq_id,provider_id,status,current_version&rfq_id=in.(${ids})&current_version=gt.0&status=neq.withdrawn&limit=1001`),
    rest(token, `fin_approval_requests?select=rfq_id&organization_id=eq.${organization}&rfq_id=in.(${ids})&status=eq.pending&limit=1001`),
    rest(token, `fin_decisions?select=id,rfq_id&organization_id=eq.${organization}&rfq_id=in.(${ids})&limit=101`)
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
  return rows.map(row => ({ ...row, invites: inviteByRfq.get(row.id) || [], proposals: proposalByRfq.get(row.id) || [],
    pending_approval: pending.has(row.id), decision_id: decisionByRfq.get(row.id) ?? null }));
}

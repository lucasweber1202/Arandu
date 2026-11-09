import { rest } from './finance-core.mjs';

// PostgreSQL compares timestamptz at microsecond precision. Date.parse alone
// would silently accept a changed RFQ within the same JavaScript millisecond.
export function approvalTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/);
  if (!match) return null;
  const base = Date.parse(match[1] + match[3]);
  return Number.isFinite(base) ? BigInt(base) * 1000n + BigInt((match[2] || '').padEnd(6, '0')) : null;
}

async function missingRows(token, resource, scope, select, ids, known = []) {
  const rows = new Map(known.map(row => [row.id, row]));
  const missing = [...new Set(ids)].filter(id => id && !rows.has(id));
  for (let offset = 0; offset < missing.length; offset += 50) {
    const batch = missing.slice(offset, offset + 50);
    for (const row of await rest(token, `${resource}?select=${select}&${scope}&id=in.(${batch.join(',')})&limit=${batch.length}`)) rows.set(row.id, row);
  }
  return rows;
}

// A read diagnostic, never authorization or a replacement for SQL locks.
// Reuse the same rule in the inbox, RFQ page and bounded workspace summary.
export async function approvalReadContext(token, organization, requests, { rfqs = [], proposals = [], now = Date.now() } = {}) {
  const active = requests.filter(row => ['pending', 'approved'].includes(row.status));
  const [rfqById, proposalById, externalById] = await Promise.all([
    missingRows(token, 'fin_rfqs', `organization_id=eq.${organization}`, 'id,status,updated_at', active.map(row => row.rfq_id), rfqs),
    missingRows(token, 'fin_proposals', `buyer_organization_id=eq.${organization}`, 'id,rfq_id,status,current_version', active.map(row => row.proposal_id), proposals),
    missingRows(token, 'fin_external_proposal_current', `organization_id=eq.${organization}`, 'id,rfq_id,state,current_version,rfq_revision_matches,document_id,document_available', active.map(row => row.external_proposal_id))
  ]);
  return requests.map(row => {
    const rfq = rfqById.get(row.rfq_id);
    const source = row.external_proposal_id ? externalById.get(row.external_proposal_id) : proposalById.get(row.proposal_id);
    const historical = !['pending', 'approved'].includes(row.status)
      || (row.status === 'approved' && ['decided', 'contracted', 'closed'].includes(rfq?.status));
    const expired = row.expires_at != null && (!Number.isFinite(Date.parse(row.expires_at)) || Date.parse(row.expires_at) < now);
    const recorded = approvalTimestamp(row.rfq_updated_at), current = approvalTimestamp(rfq?.updated_at);
    const eligible = source && source.rfq_id === row.rfq_id && (row.external_proposal_id
      ? source.state === 'reviewed' && source.rfq_revision_matches === true && (!source.document_id || source.document_available === true)
      : ['submitted', 'revised'].includes(source.status));
    const reason = historical ? null : !rfq || !source || recorded === null || current === null ? 'context_unavailable'
      : recorded !== current ? 'rfq_changed' : !eligible ? 'source_ineligible'
        : source.current_version !== row.proposal_version ? 'proposal_changed' : null;
    return { ...row, stale: Boolean(reason), stale_reason: reason, expired,
      freshness: historical ? 'historical' : reason ? 'stale' : expired ? 'expired' : 'current' };
  });
}

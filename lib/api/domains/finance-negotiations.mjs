import { HttpError, json, readBody } from '../../api-core.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';

const href = (type, id) => type === 'contract' ? `/finance/contracts.html?abrir=contrato#contract-${id}` : `/finance/rfq.html?id=${id}`;
async function bounded(token, path, limit = 500) {
  const rows = await rest(token, `${path}&limit=${limit + 1}`);
  if (rows.length > limit) throw new HttpError(422, 'Este contexto excede a cobertura. Abra um processo específico.', 'negotiation_coverage_limit');
  return rows;
}

export async function negotiationProcesses(token, org, ids, origins = []) {
  if (!ids.length) return [];
  const filter = `rfq_id=in.(${ids.join(',')})`;
  const [rfqs, proposals, external, decisions, approvals, events] = await Promise.all([
    bounded(token, `fin_rfqs?select=id,title,product,status,revision,legal_entity_id,owner_id,demand,created_at&organization_id=eq.${org}&id=in.(${ids.join(',')})`),
    bounded(token, `fin_proposals?select=id,rfq_id,provider_id,status,current_version&buyer_organization_id=eq.${org}&${filter}`),
    bounded(token, `fin_external_proposals?select=id,rfq_id,provider_id,state,current_version,recorded_by,recorded_at&organization_id=eq.${org}&${filter}`),
    bounded(token, `fin_decisions?select=id,rfq_id,proposal_id,external_proposal_id,external_proposal_version,decided_by,decided_at,criteria,rationale,snapshot&organization_id=eq.${org}&${filter}`),
    bounded(token, `fin_approval_requests?select=id,rfq_id,proposal_id,external_proposal_id,proposal_version,status,requested_by,requested_at,resolved_at&organization_id=eq.${org}&${filter}`),
    bounded(token, `fin_events?select=id,entity_id,event_type,actor_id,happened_at,metadata&organization_id=eq.${org}&entity_type=eq.rfq&entity_id=in.(${ids.join(',')})&order=happened_at.asc,id.asc`)
  ]);
  const pids = proposals.map(p => p.id), eids = external.map(p => p.id), aids = approvals.map(a => a.id);
  const [versions, externalVersions, steps, resultContracts] = await Promise.all([
    pids.length ? bounded(token, `fin_proposal_versions?select=proposal_id,version,terms,submitted_by,submitted_at,rfq_revision&proposal_id=in.(${pids.join(',')})&order=version.asc`) : [],
    eids.length ? bounded(token, `fin_external_proposal_versions?select=proposal_id,version,terms,channel,received_at,source_reference,currency,rfq_revision,recorded_by,recorded_at&organization_id=eq.${org}&proposal_id=in.(${eids.join(',')})&order=version.asc`) : [],
    aids.length ? bounded(token, `fin_approval_steps?select=id,request_id,position,approver_id,status,acted_at&request_id=in.(${aids.join(',')})&order=position.asc`) : [],
    decisions.length ? bounded(token, `fin_contracts?select=id,decision_id,title,status,current_version,provider_id,ends_on&organization_id=eq.${org}&decision_id=in.(${decisions.map(d => d.id).join(',')})`) : []
  ]);
  return rfqs.map(rfq => {
    const decided = decisions.filter(d => d.rfq_id === rfq.id);
    const resulting = resultContracts.filter(c => decided.some(d => d.id === c.decision_id)).map(c => ({ ...c, href: href('contract', c.id) }));
    const origin = origins.find(e => e.entity_id === rfq.id);
    return { rfq: { ...rfq, href: href('rfq', rfq.id) },
      origin: origin ? { event_id: origin.id, actor_id: origin.actor_id, created_at: origin.happened_at, contract_version: origin.metadata?.contract_version ?? null, version_recorded: origin.metadata?.contract_version != null } : null,
      proposals: proposals.filter(p => p.rfq_id === rfq.id).map(p => ({ ...p, origin: 'institution_authenticated', versions: versions.filter(v => v.proposal_id === p.id) })),
      external_proposals: external.filter(p => p.rfq_id === rfq.id).map(p => ({ ...p, origin: 'buyer_recorded_external', versions: externalVersions.filter(v => v.proposal_id === p.id) })),
      approvals: approvals.filter(a => a.rfq_id === rfq.id).map(a => ({ ...a, steps: steps.filter(s => s.request_id === a.id) })),
      decisions: decided, resulting_contracts: resulting, history: events.filter(e => e.entity_id === rfq.id),
      comparison: { method: 'POST', endpoint: '/api/finance/comparison', rfq_id: rfq.id, persisted_comparison: false },
      missing: [...(!decided.length ? ['human_decision_not_recorded'] : []), ...(!resulting.length ? ['resulting_contract_not_recorded'] : [])],
      next_action: resulting.length ? { kind: 'monitor_contract', href: resulting[0].href } : decided.length ? { kind: 'record_contract_after_human_confirmation', href: href('rfq', rfq.id) } : { kind: rfq.status === 'draft' ? 'review_draft' : 'review_negotiation', href: href('rfq', rfq.id) }
    };
  });
}

export async function handleFinanceNegotiations(req, res, { resource, sub, token, headers }) {
  if (resource === 'contract-negotiations' && req.method === 'GET' && !sub) {
    const q = query(req), id = requireUuid(q.get('contract_id'), 'contract_id');
    const contract = (await rest(token, `fin_contracts?select=id,organization_id,legal_entity_id,provider_id,product,title,status,current_version,currency,origin&id=eq.${id}&limit=1`))?.[0];
    if (!contract) throw new HttpError(404, 'Contrato não encontrado para sua conta.', 'contract_not_found');
    await memberOrganization(token, contract.organization_id, ['BUYER']);
    const after = q.get('after') ? `&id=gt.${requireUuid(q.get('after'), 'after')}` : '';
    const one = q.get('rfq_id') ? `&entity_id=eq.${requireUuid(q.get('rfq_id'), 'rfq_id')}` : '';
    const origins = await rest(token, `fin_events?select=id,entity_id,actor_id,happened_at,metadata&organization_id=eq.${contract.organization_id}&entity_type=eq.rfq&event_type=eq.rfq_created_from_contract&metadata->>contract_id=eq.${id}${after}${one}&order=id.asc&limit=21`);
    const page = origins.slice(0, 20), ids = [...new Set(page.map(e => e.entity_id))];
    const [versions, amendments, tasks, opportunities, processes] = await Promise.all([
      bounded(token, `fin_contract_versions?select=version,effective_from,source,amendment_id,terms,recorded_by,recorded_at&contract_id=eq.${id}&order=version.asc`),
      bounded(token, `fin_contract_amendments?select=id,number,title,effective_from,document_id,recorded_by,recorded_at&contract_id=eq.${id}&order=number.asc`),
      bounded(token, `fin_tasks?select=id,title,status,due_on,assignee_id&organization_id=eq.${contract.organization_id}&related_type=eq.contract&related_id=eq.${id}`),
      bounded(token, `fin_opportunities?select=id,opportunity_type,status,rule_version,rule_snapshot,facts_snapshot,current_facts,reviewer_id,possible_action,linked_rfq_id,source_object_type,source_object_id,closed_at,closed_by,resolution&organization_id=eq.${contract.organization_id}&or=(and(source_object_type.eq.contract,source_object_id.eq.${id})${ids.length ? `,linked_rfq_id.in.(${ids.join(',')})` : ''})`),
      negotiationProcesses(token, contract.organization_id, ids, page)
    ]);
    json(res, 200, { ok: true, contract: { ...contract, href: href('contract', id) }, versions, amendments, tasks, opportunities, processes,
      absence: !origins.length && !after ? 'no_recorded_renegotiation_origin' : null,
      next: origins.length > 20 ? page.at(-1).id : null, consistency: 'live_reads_not_transaction_snapshot' }, headers);
    return true;
  }
  if (resource === 'opportunities' && sub === 'outcome' && req.method === 'GET') {
    const id = requireUuid(query(req).get('id'), 'id');
    const opportunity = (await rest(token, `fin_opportunities?select=*&id=eq.${id}&limit=1`))?.[0];
    if (!opportunity) throw new HttpError(404, 'Oportunidade indisponível.', 'opportunity_not_found');
    await memberOrganization(token, opportunity.organization_id, ['BUYER']);
    const [processes, completion] = await Promise.all([
      negotiationProcesses(token, opportunity.organization_id, opportunity.linked_rfq_id ? [opportunity.linked_rfq_id] : []),
      bounded(token, `fin_events?select=id,event_type,actor_id,happened_at,metadata&organization_id=eq.${opportunity.organization_id}&entity_type=eq.opportunity&entity_id=eq.${id}&event_type=eq.opportunity_negotiation_completed&order=happened_at.asc,id.asc`)
    ]);
    json(res, 200, { ok: true, opportunity, processes, completion, absence: !opportunity.linked_rfq_id ? 'no_linked_negotiation' : !processes.length ? 'linked_negotiation_unavailable' : null }, headers);
    return true;
  }
  if (resource === 'opportunities' && sub === 'complete-negotiation' && req.method === 'POST') {
    const b = await readBody(req);
    if (b.confirmed !== true || !['acknowledged', 'under_review'].includes(b.expected_status) || typeof b.resolution !== 'string' || b.resolution.trim().length < 3 || b.resolution.length > 1000 || /[<>]/.test(b.resolution)) throw new HttpError(400, 'Confirme a conclusão humana e descreva a ação.', 'invalid_opportunity_result');
    const result = await rpc(token, 'fin_complete_opportunity_negotiation', { p_id: requireUuid(b.opportunity_id, 'opportunity_id'), p_expected: b.expected_status, p_decision: requireUuid(b.decision_id, 'decision_id'), p_confirmed: true, p_resolution: b.resolution.trim() });
    json(res, 200, { ok: true, ...result }, headers); return true;
  }
  return false;
}

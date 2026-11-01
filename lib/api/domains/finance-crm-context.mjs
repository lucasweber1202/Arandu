import { rest } from './finance-core.mjs';

// Financial Graph composes CRM references, rather than mirroring RFQ or
// contract state into a second workflow. Every read retains the user's JWT.
export async function crmGraphContext(token, organizationId, rootType, rootId, { p_entity = null } = {}) {
  if (!['provider', 'rfq', 'contract', 'opportunity', 'proposal', 'task'].includes(rootType)) return null;
  const entity = p_entity ? `&legal_entity_id=eq.${p_entity}` : '';
  const reference = `organization_id=eq.${organizationId}&related_type=eq.${rootType}&related_id=eq.${rootId}${entity}&order=id.asc&limit=26`;
  const institution = `organization_id=eq.${organizationId}&provider_ids=cs.{${rootId}}${entity}&order=id.asc&limit=26`;
  const [activities, processes, contacts] = await Promise.all([
    rest(token, rootType === 'provider' ? `fin_crm_institution_records?select=*&record_type=eq.activity&${institution}` : `fin_crm_activities?select=id,legal_entity_id,kind,subject,status,owner_id,due_on,version,source_reference&${reference}`),
    rest(token, rootType === 'provider' ? `fin_crm_institution_records?select=*&record_type=eq.process&${institution}` : `fin_crm_processes?select=id,legal_entity_id,title,stage,status,owner_id,due_on,next_action,version,source_reference&${reference}`),
    rootType === 'provider' ? rest(token, `fin_provider_contacts?select=id,legal_entity_id,name,title,owner_id,version,source_reference&organization_id=eq.${organizationId}&provider_id=eq.${rootId}${entity}&archived_at=is.null&order=id.asc&limit=26`) : []
  ]);
  return Object.fromEntries(Object.entries({ activities: activities || [], processes: processes || [], contacts: contacts || [] }).map(([key, rows]) => {
    const filters = { organization_id: organizationId, ...(p_entity ? { legal_entity_id: p_entity } : {}),
      ...(key === 'contacts' ? { provider_id: rootId, status: 'active' } : { related_type: rootType, related_id: rootId }) };
    const derived = rootType === 'provider' && key !== 'contacts';
    return [key, { rows: rows.slice(0, 25).map(row => derived && key === 'activities' ? { ...row, subject: row.title } : row), has_more: rows.length > 25, limit: 25,
      continuation: { resource: derived ? 'crm-institution-records' : `crm-${key}`, filters: derived ? { organization_id: organizationId, provider_id: rootId, record_type: key === 'activities' ? 'activity' : 'process', ...(p_entity ? { legal_entity_id: p_entity } : {}) } : filters, sort: derived ? 'record_type.asc,id.asc' : 'id.asc' },
      coverage: derived ? 'explicit_institution_associations' : 'direct_references_only' }];
  }));
}

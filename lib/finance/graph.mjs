export const GRAPH_ROOTS = ['organization', 'entity', 'provider', 'rfq', 'contract', 'facility'];
export const GRAPH_KINDS = ['organization', 'entity', 'provider', 'relationship', 'rfq', 'proposal', 'decision', 'contract', 'facility', 'limit', 'guarantee', 'passport_snapshot', 'milestone', 'obligation', 'document', 'owner', 'value_realization'];
export const GRAPH_LABELS = { organization: 'Grupo', entity: 'Entidade', provider: 'Provedor', relationship: 'Relacionamento', rfq: 'Solicitação', proposal: 'Proposta', decision: 'Decisão', contract: 'Contrato', facility: 'Facility', limit: 'Limite', guarantee: 'Garantia', passport_snapshot: 'Passport usado', milestone: 'Marco', obligation: 'Obrigação', document: 'Documento', owner: 'Responsável', value_realization: 'Valor de procurement' };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function graphFilters(params) {
  const kind = params.get('kind') || null;
  const entity = params.get('legal_entity_id') || null;
  const status = params.get('status') || null;
  const search = params.get('q')?.trim() || null;
  const due = params.get('due_before') || null;
  const limit = params.has('limit') ? Number(params.get('limit')) : 20;
  const offset = params.has('offset') ? Number(params.get('offset')) : 0;
  if (kind && !GRAPH_KINDS.includes(kind) || entity && !uuid.test(entity) || status && !/^[a-z_]{1,40}$/.test(status) || search && (search.length < 2 || search.length > 100) || due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || !Number.isFinite(Date.parse(due)) || new Date(due).toISOString().slice(0, 10) !== due) || !Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0 || offset > 5000) return null;
  return { p_kind: kind, p_entity: entity, p_status: status, p_query: search, p_due_before: due, p_limit: limit, p_offset: offset };
}
// Links derive only from typed canonical IDs; never use an upstream URL.
export function graphHref(row) {
  if (row.object_type === 'rfq' || row.rfq_id && ['proposal', 'decision', 'passport_snapshot'].includes(row.object_type)) {
    const id = row.rfq_id || row.object_id;
    return uuid.test(id) ? `/finance/rfq.html?id=${encodeURIComponent(id)}` : null;
  }
  if (row.object_type === 'value_realization') return uuid.test(row.object_id) ? `/finance/value.html?id=${encodeURIComponent(row.object_id)}` : null;
  const pages = { provider: 'providers', relationship: 'providers', contract: 'contracts', milestone: 'contracts', facility: 'portfolio', limit: 'portfolio', guarantee: 'portfolio', obligation: 'portfolio', entity: 'settings', organization: 'settings' };
  return pages[row.object_type] ? `/finance/${pages[row.object_type]}.html` : null;
}

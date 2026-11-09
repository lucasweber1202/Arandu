// Resposta determinística de GET rfqs?paged=1 (contrato Arandu 9.1 v1.1) para
// testes de interface: filtros status/product/legal_entity_id, ordem por id,
// cursor vinculado aos filtros. API SIMULADA — não prova o backend real.
export function pagedRfqs(all, url, { limit: forced = null, entities = [] } = {}) {
  const q = url.searchParams;
  const limit = forced || Number(q.get('limit') || 25);
  const scope = JSON.stringify(['status', 'product', 'legal_entity_id', 'include_children', 'order'].map((key) => q.get(key)));
  const entityIds = new Set([q.get('legal_entity_id')]);
  if (q.get('include_children') === '1') for (let changed = true; changed;) { changed = false; for (const entity of entities) if (entityIds.has(entity.parent_id) && !entityIds.has(entity.id)) { entityIds.add(entity.id); changed = true; } }
  const rows = (all || []).map(({ proposals, invites, invites_count, owner_name, pending_approval, decision_id, next_states, ...row }) => row)
    .filter((row) => (!q.get('status') || row.status === q.get('status')) && (!q.get('product') || row.product === q.get('product'))
      && (!q.get('legal_entity_id') || (q.get('legal_entity_id') === 'group' ? !row.legal_entity_id : entityIds.has(row.legal_entity_id))))
    .sort((a,b) => q.get('order') === 'created_desc' ? String(b.created_at || '').localeCompare(String(a.created_at || '')) || b.id.localeCompare(a.id) : q.get('order') === 'deadline_asc' ? String(a.response_deadline || '9999').localeCompare(String(b.response_deadline || '9999')) || a.id.localeCompare(b.id) : a.id.localeCompare(b.id));
  let start = 0;
  if (q.get('cursor')) {
    const cursor = JSON.parse(Buffer.from(q.get('cursor'), 'base64url').toString());
    if (cursor.scope !== scope) return { status: 400, body: { ok: false, code: 'invalid_cursor', error: 'Cursor de outro recorte.' } };
    start = rows.findIndex((row) => row.id === cursor.after) + 1;
    if (start < 0) start = rows.length;
  }
  const page = rows.slice(start, start + limit);
  const hasMore = start + limit < rows.length;
  const next = hasMore ? Buffer.from(JSON.stringify({ scope, after: page.at(-1).id })).toString('base64url') : null;
  return { status: 200, body: { ok: true, rows: page, next_states: {}, page: { limit, has_more: hasMore, next_cursor: next }, consistency: 'live_reads_not_transaction_snapshot' } };
}

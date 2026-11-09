// Resposta determinística de GET rfqs?paged=1 (contrato Arandu 9.1 v1.1) para
// testes de interface: filtros status/product/legal_entity_id, ordem por id,
// cursor vinculado aos filtros. API SIMULADA — não prova o backend real.
export function pagedRfqs(all, url, { limit: forced = null } = {}) {
  const q = url.searchParams;
  const limit = forced || Number(q.get('limit') || 25);
  const scope = JSON.stringify(['status', 'product', 'legal_entity_id'].map((key) => q.get(key)));
  const rows = (all || []).map(({ proposals, invites, invites_count, owner_name, pending_approval, decision_id, next_states, ...row }) => row)
    .filter((row) => (!q.get('status') || row.status === q.get('status')) && (!q.get('product') || row.product === q.get('product'))
      && (!q.get('legal_entity_id') || (q.get('legal_entity_id') === 'group' ? !row.legal_entity_id : row.legal_entity_id === q.get('legal_entity_id'))))
    .sort((a, b) => a.id.localeCompare(b.id));
  let start = 0;
  if (q.get('cursor')) {
    const cursor = JSON.parse(Buffer.from(q.get('cursor'), 'base64url').toString());
    if (cursor.scope !== scope) return { status: 400, body: { ok: false, code: 'invalid_cursor', error: 'Cursor de outro recorte.' } };
    start = rows.findIndex((row) => row.id > cursor.after);
    if (start < 0) start = rows.length;
  }
  const page = rows.slice(start, start + limit);
  const hasMore = start + limit < rows.length;
  const next = hasMore ? Buffer.from(JSON.stringify({ scope, after: page.at(-1).id })).toString('base64url') : null;
  return { status: 200, body: { ok: true, rows: page, next_states: {}, page: { limit, has_more: hasMore, next_cursor: next }, consistency: 'live_reads_not_transaction_snapshot' } };
}

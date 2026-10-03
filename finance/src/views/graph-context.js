import { el, formatDate } from '../core.js';
import { card, button, errorState, emptyState } from '../ui.js';
import { GRAPH_KINDS, GRAPH_LABELS, graphHref } from '../../../lib/finance/graph.mjs';

/** Lazy contextual traversal: no background financial request or duplicate state. */
export function graphContextCard(ctx, { type, id, entity = null, kind = null, title = 'Relações financeiras' }) {
  const body = el('div', { class: 'graph-context', 'aria-live': 'polite' });
  const select = el('select', { 'aria-label': 'Tipo de relação financeira' });
  select.add(new Option('Todos os tipos', ''));
  for (const value of GRAPH_KINDS) select.add(new Option(GRAPH_LABELS[value], value));
  select.value = kind || '';
  let offset = 0;
  let busy = false;
  const results = el('div');
  const load = async () => {
    if (busy) return;
    busy = true;
    results.replaceChildren(el('p', { text: 'Consultando relações…' }));
    try {
      const params = new URLSearchParams({ id, organization_id: ctx.organization.id, limit: '20', offset: String(offset) });
      if (entity) params.set('legal_entity_id', entity);
      if (select.value) params.set('kind', select.value);
      const data = await ctx.api(`graph/${type}?${params}`);
      const rows = data.rows || [];
      const list = rows.length ? el('ul', { class: 'graph-list', role: 'list' }, rows.map((row) => {
        const href = graphHref(row);
        const facts = row.facts || {};
        const summary = [row.status, row.due_on ? `Data: ${formatDate(row.due_on)}` : null, facts.entity, facts.rfq ? `RFQ: ${facts.rfq}` : null,
          row.object_type === 'passport_snapshot' ? `${facts.value} · origem: ${facts.source} · escopo: ${facts.original_scope} · vintage: ${facts.vintage || '—'}` : null].filter(Boolean).join(' · ');
        return el('li', {}, [el('span', { class: 'muted small', text: GRAPH_LABELS[row.object_type] || row.object_type }),
          href ? el('a', { href, text: row.title }) : el('strong', { text: row.title }), summary ? el('p', { class: 'small', text: summary }) : null]);
      })) : emptyState({ title: 'Nenhuma relação neste filtro', text: 'A consulta mostra somente registros disponíveis para o seu escopo.', compact: true });
      results.replaceChildren(list, el('div', { class: 'toolbar-actions' }, [
        offset ? button('Anterior', { onClick: () => { offset = Math.max(0, offset - 20); load(); } }) : null,
        data.has_more ? button('Próximas relações', { onClick: () => { offset = data.next_offset; load(); } }) : null
      ]));
    } catch (error) { results.replaceChildren(errorState({ error, onRetry: load })); }
    finally { busy = false; }
  };
  select.addEventListener('change', () => { offset = 0; load(); });
  const open = button('Ver relações financeiras', { onClick: () => { body.replaceChildren(select, results); load(); } });
  body.append(open);
  return card({ title, subtitle: 'Dados dos registros originais, no escopo da sua conta.', body });
}

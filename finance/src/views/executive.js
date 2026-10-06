import { el } from '../core.js';
import { card, button, field, loading, errorState } from '../ui.js';
import { entityName } from './entities.js';

// Value Intelligence no Painel: cartões compostos no servidor (valor, tarifas,
// oportunidades) por moeda, entidade e período, com cobertura e links de ação.
export function executiveSection(ctx, entities) {
  const year = new Date().getUTCFullYear();
  const start = el('input', { type: 'date', value: `${year}-01-01` });
  const end = el('input', { type: 'date', value: `${year}-12-31` });
  const entity = el('select', {}, [['', 'Meu escopo'], ...entities.rows.map((x) => [x.id, entityName(entities, x.id)])].map(([value, text]) => el('option', { value, text })));
  const out = el('div', { class: 'stack' }, loading());
  const load = async () => {
    out.replaceChildren(loading());
    try {
      const q = new URLSearchParams({ organization_id: ctx.organization.id, start: start.value, end: end.value });
      if (entity.value) q.set('legal_entity_id', entity.value);
      const data = await ctx.api(`executive?${q}`);
      out.replaceChildren(...data.cards.map((c) => card({ title: c.title, headingLevel: 3, body: [...c.lines.map((text) => el('p', { text })), el('p', { class: 'muted small', text: c.note }),
        el('p', {}, c.links.flatMap((l, i) => [i ? ' · ' : null, el('a', { href: ctx.href(l.href), text: l.text })]))] })));
    } catch (error) { out.replaceChildren(errorState({ error, onRetry: load })); }
  };
  load();
  return card({ title: 'Inteligência de valor', id: 'value-intelligence', subtitle: 'Valor, tarifas e oportunidades por moeda, entidade e período — fatos separados, com cobertura.',
    body: [el('div', { class: 'form-grid' }, [field({ label: 'Início do período', control: start }), field({ label: 'Fim do período', control: end }), field({ label: 'Entidade', control: entity })]), button('Atualizar', { onClick: load }), out] });
}

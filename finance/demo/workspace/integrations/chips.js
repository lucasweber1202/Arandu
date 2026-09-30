// Estado das integrações no contexto: chips discretos ("Avisos no Slack",
// "ERP: Omie") nas telas de trabalho. Leve de propósito (só o registro).

import { el } from '../../../src/core.js';
import { connected } from './registry.js';

export function integrationChips(ctx, categories) {
  const items = categories.flatMap((category) => connected(category)).map((adapter) => el('a', { class: 'int-chip', href: ctx.href(`/finance/integrations.html#int-${adapter.id}`), title: `${adapter.name}: conectado (simulado)` }, [
    el('span', { class: 'int-dot', 'aria-hidden': 'true' }), el('span', { text: adapter.category === 'communication' ? `Avisos no ${adapter.name}` : adapter.category === 'erp' ? `ERP: ${adapter.name}` : adapter.name })]));
  return items.length ? el('p', { class: 'int-chips', 'aria-label': 'Integrações conectadas' }, items) : null;
}

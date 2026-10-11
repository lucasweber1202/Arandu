// Entrada por objetivo (Guideline v3.3 §35.10): "O que você precisa fazer?"
// leva ao fluxo existente certo. A lista vem de lib/finance/intents.mjs e só
// mostra o que o papel de quem usa permite executar.
import { el, icon } from '../core.js';
import { button, drawer } from '../ui.js';
import { intentsFor } from '../../../lib/finance/intents.mjs';

export function startButton(ctx) {
  const intents = intentsFor((permission) => ctx.can(permission));
  if (!intents.length) return null;
  return button('Começar', { variant: 'primary', iconName: 'plus', attrs: { id: 'start-intent', 'aria-haspopup': 'dialog' }, onClick: () => openIntents(ctx, intents) });
}

function openIntents(ctx, intents) {
  const body = el('div', { class: 'intent-groups' });
  for (const group of [...new Set(intents.map((intent) => intent.group))]) {
    const id = `intent-group-${group.normalize('NFD').replace(/[^a-z]/gi, '').toLowerCase()}`;
    body.append(el('section', { class: 'intent-group', 'aria-labelledby': id }, [
      el('h3', { class: 'intent-group-title', id, text: group }),
      el('ul', { role: 'list', class: 'intent-list' }, intents.filter((intent) => intent.group === group).map((intent) => el('li', {},
        el('a', { class: 'intent-link', href: ctx.href(intent.path), dataset: { intent: intent.key } }, [
          el('span', { class: 'intent-icon' }, icon(intent.icon, { size: 18 })),
          el('span', { class: 'intent-text' }, [el('span', { class: 'intent-label', text: intent.label }), el('span', { class: 'intent-detail', text: intent.detail })]),
          icon('chevronRight', { size: 16 })
        ]))))
    ]));
  }
  drawer({ title: 'O que você precisa fazer?', subtitle: 'Cada caminho leva ao fluxo certo e reaproveita o que a empresa já cadastrou.', body, className: 'intent-drawer' });
}

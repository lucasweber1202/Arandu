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

// Sem nada registrado, o primeiro valor vem do que a empresa já tem — não de
// uma concorrência. A ordem dos grupos acompanha isso; nenhuma intenção some
// por plano ou porte, só atalhos que levariam a uma lista vazia.
function arrange(ctx, intents) {
  const data = ctx.data || {};
  const known = (list) => Array.isArray(list);
  const hasContracts = known(data.contracts) ? data.contracts.length > 0 : true;
  const comparing = known(data.rfqs) ? data.rfqs.some((rfq) => rfq.status === 'comparing') : true;
  const visible = intents.filter((intent) => (intent.key !== 'compare' || comparing) && (intent.key !== 'renew' || hasContracts));
  const groups = [...new Set(visible.map((intent) => intent.group))];
  const empty = known(data.rfqs) && known(data.contracts) && !data.rfqs.length && !data.contracts.length;
  if (empty) groups.sort((a, b) => (b === 'Registrar o que já existe') - (a === 'Registrar o que já existe'));
  return { visible, groups, empty };
}

function openIntents(ctx, intents) {
  const body = el('div', { class: 'intent-groups' });
  const { visible, groups, empty } = arrange(ctx, intents);
  intents = visible;
  if (empty) body.append(el('p', { class: 'callout callout-info compact' }, [icon('info', { size: 14 }),
    el('span', { text: 'Comece pelo que a empresa já tem: um contrato ou uma instituição registrados aqui já passam a ter prazo, aviso prévio e próxima ação. Nenhuma instituição precisa ter conta no Arandu para isso.' })]));
  for (const group of groups) {
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

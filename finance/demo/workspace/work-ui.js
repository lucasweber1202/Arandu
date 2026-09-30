// Peças visuais da gramática da próxima ação (ver next-action.js).
//
// Três tamanhos para a MESMA informação, para que um objeto pareça o mesmo
// em qualquer lugar:
//   nextBlock   detalhe, inspector e contexto de aprovação (completo)
//   queueRow    fila "Precisa de você" e "Em andamento" (linha acionável)
//   nextInline  célula "Próxima ação" das listas (ação + motivo curto)

import { el, icon } from '../../src/core.js';
import { linkButton } from '../../src/ui.js';

export const STATE_DOT = (tone) => el('span', { class: `na-dot tone-${tone || 'neutral'}`, 'aria-hidden': 'true' });

/** Estado em versalete com ponto de cor semântica — o mesmo em todas as telas. */
export function stateLabel(next) {
  return el('span', { class: 'na-state' }, [STATE_DOT(next.stateTone), el('span', { text: next.state })]);
}

/** Bloco completo: estado · próxima ação · por quê · prazo · responsável · ação. */
export function nextBlock(ctx, next, { heading = 'Próxima ação', action = true, extra = null, id = null } = {}) {
  const meta = [
    next.due ? ['Prazo', next.due.text, next.due.urgent ? 'is-urgent' : ''] : null,
    next.owner?.name ? ['Responsável', next.mine ? `${next.owner.name} (você)` : next.owner.name] : null
  ].filter(Boolean);
  return el('section', { class: `na tone-${next.tone || 'neutral'}`, id, 'aria-label': heading, dataset: { stage: next.stage || next.kind } }, [
    stateLabel(next),
    el('p', { class: 'na-kicker', text: heading }),
    el('p', { class: 'na-action', text: next.action }),
    next.why ? el('p', { class: 'na-why', text: next.why }) : null,
    meta.length ? el('dl', { class: 'na-meta' }, meta.map(([label, value, className]) => el('div', {}, [el('dt', { text: label }), el('dd', { class: `num ${className}`.trim(), text: value })]))) : null,
    extra,
    action && next.href && next.cta ? el('div', { class: 'na-actions' }, linkButton(next.cta, ctx.href(next.href), { variant: next.mine || next.stage === 'evaluation' ? 'primary' : 'secondary', size: 'sm', iconName: 'arrowRight', attrs: { 'data-next-cta': '' } })) : null
  ]);
}

/** Linha da fila de trabalho: título do objeto, ação, motivo, prazo e um botão. */
export function queueRow(ctx, next, { quick = null } = {}) {
  return el('li', { class: `wq-row tone-${next.tone || 'neutral'}`, dataset: { kind: next.kind, id: next.id } }, [
    el('span', { class: 'wq-rail', 'aria-hidden': 'true' }),
    el('div', { class: 'wq-main' }, [
      el('p', { class: 'wq-action' }, [el('a', { class: 'wq-link', href: ctx.href(next.href), text: next.action, ...(quick ? { 'data-quick': quick } : {}) }), next.kind !== 'task' ? el('span', { class: 'wq-object', text: ` — ${next.title}` }) : null]),
      el('p', { class: 'wq-why' }, [stateLabel(next), next.why ? el('span', { class: 'wq-sep', 'aria-hidden': 'true', text: '·' }) : null, next.why ? el('span', { text: next.why.replace(/\.$/, '') }) : null])
    ]),
    el('p', { class: `wq-due num${next.due?.urgent ? ' is-urgent' : ''}`, text: next.due ? next.due.text : '' }),
    el('a', { class: 'btn btn-sm wq-cta', href: ctx.href(next.href), tabindex: '-1', 'aria-hidden': 'true' }, [el('span', { class: 'btn-label', text: next.cta }), icon('arrowRight', { size: 14 })])
  ]);
}

/** Célula compacta de lista. */
export function nextInline(next) {
  return el('span', { class: `na-inline tone-${next.tone || 'neutral'}` }, [
    el('span', { class: 'na-inline-action', text: next.action }),
    next.why ? el('span', { class: 'na-inline-why', text: next.why.replace(/\.$/, '') }) : null
  ]);
}

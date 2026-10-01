// Continuidade entre personas: o mesmo processo, visto por quem age a seguir.
//
//   Marina avalia Capital de giro → Camila respondeu pelo Atlas Bank →
//   Marina pede aprovação → Ricardo aprova → vira contrato → Helena governa.
//
// Quando a próxima ação de um objeto pertence a outra persona da
// demonstração, a tela oferece "Continuar como Ricardo" e leva direto ao
// mesmo objeto do ponto de vista dele. É simulação de produto: troca o
// usuário fictício do motor local, nunca autoriza nada real.

import { el, icon } from '../../src/core.js';
import { PERSONAS } from '../seed.js';
import { PERSONA_META } from './personas.js';

const byUser = new Map(Object.values(PERSONAS).map((persona) => [persona.user, persona.key]));

/** Troca a persona do motor e abre o destino como ela. */
export function continueAs(ctx, key, path) {
  ctx.transport.setPersona(key);
  location.assign(ctx.href(path));
}

/** Botão "Continuar como …" (ou null quando a ação já é de quem está vendo). */
export function handoffButton(ctx, { userId = null, persona = null, path, label = null, note = null }) {
  const key = persona || byUser.get(userId);
  if (!key || key === ctx.persona?.key) return null;
  const meta = PERSONA_META[key];
  const node = el('button', { type: 'button', class: 'handoff', dataset: { persona: key } }, [
    el('span', { class: 'handoff-avatar', 'aria-hidden': 'true', text: meta.name.split(' ').map((part) => part[0]).slice(0, 2).join('') }),
    el('span', { class: 'handoff-text' }, [el('span', { class: 'handoff-label', text: label || `Continuar como ${meta.name.split(' ')[0]}` }),
      el('span', { class: 'handoff-note', text: note || `${meta.group} · ${meta.title}` })]),
    icon('arrowRight', { size: 14 })
  ]);
  node.addEventListener('click', () => continueAs(ctx, key, path));
  return node;
}

/** Próxima persona no processo de uma solicitação, a partir da próxima ação. */
export function rfqHandoff(ctx, rfq, next) {
  if (next.stage === 'approval' && next.owner?.id && next.requestId) {
    return handoffButton(ctx, { userId: next.owner.id, path: `/finance/approvals.html#request-${next.requestId}`, note: 'Ver o mesmo pedido na caixa de aprovação dele' });
  }
  if (next.stage === 'approval' && next.cta === 'Registrar') return handoffButton(ctx, { userId: rfq.owner_id, path: `/finance/rfq.html?id=${rfq.id}#decisao`, note: 'Registrar a decisão aprovada' });
  if (['evaluation', 'collecting'].includes(next.stage) && ctx.persona?.key !== 'provider') {
    const atlas = (rfq.proposals || []).find((proposal) => /Atlas/.test(proposal.provider_name || ''));
    if (atlas) return handoffButton(ctx, { persona: 'provider', path: `/provider/proposal.html?proposal=${atlas.id}`, label: 'Ver como Camila (Atlas Bank)', note: 'A mesma solicitação, do lado do provedor' });
  }
  if (['decided', 'contracted'].includes(next.stage)) return handoffButton(ctx, { persona: 'admin', path: '/finance/settings.html#aprovacao', label: 'Ver governança como Helena', note: 'Política de aprovação e equipe' });
  return null;
}

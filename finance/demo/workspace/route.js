// "Ver processo completo": um roteiro pelo MESMO processo, com os dados que
// já existem, passando pelas quatro personas. Não é tour de balões: é uma
// barra discreta no rodapé, que diz onde se está no roteiro e leva ao passo
// seguinte trocando a persona quando é outra pessoa que age. Sair é sempre um
// clique, e o roteiro vive só nesta aba (sessionStorage).

import { el, icon } from '../../src/core.js';
import { R, demoId } from '../seed.js';
import { PERSONA_META } from './personas.js';

export const ROUTE_KEY = 'arandu-demo-route';
export const ROUTE = Object.freeze([
  { persona: 'buyer', path: '/finance/dashboard.html', title: 'O que precisa da Marina', text: 'A fila de trabalho: prazos, decisões e renovações, cada um com a próxima ação.' },
  { persona: 'buyer', path: `/finance/rfq.html?id=${R.capital}`, title: 'Capital de giro, na fase de aprovação', text: 'Fase atual, próxima ação, prazo e responsável no topo da solicitação.' },
  { persona: 'buyer', path: `/finance/rfq.html?id=${R.capital}#comparacao`, title: 'Comparação factual', text: 'Onde as propostas diferem, campos ausentes e estimativas separadas do que foi informado.' },
  { persona: 'provider', path: `/provider/proposal.html?proposal=${demoId(6, 1)}`, title: 'Camila responde pelo Atlas Bank', text: 'A mesma solicitação, do lado do provedor: revisões, versões e o que a empresa pediu.' },
  { persona: 'approver', path: `/finance/approvals.html#request-${demoId(7, 1)}`, title: 'Ricardo revisa e decide', text: 'Quanto, qual proposta, por quê e as diferenças materiais — antes de aprovar.' },
  { persona: 'buyer', path: '/finance/contracts.html', title: 'Contrato e renovação', text: 'Depois da decisão, o prazo que importa passa a ser o do aviso prévio.' },
  { persona: 'admin', path: '/finance/settings.html#governanca', title: 'Helena cuida da governança', text: 'Equipe, papéis e a política de aprovação que valeu para todo o processo.' }
]);

export function readRoute() { try { const value = Number(sessionStorage.getItem(ROUTE_KEY)); return Number.isInteger(value) && value >= 0 && value < ROUTE.length && sessionStorage.getItem(ROUTE_KEY) !== null ? value : null; } catch { return null; } }
export function writeRoute(index) { try { if (index === null) sessionStorage.removeItem(ROUTE_KEY); else sessionStorage.setItem(ROUTE_KEY, String(index)); } catch { /* sem sessão */ } }

/** Vai a um passo do roteiro (troca a persona do motor quando necessário). */
export function goToStep(ctx, index, { setPersona } = {}) {
  const step = ROUTE[index];
  if (!step) return;
  writeRoute(index);
  const changesPersona = step.persona !== ctx.persona?.key;
  (setPersona || ((key) => ctx.transport.setPersona(key)))(step.persona);
  const target = new URL(`/demo${step.path}`, location.origin);
  // Mesmo documento, só a âncora muda (ex.: aba Comparação): sem recarregar.
  if (!changesPersona && target.pathname === location.pathname && target.search === location.search) {
    location.hash = target.hash;
    installRouteBar(ctx);
    return;
  }
  location.assign(target.pathname + target.search + target.hash);
}

/** Barra do roteiro, quando ele está ativo nesta aba. */
export function installRouteBar(ctx) {
  document.querySelector('#route-bar')?.remove();
  const index = readRoute();
  if (index === null) return;
  const step = ROUTE[index];
  const next = ROUTE[index + 1];
  const meta = PERSONA_META[step.persona];
  const nextMeta = next ? PERSONA_META[next.persona] : null;
  const bar = el('section', { class: 'route-bar', id: 'route-bar', 'aria-label': 'Roteiro: processo completo' }, [
    el('p', { class: 'route-step num', text: `${index + 1}/${ROUTE.length}` }),
    el('div', { class: 'route-text' }, [el('p', { class: 'route-title', text: step.title }), el('p', { class: 'route-sub', text: `${meta.name.split(' ')[0]} · ${step.text}` })]),
    el('div', { class: 'route-actions' }, [
      index > 0 ? el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => goToStep(ctx, index - 1) }, [icon('chevronLeft', { size: 14 }), el('span', { class: 'btn-label', text: 'Anterior' })]) : null,
      next ? el('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'route-next', onclick: () => goToStep(ctx, index + 1) }, [
        el('span', { class: 'btn-label', text: next.persona === step.persona ? 'Próximo passo' : `Continuar como ${nextMeta.name.split(' ')[0]}` }), icon('arrowRight', { size: 14 })])
        : el('a', { class: 'btn btn-primary btn-sm', href: '/demo/index.html', onclick: () => writeRoute(null) }, el('span', { class: 'btn-label', text: 'Concluir roteiro' })),
      el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Sair do roteiro', title: 'Sair do roteiro', onclick: () => { writeRoute(null); bar.remove(); document.body.classList.remove('has-route'); } }, icon('x', { size: 14 }))
    ].filter(Boolean))
  ]);
  document.body.append(bar);
  document.body.classList.add('has-route');
}

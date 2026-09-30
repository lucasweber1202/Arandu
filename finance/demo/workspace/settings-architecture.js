// Configurações organizadas por quem é dono de cada decisão.
//
//   Minha conta     nome e cargo · notificações · aparência
//   Empresa         dados da empresa · perfil financeiro
//   Governança      equipe e papéis · política de aprovação
//   Demonstração    restaurar · simular falha · console operacional
//
// Continua uma página só (as âncoras #empresa, #equipe, #aprovacao… não
// mudam); a camada reagrupa as seções do produto e os títulos passam a
// descer um nível sob o título do grupo.

import { el } from '../../src/core.js';
import { button } from '../../src/ui.js';

export const SETTINGS_GROUPS = [
  { id: 'minha-conta', title: 'Minha conta', text: 'O que é seu: como a equipe vê você, o que chega até você e como a tela aparece.', sections: ['voce', 'notificacoes', 'aparencia'] },
  { id: 'grupo-empresa', title: 'Empresa', text: 'Dados que a empresa informa uma vez e reaproveita em cada solicitação.', sections: ['empresa', 'perfil'] },
  { id: 'governanca', title: 'Governança', text: 'Quem decide e com que regra.', sections: ['equipe', 'aprovacao'] },
  { id: 'grupo-demonstracao', title: 'Demonstração', text: 'Ferramentas que existem só neste ambiente.', sections: ['demonstracao'] }
];

export function organizeSettings({ openRestore = null } = {}) {
  const layout = document.querySelector('#view .settings-layout');
  const nav = layout?.querySelector('.settings-nav');
  const stack = layout?.querySelector('.stack');
  if (!layout || !nav || !stack || layout.dataset.dw) return;
  layout.dataset.dw = '1';
  const title = document.querySelector('.page-head .lede');
  if (title) title.textContent = 'Sua conta, a empresa, a governança e a demonstração — cada coisa no seu lugar.';
  const links = new Map([...nav.querySelectorAll('a')].map((link) => [link.getAttribute('href').slice(1), link]));
  const cards = new Map([...stack.children].map((card) => [card.id, card]));
  const navNodes = [];
  const stackNodes = [];
  for (const group of SETTINGS_GROUPS) {
    const present = group.sections.filter((id) => cards.has(id));
    if (!present.length) continue;
    navNodes.push(el('p', { class: 'settings-nav-group', text: group.title }), ...present.map((id) => links.get(id)).filter(Boolean));
    stackNodes.push(el('header', { class: 'settings-group', id: group.id }, [el('h2', { class: 'settings-group-title', text: group.title }), el('p', { class: 'settings-group-text', text: group.text })]));
    for (const id of present) {
      const card = cards.get(id);
      // O título da seção desce para h3: o grupo é o h2.
      const heading = card.querySelector('.card-title');
      if (heading?.tagName === 'H2') heading.replaceWith(el('h3', { class: heading.className, text: heading.textContent }));
      stackNodes.push(card);
    }
  }
  // Seções que nenhum grupo conhece continuam no fim, sem sumir.
  for (const [id, card] of cards) if (!stackNodes.includes(card)) { stackNodes.push(card); if (links.get(id)) navNodes.push(links.get(id)); }
  nav.replaceChildren(...navNodes);
  stack.replaceChildren(...stackNodes);
  // Restaurar mora junto das demais ferramentas da demonstração.
  const demo = cards.get('demonstracao')?.querySelector('.card-body');
  if (demo && openRestore && !demo.querySelector('#settings-restore')) demo.prepend(button('Restaurar demonstração…', { iconName: 'refresh', attrs: { id: 'settings-restore' }, onClick: openRestore }));
}

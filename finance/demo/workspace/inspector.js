// Inspector: lista | contexto, sem sair da lista.
//
// Três níveis de profundidade, cada um com um papel claro:
//   INSPECTOR   entender rapidamente — estado, próxima ação, o essencial.
//               Painel ancorado à direita da lista em telas largas (≥ 1360 px);
//               não é modal: a lista continua navegável (↑ ↓ trocam o item).
//   WORKSPACE   operar — a página do objeto (solicitação, contrato…).
//   FOCO        trabalho complexo — a comparação, sem barra lateral.
// Em telas menores o mesmo conteúdo abre como quick view (drawer / folha).
//
// O inspector não é uma segunda página: mostra o resumo da quick view e um
// único caminho para operar ("Abrir …").

import { el, icon } from '../../src/core.js';
import { resolveEntity } from './quick-view.js';
import { announce } from './shell.js';
import { flag } from './platform/telemetry.js';

export const INSPECTOR_QUERY = '(min-width: 1360px)';
const LIST_VIEWS = new Set(['rfqs', 'proposals', 'contracts', 'providers', 'tasks']);
const TYPE_LABEL = { rfq: 'Solicitação', proposal: 'Proposta', contract: 'Contrato', provider: 'Provedor', task: 'Tarefa' };
const state = { ctx: null, current: null, opener: null };

// Adaptativo (Work OS): decide pela largura ÚTIL medida (tela menos a barra
// lateral como está agora), não por um breakpoint fixo. Lista (≥ 680 px) +
// inspector (420 px) precisam caber; em 1280 com barra compacta cabe, com a
// barra expandida não. Com a flag desligada, volta ao breakpoint fixo.
export const INSPECTOR_MIN_WORKSPACE = 1100;
export function workspaceWidth() {
  const sidebar = document.querySelector('.sidebar');
  const rect = sidebar?.getBoundingClientRect();
  const overlay = sidebar && getComputedStyle(sidebar).position === 'fixed' && document.documentElement.dataset.sidebarState !== 'expanded';
  return Math.round(window.innerWidth - (rect && !overlay && rect.width < window.innerWidth / 2 ? rect.width : 0));
}
export const inspectorFits = () => (flag('inspectorV2') ? window.innerWidth >= 1180 && workspaceWidth() >= INSPECTOR_MIN_WORKSPACE : matchMedia(INSPECTOR_QUERY).matches);
export const inspectorAvailable = (ctx) => LIST_VIEWS.has(ctx?.view) && ctx.audience === 'company' && inspectorFits();
const isOpen = () => document.documentElement.dataset.inspector === 'on';

function markSelection(type, id) {
  for (const node of document.querySelectorAll('#view .is-inspected')) node.classList.remove('is-inspected');
  for (const node of document.querySelectorAll('#view [data-quick][aria-current]')) node.removeAttribute('aria-current');
  if (!type) return null;
  const link = document.querySelector(`#view [data-quick="${type}:${id}"]`);
  link?.setAttribute('aria-current', 'true');
  const row = link?.closest('tr, li, article') || document.querySelector(`#view [data-entity="${type}"][data-id="${id}"]`);
  row?.classList.add('is-inspected');
  return link;
}

export function closeInspector({ restore = true } = {}) {
  if (!isOpen()) return;
  const current = state.current;
  document.documentElement.dataset.inspector = 'off';
  document.querySelector('#inspector')?.remove();
  markSelection(null);
  state.current = null;
  announce('Resumo fechado.');
  if (restore) {
    const target = (state.opener && document.contains(state.opener) ? state.opener : null) || (current && document.querySelector(`#view [data-quick="${current}"]`));
    target?.focus({ preventScroll: true });
  }
}

/** Abre (ou troca) o item do inspector. Devolve false quando não se aplica. */
export function openInspector(ctx, type, id, { focus = true } = {}) {
  if (!inspectorAvailable(ctx) || !TYPE_LABEL[type]) return false;
  const entity = resolveEntity(ctx, type, id);
  if (!entity) return false;
  state.ctx = ctx;
  if (!isOpen()) state.opener = document.activeElement;
  const view = entity.build();
  const titleId = 'inspector-title';
  const close = el('button', { type: 'button', class: 'icon-btn insp-close', 'aria-label': 'Fechar resumo (Esc)', title: 'Fechar (Esc)' }, icon('x', { size: 16 }));
  close.addEventListener('click', () => closeInspector());
  const panel = el('aside', { class: 'inspector', id: 'inspector', 'aria-labelledby': titleId, tabindex: '-1', dataset: { entity: `${type}:${id}` } }, [
    el('header', { class: 'insp-head' }, [
      el('div', { class: 'insp-heading' }, [el('p', { class: 'insp-kicker', text: `${TYPE_LABEL[type]} · resumo` }), el('h2', { class: 'insp-title', id: titleId, text: view.title }),
        view.subtitle ? el('p', { class: 'insp-sub', text: view.subtitle }) : null]),
      close
    ]),
    el('div', { class: 'insp-body' }, view.body.filter(Boolean)),
    el('footer', { class: 'insp-foot' }, view.footer.filter(Boolean)),
    el('p', { class: 'insp-hint', 'aria-hidden': 'true' }, [el('kbd', { class: 'kbd', text: '↑↓' }), ' outro item ', el('kbd', { class: 'kbd', text: 'Esc' }), ' fechar'])
  ]);
  const existing = document.querySelector('#inspector');
  if (existing) existing.replaceWith(panel); else document.querySelector('#main')?.append(panel);
  document.documentElement.dataset.inspector = 'on';
  state.current = `${type}:${id}`;
  markSelection(type, id);
  announce(`Resumo de ${view.title} aberto ao lado da lista.`);
  if (focus) panel.focus({ preventScroll: true });
  return true;
}

/** ↑ ↓ na lista com o inspector aberto: anda pelos itens visíveis. */
function step(delta) {
  const links = [...document.querySelectorAll('#view [data-quick]')].filter((node) => node.offsetParent !== null && !node.closest('[hidden]'));
  if (!links.length || !state.ctx) return;
  const index = links.findIndex((node) => node.dataset.quick === state.current);
  const target = links[Math.max(0, Math.min(links.length - 1, index + delta))];
  if (!target || target.dataset.quick === state.current) return;
  const [type, id] = target.dataset.quick.split(':');
  target.focus({ preventScroll: false });
  state.opener = target;
  openInspector(state.ctx, type, id, { focus: false });
}

let installed = false;
export function installInspector(ctx) {
  state.ctx = ctx;
  if (installed) return;
  installed = true;
  document.addEventListener('keydown', (event) => {
    if (!isOpen() || event.defaultPrevented || document.querySelector('dialog[open]')) return;
    const typing = event.target.closest?.('input, select, textarea, [contenteditable]');
    if (event.key === 'Escape') { event.preventDefault(); closeInspector(); return; }
    if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowDown' || event.key === 'j') { event.preventDefault(); step(1); }
    if (event.key === 'ArrowUp' || event.key === 'k') { event.preventDefault(); step(-1); }
  });
  // Ficou estreito: o inspector sai de cena (a quick view assume dali em diante).
  matchMedia(INSPECTOR_QUERY).addEventListener?.('change', (event) => { if (!event.matches && !flag('inspectorV2')) closeInspector({ restore: false }); });
  let frame = 0;
  addEventListener('resize', () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { document.documentElement.dataset.workspaceWidth = String(workspaceWidth()); if (isOpen() && !inspectorFits()) closeInspector({ restore: false }); }); }, { passive: true });
}
/** Chamado a cada render: o inspector não sobrevive a uma troca de tela. */
export function resetInspector() { if (isOpen()) closeInspector({ restore: false }); else document.documentElement.dataset.inspector = 'off'; }

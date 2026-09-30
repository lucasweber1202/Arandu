// Minhas visões: a forma como cada pessoa olha para uma lista.
//
//   Todas · Minhas · Urgentes · Aguardando resposta · Em avaliação · Fila CFO · + Nova visão
//
// Uma visão guarda o que a lista entende (busca, status, produto,
// responsável, ordenação), um filtro extra da própria visão (ex.: urgentes,
// renovação próxima) e as colunas visíveis. Vale para Solicitações e
// Contratos; fica neste navegador e pode ir para a barra lateral.

import { el, icon } from '../../src/core.js';
import { button, toast } from '../../src/ui.js';
import * as prefs from './preferences.js';
import { popover } from './popover.js';

const ACTIVE = (page) => `arandu-demo-view:${page}`;
export function builtinViews(ctx, page) {
  if (page === 'contracts') {
    return [
      { id: 'all', name: 'Todos', query: '', extra: '' },
      { id: 'renewal', name: 'Renovação próxima', query: '', extra: 'renewal' },
      { id: 'active', name: 'Vigentes', query: '', extra: 'active' },
      { id: 'ended', name: 'Encerrados', query: '', extra: 'ended' }
    ];
  }
  const mine = ctx.viewer?.id && (ctx.data.rfqs || []).some((rfq) => rfq.owner_id === ctx.viewer.id);
  return [
    { id: 'all', name: 'Todas', query: '', extra: '' },
    mine ? { id: 'mine', name: 'Minhas', query: prefs.cleanQuery(`owner=${ctx.viewer.id}`), extra: '' } : null,
    { id: 'urgent', name: 'Urgentes', query: '', extra: 'urgent' },
    { id: 'waiting', name: 'Aguardando resposta', query: '', extra: 'waiting' },
    { id: 'comparing', name: 'Em avaliação', query: 'status=comparing', extra: '' }
  ].filter(Boolean);
}

function readActive(page) { try { return sessionStorage.getItem(ACTIVE(page)) || ''; } catch { return ''; } }
function writeActive(page, id) { try { if (id) sessionStorage.setItem(ACTIVE(page), id); else sessionStorage.removeItem(ACTIVE(page)); } catch { /* sem sessão */ } }

/** Visão ativa: a escolhida, desde que o endereço ainda corresponda aos filtros dela. */
export function activeView(ctx, page, initialId = null) {
  if (initialId) writeActive(page, initialId);
  const all = [...builtinViews(ctx, page), ...prefs.readState().savedViews.filter((view) => view.page === page)];
  const query = prefs.cleanQuery(location.search, page);
  const chosen = all.find((view) => view.id === readActive(page));
  if (chosen && chosen.query === query) return chosen;
  return all.find((view) => view.query === query && !view.extra && !view.hiddenColumns?.length) || null;
}
export function activeExtra(ctx, page) { return activeView(ctx, page)?.extra || ''; }

export function installViewsBar(ctx, { page, anchor, onApply, currentHidden = () => [] }) {
  if (!anchor || anchor.parentElement?.querySelector('.views-bar')) return;
  const bar = el('nav', { class: 'views-bar', 'aria-label': 'Visões' });
  anchor.before(bar);

  const draw = () => {
    const current = activeView(ctx, page);
    const saved = prefs.readState().savedViews.filter((view) => view.page === page);
    const tab = (view, { user = false } = {}) => {
      const active = current?.id === view.id;
      const node = el('button', { type: 'button', class: `view-tab${user ? ' is-user' : ''}`, 'aria-pressed': String(active), dataset: { view: view.id } }, [
        user && view.pinned ? icon('pin', { size: 12 }) : null, el('span', { text: view.name })]);
      node.addEventListener('click', () => apply(view));
      return node;
    };
    const create = el('button', { type: 'button', class: 'view-tab view-new', id: 'save-view' }, [icon('plus', { size: 13 }), el('span', { text: 'Nova visão' })]);
    create.addEventListener('click', () => nameDialog({ title: 'Nova visão', hint: page === 'rfqs' ? 'Guarda a busca, os filtros, a ordenação e as colunas atuais.' : 'Guarda o filtro atual da lista de contratos.' }, (name) => {
      saveCurrent(name);
      toast(`Visão “${name}” salva.`);
    }));
    const items = [...builtinViews(ctx, page).map((view) => tab(view)), saved.length ? el('span', { class: 'views-sep', 'aria-hidden': 'true' }) : null, ...saved.map((view) => tab(view, { user: true })), create];
    const userActive = current && saved.find((view) => view.id === current.id);
    if (userActive) items.push(manageMenu(userActive));
    bar.replaceChildren(el('div', { class: 'views-scroll' }, items.filter(Boolean)));
  };

  function saveCurrent(name) {
    const query = prefs.cleanQuery(location.search, page);
    const id = prefs.saveView({ name, page, query, extra: activeExtra(ctx, page), hiddenColumns: currentHidden() });
    writeActive(page, id);
    draw();
  }
  function apply(view) {
    writeActive(page, view.id);
    if (view.hiddenColumns?.length) prefs.setHiddenColumns(page, view.hiddenColumns);
    onApply(view);
    if (bar.isConnected) draw();
  }
  function manageMenu(view) {
    const wrap = el('div', { class: 'dw-anchor' });
    const trigger = el('button', { type: 'button', class: 'icon-btn sm view-manage', id: 'view-manage', 'aria-label': `Gerenciar visão “${view.name}”`, title: 'Gerenciar visão' }, icon('more', { size: 16 }));
    const item = (label, iconName, run, danger = false) => {
      const node = el('button', { type: 'button', role: 'menuitem', class: `dw-menu-item${danger ? ' is-danger' : ''}` }, [icon(iconName, { size: 16 }), el('span', { class: 'dw-menu-label', text: label })]);
      node.addEventListener('click', () => { menu.hide({ restore: false }); run(); });
      return node;
    };
    const panel = el('div', { class: 'dw-menu dw-menu-sm', 'aria-label': `Visão ${view.name}` }, [
      item('Renomear…', 'edit', () => nameDialog({ title: 'Renomear visão', value: view.name }, (name) => { prefs.editView(view.id, { name }); draw(); toast('Visão renomeada.', 'info'); })),
      item('Atualizar com os filtros atuais', 'refresh', () => { prefs.editView(view.id, { query: location.search, extra: view.extra, hiddenColumns: currentHidden() }); draw(); toast('Visão atualizada.', 'info'); }),
      item(view.pinned ? 'Desafixar da barra lateral' : 'Fixar na barra lateral', 'pin', () => { prefs.toggleViewPin(view.id); draw(); toast(view.pinned ? 'Visão removida da barra lateral.' : 'Visão fixada na barra lateral.', 'info'); }),
      el('hr', { class: 'dw-menu-sep' }),
      item('Excluir visão', 'x', () => {
        const views = prefs.readState().savedViews;
        const index = views.findIndex((entry) => entry.id === view.id);
        prefs.removeView(view.id);
        writeActive(page, '');
        draw();
        const undo = button('Desfazer', { size: 'sm', onClick: () => { prefs.restoreView(view, index); writeActive(page, view.id); draw(); undo.closest('.toast')?.remove(); } });
        toast(`Visão “${view.name}” excluída.`, 'info', { action: undo });
      }, true)
    ]);
    const menu = popover({ trigger, panel, role: 'menu' });
    wrap.append(trigger, panel);
    return wrap;
  }
  // Filtros mudam o endereço; a barra acompanha (e a visão deixa de estar ativa se divergir).
  const page$ = anchor.closest('.list-page, .stack') || anchor.parentElement;
  for (const control of page$.querySelectorAll('.toolbar input, .toolbar select')) control.addEventListener(control.type === 'search' ? 'input' : 'change', () => setTimeout(draw, 0));
  for (const chip of page$.querySelectorAll('.toolbar-chips .chip')) chip.addEventListener('click', () => setTimeout(draw, 0));
  prefs.subscribe(() => { if (bar.isConnected) draw(); });
  draw();
  return { redraw: draw };
}

export function nameDialog({ title, value = '', hint = null }, onSave) {
  const opener = document.activeElement;
  const dialog = el('dialog', { class: 'dialog', 'aria-labelledby': 'view-dialog-title' });
  const input = el('input', { id: 'view-name', maxlength: '60', required: true, autocomplete: 'off', value, placeholder: 'Ex.: Crédito acima de R$ 1 milhão' });
  const error = el('p', { class: 'field-error', id: 'view-name-error', hidden: true, text: 'Dê um nome curto à visão.' });
  input.setAttribute('aria-describedby', 'view-name-error');
  const form = el('form', { method: 'dialog', class: 'dialog-body' }, [
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nome da visão' }), input]), error,
    hint ? el('p', { class: 'muted small', text: `${hint} Fica só neste navegador.` }) : null,
    el('div', { class: 'dialog-actions' }, [button('Cancelar', { variant: 'ghost', onClick: () => dialog.close() }), button('Salvar', { variant: 'primary', type: 'submit', iconName: 'check' })])
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (name.length < 2) { error.hidden = false; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    dialog.close();
    onSave(name);
  });
  dialog.append(el('div', { class: 'dialog-head' }, [el('h2', { class: 'dialog-title', id: 'view-dialog-title', text: title })]), form);
  dialog.addEventListener('close', () => { opener?.focus?.(); setTimeout(() => dialog.remove(), 0); });
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
  input.select();
}

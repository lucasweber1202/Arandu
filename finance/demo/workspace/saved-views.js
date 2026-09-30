// Visualizações de Solicitações: sugeridas (derivadas do papel de quem usa) e
// salvas pela pessoa (filtros atuais com um nome). Uma visualização é só um
// conjunto de filtros da própria lista — busca, status, produto, responsável
// e ordenação — guardado neste navegador.

import { el, icon } from '../../src/core.js';
import { button, toast } from '../../src/ui.js';
import { readState, saveView, removeView, restoreView, toggleViewPin, cleanQuery } from './preferences.js';
import { popover } from './popover.js';

export function suggestedViews(ctx) {
  const views = [
    ctx.viewer?.id && (ctx.data.rfqs || []).some((rfq) => rfq.owner_id === ctx.viewer.id) ? { id: 'mine', name: 'Minhas solicitações', query: `owner=${ctx.viewer.id}` } : null,
    { id: 'waiting-provider', name: 'Aguardando provedor', query: 'status=collecting' },
    { id: 'comparing', name: 'Em comparação', query: 'status=comparing' },
    { id: 'drafts', name: 'Rascunhos', query: 'status=draft' },
    { id: 'recent', name: 'Atualizadas recentemente', query: 'sort=recent' }
  ].filter(Boolean);
  return views.map((view) => ({ ...view, query: cleanQuery(view.query) }));
}

const currentQuery = () => cleanQuery(location.search);

/** Barra de visualizações acima dos filtros da lista de solicitações. */
export function installViewsBar(ctx, { apply }) {
  const page = document.querySelector('#view .list-page');
  const toolbar = page?.querySelector('.toolbar');
  if (!page || !toolbar || page.querySelector('.views-bar')) return;
  const bar = el('div', { class: 'views-bar' });
  const trigger = el('button', { type: 'button', class: 'btn btn-sm views-trigger', id: 'views-trigger' }, [icon('bookmark', { size: 14 }), el('span', { class: 'views-current', text: 'Visualizações' }), icon('chevronDown', { size: 14 })]);
  const panel = el('div', { class: 'dw-menu views-menu' });
  const save = button('Salvar visualização', { variant: 'ghost', size: 'sm', iconName: 'plus', attrs: { id: 'save-view' } });
  bar.append(trigger, panel, save);
  toolbar.before(bar);
  const menu = popover({ trigger, panel, role: 'menu', onOpen: () => drawMenu() });

  function label() {
    const query = currentQuery();
    const all = [...readState().savedViews, ...suggestedViews(ctx)];
    const match = query ? all.find((view) => view.query === query) : null;
    trigger.querySelector('.views-current').textContent = match ? match.name : query ? 'Filtros personalizados' : 'Todas as solicitações';
    save.hidden = !query || Boolean(readState().savedViews.find((view) => view.query === query));
  }
  function item(view, { removable = false } = {}) {
    const active = view.query === currentQuery();
    const entry = el('button', { type: 'button', role: 'menuitemradio', class: 'dw-menu-item', 'aria-checked': String(active) }, [
      icon(active ? 'check' : 'bookmark', { size: 14 }), el('span', { class: 'dw-menu-label', text: view.name }), view.pinned ? el('span', { class: 'dw-menu-hint', text: 'fixada' }) : null
    ]);
    entry.addEventListener('click', () => { menu.hide({ restore: false }); apply(view.query); });
    if (!removable) return entry;
    const pin = el('button', { type: 'button', role: 'menuitemcheckbox', class: 'dw-menu-icon', 'aria-checked': String(view.pinned), 'aria-label': `${view.pinned ? 'Desafixar' : 'Fixar'} “${view.name}” na barra lateral`, title: view.pinned ? 'Desafixar da barra lateral' : 'Fixar na barra lateral' }, icon('pin', { size: 14 }));
    pin.addEventListener('click', (event) => { event.stopPropagation(); toggleViewPin(view.id); drawMenu(); pin.focus?.(); });
    const remove = el('button', { type: 'button', role: 'menuitem', class: 'dw-menu-icon is-danger', 'aria-label': `Excluir visualização “${view.name}”`, title: 'Excluir visualização' }, icon('x', { size: 14 }));
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      const views = readState().savedViews;
      const index = views.findIndex((entryView) => entryView.id === view.id);
      removeView(view.id);
      menu.hide();
      label();
      const undo = button('Desfazer', { size: 'sm', onClick: () => { restoreView(view, index); label(); undo.closest('.toast')?.remove(); } });
      toast(`Visualização “${view.name}” excluída.`, 'info', { action: undo });
    });
    return el('div', { class: 'dw-menu-row' }, [entry, pin, remove]);
  }
  function drawMenu() {
    const saved = readState().savedViews;
    panel.replaceChildren(
      el('p', { class: 'dw-menu-group', text: 'Sugeridas', 'aria-hidden': 'true' }),
      item({ id: 'all', name: 'Todas as solicitações', query: '' }),
      ...suggestedViews(ctx).map((view) => item(view)),
      el('p', { class: 'dw-menu-group', text: 'Minhas visualizações', 'aria-hidden': 'true' }),
      ...(saved.length ? saved.map((view) => item(view, { removable: true })) : [el('p', { class: 'dw-menu-empty', text: 'Filtre a lista e use “Salvar visualização”.' })])
    );
  }
  save.addEventListener('click', () => nameDialog((name) => {
    saveView(name, currentQuery());
    label();
    toast(`Visualização “${name}” salva. Ela aparece no menu Visualizações.`);
  }));
  // A lista atualiza o endereço a cada filtro; o rótulo acompanha.
  for (const control of page.querySelectorAll('.toolbar input, .toolbar select')) control.addEventListener(control.type === 'search' ? 'input' : 'change', () => setTimeout(label, 0));
  for (const chip of page.querySelectorAll('.toolbar-chips .chip')) chip.addEventListener('click', () => setTimeout(label, 0));
  page.querySelector('.empty .btn')?.addEventListener('click', () => setTimeout(label, 0));
  label();
}

function nameDialog(onSave) {
  const opener = document.activeElement;
  const dialog = el('dialog', { class: 'dialog', 'aria-labelledby': 'view-dialog-title' });
  const input = el('input', { id: 'view-name', maxlength: '60', required: true, autocomplete: 'off', placeholder: 'Ex.: Crédito acima de R$ 1 milhão' });
  const error = el('p', { class: 'field-error', id: 'view-name-error', hidden: true, text: 'Dê um nome curto à visualização.' });
  input.setAttribute('aria-describedby', 'view-name-error');
  const form = el('form', { method: 'dialog', class: 'dialog-body' }, [
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nome da visualização' }), input]), error,
    el('p', { class: 'muted small', text: 'Guarda a busca, os filtros e a ordenação atuais. Fica só neste navegador.' }),
    el('div', { class: 'dialog-actions' }, [button('Cancelar', { variant: 'ghost', onClick: () => dialog.close() }), button('Salvar', { variant: 'primary', type: 'submit', iconName: 'check' })])
  ]);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (name.length < 2) { error.hidden = false; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    dialog.close();
    onSave(name);
  });
  dialog.append(el('div', { class: 'dialog-head' }, [el('h2', { class: 'dialog-title', id: 'view-dialog-title', text: 'Salvar visualização' })]), form);
  dialog.addEventListener('close', () => { opener?.focus?.(); setTimeout(() => dialog.remove(), 0); });
  document.body.append(dialog);
  dialog.showModal();
  input.focus();
}

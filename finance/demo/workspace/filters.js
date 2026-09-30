// Filtros como frase: [Status: Em avaliação] [Produto: Crédito] [Responsável: Marina]
//
// Uma linguagem só para filtrar, em vez de selects, chips e botões soltos. Cada
// filtro é um botão "Rótulo: valor" que abre um menu de opções; o filtro ativo
// ganha um × para limpar. Por baixo, os controles da lista do produto
// (views/rfqs.js) continuam donos da filtragem e do endereço: esta camada só
// escolhe o valor e dispara o mesmo evento que a pessoa dispararia.
//
// Descoberta progressiva das visões: filtrou → aparece "Salvar filtro" →
// nasce um filtro salvo pessoal → pode ser fixado na barra lateral depois.

import { el, icon } from '../../src/core.js';
import { toast } from '../../src/ui.js';
import { popover } from './popover.js';
import * as prefs from './preferences.js';
import { nameDialog } from './saved-views.js';

function tokenMenu({ key, label, options, current, onPick, clear }) {
  const wrap = el('div', { class: 'dw-anchor ft', dataset: { filter: key } });
  const active = current !== options[0][0];
  const valueLabel = (options.find(([value]) => value === current) || options[0])[1];
  const trigger = el('button', { type: 'button', class: `ft-token${active ? ' is-active' : ''}`, id: `filter-${key}`, 'aria-label': `${label}: ${valueLabel}. Alterar filtro` }, [
    el('span', { class: 'ft-label', text: `${label}:` }), el('span', { class: 'ft-value', text: valueLabel }), icon('chevronDown', { size: 12, className: 'ft-caret' })]);
  const panel = el('div', { class: 'dw-menu dw-menu-sm ft-menu', 'aria-label': label }, options.map(([value, text, count]) => {
    const item = el('button', { type: 'button', role: 'menuitemradio', class: 'dw-menu-item', 'aria-checked': String(value === current), dataset: { value } }, [
      el('span', { class: 'dw-menu-label', text }), count !== undefined ? el('span', { class: 'dw-menu-count num', text: String(count) }) : null,
      value === current ? icon('check', { size: 14, className: 'dw-menu-check' }) : null]);
    item.addEventListener('click', () => { menu.hide(); onPick(value, text); });
    return item;
  }));
  const menu = popover({ trigger, panel, role: 'menu' });
  wrap.append(trigger, panel);
  if (active && clear) {
    wrap.append(el('button', { type: 'button', class: 'ft-clear', 'aria-label': `Limpar filtro ${label}`, title: 'Limpar', onclick: () => clear() }, icon('x', { size: 12 })));
  }
  return wrap;
}

/**
 * Transforma a barra da lista de solicitações. `onSaved` redesenha as visões.
 * Devolve `{ redraw }`.
 */
export function installFilterBar(ctx, { page = 'rfqs', announce, onSaved = null, activeViewId = () => null }) {
  const root = document.querySelector('#view .list-page');
  const toolbar = root?.querySelector('.toolbar');
  if (!toolbar || toolbar.dataset.ft) return null;
  toolbar.dataset.ft = '1';
  const rfqs = ctx.data.rfqs || [];
  const search = toolbar.querySelector('input[type=search]');
  const product = toolbar.querySelector('select[aria-label="Filtrar por produto"]');
  const owner = toolbar.querySelector('select[aria-label="Filtrar por responsável"]');
  const sort = toolbar.querySelector('select[aria-label="Ordenar solicitações"]');
  const chips = root.querySelector('.toolbar-chips');
  const statusButtons = () => [...(chips?.querySelectorAll('.chip') || [])];
  // Os controles originais continuam no DOM (e no endereço), só não aparecem.
  for (const control of [product, owner, sort]) if (control) control.classList.add('ft-native');
  if (chips) chips.hidden = true;

  const tokens = el('div', { class: 'ft-bar', role: 'group', 'aria-label': 'Filtros' });
  const save = el('button', { type: 'button', class: 'btn btn-ghost btn-sm ft-save', id: 'save-filter', hidden: true }, [icon('bookmark', { size: 14 }), el('span', { class: 'btn-label', text: 'Salvar filtro' })]);
  const reset = el('button', { type: 'button', class: 'btn btn-ghost btn-sm ft-reset', id: 'reset-filters', hidden: true }, el('span', { class: 'btn-label', text: 'Limpar' }));
  toolbar.querySelector('.toolbar-search')?.after(tokens);
  toolbar.querySelector('.result-count')?.before(reset, save);

  const setSelect = (select, value) => { if (!select) return; select.value = value; select.dispatchEvent(new Event('change')); };
  const currentStatus = () => statusButtons().find((node) => node.getAttribute('aria-pressed') === 'true')?.dataset.status || '';
  const pickStatus = (value) => statusButtons().find((node) => node.dataset.status === value)?.click();
  const after = (text) => { draw(); announce?.(text); };

  function draw() {
    const statusOptions = statusButtons().map((node) => [node.dataset.status, node.dataset.status ? node.querySelector('span')?.textContent : 'Todos', Number(node.querySelector('.chip-count')?.textContent)]);
    const list = [
      statusOptions.length ? tokenMenu({ key: 'status', label: 'Status', options: statusOptions, current: currentStatus(), onPick: (value, text) => { pickStatus(value); after(`Status: ${text}.`); }, clear: () => { pickStatus(''); after('Filtro de status limpo.'); } }) : null,
      product ? tokenMenu({ key: 'product', label: 'Produto', options: [...product.options].map((option) => [option.value, option.value ? option.text : 'Todos']), current: product.value, onPick: (value, text) => { setSelect(product, value); after(`Produto: ${text}.`); }, clear: () => { setSelect(product, ''); after('Filtro de produto limpo.'); } }) : null,
      owner ? tokenMenu({ key: 'owner', label: 'Responsável', options: [...owner.options].map((option) => [option.value, option.value ? option.text : 'Qualquer']), current: owner.value, onPick: (value, text) => { setSelect(owner, value); after(`Responsável: ${text}.`); }, clear: () => { setSelect(owner, ''); after('Filtro de responsável limpo.'); } }) : null,
      sort ? tokenMenu({ key: 'sort', label: 'Ordenar', options: [...sort.options].map((option) => [option.value, option.text]), current: sort.value, onPick: (value, text) => { setSelect(sort, value); after(`Ordenado por ${text.toLowerCase()}.`); } }) : null
    ].filter(Boolean);
    tokens.replaceChildren(...list);
    const filtered = Boolean(currentStatus() || product?.value || owner?.value || search?.value.trim());
    reset.hidden = !filtered;
    // "Salvar filtro" só quando há filtro e ele ainda não é uma visão existente.
    const query = prefs.cleanQuery(location.search, page);
    const known = prefs.readState().savedViews.some((view) => view.page === page && view.query === query && !view.extra);
    save.hidden = !filtered || known || Boolean(activeViewId());
  }
  reset.addEventListener('click', () => {
    if (search) { search.value = ''; search.dispatchEvent(new Event('input')); }
    setSelect(product, ''); setSelect(owner, ''); pickStatus('');
    after('Filtros limpos.');
    search?.focus();
  });
  save.addEventListener('click', () => nameDialog({ title: 'Salvar filtro', label: 'Nome do filtro', hint: 'Guarda a busca, os filtros, a ordenação e as colunas atuais.' }, (name) => {
    const id = prefs.saveView({ name, page, query: location.search, extra: '', hiddenColumns: prefs.hiddenColumns(page) });
    onSaved?.(id);
    draw();
    toast(`Filtro “${name}” salvo. Fixe-o na barra lateral pelo menu ••• dele.`);
  }));
  search?.addEventListener('input', () => setTimeout(draw, 0));
  draw();
  return { redraw: draw };
}

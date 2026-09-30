// Tabela de solicitações na demonstração: densa, legível e configurável.
//
// * colunas visíveis por pessoa (e por visão salva);
// * ordenação pelo próprio cabeçalho (usa a mesma ordenação da lista);
// * ações da linha no hover ou no foco — ☆  Ver resumo  ••• — sem uma coluna
//   "Ações" permanente;
// * filtros extras das visões (Urgentes, Aguardando resposta) aplicados sobre
//   o que a lista do produto já filtrou.
// A lista do produto (views/rfqs.js) continua dona de dados e filtros.

import { el, icon, daysUntil } from '../../src/core.js';
import * as prefs from './preferences.js';
import { popover, contextMenu } from './popover.js';
import { openQuickView, copyLink } from './quick-view.js';
import { starButton } from './rfq-page.js';
import { rfqNext } from './next-action.js';
import { stateLabel, nextInline } from './work-ui.js';
import { workContext } from './quick-view.js';

export const RFQ_COLUMNS = [
  { key: 'solicitacao', label: 'Solicitação', fixed: true, sort: 'recent' },
  { key: 'status', label: 'Status' },
  { key: 'responsavel', label: 'Responsável' },
  { key: 'prazo', label: 'Prazo', sort: 'deadline' },
  { key: 'respostas', label: 'Respostas', sort: 'responses', numeric: true },
  { key: 'proxima', label: 'Próxima ação' }
];

const EXTRA_FILTERS = {
  urgent: (rfq) => ['open', 'collecting'].includes(rfq.status) && daysUntil(rfq.response_deadline) !== null && daysUntil(rfq.response_deadline) <= 7,
  waiting: (rfq) => ['open', 'collecting'].includes(rfq.status)
};

export function enhanceRfqTable(ctx, { extra = '', announce }) {
  const table = document.querySelector('#view table.rfq-table');
  const tbody = table?.querySelector('tbody');
  const count = document.querySelector('#view .result-count');
  if (!table || !tbody || table.dataset.dw) return;
  table.dataset.dw = '1';
  const quick = prefs.readState().behavior.rfqClick === 'quick';
  const sortSelect = document.querySelector('#view select[aria-label="Ordenar solicitações"]');
  const headers = [...table.querySelectorAll('thead th')];

  // Cabeçalhos ordenáveis.
  headers.forEach((th, index) => {
    const column = RFQ_COLUMNS[index];
    if (!column) return;
    th.dataset.col = column.key;
    if (column.numeric) th.classList.add('is-num');
    if (!column.sort || !sortSelect) return;
    const trigger = el('button', { type: 'button', class: 'th-sort', title: `Ordenar por ${column.label.toLowerCase()}` }, [el('span', { text: column.label }), icon('chevronDown', { size: 12, className: 'th-sort-icon' })]);
    trigger.addEventListener('click', () => {
      sortSelect.value = column.sort;
      sortSelect.dispatchEvent(new Event('change'));
      syncSort();
      announce?.(`Ordenado por ${column.label.toLowerCase()}.`);
    });
    th.replaceChildren(trigger);
  });
  const syncSort = () => headers.forEach((th, index) => {
    const column = RFQ_COLUMNS[index];
    if (column?.sort) th.setAttribute('aria-sort', sortSelect?.value === column.sort ? (column.sort === 'deadline' ? 'ascending' : 'descending') : 'none');
  });
  syncSort();

  // Colunas visíveis.
  const applyColumns = () => {
    const hidden = new Set(prefs.hiddenColumns('rfqs'));
    for (const row of table.querySelectorAll('tr')) [...row.children].forEach((cell, index) => { const column = RFQ_COLUMNS[index]; if (column) cell.hidden = !column.fixed && hidden.has(column.key); });
  };
  const toolbar = document.querySelector('#view .toolbar');
  if (toolbar && !toolbar.querySelector('#columns-trigger')) {
    const trigger = el('button', { type: 'button', class: 'btn btn-sm', id: 'columns-trigger' }, [icon('layout'), el('span', { class: 'btn-label', text: 'Colunas' })]);
    const panel = el('div', { class: 'dw-panel cmp-panel', 'aria-label': 'Colunas visíveis' }, [el('p', { class: 'cmp-panel-title', text: 'Colunas visíveis' }),
      ...RFQ_COLUMNS.filter((column) => !column.fixed).map((column) => {
        const input = el('input', { type: 'checkbox', checked: !prefs.hiddenColumns('rfqs').includes(column.key) });
        input.addEventListener('change', () => {
          const hidden = new Set(prefs.hiddenColumns('rfqs'));
          if (input.checked) hidden.delete(column.key); else hidden.add(column.key);
          prefs.setHiddenColumns('rfqs', [...hidden]);
          applyColumns();
          announce?.(`Coluna ${column.label} ${input.checked ? 'exibida' : 'ocultada'}.`);
        });
        return el('label', { class: 'cmp-option' }, [input, el('span', { text: column.label })]);
      })]);
    popover({ trigger, panel, role: 'dialog' });
    toolbar.querySelector('.result-count')?.before(el('div', { class: 'dw-anchor' }, [trigger, panel]));
  }

  // Linhas: quick view, ações no hover e filtro extra da visão.
  const decorate = () => {
    const rows = [...tbody.querySelectorAll('tr[data-entity="rfq"]')];
    let shown = 0;
    for (const row of rows) {
      const rfq = (ctx.data.rfqs || []).find((item) => item.id === row.dataset.id);
      const link = row.querySelector('a.row-title');
      if (!rfq || !link) continue;
      const pass = !extra || EXTRA_FILTERS[extra]?.(rfq) !== false;
      row.hidden = !pass;
      if (pass) shown += 1;
      if (row.dataset.dw) continue;
      row.dataset.dw = '1';
      // Mesma gramática da fila e do detalhe: estado, próxima ação e motivo.
      const next = rfqNext(rfq, workContext(ctx));
      row.querySelector('td[data-label="Status"]')?.replaceChildren(stateLabel(next));
      row.querySelector('td.next-action')?.replaceChildren(nextInline(next));
      const responses = row.querySelector('td[data-label="Respostas"]');
      if (responses && next.compact) responses.append(el('span', { class: 'responses-compact num', text: next.compact }));
      if (quick) { link.dataset.quick = `rfq:${rfq.id}`; link.setAttribute('aria-describedby', 'quick-hint'); }
      const href = link.getAttribute('href');
      const actions = el('span', { class: 'row-actions-dw' }, [
        starButton('rfq', rfq.id, rfq.title),
        el('button', { type: 'button', class: 'row-peek-btn', onclick: (event) => { event.stopPropagation(); openQuickView(ctx, 'rfq', rfq.id); } }, [icon('eye', { size: 14 }), el('span', { text: 'Ver resumo' })]),
        contextMenu(`Mais ações: ${rfq.title}`, [
          { label: 'Abrir solicitação', icon: 'arrowRight', href },
          { label: 'Abrir em nova aba', icon: 'external', href, newTab: true },
          (rfq.proposals || []).length > 1 ? { label: 'Comparar propostas', icon: 'scale', href: `${href}#comparacao` } : null,
          { label: 'Copiar link', icon: 'copy', onClick: () => copyLink(href) }
        ], { el, icon })
      ]);
      row.querySelector('td.cell-primary')?.append(actions);
    }
    applyColumns();
    if (extra && count) count.textContent = `${shown} de ${(ctx.data.rfqs || []).length}`;
    table.hidden = rows.length > 0 && shown === 0 ? true : table.hidden;
    let empty = document.querySelector('#view .views-empty');
    if (extra && rows.length && !shown) {
      if (!empty) { empty = el('div', { class: 'empty empty-compact views-empty' }, [el('span', { class: 'empty-icon' }, icon('checkCircle', { size: 20 })), el('p', { class: 'empty-title', text: extra === 'urgent' ? 'Nenhuma solicitação com prazo nos próximos 7 dias' : 'Nenhuma solicitação aguardando resposta' }), el('p', { class: 'empty-text', text: 'Mude de visão ou ajuste os filtros para ver outras solicitações.' })]); table.after(empty); }
    } else empty?.remove();
  };
  new MutationObserver(decorate).observe(tbody, { childList: true });
  decorate();
  if (!document.getElementById('quick-hint')) document.body.append(el('p', { id: 'quick-hint', class: 'sr-only', text: 'Abre um resumo lateral. Use Ctrl ou ⌘ com clique para abrir a página completa.' }));
}

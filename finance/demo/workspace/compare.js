// Comparação como workspace próprio.
//
// Ao abrir a aba Comparação, a tela entra num modo de foco dedicado: barra
// lateral e cabeçalho da solicitação recolhem, a matriz ganha a largura toda
// e uma barra de ferramentas permite escolher quais propostas e quais grupos
// de critérios aparecem, destacar o que não foi informado e exportar.
//
// A matriz é a do produto (comparisonMatrix): mesmos valores, mesmos
// destaques factuais ("maior/menor valor informado"). Esta camada só mostra
// ou esconde colunas e linhas. Nunca cria vencedor, "melhor" ou recomendação.

import { el, icon } from '../../src/core.js';
import { button } from '../../src/ui.js';
import { popover } from './popover.js';
import { missingFields } from './assist.js';
import { announce } from './shell.js';

function setCompare(on) {
  document.documentElement.dataset.compare = on ? 'on' : 'off';
  document.dispatchEvent(new CustomEvent('dw:compare', { detail: { on } }));
}

function applyColumns(matrix, visible) {
  for (const row of matrix.querySelectorAll('tr')) {
    if (row.classList.contains('matrix-group')) continue;
    [...row.children].forEach((cell, index) => { if (index > 0) cell.hidden = !visible[index - 1]; });
  }
  const count = visible.filter(Boolean).length;
  for (const group of matrix.querySelectorAll('tr.matrix-group > th')) group.colSpan = count + 1;
}
function groupsOf(matrix) {
  const groups = [];
  let current = null;
  for (const row of matrix.querySelectorAll('tbody tr')) {
    if (row.classList.contains('matrix-group')) { current = { name: row.textContent.trim(), header: row, rows: [] }; groups.push(current); }
    else current?.rows.push(row);
  }
  return groups;
}

export function installCompare(ctx, rfq) {
  const tablist = document.querySelector('#view [role=tablist]');
  const panel = document.querySelector('#panel-comparacao');
  if (!tablist || !panel) return;
  const proposals = rfq.proposals || [];
  const wanted = (new URLSearchParams(location.search).get('comparar') || '').split(',').filter(Boolean);
  let visible = proposals.map((proposal) => !wanted.length || wanted.includes(proposal.id));
  if (!visible.some(Boolean)) visible = proposals.map(() => true);
  let built = false;

  const build = () => {
    const matrix = panel.querySelector('table.matrix');
    if (built || !matrix) return;
    built = true;
    const count = el('span', { class: 'cmp-count num' });
    const title = el('div', { class: 'cmp-title' }, [
      button('Voltar', { variant: 'ghost', size: 'sm', iconName: 'chevronLeft', attrs: { id: 'compare-back' }, onClick: () => document.querySelector('#tab-visao-geral')?.click() }),
      el('h2', { class: 'cmp-heading' }, [el('span', { class: 'cmp-rfq', text: rfq.title }), count])
    ]);
    // Propostas visíveis.
    const providerTrigger = button('Propostas', { size: 'sm', iconName: 'layers', attrs: { id: 'compare-providers' } });
    const providerLabel = providerTrigger.querySelector('.btn-label');
    const providerPanel = el('div', { class: 'dw-panel cmp-panel', 'aria-label': 'Propostas visíveis' }, [el('p', { class: 'cmp-panel-title', text: 'Mostrar propostas' }),
      ...proposals.map((proposal, index) => {
        const input = el('input', { type: 'checkbox', checked: visible[index] });
        input.addEventListener('change', () => {
          if (!input.checked && visible.filter(Boolean).length === 1) { input.checked = true; announce('Pelo menos uma proposta fica visível.'); return; }
          visible[index] = input.checked;
          sync();
        });
        return el('label', { class: 'cmp-option', 'data-popover-item': '' }, [input, el('span', { text: proposal.provider_name })]);
      })]);
    popover({ trigger: providerTrigger, panel: providerPanel, role: 'dialog' });
    // Grupos de critérios.
    const groups = groupsOf(matrix);
    const criteriaTrigger = button('Critérios', { size: 'sm', iconName: 'sliders', attrs: { id: 'compare-criteria' } });
    const criteriaPanel = el('div', { class: 'dw-panel cmp-panel', 'aria-label': 'Critérios visíveis' }, [el('p', { class: 'cmp-panel-title', text: 'Mostrar critérios' }),
      ...groups.map((group) => {
        const input = el('input', { type: 'checkbox', checked: true });
        input.addEventListener('change', () => { for (const row of [group.header, ...group.rows]) row.hidden = !input.checked; announce(`${group.name}: ${input.checked ? 'visível' : 'oculto'}.`); });
        return el('label', { class: 'cmp-option' }, [input, el('span', { text: group.name })]);
      })]);
    popover({ trigger: criteriaTrigger, panel: criteriaPanel, role: 'dialog' });
    // Não informados: destaque na matriz e lista factual.
    const scroll = panel.querySelector('.matrix-scroll');
    const missing = missingFields(rfq);
    const missingList = el('details', { class: 'cmp-missing', id: 'compare-missing' }, [
      el('summary', {}, [icon('search', { size: 14 }), el('span', { text: 'Campos não informados' }), el('span', { class: 'cmp-missing-note', text: 'Calculado a partir dos dados das propostas' })]),
      el('ul', { class: 'cmp-missing-list', role: 'list' }, missing.map(({ proposal, fields }) => el('li', {}, [el('strong', { text: proposal.provider_name }),
        el('span', { class: fields.length ? '' : 'muted', text: fields.length ? ` — ${fields.join(', ')}` : ' — todos os campos comparáveis informados' })])))
    ]);
    const highlight = el('button', { type: 'button', class: 'btn btn-sm cmp-toggle', 'aria-pressed': 'false', id: 'compare-missing-toggle' }, [icon('alert'), el('span', { class: 'btn-label', text: 'Destacar não informados' })]);
    highlight.addEventListener('click', () => {
      const on = highlight.getAttribute('aria-pressed') !== 'true';
      highlight.setAttribute('aria-pressed', String(on));
      scroll?.classList.toggle('is-missing-on', on);
      missingList.open = on;
    });
    const exportButton = button('Exportar', { variant: 'ghost', size: 'sm', iconName: 'download', onClick: () => panel.querySelector('#export-rfq')?.click() });
    const tools = el('div', { class: 'cmp-tools' }, [
      el('div', { class: 'dw-anchor' }, [providerTrigger, providerPanel]), el('div', { class: 'dw-anchor' }, [criteriaTrigger, criteriaPanel]), highlight, exportButton
    ]);
    const bar = el('div', { class: 'cmp-bar', role: 'toolbar', 'aria-label': 'Ferramentas da comparação' }, [title, tools]);
    panel.prepend(bar);
    scroll?.after(missingList);
    function sync() {
      applyColumns(matrix, visible);
      const shown = visible.filter(Boolean).length;
      count.textContent = `Comparando ${shown} de ${proposals.length} propostas`;
      providerLabel.textContent = `Propostas ${shown}/${proposals.length}`;
    }
    sync();
  };

  const onChange = () => {
    const selected = tablist.querySelector('[aria-selected="true"]')?.id === 'tab-comparacao';
    if (selected) build();
    setCompare(selected && proposals.length > 0);
  };
  new MutationObserver(onChange).observe(tablist, { attributes: true, subtree: true, attributeFilter: ['aria-selected'] });
  onChange();
}

export function leaveCompare() { if (document.documentElement.dataset.compare === 'on') setCompare(false); }

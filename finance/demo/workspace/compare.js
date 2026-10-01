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
//
// Workspace de decisão (rodada 2.0):
//   síntese factual   quantas propostas, completas, com ausências, revisão
//                     anterior e a validade que vence primeiro;
//   onde diferem      critérios com maior variação relativa entre valores
//                     informados — fato calculado, nunca preferência;
//   modos             Diferenças (padrão) · Todos os critérios · Campos ausentes;
//   estimativas       o que o Arandu calcula fica separado do que o provedor
//                     informou, com hipóteses, cálculo e o que não entra.

import { estimateCreditTotalCost, estimateAcquiringMonthlyCost } from '../../../lib/finance/products.mjs';
import { el, icon, money } from '../../src/core.js';
import { button } from '../../src/ui.js';
import { proposalFacts } from './next-action.js';
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

const cellText = (cell) => (cell.classList.contains('missing') ? '' : (cell.querySelector('span')?.textContent || '').trim());
const numberOf = (text) => {
  const clean = text.replace(/[R$\s.%]/g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  return clean && Number.isFinite(Number(clean)) ? Number(clean) : null;
};
/** Classifica cada linha da matriz: difere? tem ausência? variação relativa. */
export function rowFacts(matrix) {
  return [...matrix.querySelectorAll('tbody tr')].filter((row) => !row.classList.contains('matrix-group')).map((row) => {
    const cells = [...row.querySelectorAll('td')].filter((cell) => !cell.hidden);
    const values = cells.map(cellText);
    const present = values.filter(Boolean);
    const missing = values.length - present.length;
    const numbers = present.map(numberOf).filter((value) => value !== null);
    const spread = numbers.length >= 2 && numbers.length === present.length && Math.max(...numbers) !== 0
      ? (Math.max(...numbers) - Math.min(...numbers)) / Math.max(...numbers.map(Math.abs)) : new Set(present).size > 1 ? 0.25 : 0;
    return { row, label: row.querySelector('th .matrix-label span, th span')?.textContent?.replace(/\s*\(.*\)$/, '') || '', differs: new Set(present).size > 1, missing: missing > 0 && present.length > 0, spread };
  });
}

/** Síntese factual do topo: nada de vencedor, só contagens e datas. */
function synthesis(rfq, matrix) {
  const facts = proposalFacts(rfq);
  const items = [
    `${facts.total} proposta${facts.total === 1 ? '' : 's'}`,
    `${facts.complete} completa${facts.complete === 1 ? '' : 's'}`,
    facts.incomplete.length ? `${facts.incomplete.length} com campos ausentes` : null,
    facts.outdated.length ? `${facts.outdated.length} responde${facts.outdated.length === 1 ? '' : 'm'} à revisão anterior` : null,
    facts.nearestValidity ? `validade mais próxima: ${facts.nearestValidity.days === 0 ? 'hoje' : `${facts.nearestValidity.days} dia${facts.nearestValidity.days === 1 ? '' : 's'}`}` : null
  ].filter(Boolean);
  const top = rowFacts(matrix).filter((item) => item.differs && item.spread > 0 && !/^(Instituição|Produto ofertado|Observações|Validade|Condições precedentes)/.test(item.label))
    .sort((a, b) => b.spread - a.spread).slice(0, 4);
  return el('section', { class: 'cmp-synthesis', 'aria-label': 'Síntese factual da comparação' }, [
    el('ul', { class: 'cmp-facts', role: 'list' }, items.map((text, index) => el('li', { class: index > 1 && /ausentes/.test(text) ? 'is-warn' : '', text }))),
    top.length ? el('div', { class: 'cmp-diffs' }, [
      el('p', { class: 'cmp-diffs-title', text: 'Onde as propostas mais diferem' }),
      el('ul', { class: 'cmp-diff-list', role: 'list' }, top.map((item) => el('li', { class: 'cmp-diff', text: item.label }))),
      el('p', { class: 'cmp-diffs-note', text: 'Maior variação relativa entre os valores informados. É um fato calculado, não uma preferência.' })
    ]) : null
  ]);
}

/** Estimativas do Arandu: separadas do que o provedor informou, com hipóteses. */
function estimatesPanel(rfq, proposals) {
  const credit = rfq.product === 'credit';
  const notConsidered = credit
    ? ['IOF e demais tributos', 'seguros e custos de registro de garantia', 'juros no período de carência', 'variação de indexadores (CDI, IPCA)']
    : ['antecipação de recebíveis', 'tributos', 'custos de chargeback', 'multa de saída antecipada'];
  const rows = proposals.map((proposal) => {
    const result = credit ? estimateCreditTotalCost(proposal.terms || {}) : estimateAcquiringMonthlyCost(rfq.demand || {}, proposal.terms || {});
    const body = result.estimate
      ? [el('dl', { class: 'est-inputs' }, [
        el('div', {}, [el('dt', { text: 'Fórmula' }), el('dd', { class: 'mono', text: result.formula })]),
        el('div', {}, [el('dt', { text: 'Hipóteses' }), el('dd', { text: result.assumptions.join('; ') })]),
        credit ? el('div', {}, [el('dt', { text: 'Parcela estimada' }), el('dd', { class: 'num', text: money(result.installment) })]) : el('div', {}, [el('dt', { text: 'Variável + fixo' }), el('dd', { class: 'num', text: `${money(result.variable_cost)} + ${money(result.fixed_cost)}` })]),
        credit && result.declared_cet_year !== null ? el('div', {}, [el('dt', { text: 'CET informado pelo provedor' }), el('dd', { class: 'num', text: `${String(result.declared_cet_year).replace('.', ',')}% a.a.` })]) : null
      ].filter(Boolean))]
      : [el('p', { class: 'est-reason', text: result.reason })];
    return el('li', { class: 'est-row' }, el('details', {}, [
      el('summary', {}, [el('span', { class: 'est-name', text: proposal.provider_name }), el('span', { class: `est-value num${result.estimate ? '' : ' is-missing'}`, text: result.estimate ? `${money(result.total_cost)}${credit ? '' : '/mês'}` : 'Não calculável' }),
        el('span', { class: 'est-open', text: 'Ver cálculo' })]),
      ...body
    ]));
  });
  return el('section', { class: 'est', id: 'compare-estimates', 'aria-labelledby': 'est-title' }, [
    el('header', { class: 'est-head' }, [
      el('h3', { class: 'est-title', id: 'est-title', text: 'Calculado pelo Arandu com hipóteses' }),
      el('p', { class: 'est-sub', text: `${credit ? 'Custo total estimado' : 'Custo mensal estimado'} · não é CET e não substitui o custo informado pelo provedor. Valores acima, na matriz, são informados pelo provedor.` })
    ]),
    el('ul', { class: 'est-list', role: 'list' }, rows),
    el('p', { class: 'est-foot' }, [el('strong', { text: 'Não considerado: ' }), el('span', { text: `${notConsidered.join(', ')}.` })])
  ]);
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
    const hiddenGroups = new Set();
    // O que é estimativa do Arandu fica marcado (e sem ênfase de destaque).
    const estimateGroup = groups.find((group) => /^Estimativa do Arandu/.test(group.name));
    for (const row of estimateGroup ? [estimateGroup.header, ...estimateGroup.rows] : []) row.classList.add('is-estimate');
    let mode = 'diff';
    function applyRows() {
      const facts = new Map(rowFacts(matrix).map((item) => [item.row, item]));
      for (const group of groups) {
        let shown = 0;
        for (const row of group.rows) {
          const item = facts.get(row);
          const pass = !hiddenGroups.has(group.name) && (mode === 'all' || (mode === 'diff' && item?.differs) || (mode === 'missing' && item?.missing));
          row.hidden = !pass;
          if (pass) shown += 1;
        }
        group.header.hidden = !shown;
      }
      const visibleRows = [...facts.values()].filter((item) => !item.row.hidden).length;
      empty.hidden = visibleRows > 0;
      modeNote.textContent = mode === 'diff' ? `${visibleRows} de ${facts.size} critérios diferem entre as propostas` : mode === 'missing' ? `${visibleRows} critério${visibleRows === 1 ? '' : 's'} com algum campo não informado` : `${facts.size} critérios`;
    }
    const modeNote = el('span', { class: 'cmp-mode-note', role: 'status', 'aria-live': 'polite' });
    const empty = el('p', { class: 'cmp-empty', hidden: true, text: 'Nenhum critério neste modo com as propostas visíveis.' });
    const modes = el('div', { class: 'seg cmp-modes', role: 'group', 'aria-label': 'Modo da comparação' }, [['diff', 'Diferenças'], ['all', 'Todos os critérios'], ['missing', 'Campos ausentes']].map(([value, label]) => {
      const node = el('button', { type: 'button', class: 'seg-item', 'aria-pressed': String(value === mode), dataset: { mode: value }, text: label });
      node.addEventListener('click', () => {
        mode = value;
        for (const item of modes.children) item.setAttribute('aria-pressed', String(item.dataset.mode === mode));
        applyRows();
        announce(`Modo: ${label}.`);
      });
      return node;
    }));
    const criteriaTrigger = button('Critérios', { size: 'sm', iconName: 'sliders', attrs: { id: 'compare-criteria' } });
    const criteriaPanel = el('div', { class: 'dw-panel cmp-panel', 'aria-label': 'Critérios visíveis' }, [el('p', { class: 'cmp-panel-title', text: 'Mostrar critérios' }),
      ...groups.map((group) => {
        const input = el('input', { type: 'checkbox', checked: true });
        input.addEventListener('change', () => { if (input.checked) hiddenGroups.delete(group.name); else hiddenGroups.add(group.name); applyRows(); announce(`${group.name}: ${input.checked ? 'visível' : 'oculto'}.`); });
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
    bar.after(synthesis(rfq, matrix), el('div', { class: 'cmp-modebar' }, [modes, modeNote]));
    scroll?.after(empty, missingList, estimatesPanel(rfq, proposals));
    function sync() {
      applyColumns(matrix, visible);
      applyRows();
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

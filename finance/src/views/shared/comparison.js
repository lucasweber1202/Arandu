// Matriz de comparação e pesos definidos pelo comprador (motor canônico em lib/finance/comparison.mjs).
// Extraído de views/shared.js (v7.0): dependências específicas, sem barrel.

import { PRODUCTS } from '../../../../lib/finance/products.mjs';
import { buildComparison, applyUserWeights, USER_WEIGHTS_NOTICE } from '../../../../lib/finance/comparison.mjs';
import { el, icon, money, fieldValue, formatDateTime } from '../../core.js';
import { button, emptyState, errorState, field } from '../../ui.js';
import { DEFINITIONS, fieldsByKey, definitionTip } from './terms.js';

function comparisonValue(field, value, currency) {
  if (value === null || value === undefined) return null;
  return fieldValue(field, value, { currency });
}

function valueCell(field, value, best, currency = 'BRL') {
  const formatted = comparisonValue(field, value, currency);
  const cell = el('td', { class: `num${formatted === null ? ' missing' : ''}${best ? ' best' : ''}` });
  if (formatted === null) { cell.append(el('span', { class: 'missing-text', text: 'não informado' })); return cell; }
  cell.append(el('span', { text: formatted }));
  if (best) {
    const why = field.direction === 'lower_is_better' ? 'menor valor informado' : 'maior valor informado';
    cell.append(el('span', { class: 'best-mark', title: why }, [icon(field.direction === 'lower_is_better' ? 'chevronDown' : 'chevronUp', { size: 12 }), el('span', { class: 'best-why', text: why })]));
  }
  return cell;
}

export function comparisonMatrix(rfq, proposals, { currentRevision = rfq.revision, model = null } = {}) {
  const data = model || buildComparison(rfq.product, proposals, rfq.demand, { revision: currentRevision });
  const wrap = el('div', { class: 'comparison' });
  if (!data.columns.length) {
    wrap.append(emptyState({ title: 'Ainda não há propostas para comparar', text: 'Assim que os provedores convidados enviarem condições, elas aparecem lado a lado aqui.', iconName: 'scale' }));
    return wrap;
  }
  const byKey = fieldsByKey(rfq.product);
  const rowsByKey = Object.fromEntries(data.rows.map(row => [row.key, row]));
  const historical = new Set();
  wrap.append(el('p', { class: 'notice-line', id: 'comparison-notice', text: data.notice }));
  // Resumo factual antes da tabela: quantas condições diferem e quantas estão
  // pendentes. Contagem, não juízo; nenhuma proposta é chamada de melhor.
  {
    const comparable = data.rows.filter(row => fieldsByKey(rfq.product)[row.key]?.comparable);
    const differs = comparable.filter(row => row.differs).length;
    const pending = data.rows.filter(row => row.missing_count || row.invalid_count).length;
    wrap.append(el('ul', { class: 'comparison-summary', 'aria-label': 'Resumo da comparação' }, [
      el('li', {}, [el('strong', { text: String(data.columns.length) }), ` ${data.columns.length === 1 ? 'proposta' : 'propostas'} na versão atual`]),
      el('li', {}, [el('strong', { text: String(differs) }), ` de ${comparable.length} condições comparáveis com valores diferentes`]),
      el('li', {}, [el('strong', { text: String(pending) }), ` ${pending === 1 ? 'condição com informação pendente' : 'condições com informação pendente'}`]),
      data.context_notices.length ? el('li', {}, [el('strong', { text: String(data.context_notices.length) }), data.context_notices.length === 1 ? ' ressalva de comparabilidade' : ' ressalvas de comparabilidade']) : null
    ].filter(Boolean)));
  }
  if (data.context_notices.length) wrap.append(el('details', { class: 'callout callout-warning comparison-context', open: true }, [el('summary', { text: 'Condições que exigem revisão de comparabilidade' }), el('ul', {}, data.context_notices.map(text => el('li', { text }))) ]));
  // Limites técnicos do recorte ficam a um clique, não na primeira leitura.
  wrap.append(el('details', { class: 'comparison-about' }, [el('summary', { text: 'Como ler esta comparação' }),
    el('p', { class: 'muted small', text: 'Valores são os declarados por cada provedor, na versão indicada no cabeçalho. Campo não informado aparece como "não informado" e conta na cobertura; não é tratado como pior nem como zero. Ausência de evidência não significa verificação. Valores de versões anteriores são consulta histórica; os pesos usam a versão atual. Recorte: até 500 propostas enviadas e não retiradas; histórico de até 2.000 versões.' })]));
  const filter = el('select', { 'aria-label': 'Foco da comparação' }, [
    el('option', { value: 'all', text: 'Todas as condições' }), el('option', { value: 'differences', text: 'Somente diferenças' }),
    el('option', { value: 'missing', text: 'Informações pendentes' }), el('option', { value: 'changed', text: 'Alterações de versão' })
  ]);
  const detail = el('select', { 'aria-label': 'Detalhamento da comparação' }, [el('option', { value: 'detail', text: 'Visão detalhada' }), el('option', { value: 'summary', text: 'Visão resumida' })]);
  const controls = el('div', { class: 'comparison-controls' }, [
    el('label', { class: 'comparison-control' }, [el('span', { text: 'Mostrar' }), filter]),
    el('label', { class: 'comparison-control' }, [el('span', { text: 'Detalhe' }), detail])]);
  wrap.append(controls);
  const versions = el('div', { class: 'comparison-versions' });
  data.columns.forEach((column, index) => {
    const select = el('select', { 'aria-label': `Versão de ${column.provider_name}` }, el('option', { value: 'current', text: column.version ? `Versão ${column.version} · atual` : 'Versão não informada' }));
    if (column.previous_version) select.append(el('option', { value: 'previous', text: `Versão ${column.previous_version.version} · anterior` }));
    select.addEventListener('change', () => { select.value === 'previous' ? historical.add(index) : historical.delete(index); draw(); });
    versions.append(el('label', { class: 'comparison-version' }, [el('span', { text: column.provider_name }), select]));
  });
  wrap.append(versions);
  const wide = el('div', { class: 'matrix-scroll comparison-wide', tabindex: '0', role: 'region', 'aria-label': 'Tabela de comparação de propostas' });
  const mobile = el('div', { class: 'compare-mobile' });
  const pickA = el('select', { 'aria-label': 'Primeira proposta' });
  const pickB = el('select', { 'aria-label': 'Segunda proposta' });
  data.columns.forEach((column, index) => { pickA.add(new Option(column.provider_name, String(index))); pickB.add(new Option(column.provider_name, String(index))); });
  pickB.value = String(Math.min(1, data.columns.length - 1));
  const pairBody = el('div', { class: 'pair-body' });
  const pairStatus = el('div', { class: 'comparison-versions' });
  mobile.append(el('div', { class: 'pair-pickers' }, [pickA, pickB]), pairStatus, pairBody);
  wrap.append(wide, mobile);
  const visible = row => {
    if (detail.value === 'summary' && !byKey[row.key].comparable && !['index', 'amortization', 'collateral_required'].includes(row.key)) return false;
    return filter.value === 'all' || (filter.value === 'differences' && row.differs) ||
      (filter.value === 'missing' && (row.missing_count || row.invalid_count)) ||
      (filter.value === 'changed' && data.columns.some(column => column.changed_keys.includes(row.key)));
  };
  const value = (row, index) => historical.has(index) ? row.previous_values[index] : row.values[index];
  const state = (row, index) => historical.has(index) ? row.previous_states[index] : row.states[index];
  // Cobertura das condições comparáveis na versão exibida: o que falta fica
  // visível no cabeçalho, sem rebaixar a proposta.
  const comparableRows = data.rows.filter(row => byKey[row.key]?.comparable);
  const coverageText = index => `${comparableRows.filter(row => state(row, index) === 'present').length} de ${comparableRows.length} condições comparáveis informadas`;
  // Condição que mudou na versão atual: marcada na própria célula, com o valor
  // anterior, para a mudança não depender do filtro "Alterações de versão".
  const changedMark = (row, index) => {
    const column = data.columns[index];
    if (historical.has(index) || !column.changed_keys.includes(row.key)) return null;
    const before = row.previous_states[index] === 'invalid' ? 'dado inválido' : comparisonValue(byKey[row.key], row.previous_values[index], column.currency) ?? 'não informado';
    return el('span', { class: 'changed-mark', text: `Alterado na v${column.version} · antes: ${before}` });
  };
  const evidence = (row, index) => {
    const column = data.columns[index];
    const version = historical.has(index) ? column.previous_version : column.provenance;
    return el('details', { class: 'comparison-evidence' }, [el('summary', { text: 'Origem e contexto' }),
      el('p', { text: version?.source === 'buyer_recorded_external'
        ? `Origem: transcrição registrada pela empresa a partir de material externo (não é envio da instituição). Versão: ${version.version ?? 'não informada'}. Registro: ${version.recorded_at ? formatDateTime(version.recorded_at) : 'não informado'}. Recebimento: ${version.received_at ? formatDateTime(version.received_at) : 'não informado'}. Conferência: correspondência da transcrição${version.reviewed_at ? ` em ${formatDateTime(version.reviewed_at)}` : ''}; não é validação nem aceite da instituição. Documento: ${version.document ? (version.document.availability === 'metadata_available' ? 'documento interno vinculado' : 'documento vinculado indisponível') : 'nenhum'}.`
        : `Origem: ${version?.submitted_at ? 'proposta enviada pelo provedor' : 'não disponível'}. Versão: ${version?.version ?? 'não informada'}. Envio: ${version?.submitted_at ? new Date(version.submitted_at).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }) : 'não informado'}. Autor: não disponível. Verificação: não verificado. Documento: sem vínculo de evidência por campo.` }),
      el('p', { text: `Metodologia: condição declarada; sem cálculo pelo Arandu. ${DEFINITIONS[row.key] || ''}` }),
      ...row.context_reasons.map(text => el('p', { text })),
      !historical.has(index) && column.changed_keys.includes(row.key) ? el('p', { text: `Versão anterior: ${comparisonValue(byKey[row.key], row.previous_values[index], column.currency) ?? 'não informado'}.` }) : null
    ].filter(Boolean));
  };
  function draw() {
    const table = el('table', { class: 'matrix' });
    const head = el('tr', {}, el('th', { scope: 'col', class: 'matrix-corner', text: 'Condição' }));
    data.columns.forEach((column, index) => {
      head.append(el('th', { scope: 'col', class: 'matrix-provider' }, [el('span', { class: 'matrix-name', text: column.provider_name }),
        el('span', { class: 'matrix-meta', text: `${historical.has(index) ? 'Consulta da versão anterior' : `v${column.version ?? '?'}`} · ${column.currency ?? 'moeda não identificada'}${column.currency_source === 'schema_brl_v1' ? ' (unidade do cadastro)' : ''}` }),
        el('span', { class: 'matrix-meta', text: coverageText(index) }),
        column.provenance?.source === 'buyer_recorded_external' ? el('span', { class: 'matrix-flag matrix-external', text: 'Fonte externa · transcrita pela empresa · fora da decisão' }) : null,
        !historical.has(index) && column.changed_keys.length && column.previous_version ? el('span', { class: 'matrix-flag', text: `${column.changed_keys.length} ${column.changed_keys.length === 1 ? 'condição mudou' : 'condições mudaram'} desde a v${column.previous_version.version}` }) : null,
        column.revision_mismatch ? el('span', { class: 'matrix-flag', text: `Respondeu à revisão ${column.rfq_revision}` }) : null,
        column.expired ? el('span', { class: 'matrix-flag', text: 'Proposta vencida' }) : null,
        column.validity_unknown ? el('span', { class: 'matrix-meta', text: 'Validade não informada' }) : null,
        column.version > 1 && !column.history_available ? el('span', { class: 'matrix-meta', text: 'Versão anterior não disponível no recorte' }) : null
      ].filter(Boolean)));
    });
    table.append(el('thead', {}, head));
    const body = el('tbody');
    pairBody.replaceChildren();
    let count = 0;
    const chosen = [Number(pickA.value), Number(pickB.value)];
    pairStatus.replaceChildren(...chosen.map(index => { const column = data.columns[index]; return el('p', { class: 'muted small', text: `${column.provider_name} · ${historical.has(index) ? 'versão anterior' : `v${column.version ?? '?'}`} · ${column.currency ?? 'moeda não identificada'} · ${coverageText(index)} · ${column.expired ? 'versão atual vencida' : column.validity_unknown ? 'validade não informada' : 'consulte a validade informada'}${column.revision_mismatch ? ` · respondeu à revisão ${column.rfq_revision}` : ''}` }); }));
    for (const [group, keys] of data.groups) {
      const rows = keys.map(key => rowsByKey[key]).filter(row => row && visible(row));
      if (!rows.length) continue;
      count += rows.length;
      body.append(el('tr', { class: 'matrix-group' }, el('th', { scope: 'rowgroup', colspan: String(data.columns.length + 1), text: group })));
      const section = el('section', { class: 'pair-group' }, el('h4', { class: 'pair-title', text: group }));
      for (const row of rows) {
        const field = byKey[row.key];
        const label = el('th', { scope: 'row', class: 'matrix-label' }, [el('span', { text: field.type === 'money' ? row.label.replace('(R$)', '(moeda da coluna)') : row.label }), definitionTip(row.key),
          row.context_reasons.length ? el('span', { class: 'matrix-meta', text: 'Bases incompatíveis' }) : null]);
        const tr = el('tr', { 'data-condition': row.key }, label);
        data.columns.forEach((column, index) => {
          const best = !historical.size && row.highlights.includes(column.id);
          const cell = valueCell(field, value(row, index), best, column.currency);
          if (state(row, index) === 'invalid') cell.querySelector('.missing-text').textContent = 'dado inválido; requer revisão';
          const changed = changedMark(row, index);
          if (changed) { cell.classList.add('changed'); cell.append(changed); }
          cell.append(evidence(row, index));
          tr.append(cell);
        });
        body.append(tr);
        section.append(el('div', { class: 'pair-row', 'data-condition': row.key }, [el('span', { class: 'pair-label', text: field.type === 'money' ? row.label.replace('(R$)', '(moeda da coluna)') : row.label }), ...chosen.map(index => el('div', { class: `pair-value${!historical.size && row.highlights.includes(data.columns[index].id) ? ' best' : ''}` }, [el('span', { text: state(row, index) === 'invalid' ? 'dado inválido; requer revisão' : comparisonValue(field, value(row, index), data.columns[index].currency) ?? 'não informado' }), changedMark(row, index), evidence(row, index)].filter(Boolean)))]));
      }
      pairBody.append(section);
    }
    if (!count) { body.append(el('tr', {}, el('td', { colspan: String(data.columns.length + 1), text: 'Nenhuma condição neste filtro.' }))); pairBody.append(el('p', { text: 'Nenhuma condição neste filtro.' })); }
    if (filter.value === 'all' && !historical.size) {
      body.append(el('tr', { class: 'matrix-group' }, el('th', { scope: 'rowgroup', colspan: String(data.columns.length + 1), text: 'Estimativa do Arandu (não é CET)' })));
      const tr = el('tr', {}, el('th', { scope: 'row', text: rfq.product === 'credit' ? 'Custo total estimado' : 'Custo mensal estimado' }));
      data.columns.forEach(column => {
        const estimate = data.estimates[column.id];
        tr.append(el('td', { class: 'num' }, [el('span', { text: estimate.estimate ? money(estimate.total_cost) : estimate.reason }),
          estimate.estimate ? el('details', { class: 'comparison-evidence' }, [el('summary', { text: 'Metodologia e premissas' }), el('p', { text: [estimate.formula, ...(estimate.assumptions || [])].filter(Boolean).join(' · ') })]) : null].filter(Boolean)));
      });
      body.append(tr);
    }
    table.append(body);
    wide.replaceChildren(table);
  }
  for (const control of [filter, detail, pickA, pickB]) control.addEventListener('change', draw);
  draw();
  return wrap;
}

/** Pesos definidos pela empresa. O resultado sempre carrega o aviso de autoria. */

export function weightsPanel(rfq, proposals, { onApplied = null, initial = null, initialNote = null, calculate = null } = {}) {
  const specs = PRODUCTS[rfq.product].proposalFields.filter((field) => field.comparable && field.direction);
  const panel = el('section', { class: 'card weights' });
  panel.append(el('div', { class: 'card-head' }, el('div', { class: 'card-head-text' }, [
    el('h3', { class: 'card-title', text: 'Seus critérios e pesos' }),
    el('p', { class: 'card-subtitle', text: 'Opcional. Defina a importância de cada critério para a sua empresa; o Arandu só faz a conta.' })
  ])));
  const form = el('form', { id: 'weights-form', class: 'weights-form' });
  for (const spec of specs) {
    const start = String(Number(initial?.[spec.key]) > 0 ? Number(initial[spec.key]) : 0);
    const range = el('input', { type: 'range', min: '0', max: '100', step: '5', value: start, name: spec.key, 'aria-label': `Peso de ${spec.label}` });
    const output = el('output', { class: 'weight-value', text: start });
    range.addEventListener('input', () => { output.textContent = range.value; });
    form.append(el('div', { class: 'weight-row' }, [el('span', { class: 'weight-label', text: spec.label }), range, output]));
  }
  const apply = button('Aplicar meus pesos', { variant: 'primary', type: 'submit', iconName: 'scale' });
  const clear = button('Zerar', { variant: 'ghost', onClick: () => { for (const input of form.querySelectorAll('input[type=range]')) { input.value = '0'; input.dispatchEvent(new Event('input')); } output.replaceChildren(); } });
  form.append(el('div', { class: 'form-actions' }, [clear, apply]));
  const output = el('div', { id: 'weights-output', role: 'status', 'aria-live': 'polite' });
  const run = async () => {
    const weights = {};
    for (const [key, value] of new FormData(form)) if (Number(value) > 0) weights[key] = Number(value);
    let scored;
    apply.disabled = true;
    try { scored = calculate ? await calculate(weights) : applyUserWeights(rfq.product, proposals, weights); }
    catch { output.replaceChildren(errorState({ title: 'Não foi possível calcular os pesos', text: 'Tente novamente. Nenhuma pontuação foi registrada.' })); return; }
    finally { apply.disabled = false; }
    output.replaceChildren();
    for (const item of scored.excluded_criteria || []) output.append(el('p', { class: 'callout callout-warning', text: `${item.label}: excluído do cálculo. ${item.reasons.join(' ')}` }));
    if (!scored.applied) { output.append(el('p', { class: 'muted', text: scored.notice })); return; }
    onApplied?.(weights);
    output.append(el('p', { class: 'weights-notice', id: 'weights-notice' }, [icon('info', { size: 14 }), el('strong', { text: USER_WEIGHTS_NOTICE })]));
    const list = el('ol', { class: 'score-list' });
    const max = Math.max(...scored.results.map((item) => item.score ?? 0), 0.0001);
    for (const item of scored.results) {
      list.append(el('li', { class: `score-row${item.low_coverage ? ' low' : ''}` }, [
        el('span', { class: 'score-name', text: item.provider_name }),
        el('span', { class: 'score-bar' }, el('span', { class: 'score-fill', style: `width:${item.score === null ? 0 : Math.round((item.score / max) * 100)}%` })),
        el('span', { class: 'score-value', text: item.score === null ? 'sem dados' : item.score.toFixed(2) }),
        el('span', { class: 'score-coverage', text: `cobertura ${(item.coverage * 100).toFixed(0)}%${item.missing_criteria.length ? ` · falta ${item.missing_criteria.join(', ')}` : ''}` })
      ]));
    }
    output.append(list);
    if (scored.has_low_coverage) output.append(el('p', { class: 'callout callout-warning', id: 'coverage-warning' }, [icon('alert', { size: 14 }), el('span', { text: `Há proposta pontuada sobre menos de ${(scored.coverage_threshold * 100).toFixed(0)}% do peso definido; ela aparece por último e não é comparável com uma proposta completa.` })]));
    if (!scored.ranking_meaningful) output.append(el('p', { class: 'muted small', text: 'Com menos de duas propostas comparáveis, a ordem não diz nada.' }));
    output.append(el('p', { class: 'muted small', text: `Pesos: ${scored.criteria.map((item) => `${item.label} ${(item.share * 100).toFixed(0)}%`).join(' · ')}` }));
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); run(); });
  panel.append(el('div', { class: 'card-body' }, [initialNote ? el('p', { class: 'muted small', id: 'weights-origin', text: initialNote }) : null, form, output].filter(Boolean)));
  // Com pesos de partida (já aplicados ou registrados na decisão), o resultado aparece de imediato.
  if (initial && Object.values(initial).some((value) => Number(value) > 0)) run();
  return panel;
}

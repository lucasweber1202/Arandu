// Blocos usados por mais de uma tela: comparação, pesos, revisões,
// aprovação, colaboração e histórico.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { buildComparison, applyUserWeights, USER_WEIGHTS_NOTICE, NEUTRAL_RANKING_NOTICE } from '../../../lib/finance/comparison.mjs';
import { el, icon, money, fieldValue, formatDate, formatDateTime, timeAgo, uid, APPROVAL_STATUS, ROLE_LABELS, fold } from '../core.js';
import { button, pill, avatar, emptyState, errorState, loading, toast, promptDialog, confirmDialog, field, tag, onSubmit } from '../ui.js';

// ------------------------------------------------------------- membros
export function memberName(members, id) {
  const member = (members || []).find((row) => row.user_id === id);
  if (member?.display_name) return member.display_name;
  if (member) return ROLE_LABELS[member.role] || 'Membro';
  return 'Membro';
}
export function memberTitle(members, id) {
  const member = (members || []).find((row) => row.user_id === id);
  return member?.title || ROLE_LABELS[member?.role] || '';
}

// ------------------------------------------------------------ comparação
export const DEFINITIONS = Object.freeze({
  interest_rate_month: 'Taxa nominal mensal informada pelo provedor. Não inclui tarifas nem tributos.',
  cet_year: 'Custo Efetivo Total anual declarado pelo provedor: juros, tarifas, tributos e seguros. O Arandu não calcula CET.',
  index_spread: 'Acréscimo anual sobre o indexador (CDI, IPCA…). O custo final depende da variação futura do índice.',
  grace_months: 'Meses iniciais sem pagamento de principal. O tratamento dos juros na carência varia por contrato.',
  amortization: 'PRICE: parcelas iguais. SAC: amortização constante, parcelas decrescentes. Bullet: principal no fim.',
  fees_amount: 'Tarifas pontuais informadas (cadastro, estruturação, registro).',
  declared_total_cost: 'Custo total informado pelo próprio provedor para a operação.',
  mdr_debit: 'Merchant Discount Rate: percentual retido pelo adquirente em cada venda no débito.',
  mdr_credit_cash: 'Percentual retido em vendas no crédito à vista.',
  mdr_credit_installment: 'Percentual retido em vendas parceladas.',
  pix_fee: 'Percentual cobrado sobre recebimentos via PIX.',
  anticipation_rate: 'Taxa mensal para receber antes do prazo de liquidação.',
  settlement_days: 'Dias entre a venda e o crédito na conta (D+N).',
  early_exit_penalty: 'Multa por encerrar o contrato antes do prazo.',
  contracting_days: 'Tempo estimado pelo provedor entre a escolha e a operação disponível.',
  valid_until: 'Data até a qual o provedor mantém as condições propostas.'
});

function fieldsByKey(product) { return Object.fromEntries(PRODUCTS[product].proposalFields.map((field) => [field.key, field])); }

export function coverage(product, terms) {
  const comparable = PRODUCTS[product].proposalFields.filter((field) => field.comparable);
  const filled = comparable.filter((field) => terms?.[field.key] !== undefined && terms?.[field.key] !== null && terms?.[field.key] !== '').length;
  return { filled, total: comparable.length, ratio: comparable.length ? filled / comparable.length : 0 };
}
function definitionTip(key) {
  const text = DEFINITIONS[key];
  if (!text) return null;
  const id = `def-${key}-${Math.random().toString(36).slice(2, 7)}`;
  return el('span', { class: 'tip' }, [
    el('button', { type: 'button', class: 'tip-trigger', 'aria-label': 'O que é isto?', 'aria-describedby': id }, icon('info', { size: 13 })),
    el('span', { role: 'tooltip', id, class: 'tip-text', text })
  ]);
}

function comparisonValue(field, value, currency) {
  if (value === null || value === undefined) return null;
  if (field.type !== 'money') return fieldValue(field, value);
  return currency ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value) : `${new Intl.NumberFormat('pt-BR').format(value)} (moeda não identificada)`;
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
      el('p', { text: `Origem: ${version?.submitted_at ? 'proposta enviada pelo provedor' : 'não disponível'}. Versão: ${version?.version ?? 'não informada'}. Envio: ${version?.submitted_at ? new Date(version.submitted_at).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }) : 'não informado'}. Autor: não disponível. Verificação: não verificado. Documento: sem vínculo de evidência por campo.` }),
      el('p', { text: `Metodologia: condição declarada; sem cálculo pelo Arandu. ${DEFINITIONS[row.key] || ''}` }),
      ...row.context_reasons.map(text => el('p', { text })),
      !historical.has(index) && column.changed_keys.includes(row.key) ? el('p', { text: `Versão anterior: ${fieldValue(byKey[row.key], row.previous_values[index]) ?? 'não informado'}.` }) : null
    ].filter(Boolean));
  };
  function draw() {
    const table = el('table', { class: 'matrix' });
    const head = el('tr', {}, el('th', { scope: 'col', class: 'matrix-corner', text: 'Condição' }));
    data.columns.forEach((column, index) => {
      head.append(el('th', { scope: 'col', class: 'matrix-provider' }, [el('span', { class: 'matrix-name', text: column.provider_name }),
        el('span', { class: 'matrix-meta', text: `${historical.has(index) ? 'Consulta da versão anterior' : `v${column.version ?? '?'}`} · ${column.currency ?? 'moeda não identificada'}${column.currency_source === 'schema_brl_v1' ? ' (unidade do cadastro)' : ''}` }),
        el('span', { class: 'matrix-meta', text: coverageText(index) }),
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

// ----------------------------------------------------------- revisões
export function revisionDiff(product, before, after) {
  if (!before || !after) return [];
  const labels = [['title', 'Título'], ['response_deadline', 'Prazo de resposta'], ['description', 'Descrição'],
    ...PRODUCTS[product].demandFields.map((field) => [field.key, field.label, field])];
  const changes = [];
  for (const [key, label, spec] of labels) {
    const a = key in (before.demand || {}) || key in (after.demand || {}) ? before.demand?.[key] : before[key];
    const b = key in (before.demand || {}) || key in (after.demand || {}) ? after.demand?.[key] : after[key];
    if (JSON.stringify(a ?? null) === JSON.stringify(b ?? null)) continue;
    const format = (value) => (spec ? fieldValue(spec, value) : key === 'response_deadline' ? formatDate(value) : value) ?? 'não informado';
    // Descrição: mostra o trecho real, encurtado, em vez de um marcador genérico.
    const excerpt = (value) => { const text = String(value ?? '').replace(/\s+/g, ' ').trim(); return text ? (text.length > 90 ? `${text.slice(0, 90)}…` : text) : 'sem descrição'; };
    changes.push({ label, before: key === 'description' ? excerpt(a) : format(a), after: key === 'description' ? excerpt(b) : format(b) });
  }
  return changes;
}

export function revisionTimeline(ctx, rfq) {
  const box = el('div', { class: 'revisions', 'aria-live': 'polite' }, loading('Carregando revisões…'));
  ctx.api(`rfq-revisions?organization_id=${encodeURIComponent(ctx.organization.id)}&rfq_id=${encodeURIComponent(rfq.id)}`).then(({ rows }) => {
    const list = el('ol', { class: 'timeline' });
    const ordered = [...(rows || [])].sort((a, b) => b.revision - a.revision);
    ordered.forEach((row, index) => {
      const previous = ordered[index + 1];
      const changes = previous ? revisionDiff(rfq.product, previous.snapshot, row.snapshot) : [];
      list.append(el('li', { class: `timeline-item${row.revision === rfq.revision ? ' current' : ''}` }, [
        el('span', { class: 'timeline-dot', 'aria-hidden': 'true' }),
        el('div', { class: 'timeline-content' }, [
          el('p', { class: 'timeline-title' }, [el('strong', { text: `Revisão ${row.revision}` }), row.revision === rfq.revision ? tag('atual', 'accent') : null]),
          el('p', { class: 'timeline-meta', text: `${formatDateTime(row.published_at)}${row.changed_by_name ? ` · ${row.changed_by_name}` : ''}` }),
          previous ? (changes.length
            ? el('ul', { class: 'diff-list' }, changes.map((change) => el('li', {}, [el('span', { class: 'diff-label', text: `${change.label}: ` }), el('span', { class: 'diff-before', text: change.before }), ' → ', el('span', { class: 'diff-after', text: change.after })])))
            : el('p', { class: 'muted small', text: 'Sem mudança material.' }))
            : el('p', { class: 'muted small', text: 'Versão inicial publicada.' })
        ])
      ]));
    });
    box.replaceChildren(ordered.length ? list : emptyState({ title: 'Nenhuma revisão registrada', compact: true }));
  }).catch((error) => box.replaceChildren(errorState({ title: 'Histórico de revisões indisponível', error })));
  return box;
}

// ----------------------------------------------------------- aprovação
export function approvalSteps(request, members) {
  const list = el('ol', { class: 'steps-list' });
  const current = (request.steps || []).filter((step) => step.status === 'pending').sort((a, b) => a.position - b.position)[0];
  for (const step of [...(request.steps || [])].sort((a, b) => a.position - b.position)) {
    const meta = { approved: ['checkCircle', 'Aprovou', 'success'], rejected: ['x', 'Rejeitou', 'danger'], changes_requested: ['edit', 'Pediu alterações', 'warning'],
      pending: [step === current && request.status === 'pending' ? 'clock' : 'more', step === current && request.status === 'pending' ? 'Aguardando decisão' : 'Na fila', step === current ? 'warning' : 'neutral'] }[step.status] || ['info', step.status, 'neutral'];
    list.append(el('li', { class: `step step-${meta[2]}` }, [
      el('span', { class: 'step-icon' }, icon(meta[0], { size: 14 })),
      el('span', { class: 'step-body' }, [
        el('span', { class: 'step-who' }, [el('strong', { text: memberName(members, step.approver_id) }), el('span', { class: 'muted', text: ` · ${memberTitle(members, step.approver_id)}` })]),
        el('span', { class: 'step-state', text: `${meta[1]}${step.acted_at ? ` · ${timeAgo(step.acted_at)}` : ''}` }),
        step.comment ? el('span', { class: 'step-comment', text: `“${step.comment}”` }) : null
      ])
    ]));
  }
  return list;
}

export function currentStep(request) {
  if (request.status !== 'pending') return null;
  return (request.steps || []).filter((step) => step.status === 'pending').sort((a, b) => a.position - b.position)[0] || null;
}

// Vez de quem vê a tela: com policy, o servidor informa (etapa ativa própria
// ou delegada); sem policy, o próximo aprovador em ordem. Pedido
// desatualizado não aceita decisão de ninguém. Fonte única para caixa,
// início e detalhe da solicitação.
export function isViewerTurn(request, viewerId) {
  if (!request || request.status !== 'pending' || request.stale) return false;
  return request.viewer_can_act ?? (Boolean(viewerId) && currentStep(request)?.approver_id === viewerId);
}

/** Botões de decisão do aprovador, com motivo obrigatório para recusar. */
const REASON_LABELS = { insufficient_competition: 'Competição insuficiente', terms_outside_policy: 'Condições fora da policy', missing_documentation: 'Documentação faltando',
  pricing_review: 'Revisar preço', risk_review: 'Revisar risco', compliance_review: 'Revisar compliance', budget: 'Orçamento', other: 'Outro' };
export function approvalActions(ctx, request, { onDone }) {
  const actions = el('div', { class: 'approval-actions' });
  // Pedido com policy: motivo estruturado (opcional) ao devolver ou rejeitar.
  const reason = request.policy_snapshot ? el('select', { 'aria-label': 'Motivo ao devolver ou rejeitar (opcional)', class: 'reason-select' },
    [el('option', { value: '', text: 'Motivo (opcional)' }), ...Object.entries(REASON_LABELS).map(([value, text]) => el('option', { value, text }))]) : null;
  const act = async (action) => {
    let comment = '';
    if (action !== 'approved') {
      comment = await promptDialog({
        title: action === 'rejected' ? 'Rejeitar a proposta' : 'Pedir alterações',
        description: 'O motivo fica registrado na trilha da solicitação e é enviado a quem pediu a aprovação.',
        label: 'Motivo', minLength: 3, confirmLabel: action === 'rejected' ? 'Rejeitar' : 'Pedir alterações', tone: action === 'rejected' ? 'danger' : 'primary'
      });
      if (comment === null) return;
    } else {
      const ok = await confirmDialog({ title: 'Aprovar esta proposta?', description: 'Sua aprovação fica registrada com data e hora. Se houver próximo aprovador, ele será avisado.', confirmLabel: 'Aprovar' });
      if (!ok) return;
    }
    for (const node of actions.querySelectorAll('button')) node.disabled = true;
    try {
      const result = await ctx.api('approvals/act', { method: 'POST', body: JSON.stringify({ request_id: request.id, action, comment, ...(reason?.value && action !== 'approved' ? { reason_code: reason.value } : {}) }) });
      toast({ approved: result.status === 'pending' ? 'Aprovação registrada. O próximo aprovador foi avisado.' : 'Aprovação registrada.', rejected: 'Rejeição registrada.', changes_requested: 'Pedido de alterações registrado.' }[action]);
      onDone?.();
    } catch (error) {
      toast(error.message, 'error');
      for (const node of actions.querySelectorAll('button')) node.disabled = false;
    }
  };
  if (reason) actions.append(reason);
  actions.append(
    button('Aprovar', { variant: 'primary', iconName: 'check', onClick: () => act('approved') }),
    button('Pedir alterações', { iconName: 'edit', onClick: () => act('changes_requested') }),
    button('Rejeitar', { variant: 'danger-ghost', iconName: 'x', onClick: () => act('rejected') })
  );
  return actions;
}

// --------------------------------------------------------- colaboração
const VISIBILITY = {
  internal: { icon: 'lock', label: 'Somente sua empresa', tone: 'internal' },
  provider_visible: { icon: 'eye', label: 'Visível ao provedor', tone: 'shared' }
};
export function visibilityBadge(visibility, { provider = false, fromBuyer = false } = {}) {
  const meta = VISIBILITY[visibility] || VISIBILITY.internal;
  const label = provider && visibility === 'provider_visible'
    ? (fromBuyer ? 'Da empresa a todos os provedores convidados' : 'Visível à empresa compradora') : meta.label;
  return el('span', { class: `visibility visibility-${meta.tone}` }, [icon(meta.icon, { size: 12 }), el('span', { text: label })]);
}

/** Destaca menções conhecidas sem interpretar o texto como HTML. */
function commentBody(text, names) {
  const body = el('p', { class: 'comment-body' });
  const known = [...names].filter(Boolean).sort((a, b) => b.length - a.length);
  let rest = String(text);
  while (rest.length) {
    let hit = null;
    for (const name of known) {
      const index = rest.indexOf(`@${name}`);
      if (index >= 0 && (!hit || index < hit.index)) hit = { index, name };
    }
    if (!hit) { body.append(rest); break; }
    if (hit.index) body.append(rest.slice(0, hit.index));
    body.append(el('span', { class: 'mention', text: `@${hit.name}` }));
    rest = rest.slice(hit.index + hit.name.length + 1);
  }
  return body;
}

export function collaboration(ctx, rfq, { provider = false } = {}) {
  const section = el('section', { class: 'collab', id: 'comentarios', 'aria-label': 'Comentários' });
  const thread = el('div', { class: 'thread', 'aria-live': 'polite' }, loading('Carregando comentários…'));
  const members = ctx.members || [];
  const names = new Set(members.map((member) => member.display_name).filter(Boolean));

  const composer = (parent = null) => {
    const form = el('form', { class: `composer${parent ? ' composer-reply' : ''}`, novalidate: true });
    const text = el('textarea', { name: 'body', rows: parent ? '2' : '3', maxlength: '4000', 'aria-label': parent ? 'Resposta' : 'Comentário',
      placeholder: provider ? 'Escreva uma pergunta ou esclarecimento para a empresa…' : 'Escreva um comentário. Use @ para mencionar alguém da sua empresa.' });
    const mentionIds = new Set();
    let visibility = parent ? parent.visibility : (provider ? 'provider_visible' : 'internal');
    const help = el('p', { class: 'composer-help' });
    const setHelp = () => {
      help.replaceChildren(visibilityBadge(visibility, { provider }), el('span', { text: visibility === 'internal'
        ? ' Só pessoas da sua empresa leem. Provedores nunca veem.'
        : provider ? ' A empresa compradora lê. Outros provedores não veem.' : ' Todos os provedores convidados para esta solicitação leem.' }));
    };
    const controls = el('div', { class: 'composer-controls' });
    if (!provider && !parent) {
      const group = el('div', { class: 'segmented visibility-choice', role: 'radiogroup', 'aria-label': 'Quem pode ler' });
      for (const value of ['internal', 'provider_visible']) {
        const meta = VISIBILITY[value];
        const option = el('button', { type: 'button', role: 'radio', class: 'segment', 'aria-checked': String(value === visibility), dataset: { visibility: value } }, [icon(meta.icon, { size: 14 }), el('span', { text: meta.label })]);
        option.addEventListener('click', () => {
          visibility = value;
          for (const node of group.children) node.setAttribute('aria-checked', String(node.dataset.visibility === value));
          if (value !== 'internal') mentionIds.clear();
          setHelp();
        });
        group.append(option);
      }
      controls.append(group);
    }
    // Menções: lista filtrada ao digitar "@".
    const suggestions = el('ul', { class: 'mention-list', role: 'listbox', 'aria-label': 'Mencionar', hidden: true });
    let pickIndex = 0;
    const candidates = () => {
      if (provider || visibility !== 'internal') return [];
      const match = /@([^\s@]*)$/.exec(text.value.slice(0, text.selectionStart));
      if (!match) return [];
      const query = fold(match[1]);
      return members.filter((member) => member.user_id !== ctx.viewer?.id && member.role !== 'provider_user' && member.display_name && fold(member.display_name).includes(query)).slice(0, 6);
    };
    const pick = (member) => {
      const cursor = text.selectionStart;
      const before = text.value.slice(0, cursor).replace(/@([^\s@]*)$/, `@${member.display_name} `);
      text.value = before + text.value.slice(cursor);
      text.selectionStart = text.selectionEnd = before.length;
      mentionIds.add(member.user_id);
      suggestions.hidden = true;
      text.focus();
    };
    const showSuggestions = () => {
      const list = candidates();
      suggestions.replaceChildren();
      suggestions.hidden = !list.length;
      pickIndex = 0;
      list.forEach((member, index) => {
        const option = el('li', { role: 'option', class: 'mention-option', 'aria-selected': String(index === 0), id: `mention-${member.user_id}` }, [avatar(member.display_name, { size: 'xs' }), el('span', { text: member.display_name }), el('span', { class: 'muted', text: member.title || '' })]);
        option.addEventListener('mousedown', (event) => { event.preventDefault(); pick(member); });
        suggestions.append(option);
      });
      suggestions.list = list;
    };
    text.addEventListener('input', showSuggestions);
    text.addEventListener('keydown', (event) => {
      if (suggestions.hidden) return;
      const options = [...suggestions.children];
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        pickIndex = (pickIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
        options.forEach((option, index) => option.setAttribute('aria-selected', String(index === pickIndex)));
      } else if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        pick(suggestions.list[pickIndex]);
      } else if (event.key === 'Escape') suggestions.hidden = true;
    });
    text.addEventListener('blur', () => setTimeout(() => { suggestions.hidden = true; }, 120));
    const error = el('p', { class: 'field-error', hidden: true });
    const submit = button(parent ? 'Responder' : 'Publicar comentário', { variant: 'primary', type: 'submit', iconName: 'send', size: 'sm' });
    const cancel = parent ? button('Cancelar', { variant: 'ghost', size: 'sm', onClick: () => form.remove() }) : null;
    setHelp();
    form.append(el('div', { class: 'composer-field' }, [text, suggestions]), controls, help, error, el('div', { class: 'composer-actions' }, [cancel, submit]));
    const clientId = { value: uid() };
    onSubmit(form, async (event) => {
      event.preventDefault();
      const value = text.value.trim();
      error.hidden = true;
      if (!value) { error.textContent = 'Escreva o comentário antes de publicar.'; error.hidden = false; text.focus(); return; }
      if (/[<>]/.test(value)) { error.textContent = 'Use texto simples, sem os caracteres < e >.'; error.hidden = false; return; }
      const mentions = [...mentionIds].filter((id) => value.includes(`@${members.find((member) => member.user_id === id)?.display_name}`));
      submit.disabled = true;
      submit.querySelector('.btn-label').textContent = 'Publicando…';
      try {
        await ctx.api('comments', { method: 'POST', body: JSON.stringify({
          organization_id: ctx.organization.id, object_type: 'rfq', object_id: rfq.id, visibility, body: value,
          mention_ids: visibility === 'internal' ? mentions : [], client_id: clientId.value, parent_id: parent?.id || null
        }) });
        clientId.value = uid();
        text.value = '';
        mentionIds.clear();
        toast(mentions.length ? `Comentário publicado. ${mentions.length === 1 ? 'A pessoa mencionada foi avisada.' : 'As pessoas mencionadas foram avisadas.'}` : 'Comentário publicado.');
        await refresh();
      } catch (failure) {
        error.textContent = `${failure.message} O texto continua aqui para você tentar de novo.`;
        error.hidden = false;
      } finally {
        submit.disabled = false;
        submit.querySelector('.btn-label').textContent = parent ? 'Responder' : 'Publicar comentário';
      }
    });
    return form;
  };

  let rowsById = new Map();
  const renderComment = (row, replies) => {
    const author = row.author_name || memberName(members, row.author_id);
    const item = el('article', { class: `comment comment-${row.visibility}`, id: `comment-${row.id}` }, [
      avatar(author, { size: 'sm' }),
      el('div', { class: 'comment-main' }, [
        el('header', { class: 'comment-head' }, [
          el('strong', { class: 'comment-author', text: author }),
          row.author_org && row.author_is_provider ? el('span', { class: 'comment-org', text: row.author_org }) : null,
          el('time', { class: 'comment-time', datetime: row.created_at, title: formatDateTime(row.created_at), text: timeAgo(row.created_at) }),
          visibilityBadge(row.visibility, { provider, fromBuyer: provider && !row.author_is_provider })
        ]),
        row.parent_id && !rowsById.has(row.parent_id) ? el('p', { class: 'muted small', text: 'Resposta da empresa a uma pergunta enviada por outra instituição.' }) : null,
        commentBody(row.body, names)
      ])
    ]);
    const main = item.querySelector('.comment-main');
    // Threads têm um nível: responder a uma resposta vai para o comentário de
    // origem; sem acesso à origem (pergunta de outra instituição), não há resposta.
    const target = row.parent_id ? rowsById.get(row.parent_id) : row;
    if (target) {
      const reply = el('button', { type: 'button', class: 'link-btn' }, [icon('reply', { size: 14 }), el('span', { text: 'Responder' })]);
      reply.addEventListener('click', () => {
        if (main.querySelector('.composer-reply')) return;
        const form = composer(target);
        main.append(form);
        form.querySelector('textarea').focus();
      });
      main.append(el('div', { class: 'comment-actions' }, reply));
    }
    if (replies.length) main.append(el('div', { class: 'replies' }, replies.map((child) => renderComment(child, []))));
    return item;
  };

  async function refresh() {
    try {
      const result = await ctx.api(`comments?organization_id=${encodeURIComponent(ctx.organization.id)}&object_type=rfq&object_id=${encodeURIComponent(rfq.id)}`);
      const rows = [...(result.rows || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      const ids = new Set(rows.map((row) => row.id));
      rowsById = new Map(rows.map((row) => [row.id, row]));
      const roots = rows.filter((row) => !row.parent_id || !ids.has(row.parent_id));
      thread.replaceChildren();
      for (const root of roots) thread.append(renderComment(root, rows.filter((row) => row.parent_id === root.id)));
      if (!roots.length) thread.append(emptyState({ title: provider ? 'Nenhuma conversa ainda' : 'Nenhum comentário ainda', text: provider ? 'Tire dúvidas sobre a demanda aqui. A empresa compradora é avisada.' : 'Registre contexto, dúvidas e combinados deste processo. Mencione alguém com @.', iconName: 'message', compact: true }));
      if (location.hash.startsWith('#comment-')) document.querySelector(location.hash)?.scrollIntoView({ block: 'center' });
    } catch (error) {
      thread.replaceChildren(errorState({ title: 'Comentários indisponíveis', error, onRetry: refresh }));
    }
  }
  section.append(thread, composer());
  refresh();
  return section;
}

const EVENT_LABELS = Object.freeze({
  rfq_created: 'criou a solicitação', rfq_open: 'abriu para propostas', rfq_collecting: 'passou a coletar propostas', rfq_comparing: 'encerrou a coleta e iniciou a avaliação',
  rfq_revised: 'publicou uma nova revisão', rfq_decided: 'marcou como decidida', rfq_cancelled: 'cancelou a solicitação', rfq_closed: 'encerrou a solicitação',
  provider_invited: 'convidou um provedor', invite_accepted: 'aceitou o convite', proposal_submitted: 'enviou proposta', proposal_revised: 'enviou nova versão da proposta',
  approval_requested: 'solicitou aprovação', approval_step_approved: 'aprovou uma etapa', approval_approved: 'concluiu a aprovação', approval_rejected: 'rejeitou a aprovação',
  approval_changes_requested: 'pediu alterações', approval_cancelled: 'cancelou o pedido de aprovação', decision_recorded: 'registrou a decisão',
  contract_registered: 'registrou o contrato', comment_added: 'comentou', renewal_task_created: 'criou tarefa de renovação', renewal_rfq_started: 'iniciou nova concorrência',
  rfq_demand_updated: 'atualizou a demanda', rfq_demand_updated_after_open: 'alterou a demanda após a abertura',
  renewal_milestone_reached: 'registrou um marco de renovação', document_uploaded: 'anexou um documento', document_version_added: 'enviou nova versão de documento',
  document_downloaded: 'baixou um documento', document_removed: 'removeu um documento'
});
/** Frase do histórico. Tipo desconhecido nunca aparece cru na interface. */
export function eventPhrase(type) { return EVENT_LABELS[type] || 'registrou uma atualização'; }
const EVENT_TITLES = Object.freeze({
  proposal_submitted: 'Nova proposta', proposal_revised: 'Proposta revisada', approval_requested: 'Aprovação solicitada', approval_approved: 'Aprovação concluída',
  approval_step_approved: 'Etapa aprovada', approval_rejected: 'Aprovação rejeitada', approval_changes_requested: 'Alterações pedidas', approval_cancelled: 'Pedido de aprovação cancelado',
  decision_recorded: 'Decisão registrada', contract_registered: 'Contrato registrado', rfq_revised: 'Nova revisão', rfq_created: 'Solicitação criada',
  rfq_open: 'Aberta para propostas', rfq_collecting: 'Coleta reaberta', rfq_comparing: 'Coleta encerrada', rfq_cancelled: 'Solicitação cancelada', provider_invited: 'Provedor convidado',
  invite_accepted: 'Convite aceito', comment_added: 'Comentário', renewal_task_created: 'Renovação em atenção', renewal_milestone_reached: 'Marco de renovação',
  renewal_rfq_started: 'Nova concorrência de renovação', rfq_demand_updated: 'Demanda atualizada', rfq_demand_updated_after_open: 'Demanda alterada após abertura',
  document_uploaded: 'Documento anexado', document_version_added: 'Nova versão de documento', document_removed: 'Documento removido',
  // Ciclo de vida pós-contratação e cadastros (eventos gravados pela API real).
  profile_field_saved: 'Perfil financeiro atualizado', profile_field_confirmed: 'Dado do perfil confirmado', organization_created: 'Organização criada',
  organization_updated: 'Organização atualizada', provider_onboarded: 'Instituição cadastrada', buyer_onboarded: 'Empresa cadastrada',
  comparison_viewed: 'Comparação consultada', weights_applied: 'Pesos aplicados', rfq_passport_snapshot: 'Perfil fixado na solicitação',
  opportunity_rule_versioned: 'Regra de oportunidade versionada', approval_policy_updated: 'Política de aprovação atualizada',
  spend_recorded: 'Spend registrado', spend_reconciled: 'Spend reconciliado', implementation_opened: 'Implantação iniciada',
  implementation_milestone_changed: 'Marco de implantação atualizado', implementation_issue_changed: 'Pendência de implantação atualizada',
  extraction_fact_confirmed: 'Fato extraído confirmado', document_extraction_started: 'Extração de documento iniciada', document_extraction_completed: 'Extração de documento concluída',
  qualification_requirement_set: 'Exigência de qualificação definida', provider_qualification_opened: 'Qualificação aberta',
  provider_qualification_in_progress: 'Qualificação em andamento', provider_qualification_pending_internal_review: 'Qualificação aguardando revisão',
  obligation_opened: 'Obrigação aberta', obligation_data_recorded: 'Medição de obrigação registrada', obligation_reviewed: 'Obrigação revisada',
  obligation_waiver_changed: 'Waiver de obrigação alterado', performance_dimension_versioned: 'Dimensão de performance versionada',
  performance_period_opened: 'Período de performance aberto', performance_measured: 'Performance medida', performance_reviewed: 'Performance revisada',
  fee_schedule_created: 'Tarifa contratada registrada', fee_observation_recorded: 'Tarifa observada registrada', fee_observation_verified: 'Tarifa observada verificada',
  fee_variance_detected: 'Diferença de tarifa identificada', contract_terms_registration: 'Termos do contrato registrados',
  facility_created: 'Facility registrada', facility_balance_recorded: 'Saldo de facility registrado'
});
/** Título curto para feeds. */
export function eventTitle(type) { return EVENT_TITLES[type] || 'Atualização'; }
export function activityLog(ctx, type, id) {
  const list = el('ol', { class: 'activity' }, el('li', {}, loading('Carregando histórico…')));
  ctx.api(`events?organization_id=${encodeURIComponent(ctx.organization.id)}&entity_type=${type}&entity_id=${encodeURIComponent(id)}`).then(({ rows }) => {
    list.replaceChildren();
    for (const row of rows || []) {
      const detail = row.metadata?.provider ? ` · ${row.metadata.provider}` : row.metadata?.revision ? ` · revisão ${row.metadata.revision}` : '';
      list.append(el('li', { class: 'activity-item' }, [
        el('span', { class: 'activity-dot', 'aria-hidden': 'true' }),
        el('span', { class: 'activity-text' }, [el('strong', { text: row.actor_name || 'Membro da equipe' }), ` ${eventPhrase(row.event_type)}${detail}`]),
        el('time', { class: 'activity-time', datetime: row.happened_at, text: formatDateTime(row.happened_at) })
      ]));
    }
    if (!list.children.length) list.append(el('li', { class: 'muted', text: 'Nenhuma atividade registrada.' }));
  }).catch((error) => list.replaceChildren(el('li', {}, errorState({ title: 'Histórico indisponível', error }))));
  return list;
}

export function approvalSummaryLine(request) {
  const done = (request.steps || []).filter((step) => step.status === 'approved').length;
  const total = (request.steps || []).length;
  const current = currentStep(request);
  return current ? `Etapa ${current.position} de ${total}` : `${done} de ${total} aprovaram`;
}
export { APPROVAL_STATUS, pill, field };

// Documentos sob demanda: o painel (e seu módulo) só carrega quando a seção abre.
export function lazyDocuments(ctx, entityType, entityId, label, options = {}) {
  const details = el('details', { class: 'lazy-documents' }, [el('summary', {}, [icon('file', { size: 14 }), el('span', { text: label })])]);
  details.addEventListener('toggle', () => {
    if (!details.open || details.dataset.loaded) return;
    details.dataset.loaded = '1';
    import('./documents.js').then(({ documentsPanel }) => details.append(documentsPanel(ctx, { entityType, entityId, ...options })));
  });
  return details;
}

// Condições-chave da proposta (crédito ou adquirência), com unidade junto do valor.
export function keyTerms(product, terms) {
  const keys = product === 'credit' ? ['offered_amount', 'interest_rate_month', 'cet_year', 'term_months', 'grace_months']
    : ['mdr_debit', 'mdr_credit_cash', 'mdr_credit_installment', 'pix_fee', 'anticipation_rate', 'settlement_days'];
  const specs = Object.fromEntries(PRODUCTS[product].proposalFields.map((spec) => [spec.key, spec]));
  return el('dl', { class: 'key-terms' }, keys.map((key) => {
    // O rótulo curto perde a unidade do parênteses; ela volta junto do valor.
    const unit = (specs[key].label.match(/\(([^)]*)\)$/) || [])[1] || '';
    const suffix = { meses: ' meses', dias: ' dias', '% a.m.': ' a.m.', '% a.a.': ' a.a.' }[unit] || '';
    const raw = fieldValue(specs[key], terms?.[key]);
    const value = raw === null ? null : `${raw}${suffix}`;
    return el('div', { class: 'key-term' }, [el('dt', { text: specs[key].label.replace(/\s*\(.*\)$/, '') }), el('dd', { class: value === null ? 'missing' : '', text: value ?? '—' })]);
  }));
}

// Linha curta com as condições principais, para listas. Ausente aparece como
// "não informado", nunca como zero; a unidade acompanha o valor.
export function termsSummary(product, terms) {
  const keys = product === 'credit' ? ['offered_amount', 'interest_rate_month', 'term_months'] : ['mdr_debit', 'mdr_credit_cash', 'settlement_days'];
  const specs = Object.fromEntries((PRODUCTS[product]?.proposalFields || []).map((spec) => [spec.key, spec]));
  return keys.filter((key) => specs[key]).map((key) => {
    const spec = specs[key];
    const unit = (spec.label.match(/\(([^)]*)\)$/) || [])[1] || '';
    const suffix = { meses: ' meses', dias: ' dias', '% a.m.': ' a.m.', '% a.a.': ' a.a.' }[unit] || '';
    const raw = fieldValue(spec, terms?.[key]);
    return `${spec.label.replace(/\s*\(.*\)$/, '')}: ${raw === null ? 'não informado' : `${raw}${suffix}`}`;
  }).join(' · ');
}

// ----------------------------------------------------------------- tarefas
// Quem o banco deixa criar e alterar tarefas (políticas fin_task_write/fin_task_edit).
// Leitor acompanha: a interface não oferece um controle que o servidor ignoraria.
export const TASK_EDITORS = ['admin', 'finance_manager', 'analyst'];
// Recusa ao alterar uma tarefa, em linguagem de gente; nada de código ou mensagem crua.
export function taskChangeError(error) {
  if (!error.status) return 'Sem conexão com o servidor. Nada foi confirmado.';
  if (error.status === 403) return 'Seu acesso não permite alterar esta tarefa. Nada mudou.';
  if (error.status === 404) return 'Esta tarefa não está mais disponível para você. Nada mudou.';
  if (error.status === 409) return 'A tarefa mudou enquanto você a alterava. Confira o estado salvo antes de tentar de novo.';
  return 'Não foi possível salvar a alteração agora. Nada foi confirmado.';
}

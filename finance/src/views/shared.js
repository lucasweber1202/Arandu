// Blocos usados por mais de uma tela: comparação, pesos, revisões,
// aprovação, colaboração e histórico.

import { PRODUCTS, estimateCreditTotalCost, estimateAcquiringMonthlyCost } from '../../../lib/finance/products.mjs';
import { applyUserWeights, USER_WEIGHTS_NOTICE, NEUTRAL_RANKING_NOTICE } from '../../../lib/finance/comparison.mjs';
import { el, icon, money, fieldValue, formatDate, formatDateTime, timeAgo, uid, APPROVAL_STATUS, ROLE_LABELS, fold } from '../core.js';
import { button, pill, avatar, emptyState, errorState, loading, toast, promptDialog, confirmDialog, field, tag } from '../ui.js';

// ------------------------------------------------------------- membros
export function memberName(members, id) {
  const member = (members || []).find((row) => row.user_id === id);
  if (member?.display_name) return member.display_name;
  if (member) return `${ROLE_LABELS[member.role] || 'Membro'} · ${String(id).slice(0, 4)}`;
  return 'Membro';
}
export function memberTitle(members, id) {
  const member = (members || []).find((row) => row.user_id === id);
  return member?.title || ROLE_LABELS[member?.role] || '';
}

// ------------------------------------------------------------ comparação
const GROUPS = {
  credit: [
    ['Valor e prazo', ['offered_amount', 'term_months', 'grace_months', 'amortization']],
    ['Custo', ['interest_rate_month', 'index', 'index_spread', 'cet_year', 'fees_amount', 'declared_total_cost']],
    ['Garantias e condições', ['collateral_required', 'conditions_precedent']],
    ['Operação', ['valid_until', 'contracting_days', 'product_name', 'notes']]
  ],
  acquiring: [
    ['Taxas por modalidade', ['mdr_debit', 'mdr_credit_cash', 'mdr_credit_installment', 'pix_fee']],
    ['Antecipação e liquidação', ['anticipation_rate', 'settlement_days']],
    ['Custos fixos e saída', ['terminal_rent', 'gateway_cost', 'early_exit_penalty']],
    ['Contrato', ['contract_months', 'chargeback_terms', 'extra_services']],
    ['Operação', ['valid_until', 'contracting_days', 'product_name', 'notes']]
  ]
};
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

function numeric(field, value) {
  if (value === null || value === undefined || value === '') return null;
  const number = field.type === 'date' ? Date.parse(`${value}T00:00:00Z`) : Number(value);
  return Number.isFinite(number) ? number : null;
}
/** Para cada linha, marca quem tem o menor/maior valor — só entre valores presentes e diferentes. */
function highlights(field, values) {
  if (!field.comparable || !field.direction) return values.map(() => false);
  const numbers = values.map((value) => numeric(field, value));
  const present = numbers.filter((value) => value !== null);
  if (present.length < 2 || new Set(present).size < 2) return values.map(() => false);
  const target = field.direction === 'lower_is_better' ? Math.min(...present) : Math.max(...present);
  return numbers.map((value) => value === target);
}
export function coverage(product, terms) {
  const comparable = PRODUCTS[product].proposalFields.filter((field) => field.comparable);
  const filled = comparable.filter((field) => terms?.[field.key] !== undefined && terms?.[field.key] !== null && terms?.[field.key] !== '').length;
  return { filled, total: comparable.length, ratio: comparable.length ? filled / comparable.length : 0 };
}
function estimateFor(rfq, proposal) {
  return rfq.product === 'credit' ? estimateCreditTotalCost(proposal.terms || {}) : estimateAcquiringMonthlyCost(rfq.demand || {}, proposal.terms || {});
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

function valueCell(field, value, best) {
  const formatted = fieldValue(field, value);
  const cell = el('td', { class: `num${formatted === null ? ' missing' : ''}${best ? ' best' : ''}` });
  if (formatted === null) { cell.append(el('span', { class: 'missing-text', text: 'não informado' })); return cell; }
  cell.append(el('span', { text: formatted }));
  if (best) {
    const why = field.direction === 'lower_is_better' ? 'menor valor informado' : 'maior valor informado';
    cell.append(el('span', { class: 'best-mark', title: why }, [icon(field.direction === 'lower_is_better' ? 'chevronDown' : 'chevronUp', { size: 12 }), el('span', { class: 'best-why', text: why })]));
  }
  return cell;
}

export function comparisonMatrix(rfq, proposals, { currentRevision = rfq.revision } = {}) {
  const wrap = el('div', { class: 'comparison' });
  if (!proposals.length) {
    wrap.append(emptyState({ title: 'Ainda não há propostas para comparar', text: 'Assim que os provedores convidados enviarem condições, elas aparecem lado a lado aqui.', iconName: 'scale' }));
    return wrap;
  }
  const byKey = fieldsByKey(rfq.product);
  wrap.append(el('p', { class: 'notice-line', id: 'comparison-notice' }, [icon('info', { size: 14 }), el('span', { text: NEUTRAL_RANKING_NOTICE })]));

  // Tabela larga: primeira coluna e cabeçalho fixos.
  const table = el('table', { class: 'matrix' });
  const head = el('tr', {}, el('th', { scope: 'col', class: 'matrix-corner', text: 'Condição' }));
  for (const proposal of proposals) {
    const cov = coverage(rfq.product, proposal.terms);
    const outdated = proposal.rfq_revision && currentRevision && proposal.rfq_revision < currentRevision;
    head.append(el('th', { scope: 'col', class: 'matrix-provider' }, [
      el('span', { class: 'matrix-name', text: proposal.provider_name }),
      el('span', { class: 'matrix-meta', text: `v${proposal.version ?? 1}${proposal.rfq_revision ? ` · rev. ${proposal.rfq_revision}` : ''}` }),
      outdated ? el('span', { class: 'matrix-flag' }, [icon('alert', { size: 12 }), el('span', { text: `Respondeu à revisão ${proposal.rfq_revision}` })]) : null,
      el('span', { class: 'matrix-coverage', title: 'Campos comparáveis preenchidos' }, [
        el('span', { class: 'coverage-bar' }, el('span', { class: 'coverage-fill', style: `width:${Math.round(cov.ratio * 100)}%` })),
        el('span', { text: `${cov.filled}/${cov.total} campos` })
      ])
    ]));
  }
  table.append(el('thead', {}, head));
  const body = el('tbody');
  for (const [group, keys] of GROUPS[rfq.product]) {
    const rows = keys.map((key) => byKey[key]).filter((field) => field && proposals.some((proposal) => proposal.terms?.[field.key] !== undefined && proposal.terms?.[field.key] !== null && proposal.terms?.[field.key] !== ''));
    if (!rows.length) continue;
    body.append(el('tr', { class: 'matrix-group' }, el('th', { scope: 'rowgroup', colspan: String(proposals.length + 1), text: group })));
    for (const field of rows) {
      const values = proposals.map((proposal) => proposal.terms?.[field.key] ?? null);
      const best = highlights(field, values);
      const tr = el('tr', {}, el('th', { scope: 'row', class: 'matrix-label' }, [el('span', { text: field.label }), definitionTip(field.key)]));
      values.forEach((value, index) => tr.append(valueCell(field, value, best[index])));
      body.append(tr);
    }
  }
  // Estimativa do Arandu, separada do que o provedor declarou.
  const estimates = proposals.map((proposal) => estimateFor(rfq, proposal));
  body.append(el('tr', { class: 'matrix-group' }, el('th', { scope: 'rowgroup', colspan: String(proposals.length + 1), text: 'Estimativa do Arandu (não é CET)' })));
  const estimateRow = el('tr', {}, el('th', { scope: 'row', class: 'matrix-label' }, [el('span', { text: rfq.product === 'credit' ? 'Custo total estimado' : 'Custo mensal estimado' }),
    el('span', { class: 'tip' }, [el('button', { type: 'button', class: 'tip-trigger', 'aria-label': 'Como é calculado', 'aria-describedby': 'estimate-help' }, icon('info', { size: 13 })),
      el('span', { role: 'tooltip', id: 'estimate-help', class: 'tip-text', text: rfq.product === 'credit' ? 'PRICE, pré-fixado, sem carência: parcela × prazo + tarifas. Sem tributos.' : 'Σ(volume × fatia × taxa) + custos fixos. Sem antecipação e sem tributos.' })])]));
  const totals = estimates.map((item) => (item.estimate ? item.total_cost : null));
  const presentTotals = totals.filter((value) => value !== null);
  estimates.forEach((item, index) => {
    const cell = el('td', { class: `num${item.estimate ? '' : ' missing'}` });
    if (item.estimate) {
      cell.append(el('span', { text: money(item.total_cost) }));
      if (presentTotals.length > 1 && new Set(presentTotals).size > 1 && totals[index] === Math.min(...presentTotals)) {
        cell.classList.add('best');
        cell.append(el('span', { class: 'best-mark', title: 'menor valor estimado' }, [icon('chevronDown', { size: 12 }), el('span', { class: 'best-why', text: 'menor valor estimado' })]));
      }
    } else cell.append(el('span', { class: 'missing-text', text: item.reason.replace(/^Estimativa não calculável: /, 'Não calculável: ') }));
    estimateRow.append(cell);
  });
  body.append(estimateRow);
  table.append(body);
  wrap.append(el('div', { class: 'matrix-scroll comparison-wide', tabindex: '0', role: 'region', 'aria-label': 'Tabela de comparação de propostas' }, table));

  // Celular: escolha de duas propostas lado a lado.
  const mobile = el('div', { class: 'comparison-cards compare-mobile' });
  const pickA = el('select', { 'aria-label': 'Primeira proposta' });
  const pickB = el('select', { 'aria-label': 'Segunda proposta' });
  proposals.forEach((proposal, index) => { pickA.add(new Option(proposal.provider_name, String(index))); pickB.add(new Option(proposal.provider_name, String(index))); });
  pickB.value = String(Math.min(1, proposals.length - 1));
  const pairBody = el('div', { class: 'pair-body' });
  const drawPair = () => {
    const chosen = [proposals[Number(pickA.value)], proposals[Number(pickB.value)]];
    pairBody.replaceChildren();
    for (const [group, keys] of GROUPS[rfq.product]) {
      const rows = keys.map((key) => byKey[key]).filter((field) => field && chosen.some((proposal) => proposal.terms?.[field.key] !== undefined && proposal.terms?.[field.key] !== null));
      if (!rows.length) continue;
      const section = el('section', { class: 'pair-group' }, el('h4', { class: 'pair-title', text: group }));
      for (const field of rows) {
        const values = chosen.map((proposal) => proposal.terms?.[field.key] ?? null);
        const best = highlights(field, values);
        section.append(el('div', { class: 'pair-row' }, [
          el('span', { class: 'pair-label', text: field.label }),
          ...values.map((value, index) => {
            const formatted = fieldValue(field, value);
            return el('span', { class: `pair-value${best[index] ? ` best best-${field.direction === 'lower_is_better' ? 'down' : 'up'}` : ''}${formatted === null ? ' missing' : ''}${field.type === 'text' ? ' text' : ''}` }, [
              el('span', { text: formatted ?? 'não informado' }),
              best[index] ? el('span', { class: 'sr-only', text: field.direction === 'lower_is_better' ? ' (menor valor informado)' : ' (maior valor informado)' }) : null
            ]);
          })
        ]));
      }
      pairBody.append(section);
    }
  };
  pickA.addEventListener('change', drawPair);
  pickB.addEventListener('change', drawPair);
  drawPair();
  mobile.append(el('div', { class: 'pair-pickers' }, [
    el('label', { class: 'pair-picker' }, [el('span', { class: 'field-label', text: 'Comparar' }), pickA]),
    el('span', { class: 'pair-vs', 'aria-hidden': 'true', text: 'vs' }),
    el('label', { class: 'pair-picker' }, [el('span', { class: 'field-label', text: 'com' }), pickB])
  ]), pairBody, el('p', { class: 'muted small', text: proposals.length > 2 ? `Há ${proposals.length} propostas. Troque os seletores para ver as demais, ou gire o aparelho para a tabela completa.` : 'Valores destacados indicam o menor ou maior valor informado — um fato, não uma recomendação.' }));
  wrap.append(mobile);
  return wrap;
}

/** Pesos definidos pela empresa. O resultado sempre carrega o aviso de autoria. */
export function weightsPanel(rfq, proposals, { onApplied = null } = {}) {
  const specs = PRODUCTS[rfq.product].proposalFields.filter((field) => field.comparable && field.direction).slice(0, 8);
  const panel = el('section', { class: 'card weights' });
  panel.append(el('div', { class: 'card-head' }, el('div', { class: 'card-head-text' }, [
    el('h3', { class: 'card-title', text: 'Seus critérios e pesos' }),
    el('p', { class: 'card-subtitle', text: 'Opcional. Defina a importância de cada critério para a sua empresa; o Arandu só faz a conta.' })
  ])));
  const form = el('form', { id: 'weights-form', class: 'weights-form' });
  for (const spec of specs) {
    const range = el('input', { type: 'range', min: '0', max: '100', step: '5', value: '0', name: spec.key, 'aria-label': `Peso de ${spec.label}` });
    const output = el('output', { class: 'weight-value', text: '0' });
    range.addEventListener('input', () => { output.textContent = range.value; });
    form.append(el('div', { class: 'weight-row' }, [el('span', { class: 'weight-label', text: spec.label }), range, output]));
  }
  const apply = button('Aplicar meus pesos', { variant: 'primary', type: 'submit', iconName: 'scale' });
  const clear = button('Zerar', { variant: 'ghost', onClick: () => { for (const input of form.querySelectorAll('input[type=range]')) { input.value = '0'; input.dispatchEvent(new Event('input')); } output.replaceChildren(); } });
  form.append(el('div', { class: 'form-actions' }, [clear, apply]));
  const output = el('div', { id: 'weights-output', role: 'status', 'aria-live': 'polite' });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const weights = {};
    for (const [key, value] of new FormData(form)) if (Number(value) > 0) weights[key] = Number(value);
    const scored = applyUserWeights(rfq.product, proposals, weights);
    output.replaceChildren();
    if (!scored.applied) { output.append(el('p', { class: 'muted', text: 'Defina ao menos um peso maior que zero. Sem pesos, a comparação continua estritamente factual.' })); return; }
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
  });
  panel.append(el('div', { class: 'card-body' }, [form, output]));
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

/** Botões de decisão do aprovador, com motivo obrigatório para recusar. */
export function approvalActions(ctx, request, { onDone }) {
  const actions = el('div', { class: 'approval-actions' });
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
      const result = await ctx.api('approvals/act', { method: 'POST', body: JSON.stringify({ request_id: request.id, action, comment }) });
      toast({ approved: result.status === 'pending' ? 'Aprovação registrada. O próximo aprovador foi avisado.' : 'Aprovação registrada.', rejected: 'Rejeição registrada.', changes_requested: 'Pedido de alterações registrado.' }[action]);
      onDone?.();
    } catch (error) {
      toast(error.message, 'error');
      for (const node of actions.querySelectorAll('button')) node.disabled = false;
    }
  };
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
    form.addEventListener('submit', async (event) => {
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
  document_uploaded: 'Documento anexado', document_version_added: 'Nova versão de documento', document_removed: 'Documento removido'
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

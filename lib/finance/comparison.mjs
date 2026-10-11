// Comparação factual de propostas financeiras.
//
// Regra de produto, aplicada aqui e no front: o Arandu NÃO recomenda provedor.
// Ele apresenta diferenças verificáveis ("menor MDR débito") e, quando a
// própria empresa define pesos, apresenta um resultado rotulado como
// "Resultado conforme os pesos definidos por você". Nenhuma ordenação
// ponderada é produzida sem pesos explícitos do usuário.

import { comparisonContext, normalizedCell, proposalChanges, proposalCurrency } from './comparison-context.mjs';
import { getProduct, proposalFields, demandFields, estimateCreditTotalCost, estimateAcquiringMonthlyCost } from './products.mjs';

export const NEUTRAL_RANKING_NOTICE = 'Comparação factual das condições informadas. O Arandu não recomenda instituições.';
export const USER_WEIGHTS_NOTICE = 'Resultado conforme os pesos definidos por você.';

/**
 * Abaixo desta cobertura, a pontuação responde por menos de 60% do peso que a
 * empresa definiu. Ela continua sendo exibida, mas separada das propostas
 * completas: comparar 1,0 sobre 20% do peso com 0,9 sobre 100% seria enganoso.
 */
export const LOW_COVERAGE_THRESHOLD = 0.6;

const DIRECTION_LABEL = {
  lower_is_better: 'menor valor informado',
  higher_is_better: 'maior valor informado'
};

function numericValue(field, value) {
  value = normalizedCell(field, value).value;
  if (value === null || value === undefined) return null;
  if (field.type === 'date') {
    const parsed = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * @param {string} productId
 * @param {Array<{id:string,provider_name?:string,terms:object}>} proposals
 * @returns {{product:string,notice:string,columns:Array,rows:Array,estimates:object}}
 */
export function buildComparison(productId, proposals, demand = {}, { asOf = new Date().toISOString().slice(0, 10), revision = null } = {}) {
  const product = getProduct(productId);
  if (!product) throw new Error('Produto financeiro inválido.');
  const list = Array.isArray(proposals) ? proposals : [];
  const context = comparisonContext(productId, list);
  const columns = list.map((proposal) => ({
    id: String(proposal.id),
    provider_name: proposal.provider_name || proposal.terms?.institution || 'Provedor',
    submitted_at: proposal.submitted_at || null,
    version: proposal.version ?? null,
    currency: proposalCurrency(proposal),
    currency_source: proposal.currency || proposal.terms?.currency ? 'declared' : 'schema_brl_v1',
    expired: Boolean(normalizedCell(proposalFields(productId).find(field => field.key === 'valid_until'), proposal.terms?.valid_until).value && proposal.terms.valid_until < asOf),
    validity_unknown: !normalizedCell(proposalFields(productId).find(field => field.key === 'valid_until'), proposal.terms?.valid_until).value,
    revision_mismatch: Boolean(revision && proposal.rfq_revision && revision !== proposal.rfq_revision),
    rfq_revision: proposal.rfq_revision ?? null,
    changed_keys: proposalChanges(productId, proposal, proposal.previous_version),
    history_available: Boolean(proposal.previous_version),
    previous_version: proposal.previous_version ? { version: proposal.previous_version.version, submitted_at: proposal.previous_version.submitted_at || null } : null,
    provenance: { source: proposal.submitted_at ? 'provider_submission' : 'not_available', document: null, author: null, verification: 'not_verified', version: proposal.version ?? null, submitted_at: proposal.submitted_at || null }
  }));

  const rows = [];
  for (const field of proposalFields(productId)) {
    const cells = list.map(proposal => normalizedCell(field, proposal?.terms?.[field.key]));
    const values = cells.map(cell => cell.value);
    const row = {
      key: field.key,
      label: field.label,
      type: field.type,
      values,
      states: cells.map(cell => cell.state),
      previous_values: list.map(proposal => normalizedCell(field, proposal.previous_version?.terms?.[field.key]).value),
      previous_states: list.map(proposal => normalizedCell(field, proposal.previous_version?.terms?.[field.key]).state),
      missing_count: cells.filter(cell => cell.state === 'missing').length,
      invalid_count: cells.filter(cell => cell.state === 'invalid').length,
      differs: new Set(cells.map(cell => JSON.stringify(cell))).size > 1,
      context_reasons: context.blocked[field.key] || [],
      comparable: Boolean(field.comparable && field.direction),
      highlights: [],
      highlight_reason: null
    };
    if (row.comparable && !row.context_reasons.length) {
      const numeric = values.map((value) => numericValue(field, value));
      const present = numeric.filter((value) => value !== null);
      if (present.length > 1) {
        const target = field.direction === 'lower_is_better' ? Math.min(...present) : Math.max(...present);
        const distinct = new Set(present);
        if (distinct.size > 1) {
          row.highlights = columns.filter((_, index) => numeric[index] === target).map((column) => column.id);
          row.highlight_reason = DIRECTION_LABEL[field.direction];
        }
      }
    }
    rows.push(row);
  }

  // O contexto exige premissas explícitas; as fórmulas existentes continuam
  // responsáveis pelos cálculos e pelas validações financeiras.
  const estimates = Object.fromEntries(list.map(proposal => [String(proposal.id), comparisonEstimate(productId, proposal, demand)]));

  return { product: productId, notice: NEUTRAL_RANKING_NOTICE, columns, rows, estimates, groups: context.groups, context_notices: context.notices, as_of: asOf, methodology: 'comparison-context-v1' };
}

function comparisonEstimate(product, proposal, demand) {
  if (proposalCurrency(proposal) !== 'BRL') return { estimate: false, reason: 'Estimativa não calculável: a metodologia atual utiliza BRL; nenhuma conversão foi aplicada.' };
  const fields = new Map(proposalFields(product).map(field => [field.key, field]));
  const missing = keys => keys.some(key => normalizedCell(fields.get(key), proposal.terms?.[key]).state !== 'present');
  if (product === 'credit') {
    if (missing(['index', 'amortization', 'grace_months', 'fees_amount'])) return { estimate: false, reason: 'Estimativa não calculável: informe indexador, amortização, carência e tarifas; ausência não é zero nem premissa padrão.' };
    return estimateCreditTotalCost(proposal.terms || {});
  }
  const demandSpecs = new Map(demandFields(product).map(field => [field.key, field]));
  if (['share_debit', 'share_credit_cash', 'share_credit_installment', 'share_pix', 'terminals'].some(key => normalizedCell(demandSpecs.get(key), demand?.[key]).state !== 'present') || missing(['gateway_cost']) || Number(demand?.terminals) > 0 && missing(['terminal_rent'])) {
    return { estimate: false, reason: 'Estimativa não calculável: informe o mix de recebimentos, quantidade de terminais e custos fixos aplicáveis; ausência não é zero.' };
  }
  return estimateAcquiringMonthlyCost(demand || {}, proposal.terms || {});
}

export function comparableFields(productId) {
  return proposalFields(productId)
    .filter((field) => field.comparable && field.direction)
    .map((field) => ({ key: field.key, label: field.label, direction: field.direction }));
}

/**
 * Pontuação ponderada definida pelo usuário.
 *
 * Normaliza cada critério por min-max dentro do conjunto comparado (0 = pior
 * valor informado para aquele critério, 1 = melhor) e aplica os pesos que a
 * própria empresa escolheu. Propostas sem valor no critério não recebem nota
 * naquele critério e o peso é redistribuído entre os critérios respondidos,
 * o que é registrado em `coverage`.
 */
export function applyUserWeights(productId, proposals, weights) {
  const available = new Map(comparableFields(productId).map((field) => [field.key, field]));
  const context = comparisonContext(productId, proposals);
  const cleaned = [];
  const excluded = [];
  for (const [key, rawWeight] of Object.entries(weights || {})) {
    const weight = Number(rawWeight);
    if (!available.has(key)) continue;
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) continue;
    if (context.blocked[key]) { excluded.push({ key, label: available.get(key).label, reasons: context.blocked[key] }); continue; }
    cleaned.push({ key, weight, direction: available.get(key).direction, label: available.get(key).label });
  }
  if (!cleaned.length) {
    return { applied: false, notice: excluded.length ? 'Os critérios escolhidos têm bases incompatíveis; revise as condições antes de pontuar.' : 'Defina ao menos um critério com peso maior que zero.', criteria: [], results: [], excluded_criteria: excluded };
  }
  const totalWeight = cleaned.reduce((sum, item) => sum + item.weight, 0);
  const list = Array.isArray(proposals) ? proposals : [];
  const fieldSpecs = new Map(proposalFields(productId).map((field) => [field.key, field]));

  const ranges = new Map();
  for (const criterion of cleaned) {
    const spec = fieldSpecs.get(criterion.key);
    const numbers = list.map((proposal) => numericValue(spec, proposal?.terms?.[criterion.key] ?? null)).filter((value) => value !== null);
    ranges.set(criterion.key, numbers.length ? { min: Math.min(...numbers), max: Math.max(...numbers) } : null);
  }

  const results = list.map((proposal) => {
    const breakdown = [];
    let weighted = 0;
    let answeredWeight = 0;
    for (const criterion of cleaned) {
      const spec = fieldSpecs.get(criterion.key);
      const value = numericValue(spec, proposal?.terms?.[criterion.key] ?? null);
      const range = ranges.get(criterion.key);
      if (value === null || !range) {
        breakdown.push({
          key: criterion.key, label: criterion.label, value: null,
          normalized: null, weight: criterion.weight, discriminates: null, answered: false
        });
        continue;
      }
      const span = range.max - range.min;
      // Quando todas as propostas informam o mesmo valor, o critério não
      // separa ninguém. Normalizar aqui por direção daria 1 para "maior é
      // melhor" e 0 para "menor é melhor" sobre exatamente o mesmo empate, e o
      // ranking passaria a depender da direção do campo, não das condições.
      // Empate vale 1 para todos: contribui igualmente e não altera a ordem.
      const discriminates = span !== 0;
      let normalized = 1;
      if (discriminates) {
        normalized = (value - range.min) / span;
        if (criterion.direction === 'lower_is_better') normalized = 1 - normalized;
      }
      weighted += normalized * criterion.weight;
      answeredWeight += criterion.weight;
      breakdown.push({
        key: criterion.key, label: criterion.label, value,
        normalized: Math.round(normalized * 1000) / 1000,
        weight: criterion.weight, discriminates, answered: true
      });
    }
    const coverage = Math.round((answeredWeight / totalWeight) * 1000) / 1000;
    return {
      id: String(proposal.id),
      provider_name: proposal.provider_name || proposal.terms?.institution || 'Provedor',
      score: answeredWeight ? Math.round((weighted / answeredWeight) * 1000) / 1000 : null,
      coverage,
      low_coverage: answeredWeight === 0 || coverage < LOW_COVERAGE_THRESHOLD,
      missing_criteria: breakdown.filter((item) => !item.answered).map((item) => item.label),
      breakdown
    };
  });

  // A pontuação é calculada sobre o peso que a proposta efetivamente respondeu.
  // Por isso uma proposta quase vazia pode alcançar nota alta com muito pouco
  // respondido. Ordenar as duas juntas esconderia essa diferença, então as de
  // baixa cobertura vão para depois — e a interface diz por quê.
  results.sort((a, b) => {
    if (a.low_coverage !== b.low_coverage) return a.low_coverage ? 1 : -1;
    return (b.score ?? -1) - (a.score ?? -1);
  });

  const nonDiscriminating = cleaned
    .filter((criterion) => {
      const range = ranges.get(criterion.key);
      return range && range.max === range.min;
    })
    .map((criterion) => criterion.label);

  return {
    applied: true,
    excluded_criteria: excluded,
    notice: USER_WEIGHTS_NOTICE,
    source: 'user_weights',
    // Menos de duas propostas comparáveis não produz ordenação com sentido.
    ranking_meaningful: results.length > 1,
    coverage_threshold: LOW_COVERAGE_THRESHOLD,
    has_low_coverage: results.some((result) => result.low_coverage),
    non_discriminating_criteria: nonDiscriminating,
    criteria: cleaned.map(({ key, label, weight, direction }) => ({
      key, label, weight, direction, share: Math.round((weight / totalWeight) * 1000) / 1000
    })),
    results
  };
}

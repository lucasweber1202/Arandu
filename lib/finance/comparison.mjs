// Comparação factual de propostas financeiras.
//
// Regra de produto, aplicada aqui e no front: o Arandu NÃO recomenda provedor.
// Ele apresenta diferenças verificáveis ("menor MDR débito") e, quando a
// própria empresa define pesos, apresenta um resultado rotulado como
// "Resultado conforme os pesos definidos por você". Nenhuma ordenação
// ponderada é produzida sem pesos explícitos do usuário.

import { getProduct, proposalFields, estimateCreditTotalCost, estimateAcquiringMonthlyCost } from './products.mjs';

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
export function buildComparison(productId, proposals, demand = {}) {
  const product = getProduct(productId);
  if (!product) throw new Error('Produto financeiro inválido.');
  const list = Array.isArray(proposals) ? proposals : [];
  const columns = list.map((proposal) => ({
    id: String(proposal.id),
    provider_name: proposal.provider_name || proposal.terms?.institution || 'Provedor',
    submitted_at: proposal.submitted_at || null,
    version: proposal.version ?? null
  }));

  const rows = [];
  for (const field of proposalFields(productId)) {
    const values = list.map((proposal) => proposal?.terms?.[field.key] ?? null);
    const row = {
      key: field.key,
      label: field.label,
      type: field.type,
      values,
      comparable: Boolean(field.comparable && field.direction),
      highlights: [],
      highlight_reason: null
    };
    if (row.comparable) {
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

  // A estimativa nunca é `null` silencioso: ou vem o número com fórmula e
  // premissas, ou vem o motivo pelo qual ela não pode ser calculada.
  const estimates = {};
  for (const proposal of list) {
    estimates[String(proposal.id)] = productId === 'credit'
      ? estimateCreditTotalCost(proposal?.terms || {})
      : estimateAcquiringMonthlyCost(demand || {}, proposal?.terms || {});
  }

  return { product: productId, notice: NEUTRAL_RANKING_NOTICE, columns, rows, estimates };
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
  const cleaned = [];
  for (const [key, rawWeight] of Object.entries(weights || {})) {
    const weight = Number(rawWeight);
    if (!available.has(key)) continue;
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) continue;
    cleaned.push({ key, weight, direction: available.get(key).direction, label: available.get(key).label });
  }
  if (!cleaned.length) {
    return { applied: false, notice: 'Defina ao menos um critério com peso maior que zero.', criteria: [], results: [] };
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

// Fatos confirmados → termos estruturados do contrato (Document Intelligence ×
// Contract Center). Até aqui a pessoa confirmava o valor na revisão e o
// digitava de novo no formulário de termos (docs/FINANCIAL_DOCUMENT_INTELLIGENCE.md).
//
// Regras:
//   * só fato `confirmed` com valor `present` (nunca extraído sem revisão,
//     ambíguo, ilegível ou "não informado");
//   * só campos com correspondência explícita no catálogo de termos; nada é
//     calculado, convertido de período ou de moeda;
//   * unidade incompatível (% a.m. num campo % a.a.) não vira sugestão;
//   * dois fatos confirmados com valores diferentes para o mesmo termo viram
//     conflito declarado, nunca uma escolha silenciosa;
//   * nada é gravado aqui: a tela só preenche campos vazios e a pessoa revisa
//     e grava a versão pelo fluxo existente (fin_record_contract_terms).
import { termField } from './contract-terms.mjs';

const lower = (value) => String(value).toLowerCase();
const AMORTIZATION = { price: 'price', sac: 'sac', bullet: 'bullet', custom: 'customizada' };

/** schema → campo do documento → termo do contrato (com conversão de forma, não de valor). */
export const FACT_TERM_MAP = Object.freeze({
  contract_terms: Object.freeze({
    amount_limit: { term: 'limit_amount' }, currency: { term: 'currency' },
    indexer: { term: 'indexer', map: lower }, spread_pct_year: { term: 'spread_pct_year', units: ['percent', 'percent_per_year'] },
    renewal: { term: 'renewal_terms' }, termination: { term: 'termination_rights' }
  }),
  credit_proposal: Object.freeze({
    amount: { term: 'principal_amount' }, currency: { term: 'currency' }, indexer: { term: 'indexer', map: lower },
    spread_pct_year: { term: 'spread_pct_year', units: ['percent', 'percent_per_year'] },
    amortization: { term: 'amortization', map: (value) => AMORTIZATION[value] },
    collateral: { term: 'guarantees' }, covenants: { term: 'covenants' }
  }),
  acquiring_proposal: Object.freeze({
    mdr_debit_pct: { term: 'mdr_debit_pct', units: ['percent'] }, mdr_credit_pct: { term: 'mdr_credit_pct', units: ['percent'] },
    mdr_installment_pct: { term: 'mdr_installment_pct', units: ['percent'] }, pix_fee_pct: { term: 'pix_pct', units: ['percent'] },
    anticipation_pct_month: { term: 'anticipation_pct_month', units: ['percent', 'percent_per_month'] },
    settlement_days: { term: 'settlement_days', units: [undefined, null, 'days'] }
  })
});

// { value } quando o fato preenche o termo; { reason } quando não preenche.
function termValue(spec, mapping, fact) {
  let value = fact.normalized_value;
  if (value === null || value === undefined || value === '') return { reason: 'invalid_value' };
  if (mapping.units && !mapping.units.includes(fact.unit ?? undefined) && !mapping.units.includes(fact.unit)) return { reason: 'unit_mismatch' };
  if (mapping.map) value = mapping.map(value);
  if (value === undefined || value === null) return { reason: 'invalid_value' };
  if (['money', 'percent', 'int'].includes(spec.type)) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < (spec.min ?? 0) || n > (spec.max ?? Infinity)) return { reason: 'invalid_value' };
    if (spec.type === 'int' && !Number.isInteger(n)) return { reason: 'invalid_value' };
    return { value: n };
  }
  if (spec.type === 'enum') return spec.options.includes(value) ? { value } : { reason: 'invalid_value' };
  if (spec.type === 'currency') return /^[A-Z]{3}$/.test(String(value)) ? { value: String(value) } : { reason: 'invalid_value' };
  const text = String(value).trim();
  return text && text.length <= (spec.max ?? 2000) && !/[<>]/.test(text) ? { value: text } : { reason: 'invalid_value' };
}

/**
 * @param {string} category  categoria do contrato (credit, acquiring, …)
 * @param {Array} facts      fatos com documento: { field_key, schema_key, status, value_state, normalized_value, unit, currency, page, confirmed_at, document_title }
 * @returns {{ suggestions: Array, conflicts: Array, unusable: Array, skipped: number }}
 *   `unusable`: fato confirmado de um termo do contrato que não o preenche
 *   (unidade diferente, valor fora do intervalo): declarado, nunca convertido.
 *   `skipped`: fatos sem confirmação, sem valor ou de campos sem termo.
 */
export function contractTermSuggestions(category, facts = []) {
  const byTerm = new Map();
  const unusable = [];
  let skipped = 0;
  for (const fact of facts) {
    if (fact?.status !== 'confirmed' || fact.value_state !== 'present') { skipped += 1; continue; }
    const mapping = FACT_TERM_MAP[fact.schema_key]?.[fact.field_key];
    const spec = mapping && termField(category, mapping.term);
    if (!spec) { skipped += 1; continue; }
    const source = { document_title: fact.document_title || null, page: fact.page ?? null, confirmed_at: fact.confirmed_at || null, currency: fact.currency || null };
    const result = termValue(spec, mapping, fact);
    if (!('value' in result)) { unusable.push({ key: mapping.term, label: spec.label, reason: result.reason, unit: fact.unit ?? null, source }); continue; }
    const { value } = result;
    const list = byTerm.get(mapping.term) || [];
    list.push({ value, source });
    byTerm.set(mapping.term, list);
  }
  const suggestions = [];
  const conflicts = [];
  for (const [key, list] of byTerm) {
    const distinct = [...new Set(list.map((item) => JSON.stringify(item.value)))];
    const label = termField(category, key).label;
    if (distinct.length > 1) conflicts.push({ key, label, values: list.map((item) => ({ value: item.value, source: item.source })) });
    else {
      // Fonte mais recente entre as que concordam.
      const source = list.map((item) => item.source).sort((a, b) => String(b.confirmed_at).localeCompare(String(a.confirmed_at)))[0];
      suggestions.push({ key, label, value: list[0].value, source });
    }
  }
  // Valores em moedas diferentes dentro do mesmo contrato não são comparáveis: viram conflito.
  const currencies = new Set(suggestions.map((s) => s.source.currency).filter(Boolean));
  const currencyTerm = suggestions.find((s) => s.key === 'currency');
  if (currencyTerm) currencies.add(currencyTerm.value);
  if (currencies.size > 1) {
    for (const s of suggestions.filter((item) => item.source.currency || item.key === 'currency')) {
      conflicts.push({ key: s.key, label: s.label, values: [{ value: s.value, source: s.source }], reason: 'currency_mismatch' });
    }
    return { suggestions: suggestions.filter((s) => !s.source.currency && s.key !== 'currency'), conflicts, unusable, skipped };
  }
  return { suggestions, conflicts, unusable, skipped };
}

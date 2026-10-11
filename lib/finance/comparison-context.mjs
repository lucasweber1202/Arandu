// Contrato factual da comparação: agrupamento, cobertura e incompatibilidade.
// Sem câmbio, ranking universal ou proveniência inferida de documentos.
import { normalize, proposalFields } from './products.mjs';

export const COMPARISON_GROUPS = Object.freeze({
  credit: [
    ['Valor e prazo', ['offered_amount', 'term_months', 'grace_months', 'amortization']],
    ['Taxas e custos', ['interest_rate_month', 'index', 'index_spread', 'cet_year', 'fees_amount', 'declared_total_cost']],
    ['Garantias e condições', ['collateral_required', 'conditions_precedent']],
    ['Validade e operação', ['valid_until', 'contracting_days', 'product_name', 'notes']]
  ],
  acquiring: [
    ['Taxas por modalidade', ['mdr_debit', 'mdr_credit_cash', 'mdr_credit_installment', 'pix_fee']],
    ['Antecipação e liquidação', ['anticipation_rate', 'settlement_days']],
    ['Custos fixos e saída', ['terminal_rent', 'gateway_cost', 'early_exit_penalty']],
    ['Contrato e condições', ['contract_months', 'chargeback_terms', 'extra_services', 'conditions_precedent']],
    ['Validade e operação', ['valid_until', 'contracting_days', 'product_name', 'notes']]
  ]
});

export function normalizedCell(field, raw) {
  if (raw === null || raw === undefined || raw === '' || (typeof raw === 'string' && !raw.trim())) return { value: null, state: 'missing' };
  // Dados históricos inválidos não podem ser convertidos em zero ou um.
  if (['money', 'number', 'percent', 'int'].includes(field.type) && !['string', 'number'].includes(typeof raw)) return { value: null, state: 'invalid' };
  const result = normalize([{ ...field, required: false }], { [field.key]: raw });
  return result.errors.length ? { value: null, state: 'invalid' } : { value: result.values[field.key] ?? null, state: Object.hasOwn(result.values, field.key) ? 'present' : 'missing' };
}

export function proposalCurrency(proposal) {
  const raw = proposal.currency ?? proposal.terms?.currency;
  if (raw === undefined || raw === null || raw === '') return 'BRL'; // unidade do schema v1, não uma conversão
  return /^[A-Z]{3}$/.test(String(raw)) ? String(raw) : null;
}

export function comparisonContext(product, proposals) {
  const list = Array.isArray(proposals) ? proposals : [];
  const reasons = new Map();
  const block = (keys, reason) => keys.forEach(key => reasons.set(key, [...(reasons.get(key) || []), reason]));
  const currencies = list.map(proposalCurrency);
  if (new Set(currencies).size > 1 || currencies.includes(null)) {
    block(proposalFields(product).filter(f => f.type === 'money').map(f => f.key), 'Moedas diferentes ou não identificadas; não há conversão cambial.');
    // A ponderação agregada também não compara operações em moedas distintas.
    block(proposalFields(product).filter(f => f.comparable).map(f => f.key), 'Operações em moedas incompatíveis.');
  }
  if (product === 'credit') {
    const fields = new Map(proposalFields(product).map(field => [field.key, field]));
    const values = key => list.map(p => normalizedCell(fields.get(key), p.terms?.[key]).value);
    if (new Set(values('index')).size > 1 || values('index').includes(null)) block(['interest_rate_month', 'index_spread', 'cet_year', 'declared_total_cost'], 'Indexadores distintos ou não informados; bases de taxa incompatíveis.');
    if (['offered_amount', 'term_months', 'grace_months', 'amortization'].some(key => new Set(values(key)).size > 1 || values(key).includes(null))) {
      block(['declared_total_cost'], 'Valor, prazo, carência ou amortização diferentes; custo total tem premissas distintas.');
    }
  }
  return { currencies, blocked: Object.fromEntries(reasons), notices: [...new Set([...reasons.values()].flat())], groups: COMPARISON_GROUPS[product] || [] };
}

export function proposalChanges(product, current, previous) {
  if (!previous) return [];
  return proposalFields(product).filter(field => JSON.stringify(normalizedCell(field, previous.terms?.[field.key])) !== JSON.stringify(normalizedCell(field, current.terms?.[field.key]))).map(field => field.key);
}

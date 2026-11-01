import { validateProductTerms, isProductDay } from './product-terms.mjs';

export const GUARANTEE_ECONOMICS_METHOD = 'bank-guarantee-explicit-cost-v1';
const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e12;
const decimal = v => {
  // Convert bounded JSON decimals without binary multiplication of money.
  const [whole, fraction = ''] = v.toFixed(8).split('.');
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'));
};
const rounded = (numerator, denominator) => {
  const cents = (numerator + denominator / 2n) / denominator;
  return cents > BigInt(Number.MAX_SAFE_INTEGER) ? null : Number(cents) / 100;
};
export function validateGuaranteeScenario(v) {
  return v && typeof v === 'object' && !Array.isArray(v)
    && Object.keys(v).every(k => ['label', 'period_start', 'period_end', 'currency', 'guaranteed_amount', 'source_reference'].includes(k))
    && typeof v.label === 'string' && v.label.trim().length >= 2 && v.label.length <= 80 && !/[<>]/.test(v.label)
    && isProductDay(v.period_start) && isProductDay(v.period_end) && v.period_start < v.period_end
    && typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency) && number(v.guaranteed_amount) && v.guaranteed_amount > 0 && Math.abs(v.guaranteed_amount * 100 - Math.round(v.guaranteed_amount * 100)) < 1e-6
    && typeof v.source_reference === 'string' && v.source_reference.trim().length >= 3 && v.source_reference.length <= 500 && !/[<>]/.test(v.source_reference);
}
export function guaranteeCost(productTerms, scenario) {
  const reasons = [];
  if (!validateGuaranteeScenario(scenario)) return { comparable: false, total: null, reasons: ['invalid_scenario'] };
  if (validateProductTerms('guarantee', productTerms).length || productTerms.modality !== 'bank_guarantee') return { comparable: false, total: null, reasons: ['unsupported_or_incomplete_guarantee_terms'] };
  const v = productTerms.values;
  if (scenario.currency !== v.currency) reasons.push('currency_mismatch');
  if (scenario.period_start < v.valid_from || scenario.period_end > v.valid_until) reasons.push('outside_contractual_validity');
  if (scenario.guaranteed_amount > v.guaranteed_amount) reasons.push('amount_exceeds_declared_guarantee');
  if (reasons.length) return { comparable: false, total: null, reasons };
  const days = (Date.parse(scenario.period_end) - Date.parse(scenario.period_start)) / 86400000;
  const basis = v.day_count === 'ACT/360' ? 360 : 365;
  const commission = rounded(decimal(scenario.guaranteed_amount) * decimal(v.commission_pct_year) * BigInt(days) * 100n, 100000000n * 100000000n * 100n * BigInt(basis));
  const upfront = scenario.period_start === v.valid_from ? Math.round(v.upfront_fee * 100) / 100 : 0;
  const expenses = scenario.period_start === v.valid_from ? Math.round(v.other_expenses * 100) / 100 : 0;
  if (commission === null || !Number.isSafeInteger(Math.round(commission * 100) + Math.round(upfront * 100) + Math.round(expenses * 100))) return { comparable: false, total: null, reasons: ['numeric_precision_limit'] };
  return { comparable: true, reasons: [], total: (Math.round(commission * 100) + Math.round(upfront * 100) + Math.round(expenses * 100)) / 100,
    currency: v.currency, components: { commission, upfront_fee: upfront, other_expenses: expenses },
    inputs: { ...v, scenario_amount: scenario.guaranteed_amount, days, basis },
    formula: 'amount × annual_percent / 100 × actual_days / basis; one-off fees at valid_from only',
    convention: '[period_start, period_end), actual UTC calendar days; constant declared base; simple accrual; component rounding to cents' };
}
export function compareGuarantees(sources, scenarios) {
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 10 || !Array.isArray(scenarios) || scenarios.length < 1 || scenarios.length > 10 || scenarios.some(s => !validateGuaranteeScenario(s))) throw new Error('invalid_guarantee_analysis');
  return { methodology: GUARANTEE_ECONOMICS_METHOD, result_type: 'declared_explicit_charges_scenario', persistence: 'not_persisted',
    scenarios: scenarios.map(scenario => ({ scenario: { ...scenario, provenance: 'user_declared_scenario' },
      results: sources.map(source => ({ source: source.reference, ...guaranteeCost(source.product_terms, scenario) })) })),
    limitations: ['Explicit bank-guarantee charges only; not market valuation, expected loss, tax, collateral funding or total financial cost.',
      'Versioned terms are compared as declared scenarios; no implied approval, acceptance, contract execution or realized savings.',
      'No default institution ranking. Fees are assumed in the stated currency, on the constant scenario base.'] };
}

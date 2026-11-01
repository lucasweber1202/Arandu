// Structured contractual representation, not market pricing or RFQ enablement.
export const PRODUCT_TERMS_VERSION = 'financial-product-terms-1';
const LABELS = { source_reference: 'Referência da fonte', beneficiary: 'Beneficiário', currency: 'Moeda', guaranteed_amount: 'Valor garantido', valid_from: 'Início da vigência', valid_until: 'Fim da vigência', commission_pct_year: 'Comissão anual (%)', day_count: 'Convenção de dias', upfront_fee: 'Despesa inicial', other_expenses: 'Outras despesas iniciais', base_currency: 'Moeda base', quote_currency: 'Moeda cotada', base_amount: 'Valor na moeda base', agreed_rate: 'Taxa contratada (cotada por base)', trade_on: 'Data de contratação', settles_on: 'Data de liquidação', side: 'Direção contratual', fixing_on: 'Data de fixação', settlement_currency: 'Moeda de liquidação', fixing_source: 'Fonte de fixação', notional: 'Valor nocional', starts_on: 'Início', ends_on: 'Fim', pay_index: 'Indexador da perna pagadora', receive_index: 'Indexador da perna recebedora', pay_spread_pct_year: 'Spread pagador (% a.a.)', receive_spread_pct_year: 'Spread recebedor (% a.a.)', payment_frequency: 'Periodicidade contratual', notional_exchange: 'Troca de principal' };
const field = (key, type, unit, extra = {}) => ({ key, label: LABELS[key], type, unit, required: true, ...(type === 'number' ? { decimal_places: unit === 'currency_amount' ? 2 : 8 } : {}), ...extra });
const currency = key => field(key, 'currency', 'ISO_4217');
const money = key => field(key, 'number', 'currency_amount', { min: 0.01, max: 1e12 });
const date = key => field(key, 'date', 'ISO_date');
const rate = key => field(key, 'number', 'percent_per_year', { min: 0, max: 1000 });
const text = key => field(key, 'text', 'declared_text', { maxLength: 200 });
const choice = (key, options) => field(key, 'enum', 'convention', { options });
const common = [text('source_reference')];
const fx = [currency('base_currency'), currency('quote_currency'), money('base_amount'), field('agreed_rate', 'number', 'quote_per_base', { min: 0.00000001, max: 1e9 }), date('trade_on'), date('settles_on'), choice('side', ['buy_base', 'sell_base'])];
export const PRODUCT_TERM_SCHEMAS = Object.freeze({
  bank_guarantee: { category: 'guarantee', family: 'guarantees', fields: [...common, text('beneficiary'), currency('currency'), money('guaranteed_amount'), date('valid_from'), date('valid_until'), rate('commission_pct_year'), choice('day_count', ['ACT/365F', 'ACT/360']), field('upfront_fee', 'number', 'currency_amount', { min: 0, max: 1e9 }), field('other_expenses', 'number', 'currency_amount', { min: 0, max: 1e9 })], methodology: 'bank-guarantee-explicit-cost-v1' },
  fx_spot: { category: 'fx', family: 'fx', fields: [...common, ...fx], methodology: null },
  fx_forward: { category: 'fx', family: 'hedge', fields: [...common, ...fx], methodology: null },
  ndf: { category: 'fx', family: 'hedge', fields: [...common, ...fx, date('fixing_on'), currency('settlement_currency'), text('fixing_source')], methodology: null },
  swap: { category: 'fx', family: 'hedge', fields: [...common, currency('currency'), money('notional'), date('starts_on'), date('ends_on'), text('pay_index'), text('receive_index'), rate('pay_spread_pct_year'), rate('receive_spread_pct_year'), choice('day_count', ['ACT/365F', 'ACT/360', '30E/360']), text('payment_frequency'), choice('notional_exchange', ['none', 'initial_final', 'final'])], methodology: null }
});
export const isProductDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v && v >= '1950-01-01' && v <= '2150-12-31';
export function validateProductTerms(category, input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['schema_version', 'modality', 'values'].includes(k)) || input.schema_version !== PRODUCT_TERMS_VERSION) return ['invalid_product_terms_version'];
  const schema = Object.hasOwn(PRODUCT_TERM_SCHEMAS, input.modality) ? PRODUCT_TERM_SCHEMAS[input.modality] : null;
  if (!schema || schema.category !== category) return ['incompatible_product_modality'];
  const values = input.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) return ['invalid_product_values'];
  if (Object.keys(values).some(k => !schema.fields.some(f => f.key === k))) errors.push('unknown_product_field');
  for (const f of schema.fields) {
    const v = values[f.key];
    if (!Object.hasOwn(values, f.key)) { if (f.required) errors.push(`missing_${f.key}`); continue; }
    if (f.type === 'number' && !(typeof v === 'number' && Number.isFinite(v) && v >= f.min && v <= f.max && Math.abs(v * 10 ** f.decimal_places - Math.round(v * 10 ** f.decimal_places)) < 1e-6)) errors.push(`invalid_${f.key}`);
    if (f.type === 'date' && !isProductDay(v)) errors.push(`invalid_${f.key}`);
    if (f.type === 'currency' && !(typeof v === 'string' && /^[A-Z]{3}$/.test(v))) errors.push(`invalid_${f.key}`);
    if (f.type === 'text' && !(typeof v === 'string' && v.trim().length >= 2 && v.length <= f.maxLength && !/[<>\u0000-\u001f]/.test(v))) errors.push(`invalid_${f.key}`);
    if (f.type === 'enum' && !f.options.includes(v)) errors.push(`invalid_${f.key}`);
  }
  for (const [a, b] of [['valid_from', 'valid_until'], ['trade_on', 'settles_on'], ['starts_on', 'ends_on'], ['trade_on', 'fixing_on'], ['fixing_on', 'settles_on']]) if (values[a] && values[b] && values[a] > values[b]) errors.push(`invalid_period_${a}_${b}`);
  if (values.base_currency && values.base_currency === values.quote_currency) errors.push('identical_currency_pair');
  if (input.modality === 'ndf' && ![values.base_currency, values.quote_currency].includes(values.settlement_currency)) errors.push('unsupported_settlement_currency');
  return [...new Set(errors)];
}

export function productTermMetadata(modality) {
  const schema = Object.hasOwn(PRODUCT_TERM_SCHEMAS, modality) ? PRODUCT_TERM_SCHEMAS[modality] : null;
  return schema ? { ...schema, version: PRODUCT_TERMS_VERSION, modality, source: 'declared_contract_terms', rfq_enabled: false,
    limitations: ['No market valuation, curves, hedge pricing or execution.', 'Terms must be explicitly sourced; no inferred rates or currency conversion.'] } : null;
}

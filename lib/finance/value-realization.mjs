// Procurement value, never accounting or a provider recommendation.
export const VALUE_KINDS = Object.freeze({ NEGOTIATED_SAVINGS: 'Economia negociada', REALIZED_SAVINGS: 'Economia realizada', COST_AVOIDANCE: 'Custo evitado' });
export const VALUE_DIMENSIONS = Object.freeze(['service', 'unit', 'volume', 'indexer', 'term_months', 'amortization', 'fees', 'guarantee', 'grace_months']);
export const VALUE_CURRENCIES = Object.freeze(['BRL', 'USD', 'EUR', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'CNY', 'MXN', 'ARS', 'CLP', 'COP', 'PEN']);
const day = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const text = (v, max = 1000) => typeof v === 'string' && v.trim().length >= 3 && v.length <= max && !/[<>]/.test(v);
const cost = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1e12 && Math.abs(v * 100 - Math.round(v * 100)) < 0.000001;
export function validateValueInput(v) {
  if (!v || !['NEGOTIATED_SAVINGS', 'COST_AVOIDANCE'].includes(v.kind)) return 'Tipo estimado inválido; realização exige observação verificada.';
  if (!text(v.title, 200) || !text(v.reason) || !text(v.evidence_reference, 200)) return 'Informe título, justificativa e referência da evidência, sem HTML.';
  const b = v.baseline;
  if (!b || !['contract', 'proposal', 'approved_budget', 'manual', 'import'].includes(b.source) || !text(b.reference, 200) || !day(b.as_of)) return 'Baseline exige fonte, referência e data válida.';
  if (!VALUE_CURRENCIES.includes(v.currency) || b.currency !== v.currency || b.unit !== 'period_total') return 'Moeda suportada e unidade period_total iguais são obrigatórias.';
  if (!day(v.period_start) || !day(v.period_end) || v.period_start > v.period_end || b.as_of > v.period_start || b.period_start !== v.period_start || b.period_end !== v.period_end) return 'Baseline e destino devem cobrir o mesmo período, posterior à data do baseline.';
  if (!cost(b.amount) || !cost(v.target_amount)) return 'Custos totais devem ser números finitos, não negativos, até 1 trilhão.';
  if (!['comparable', 'incomplete', 'not_comparable'].includes(v.comparability)) return 'Declare a comparabilidade.';
  for (const d of [b.dimensions, v.target_dimensions]) {
    if (!d || Array.isArray(d) || typeof d !== 'object' || Object.keys(d).some((k) => !VALUE_DIMENSIONS.includes(k)) || JSON.stringify(d).length > 4000 || /[<>]/.test(JSON.stringify(d))) return 'Dimensões fora do catálogo de comparação.';
  }
  if (v.comparability === 'comparable' && VALUE_DIMENSIONS.some((k) => !(k in b.dimensions) || !(k in v.target_dimensions) || b.dimensions[k] === null || b.dimensions[k] === '' || JSON.stringify(b.dimensions[k]) !== JSON.stringify(v.target_dimensions[k]))) return 'Todos os critérios econômicos precisam ser conhecidos e iguais; spread isolado não prova economia.';
  return null;
}
export function valueAmount(v) {
  return v.comparability === 'comparable' ? Math.round((v.baseline.amount - v.target_amount) * 100) / 100 : null;
}
export function validateObservation(v) {
  if (!v || !cost(v.observed_amount) || !VALUE_CURRENCIES.includes(v.currency) || !day(v.period_start) || !day(v.period_end) || v.period_start > v.period_end || v.period_end >= new Date().toISOString().slice(0, 10) || v.coverage !== 'complete' || v.verified !== true || !['statement', 'invoice', 'import', 'manual'].includes(v.source) || !text(v.evidence_reference, 200) || !text(v.verification_reason)) return 'Observação exige custo total, moeda válida, período encerrado, cobertura completa, referência e confirmação humana.';
  return null;
}
export function valueFilters(params) {
  const kind = params.get('kind') || null;
  const currency = params.get('currency') || null;
  const product = params.get('product') || null;
  const start = params.get('start') || `${new Date().getUTCFullYear()}-01-01`;
  const end = params.get('end') || `${new Date().getUTCFullYear()}-12-31`;
  const limit = Number(params.get('limit') || 25);
  if (product && !['credit', 'acquiring'].includes(product) || kind && !VALUE_KINDS[kind] || currency && !VALUE_CURRENCIES.includes(currency) || !day(start) || !day(end) || start > end || Date.parse(end) - Date.parse(start) > 366 * 5 * 86400000 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Filtros de valor inválidos; intervalo máximo de cinco anos e limite até 50.');
  return { kind, currency, product, start, end, limit };
}

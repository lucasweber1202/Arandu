// Bank Fee Intelligence: tarifa contratada × tarifa observada, com origem,
// comparabilidade e revisão humana. Fato, nunca acusação: o Arandu diz que há
// diferença frente à referência contratada; só uma pessoa interpreta.
// O banco (docs/supabase-financial-fee-intelligence.sql) repete cada checagem
// e é quem calcula e congela a comparação.
import { VALUE_CURRENCIES } from './value-realization.mjs';

export const FEE_CURRENCIES = VALUE_CURRENCIES;
export const FEE_CATEGORIES = /* @__PURE__ */ Object.freeze({
  account_maintenance: 'Manutenção de conta', payments: 'Pagamentos', collections: 'Cobrança', transfers: 'Transferências (TED/PIX)',
  cards: 'Cartões', acquiring: 'Adquirência', credit: 'Crédito', fx: 'Câmbio', cash_management: 'Cash management', guarantee: 'Garantias/fianças', other: 'Outra'
});
export const CHARGING_UNITS = /* @__PURE__ */ Object.freeze({
  per_month: 'Por mês', per_year: 'Por ano', one_off: 'Única', per_transaction: 'Por transação', per_item: 'Por item',
  percent_of_volume: '% do volume', percent_of_amount: '% do valor'
});
export const PRICING_MODELS = /* @__PURE__ */ Object.freeze({
  fixed_amount: 'Valor fixo', per_unit: 'Por unidade', percentage: 'Percentual', basis_points: 'Basis points', tiered_per_unit: 'Faixas por unidade (graduado)'
});
// Unidade econômica compatível com cada modelo (o banco recusa o resto).
export const MODEL_UNITS = /* @__PURE__ */ Object.freeze({
  fixed_amount: ['per_month', 'per_year', 'one_off'], per_unit: ['per_transaction', 'per_item'], tiered_per_unit: ['per_transaction', 'per_item'],
  percentage: ['percent_of_volume', 'percent_of_amount'], basis_points: ['percent_of_volume', 'percent_of_amount']
});
export const SCHEDULE_SOURCES = /* @__PURE__ */ Object.freeze({ contract_terms: 'Termos do contrato', contract_document: 'Documento do contrato', amendment: 'Aditivo', declared: 'Declaração documentada' });
// Origens aceitas hoje: todas registradas por uma pessoa (manual_entry). API e
// extração de documento não existem como canal; o banco recusa.
export const OBSERVATION_SOURCES = /* @__PURE__ */ Object.freeze({
  manual: 'Declaração manual', bank_statement: 'Extrato bancário', erp: 'Relatório do ERP', tms: 'Relatório do TMS', bank_file: 'Arquivo do banco', other_import: 'Outra planilha/importação'
});
export const COMPARISON = /* @__PURE__ */ Object.freeze({ comparable: 'Comparável', not_comparable: 'Não comparável', missing_reference: 'Sem referência contratada' });
export const DIRECTIONS = /* @__PURE__ */ Object.freeze({ above: 'Acima da referência contratada', below: 'Abaixo da referência contratada', equal: 'Igual à referência contratada' });
export const REASONS = /* @__PURE__ */ Object.freeze({
  missing_contracted_reference: 'Sem referência contratada para este serviço', charging_unit_mismatch: 'Unidade de cobrança diferente da contratada',
  no_reference_for_period: 'Nenhuma versão contratada vigente no início do período', reference_changed_in_period: 'A referência contratada mudou dentro do período',
  currency_mismatch: 'Moeda diferente da contratada', missing_volume: 'Volume ausente', missing_base_amount: 'Base de cálculo ausente',
  period_not_normalizable: 'Período não normalizável (meses-calendário completos)', minimum_maximum_requires_single_month: 'Mínimo/máximo exige um mês-calendário'
});
export const REVIEW_STATUS = /* @__PURE__ */ Object.freeze({
  not_required: 'Sem revisão necessária', new: 'Revisão necessária', under_review: 'Em revisão', confirmed: 'Diferença confirmada por pessoa',
  explained: 'Explicada', dismissed: 'Descartada', resolved: 'Resolvida'
});
export const REVIEW_TRANSITIONS = /* @__PURE__ */ Object.freeze({ new: ['under_review', 'dismissed'], under_review: ['confirmed', 'explained', 'dismissed'], confirmed: ['resolved'], explained: ['resolved'] });
export const REVIEW_REASONS = /* @__PURE__ */ Object.freeze({
  review_started: 'Revisão iniciada', contract_terms_confirmed: 'Termos contratuais conferidos', pricing_exception_agreed: 'Exceção de preço acordada',
  volume_or_base_corrected: 'Volume ou base corrigidos', timing_difference: 'Diferença de competência', reference_outdated: 'Referência contratada desatualizada',
  data_entry_error: 'Erro de lançamento interno', duplicate_or_superseded: 'Duplicada ou substituída', provider_contacted: 'Provedor contatado',
  credit_received: 'Crédito recebido', other: 'Outro'
});

// Catálogo servido à interface pela API (fonte única de rótulos e opções).
export const FEE_CATALOG = /* @__PURE__ */ Object.freeze({
  currencies: FEE_CURRENCIES, categories: FEE_CATEGORIES, units: CHARGING_UNITS, models: PRICING_MODELS, schedule_sources: SCHEDULE_SOURCES, sources: OBSERVATION_SOURCES,
  comparison: COMPARISON, directions: DIRECTIONS, reasons: REASONS, review: REVIEW_STATUS, transitions: REVIEW_TRANSITIONS, review_reasons: REVIEW_REASONS
});

const day = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString?.().slice(0, 10) === v;
const isDay = (v) => { try { return day(v); } catch { return false; } };
const text = (v, max = 200, min = 3) => typeof v === 'string' && v.trim().length >= min && v.length <= max && !/[<>]/.test(v);
const amount = (v, max = 1e12, places = 2) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max && Math.abs(v * 10 ** places - Math.round(v * 10 ** places)) < 1e-6;
const optional = (v, check) => v === undefined || v === null || check(v);

export function validateFeeVersion(unit, v) {
  if (!v || !PRICING_MODELS[v.pricing_model]) return 'Escolha o modelo de cobrança.';
  if (!MODEL_UNITS[v.pricing_model].includes(unit)) return 'Modelo de cobrança incompatível com a unidade econômica.';
  if (!FEE_CURRENCIES.includes(v.currency)) return 'Moeda fora do catálogo.';
  if (!SCHEDULE_SOURCES[v.source] || !text(v.source_reference)) return 'Informe a fonte e a referência da tarifa contratada.';
  if (!optional(v.effective_from, isDay) || !optional(v.contract_version, (n) => Number.isInteger(n) && n > 0)) return 'Vigência ou versão do contrato inválida.';
  if (!optional(v.minimum_amount, (n) => amount(n)) || !optional(v.maximum_amount, (n) => amount(n)) || (v.minimum_amount != null && v.maximum_amount != null && v.minimum_amount > v.maximum_amount)) return 'Mínimo e máximo devem ser valores válidos, com mínimo ≤ máximo.';
  if (v.pricing_model === 'tiered_per_unit') {
    const tiers = v.tiers;
    if (!Array.isArray(tiers) || tiers.length < 2 || tiers.length > 10 || (v.rate !== undefined && v.rate !== null)) return 'Faixas: de 2 a 10, sem taxa única.';
    let previous = 0;
    for (const [index, tier] of tiers.entries()) {
      const last = index === tiers.length - 1;
      if (!tier || !amount(tier.rate, 1e12, 6)) return 'Cada faixa precisa de taxa válida.';
      if (last ? tier.up_to !== null && tier.up_to !== undefined : !(Number.isInteger(tier.up_to) && tier.up_to > previous)) return 'Faixas crescentes, a última sem limite superior.';
      if (!last) previous = tier.up_to;
    }
    return null;
  }
  if (v.tiers !== undefined && v.tiers !== null) return 'Faixas só no modelo graduado.';
  if (!amount(v.rate, 1e12, 6)) return 'Taxa contratada inválida.';
  if (v.pricing_model === 'percentage' && v.rate > 100) return 'Percentual acima de 100.';
  if (v.pricing_model === 'basis_points' && v.rate > 10000) return 'Basis points acima de 10.000.';
  return null;
}

export function validateFeeSchedule(v) {
  if (!v || !text(v.service, 120, 2) || !FEE_CATEGORIES[v.category] || !CHARGING_UNITS[v.charging_unit]) return 'Informe serviço, categoria e unidade de cobrança.';
  return validateFeeVersion(v.charging_unit, v);
}

export function validateFeeObservation(v, today = new Date().toISOString().slice(0, 10)) {
  if (!v || !text(v.service, 120, 2) || !CHARGING_UNITS[v.charging_unit] || !FEE_CURRENCIES.includes(v.currency)) return 'Informe serviço, unidade e moeda da cobrança observada.';
  if (!isDay(v.period_start) || !isDay(v.period_end) || v.period_start > v.period_end || v.period_end > today) return 'Período encerrado e válido é obrigatório.';
  if ((Date.parse(v.period_end) - Date.parse(v.period_start)) / 86400000 > 366) return 'Período máximo de um ano por observação.';
  if (!amount(v.observed_amount)) return 'Valor observado deve ser número finito, não negativo, com até duas casas.';
  if (!optional(v.volume, (n) => amount(n, 1e12, 6)) || !optional(v.base_amount, (n) => amount(n))) return 'Volume e base devem ser números válidos quando informados.';
  if (!OBSERVATION_SOURCES[v.source_type] || !text(v.source_reference) || !text(v.evidence_reference) || !optional(v.source_object_id, (s) => text(s, 200, 1))) return 'Origem, referência da fonte e evidência são obrigatórias.';
  return null;
}

export function validateFeeReview(current, v) {
  if (!v || !(REVIEW_TRANSITIONS[current] || []).includes(v.to_status)) return 'Transição de revisão não permitida.';
  if (!REVIEW_REASONS[v.reason_code] || !text(v.notes, 2000)) return 'Informe motivo e notas da revisão.';
  if (['confirmed', 'explained', 'resolved'].includes(v.to_status) && !text(v.evidence_reference)) return 'Esta etapa exige referência de evidência.';
  if (v.to_status === 'resolved' && !text(v.resolution, 1000)) return 'Descreva a resolução.';
  if (!optional(v.evidence_reference, (s) => text(s)) || !optional(v.resolution, (s) => text(s, 1000))) return 'Evidência ou resolução inválidas.';
  return null;
}

export function feeFilters(params) {
  const year = new Date().getUTCFullYear();
  const pick = (k) => params.get(k) || null;
  const f = { start: pick('start') || `${year}-01-01`, end: pick('end') || `${year}-12-31`, category: pick('category'), currency: pick('currency'), review: pick('review_status'), comparison: pick('comparison'), limit: Number(params.get('limit') || 25) };
  if (!isDay(f.start) || !isDay(f.end) || f.start > f.end || Date.parse(f.end) - Date.parse(f.start) > 366 * 5 * 86400000
    || (f.category && !FEE_CATEGORIES[f.category]) || (f.currency && !FEE_CURRENCIES.includes(f.currency)) || (f.review && !REVIEW_STATUS[f.review])
    || (f.comparison && !COMPARISON[f.comparison]) || !Number.isInteger(f.limit) || f.limit < 1 || f.limit > 50) throw new Error('Filtros de tarifas inválidos; intervalo máximo de cinco anos e limite até 50.');
  return f;
}

/** Cobertura factual, sem score: quantos itens têm o dado que permite comparar. */
export function feeCoverage(row) {
  return { schedules: `${row.schedules_observed}/${row.schedules} tarifas contratadas com observação comparável`, verified: `${row.verified}/${row.observations} observações verificadas` };
}

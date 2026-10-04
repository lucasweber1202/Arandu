// Contract & Renewal Center v2 — catálogo dos termos estruturados de contrato.
//
// O contrato deixa de ser "PDF + datas": termos materiais viram campos com
// tipo, unidade e versão. Regras:
//   * só entra o que está no catálogo (allowlist); o resto é recusado e listado;
//   * nenhum valor é inferido nem calculado aqui — é o que a empresa registrou
//     a partir do contrato assinado (origem `contract_document`/`declared`);
//   * mudança material nunca sobrescreve: vira versão nova (correção
//     justificada ou aditivo), com diff determinístico entre versões;
//   * o banco repete as checagens de forma (fin_valid_contract_terms).

export const CONTRACT_CATEGORIES = /* @__PURE__ */ Object.freeze({
  credit: 'Crédito empresarial',
  acquiring: 'Adquirência e meios de pagamento',
  cash_management: 'Cash management / serviços bancários',
  guarantee: 'Garantia / fiança / seguro-garantia',
  fx: 'Câmbio',
  insurance: 'Seguro',
  other: 'Outro produto financeiro'
});
export const SOURCING_CATEGORIES = /* @__PURE__ */ Object.freeze(['credit', 'acquiring']);

export const INDEXERS = /* @__PURE__ */ Object.freeze(['pre', 'cdi', 'ipca', 'selic', 'tr', 'tjlp', 'sofr', 'usd', 'other']);
export const AMORTIZATION = /* @__PURE__ */ Object.freeze(['price', 'sac', 'bullet', 'customizada']);
export const FEE_UNITS = /* @__PURE__ */ Object.freeze(['per_month', 'per_transaction', 'per_item', 'percent_of_volume', 'percent_of_amount', 'one_off', 'per_year']);
export const MILESTONE_KINDS = /* @__PURE__ */ Object.freeze({
  notice: 'Prazo de aviso prévio', repricing: 'Janela de repricing', renewal_decision: 'Decisão de renovação',
  termination_window: 'Janela de rescisão', obligation: 'Obrigação recorrente', custom: 'Marco próprio'
});
export const RECURRENCES = /* @__PURE__ */ Object.freeze({ none: 'Única', monthly: 'Mensal', quarterly: 'Trimestral', semiannual: 'Semestral', annual: 'Anual' });

const money = (key, label) => ({ key, label, type: 'money', min: 0, max: 1e13 });
const percent = (key, label, max = 1000) => ({ key, label, type: 'percent', min: 0, max });
const text = (key, label, max = 2000) => ({ key, label, type: 'text', max });

/** Termos comuns a qualquer contrato financeiro. */
const COMMON = [
  text('contract_number', 'Número do contrato', 80),
  { key: 'currency', label: 'Moeda do contrato', type: 'currency' },
  text('parties', 'Partes adicionais (garantidores, intervenientes)', 1000),
  money('principal_amount', 'Valor principal contratado'),
  money('limit_amount', 'Limite contratado'),
  { key: 'indexer', label: 'Indexador', type: 'enum', options: INDEXERS },
  percent('spread_pct_year', 'Spread (% a.a.)', 100),
  percent('rate_pct_month', 'Taxa (% a.m.)', 100),
  percent('rate_pct_year', 'Taxa (% a.a.)', 1000),
  { key: 'amortization', label: 'Amortização', type: 'enum', options: AMORTIZATION },
  text('payment_schedule', 'Cronograma de pagamento (resumo)', 1000),
  text('guarantees', 'Garantias', 2000),
  text('covenants', 'Covenants (texto contratual)', 4000),
  text('sla', 'Níveis de serviço (SLA)', 2000),
  text('termination_rights', 'Direitos de rescisão', 2000),
  text('repricing_terms', 'Condições de repricing', 2000),
  text('renewal_terms', 'Condições de renovação', 2000),
  { key: 'fees', label: 'Tarifas contratadas', type: 'fees' }
];

const ACQUIRING = [
  percent('mdr_debit_pct', 'MDR débito (%)', 100),
  percent('mdr_credit_pct', 'MDR crédito à vista (%)', 100),
  percent('mdr_installment_pct', 'MDR parcelado (%)', 100),
  percent('pix_pct', 'Tarifa PIX (%)', 100),
  percent('anticipation_pct_month', 'Antecipação (% a.m.)', 100),
  { key: 'settlement_days', label: 'Prazo de liquidação (dias)', type: 'int', min: 0, max: 365 }
];

export function contractTermFields(category) {
  return category === 'acquiring' ? [...COMMON, ...ACQUIRING] : COMMON;
}
export function termField(category, key) {
  return contractTermFields(category).find((field) => field.key === key) || null;
}

function normalizeFees(value, errors) {
  if (value === undefined || value === null || value === '') return undefined;
  if (!Array.isArray(value)) { errors.push('Tarifas contratadas: informe uma lista.'); return undefined; }
  if (value.length > 50) { errors.push('Tarifas contratadas: no máximo 50 itens.'); return undefined; }
  const out = [];
  for (const [index, raw] of value.entries()) {
    const service = String(raw?.service ?? '').trim();
    const unit = String(raw?.unit ?? '').trim();
    const amount = Number(raw?.amount);
    if (service.length < 2 || service.length > 120 || /[<>]/.test(service)) { errors.push(`Tarifa ${index + 1}: serviço entre 2 e 120 caracteres.`); continue; }
    if (!FEE_UNITS.includes(unit)) { errors.push(`Tarifa ${index + 1}: unidade de cobrança inválida.`); continue; }
    if (!Number.isFinite(amount) || amount < 0 || amount > 1e9) { errors.push(`Tarifa ${index + 1}: valor inválido.`); continue; }
    out.push({ service, unit, amount: Math.round(amount * 1e6) / 1e6 });
  }
  return out;
}

/**
 * Normaliza termos. Devolve `{ values, errors, rejected }`: `rejected` lista as
 * chaves fora do catálogo (descartadas, nunca guardadas).
 */
export function normalizeContractTerms(category, input = {}) {
  const errors = [];
  const values = {};
  const fields = contractTermFields(category);
  const known = new Set(fields.map((field) => field.key));
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const rejected = Object.keys(source).filter((key) => !known.has(key));
  for (const field of fields) {
    const raw = source[field.key];
    if (raw === undefined || raw === null || raw === '') continue;
    if (field.type === 'fees') { const fees = normalizeFees(raw, errors); if (fees?.length) values.fees = fees; continue; }
    if (field.type === 'text') {
      const value = String(raw).trim();
      if (value.length > field.max || /[<>]/.test(value)) errors.push(`${field.label}: até ${field.max} caracteres, sem HTML.`);
      else if (value) values[field.key] = value;
      continue;
    }
    if (field.type === 'currency') {
      const value = String(raw).trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(value)) errors.push(`${field.label}: código ISO de três letras.`); else values[field.key] = value;
      continue;
    }
    if (field.type === 'enum') {
      if (!field.options.includes(raw)) errors.push(`${field.label}: opção inválida.`); else values[field.key] = raw;
      continue;
    }
    const number = Number(typeof raw === 'string' ? raw.replace(',', '.') : raw);
    if (!Number.isFinite(number) || number < field.min || number > field.max || (field.type === 'int' && !Number.isInteger(number))) {
      errors.push(`${field.label}: valor fora do intervalo aceito.`);
      continue;
    }
    values[field.key] = field.type === 'int' ? number : Math.round(number * 1e6) / 1e6;
  }
  return { values, errors, rejected };
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Diff factual entre duas versões de termos: o que mudou, de qual valor para
 * qual. Sem julgamento ("melhor", "pior") — só o fato.
 */
export function diffContractTerms(category, before = {}, after = {}) {
  const changes = [];
  for (const field of contractTermFields(category)) {
    const previous = before?.[field.key];
    const next = after?.[field.key];
    if (same(previous, next)) continue;
    changes.push({
      key: field.key, label: field.label,
      change: previous === undefined || previous === null ? 'added' : next === undefined || next === null ? 'removed' : 'changed',
      before: previous ?? null, after: next ?? null
    });
  }
  return changes;
}

/** Termos efetivos: versão mais recente com efeito até a data. */
export function effectiveTerms(versions = [], onDate = new Date().toISOString().slice(0, 10)) {
  const applicable = versions
    .filter((row) => !row.effective_from || String(row.effective_from) <= onDate)
    .sort((a, b) => b.version - a.version);
  return applicable[0] || null;
}

/** Próxima ocorrência de um marco recorrente. */
export function nextOccurrence(dueOn, recurrence) {
  const months = { monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[recurrence];
  if (!months) return null;
  const [year, month, day] = String(dueOn).split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

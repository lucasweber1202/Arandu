// P1.4 Proposal & Document Intelligence — domínio puro.
//
// Um fato extraído é DADO com proveniência (documento, versão, página/posição,
// método, versão do parser, confiança, estado de revisão), nunca autoridade.
// Campo crítico só vale depois de confirmação humana. Valor ausente nunca é
// inventado: vira `not_provided`, `unreadable` ou `ambiguous`.
// Texto vindo de documento é conteúdo não confiável: só é lido como valor de
// um campo conhecido do schema; nada nele altera instruções, autorização,
// tenant, schema ou policies.

export const VALUE_STATES = Object.freeze({
  present: 'Presente no documento',
  not_provided: 'Não informado no documento',
  not_applicable: 'Não se aplica',
  unreadable: 'Ilegível ou não extraível',
  ambiguous: 'Ambíguo (mais de um valor)',
  needs_confirmation: 'Precisa de confirmação'
});
export const FACT_STATUS = Object.freeze({
  extracted: 'Extraído (não confirmado)',
  needs_review: 'Revisão necessária',
  confirmed: 'Confirmado por pessoa',
  rejected: 'Rejeitado',
  superseded: 'Substituído por correção'
});
export const EXTRACTION_STATUS = Object.freeze({
  processing: 'Em processamento', completed: 'Concluída', failed: 'Falhou', cancelled: 'Cancelada'
});
export const METHODS = Object.freeze({
  deterministic_parser: 'Leitor determinístico', manual_entry: 'Digitação manual', model: 'Modelo de extração', fixture: 'Fixture de teste'
});
export const PROVIDERS = Object.freeze({
  manual: 'Digitação manual', deterministic_v1: 'Leitor determinístico v1', model_external: 'Provedor de modelo externo'
});
export const FAILURE_CODES = Object.freeze({
  unsupported_format: 'Formato sem leitor configurado (ex.: imagem sem OCR)',
  provider_not_configured: 'Provedor de extração não configurado',
  unreadable: 'Documento ilegível ou sem texto extraível',
  encrypted: 'Documento protegido por senha',
  hash_mismatch: 'Conteúdo não confere com o hash registrado no envio',
  too_large: 'Documento acima do limite de processamento',
  parse_error: 'Falha ao interpretar o documento'
});
// Confiança mínima para um campo NÃO crítico sair como "extraído" sem fila de
// revisão. Campo crítico vai sempre para revisão, qualquer confiança.
export const REVIEW_THRESHOLD = 0.85;

const MONEY = 'money', PERCENT = 'percent', INTEGER = 'integer', DATE = 'date', TEXT = 'text', ENUM = 'enum', DECIMAL = 'decimal';
const f = (key, label, type, critical, synonyms, extra = {}) => Object.freeze({ key, label, type, critical, synonyms: Object.freeze(synonyms), ...extra });

// Schemas por Product Pack. `synonyms` são rótulos (pt/en) aceitos pelo leitor
// determinístico; só campos daqui podem ser criados a partir de um documento.
export const SCHEMAS = Object.freeze({
  credit_proposal: Object.freeze({ label: 'Proposta de crédito', fields: Object.freeze([
    f('amount', 'Valor', MONEY, true, ['valor', 'valor da operação', 'montante', 'amount', 'principal', 'limite']),
    f('currency', 'Moeda', ENUM, true, ['moeda', 'currency'], { values: ['BRL', 'USD', 'EUR'] }),
    f('tenor_months', 'Prazo (meses)', INTEGER, true, ['prazo', 'prazo (meses)', 'tenor', 'term', 'prazo total']),
    f('indexer', 'Indexador', ENUM, true, ['indexador', 'index', 'benchmark', 'taxa de referência'], { values: ['CDI', 'SELIC', 'IPCA', 'TR', 'PRE', 'SOFR'] }),
    f('spread_pct_year', 'Spread (% a.a.)', PERCENT, true, ['spread', 'spread a.a.', 'sobretaxa', 'margem']),
    f('all_in_rate_pct_year', 'Custo total (% a.a.)', PERCENT, false, ['cet', 'custo efetivo total', 'all-in', 'all in', 'taxa total']),
    f('upfront_fee_pct', 'Comissão inicial (%)', PERCENT, false, ['tarifa de estruturação', 'comissão', 'flat', 'upfront fee', 'fee de estruturação']),
    f('amortization', 'Amortização', ENUM, false, ['amortização', 'amortization'], { values: ['bullet', 'price', 'sac', 'custom'] }),
    f('grace_months', 'Carência (meses)', INTEGER, false, ['carência', 'grace period', 'carencia']),
    f('collateral', 'Garantias', TEXT, false, ['garantia', 'garantias', 'collateral']),
    f('covenants', 'Covenants', TEXT, false, ['covenants', 'covenant', 'obrigações financeiras']),
    f('validity_date', 'Validade da proposta', DATE, true, ['validade', 'válida até', 'valid until', 'validade da proposta'])
  ]) }),
  acquiring_proposal: Object.freeze({ label: 'Proposta de adquirência', fields: Object.freeze([
    f('mdr_debit_pct', 'MDR débito (%)', PERCENT, true, ['mdr débito', 'taxa débito', 'debit mdr']),
    f('mdr_credit_pct', 'MDR crédito à vista (%)', PERCENT, true, ['mdr crédito', 'mdr crédito à vista', 'taxa crédito', 'credit mdr']),
    f('mdr_installment_pct', 'MDR parcelado (%)', PERCENT, true, ['mdr parcelado', 'taxa parcelado', 'installment mdr']),
    f('pix_fee_pct', 'Pix (%)', PERCENT, false, ['pix', 'taxa pix']),
    f('anticipation_pct_month', 'Antecipação (% a.m.)', PERCENT, true, ['antecipação', 'taxa de antecipação', 'anticipation']),
    f('settlement_days', 'Prazo de liquidação (dias)', INTEGER, false, ['liquidação', 'prazo de liquidação', 'settlement']),
    f('minimum_volume', 'Volume mínimo mensal', MONEY, false, ['volume mínimo', 'minimum volume', 'faturamento mínimo']),
    f('terminal_fee', 'Aluguel/terminal (mensal)', MONEY, false, ['aluguel', 'terminal', 'pos']),
    f('validity_date', 'Validade da proposta', DATE, true, ['validade', 'válida até', 'valid until'])
  ]) }),
  fee_schedule: Object.freeze({ label: 'Tabela de tarifas', fields: Object.freeze([
    f('service', 'Serviço', TEXT, true, ['serviço', 'service', 'tarifa']),
    f('charging_unit', 'Unidade de cobrança', ENUM, true, ['unidade', 'unidade de cobrança', 'unit'], { values: ['per_month', 'per_year', 'one_off', 'per_transaction', 'per_item', 'percent_of_volume', 'percent_of_amount'] }),
    f('rate', 'Taxa', DECIMAL, true, ['taxa', 'valor unitário', 'rate', 'preço']),
    f('currency', 'Moeda', ENUM, true, ['moeda', 'currency'], { values: ['BRL', 'USD', 'EUR'] }),
    f('minimum_amount', 'Mínimo mensal', MONEY, false, ['mínimo', 'minimum']),
    f('effective_from', 'Vigente desde', DATE, true, ['vigência', 'vigente desde', 'effective from', 'início da vigência'])
  ]) }),
  contract_terms: Object.freeze({ label: 'Termos de contrato/aditivo', fields: Object.freeze([
    f('start_date', 'Início da vigência', DATE, true, ['início', 'data de início', 'start date', 'vigência a partir de']),
    f('end_date', 'Fim da vigência', DATE, true, ['término', 'vencimento', 'fim da vigência', 'end date', 'data de término']),
    f('notice_days', 'Aviso prévio (dias)', INTEGER, true, ['aviso prévio', 'notice period', 'aviso']),
    f('amount_limit', 'Valor/limite', MONEY, true, ['valor', 'limite', 'valor do contrato', 'amount']),
    f('currency', 'Moeda', ENUM, true, ['moeda', 'currency'], { values: ['BRL', 'USD', 'EUR'] }),
    f('indexer', 'Indexador', ENUM, false, ['indexador', 'index'], { values: ['CDI', 'SELIC', 'IPCA', 'TR', 'PRE', 'SOFR'] }),
    f('spread_pct_year', 'Spread (% a.a.)', PERCENT, false, ['spread', 'sobretaxa']),
    f('renewal', 'Renovação', TEXT, false, ['renovação', 'renewal']),
    f('termination', 'Rescisão', TEXT, false, ['rescisão', 'termination'])
  ]) })
});

export const schemaField = (schemaKey, fieldKey) => SCHEMAS[schemaKey]?.fields.find((x) => x.key === fieldKey) || null;

const deaccent = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const canon = (s) => deaccent(s).toLowerCase().replace(/[^a-z0-9%.]+/g, ' ').trim();

/** Rótulo → campo do schema; null quando não é um rótulo conhecido. */
export function matchField(schemaKey, label) {
  const bare = (s) => canon(s).replace(/[:.]+$/, '').trim();
  const key = bare(label);
  if (!key || key.length > 80) return null;
  for (const field of SCHEMAS[schemaKey]?.fields || []) if (field.synonyms.some((s) => bare(s) === key)) return field;
  return null;
}

// --------------------------------------------------------------- conteúdo não confiável
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g;
const INSTRUCTION = /(ignore|disregard|forget)\s+(all|any|the|previous|prior|above)\b|system\s*prompt|you\s+are\s+now|act\s+as\b|new\s+instructions?|<\s*\/?\s*(script|iframe|system)|ignore\s+as\s+instru|desconsidere\s+(as|todas)|aprove\s+(esta|automaticamente)|approve\s+(this|automatically)|escolha\s+(este|o)\s+banco|select\s+this\s+(bank|provider)|tool\s*call|function\s*call|\bBEGIN\s+(PROMPT|INSTRUCTIONS)\b/i;

/**
 * Trata texto de documento como dado: remove controles e caracteres de
 * direção, limita tamanho e sinaliza trechos com cara de instrução para o
 * revisor. NUNCA executa nem obedece o conteúdo.
 */
export function untrustedText(value, max = 2000) {
  const text = String(value ?? '').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const flags = INSTRUCTION.test(text) ? ['instruction_like_content'] : [];
  return { text, flags };
}

// --------------------------------------------------------------- normalização
// "1,234" ou "1.234": milhar (en/pt) ou decimal (pt/en)? Não se adivinha.
const ONE_SEPARATOR_THREE_DIGITS = /^\d{1,3}[.,]\d{3}$/;
const NUMBER = /^[-+]?(\d{1,3}([.,\s]\d{3})+|\d+)([,.]\d+)?$/;
export function parseNumber(raw) {
  let s = String(raw ?? '').replace(/(r\$|us\$|usd|brl|eur|€|\$)/gi, '').replace(/\s+/g, '').trim();
  if (!s) return null;
  const neg = s.startsWith('-');
  s = s.replace(/^[-+]/, '');
  // "1.234,56" (pt) | "1,234.56" (en) | "1234,5" | "1234.5"
  if (/,\d{1,6}$/.test(s) && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{1,6}$/.test(s) && s.includes(',')) s = s.replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s) * (neg ? -1 : 1);
  return Number.isFinite(n) ? n : null;
}
const MULT = [[/\bbi(lh(a|õ)o|lh(o|õ)es)?\b|\bbn\b|\bbillion\b/i, 1e9], [/\bmi(lh(a|õ)o|lh(o|õ)es)?\b|\bmm\b|\bmillion\b/i, 1e6], [/\bmil\b|\bk\b|\bthousand\b/i, 1e3]];

function parseDate(raw) {
  const s = String(raw ?? '').trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  let y, mo, d;
  if (m) [, y, mo, d] = m;
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [, d, mo, y] = m;
  else return null;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const t = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso ? null : iso;
}

const ENUM_SYNONYMS = {
  BRL: ['brl', 'real', 'reais', 'r$'], USD: ['usd', 'dolar', 'dólar', 'us$', 'dollar'], EUR: ['eur', 'euro', '€'],
  CDI: ['cdi', 'di'], SELIC: ['selic'], IPCA: ['ipca'], TR: ['tr'], PRE: ['pre', 'pré', 'prefixado', 'fixed', 'fixa'], SOFR: ['sofr'],
  bullet: ['bullet', 'no vencimento', 'parcela única'], price: ['price', 'tabela price', 'parcelas iguais'], sac: ['sac', 'amortização constante'], custom: ['customizada', 'custom', 'personalizada'],
  per_month: ['mensal', 'por mês', 'per month', 'monthly'], per_year: ['anual', 'por ano', 'per year', 'yearly'], one_off: ['única', 'unica', 'one-off', 'one off', 'por evento'],
  per_transaction: ['por transação', 'por transacao', 'per transaction'], per_item: ['por item', 'por unidade', 'per item'],
  percent_of_volume: ['% do volume', 'percentual do volume', 'percent of volume'], percent_of_amount: ['% do valor', 'percentual do valor', 'percent of amount']
};

/**
 * Normaliza um valor bruto conforme o tipo do campo. Nunca inventa: o que não
 * cabe no tipo vira `unreadable` (com o bruto preservado).
 * Retorna { value_state, normalized, unit, currency }.
 */
export function normalizeValue(field, raw) {
  const { text } = untrustedText(raw, 500);
  if (!text) return { value_state: 'not_provided', normalized: null };
  if (/^(n\/?a|não se aplica|nao se aplica|not applicable)$/i.test(text)) return { value_state: 'not_applicable', normalized: null };
  if (/^(-|—|não informado|nao informado|not provided|a definir|tbd)$/i.test(text)) return { value_state: 'not_provided', normalized: null };
  switch (field.type) {
    case MONEY: {
      const currency = /us\$|usd|dólar|dolar/i.test(text) ? 'USD' : /€|eur/i.test(text) ? 'EUR' : /r\$|brl|reais/i.test(text) ? 'BRL' : null;
      const mult = MULT.find(([re]) => re.test(text));
      const numeric = text.replace(/[a-zà-ú$€]+/gi, ' ').trim().split(/\s+/)[0];
      if (ONE_SEPARATOR_THREE_DIGITS.test(numeric) && !mult) return { value_state: 'ambiguous', normalized: null };
      const n = NUMBER.test(numeric.replace(/\s/g, '')) ? parseNumber(numeric) : null;
      if (n === null || n < 0) return { value_state: 'unreadable', normalized: null };
      return { value_state: 'present', normalized: Math.round(n * (mult ? mult[1] : 1) * 100) / 100, currency };
    }
    case PERCENT: {
      const m = /([-+]?\d[\d.,]*)\s*%?\s*(a\.?\s*a\.?|ao ano|a\.?\s*m\.?|ao m[eê]s|p\.?\s*a\.?|per annum)?/i.exec(text);
      const n = m ? parseNumber(m[1]) : null;
      if (n === null || n < 0 || n > 1000) return { value_state: 'unreadable', normalized: null };
      const period = m[2] ? (/m/i.test(m[2]) && !/p\.?\s*a|annum|ano/i.test(m[2]) ? 'month' : 'year') : null;
      return { value_state: 'present', normalized: n, unit: period ? `percent_per_${period}` : 'percent' };
    }
    case DECIMAL: {
      if (ONE_SEPARATOR_THREE_DIGITS.test(text.split(/\s+/)[0])) return { value_state: 'ambiguous', normalized: null };
      const n = parseNumber(text.split(/\s+/)[0]);
      return n === null || n < 0 ? { value_state: 'unreadable', normalized: null } : { value_state: 'present', normalized: n };
    }
    case INTEGER: {
      const m = /^(\d{1,4})\s*(dias?|days?|meses|m[eê]s|months?|anos?|years?)?$/i.exec(text);
      if (!m) return { value_state: 'unreadable', normalized: null };
      let n = Number(m[1]);
      if (/anos?|years?/i.test(m[2] || '') && /months/.test(field.key)) n *= 12;
      return { value_state: 'present', normalized: n, unit: field.key.endsWith('_days') ? 'days' : field.key.endsWith('_months') ? 'months' : undefined };
    }
    case DATE: {
      const iso = parseDate(text);
      return iso ? { value_state: 'present', normalized: iso } : { value_state: 'unreadable', normalized: null };
    }
    case ENUM: {
      const t = canon(text);
      const hits = field.values.filter((v) => [v, ...(ENUM_SYNONYMS[v] || [])].some((s) => canon(s) === t || (canon(s).length > 3 && t.includes(canon(s)))));
      if (hits.length === 1) return { value_state: 'present', normalized: hits[0] };
      return { value_state: hits.length > 1 ? 'ambiguous' : 'unreadable', normalized: null };
    }
    default:
      return { value_state: 'present', normalized: text.slice(0, 500) };
  }
}

/**
 * Estado inicial de um fato decidido pelas regras (o banco reaplica a mesma
 * regra): crítico, ausente, ambíguo ou de baixa confiança → revisão.
 */
export function initialStatus({ critical, value_state: state, confidence }) {
  return !critical && state === 'present' && Number(confidence) >= REVIEW_THRESHOLD ? 'extracted' : 'needs_review';
}

/** Validação do fato antes de enviar ao banco (o banco revalida). */
export function validateFact(schemaKey, fact) {
  if (!fact || typeof fact !== 'object') return 'Fato inválido.';
  const field = schemaField(schemaKey, fact.field_key);
  if (!field) return `Campo fora do schema: ${String(fact.field_key).slice(0, 60)}.`;
  if (!(fact.value_state in VALUE_STATES)) return 'Estado do valor inválido.';
  if (!(fact.method in METHODS)) return 'Método de extração inválido.';
  if (fact.confidence !== null && fact.confidence !== undefined && !(Number.isFinite(fact.confidence) && fact.confidence >= 0 && fact.confidence <= 1)) return 'Confiança deve estar entre 0 e 1.';
  if (fact.page !== null && fact.page !== undefined && !(Number.isInteger(fact.page) && fact.page >= 1 && fact.page <= 2000)) return 'Página inválida.';
  if (fact.locator !== undefined && fact.locator !== null && (typeof fact.locator !== 'string' || fact.locator.length > 120 || /[<>]/.test(fact.locator))) return 'Posição inválida.';
  if (typeof fact.raw_value === 'string' && fact.raw_value.length > 2000) return 'Valor bruto longo demais.';
  if (fact.value_state === 'present' && (fact.normalized_value === null || fact.normalized_value === undefined)) return 'Valor presente exige valor normalizado.';
  return null;
}

// --------------------------------------------------------------- diff semântico
const PRIORITY = { confirmed: 0, extracted: 1, needs_review: 2 };
/** Um valor por campo: confirmado > extraído > em revisão; rejeitado/substituído saem. */
export function factMap(facts) {
  const map = new Map();
  for (const x of facts || []) {
    if (!(x.status in PRIORITY)) continue;
    const prev = map.get(x.field_key);
    if (!prev || PRIORITY[x.status] < PRIORITY[prev.status]) map.set(x.field_key, x);
  }
  return map;
}
const fmtNum = (n) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(n);
function impactOf(field, a, b) {
  if (typeof a !== 'number' || typeof b !== 'number') return null;
  const d = Math.round((b - a) * 1e6) / 1e6;
  if (field.type === PERCENT) return `${d > 0 ? '+' : ''}${fmtNum(d)} p.p.`;
  if (field.type === INTEGER) return `${d > 0 ? '+' : ''}${d}${field.key.endsWith('_days') ? ' dias' : field.key.endsWith('_months') ? ' meses' : ''}`;
  if (field.type === MONEY || field.type === DECIMAL) return `${d > 0 ? '+' : ''}${fmtNum(d)} (mesma moeda somente)`;
  return null;
}
/**
 * Compara dois conjuntos de fatos campo a campo. Saída factual: antes,
 * depois, impacto aritmético e proveniência de cada lado. Sem recomendação,
 * sem juízo de melhor/pior.
 */
export function semanticDiff(schemaKey, beforeFacts, afterFacts) {
  const schema = SCHEMAS[schemaKey];
  if (!schema) throw new Error('schema desconhecido');
  const a = factMap(beforeFacts), b = factMap(afterFacts);
  return schema.fields.map((field) => {
    const x = a.get(field.key), y = b.get(field.key);
    const va = x?.value_state === 'present' ? x.normalized_value : null;
    const vb = y?.value_state === 'present' ? y.normalized_value : null;
    let change;
    if (!x && !y) change = 'absent_both';
    else if (!x || (x.value_state !== 'present' && y?.value_state === 'present')) change = 'added';
    else if (!y || (y.value_state !== 'present' && x.value_state === 'present')) change = 'removed';
    else if (x.value_state !== y.value_state) change = 'state_changed';
    else change = JSON.stringify(va) === JSON.stringify(vb) && (x.unit || null) === (y.unit || null) && (x.currency || null) === (y.currency || null) ? 'unchanged' : 'changed';
    const sameCurrency = (x?.currency || null) === (y?.currency || null);
    return {
      field: field.key, label: field.label, critical: field.critical, change,
      before: x ? { value: va, state: x.value_state, unit: x.unit || null, currency: x.currency || null, provenance: provenanceOf(x) } : null,
      after: y ? { value: vb, state: y.value_state, unit: y.unit || null, currency: y.currency || null, provenance: provenanceOf(y) } : null,
      impact: change === 'changed' && sameCurrency && (x.unit || null) === (y.unit || null) ? impactOf(field, va, vb) : null,
      unconfirmed: [x, y].some((z) => z && z.status !== 'confirmed')
    };
  });
}
export function provenanceOf(x) {
  return { fact_id: x.id || null, document_id: x.document_id || null, document_version: x.document_version ?? null, page: x.page ?? null, locator: x.locator || null,
    method: x.method || null, parser_version: x.parser_version || null, confidence: x.confidence ?? null, status: x.status || null,
    confirmed_by: x.confirmed_by || null, confirmed_at: x.confirmed_at || null, created_at: x.created_at || null, source: x.source || 'extraction' };
}
/** Termos estruturados (proposta/contrato) como "fatos" de fonte declarada para o mesmo diff. */
export function factsFromTerms(schemaKey, terms, source) {
  const out = [];
  for (const field of SCHEMAS[schemaKey]?.fields || []) {
    if (!terms || !(field.key in terms) || terms[field.key] === null || terms[field.key] === '') continue;
    const n = normalizeValue(field, terms[field.key]);
    out.push({ field_key: field.key, ...n, normalized_value: n.normalized, status: 'confirmed', method: 'manual_entry', source, confidence: 1 });
  }
  return out;
}

// --------------------------------------------------------------- evals
/**
 * Métricas por campo sobre um dataset rotulado. `expected` usa os mesmos
 * estados de valor; `predicted` vem do leitor. Tolerância numérica relativa.
 */
export function evaluateExtraction(cases, { tolerance = 1e-6 } = {}) {
  const per = {};
  for (const c of cases) {
    const predicted = factMap(c.predicted.map((x) => ({ ...x, status: x.status || 'extracted' })));
    for (const [key, exp] of Object.entries(c.expected)) {
      const m = (per[key] ||= { total: 0, exact: 0, normalized: 0, numeric: 0, required_hits: 0, required: 0, false_positive: 0, absent_expected: 0 });
      m.total += 1;
      const p = predicted.get(key);
      if (exp.value_state === 'present') {
        m.required += 1;
        if (p?.value_state === 'present') {
          m.required_hits += 1;
          if (p.raw_value !== undefined && exp.raw !== undefined && String(p.raw_value).trim() === String(exp.raw).trim()) m.exact += 1;
          if (JSON.stringify(p.normalized_value) === JSON.stringify(exp.value)) m.normalized += 1;
          if (typeof exp.value === 'number' && typeof p.normalized_value === 'number' && Math.abs(p.normalized_value - exp.value) <= Math.abs(exp.value) * tolerance + 1e-9) m.numeric += 1;
          else if (typeof exp.value !== 'number' && JSON.stringify(p.normalized_value) === JSON.stringify(exp.value)) m.numeric += 1;
        }
      } else {
        m.absent_expected += 1;
        if (p?.value_state === 'present') m.false_positive += 1;
      }
    }
  }
  const out = {};
  for (const [key, m] of Object.entries(per)) {
    out[key] = {
      total: m.total,
      exact_match: m.required ? m.exact / m.required : null,
      normalized_match: m.required ? m.normalized / m.required : null,
      numeric_tolerance_match: m.required ? m.numeric / m.required : null,
      required_field_recall: m.required ? m.required_hits / m.required : null,
      false_positive_rate: m.absent_expected ? m.false_positive / m.absent_expected : 0
    };
  }
  return out;
}
/** Limiares por criticidade: crítico exige mais, e mesmo passando continua exigindo confirmação humana. */
export const EVAL_THRESHOLDS = Object.freeze({
  critical: { normalized_match: 0.95, required_field_recall: 0.95, false_positive_rate: 0 },
  standard: { normalized_match: 0.85, required_field_recall: 0.8, false_positive_rate: 0.05 }
});
export function evalGate(schemaKey, metrics) {
  const failures = [];
  for (const [key, m] of Object.entries(metrics)) {
    const field = schemaField(schemaKey, key);
    if (!field) { failures.push(`${key}: campo fora do schema`); continue; }
    const t = EVAL_THRESHOLDS[field.critical ? 'critical' : 'standard'];
    if (m.normalized_match !== null && m.normalized_match < t.normalized_match) failures.push(`${key}: normalized_match ${m.normalized_match.toFixed(2)} < ${t.normalized_match}`);
    if (m.required_field_recall !== null && m.required_field_recall < t.required_field_recall) failures.push(`${key}: recall ${m.required_field_recall.toFixed(2)} < ${t.required_field_recall}`);
    if (m.false_positive_rate > t.false_positive_rate) failures.push(`${key}: falso positivo ${m.false_positive_rate.toFixed(2)} > ${t.false_positive_rate}`);
  }
  return failures;
}

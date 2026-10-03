// Financial Passport — o perfil financeiro reutilizável da empresa compradora.
//
// Este módulo é puro (sem rede, sem banco) e é lido pela API, pela interface e
// pelos testes. Ele define:
//   * o catálogo de campos por contexto (Empresa, Crédito, Adquirência,
//     Documentação), com tipo e período de revisão declarados;
//   * o frescor determinístico de cada campo (`current`, `review_due`, `stale`);
//   * a cobertura factual por contexto (campos preenchidos / campos do catálogo);
//   * o reaproveitamento de campos na criação de uma RFQ.
//
// Limites deliberados:
//   * cobertura é contagem de campos preenchidos, não nota de risco nem de
//     qualidade da empresa — nada aqui é score;
//   * o período de revisão é uma política declarada (padrão do catálogo ou o
//     valor que a empresa escolhe por campo), nunca uma validade inventada;
//   * valor em formato livre que não casa com o tipo do campo é exibido como
//     está e não é usado para preencher RFQ: o Arandu não reinterpreta dado
//     informado pela empresa.

/** Origens que um usuário pode declarar ao gravar um campo. */
export const WRITABLE_SOURCES = Object.freeze(['declarado_pela_empresa', 'documento_interno', 'extrato', 'contrato_vigente', 'outro']);
/**
 * Origens reservadas a caminhos automáticos (importação, integração, extração
 * confirmada). O banco as aceita para que esses caminhos possam existir, mas a
 * API não as aceita de um formulário: declarar "integração" à mão seria
 * proveniência falsa.
 */
export const RESERVED_SOURCES = Object.freeze(['importacao', 'integracao', 'informado_pelo_provedor', 'calculado', 'ia_confirmado']);
export const SOURCE_LABELS = Object.freeze({
  declarado_pela_empresa: 'Declarado pela empresa',
  documento_interno: 'Documento interno',
  extrato: 'Extrato',
  contrato_vigente: 'Contrato vigente',
  outro: 'Outra origem',
  importacao: 'Importação',
  integracao: 'Integração',
  informado_pelo_provedor: 'Informado pelo provedor',
  calculado: 'Cálculo determinístico',
  ia_confirmado: 'Extraído e confirmado por pessoa',
  cadastro_organizacao: 'Cadastro da organização'
});

export const FRESHNESS = Object.freeze({
  current: { label: 'Atual', tone: 'success' },
  review_due: { label: 'Revisar em breve', tone: 'warning' },
  stale: { label: 'Desatualizado', tone: 'danger' },
  untracked: { label: 'Sem revisão periódica', tone: 'neutral' }
});

/** Dias antes do vencimento da revisão em que o campo passa a `review_due`. */
export const REVIEW_NOTICE_DAYS = 30;
export const DEFAULT_REVIEW_DAYS = 180;
export const MIN_REVIEW_DAYS = 7;
export const MAX_REVIEW_DAYS = 1825;

export const DOMAINS = Object.freeze([
  { id: 'empresa', label: 'Empresa', summary: 'Identificação e porte da empresa compradora.' },
  { id: 'credito', label: 'Crédito', summary: 'Relacionamento bancário, endividamento declarado e garantias.' },
  { id: 'adquirencia', label: 'Adquirência', summary: 'Recebimentos em cartões e PIX, adquirente e liquidação.' },
  { id: 'documentacao', label: 'Documentação', summary: 'Documentos privados reaproveitáveis, cada um com arquivo vinculado.' }
]);

const ENUMS = {
  natureza_juridica: { ltda: 'Sociedade limitada', sa_fechada: 'S.A. de capital fechado', sa_aberta: 'S.A. de capital aberto', slu: 'Sociedade limitada unipessoal', cooperativa: 'Cooperativa', outra: 'Outra' },
  porte: { me: 'Microempresa', epp: 'Empresa de pequeno porte', media: 'Média empresa', grande: 'Grande empresa' },
  moeda_base: { BRL: 'Real (BRL)', USD: 'Dólar (USD)', EUR: 'Euro (EUR)' }
};

/**
 * Campos do catálogo. `origin: 'organization'` lê do cadastro da organização
 * (editado em Configurações → Empresa); os demais vivem em
 * `fin_company_profiles`, com proveniência por campo.
 */
export const PASSPORT_FIELDS = Object.freeze([
  // Empresa
  { key: 'legal_name', domain: 'empresa', label: 'Razão social', origin: 'organization' },
  { key: 'tax_identifier', domain: 'empresa', label: 'CNPJ', origin: 'organization' },
  { key: 'sector', domain: 'empresa', label: 'Setor', origin: 'organization' },
  { key: 'revenue_band', domain: 'empresa', label: 'Faixa de faturamento', origin: 'organization' },
  { key: 'natureza_juridica', domain: 'empresa', label: 'Natureza jurídica', type: 'enum', options: ENUMS.natureza_juridica, review_days: 730 },
  { key: 'porte', domain: 'empresa', label: 'Porte', type: 'enum', options: ENUMS.porte, review_days: 365 },
  { key: 'moeda_base', domain: 'empresa', label: 'Moeda-base', type: 'enum', options: ENUMS.moeda_base, review_days: 730 },
  { key: 'receita_anual', domain: 'empresa', label: 'Faturamento anual (R$)', type: 'money', review_days: 365, hint: 'Último exercício fechado.' },
  { key: 'tempo_operacao_anos', domain: 'empresa', label: 'Tempo de operação (anos)', type: 'number', min: 0, max: 200, review_days: 365 },
  { key: 'colaboradores', domain: 'empresa', label: 'Colaboradores', type: 'int', min: 0, max: 10000000, review_days: 365 },
  // Crédito
  { key: 'bancos_relacionamento', domain: 'credito', label: 'Bancos de relacionamento', type: 'text', review_days: 180 },
  { key: 'linhas_credito_contratadas', domain: 'credito', label: 'Linhas de crédito contratadas', type: 'text', review_days: 90 },
  { key: 'endividamento_bancario', domain: 'credito', label: 'Endividamento bancário declarado (R$)', type: 'money', review_days: 90 },
  { key: 'divida_liquida_ebitda', domain: 'credito', label: 'Dívida líquida / EBITDA (x)', type: 'number', min: -100, max: 100, review_days: 180, hint: 'Como consta no último balancete; o Arandu não calcula este índice.' },
  { key: 'calendario_vencimentos', domain: 'credito', label: 'Calendário de vencimentos', type: 'text', review_days: 90 },
  { key: 'garantias_disponiveis', domain: 'credito', label: 'Garantias disponíveis', type: 'text', review_days: 180 },
  { key: 'necessidades_recorrentes', domain: 'credito', label: 'Necessidades recorrentes de crédito', type: 'text', review_days: 180 },
  // Adquirência
  { key: 'adquirente_atual', domain: 'adquirencia', label: 'Adquirente atual', type: 'text', review_days: 180 },
  { key: 'volume_cartoes_mensal', domain: 'adquirencia', label: 'Volume mensal em cartões e PIX (R$)', type: 'money', review_days: 90 },
  { key: 'ticket_medio', domain: 'adquirencia', label: 'Ticket médio (R$)', type: 'money', review_days: 90 },
  { key: 'mix_recebimentos', domain: 'adquirencia', label: 'Mix de recebimentos', type: 'text', review_days: 90, hint: 'Débito, crédito à vista, parcelado e PIX, como a empresa acompanha.' },
  { key: 'prazo_liquidacao_atual_dias', domain: 'adquirencia', label: 'Prazo de liquidação atual (dias)', type: 'int', min: 0, max: 365, review_days: 180 },
  { key: 'antecipacao_atual', domain: 'adquirencia', label: 'Taxa de antecipação atual (% a.m.)', type: 'percent', min: 0, max: 100, review_days: 90 },
  { key: 'canais_de_venda', domain: 'adquirencia', label: 'Canais de venda', type: 'text', review_days: 365 },
  // Documentação: cada campo só conta quando há arquivo privado vinculado.
  { key: 'doc_contrato_social', domain: 'documentacao', label: 'Contrato/estatuto social', type: 'document', review_days: 730 },
  { key: 'doc_demonstracoes_financeiras', domain: 'documentacao', label: 'Demonstrações financeiras', type: 'document', review_days: 365 },
  { key: 'doc_comprovante_faturamento', domain: 'documentacao', label: 'Comprovante de faturamento', type: 'document', review_days: 180 },
  { key: 'doc_certidoes', domain: 'documentacao', label: 'Certidões negativas', type: 'document', review_days: 180, hint: 'Informe a validade impressa na certidão.' }
].map((field) => Object.freeze(field)));

// Only descriptive defaults may be inherited. Balances, guarantees, identity,
// documents and free fields belong to their original scope.
export const GROUP_DEFAULT_FIELDS = Object.freeze(['sector', 'moeda_base', 'necessidades_recorrentes', 'canais_de_venda']);
export function resolvePassportRows(rows = [], legalEntityId = null) {
  const resolved = new Map();
  for (const row of rows) {
    if (!row.legal_entity_id && (!legalEntityId || GROUP_DEFAULT_FIELDS.includes(row.field_key))) {
      resolved.set(row.field_key, { ...row, scope: 'group', inherited: Boolean(legalEntityId) });
    }
  }
  if (legalEntityId) for (const row of rows) {
    if (row.legal_entity_id === legalEntityId) resolved.set(row.field_key, { ...row, scope: 'entity', inherited: false });
  }
  return [...resolved.values()];
}

const BY_KEY = new Map(PASSPORT_FIELDS.map((field) => [field.key, field]));
export function catalogField(key) { return BY_KEY.get(key) || null; }

/** Rótulo de campo do catálogo ou chave livre humanizada. */
export function fieldLabel(key) {
  const field = BY_KEY.get(key);
  if (field) return field.label;
  const text = String(key || '').replace(/_/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/**
 * Reuso do Passport na RFQ: chave da demanda → campo do Passport, por produto.
 * Só campos com valor tipado entram; texto livre em campo numérico não.
 */
export const PASSPORT_TO_DEMAND = Object.freeze({
  credit: Object.freeze({ annual_revenue: 'receita_anual', sector: 'sector', operating_years: 'tempo_operacao_anos', collateral: 'garantias_disponiveis' }),
  acquiring: Object.freeze({ monthly_volume: 'volume_cartoes_mensal', average_ticket: 'ticket_medio', current_acquirer: 'adquirente_atual', current_anticipation: 'antecipacao_atual' })
});

const NUMERIC = new Set(['money', 'number', 'int', 'percent']);

/** Converte texto numérico canônico (ponto decimal) em número; `null` se não for. */
export function parseCanonicalNumber(value) {
  const text = String(value ?? '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

/**
 * Valida e canoniza um valor antes de gravar. Campos fora do catálogo aceitam
 * texto livre (compatibilidade com perfis existentes).
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
export function validatePassportValue(key, raw) {
  const field = BY_KEY.get(key);
  const text = String(raw ?? '').trim().slice(0, 500);
  if (field?.origin === 'organization') return { ok: false, error: `${field.label} é editado em Configurações → Empresa.` };
  if (!text) return { ok: false, error: 'Informe um valor para o campo.' };
  if (!field || field.type === 'text' || field.type === 'document') return { ok: true, value: text };
  if (field.type === 'enum') {
    return Object.hasOwn(field.options, text) ? { ok: true, value: text } : { ok: false, error: `${field.label}: opção inválida.` };
  }
  // Aceita vírgula decimal digitada no Brasil, sem separador de milhar.
  const number = parseCanonicalNumber(text.replace(',', '.'));
  if (number === null) return { ok: false, error: `${field.label}: informe um número, sem separador de milhar.` };
  if (field.type === 'int' && !Number.isInteger(number)) return { ok: false, error: `${field.label}: informe um número inteiro.` };
  if (field.type === 'money' && (number < 0 || number > 1e13)) return { ok: false, error: `${field.label}: valor fora do intervalo aceito.` };
  if (field.min !== undefined && number < field.min) return { ok: false, error: `${field.label}: mínimo ${field.min}.` };
  if (field.max !== undefined && number > field.max) return { ok: false, error: `${field.label}: máximo ${field.max}.` };
  return { ok: true, value: String(number) };
}

/** O valor gravado casa com o tipo do catálogo? (texto livre antigo pode não casar) */
export function typedValue(key, value) {
  const field = BY_KEY.get(key);
  if (value === null || value === undefined || value === '') return null;
  if (!field || !NUMERIC.has(field.type)) return field?.type === 'enum' && !Object.hasOwn(field.options, value) ? null : String(value);
  return parseCanonicalNumber(value);
}

export function reviewDays(row) {
  const configured = Number(row?.review_after_days);
  if (Number.isInteger(configured) && configured >= MIN_REVIEW_DAYS && configured <= MAX_REVIEW_DAYS) return configured;
  return BY_KEY.get(row?.field_key)?.review_days ?? DEFAULT_REVIEW_DAYS;
}

const DAY = 86400000;
function utcDay(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}
function isoDay(ms) { return new Date(ms).toISOString().slice(0, 10); }

/**
 * Frescor determinístico de um campo do perfil.
 *
 * Referência = a data mais recente entre a última gravação e a última
 * confirmação. Vencimento = referência + período de revisão, antecipado para a
 * validade explícita (`valid_until`) quando houver. A partir de
 * REVIEW_NOTICE_DAYS antes do vencimento o campo fica `review_due`; depois do
 * vencimento, `stale`. Mesma regra em `fin_passport_review_due` no banco.
 */
export function freshness(row, now = new Date()) {
  const today = utcDay(now);
  const reference = Math.max(utcDay(row?.updated_at) ?? -Infinity, utcDay(row?.verified_at) ?? -Infinity);
  if (!Number.isFinite(reference) || today === null) return { state: 'untracked', due_on: null, days_left: null };
  let due = reference + reviewDays(row) * DAY;
  const validUntil = row?.valid_until ? utcDay(`${String(row.valid_until).slice(0, 10)}T00:00:00Z`) : null;
  if (validUntil !== null && validUntil < due) due = validUntil;
  const daysLeft = Math.round((due - today) / DAY);
  const state = daysLeft < 0 ? 'stale' : daysLeft <= REVIEW_NOTICE_DAYS ? 'review_due' : 'current';
  return { state, due_on: isoDay(due), days_left: daysLeft };
}

function organizationValue(organization, key) {
  const value = organization?.[key];
  return value === null || value === undefined || value === '' ? null : String(value);
}

/**
 * Monta o Passport para a interface: contextos, campos com proveniência e
 * frescor, e cobertura factual por contexto.
 *
 * @param {object} input
 * @param {object} input.organization  linha de fin_organizations (com tax_identifier)
 * @param {object[]} input.rows        linhas de fin_company_profiles
 * @param {object[]} [input.documents] documentos privados do perfil (id, title, current_version)
 * @param {Map|object} [input.members] user_id → nome exibido
 * @param {Date} [input.now]
 */
export function buildPassport({ organization = {}, rows = [], documents = [], members = new Map(), legalEntityId = null, entity = null, now = new Date() } = {}) {
  rows = resolvePassportRows(rows, legalEntityId);
  const names = members instanceof Map ? members : new Map(Object.entries(members || {}));
  const available = new Map((documents || []).filter((doc) => !doc.removed_at).map((doc) => [doc.id, doc]));
  const byKey = new Map((rows || []).map((row) => [row.field_key, row]));
  const field = (spec) => {
    if (spec.origin === 'organization') {
      const identity = legalEntityId ? (entity || {}) : organization;
      const value = organizationValue(spec.key === 'sector' ? organization : identity, spec.key);
      return { key: spec.key, domain: spec.domain, label: spec.label, origin: 'organization', value, filled: value !== null,
        source: value === null ? null : 'cadastro_organizacao', freshness: value === null ? null : 'untracked', editable_in: 'settings', scope: legalEntityId && spec.key !== 'sector' ? 'entity' : 'group', legal_entity_id: legalEntityId && spec.key !== 'sector' ? legalEntityId : null };
    }
    const row = byKey.get(spec.key);
    if (!row) return { key: spec.key, domain: spec.domain, label: spec.label, type: spec.type, options: spec.options || null, hint: spec.hint || null, value: null, filled: false, review_days: spec.review_days ?? DEFAULT_REVIEW_DAYS };
    const document = row.document_id ? available.get(row.document_id) || null : null;
    const fresh = freshness(row, now);
    // Documento: o campo só está preenchido com arquivo disponível vinculado.
    const filled = spec.type === 'document' ? Boolean(document) : true;
    return {
      key: spec.key, domain: spec.domain, label: spec.label, type: spec.type, options: spec.options || null, hint: spec.hint || null,
      id: row.id, scope: row.scope, inherited: row.inherited, legal_entity_id: row.legal_entity_id || null, vintage: row.updated_at, owner: row.updated_by || null, value: row.field_value, typed: typedValue(spec.key, row.field_value) !== null,
      filled, source: row.source, freshness: fresh.state, due_on: fresh.due_on, days_left: fresh.days_left,
      updated_at: row.updated_at, updated_by: row.updated_by || null, updated_by_name: names.get(row.updated_by) || null,
      verified_at: row.verified_at || null, verified_by_name: names.get(row.verified_by) || null,
      valid_until: row.valid_until || null, review_days: reviewDays(row),
      document_id: row.document_id || null, document: document ? { id: document.id, title: document.title, version: document.current_version } : null,
      document_missing: Boolean(row.document_id) && !document
    };
  };
  const domains = DOMAINS.map((domain) => {
    const fields = PASSPORT_FIELDS.filter((spec) => spec.domain === domain.id).map(field);
    const filled = fields.filter((item) => item.filled).length;
    return {
      ...domain, fields,
      coverage: { filled, relevant: fields.length },
      stale: fields.filter((item) => item.filled && item.freshness === 'stale').length,
      review_due: fields.filter((item) => item.filled && item.freshness === 'review_due').length
    };
  });
  // Campos livres criados antes do catálogo: aparecem, mas não entram na cobertura.
  const custom = (rows || []).filter((row) => !BY_KEY.has(row.field_key)).map((row) => {
    const fresh = freshness(row, now);
    return { key: row.field_key, label: fieldLabel(row.field_key), id: row.id, scope: row.scope, inherited: row.inherited, legal_entity_id: row.legal_entity_id || null, vintage: row.updated_at, owner: row.updated_by || null, value: row.field_value, source: row.source, scope: row.scope, inherited: row.inherited, legal_entity_id: row.legal_entity_id || null, owner: row.updated_by || null, vintage: row.updated_at, verified_at: row.verified_at || null,
      freshness: fresh.state, due_on: fresh.due_on, updated_at: row.updated_at, updated_by_name: names.get(row.updated_by) || null,
      verified_at: row.verified_at || null, review_days: reviewDays(row), valid_until: row.valid_until || null };
  });
  const filled = domains.reduce((sum, domain) => sum + domain.coverage.filled, 0);
  const relevant = domains.reduce((sum, domain) => sum + domain.coverage.relevant, 0);
  return {
    legal_entity_id: legalEntityId, scope: legalEntityId ? 'entity' : 'group',
    domains, custom,
    coverage: { filled, relevant },
    attention: domains.flatMap((domain) => domain.fields.filter((item) => item.filled && ['stale', 'review_due'].includes(item.freshness))
      .map((item) => ({ key: item.key, label: item.label, domain: domain.id, freshness: item.freshness, due_on: item.due_on }))),
    notice: 'Cobertura é a contagem de campos preenchidos do catálogo. Não é nota de risco, de crédito nem de qualidade da empresa.'
  };
}

/**
 * Sugestões de preenchimento de uma RFQ a partir do Passport. Cada sugestão
 * leva origem, data e frescor para a interface mostrar, e a pessoa revisa
 * antes de criar a solicitação.
 */
export function passportPrefill(product, { organization = {}, rows = [], legalEntityId = null, now = new Date() } = {}) {
  rows = resolvePassportRows(rows, legalEntityId);
  const mapping = PASSPORT_TO_DEMAND[product];
  if (!mapping) return [];
  const byKey = new Map((rows || []).map((row) => [row.field_key, row]));
  const suggestions = [];
  for (const [demandKey, passportKey] of Object.entries(mapping)) {
    const spec = BY_KEY.get(passportKey);
    if (spec?.origin === 'organization') {
      const value = organizationValue(organization, passportKey);
      if (value !== null) suggestions.push({ demand_key: demandKey, field_key: passportKey, label: spec.label, value, source: 'cadastro_organizacao', scope: 'group', legal_entity_id: null, inherited: Boolean(legalEntityId), freshness: 'untracked', updated_at: null });
      continue;
    }
    const row = byKey.get(passportKey);
    if (!row) continue;
    const value = typedValue(passportKey, row.field_value);
    if (value === null) continue;
    const fresh = freshness(row, now);
    suggestions.push({ demand_key: demandKey, field_key: passportKey, label: spec?.label || fieldLabel(passportKey), value, source: row.source, scope: row.scope, inherited: row.inherited, legal_entity_id: row.legal_entity_id || null, owner: row.updated_by || null, vintage: row.updated_at, verified_at: row.verified_at || null,
      freshness: fresh.state, due_on: fresh.due_on, updated_at: row.updated_at });
  }
  return suggestions;
}

/**
 * Valida o pedido de snapshot enviado com a criação da RFQ: apenas pares
 * (campo da demanda, campo do Passport) que existem no mapeamento do produto.
 */
export function validatePassportUsage(product, usage) {
  const mapping = PASSPORT_TO_DEMAND[product] || {};
  if (usage === undefined || usage === null) return [];
  if (!Array.isArray(usage) || usage.length > Object.keys(mapping).length) return null;
  const seen = new Set();
  const result = [];
  for (const item of usage) {
    const demandKey = String(item?.demand_key || '');
    const fieldKey = String(item?.field_key || '');
    if (mapping[demandKey] !== fieldKey || seen.has(demandKey)) return null;
    seen.add(demandKey);
    result.push({ demand_key: demandKey, field_key: fieldKey });
  }
  return result;
}

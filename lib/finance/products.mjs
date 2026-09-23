// Catálogo normalizado de produtos financeiros do Arandu.
//
// Este módulo é a única fonte de verdade sobre quais campos existem em uma
// demanda (RFQ) e em uma proposta. A API, o banco (via allowlist), o front e os
// testes leem daqui: nenhum campo financeiro entra no sistema sem estar
// declarado abaixo, o que impede mass assignment vindo do navegador.
//
// `direction` descreve apenas a leitura factual do campo ("menor é menos
// custo"), nunca uma opinião sobre qual instituição é melhor.

/** @typedef {'number'|'money'|'percent'|'int'|'text'|'date'|'enum'|'bool'} FieldType */

const PERCENT_MAX = 1000;

/** Campos comuns a qualquer proposta, independentemente do produto. */
const COMMON_PROPOSAL_FIELDS = [
  { key: 'institution', label: 'Instituição', type: 'text', max: 200, required: true },
  { key: 'product_name', label: 'Produto ofertado', type: 'text', max: 200, required: true },
  { key: 'valid_until', label: 'Validade da proposta', type: 'date', comparable: true, direction: 'higher_is_better' },
  { key: 'contracting_days', label: 'Prazo estimado para contratação (dias)', type: 'int', min: 0, max: 3650, comparable: true, direction: 'lower_is_better' },
  { key: 'conditions_precedent', label: 'Condições precedentes', type: 'text', max: 2000 },
  { key: 'notes', label: 'Observações', type: 'text', max: 2000 }
];

export const PRODUCTS = Object.freeze({
  credit: {
    id: 'credit',
    label: 'Crédito empresarial',
    summary: 'Estruturação de necessidade de crédito, cotação junto a múltiplos provedores e comparação factual de condições.',
    demandFields: [
      { key: 'amount', label: 'Valor desejado (R$)', type: 'money', required: true, min: 0, max: 1e12 },
      { key: 'purpose', label: 'Finalidade', type: 'enum', required: true, options: ['capital_de_giro', 'investimento', 'expansao', 'refinanciamento', 'antecipacao_recebiveis', 'outro'] },
      { key: 'term_months', label: 'Prazo desejado (meses)', type: 'int', required: true, min: 1, max: 600 },
      { key: 'grace_months', label: 'Carência desejada (meses)', type: 'int', min: 0, max: 120 },
      { key: 'annual_revenue', label: 'Faturamento anual (R$)', type: 'money', min: 0, max: 1e12 },
      { key: 'sector', label: 'Setor', type: 'text', max: 120 },
      { key: 'operating_years', label: 'Tempo de operação (anos)', type: 'number', min: 0, max: 200 },
      { key: 'collateral', label: 'Garantias disponíveis', type: 'text', max: 1000 },
      { key: 'urgency', label: 'Urgência', type: 'enum', options: ['baixa', 'media', 'alta'] },
      { key: 'notes', label: 'Observações', type: 'text', max: 2000 }
    ],
    proposalFields: [
      { key: 'offered_amount', label: 'Valor ofertado (R$)', type: 'money', required: true, min: 0, max: 1e12, comparable: true, direction: 'higher_is_better' },
      { key: 'interest_rate_month', label: 'Taxa (% a.m.)', type: 'percent', required: true, min: 0, max: PERCENT_MAX, comparable: true, direction: 'lower_is_better' },
      { key: 'index', label: 'Indexador', type: 'enum', options: ['pre', 'cdi', 'ipca', 'selic', 'tr', 'outro'] },
      { key: 'index_spread', label: 'Spread sobre o indexador (% a.a.)', type: 'percent', min: 0, max: PERCENT_MAX },
      { key: 'cet_year', label: 'CET informado (% a.a.)', type: 'percent', min: 0, max: PERCENT_MAX, comparable: true, direction: 'lower_is_better' },
      { key: 'term_months', label: 'Prazo (meses)', type: 'int', required: true, min: 1, max: 600, comparable: true, direction: 'higher_is_better' },
      { key: 'grace_months', label: 'Carência (meses)', type: 'int', min: 0, max: 120, comparable: true, direction: 'higher_is_better' },
      { key: 'amortization', label: 'Amortização', type: 'enum', options: ['price', 'sac', 'bullet', 'customizada'] },
      { key: 'collateral_required', label: 'Garantias exigidas', type: 'text', max: 1000 },
      { key: 'fees_amount', label: 'Tarifas (R$)', type: 'money', min: 0, max: 1e12, comparable: true, direction: 'lower_is_better' },
      { key: 'declared_total_cost', label: 'Custo total informado pelo provedor (R$)', type: 'money', min: 0, max: 1e12, comparable: true, direction: 'lower_is_better' },
      ...COMMON_PROPOSAL_FIELDS
    ]
  },
  acquiring: {
    id: 'acquiring',
    label: 'Adquirência e meios de pagamento',
    summary: 'Perfil de recebimentos, cotação de MDR/antecipação/liquidação e comparação factual entre provedores.',
    demandFields: [
      { key: 'monthly_volume', label: 'Faturamento mensal em cartões (R$)', type: 'money', required: true, min: 0, max: 1e12 },
      { key: 'average_ticket', label: 'Ticket médio (R$)', type: 'money', min: 0, max: 1e9 },
      { key: 'share_debit', label: 'Percentual débito (%)', type: 'percent', min: 0, max: 100 },
      { key: 'share_credit_cash', label: 'Percentual crédito à vista (%)', type: 'percent', min: 0, max: 100 },
      { key: 'share_credit_installment', label: 'Percentual parcelado (%)', type: 'percent', min: 0, max: 100 },
      { key: 'average_installments', label: 'Número médio de parcelas', type: 'number', min: 1, max: 24 },
      { key: 'share_pix', label: 'Percentual PIX (%)', type: 'percent', min: 0, max: 100 },
      { key: 'channel_presencial', label: 'Opera presencial', type: 'bool' },
      { key: 'channel_ecommerce', label: 'Opera e-commerce', type: 'bool' },
      { key: 'channel_recurring', label: 'Opera recorrência', type: 'bool' },
      { key: 'terminals', label: 'Número de terminais', type: 'int', min: 0, max: 100000 },
      { key: 'settlement_days_target', label: 'Prazo desejado de liquidação (dias)', type: 'int', min: 0, max: 365 },
      { key: 'current_anticipation', label: 'Antecipação atual (% a.m.)', type: 'percent', min: 0, max: PERCENT_MAX },
      { key: 'current_acquirer', label: 'Adquirente atual', type: 'text', max: 200 },
      { key: 'notes', label: 'Observações', type: 'text', max: 2000 }
    ],
    proposalFields: [
      { key: 'mdr_debit', label: 'MDR débito (%)', type: 'percent', required: true, min: 0, max: 100, comparable: true, direction: 'lower_is_better' },
      { key: 'mdr_credit_cash', label: 'MDR crédito à vista (%)', type: 'percent', required: true, min: 0, max: 100, comparable: true, direction: 'lower_is_better' },
      { key: 'mdr_credit_installment', label: 'MDR parcelado (%)', type: 'percent', min: 0, max: 100, comparable: true, direction: 'lower_is_better' },
      { key: 'pix_fee', label: 'Taxa PIX (%)', type: 'percent', min: 0, max: 100, comparable: true, direction: 'lower_is_better' },
      { key: 'anticipation_rate', label: 'Antecipação (% a.m.)', type: 'percent', min: 0, max: PERCENT_MAX, comparable: true, direction: 'lower_is_better' },
      { key: 'terminal_rent', label: 'Aluguel por terminal (R$/mês)', type: 'money', min: 0, max: 1e6, comparable: true, direction: 'lower_is_better' },
      { key: 'gateway_cost', label: 'Custo de gateway (R$/mês)', type: 'money', min: 0, max: 1e6, comparable: true, direction: 'lower_is_better' },
      { key: 'settlement_days', label: 'Prazo de liquidação (dias)', type: 'int', min: 0, max: 365, comparable: true, direction: 'lower_is_better' },
      { key: 'chargeback_terms', label: 'Chargeback', type: 'text', max: 1000 },
      { key: 'contract_months', label: 'Prazo contratual (meses)', type: 'int', min: 0, max: 600 },
      { key: 'early_exit_penalty', label: 'Multa rescisória (R$)', type: 'money', min: 0, max: 1e9, comparable: true, direction: 'lower_is_better' },
      { key: 'extra_services', label: 'Serviços adicionais', type: 'text', max: 1000 },
      ...COMMON_PROPOSAL_FIELDS
    ]
  }
});

export const PRODUCT_IDS = Object.freeze(Object.keys(PRODUCTS));

export function getProduct(productId) {
  return Object.hasOwn(PRODUCTS, String(productId)) ? PRODUCTS[String(productId)] : null;
}

export function demandFields(productId) {
  return getProduct(productId)?.demandFields ?? [];
}

export function proposalFields(productId) {
  return getProduct(productId)?.proposalFields ?? [];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function coerce(field, raw) {
  if (raw === null || raw === undefined || raw === '') return { skip: true };
  switch (field.type) {
    case 'text': {
      const value = String(raw).trim();
      if (!value) return { skip: true };
      if (value.length > (field.max ?? 500)) return { error: `${field.label}: texto acima do limite.` };
      return { value };
    }
    case 'enum': {
      const value = String(raw).trim();
      if (!field.options.includes(value)) return { error: `${field.label}: opção inválida.` };
      return { value };
    }
    case 'bool': {
      if (typeof raw === 'boolean') return { value: raw };
      const value = String(raw).trim().toLowerCase();
      if (['1', 'true', 'sim', 'yes'].includes(value)) return { value: true };
      if (['0', 'false', 'nao', 'não', 'no'].includes(value)) return { value: false };
      return { error: `${field.label}: valor booleano inválido.` };
    }
    case 'date': {
      const value = String(raw).trim();
      if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        return { error: `${field.label}: data inválida (use AAAA-MM-DD).` };
      }
      return { value };
    }
    default: {
      const value = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
      if (!Number.isFinite(value)) return { error: `${field.label}: número inválido.` };
      if (field.type === 'int' && !Number.isInteger(value)) return { error: `${field.label}: use um número inteiro.` };
      if (field.min !== undefined && value < field.min) return { error: `${field.label}: abaixo do mínimo permitido.` };
      if (field.max !== undefined && value > field.max) return { error: `${field.label}: acima do máximo permitido.` };
      return { value };
    }
  }
}

/**
 * Converte um payload arbitrário do cliente em um objeto normalizado contendo
 * exclusivamente campos declarados para o produto. Campos desconhecidos são
 * descartados e reportados — nunca persistidos.
 */
export function normalize(fields, input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const values = {};
  const errors = [];
  const rejected = [];
  const known = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(source)) if (!known.has(key)) rejected.push(key);
  for (const field of fields) {
    const outcome = coerce(field, source[field.key]);
    if (outcome.error) { errors.push(outcome.error); continue; }
    if (outcome.skip) {
      if (field.required) errors.push(`${field.label}: campo obrigatório.`);
      continue;
    }
    values[field.key] = outcome.value;
  }
  return { values, errors, rejected, warnings: [] };
}

export function normalizeDemand(productId, input) {
  const product = getProduct(productId);
  if (!product) return { values: {}, errors: ['Produto financeiro inválido.'], rejected: [], warnings: [] };
  const result = normalize(product.demandFields, input);
  result.warnings = result.warnings || [];
  if (productId === 'acquiring') {
    // Coerência entre fatias é regra do produto, não do tipo do campo: só dá
    // para checar depois que todas foram normalizadas.
    const shares = checkAcquiringShares(result.values);
    result.errors.push(...shares.errors);
    result.warnings.push(...shares.warnings);
  }
  return result;
}

export function normalizeProposal(productId, input) {
  const product = getProduct(productId);
  if (!product) return { values: {}, errors: ['Produto financeiro inválido.'], rejected: [] };
  return normalize(product.proposalFields, input);
}

/**
 * Estimativa de custo total de crédito.
 *
 * O Arandu nunca inventa CET. Quando o provedor informa `cet_year`, ele é
 * exibido como dado declarado. Esta função é outra coisa: uma projeção própria,
 * que só existe quando TODOS os insumos existem e a matemática é aplicável.
 *
 * Nunca devolve número sem dizer como chegou nele, e nunca devolve número
 * quando a fórmula não vale para o caso. Em vez de `null` mudo, devolve o
 * motivo — a interface mostra o motivo no lugar do valor.
 *
 * @returns {{estimate: true, ...} | {estimate: false, reason: string}}
 */
export function estimateCreditTotalCost(proposal) {
  const amount = Number(proposal?.offered_amount);
  const rate = Number(proposal?.interest_rate_month);
  const term = Number(proposal?.term_months);
  const fees = Number(proposal?.fees_amount ?? 0);
  const missing = [];
  if (!Number.isFinite(amount) || amount <= 0) missing.push('valor ofertado');
  if (!Number.isFinite(rate) || rate < 0) missing.push('taxa mensal');
  if (!Number.isFinite(term) || term <= 0) missing.push('prazo');
  if (!Number.isFinite(fees) || fees < 0) missing.push('tarifas');
  if (missing.length) {
    return { estimate: false, reason: `Estimativa não calculável: falta ${missing.join(', ')}.` };
  }
  // Pós-fixado depende de uma curva futura do indexador. Projetar exigiria
  // arbitrar uma hipótese de CDI/IPCA, e essa hipótese viraria o resultado.
  const index = proposal?.index;
  if (index && index !== 'pre') {
    return {
      estimate: false,
      reason: `Estimativa não calculável: taxa indexada a ${String(index).toUpperCase()} depende de projeção do indexador, que o Arandu não arbitra.`
    };
  }
  // A fórmula abaixo é PRICE. Aplicá-la a SAC ou bullet daria um número
  // errado com cara de certo.
  const amortization = proposal?.amortization || 'price';
  if (amortization !== 'price') {
    return {
      estimate: false,
      reason: `Estimativa não calculável: a projeção do Arandu cobre apenas amortização PRICE; esta proposta é ${String(amortization).toUpperCase()}.`
    };
  }
  const grace = Number(proposal?.grace_months ?? 0);
  if (Number.isFinite(grace) && grace > 0) {
    return {
      estimate: false,
      reason: 'Estimativa não calculável: há carência, e o tratamento dos juros no período de carência varia por contrato.'
    };
  }
  const i = rate / 100;
  const installment = i === 0 ? amount / term : (amount * i) / (1 - (1 + i) ** -term);
  const total = installment * term + fees;
  return {
    estimate: true,
    declared_cet_year: Number.isFinite(Number(proposal?.cet_year)) ? Number(proposal.cet_year) : null,
    basis: 'estimativa calculada pelo Arandu; não é CET e não substitui o custo informado pelo provedor.',
    formula: 'parcela = principal × i / (1 − (1 + i)^−n); custo_total = parcela × n + tarifas',
    inputs: { offered_amount: amount, interest_rate_month: rate, term_months: term, fees_amount: fees },
    assumptions: ['taxa pré-fixada', 'amortização PRICE', 'sem carência', 'sem tributos adicionais'],
    unit: 'BRL',
    installment: Math.round(installment * 100) / 100,
    total_cost: Math.round(total * 100) / 100
  };
}

/**
 * Custo mensal estimado de adquirência.
 *
 * Soma o custo variável de cada fatia declarada pela empresa com o custo fixo
 * do provedor. **Antecipação fica deliberadamente de fora**: calculá-la exigiria
 * o volume efetivamente antecipado e o prazo médio, que a empresa não declara
 * nesta fase — embutir uma hipótese aqui mudaria a ordem das propostas sem que
 * ninguém visse a hipótese.
 *
 * @returns {{estimate: true, ...} | {estimate: false, reason: string}}
 */
export function estimateAcquiringMonthlyCost(demand, proposal) {
  const volume = Number(demand?.monthly_volume);
  if (!Number.isFinite(volume) || volume <= 0) {
    return { estimate: false, reason: 'Estimativa não calculável: falta o faturamento mensal em cartões.' };
  }
  const slices = [
    { key: 'debit', label: 'débito', share: demand?.share_debit, rate: proposal?.mdr_debit },
    { key: 'credit_cash', label: 'crédito à vista', share: demand?.share_credit_cash, rate: proposal?.mdr_credit_cash },
    { key: 'credit_installment', label: 'parcelado', share: demand?.share_credit_installment, rate: proposal?.mdr_credit_installment },
    { key: 'pix', label: 'PIX', share: demand?.share_pix, rate: proposal?.pix_fee }
  ];
  let variable = 0;
  let declaredShare = 0;
  const shares = {};
  const rates = {};
  for (const slice of slices) {
    const share = Number(slice.share);
    if (!Number.isFinite(share) || share <= 0) continue;
    const rate = Number(slice.rate);
    if (!Number.isFinite(rate)) {
      return { estimate: false, reason: `Estimativa não calculável: a empresa declarou ${share}% em ${slice.label}, mas a proposta não informou a taxa correspondente.` };
    }
    shares[slice.key] = share;
    rates[slice.key] = rate;
    declaredShare += share;
    variable += volume * (share / 100) * (rate / 100);
  }
  if (!declaredShare) {
    return { estimate: false, reason: 'Estimativa não calculável: o perfil de recebimentos não declara nenhuma fatia.' };
  }
  const terminals = Number(demand?.terminals ?? 0);
  const terminalRent = Number(proposal?.terminal_rent ?? 0);
  const gateway = Number(proposal?.gateway_cost ?? 0);
  if (![terminals, terminalRent, gateway].every(Number.isFinite)) {
    return { estimate: false, reason: 'Estimativa não calculável: custo fixo (terminais ou gateway) com valor inválido.' };
  }
  const fixed = terminals * terminalRent + gateway;
  return {
    estimate: true,
    basis: 'estimativa calculada pelo Arandu com o perfil declarado pela empresa; não inclui antecipação nem tributos.',
    formula: 'custo = Σ(volume × fatia% × taxa%) + terminais × aluguel + gateway',
    inputs: { monthly_volume: volume, shares, rates, terminals, terminal_rent: terminalRent, gateway_cost: gateway },
    assumptions: [
      'perfil de recebimentos informado pela empresa',
      'sem antecipação (exigiria volume antecipado e prazo médio)',
      'sem tributos'
    ],
    // Quando as fatias não somam 100%, a estimativa cobre só o que foi
    // declarado. O número sozinho enganaria; a cobertura vai junto.
    declared_share: Math.round(declaredShare * 100) / 100,
    covers_full_volume: Math.abs(declaredShare - 100) <= SHARE_TOLERANCE,
    unit: 'BRL/mês',
    variable_cost: Math.round(variable * 100) / 100,
    fixed_cost: Math.round(fixed * 100) / 100,
    total_cost: Math.round((variable + fixed) * 100) / 100
  };
}

/**
 * Coerência do mix de recebimentos declarado.
 *
 * As quatro fatias deveriam somar 100%. Uma diferença pequena é arredondamento
 * do dia a dia e vira aviso; 180% é erro de preenchimento e é recusado. O que
 * não acontece nunca é normalizar em silêncio: o número que a empresa digitou
 * é o número que fica, e ela é avisada.
 */
export const SHARE_TOLERANCE = 2;
const SHARE_HARD_LIMIT = 10;

export function checkAcquiringShares(demand) {
  const keys = ['share_debit', 'share_credit_cash', 'share_credit_installment', 'share_pix'];
  const present = keys.filter((key) => Number.isFinite(Number(demand?.[key])));
  if (!present.length) return { ok: true, declared: null, errors: [], warnings: [] };
  const declared = present.reduce((sum, key) => sum + Number(demand[key]), 0);
  const drift = Math.round((declared - 100) * 100) / 100;
  if (Math.abs(drift) <= SHARE_TOLERANCE) return { ok: true, declared, drift, errors: [], warnings: [] };
  const message = `O mix de recebimentos soma ${Math.round(declared * 100) / 100}% (débito + crédito à vista + parcelado + PIX), e não 100%.`;
  if (Math.abs(drift) > SHARE_HARD_LIMIT) {
    return { ok: false, declared, drift, errors: [`${message} Revise os percentuais.`], warnings: [] };
  }
  return {
    ok: true, declared, drift, errors: [],
    warnings: [`${message} A estimativa de custo cobrirá apenas a parte declarada.`]
  };
}

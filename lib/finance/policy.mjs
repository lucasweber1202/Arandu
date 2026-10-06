// Policy & Approval Engine v2 — catálogo, validação e leitura humana.
//
// A autoridade da avaliação é o banco (docs/supabase-financial-policy-engine.sql):
// este módulo espelha a VALIDAÇÃO do documento (para dar erro útil antes do
// round-trip) e transforma regras e planos em texto legível. Ele não avalia
// processo real nem decide nada: a policy é do cliente e só exige etapas
// humanas. Especificação: docs/FINANCIAL_POLICY_ENGINE.md.

export const POLICY_ROLES = /* @__PURE__ */ Object.freeze(['admin', 'finance_manager', 'analyst', 'viewer']);
export const ROLE_LABELS = /* @__PURE__ */ Object.freeze({ admin: 'Administração', finance_manager: 'Gestão financeira', analyst: 'Análise', viewer: 'Leitura' });
export const STAGE_SCOPES = /* @__PURE__ */ Object.freeze({
  any: 'Qualquer pessoa elegível com acesso à entidade',
  group: 'Tesouraria do grupo (escopo de grupo)',
  entity: 'Aprovador local (concessão explícita na entidade)'
});
export const PRODUCTS = /* @__PURE__ */ Object.freeze({ credit: 'Crédito', acquiring: 'Adquirência' });
export const PROVIDER_STATUS = /* @__PURE__ */ Object.freeze({ NAO_VERIFICADO: 'Provedor sem evidência registrada', EVIDENCIA_REGISTRADA: 'Provedor com evidência registrada' });

/** Motivos de devolução/rejeição de uma etapa (fin_approval_steps.reason_code). */
export const STEP_REASON_CODES = /* @__PURE__ */ Object.freeze({
  insufficient_competition: 'Competição insuficiente',
  terms_outside_policy: 'Condições fora da policy',
  missing_documentation: 'Documentação faltando',
  pricing_review: 'Revisar preço',
  risk_review: 'Revisar risco',
  compliance_review: 'Revisar compliance',
  budget: 'Orçamento',
  other: 'Outro'
});
/** Motivos de pedido de exceção (fin_policy_exceptions.reason_code). */
export const EXCEPTION_REASON_CODES = /* @__PURE__ */ Object.freeze({
  insufficient_competition: 'Mercado sem competição suficiente',
  urgent_operation: 'Operação urgente',
  incumbent_continuity: 'Continuidade com o provedor atual',
  regulatory_requirement: 'Exigência regulatória',
  market_constraint: 'Restrição de mercado',
  other: 'Outro'
});
export const FLAG_KINDS = /* @__PURE__ */ Object.freeze({ exception: 'Exceção', risk: 'Risco', compliance: 'Compliance', other: 'Outro' });

/**
 * Fatos que uma condição pode ler, com operadores aceitos. `declared` indica que
 * o fato vem de quem pede a aprovação (fica gravado com o pedido).
 */
export const POLICY_FACTS = /* @__PURE__ */ Object.freeze({
  amount: { label: 'Valor da operação', ops: { gte: 'maior ou igual a', lt: 'menor que' }, type: 'money' },
  currency: { label: 'Moeda da operação', ops: { in: 'é uma de', not_in: 'não é nenhuma de' }, type: 'currencies' },
  product: { label: 'Produto', ops: { in: 'é um de', not_in: 'não é nenhum de' }, type: 'products' },
  legal_entity: { label: 'Entidade legal', ops: { in: 'é uma de', not_in: 'não é nenhuma de' }, type: 'entities' },
  provider_status: { label: 'Status do provedor', ops: { in: 'é um de', not_in: 'não é nenhum de' }, type: 'provider_status' },
  provider_new: { label: 'Provedor novo (sem contrato anterior)', ops: { eq: 'é' }, type: 'bool' },
  proposals_count: { label: 'Número de propostas', ops: { lt: 'menor que', gte: 'maior ou igual a' }, type: 'count' },
  guarantee_required: { label: 'Garantia exigida na proposta', ops: { eq: 'é' }, type: 'bool' },
  covenant_present: { label: 'Covenant presente (declarado)', ops: { eq: 'é' }, type: 'bool', declared: true },
  contract_duration_months: { label: 'Prazo do contrato (meses)', ops: { gt: 'maior que', lte: 'menor ou igual a' }, type: 'months' },
  maturity_date: { label: 'Vencimento estimado', ops: { after: 'depois de', on_or_before: 'até' }, type: 'date' },
  flag: { label: 'Sinalizador do cliente (declarado)', ops: { present: 'presente', absent: 'ausente' }, type: 'flag', declared: true }
});

const KEY = /^[a-z][a-z0-9_]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CURRENCY = /^[A-Z]{3}$/;
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isInt = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const onlyKeys = (object, allowed) => Object.keys(object).every((key) => allowed.includes(key));
const textOk = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validRoles(roles) {
  return Array.isArray(roles) && roles.length >= 1 && roles.length <= 4 && new Set(roles).size === roles.length && roles.every((role) => POLICY_ROLES.includes(role));
}

function validStage(stage) {
  if (!isObject(stage) || !onlyKeys(stage, ['key', 'label', 'sequence', 'roles', 'scope', 'min_approvals', 'due_hours', 'allow_delegation'])) return 'etapa com campo desconhecido';
  if (!KEY.test(stage.key || '')) return 'chave de etapa inválida (minúsculas, números e _; 2 a 41 caracteres)';
  if (!textOk(stage.label, 2, 120)) return 'nome da etapa com 2 a 120 caracteres';
  if (!isInt(stage.sequence, 1, 9)) return 'sequência da etapa entre 1 e 9';
  if (!validRoles(stage.roles)) return 'papéis da etapa inválidos';
  if (!Object.hasOwn(STAGE_SCOPES, stage.scope)) return 'escopo da etapa inválido';
  if (!isInt(stage.min_approvals, 1, 5)) return 'mínimo de aprovações entre 1 e 5';
  if (stage.due_hours !== undefined && stage.due_hours !== null && !isInt(stage.due_hours, 1, 720)) return 'prazo da etapa entre 1 e 720 horas';
  if (stage.allow_delegation !== undefined && typeof stage.allow_delegation !== 'boolean') return 'delegação deve ser sim ou não';
  return null;
}

export function validateCondition(condition) {
  if (!isObject(condition) || !onlyKeys(condition, ['fact', 'op', 'value', 'currency'])) return 'condição com campo desconhecido';
  const fact = POLICY_FACTS[condition.fact];
  if (!fact) return 'fato desconhecido';
  if (!Object.hasOwn(fact.ops, condition.op)) return `operador inválido para ${fact.label}`;
  if (condition.currency !== undefined && condition.fact !== 'amount') return 'moeda só acompanha condição de valor';
  const value = condition.value;
  const list = (check, max) => Array.isArray(value) && value.length >= 1 && value.length <= max && value.every(check);
  switch (fact.type) {
    case 'money': return typeof value === 'number' && value >= 0 && value <= 1e15 && CURRENCY.test(condition.currency || '') ? null : 'valor precisa de número e moeda (ex.: BRL)';
    case 'currencies': return list((item) => CURRENCY.test(item), 20) ? null : 'moedas no código ISO de três letras';
    case 'products': return list((item) => Object.hasOwn(PRODUCTS, item), 10) ? null : 'produto inválido';
    case 'entities': return list((item) => UUID.test(item), 50) ? null : 'entidade inválida';
    case 'provider_status': return list((item) => Object.hasOwn(PROVIDER_STATUS, item), 2) ? null : 'status de provedor inválido';
    case 'bool': return typeof value === 'boolean' ? null : 'use sim ou não';
    case 'count': return isInt(value, 1, 20) ? null : 'número de propostas entre 1 e 20';
    case 'months': return isInt(value, 0, 600) ? null : 'meses entre 0 e 600';
    case 'date': return validDate(value) ? null : 'data inválida (AAAA-MM-DD)';
    case 'flag': return KEY.test(value || '') ? null : 'sinalizador inválido';
    default: return 'fato desconhecido';
  }
}

function validBlock(block, { rule, ruleIds, stageSignatures }) {
  if (!isObject(block)) return 'regra inválida';
  const allowed = rule ? ['id', 'label', 'when', 'stages', 'requirements'] : ['stages', 'requirements'];
  if (!onlyKeys(block, allowed)) return rule ? 'regra com campo desconhecido' : 'fallback com campo desconhecido';
  if (rule) {
    if (!KEY.test(block.id || '')) return 'identificador de regra inválido (minúsculas, números e _; 2 a 41 caracteres)';
    if (ruleIds.has(block.id)) return `regra repetida: ${block.id}`;
    ruleIds.add(block.id);
    if (!textOk(block.label, 2, 160)) return `regra ${block.id}: descrição com 2 a 160 caracteres`;
    const when = block.when ?? [];
    if (!Array.isArray(when) || when.length > 10) return `regra ${block.id}: até 10 condições`;
    for (const condition of when) {
      const error = validateCondition(condition);
      if (error) return `regra ${block.id}: ${error}`;
    }
  }
  const stages = block.stages ?? [];
  if (!Array.isArray(stages) || stages.length > 4) return 'até 4 etapas por regra';
  const requirements = block.requirements;
  if (requirements !== undefined) {
    if (!isObject(requirements) || !onlyKeys(requirements, ['min_proposals', 'justification'])) return 'requisito desconhecido';
    if (requirements.min_proposals !== undefined && !isInt(requirements.min_proposals, 2, 10)) return 'mínimo de propostas entre 2 e 10';
    if (requirements.justification !== undefined && typeof requirements.justification !== 'boolean') return 'justificativa deve ser sim ou não';
  }
  if (!stages.length && requirements?.min_proposals === undefined && requirements?.justification !== true) return 'a regra precisa exigir uma etapa, um mínimo de propostas ou justificativa';
  for (const stage of stages) {
    const error = validStage(stage);
    if (error) return error;
    const signature = `${stage.sequence}|${[...stage.roles].sort().join(',')}|${stage.scope}`;
    if (stageSignatures.has(stage.key) && stageSignatures.get(stage.key) !== signature) return `a etapa ${stage.key} aparece com significados diferentes`;
    stageSignatures.set(stage.key, signature);
  }
  return null;
}

/** Mesma regra de fin_policy_valid_document. @returns {{ok: true} | {ok: false, error: string}} */
export function validatePolicyDocument(document) {
  if (!isObject(document)) return { ok: false, error: 'Documento de policy inválido.' };
  const raw = JSON.stringify(document);
  if (raw.length > 30000) return { ok: false, error: 'Policy grande demais (limite de 30 mil caracteres).' };
  if (/[<>]/.test(raw)) return { ok: false, error: 'A policy não aceita HTML.' };
  if (!onlyKeys(document, ['rules', 'fallback', 'sod', 'exception_approver_roles', 'escalation_roles', 'expire_after_hours'])) return { ok: false, error: 'Campo desconhecido na policy.' };
  if (!Array.isArray(document.rules) || document.rules.length > 30) return { ok: false, error: 'A policy aceita até 30 regras.' };
  if (document.sod !== undefined && (!isObject(document.sod) || !onlyKeys(document.sod, ['requester_cannot_decide', 'decider_not_sole_final_approver'])
      || Object.values(document.sod).some((value) => typeof value !== 'boolean'))) return { ok: false, error: 'Segregação de funções inválida.' };
  for (const key of ['exception_approver_roles', 'escalation_roles']) {
    if (document[key] !== undefined && !validRoles(document[key])) return { ok: false, error: 'Papéis de exceção/escalação inválidos.' };
  }
  if (document.expire_after_hours !== undefined && document.expire_after_hours !== null && !isInt(document.expire_after_hours, 1, 2160)) {
    return { ok: false, error: 'Validade do pedido entre 1 e 2160 horas.' };
  }
  const context = { ruleIds: new Set(), stageSignatures: new Map() };
  for (const rule of document.rules) {
    const error = validBlock(rule, { ...context, rule: true });
    if (error) return { ok: false, error: `${error[0].toUpperCase()}${error.slice(1)}.` };
  }
  if (document.fallback !== undefined && document.fallback !== null) {
    const error = validBlock(document.fallback, { ...context, rule: false });
    if (error) return { ok: false, error: `Fallback: ${error}.` };
  }
  return { ok: true };
}

const money = (value, currency) => `${currency} ${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;

/** Condição em português, sem opinião: "Valor da operação maior ou igual a BRL 1.000.000". */
export function describeCondition(condition, { entities = [], flags = [] } = {}) {
  const fact = POLICY_FACTS[condition?.fact];
  if (!fact) return 'Condição desconhecida';
  const op = fact.ops[condition.op] || condition.op;
  const value = condition.value;
  const nameOf = (id) => entities.find((entity) => entity.id === id)?.short_name || entities.find((entity) => entity.id === id)?.legal_name || 'entidade';
  const rendered = {
    money: () => money(value, condition.currency),
    currencies: () => value.join(', '),
    products: () => value.map((item) => PRODUCTS[item] || item).join(', '),
    entities: () => value.map(nameOf).join(', '),
    provider_status: () => value.map((item) => PROVIDER_STATUS[item] || item).join(', '),
    bool: () => (value ? 'sim' : 'não'),
    count: () => String(value),
    months: () => `${value} meses`,
    date: () => value.split('-').reverse().join('/'),
    flag: () => flags.find((flag) => flag.key === value)?.label || value
  }[fact.type]?.() ?? String(value);
  if (fact.type === 'flag') return `${fact.label}: ${rendered} ${op}`;
  return `${fact.label} ${op} ${rendered}`;
}

export function describeStage(stage) {
  const roles = (stage.roles || []).map((role) => ROLE_LABELS[role] || role).join(' ou ');
  const due = stage.due_hours ? ` · prazo de ${stage.due_hours} h` : '';
  return `${stage.label}: ${stage.min_approvals} aprovação(ões) de ${roles} — ${STAGE_SCOPES[stage.scope] || stage.scope}${due}`;
}

/** Resumo de uma regra: quando + o que exige. */
export function describeRule(rule, options = {}) {
  const when = (rule.when || []).length ? rule.when.map((condition) => describeCondition(condition, options)).join(' e ') : 'Sempre';
  const requires = [
    ...(rule.stages || []).map(describeStage),
    ...(rule.requirements?.min_proposals ? [`Ao menos ${rule.requirements.min_proposals} propostas (ou exceção aprovada)`] : []),
    ...(rule.requirements?.justification ? ['Justificativa de quem pede'] : [])
  ];
  return { when, requires };
}

/** Indicações de aprovadores por etapa, conferidas antes do banco. */
export function validateAssignments(assignments, stages = []) {
  if (!isObject(assignments)) return { ok: false, error: 'Indique os aprovadores de cada etapa.' };
  const known = new Map(stages.map((stage) => [stage.key, stage]));
  const people = new Set();
  for (const [key, list] of Object.entries(assignments)) {
    if (stages.length && !known.has(key)) return { ok: false, error: 'Etapa desconhecida no plano da policy.' };
    if (!Array.isArray(list) || list.length > 5 || !list.every((id) => UUID.test(String(id)))) return { ok: false, error: 'Até cinco aprovadores por etapa.' };
    for (const id of list) {
      if (people.has(id)) return { ok: false, error: 'A mesma pessoa não pode ocupar duas etapas.' };
      people.add(id);
    }
  }
  for (const stage of stages) {
    if ((assignments[stage.key] || []).length < stage.min_approvals) return { ok: false, error: `A etapa "${stage.label}" precisa de ${stage.min_approvals} aprovador(es).` };
  }
  return { ok: true };
}

/** Fatos declarados aceitos pelo engine (o resto é descartado). */
export function cleanDeclaredFacts(input) {
  const out = {};
  if (!isObject(input)) return out;
  if (typeof input.covenant_present === 'boolean') out.covenant_present = input.covenant_present;
  if (Array.isArray(input.flags)) out.flags = [...new Set(input.flags.filter((flag) => KEY.test(String(flag))))].slice(0, 20);
  return out;
}

export const UNKNOWN_FACT_LABELS = /* @__PURE__ */ Object.freeze({
  ...Object.fromEntries(Object.entries(POLICY_FACTS).map(([key, fact]) => [key, fact.label])),
  amount_currency: 'Valor em moeda diferente da regra (sem conversão cambial)'
});

export const APPROVAL_STATUS_LABELS = /* @__PURE__ */ Object.freeze({
  pending: 'Em andamento', approved: 'Aprovada', rejected: 'Rejeitada', changes_requested: 'Devolvida para ajustes',
  cancelled: 'Cancelada', expired: 'Expirada', superseded: 'Substituída'
});
export const STAGE_STATUS_LABELS = /* @__PURE__ */ Object.freeze({
  pending: 'Na fila', active: 'Aguardando', approved: 'Aprovada', rejected: 'Rejeitada', changes_requested: 'Devolvida',
  waived: 'Dispensada por exceção', cancelled: 'Encerrada', expired: 'Expirada', superseded: 'Substituída'
});
export const EXCEPTION_STATUS_LABELS = /* @__PURE__ */ Object.freeze({ requested: 'Aguardando decisão', approved: 'Aprovada', rejected: 'Rejeitada', cancelled: 'Cancelada' });

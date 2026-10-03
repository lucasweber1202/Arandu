// Policy & Approval Engine v2 — forma das regras (o banco valida de novo em
// fin_valid_policy_rules e é a única fonte da avaliação: fin_evaluate_policies).
//
// Uma policy é do cliente: diz quais fatos do processo exigem quais etapas
// humanas. Ela nunca escolhe proposta nem aprova nada.

export const POLICY_CONDITIONS = Object.freeze({
  products: 'Produtos',
  amount_gte: 'Valor a partir de',
  amount_lt: 'Valor abaixo de',
  term_months_gt: 'Prazo acima de (meses)',
  collateral_required: 'Proposta exige garantia',
  provider_new: 'Provedor sem contrato anterior',
  proposals_lt: 'Menos propostas que'
});
export const POLICY_REQUIREMENTS = Object.freeze({
  approval_required: 'Exige aprovação',
  approvals: 'Mínimo de aprovadores',
  approver_groups: 'Grupos de aprovadores obrigatórios',
  min_proposals: 'Mínimo de propostas',
  justification: 'Exige justificativa',
  step_hours: 'Prazo por etapa (horas)',
  escalate_to: 'Escalar para',
  sod_decider: 'Quem pediu não registra a decisão'
});
const ROLES = ['admin', 'finance_manager', 'analyst', 'viewer'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/** Valida e normaliza regras. Devolve `{ ok, rules }` ou `{ ok: false, error }`. */
export function validatePolicyRules(input) {
  if (!Array.isArray(input) || !input.length || input.length > 30) return { ok: false, error: 'A policy precisa de 1 a 30 regras.' };
  const ids = new Set();
  const rules = [];
  for (const [index, raw] of input.entries()) {
    const at = `Regra ${index + 1}`;
    const id = String(raw?.id ?? '').trim();
    const label = String(raw?.label ?? '').trim();
    if (!/^[a-z][a-z0-9_]{1,40}$/.test(id) || ids.has(id)) return { ok: false, error: `${at}: identificador inválido ou repetido.` };
    if (label.length < 2 || label.length > 160 || /[<>]/.test(label)) return { ok: false, error: `${at}: rótulo de 2 a 160 caracteres, sem HTML.` };
    ids.add(id);
    const when = {};
    for (const [key, value] of Object.entries(raw?.when || {})) {
      if (!(key in POLICY_CONDITIONS)) return { ok: false, error: `${at}: condição desconhecida (${key}).` };
      if (value === null || value === '' || value === undefined) continue;
      if (key === 'products') {
        if (!Array.isArray(value) || value.some((item) => !['credit', 'acquiring'].includes(item))) return { ok: false, error: `${at}: produtos inválidos.` };
        if (value.length) when.products = [...new Set(value)];
      } else if (['collateral_required', 'provider_new'].includes(key)) {
        if (typeof value !== 'boolean') return { ok: false, error: `${at}: ${POLICY_CONDITIONS[key]} precisa ser sim ou não.` };
        when[key] = value;
      } else {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) return { ok: false, error: `${at}: ${POLICY_CONDITIONS[key]} inválido.` };
        when[key] = number;
      }
    }
    const require = {};
    for (const [key, value] of Object.entries(raw?.require || {})) {
      if (!(key in POLICY_REQUIREMENTS)) return { ok: false, error: `${at}: requisito desconhecido (${key}).` };
      if (value === null || value === '' || value === undefined || value === false) continue;
      if (['approval_required', 'justification', 'sod_decider'].includes(key)) {
        if (value !== true) return { ok: false, error: `${at}: ${POLICY_REQUIREMENTS[key]} inválido.` };
        require[key] = true;
      } else if (key === 'escalate_to') {
        if (!UUID.test(String(value))) return { ok: false, error: `${at}: escolha um membro para a escalação.` };
        require.escalate_to = String(value);
      } else if (key === 'approver_groups') {
        if (!Array.isArray(value) || value.length > 5) return { ok: false, error: `${at}: até 5 grupos de aprovadores.` };
        const groups = [];
        for (const group of value) {
          const roles = Array.isArray(group?.roles) ? [...new Set(group.roles)] : [];
          const glabel = String(group?.label ?? '').trim();
          const scope = group?.scope === 'group' ? 'group' : 'any';
          if (!roles.length || roles.some((role) => !ROLES.includes(role)) || glabel.length < 2 || glabel.length > 120 || /[<>]/.test(glabel)) {
            return { ok: false, error: `${at}: grupo de aprovadores precisa de papéis válidos e rótulo.` };
          }
          groups.push({ roles, scope, label: glabel });
        }
        if (groups.length) require.approver_groups = groups;
      } else {
        const number = Number(value);
        const [min, max] = { approvals: [1, 5], min_proposals: [1, 20], step_hours: [1, 720] }[key];
        if (!Number.isInteger(number) || number < min || number > max) return { ok: false, error: `${at}: ${POLICY_REQUIREMENTS[key]} entre ${min} e ${max}.` };
        require[key] = number;
      }
    }
    if (!Object.keys(require).length) return { ok: false, error: `${at}: defina ao menos um requisito.` };
    rules.push({ id, label, when, require });
  }
  return { ok: true, rules };
}

/** Texto curto de uma regra, para listas e prévias. */
export function describeRule(rule, { memberName = (id) => id } = {}) {
  const when = [];
  const w = rule.when || {};
  if (w.products?.length) when.push(w.products.map((item) => (item === 'credit' ? 'crédito' : 'adquirência')).join('/'));
  if (isNumber(w.amount_gte)) when.push(`valor ≥ ${w.amount_gte.toLocaleString('pt-BR')}`);
  if (isNumber(w.amount_lt)) when.push(`valor < ${w.amount_lt.toLocaleString('pt-BR')}`);
  if (isNumber(w.term_months_gt)) when.push(`prazo > ${w.term_months_gt} meses`);
  if (w.collateral_required === true) when.push('com garantia exigida');
  if (w.provider_new === true) when.push('provedor novo');
  if (isNumber(w.proposals_lt)) when.push(`menos de ${w.proposals_lt} propostas`);
  const req = [];
  const r = rule.require || {};
  if (r.approval_required) req.push('aprovação');
  if (r.approvals) req.push(`${r.approvals} aprovador(es)`);
  for (const group of r.approver_groups || []) req.push(`ao menos 1 de "${group.label}"`);
  if (r.min_proposals) req.push(`${r.min_proposals} propostas ou justificativa`);
  if (r.justification) req.push('justificativa');
  if (r.step_hours) req.push(`${r.step_hours} h por etapa`);
  if (r.escalate_to) req.push(`escala para ${memberName(r.escalate_to)}`);
  if (r.sod_decider) req.push('quem pediu não decide');
  return `${when.length ? `Quando ${when.join(', ')}` : 'Sempre'}: ${req.join(', ')}.`;
}

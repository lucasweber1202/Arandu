// Políticas de aprovação versionadas (regras puras, testáveis sem DOM).
//
//   Crédito · valor > R$ 1 mi   → Controladoria → CFO
//   Crédito · valor > R$ 5 mi   → Controladoria → CFO → CEO
//   Adquirência                 → Tesouraria → Controladoria
//
// A primeira regra ativa que casa decide as etapas. Publicar cria uma versão
// nova; processos em andamento continuam na versão em que começaram (a
// política não reescreve o passado). Na demonstração, a política desenha
// etapas e explica o caminho — a aprovação registrada continua sendo a do
// motor fictício, com as mesmas regras de permissão.

export const STAGE_ROLES = Object.freeze({
  treasury: { label: 'Tesouraria', person: 'Marina Costa' },
  controller: { label: 'Controladoria', person: 'Helena Prado' },
  cfo: { label: 'CFO', person: 'Ricardo Alves' },
  ceo: { label: 'CEO', person: null }
});
export const PRODUCTS = Object.freeze({ credit: 'Crédito', acquiring: 'Adquirência' });
export const OPERATORS = Object.freeze({ gt: 'maior que', gte: 'a partir de', lt: 'menor que' });
export const FIELDS = Object.freeze({ amount: 'Valor', monthly_volume: 'Volume mensal', term_months: 'Prazo (meses)' });

const valueOf = (rfq, field) => Number(rfq?.demand?.[field]);
export function matches(rule, rfq) {
  if (!rule.active || (rule.product && rule.product !== rfq?.product)) return false;
  if (!rule.condition) return true;
  const actual = valueOf(rfq, rule.condition.field);
  if (!Number.isFinite(actual)) return false;
  const expected = Number(rule.condition.value);
  return rule.condition.op === 'gt' ? actual > expected : rule.condition.op === 'gte' ? actual >= expected : rule.condition.op === 'lt' ? actual < expected : false;
}
/** Regra aplicada e etapas, com o motivo em linguagem simples. */
export function evaluatePolicy(policy, rfq) {
  const rule = (policy?.rules || []).find((candidate) => matches(candidate, rfq)) || null;
  return { rule, stages: rule ? rule.stages.map((key) => ({ key, ...STAGE_ROLES[key] })) : [], reason: rule ? `Regra “${rule.name}”` : 'Nenhuma regra ativa se aplica: a decisão não exige aprovação pela política.' };
}
export const policyVersion = (policies, version) => policies.versions.find((row) => row.version === version) || null;
export const currentPolicy = (policies) => policyVersion(policies, policies.current) || policies.versions[policies.versions.length - 1];
/** Versão com que o processo começou (processos novos usam a atual). */
export function rfqPolicyVersion(policies, rfqId) { return Number(policies.byRfq?.[rfqId]) || policies.current; }

export function conditionText(condition) {
  if (!condition) return 'Sempre';
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(condition.value));
  return `${FIELDS[condition.field] || condition.field} ${OPERATORS[condition.op] || condition.op} ${condition.field === 'term_months' ? condition.value : money}`;
}
/** Validação de rascunho antes de publicar. */
export function validatePolicy(rules) {
  const errors = [];
  if (!rules.some((rule) => rule.active)) errors.push('Ative pelo menos uma regra.');
  rules.forEach((rule, index) => {
    if (!String(rule.name || '').trim()) errors.push(`Regra ${index + 1}: dê um nome.`);
    if (!rule.stages?.length) errors.push(`Regra ${index + 1}: inclua pelo menos uma etapa.`);
    if (rule.condition && !(Number(rule.condition.value) > 0)) errors.push(`Regra ${index + 1}: informe um valor maior que zero na condição.`);
    if (new Set(rule.stages || []).size !== (rule.stages || []).length) errors.push(`Regra ${index + 1}: a mesma etapa aparece duas vezes.`);
  });
  return errors;
}
/** Diferenças entre duas versões, para a revisão antes de publicar. */
export function diffPolicies(before, after) {
  const byId = new Map((before?.rules || []).map((rule) => [rule.id, rule]));
  const changes = [];
  for (const rule of after.rules) {
    const old = byId.get(rule.id);
    if (!old) changes.push(`Nova regra: ${rule.name}`);
    else if (JSON.stringify(old) !== JSON.stringify(rule)) changes.push(`Alterada: ${rule.name}`);
    byId.delete(rule.id);
  }
  for (const rule of byId.values()) changes.push(`Removida: ${rule.name}`);
  return changes;
}

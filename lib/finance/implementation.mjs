// Deterministic post-award facts. Inputs are authorized records, never scores.
export const IMPLEMENTATION_STATUS = Object.freeze({ planned: 'Planejada', in_progress: 'Em andamento', blocked: 'Bloqueada', at_risk: 'Em risco: prazo ultrapassado', ready_for_acceptance: 'Pronta para aceite', accepted: 'Aceita', cancelled: 'Cancelada' });
export const MILESTONE_STATUS = Object.freeze({ planned: 'Planejado', in_progress: 'Em andamento', blocked: 'Bloqueado', completed: 'Concluído com evidência' });
export const MILESTONE_LABELS = Object.freeze({ documentation: 'Documentação', legal_review: 'Revisão jurídica', signing: 'Assinatura', conditions_precedent: 'Condições precedentes', collateral: 'Colateral', guarantees: 'Garantias', facility_setup: 'Configuração da facility', availability_confirmation: 'Confirmação de disponibilidade', drawdown_readiness: 'Prontidão para utilização', go_live: 'Go-live', commercial_setup: 'Configuração comercial', credentials: 'Credenciais', integration: 'Integração', establishments: 'Estabelecimentos', homologation: 'Homologação', pricing_activation: 'Ativação de pricing', settlement_validation: 'Validação de liquidação', kickoff: 'Kickoff', configuration: 'Configuração', validation: 'Validação' });
export function implementationFacts(plan, milestones, issues, today) {
  const terminal = ['accepted', 'cancelled'].includes(plan.status);
  const completed = milestones.filter(m => m.status === 'completed').length;
  const overdue = milestones.filter(m => m.status !== 'completed' && m.due_on < today);
  const openIssues = issues.filter(i => i.status === 'open');
  const blocked = milestones.some(m => m.status === 'blocked') || openIssues.length > 0;
  const status = terminal ? plan.status : blocked ? 'blocked' : overdue.length || plan.target_go_live < today && plan.status !== 'ready_for_acceptance' ? 'at_risk' : plan.status;
  return { status, completed, total: milestones.length, completion: milestones.length ? Math.round(completed / milestones.length * 100) : null, overdue: overdue.map(m => m.id), openIssues: openIssues.length,
    reason: status === 'blocked' ? `${openIssues.length} impedimento(s) aberto(s) ou marco bloqueado.` : status === 'at_risk' ? 'Marco incompleto ou target de go-live anterior à data de referência.' : 'Estado do workflow registrado.',
    formula: 'marcos concluídos / marcos totais × 100; atraso = prazo < data de referência e marco incompleto', observed_at: today };
}
export function validDay(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
export function validateImplementationOpen(input) {
  if (!input || !validDay(input.starts_on) || !validDay(input.target_go_live) || input.target_go_live < input.starts_on) return 'Informe datas válidas, com go-live após o início.';
  for (const k of ['title','source_reference']) if (typeof input[k] !== 'string' || input[k].trim().length < 3 || input[k].length > 200 || /[<>]/.test(input[k])) return 'Informe título e referência da origem, sem HTML.';
  return null;
}

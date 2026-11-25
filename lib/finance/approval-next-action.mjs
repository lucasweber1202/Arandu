// Próxima ação de aprovação da RFQ (Arandu 12.1 / P2-D): fonte única para o
// cabeçalho, o cartão de próximo passo e a aba Decisão. Mesma regra que a aba
// Decisão já usava para liberar a decisão: aprovação `approved` e não
// desatualizada (`stale`, inclusive a marcação conservadora por versão da
// proposta). O banco continua sendo a autoridade (approval_stale).
export function validApproval(approvals = []) {
  return approvals.find((row) => row.status === 'approved' && !row.stale) || null;
}
export function approvalNextAction(approvals = [], { required = false } = {}) {
  const pending = approvals.find((row) => row.status === 'pending') || null;
  if (pending) return { kind: 'pending', request: pending };
  if (!required) return { kind: 'decide', request: null };
  const approved = validApproval(approvals);
  if (approved) return { kind: 'decide', request: approved };
  const latest = [...approvals].sort((a, b) => String(b.requested_at).localeCompare(String(a.requested_at)))[0] || null;
  if (!latest) return { kind: 'request', request: null };
  // Rejeitada, com alterações pedidas, cancelada ou aprovada para versão já
  // substituída: nunca libera a decisão; pede nova aprovação.
  return { kind: 'rerequest', request: latest, reason: latest.status === 'approved' ? 'stale' : latest.status };
}

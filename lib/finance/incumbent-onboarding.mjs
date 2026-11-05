// Onboarding da instituição a partir de um contrato existente: na renegociação
// iniciada pelo contrato, a instituição que já presta o serviço entra no portal
// pelo convite da própria solicitação. Fatos do convite registrado; nenhum
// "recomendado" — convidar outras instituições continua decisão da empresa.
const OPEN_RFQ = ['draft', 'open', 'collecting'];

/**
 * Estado do convite da instituição do contrato de origem.
 * kind: none | invited | accepted | closed | unavailable
 * canInvite: a empresa pode (re)convidar agora (permissão, fase e convite não vivo).
 */
export function incumbentInvite(rfq, providerId, { canManage = false } = {}) {
  if (!providerId) return { kind: 'unavailable', canInvite: false, reason: 'Contrato de origem sem instituição registrada.' };
  const mine = (rfq?.invites || []).filter((row) => row.provider_id === providerId);
  const live = mine.find((row) => row.status === 'accepted') || mine.find((row) => row.status === 'invited');
  const proposal = (rfq?.proposals || []).some((row) => row.provider_id === providerId && row.current_version > 0 && row.status !== 'withdrawn');
  const phaseOpen = OPEN_RFQ.includes(rfq?.status);
  if (live?.status === 'accepted') return { kind: 'accepted', canInvite: false, proposal, acceptedAt: live.accepted_at || null };
  if (live) return { kind: 'invited', canInvite: false, proposal, expiresAt: live.expires_at || null };
  const kind = mine.length ? 'closed' : 'none';
  return { kind, canInvite: canManage && phaseOpen, proposal, reason: phaseOpen ? null : 'A solicitação não está mais recebendo convites nesta fase.' };
}

export const INCUMBENT_TEXT = Object.freeze({
  none: 'A instituição do contrato ainda não foi convidada para esta renegociação. Pelo convite ela entra no portal e responde com autoria própria.',
  invited: 'Convite enviado; aguardando a instituição aceitar no portal.',
  accepted: 'A instituição aceitou o convite e responde por conta própria no portal.',
  closed: 'O convite anterior foi encerrado (expirado ou revogado). Um novo convite pode ser enviado.',
  unavailable: 'Contrato de origem sem instituição registrada.'
});

// Iniciar ou retomar a renegociação de um contrato (Negotiation Studio) a partir
// de qualquer contexto: fila de relacionamentos ou relacionamento da instituição.
// Um só caminho de escrita: POST contract-renewal-rfq, idempotente no servidor
// (devolve a renegociação em andamento). Nenhuma instituição é convidada.
import { button, confirmDialog, toast } from '../../ui.js';

export const RENEGOTIABLE = Object.freeze(['credit', 'acquiring']);

/** O contrato admite renegociação por este caminho e a pessoa pode criar solicitação? */
export function canRenegotiate(ctx, { contractId, category, contractStatus }) {
  return Boolean(contractId) && RENEGOTIABLE.includes(category) && ['active', 'renewing'].includes(contractStatus) && ctx.can('create_rfq');
}

export function renegotiationButton(ctx, { contractId, contractStatus, providerName = null, title = '', from = 'relacionamentos' }) {
  const resume = contractStatus === 'renewing';
  const label = resume ? 'Retomar renegociação' : 'Iniciar renegociação';
  return button(label, { size: 'sm', variant: 'ghost', iconName: 'repeat', attrs: { 'aria-label': `${label}: ${title}`, 'data-renegotiate': contractId }, onClick: async (event) => {
    const target = event.currentTarget;
    if (!await confirmDialog({ title: `${label}?`, confirmLabel: resume ? 'Continuar' : 'Criar rascunho',
      description: `Se já houver uma renegociação em andamento para este contrato${providerName ? ` com ${providerName}` : ''}, ela é aberta. Senão, criamos um rascunho ligado ao contrato; convites, propostas e decisões anteriores não são copiados e o contrato passa para “Em renovação”. Nenhuma instituição é convidada automaticamente.` })) return;
    target.disabled = true;
    try {
      const result = await ctx.send('contract-renewal-rfq', { organization_id: ctx.organization.id, contract_id: contractId });
      toast('Abrindo a renegociação.');
      location.assign(ctx.href(`/finance/rfq.html?id=${encodeURIComponent(result.id)}&de=${encodeURIComponent(from)}`));
    } catch (error) {
      // Resposta incerta: o endpoint devolve a mesma solicitação se repetido.
      toast(`${error.message || 'Não foi possível abrir a renegociação.'} Tentar de novo não cria duplicata.`, 'error');
      target.disabled = false;
    }
  } });
}

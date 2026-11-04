// Renovação a partir de um contrato: abre a concorrência de renovação já em
// andamento ou cria um rascunho com a demanda do contrato (servidor decide).
// Convites, propostas e decisões anteriores nunca são copiados.
import { button, confirmDialog, toast, toastError } from '../../ui.js';

export const renewalSourceable = (contract) => ['credit', 'acquiring'].includes(contract.product) && ['active', 'renewing'].includes(contract.status);

export function renewalButton(ctx, contract, { variant = 'secondary' } = {}) {
  if (!ctx.can('create_rfq') || !renewalSourceable(contract)) return null;
  const renewing = contract.status === 'renewing';
  return button(renewing ? 'Abrir concorrência de renovação' : 'Iniciar nova concorrência', { variant, size: 'sm', iconName: 'repeat', onClick: async (event) => {
    const target = event.currentTarget;
    if (!await confirmDialog({ title: renewing ? 'Abrir concorrência de renovação?' : 'Iniciar nova concorrência?',
      description: `Se já houver uma concorrência de renovação em andamento para este contrato com ${contract.provider_name || 'a instituição'}, ela é aberta. Senão, criamos um rascunho com a demanda do contrato atual; convites, propostas e decisões anteriores não são copiados, e o contrato passa para “Em renovação”.`,
      confirmLabel: renewing ? 'Continuar' : 'Criar rascunho' })) return;
    target.disabled = true;
    try {
      const result = await ctx.send('contract-renewal-rfq', { organization_id: ctx.organization.id, contract_id: contract.id });
      toast('Abrindo a concorrência de renovação.');
      location.assign(ctx.href(`/finance/rfq.html?id=${encodeURIComponent(result.id)}`));
    } catch (error) { toastError(error); target.disabled = false; }
  } });
}

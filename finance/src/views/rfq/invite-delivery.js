/* global __ARANDU_DEMO__ */
// Entrega do convite criado: o link de uso único e quem pode aceitá-lo. Mesmo
// texto no formulário de convites e no onboarding pela renegociação do contrato.
import { el } from '../../core.js';
import { toast, toastError, confirmDialog, button } from '../../ui.js';

export async function deliverInvite(ctx, result, name) {
  if ((__ARANDU_DEMO__ && ctx.mode === 'demo')) {
    toast(`Convite simulado para ${name}. Nenhum e-mail foi enviado. Troque para “Provedor” no topo para responder como a Atlas.`, 'info');
    return;
  }
  if (!result?.invitationToken) return;
  const description = result.recipient_mode === 'organization_open'
    ? 'Este provedor não tem e-mail de contato cadastrado: qualquer conta provedora que receber este link poderá aceitá-lo. Entregue por um canal seguro — ou cadastre o contato e convide de novo para restringir ao e-mail dele:'
    : 'Só a conta com o e-mail de contato cadastrado para este provedor pode aceitar. O convite é enviado a esse e-mail quando o envio estiver ligado; você também pode entregar este link de uso único por um canal seguro:';
  await confirmDialog({ title: 'Convite criado', confirmLabel: 'Pronto', description,
    body: el('input', { class: 'input mono', readonly: true, value: `${location.origin}/provider/invite.html#token=${result.invitationToken}`, 'aria-label': 'Link de convite' }) });
}

// Cada envio de convite cria um convite novo (e um e-mail, quando há contato):
// o servidor não reconcilia repetição. Então, sem confirmação da resposta, o
// botão NÃO volta a enviar às cegas — a pessoa atualiza e confere a lista.
const uncertain = (error) => !(error.status === 0 && !error.code) && (!error.status || error.status >= 500 || ['network_error', 'timeout'].includes(error.code));
export async function sendInvite(ctx, { rfqId, providerId, name, trigger }) {
  trigger.disabled = true;
  let result;
  try {
    result = await ctx.send('invites/send', { rfq_id: rfqId, provider_id: providerId });
  } catch (error) {
    if (uncertain(error)) {
      toast(`Não foi possível confirmar o convite para ${name}. Ele pode já ter sido criado: atualize e confira a lista de convidados antes de convidar de novo.`, 'error',
        { action: button('Atualizar e conferir', { size: 'sm', onClick: () => ctx.reload() }) });
      return false;
    }
    toastError(error);
    trigger.disabled = false;
    return false;
  }
  await deliverInvite(ctx, result, name);
  ctx.reload();
  return true;
}

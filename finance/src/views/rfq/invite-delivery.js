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
  // Reenvio do mesmo convite aberto: o servidor devolve o link já emitido e
  // não manda outro e-mail; contato alterado redireciona o convite a ele.
  const lead = result.outcome === 'replayed' ? 'Este convite já existia e continua válido: o link abaixo é o mesmo, e nenhum e-mail novo foi enviado. '
    : result.outcome === 'retargeted' ? 'O convite em aberto passou a valer só para o e-mail de contato atual, que recebe o aviso quando o envio estiver ligado. '
    : '';
  const description = lead + (result.recipient_mode === 'organization_open'
    ? 'Este provedor não tem e-mail de contato cadastrado: qualquer conta provedora que receber este link poderá aceitá-lo. Entregue por um canal seguro — ou cadastre o contato e convide de novo para restringir ao e-mail dele:'
    : 'Só a conta com o e-mail de contato cadastrado para este provedor pode aceitar. O convite é enviado a esse e-mail quando o envio estiver ligado; você também pode entregar este link de uso único por um canal seguro:');
  await confirmDialog({ title: result.outcome === 'replayed' ? 'Convite já enviado' : result.outcome === 'retargeted' ? 'Convite atualizado' : 'Convite criado', confirmLabel: 'Pronto', description,
    body: el('input', { class: 'input mono', readonly: true, value: `${location.origin}/provider/invite.html#token=${result.invitationToken}`, 'aria-label': 'Link de convite' }) });
}

// O servidor reconcilia a repetição (mesmo convite aberto, sem e-mail novo),
// mas até a migration de integridade de convites estar aplicada o caminho
// legado responde 409 na repetição. Por isso, sem confirmação da resposta, o
// botão continua sem reenviar às cegas: a pessoa atualiza e confere a lista.
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

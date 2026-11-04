// Etapas, vez de quem aprova, ações e resumo de pedidos de aprovação.
// Extraído de views/shared.js (v7.0): dependências específicas, sem barrel.

import { el, icon, timeAgo, APPROVAL_STATUS } from '../../core.js';
import { button, pill, toast, promptDialog, confirmDialog, field, toastError } from '../../ui.js';
import { memberName, memberTitle } from './people.js';

export function approvalSteps(request, members) {
  const list = el('ol', { class: 'steps-list' });
  const current = (request.steps || []).filter((step) => step.status === 'pending').sort((a, b) => a.position - b.position)[0];
  for (const step of [...(request.steps || [])].sort((a, b) => a.position - b.position)) {
    const meta = { approved: ['checkCircle', 'Aprovou', 'success'], rejected: ['x', 'Rejeitou', 'danger'], changes_requested: ['edit', 'Pediu alterações', 'warning'],
      pending: [step === current && request.status === 'pending' ? 'clock' : 'more', step === current && request.status === 'pending' ? 'Aguardando decisão' : 'Na fila', step === current ? 'warning' : 'neutral'] }[step.status] || ['info', step.status, 'neutral'];
    list.append(el('li', { class: `step step-${meta[2]}` }, [
      el('span', { class: 'step-icon' }, icon(meta[0], { size: 14 })),
      el('span', { class: 'step-body' }, [
        el('span', { class: 'step-who' }, [el('strong', { text: memberName(members, step.approver_id) }), el('span', { class: 'muted', text: ` · ${memberTitle(members, step.approver_id)}` })]),
        el('span', { class: 'step-state', text: `${meta[1]}${step.acted_at ? ` · ${timeAgo(step.acted_at)}` : ''}` }),
        step.comment ? el('span', { class: 'step-comment', text: `“${step.comment}”` }) : null
      ])
    ]));
  }
  return list;
}

export function currentStep(request) {
  if (request.status !== 'pending') return null;
  return (request.steps || []).filter((step) => step.status === 'pending').sort((a, b) => a.position - b.position)[0] || null;
}

// Vez de quem vê a tela: com policy, o servidor informa (etapa ativa própria
// ou delegada); sem policy, o próximo aprovador em ordem. Pedido
// desatualizado não aceita decisão de ninguém. Fonte única para caixa,
// início e detalhe da solicitação.

export function isViewerTurn(request, viewerId) {
  if (!request || request.status !== 'pending' || request.stale) return false;
  return request.viewer_can_act ?? (Boolean(viewerId) && currentStep(request)?.approver_id === viewerId);
}

/** Botões de decisão do aprovador, com motivo obrigatório para recusar. */

const REASON_LABELS = { insufficient_competition: 'Competição insuficiente', terms_outside_policy: 'Condições fora da policy', missing_documentation: 'Documentação faltando',
  pricing_review: 'Revisar preço', risk_review: 'Revisar risco', compliance_review: 'Revisar compliance', budget: 'Orçamento', other: 'Outro' };

export function approvalActions(ctx, request, { onDone }) {
  const actions = el('div', { class: 'approval-actions' });
  // Pedido com policy: motivo estruturado (opcional) ao devolver ou rejeitar.
  const reason = request.policy_snapshot ? el('select', { 'aria-label': 'Motivo ao devolver ou rejeitar (opcional)', class: 'reason-select' },
    [el('option', { value: '', text: 'Motivo (opcional)' }), ...Object.entries(REASON_LABELS).map(([value, text]) => el('option', { value, text }))]) : null;
  const act = async (action) => {
    let comment = '';
    if (action !== 'approved') {
      comment = await promptDialog({
        title: action === 'rejected' ? 'Rejeitar a proposta' : 'Pedir alterações',
        description: 'O motivo fica registrado na trilha da solicitação e é enviado a quem pediu a aprovação.',
        label: 'Motivo', minLength: 3, confirmLabel: action === 'rejected' ? 'Rejeitar' : 'Pedir alterações', tone: action === 'rejected' ? 'danger' : 'primary'
      });
      if (comment === null) return;
    } else {
      const ok = await confirmDialog({ title: 'Aprovar esta proposta?', description: 'Sua aprovação fica registrada com data e hora. Se houver próximo aprovador, ele será avisado.', confirmLabel: 'Aprovar' });
      if (!ok) return;
    }
    for (const node of actions.querySelectorAll('button')) node.disabled = true;
    try {
      const result = await ctx.send('approvals/act', { request_id: request.id, action, comment, ...(reason?.value && action !== 'approved' ? { reason_code: reason.value } : {}) });
      toast({ approved: result.status === 'pending' ? 'Aprovação registrada. O próximo aprovador foi avisado.' : 'Aprovação registrada.', rejected: 'Rejeição registrada.', changes_requested: 'Pedido de alterações registrado.' }[action]);
      onDone?.();
    } catch (error) {
      toastError(error);
      // Recusa de acesso (papel ou membresia mudou, #215) é definitiva: repetir não
      // adianta. Resultado incerto (rede, 5xx) pede conferir antes de votar de novo.
      const refused = error.status === 403 || error.status === 404;
      const unknown = !error.status || error.status >= 500;
      if (refused || unknown) {
        actions.replaceChildren(el('p', { class: 'callout callout-warning compact', role: 'alert' }, [
          el('span', { text: refused ? 'Você não pode mais decidir este pedido (o acesso mudou ou a etapa não é mais sua). Nada foi registrado. ' : 'Não confirmamos se a sua decisão foi registrada. Confira o pedido antes de decidir de novo. ' }),
          button(refused ? 'Recarregar' : 'Conferir o pedido', { size: 'sm', iconName: 'refresh', onClick: () => onDone?.() })
        ]));
        return;
      }
      for (const node of actions.querySelectorAll('button')) node.disabled = false;
    }
  };
  if (reason) actions.append(reason);
  actions.append(
    button('Aprovar', { variant: 'primary', iconName: 'check', onClick: () => act('approved') }),
    button('Pedir alterações', { iconName: 'edit', onClick: () => act('changes_requested') }),
    button('Rejeitar', { variant: 'danger-ghost', iconName: 'x', onClick: () => act('rejected') })
  );
  return actions;
}

export function approvalSummaryLine(request) {
  const done = (request.steps || []).filter((step) => step.status === 'approved').length;
  const total = (request.steps || []).length;
  const current = currentStep(request);
  return current ? `Etapa ${current.position} de ${total}` : `${done} de ${total} aprovaram`;
}
export { APPROVAL_STATUS, pill, field };

// Documentos sob demanda: o painel (e seu módulo) só carrega quando a seção abre.

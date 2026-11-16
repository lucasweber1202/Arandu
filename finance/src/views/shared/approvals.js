// Etapas, vez de quem aprova, ações e resumo de pedidos de aprovação.
// Extraído de views/shared.js (v7.0): dependências específicas, sem barrel.

import { el, icon, timeAgo, APPROVAL_STATUS, textSpan, textStrong } from '../../core.js';
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
        el('span', { class: 'step-who' }, [textStrong(memberName(members, step.approver_id)), el('span', { class: 'muted', text: ` · ${memberTitle(members, step.approver_id)}` })]),
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
          textSpan(refused ? 'Você não pode mais decidir este pedido (o acesso mudou ou a etapa não é mais sua). Nada foi registrado. ' : 'Não confirmamos se a sua decisão foi registrada. Confira o pedido antes de decidir de novo. '),
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

// Motivos de desatualização devolvidos hoje pelo servidor (stale_reason). Se o
// servidor passar a enviar stale_reasons (lista), cada um é exibido; código
// desconhecido aparece como genérico, nunca omitido nem traduzido por suposição.
const STALE_LABELS = { rfq_changed: 'A solicitação mudou depois do pedido de aprovação.', proposal_changed: 'A proposta recebeu nova versão depois do pedido.',
  source_ineligible: 'A proposta deixou de estar disponível para decisão (retirada, sem revisão compatível ou sem documento).', context_unavailable: 'Não foi possível conferir o contexto atual; trate como desatualizado.' };
export function staleReasons(request) {
  const codes = Array.isArray(request.stale_reasons) && request.stale_reasons.length ? request.stale_reasons : request.stale_reason ? [request.stale_reason] : request.stale ? ['unknown'] : [];
  return [...new Set(codes)].map((code) => STALE_LABELS[code] || 'O servidor marcou o pedido como desatualizado.');
}

/**
 * Resumo para decidir: o que está sendo aprovado, versão submetida x atual,
 * quem já participou, o que falta e se a decisão é possível agora. Só lê o que
 * o servidor devolveu; a autorização continua no servidor.
 */
export function approvalBrief(ctx, request, rfq) {
  const proposal = (rfq?.proposals || []).find((item) => item.id === request.proposal_id);
  const steps = [...(request.steps || [])].sort((a, b) => a.position - b.position);
  const acted = steps.filter((step) => step.status !== 'pending');
  const waiting = steps.filter((step) => step.status === 'pending');
  const current = currentStep(request);
  const versionNow = proposal?.current_version ?? proposal?.version ?? null;
  const reasons = request.status === 'pending' ? staleReasons(request) : [];
  const canAct = isViewerTurn(request, ctx.viewer?.id);
  const rows = [
    ['Em aprovação', `${proposal?.provider_name || 'Proposta'} · versão submetida v${request.proposal_version ?? '—'}${versionNow != null && versionNow !== request.proposal_version ? ` · versão atual v${versionNow}` : ''}`],
    ['Já participaram', acted.length ? acted.map((step) => `${memberName(ctx.members, step.approver_id)} (${{ approved: 'aprovou', rejected: 'rejeitou', changes_requested: 'pediu alterações' }[step.status] || step.status})`).join(', ') : 'Ninguém ainda'],
    ['Falta', request.status !== 'pending' ? 'Pedido encerrado' : waiting.length ? waiting.map((step) => memberName(ctx.members, step.approver_id) + (step === current ? ' (etapa atual)' : '')).join(', ') : 'Nenhuma etapa pendente'],
    ['Situação', request.status !== 'pending' ? (APPROVAL_STATUS[request.status]?.label || 'Encerrado') : reasons.length ? 'Desatualizado: não aceita decisão' : request.expired ? 'Prazo do pedido expirado' : canAct ? 'Sua decisão pode ser registrada' : 'Aguardando outra etapa']
  ];
  return el('section', { class: 'drawer-section approval-brief', 'data-freshness': request.freshness || (reasons.length ? 'stale' : 'current') }, [
    el('h3', { text: 'Antes de decidir' }),
    el('dl', { class: 'deflist deflist-2' }, rows.map(([key, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: key }), el('dd', { text: value })]))),
    reasons.length ? el('div', { class: 'callout callout-warning compact', role: 'note' }, [icon('alert', { size: 14 }), el('ul', { class: 'plain-list small', 'aria-label': 'Motivos de desatualização' }, reasons.map((text) => el('li', { text })))]) : null,
    reasons.length ? el('p', { class: 'small muted', text: 'Quem pediu a aprovação precisa conferir a proposta atual e pedir de novo. Nada foi decidido.' }) : null
  ].filter(Boolean));
}

export function approvalSummaryLine(request) {
  const done = (request.steps || []).filter((step) => step.status === 'approved').length;
  const total = (request.steps || []).length;
  const current = currentStep(request);
  return current ? `Etapa ${current.position} de ${total}` : `${done} de ${total} aprovaram`;
}
export { APPROVAL_STATUS, pill, field };

// Documentos sob demanda: o painel (e seu módulo) só carrega quando a seção abre.

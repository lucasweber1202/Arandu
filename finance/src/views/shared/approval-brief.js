// Resumo "Antes de decidir" de um pedido de aprovação: o que está sendo
// aprovado, versões submetida × atual, quem já participou, motivos de
// desatualização e evidência do contexto (Arandu 10: context_coverage,
// context_reference, action_conditions). Só lê o que o servidor devolveu.
// Separado de ./approvals.js para não pesar no Painel.

import { el, icon, APPROVAL_STATUS } from '../../core.js';
import { memberName } from './people.js';
import { currentStep, isViewerTurn, contextBlocked } from './approvals.js';

/** Frases factuais sobre a evidência do pedido. Exportada para teste. */
export function contextEvidence(request) {
  const ref = request.context_reference;
  const lines = [];
  if (request.context_coverage === 'incomplete') lines.push('Não foi possível conferir todo o contexto atual: trate como inconclusivo.');
  else if (request.context_coverage === 'historical') lines.push('Pedido encerrado: o contexto mostrado é histórico.');
  else if (request.context_coverage === 'complete') lines.push(request.stale ? 'Contexto conferido: há diferenças em relação ao pedido.' : 'Contexto conferido com a versão atual.');
  if (ref?.recorded || ref?.current) {
    const rv = ref.recorded?.proposal_version, cv = ref.current?.proposal_version;
    if (rv != null || cv != null) lines.push(`Versão da proposta no pedido: ${rv ?? 'não registrada'} · versão atual: ${cv ?? 'não conferida'}.`);
    if (ref.recorded?.rfq_revision != null) lines.push(`Revisão da solicitação no pedido: ${ref.recorded.rfq_revision}.`);
    if (ref.source_kind === 'external') lines.push('Proposta externa transcrita pela empresa (não é envio da instituição).');
  }
  const c = request.action_conditions;
  if (c && request.status === 'pending') {
    if (c.unexpired === false) lines.push('Prazo do pedido expirado.');
    if (c.context_current === false && request.context_coverage === 'complete') lines.push('O contexto atual não corresponde ao submetido.');
  }
  return lines;
}

// Motivos de desatualização devolvidos hoje pelo servidor (stale_reason). Se o
// servidor passar a enviar stale_reasons (lista), cada um é exibido; código
// desconhecido aparece como genérico, nunca omitido nem traduzido por suposição.
const STALE_LABELS = { rfq_changed: 'A solicitação mudou depois do pedido de aprovação.', proposal_changed: 'A proposta recebeu nova versão depois do pedido.',
  source_ineligible: 'A proposta deixou de estar disponível para decisão (retirada, sem revisão compatível ou sem documento).', context_unavailable: 'Não foi possível conferir o contexto atual; trate como desatualizado.',
  process_ineligible: 'A solicitação não está mais em etapa que aceite decisão (encerrada, cancelada ou já decidida).' };
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
  const evidence = contextEvidence(request);
  const blocked = request.status === 'pending' && contextBlocked(request);
  const canAct = isViewerTurn(request, ctx.viewer?.id);
  const rows = [
    ['Em aprovação', `${proposal?.provider_name || 'Proposta'} · versão submetida v${request.proposal_version ?? '—'}${versionNow != null && versionNow !== request.proposal_version ? ` · versão atual v${versionNow}` : ''}`],
    ['Já participaram', acted.length ? acted.map((step) => `${memberName(ctx.members, step.approver_id)} (${{ approved: 'aprovou', rejected: 'rejeitou', changes_requested: 'pediu alterações' }[step.status] || step.status})`).join(', ') : 'Ninguém ainda'],
    ['Falta', request.status !== 'pending' ? 'Pedido encerrado' : waiting.length ? waiting.map((step) => memberName(ctx.members, step.approver_id) + (step === current ? ' (etapa atual)' : '')).join(', ') : 'Nenhuma etapa pendente'],
    ['Situação', request.status !== 'pending' ? (APPROVAL_STATUS[request.status]?.label || 'Encerrado') : reasons.length ? 'Desatualizado: não aceita decisão' : blocked ? 'Contexto inconclusivo: não aceita decisão' : request.expired ? 'Prazo do pedido expirado' : canAct ? 'Sua decisão pode ser registrada' : 'Aguardando outra etapa']
  ];
  if (evidence.length) rows.push(['Evidência', evidence.join(' ')]);
  return el('section', { class: 'drawer-section approval-brief', 'data-freshness': request.freshness || (reasons.length ? 'stale' : 'current'), 'data-coverage': request.context_coverage || 'unknown' }, [
    el('h3', { text: 'Antes de decidir' }),
    el('dl', { class: 'deflist deflist-2' }, rows.map(([key, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: key }), el('dd', { text: value })]))),
    reasons.length ? el('div', { class: 'callout callout-warning compact', role: 'note' }, [icon('alert', { size: 14 }), el('ul', { class: 'plain-list small', 'aria-label': 'Motivos de desatualização' }, reasons.map((text) => el('li', { text })))]) : null,
    blocked && !reasons.length ? el('p', { class: 'callout callout-warning compact', role: 'note', text: 'O servidor não confirmou que o contexto está atual. A decisão fica bloqueada até a conferência ser possível.' }) : null,
    reasons.length ? el('p', { class: 'small muted', text: 'Quem pediu a aprovação precisa conferir a proposta atual e pedir de novo. Nada foi decidido.' }) : null,
    request.status === 'pending' ? el('p', { class: 'small muted', text: 'Papel, ordem das etapas, delegação e segregação de funções são reconferidos pelo servidor no momento do voto.' }) : null
  ].filter(Boolean));
}


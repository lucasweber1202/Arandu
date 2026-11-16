// Resumo "Antes de decidir" e motivos de desatualização da aprovação.
// Separado de shared/approvals.js para não pesar no Painel: só a página de
// Aprovações (rota carregada sob demanda) usa este módulo.
import { el, icon, APPROVAL_STATUS, textSpan } from '../../core.js';
import { memberName } from './people.js';
import { currentStep, isViewerTurn } from './approvals.js';

// Motivos de desatualização devolvidos hoje pelo servidor (stale_reason). Se o
// servidor passar a enviar stale_reasons (lista), cada um é exibido; código
// desconhecido aparece como genérico, nunca omitido nem traduzido por suposição.
const STALE_LABELS = { rfq_changed: 'A solicitação mudou depois do pedido de aprovação.', proposal_changed: 'A proposta recebeu nova versão depois do pedido.',
  source_ineligible: 'A proposta deixou de estar disponível para decisão (retirada, sem revisão compatível ou sem documento).', context_unavailable: 'Não foi possível conferir o contexto atual; trate como desatualizado.',
  process_ineligible: 'O estado do processo não admite mais esta aprovação (por exemplo, decidido ou encerrado).' };
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
    ['Situação', request.status !== 'pending' ? (APPROVAL_STATUS[request.status]?.label || 'Encerrado') : reasons.length ? 'Desatualizado: não aceita decisão' : request.freshness === 'unknown' || request.context_coverage === 'incomplete' ? 'Contexto não conferido: não aceita decisão' : request.expired ? 'Prazo do pedido expirado' : canAct ? 'Sua decisão pode ser registrada' : 'Aguardando outra etapa']
  ];
  return el('section', { class: 'drawer-section approval-brief', 'data-freshness': request.freshness || (reasons.length ? 'stale' : 'current') }, [
    el('h3', { text: 'Antes de decidir' }),
    el('dl', { class: 'deflist deflist-2' }, rows.map(([key, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: key }), el('dd', { text: value })]))),
    reasons.length ? el('div', { class: 'callout callout-warning compact', role: 'note' }, [icon('alert', { size: 14 }), el('ul', { class: 'plain-list small', 'aria-label': 'Motivos de desatualização' }, reasons.map((text) => el('li', { text })))]) : null,
    reasons.length ? el('p', { class: 'small muted', text: 'Quem pediu a aprovação precisa conferir a proposta atual e pedir de novo. Nada foi decidido.' }) : null,
    request.context_coverage === 'incomplete' ? el('p', { class: 'callout callout-warning compact', role: 'note', 'data-coverage': 'incomplete' }, [icon('alert', { size: 14 }),
      textSpan('O servidor não conseguiu conferir todo o contexto ou as atribuições deste pedido; a decisão fica bloqueada até a leitura completa.')]) : null,
    request.context_reference?.recorded && request.context_reference?.current ? el('p', { class: 'small muted', text: `Referência gravada: revisão ${request.context_reference.recorded.rfq_revision ?? '—'}, proposta v${request.context_reference.recorded.proposal_version ?? '—'} · atual: proposta v${request.context_reference.current.proposal_version ?? '—'}.` }) : null
  ].filter(Boolean));
}


// Experiência de aprovação: o que um CFO precisa ver para decidir em segundos.
//
//   Aprovação solicitada · Capital de giro
//   R$ 3.000.000 · 24 meses
//   Proposta: Atlas Bank — 1,39% a.m. · CET 19,8% a.a. · 24 meses
//   Por que esta proposta: “…”
//   Solicitado por Marina Costa · há 2 h · etapa 2 de 2
//   [Aprovar]  [Pedir alterações]            [Rejeitar]
//
// As ações são as do produto (`approvalActions`): mesma regra, mesmo registro.
// A camada só organiza a leitura e separa visualmente a ação negativa.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { el, icon, money, fieldValue, formatDate, timeAgo, productLabel, demandHeadline, PROVIDER_KINDS } from '../../src/core.js';
import { drawer, pill, linkButton } from '../../src/ui.js';
import { comparisonMatrix, revisionTimeline, approvalSteps, approvalActions, currentStep, memberName, approvalSummaryLine } from '../../src/views/shared.js';
import { rfqStages, timeline } from './timeline.js';

const TERMS = {
  credit: [['interest_rate_month', 'Taxa'], ['cet_year', 'CET'], ['term_months', 'Prazo'], ['grace_months', 'Carência'], ['offered_amount', 'Valor ofertado']],
  acquiring: [['mdr_debit', 'MDR débito'], ['mdr_credit_cash', 'MDR crédito'], ['mdr_credit_installment', 'MDR parcelado'], ['pix_fee', 'PIX'], ['settlement_days', 'Liquidação']]
};
function term(product, key, terms) {
  const field = PRODUCTS[product]?.proposalFields.find((item) => item.key === key);
  const raw = field ? fieldValue(field, terms?.[key]) : null;
  if (raw === null) return null;
  const unit = (field.label.match(/\(([^)]*)\)$/) || [])[1] || '';
  return `${raw}${{ meses: ' meses', dias: ' dias', '% a.m.': ' a.m.', '% a.a.': ' a.a.' }[unit] || ''}`;
}

export function approvalSummary(ctx, request, rfq) {
  const proposal = (rfq.proposals || []).find((item) => item.id === request.proposal_id);
  const step = currentStep(request);
  const total = (request.steps || []).length;
  const amount = rfq.product === 'credit' ? money(rfq.demand?.amount) : `${money(rfq.demand?.monthly_volume)}/mês`;
  const stateLabel = request.stale && request.status === 'pending' ? { label: 'Desatualizada', tone: 'danger', icon: 'alert' }
    : step?.approver_id === ctx.viewer?.id ? { label: 'Aguardando você', tone: 'warning', icon: 'clock' }
      : { pending: { label: 'Em andamento', tone: 'info', icon: 'clock' }, approved: { label: 'Aprovada', tone: 'success', icon: 'checkCircle' }, rejected: { label: 'Rejeitada', tone: 'danger', icon: 'x' }, changes_requested: { label: 'Alterações pedidas', tone: 'warning', icon: 'edit' } }[request.status] || { label: request.status, tone: 'neutral' };
  return el('div', { class: 'ap' }, [
    el('div', { class: 'ap-hero' }, [
      el('p', { class: 'ap-kicker' }, [el('span', { text: 'Aprovação solicitada' }), pill(stateLabel, { size: 'sm' })]),
      el('p', { class: 'ap-amount num', text: amount }),
      el('p', { class: 'ap-sub', text: `${productLabel(rfq.product)} · ${demandHeadline(rfq)} · revisão ${rfq.revision || 1}` })
    ]),
    proposal ? el('section', { class: 'ap-block', 'aria-labelledby': `ap-proposal-${request.id}` }, [
      el('h3', { class: 'ap-label', id: `ap-proposal-${request.id}`, text: 'Proposta escolhida por quem pediu' }),
      el('p', { class: 'ap-provider' }, [el('strong', { text: proposal.provider_name }), el('span', { class: 'muted', text: ` · ${PROVIDER_KINDS[proposal.provider_kind] || 'Provedor'} · versão ${request.proposal_version}` })]),
      el('dl', { class: 'ap-terms' }, (TERMS[rfq.product] || []).map(([key, label]) => {
        const value = term(rfq.product, key, proposal.terms);
        return el('div', { class: 'ap-term' }, [el('dt', { text: label }), el('dd', { class: value ? 'num' : 'missing', text: value || 'não informado' })]);
      }))
    ]) : null,
    el('section', { class: 'ap-block' }, [
      el('h3', { class: 'ap-label', text: 'Por que esta proposta' }),
      el('blockquote', { class: 'ap-quote' }, el('p', { text: request.rationale || 'Sem justificativa registrada.' }))
    ]),
    el('dl', { class: 'ap-facts' }, [
      el('div', {}, [el('dt', { text: 'Solicitado por' }), el('dd', { text: `${memberName(ctx.members, request.requested_by)} · ${timeAgo(request.requested_at)}` })]),
      el('div', {}, [el('dt', { text: 'Etapa' }), el('dd', { class: 'num', text: step ? `${step.position} de ${total} · ${memberName(ctx.members, step.approver_id)}` : approvalSummaryLine(request) })]),
      el('div', {}, [el('dt', { text: 'Prazo de resposta' }), el('dd', { class: 'num', text: formatDate(rfq.response_deadline) })])
    ])
  ]);
}

/** Painel de aprovação (substitui o "Ver contexto" na demonstração). */
export function openApproval(ctx, request, rfq) {
  const proposal = (rfq.proposals || []).find((item) => item.id === request.proposal_id);
  const step = currentStep(request);
  const mine = step?.approver_id === ctx.viewer?.id && !request.stale;
  const body = [
    approvalSummary(ctx, request, rfq),
    timeline(rfqStages(rfq, { approvals: [request] }), { compact: true, label: 'Onde a solicitação está' }),
    el('details', { class: 'ap-more', open: true }, [el('summary', { text: 'Comparação com as demais propostas' }),
      el('p', { class: 'muted small', text: `A proposta de ${proposal?.provider_name || '—'} está na primeira coluna. Valores destacados são fatos (maior ou menor informado), não recomendação.` }),
      comparisonMatrix(rfq, [proposal, ...(rfq.proposals || []).filter((item) => item.id !== request.proposal_id)].filter(Boolean))]),
    el('details', { class: 'ap-more' }, [el('summary', { text: 'Mudanças na solicitação' }), revisionTimeline(ctx, rfq)]),
    el('details', { class: 'ap-more', open: true }, [el('summary', { text: 'Etapas de aprovação' }), approvalSteps(request, ctx.members)])
  ];
  let dialog = null;
  const footer = mine
    ? [el('div', { class: 'ap-actions' }, approvalActions(ctx, request, { onDone: () => { dialog?.close(); ctx.reload(); } }))]
    : [el('p', { class: 'muted small ap-waiting' }, [icon('clock', { size: 14 }), el('span', { text: step ? `Aguardando ${memberName(ctx.members, step.approver_id)}.` : 'Nenhuma ação pendente com você.' })]),
      linkButton('Abrir a solicitação', ctx.href(`/finance/rfq.html?id=${rfq.id}#aprovacoes`), { iconName: 'arrowRight', size: 'sm' })];
  dialog = drawer({ title: rfq.title, subtitle: `Pedido de aprovação · ${proposal?.provider_name || ''}`, body, footer, className: 'quick-view approval-view',
    onClose: () => { if (location.hash.startsWith('#request-')) history.replaceState(null, '', location.pathname + location.search); } });
  dialog.dataset.entity = `approval:${request.id}`;
  return dialog;
}

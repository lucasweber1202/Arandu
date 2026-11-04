// Caixa de aprovações: pedidos que dependem do usuário e os que ele acompanha.
// Extraído de company.js (v7.0): uma capability por módulo e rota.

import { PRODUCTS } from '../../../../lib/finance/products.mjs';
import { el, icon, formatDate, productLabel, demandHeadline, timeAgo } from '../../core.js';
import { pill, button, linkButton, emptyState, errorState, tabs, definitionList, drawer } from '../../ui.js';
import { memberName } from '../shared/people.js';
import { currentStep, approvalSummaryLine, approvalActions, approvalSteps, isViewerTurn } from '../shared/approvals.js';
import { comparisonMatrix } from '../shared/comparison.js';
import { revisionTimeline } from '../shared/collaboration.js';
import { keyTerms } from '../shared/terms.js';
import { mods, need } from './capabilities.js';

export async function approvalsInbox(ctx) {
  ctx.header({ title: 'Aprovações', subtitle: 'Decisões que dependem de você e pedidos que você acompanha.' });
  const [approvals] = await Promise.all([ctx.loadApprovals(), need('policy')]);
  // Leitura que falhou não é caixa vazia: "Nada aguardando você" seria falso.
  if (ctx.approvalsError) return errorState({ title: 'Não foi possível carregar as aprovações', error: ctx.approvalsError, onRetry: () => ctx.reload() });
  const rfqs = new Map((ctx.data.rfqs || []).map((rfq) => [rfq.id, rfq]));
  const viewer = ctx.viewer?.id;
  // Pedido com policy: o servidor diz se a pessoa tem etapa ativa (própria ou delegada).
  const isTurn = (row) => isViewerTurn(row, viewer);
  // Pedido desatualizado não aceita decisão: não conta como pendência sua.
  const mine = approvals.filter(isTurn);
  const requested = approvals.filter((row) => row.requested_by === viewer && row.status === 'pending');
  const done = approvals.filter((row) => row.status !== 'pending');

  const row = (request) => {
    const rfq = rfqs.get(request.rfq_id);
    if (!rfq) return null;
    const proposal = (rfq.proposals || []).find((item) => item.id === request.proposal_id);
    const step = currentStep(request);
    const isMine = isTurn(request);
    const total = (request.steps || []).length;
    const dots = el('span', { class: 'step-dots', 'aria-hidden': 'true' }, (request.steps || []).sort((a, b) => a.position - b.position)
      .map((item) => el('span', { class: `step-dot ${item.status}${item === step ? ' current' : ''}` })));
    const open = () => approvalContext(ctx, request, rfq);
    return el('article', { class: `inbox-row${isMine ? ' mine' : ''}`, id: `request-${request.id}` }, [
      el('div', { class: 'inbox-main' }, [
        el('p', { class: 'inbox-kicker' }, [el('span', { text: productLabel(rfq.product, { short: true }) }), el('span', { text: ' · ' }), el('span', { text: demandHeadline(rfq) })]),
        el('h2', { class: 'inbox-title' }, el('a', { href: ctx.href(`/finance/rfq.html?id=${rfq.id}#aprovacoes`), text: rfq.title })),
        el('p', { class: 'inbox-meta', text: `Solicitado por ${memberName(ctx.members, request.requested_by)} ${timeAgo(request.requested_at)}` }),
        el('p', { class: 'inbox-proposal' }, [icon('inbox', { size: 14 }), el('span', { text: proposal ? `${proposal.provider_name} — proposta selecionada (v${request.proposal_version})` : 'Proposta selecionada' })]),
        // Quem decide vê valor, taxa e prazo antes do botão, sem abrir outra tela.
        isMine && !request.stale && proposal ? keyTerms(rfq.product, proposal.terms) : null,
        el('p', { class: 'inbox-progress' }, [dots, el('span', { text: request.status === 'pending' ? `${approvalSummaryLine(request)} · ${(request.steps || []).filter((item) => item.status === 'approved').length} de ${total} aprovadores` : `${(request.steps || []).filter((item) => item.status === 'approved').length} de ${total} aprovaram` })])
      ]),
      el('div', { class: 'inbox-side' }, [
        pill(request.stale && request.status === 'pending' ? { label: 'Desatualizada', tone: 'danger', icon: 'alert' } : isMine ? { label: 'Aguardando você', tone: 'warning', icon: 'clock' } : { pending: { label: 'Em andamento', tone: 'info', icon: 'clock' } }[request.status] || { label: { approved: 'Aprovada', rejected: 'Rejeitada', changes_requested: 'Alterações pedidas', cancelled: 'Cancelada', expired: 'Expirada', superseded: 'Substituída' }[request.status], tone: request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'neutral' }),
        el('div', { class: 'inbox-actions' }, [
          button('Ver contexto', { size: 'sm', iconName: 'eye', onClick: open }),
          ...(isMine && !request.stale ? [...approvalActions(ctx, request, { onDone: () => ctx.reload() }).children].map((node) => { if (node.tagName === 'BUTTON') node.classList.add('btn-sm'); return node; }) : [])
        ])
      ])
    ]);
  };
  const list = (rows, empty) => {
    const box = el('div', { class: 'inbox' });
    const built = rows.map(row).filter(Boolean);
    box.append(...(built.length ? built : [emptyState(empty)]));
    return box;
  };
  const set = tabs([
    { id: 'aguardando', label: 'Aguardando você', count: mine.length, render: () => list(mine, { title: 'Nenhuma decisão esperando por você', text: 'Quando alguém pedir sua aprovação, ela aparece aqui e você recebe uma notificação.', iconName: 'checkCircle' }) },
    { id: 'solicitadas', label: 'Solicitadas por você', count: requested.length, render: () => list(requested, { title: 'Nenhum pedido em andamento', text: 'Peça aprovação na aba Aprovações de uma solicitação com propostas.', iconName: 'send' }) },
    { id: 'concluidas', label: 'Concluídas', count: done.length, render: () => list(done, { title: 'Nenhuma aprovação concluída ainda', iconName: 'clock' }) }
  ], { label: 'Filtrar aprovações', initial: mine.length ? 'aguardando' : requested.length ? 'solicitadas' : 'aguardando' });
  const wanted = location.hash.startsWith('#request-') ? approvals.find((item) => `#request-${item.id}` === location.hash) : null;
  if (wanted && rfqs.get(wanted.rfq_id)) queueMicrotask(() => approvalContext(ctx, wanted, rfqs.get(wanted.rfq_id)));
  return set.node;
}

/** Contexto completo para o aprovador decidir sem sair da caixa. */
function approvalContext(ctx, request, rfq) {
  const proposal = (rfq.proposals || []).find((item) => item.id === request.proposal_id);
  const step = currentStep(request);
  const body = [
    el('section', { class: 'drawer-section' }, [el('h3', { text: 'Demanda' }), el('p', { class: 'muted small', text: `${productLabel(rfq.product)} · revisão ${rfq.revision || 1} · prazo de resposta ${formatDate(rfq.response_deadline)}` }),
      rfq.description ? el('p', { class: 'prose', text: rfq.description }) : null, definitionList(PRODUCTS[rfq.product].demandFields, rfq.demand)]),
    el('section', { class: 'drawer-section' }, [el('h3', { text: 'Por que esta proposta' }), el('blockquote', { class: 'rationale' }, [el('span', { class: 'rationale-label', text: memberName(ctx.members, request.requested_by) }), el('p', { text: request.rationale || 'Sem justificativa.' })])]),
    el('section', { class: 'drawer-section' }, [el('h3', { text: 'Comparação com as demais propostas' }), el('p', { class: 'muted small', text: `A proposta de ${proposal?.provider_name || '—'} está na primeira coluna.` }),
      comparisonMatrix(rfq, [proposal, ...(rfq.proposals || []).filter((item) => item.id !== request.proposal_id)].filter(Boolean))]),
    el('section', { class: 'drawer-section' }, [el('h3', { text: 'Mudanças na solicitação' }), revisionTimeline(ctx, rfq)]),
    el('section', { class: 'drawer-section' }, [el('h3', { text: request.policy_snapshot ? 'Fluxo pela policy' : 'Etapas de aprovação' }),
      request.policy_snapshot ? mods.policy.policyTimeline(ctx, request, { onChange: () => ctx.reload() }) : approvalSteps(request, ctx.members)])
  ];
  const footer = (request.viewer_can_act ?? step?.approver_id === ctx.viewer?.id) && !request.stale
    ? [approvalActions(ctx, request, { onDone: () => { dialog.close(); ctx.reload(); } })]
    : [linkButton('Abrir a solicitação', ctx.href(`/finance/rfq.html?id=${rfq.id}#aprovacoes`), { iconName: 'arrowRight' })];
  const dialog = drawer({ title: rfq.title, subtitle: `${approvalSummaryLine(request)} · ${proposal?.provider_name || ''}`, body, footer,
    onClose: () => { if (location.hash.startsWith('#request-')) history.replaceState(null, '', location.pathname + location.search); } });
}

// -------------------------------------------------------------- propostas

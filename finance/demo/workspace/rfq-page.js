// Tela de solicitação na demonstração: a melhor tela do produto.
//
//   ← Solicitações
//   Capital de giro — R$ 3 milhões                              ☆  •••
//   R$ 3.000.000
//   Crédito · 24 meses · 3 de carência
//   ● Em avaliação · Revisão 3 · Prazo em 9 dias · 3 de 3 responderam
//   ● Pedido ━ ● Convites ━ ● Propostas ━ ◉ Comparação ━ ○ Decisão ━ ○ Contrato
//   Visão geral   Propostas 3   Comparação   Aprovação   Decisão   Histórico
//
// A tela do produto (views/rfq.js) continua dona de dados, ações e regras;
// esta camada reorganiza o cabeçalho, troca a linha de etapas pela Arandu
// Timeline, renomeia abas (os ids e deep links não mudam) e liga a bandeja de
// comparação às propostas.

import { el, icon, money, formatDate, relativeDays, daysUntil, productLabel, RFQ_STATUS } from '../../src/core.js';
import { button, toast } from '../../src/ui.js';
import * as prefs from './preferences.js';
import { rfqStages, timeline } from './timeline.js';
import { trayCheckbox } from './comparison-tray.js';
import { installCompare } from './compare.js';
import { openQuickView, workContext } from './quick-view.js';
import { rfqNext, proposalFacts, currentApprovalStep, STAGES } from './next-action.js';
import { nextBlock } from './work-ui.js';
import { rfqHandoff } from './handoff.js';

const TAB_LABELS = { aprovacoes: 'Aprovação', atividade: 'Histórico' };

export function starButton(type, id, title, { compact = true, announce = () => {} } = {}) {
  const on = prefs.isFavorite(type, id);
  const node = el('button', { type: 'button', class: `${compact ? 'row-star' : 'icon-btn page-star'}${on ? ' is-on' : ''}`, 'aria-pressed': String(on), 'aria-label': `Favoritar ${title}`, title: on ? 'Remover dos favoritos' : 'Favoritar' }, icon('star', { size: compact ? 15 : 18 }));
  node.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const next = prefs.toggleFavorite(type, id, title);
    node.setAttribute('aria-pressed', String(next));
    node.classList.toggle('is-on', next);
    node.title = next ? 'Remover dos favoritos' : 'Favoritar';
    toast(next ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.', 'info');
    announce(next ? `${title} adicionado aos favoritos.` : `${title} removido dos favoritos.`);
  });
  return node;
}

function enhanceProposalCards(ctx, rfq) {
  for (const card of document.querySelectorAll('#panel-propostas .proposal-card')) {
    if (card.dataset.dw) continue;
    card.dataset.dw = '1';
    const proposal = (rfq.proposals || []).find((item) => `proposal-${item.id}` === card.id);
    const badges = card.querySelector('.proposal-badges');
    if (!proposal || !badges) continue;
    badges.append(trayCheckbox(rfq, proposal), button('Ver resumo', { variant: 'ghost', size: 'sm', iconName: 'eye', onClick: () => openQuickView(ctx, 'proposal', proposal.id) }));
  }
}

export async function enhanceRfq(ctx, { lastListHref, markRestore, focusButton }) {
  const params = new URLSearchParams(location.search);
  const rfq = (ctx.data.rfqs || []).find((item) => item.id === params.get('id'));
  if (!rfq) return;
  // "Depois de criar": voltar para a lista, se a pessoa preferir.
  if (params.get('created') && prefs.readState().behavior.afterCreate === 'list') {
    try { sessionStorage.setItem('arandu-demo-flash', `Solicitação “${rfq.title}” criada como rascunho.`); } catch { /* sem sessão */ }
    location.replace(ctx.href('/finance/rfqs.html'));
    return;
  }
  prefs.recordRecent('rfq', rfq.id, rfq.title);
  const head = document.querySelector('.page-head');
  const main = head?.querySelector('.page-head-main');
  if (!head || !main) return;
  // Recarregar a tela (ctx.reload) refaz dados e ações; o cabeçalho é refeito do zero.
  head.classList.add('rfq-head');
  for (const node of head.querySelectorAll('.rfq-tools, .rfq-focus')) node.remove();

  const back = el('a', { class: 'rfq-back', href: lastListHref() }, [icon('chevronLeft', { size: 14 }), el('span', { text: 'Solicitações' })]);
  back.addEventListener('click', markRestore);
  // A trilha do topo também volta para a lista como a pessoa a deixou.
  const crumb = document.querySelector('#breadcrumbs a[href*="/finance/rfqs.html"]');
  if (crumb) { crumb.href = lastListHref(); crumb.addEventListener('click', markRestore); }
  const h1 = main.querySelector('h1');
  const tools = el('div', { class: 'rfq-tools' }, [starButton('rfq', rfq.id, rfq.title, { compact: false })]);
  const actions = head.querySelector('.page-actions');
  const more = actions?.querySelector('.menu');
  if (more) {
    const trigger = more.querySelector('button');
    trigger.className = 'icon-btn rfq-more';
    trigger.setAttribute('aria-label', 'Mais ações');
    trigger.replaceChildren(icon('more', { size: 18 }));
    tools.append(more);
  }
  if (focusButton) { const focus = focusButton(); focus.classList.add('rfq-focus'); actions?.prepend(focus); }
  const demand = rfq.demand || {};
  const figure = rfq.product === 'credit' ? money(demand.amount) : `${money(demand.monthly_volume)} / mês`;
  const sub = rfq.product === 'credit'
    ? [productLabel(rfq.product), demand.term_months ? `${demand.term_months} meses` : null, demand.grace_months ? `${demand.grace_months} de carência` : null].filter(Boolean).join(' · ')
    : [productLabel(rfq.product), demand.average_ticket ? `ticket médio ${money(demand.average_ticket)}` : null].filter(Boolean).join(' · ');
  const live = ['open', 'collecting'].includes(rfq.status);
  const days = daysUntil(rfq.response_deadline);
  const invited = (rfq.invites || []).length || rfq.invites_count || 0;
  const meta = main.querySelector('.page-meta');
  const status = meta?.querySelector('.pill');
  const item = (text, className = '') => el('span', { class: `rfq-meta-item num ${className}`.trim(), text });
  meta?.replaceChildren(...[status || null,
    item(`Revisão ${rfq.revision || 1}`),
    rfq.response_deadline ? item(live ? `Prazo ${relativeDays(rfq.response_deadline)}` : `Prazo ${formatDate(rfq.response_deadline)}`, live && days !== null && days <= 2 ? 'is-urgent' : '') : item('Sem prazo'),
    item(invited ? `${invited} convidados · ${(rfq.proposals || []).length} respostas` : 'Nenhum convite'),
    rfq.owner_name ? item(rfq.owner_name) : null].filter(Boolean));
  main.replaceChildren(back, el('div', { class: 'rfq-title-row' }, [h1, tools]), el('p', { class: 'rfq-figure num', text: figure }), el('p', { class: 'rfq-sub', text: sub }), meta || '');
  main.querySelector('.lede')?.remove();

  // Abas: rótulos da nova estrutura; ids e âncoras continuam os mesmos.
  for (const [id, label] of Object.entries(TAB_LABELS)) {
    const tab = document.querySelector(`#tab-${id} > span:first-child`);
    if (tab) tab.textContent = label;
  }
  // Timeline no lugar da linha de etapas.
  const lifecycle = document.querySelector('#view .detail > .lifecycle');
  const [approvals, decisions] = await Promise.all([
    ctx.loadApprovals(),
    ctx.api(`decisions?organization_id=${encodeURIComponent(ctx.organization.id)}`).then((result) => result.rows || []).catch(() => [])
  ]);
  const decision = decisions.find((row) => row.rfq_id === rfq.id) || null;
  const contract = decision ? (ctx.data.contracts || []).find((row) => row.decision_id === decision.id) : null;
  const line = timeline(rfqStages(rfq, { approvals, decision, contract }), { label: 'Onde a solicitação está' });
  line.classList.add('rfq-timeline');
  if (lifecycle) lifecycle.replaceWith(line); else document.querySelector('#view .detail')?.prepend(line);
  // Fase atual em destaque: só a ação que importa agora tem peso visual.
  document.querySelector('#stage-panel')?.remove();
  line.after(stagePanel(ctx, rfq, approvals));

  // Propostas: bandeja de comparação e resumo lateral em cada cartão.
  const panels = document.querySelector('#view .tab-panels');
  if (panels) new MutationObserver(() => enhanceProposalCards(ctx, rfq)).observe(panels, { childList: true, subtree: true });
  enhanceProposalCards(ctx, rfq);
  installCompare(ctx, rfq);
  return rfq;
}

/** Detalhe da fase atual: o que a pessoa precisa saber para dar o próximo passo. */
function stageDetail(ctx, rfq, next, approvals) {
  const memberName = (id) => (ctx.members || []).find((member) => member.user_id === id)?.display_name || '';
  if (next.stage === 'draft') {
    const current = next.steps.indexOf(next.invited ? 'Abrir para propostas' : 'Completar demanda');
    return el('ol', { class: 'stage-steps', 'aria-label': 'Etapas do rascunho' }, next.steps.map((label, index) => el('li', { class: index < current ? 'is-done' : index === current ? 'is-current' : '', 'aria-current': index === current ? 'step' : null }, [
      el('span', { class: 'stage-step-dot', 'aria-hidden': 'true' }, index < current ? icon('check', { size: 10 }) : null), el('span', { text: label })])));
  }
  if (next.stage === 'collecting' && next.invited) {
    const ratio = Math.round((next.answered / next.invited) * 100);
    return el('div', { class: 'stage-progress' }, [
      el('p', { class: 'stage-figure num' }, [el('strong', { text: `${next.answered}/${next.invited}` }), el('span', { text: ' responderam' })]),
      el('span', { class: 'stage-bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(next.invited), 'aria-valuenow': String(next.answered), 'aria-label': `${next.answered} de ${next.invited} provedores responderam` }, el('span', { style: `width:${ratio}%` }))
    ]);
  }
  if (next.stage === 'evaluation') {
    const facts = proposalFacts(rfq);
    return el('ul', { class: 'stage-facts', role: 'list' }, [
      el('li', { text: `${facts.total} proposta${facts.total === 1 ? '' : 's'}` }),
      el('li', { text: `${facts.complete} completa${facts.complete === 1 ? '' : 's'}` }),
      facts.incomplete.length ? el('li', { class: 'is-warn', text: `${facts.incomplete.length} com campos ausentes` }) : null,
      facts.outdated.length ? el('li', { text: `${facts.outdated.length} responde${facts.outdated.length === 1 ? '' : 'm'} à revisão anterior` }) : null
    ].filter(Boolean));
  }
  if (next.stage === 'approval') {
    const request = approvals.find((row) => row.id === next.requestId);
    if (!request) return null;
    const step = currentApprovalStep(request);
    return el('ol', { class: 'stage-steps is-approval', 'aria-label': 'Etapas de aprovação' }, [...(request.steps || [])].sort((a, b) => a.position - b.position).map((item) => el('li', {
      class: item.status === 'approved' ? 'is-done' : item === step ? 'is-current' : '', 'aria-current': item === step ? 'step' : null }, [
      el('span', { class: 'stage-step-dot', 'aria-hidden': 'true' }, item.status === 'approved' ? icon('check', { size: 10 }) : null),
      el('span', { text: `Etapa ${item.position} · ${memberName(item.approver_id)}${item.status === 'approved' ? ' · aprovou' : item === step ? ' · aguardando' : ''}`.replace(/ · $/, '') })])));
  }
  return null;
}
function stagePanel(ctx, rfq, approvals) {
  const next = rfqNext(rfq, { ...workContext(ctx), approvals });
  const handoff = rfqHandoff(ctx, rfq, next);
  const detail = stageDetail(ctx, rfq, next, approvals);
  const block = nextBlock(ctx, next, { extra: [detail, handoff].filter(Boolean).length ? el('div', { class: 'stage-extra' }, [detail, handoff].filter(Boolean)) : null, id: 'stage-panel' });
  block.classList.add('stage-panel');
  block.prepend(el('p', { class: 'stage-name', text: `Fase: ${STAGES[next.stage]?.label || next.state}` }));
  return block;
}

export const statusLabel = (rfq) => RFQ_STATUS[rfq.status]?.label || rfq.status;

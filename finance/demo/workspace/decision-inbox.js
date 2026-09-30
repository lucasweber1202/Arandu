// Aprovações como caixa de decisão executiva:  CAIXA | CONTEXTO DA DECISÃO
//
// Governança responsável: a linha da caixa nunca aprova. Ela leva a
// "Revisar decisão", o contexto aparece ao lado (ou numa folha, no celular)
// e só ali estão as ações — Pedir alterações · Rejeitar · Aprovar — que são as
// do produto (approvalActions: mesma regra, mesma confirmação, mesmo registro).
//
// O contexto responde, nesta ordem:
//   1 Quanto?  2 Qual proposta?  3 Quais condições?  4 Por que esta proposta?
//   5 Quais diferenças materiais existem?  6 Quem pediu?  7 Em que etapa?  8 Decisão.
// As diferenças são fatos entre valores informados; nada ordena provedores.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { el, icon, money, fieldValue, formatDate, timeAgo, productLabel, demandHeadline, PROVIDER_KINDS } from '../../src/core.js';
import { drawer, linkButton, emptyState } from '../../src/ui.js';
import { approvalSteps, approvalActions, memberName, revisionTimeline } from '../../src/views/shared.js';
import { approvalNext } from './next-action.js';
import { stateLabel } from './work-ui.js';
import { handoffButton } from './handoff.js';
import { announce } from './shell.js';

const SPLIT_QUERY = '(min-width: 1100px)';
const TERMS = {
  credit: ['offered_amount', 'interest_rate_month', 'cet_year', 'term_months', 'grace_months', 'fees_amount', 'collateral_required', 'contracting_days', 'valid_until'],
  acquiring: ['mdr_debit', 'mdr_credit_cash', 'mdr_credit_installment', 'pix_fee', 'anticipation_rate', 'settlement_days', 'terminal_rent', 'contract_months', 'early_exit_penalty', 'valid_until']
};
const spec = (product, key) => PRODUCTS[product]?.proposalFields.find((field) => field.key === key) || null;
const shortLabel = (product, key) => (spec(product, key)?.label || key).replace(/\s*\(.*\)$/, '');
function value(product, key, terms) {
  const field = spec(product, key);
  const raw = field ? fieldValue(field, terms?.[key]) : null;
  if (raw === null) return null;
  const unit = (field.label.match(/\(([^)]*)\)$/) || [])[1] || '';
  return `${raw}${{ meses: ' meses', dias: ' dias', '% a.m.': ' a.m.', '% a.a.': ' a.a.' }[unit] || ''}`;
}
const numeric = (terms, key) => (Number.isFinite(Number(terms?.[key])) && terms?.[key] !== '' && terms?.[key] !== null ? Number(terms[key]) : null);

/** 5. Diferenças materiais: a escolhida contra o que as demais informaram. */
function materialDifferences(rfq, chosen) {
  const others = (rfq.proposals || []).filter((proposal) => proposal.id !== chosen.id);
  if (!others.length) return el('p', { class: 'muted small', text: 'Não há outras propostas nesta solicitação.' });
  const rows = [];
  for (const key of TERMS[rfq.product] || []) {
    const field = spec(rfq.product, key);
    if (!field) continue;
    const mine = value(rfq.product, key, chosen.terms);
    const theirs = others.map((proposal) => ({ name: proposal.provider_name || 'Proposta', text: value(rfq.product, key, proposal.terms), number: numeric(proposal.terms, key) }));
    const mineNumber = numeric(chosen.terms, key);
    const differs = theirs.some((item) => item.text !== mine);
    if (!differs) continue;
    let mark = null;
    const numbers = [mineNumber, ...theirs.map((item) => item.number)].filter((item) => item !== null);
    if (field.type !== 'text' && mineNumber !== null && numbers.length > 1 && new Set(numbers).size > 1) {
      if (mineNumber === Math.min(...numbers)) mark = '↓ menor valor informado';
      else if (mineNumber === Math.max(...numbers)) mark = '↑ maior valor informado';
    }
    rows.push(el('tr', {}, [
      el('th', { scope: 'row', text: shortLabel(rfq.product, key) }),
      el('td', { class: `num${mine ? '' : ' missing'}` }, [el('span', { text: mine || 'não informado' }), mark ? el('span', { class: 'dx-mark', text: mark }) : null]),
      el('td', { class: 'dx-others' }, theirs.map((item) => el('span', { class: `dx-other${item.text ? '' : ' missing'}` }, [el('span', { class: 'dx-other-name', text: `${item.name}: ` }), el('span', { class: 'num', text: item.text || 'não informado' })])))
    ]));
  }
  if (!rows.length) return el('p', { class: 'muted small', text: 'As condições informadas são iguais nas propostas.' });
  return el('div', { class: 'dx-wrap' }, [
    el('table', { class: 'dx' }, [el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Condição' }), el('th', { scope: 'col', text: 'Proposta em aprovação' }), el('th', { scope: 'col', text: 'Demais propostas' })])), el('tbody', {}, rows)]),
    el('p', { class: 'dx-note' }, [icon('info', { size: 13 }), el('span', { text: 'Só critérios em que as propostas diferem. Setas indicam o menor ou maior valor informado — fato, não recomendação.' })])
  ]);
}

function section(number, title, body, { id = null } = {}) {
  return el('section', { class: 'dc-section', id, 'aria-labelledby': `dc-${number}` }, [
    el('h3', { class: 'dc-q', id: `dc-${number}` }, [el('span', { class: 'dc-n num', 'aria-hidden': 'true', text: String(number) }), el('span', { text: title })]), body]);
}

/** Contexto completo de uma decisão (usado no painel ao lado e na folha do celular). */
export function decisionContext(ctx, request, rfq, { onDone }) {
  const proposal = (rfq.proposals || []).find((item) => item.id === request.proposal_id);
  const next = approvalNext(request, rfq, { viewerId: ctx.viewer?.id, members: ctx.members });
  const credit = rfq.product === 'credit';
  const amount = credit ? money(rfq.demand?.amount) : `${money(rfq.demand?.monthly_volume)}/mês`;
  const body = [
    el('header', { class: 'dc-head' }, [
      el('p', { class: 'dc-kicker' }, [stateLabel(next), el('span', { class: 'dc-kicker-sep', 'aria-hidden': 'true', text: '·' }), el('span', { text: `Etapa ${next.position || '—'} de ${next.total}` })]),
      el('h2', { class: 'dc-title', id: 'decision-title', text: rfq.title })
    ]),
    section(1, 'Quanto?', el('div', {}, [el('p', { class: 'dc-amount num', text: amount }), el('p', { class: 'dc-sub', text: `${productLabel(rfq.product)} · ${demandHeadline(rfq)} · revisão ${rfq.revision || 1}` })])),
    section(2, 'Qual proposta?', proposal ? el('p', { class: 'dc-provider' }, [el('strong', { text: proposal.provider_name }),
      el('span', { class: 'muted', text: ` · ${PROVIDER_KINDS[proposal.provider_kind] || 'Provedor'} · versão ${request.proposal_version}${proposal.rfq_revision ? ` · responde à revisão ${proposal.rfq_revision}` : ''}` })]) : el('p', { class: 'muted', text: 'Proposta indisponível.' })),
    section(3, 'Quais condições?', proposal ? el('dl', { class: 'dc-terms' }, (TERMS[rfq.product] || []).slice(0, 8).map((key) => {
      const text = value(rfq.product, key, proposal.terms);
      return el('div', { class: 'dc-term' }, [el('dt', { text: shortLabel(rfq.product, key) }), el('dd', { class: text ? 'num' : 'missing', text: text || 'não informado' })]);
    })) : el('p', { class: 'muted', text: '—' })),
    section(4, 'Por que esta proposta?', el('blockquote', { class: 'dc-quote' }, [el('p', { text: request.rationale || 'Sem justificativa registrada.' }), el('footer', { text: `— ${memberName(ctx.members, request.requested_by)}` })])),
    section(5, 'Quais diferenças materiais existem?', proposal ? materialDifferences(rfq, proposal) : el('p', { class: 'muted', text: '—' })),
    section(6, 'Quem pediu?', el('p', { class: 'dc-who' }, [el('strong', { text: memberName(ctx.members, request.requested_by) }), el('span', { class: 'muted', text: ` · ${timeAgo(request.requested_at)} · prazo de resposta da solicitação ${formatDate(rfq.response_deadline)}` })])),
    section(7, 'Em que etapa está?', approvalSteps(request, ctx.members)),
    el('details', { class: 'dc-more' }, [el('summary', { text: `Mudanças na solicitação · revisão ${rfq.revision || 1}` }), revisionTimeline(ctx, rfq)]),
    el('p', { class: 'dc-links' }, [
      linkButton('Ver comparação completa', ctx.href(`/finance/rfq.html?id=${rfq.id}#comparacao`), { variant: 'ghost', size: 'sm', iconName: 'scale' }),
      linkButton('Abrir a solicitação', ctx.href(`/finance/rfq.html?id=${rfq.id}#aprovacoes`), { variant: 'ghost', size: 'sm', iconName: 'arrowRight' })
    ])
  ];
  let decision;
  if (next.mine && !request.stale) {
    const actions = approvalActions(ctx, request, { onDone });
    // Ordem de leitura da decisão: pedir alterações, rejeitar e, por último, aprovar.
    const [approve, changes, reject] = [...actions.children];
    actions.replaceChildren(changes, reject, el('span', { class: 'dc-spacer', 'aria-hidden': 'true' }), approve);
    decision = section(8, 'Decisão', el('div', {}, [el('p', { class: 'dc-sub', text: 'Sua decisão fica registrada com data e hora na trilha da solicitação.' }), actions]), { id: 'decision-actions' });
  } else {
    const approved = request.status === 'approved' && !request.stale;
    decision = section(8, 'Decisão', el('div', { class: 'dc-waiting' }, [
      el('p', { class: 'muted' }, [icon(approved ? 'checkCircle' : 'clock', { size: 14 }), el('span', { text: ` ${next.action}. ${next.why}` })]),
      approved ? handoffButton(ctx, { userId: request.requested_by, path: `/finance/rfq.html?id=${rfq.id}#decisao`, note: 'Registrar a decisão aprovada' })
        : request.status === 'pending' ? handoffButton(ctx, { userId: next.owner?.id, path: `/finance/approvals.html#request-${request.id}`, note: 'Ver o mesmo pedido como quem decide' }) : null
    ].filter(Boolean)), { id: 'decision-actions' });
  }
  return [...body.filter(Boolean), decision];
}

export async function decisionInbox(ctx) {
  ctx.header({ title: 'Aprovações', subtitle: 'Decisões que dependem de você e pedidos que você acompanha. Revise o contexto antes de decidir.' });
  const approvals = await ctx.loadApprovals();
  const rfqs = new Map((ctx.data.rfqs || []).map((rfq) => [rfq.id, rfq]));
  const viewer = ctx.viewer?.id;
  const rows = approvals.filter((request) => rfqs.has(request.rfq_id));
  const groups = {
    mine: rows.filter((request) => approvalNext(request, rfqs.get(request.rfq_id), { viewerId: viewer, members: ctx.members }).mine),
    requested: rows.filter((request) => request.requested_by === viewer && request.status === 'pending'),
    done: rows.filter((request) => request.status !== 'pending')
  };
  const wanted = location.hash.startsWith('#request-') ? rows.find((request) => `#request-${request.id}` === location.hash) : null;
  let filter = wanted ? (groups.mine.includes(wanted) ? 'mine' : groups.requested.includes(wanted) ? 'requested' : groups.done.includes(wanted) ? 'done' : 'all') : groups.mine.length ? 'mine' : groups.requested.length ? 'requested' : 'mine';
  let selected = wanted?.id || null;
  const split = () => matchMedia(SPLIT_QUERY).matches;

  const root = el('div', { class: 'dinbox' });
  const segments = el('div', { class: 'seg dinbox-filter', role: 'group', 'aria-label': 'Filtrar aprovações' });
  const list = el('ul', { class: 'dinbox-list', role: 'list', 'aria-label': 'Pedidos de aprovação' });
  const context = el('section', { class: 'dinbox-context', id: 'decision-context', 'aria-labelledby': 'decision-title', tabindex: '-1' });
  const options = [['mine', 'Aguardando você', groups.mine.length], ['requested', 'Solicitadas por você', groups.requested.length], ['done', 'Concluídas', groups.done.length], ['all', 'Todas', rows.length]];
  const visible = () => (filter === 'all' ? rows : groups[filter]);

  function drawSegments() {
    segments.replaceChildren(...options.map(([value, label, count]) => {
      const node = el('button', { type: 'button', class: 'seg-item', 'aria-pressed': String(value === filter), dataset: { filter: value } }, [el('span', { text: label }), el('span', { class: 'seg-count num', text: String(count) })]);
      node.addEventListener('click', () => { filter = value; drawSegments(); drawList(); if (split()) select(visible()[0]?.id || null, { focus: false }); });
      return node;
    }));
  }
  function drawList() {
    const items = visible();
    list.replaceChildren(...(items.length ? items.map((request) => {
      const rfq = rfqs.get(request.rfq_id);
      const proposal = (rfq.proposals || []).find((item) => item.id === request.proposal_id);
      const next = approvalNext(request, rfq, { viewerId: viewer, members: ctx.members });
      const current = request.id === selected;
      const link = el('a', { class: 'dinbox-item', href: `#request-${request.id}`, id: `request-${request.id}`, 'aria-current': current ? 'true' : null, dataset: { id: request.id } }, [
        el('span', { class: 'dinbox-row-top' }, [stateLabel(next), el('span', { class: 'dinbox-when', text: timeAgo(request.requested_at) })]),
        el('span', { class: 'dinbox-title', text: rfq.title }),
        el('span', { class: 'dinbox-meta num', text: `${rfq.product === 'credit' ? money(rfq.demand?.amount, { compact: true }) : `${money(rfq.demand?.monthly_volume, { compact: true })}/mês`} · ${proposal?.provider_name || 'Proposta'} · etapa ${next.position || '—'} de ${next.total}` }),
        el('span', { class: 'dinbox-review' }, [el('span', { text: next.mine ? 'Revisar decisão' : 'Ver contexto' }), icon('arrowRight', { size: 13 })])
      ]);
      link.addEventListener('click', (event) => { event.preventDefault(); select(request.id, { focus: true, push: true }); });
      return el('li', {}, link);
    }) : [el('li', {}, emptyState({ title: filter === 'mine' ? 'Nenhuma decisão esperando por você' : 'Nada neste filtro', text: filter === 'mine' ? 'Quando alguém pedir sua aprovação, ela aparece aqui.' : null, iconName: 'checkCircle', compact: true }))]));
  }
  // Depois de decidir, volta para a fila: o próximo pedido pendente assume o contexto.
  const onDone = () => { history.replaceState(null, '', location.pathname + location.search); ctx.reload(); };
  function select(id, { focus = false, push = false } = {}) {
    selected = id;
    for (const node of list.querySelectorAll('.dinbox-item')) { if (node.dataset.id === id) node.setAttribute('aria-current', 'true'); else node.removeAttribute('aria-current'); }
    const request = rows.find((row) => row.id === id);
    if (push && request) history.replaceState(null, '', `${location.pathname}${location.search}#request-${id}`);
    if (!request) {
      context.replaceChildren(el('div', { class: 'dinbox-placeholder' }, [icon('checkCircle', { size: 20 }), el('p', { text: 'Selecione um pedido para ver o contexto da decisão.' })]));
      return;
    }
    const rfq = rfqs.get(request.rfq_id);
    if (!split()) {
      // Celular e tablet: o mesmo contexto numa folha que ocupa a tela.
      const nodes = decisionContext(ctx, request, rfq, { onDone: () => { dialog.close(); onDone(); } });
      const actions = nodes.pop();
      const dialog = drawer({ title: rfq.title, subtitle: 'Contexto da decisão', body: nodes.slice(1), footer: [actions], className: 'quick-view decision-sheet',
        onClose: () => { if (location.hash.startsWith('#request-')) history.replaceState(null, '', location.pathname + location.search); } });
      dialog.dataset.entity = `approval:${request.id}`;
      return;
    }
    context.replaceChildren(...decisionContext(ctx, request, rfq, { onDone }));
    context.scrollTop = 0;
    announce(`Contexto da decisão: ${rfq.title}.`);
    if (focus) context.focus({ preventScroll: true });
  }
  drawSegments();
  drawList();
  root.append(segments, el('div', { class: 'dinbox-grid' }, [list, context]));
  queueMicrotask(() => {
    if (split()) select(selected || visible()[0]?.id || null);
    else if (selected) select(selected);
  });
  return root;
}

// Aprovações como caixa de decisão executiva:  CAIXA | CONTEXTO DA DECISÃO
//
// Governança responsável: a linha da caixa nunca aprova. Ela leva a
// "Revisar decisão", o contexto aparece ao lado (ou numa folha, no celular)
// e só ali estão as ações — Pedir alterações · Rejeitar · Aprovar — que são as
// do produto (mesma rota approvals/act, mesma confirmação, mesmo motivo
// obrigatório). Work OS: a decisão é otimista — sai da fila na hora e sobe em
// segundo plano (ou entra na fila offline); falha desfaz e explica.
//
// O contexto responde, nesta ordem:
//   1 Quanto?  2 Qual proposta?  3 Quais condições?  4 Por que esta proposta?
//   5 Quais diferenças materiais existem?  6 Quem pediu?  7 Em que etapa?  8 Decisão.
// As diferenças são fatos entre valores informados; nada ordena provedores.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { el, icon, money, fieldValue, formatDate, timeAgo, productLabel, demandHeadline, PROVIDER_KINDS } from '../../src/core.js';
import { drawer, linkButton, emptyState, button, confirmDialog, promptDialog, toast } from '../../src/ui.js';
import { approvalSteps, memberName, revisionTimeline } from '../../src/views/shared.js';
import { optimistic, registerExecutor } from './platform/sync.js';
import { emit } from './platform/bus.js';
import { mark, track } from './platform/telemetry.js';
import { approvalNext } from './next-action.js';
import { stateLabel } from './work-ui.js';
import { handoffButton } from './handoff.js';
import { announce } from './shell.js';
import { presenceLine, announcePresence, rfqPresence } from './collaboration/presence.js';
import { commentThread } from './collaboration/comments.js';
import { policyLine } from './workflows/policy-line.js';

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

// Envio real da decisão ao motor (mesma rota e regra do produto). Roda na hora
// ou, offline (simulado), quando a fila é enviada.
registerExecutor('approval.act', async (ctx, payload) => {
  const result = await ctx.api('approvals/act', { method: 'POST', body: JSON.stringify({ request_id: payload.request_id, action: payload.action, comment: payload.comment || '' }) });
  ctx.approvalsPromise = null;
  emit(`approval.${payload.action}`, { object: { type: 'approval', id: payload.request_id, title: payload.title, rfq_id: payload.rfq_id }, actor: payload.actor, detail: { comment: payload.comment || null, requested_by: payload.requested_by } });
  return result;
});
const VERB = { approved: 'Aprovar', changes_requested: 'Pedir alterações', rejected: 'Rejeitar' };

/** Botões de decisão: mesma confirmação e mesmo motivo obrigatório do produto; o envio é otimista. */
function decisionButtons(onDecide) {
  const ask = async (action) => {
    if (action === 'approved') {
      const ok = await confirmDialog({ title: 'Aprovar esta proposta?', description: 'Sua aprovação fica registrada com data e hora. Se houver próximo aprovador, ele será avisado.', confirmLabel: 'Aprovar' });
      if (ok) onDecide(action, '');
      return;
    }
    const comment = await promptDialog({ title: action === 'rejected' ? 'Rejeitar a proposta' : 'Pedir alterações', description: 'O motivo fica registrado na trilha da solicitação e é enviado a quem pediu a aprovação.',
      label: 'Motivo', minLength: 3, confirmLabel: action === 'rejected' ? 'Rejeitar' : 'Pedir alterações', tone: action === 'rejected' ? 'danger' : 'primary' });
    if (comment !== null) onDecide(action, comment);
  };
  return el('div', { class: 'approval-actions' }, [
    button('Pedir alterações', { iconName: 'edit', onClick: () => ask('changes_requested') }),
    button('Rejeitar', { variant: 'danger-ghost', iconName: 'x', onClick: () => ask('rejected') }),
    el('span', { class: 'dc-spacer', 'aria-hidden': 'true' }),
    button('Aprovar', { variant: 'primary', iconName: 'check', onClick: () => ask('approved') })
  ]);
}

function section(number, title, body, { id = null } = {}) {
  return el('section', { class: 'dc-section', id, 'aria-labelledby': `dc-${number}` }, [
    el('h3', { class: 'dc-q', id: `dc-${number}` }, [el('span', { class: 'dc-n num', 'aria-hidden': 'true', text: String(number) }), el('span', { text: title })]), body]);
}

/** Contexto completo de uma decisão (usado no painel ao lado e na folha do celular). */
export function decisionContext(ctx, request, rfq, { onDecide }) {
  const proposal = (rfq.proposals || []).find((item) => item.id === request.proposal_id);
  announcePresence({ object: `approval:${request.id}`, name: ctx.viewer?.name, activity: 'está revisando esta decisão' });
  const next = approvalNext(request, rfq, { viewerId: ctx.viewer?.id, members: ctx.members });
  const credit = rfq.product === 'credit';
  const amount = credit ? money(rfq.demand?.amount) : `${money(rfq.demand?.monthly_volume)}/mês`;
  const body = [
    el('header', { class: 'dc-head' }, [
      el('p', { class: 'dc-kicker' }, [stateLabel(next), el('span', { class: 'dc-kicker-sep', 'aria-hidden': 'true', text: '·' }), el('span', { text: `Etapa ${next.position || '—'} de ${next.total}` })]),
      el('h2', { class: 'dc-title', id: 'decision-title', text: rfq.title }),
      presenceLine(`approval:${request.id}`, rfqPresence(ctx, rfq, { timeAgo }), { viewerName: ctx.viewer?.name })
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
    section(7, 'Em que etapa está?', el('div', {}, [approvalSteps(request, ctx.members), policyLine(ctx, rfq)])),
    el('section', { class: 'dc-section dc-conversation', 'aria-labelledby': `dc-conv-${request.id}` }, [el('h3', { class: 'dc-q', id: `dc-conv-${request.id}`, text: 'Conversa interna' }),
      commentThread(ctx, { objectType: 'approval', objectId: request.id, title: rfq.title, href: `/finance/approvals.html#request-${request.id}`,
        people: (ctx.members || []).filter((member) => member.user_id !== ctx.viewer?.id).map((member) => ({ id: member.user_id, name: member.display_name, title: member.title })) })]),
    el('details', { class: 'dc-more' }, [el('summary', { text: `Mudanças na solicitação · revisão ${rfq.revision || 1}` }), revisionTimeline(ctx, rfq)]),
    el('p', { class: 'dc-links' }, [
      linkButton('Ver comparação completa', ctx.href(`/finance/rfq.html?id=${rfq.id}#comparacao`), { variant: 'ghost', size: 'sm', iconName: 'scale' }),
      linkButton('Abrir a solicitação', ctx.href(`/finance/rfq.html?id=${rfq.id}#aprovacoes`), { variant: 'ghost', size: 'sm', iconName: 'arrowRight' })
    ])
  ];
  let decision;
  if (next.mine && !request.stale) {
    // Ordem de leitura da decisão: pedir alterações, rejeitar e, por último, aprovar.
    const actions = decisionButtons((action, comment) => onDecide(request, action, comment));
    decision = section(8, 'Decisão', el('div', {}, [el('p', { class: 'dc-sub', text: 'Sua decisão fica registrada com data e hora na trilha da solicitação.' }), actions]), { id: 'decision-actions' });
  } else {
    const approved = request.status === 'approved' && !request.stale;
    decision = section(8, 'Decisão', el('div', { class: 'dc-waiting' }, [
      el('p', { class: 'muted' }, [icon(approved ? 'checkCircle' : 'clock', { size: 14 }), el('span', { text: ` ${next.action}. ${next.why}` })]),
      approved ? handoffButton(ctx, { userId: request.requested_by, path: `/finance/rfq.html?id=${rfq.id}#decisao`, label: `Voltar ao processo como ${memberName(ctx.members, request.requested_by).split(' ')[0]}`, note: 'Registrar a decisão aprovada' })
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
  const groups = {};
  const regroup = () => Object.assign(groups, {
    mine: rows.filter((request) => approvalNext(request, rfqs.get(request.rfq_id), { viewerId: viewer, members: ctx.members }).mine),
    requested: rows.filter((request) => request.requested_by === viewer && request.status === 'pending'),
    done: rows.filter((request) => request.status !== 'pending')
  });
  regroup();
  const wanted = location.hash.startsWith('#request-') ? rows.find((request) => `#request-${request.id}` === location.hash) : null;
  let filter = wanted ? (groups.mine.includes(wanted) ? 'mine' : groups.requested.includes(wanted) ? 'requested' : groups.done.includes(wanted) ? 'done' : 'all') : groups.mine.length ? 'mine' : groups.requested.length ? 'requested' : 'mine';
  let selected = wanted?.id || null;
  const split = () => matchMedia(SPLIT_QUERY).matches;

  const root = el('div', { class: 'dinbox' });
  const segments = el('div', { class: 'seg dinbox-filter', role: 'group', 'aria-label': 'Filtrar aprovações' });
  const list = el('ul', { class: 'dinbox-list', role: 'list', 'aria-label': 'Pedidos de aprovação' });
  const context = el('section', { class: 'dinbox-context', id: 'decision-context', 'aria-labelledby': 'decision-title', tabindex: '-1' });
  const options = () => [['mine', 'Aguardando você', groups.mine.length], ['requested', 'Solicitadas por você', groups.requested.length], ['done', 'Concluídas', groups.done.length], ['all', 'Todas', rows.length]];
  const visible = () => (filter === 'all' ? rows : groups[filter]);

  function drawSegments() {
    segments.replaceChildren(...options().map(([value, label, count]) => {
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
  // Decisão otimista: o item sai da fila na hora, o próximo assume o contexto e o
  // envio acontece em segundo plano (ou entra na fila, offline). Falha desfaz.
  let sheet = null;
  function onDecide(request, action, comment) {
    const rfq = rfqs.get(request.rfq_id);
    const snapshot = structuredClone({ status: request.status, steps: request.steps });
    const step = (request.steps || []).filter((item) => item.status === 'pending').sort((a, b) => a.position - b.position)[0];
    const started = performance.now();
    sheet?.close();
    optimistic({
      ctx, kind: 'approval.act', label: `${VERB[action]}: ${rfq.title}`,
      payload: { request_id: request.id, action, comment, title: rfq.title, rfq_id: rfq.id, requested_by: request.requested_by, actor: { id: viewer, name: ctx.viewer?.name } },
      apply: () => {
        if (step) Object.assign(step, { status: action, comment: comment || null, acted_at: new Date().toISOString() });
        const remaining = (request.steps || []).some((item) => item.status === 'pending');
        if (action !== 'approved' || !remaining) request.status = action;
        regroup();
        history.replaceState(null, '', location.pathname + location.search);
        drawSegments();
        drawList();
        const nextId = groups.mine[0]?.id || null;
        if (split()) select(nextId, { focus: Boolean(nextId) }); else selected = null;
        mark('optimistic', performance.now() - started, { action });
        track('approval_decided', { action });
        announce(`${VERB[action]}: registrado. ${groups.mine.length ? `${groups.mine.length} decisão${groups.mine.length === 1 ? '' : 'ões'} ainda aguarda${groups.mine.length === 1 ? '' : 'm'} você.` : 'Nenhuma decisão aguarda você.'}`);
      },
      rollback: () => {
        Object.assign(request, structuredClone(snapshot));
        regroup();
        drawSegments();
        drawList();
        select(request.id, { focus: true });
      }
    }).then((outcome) => {
      toast(outcome.queued ? `${VERB[action]} · salvo neste dispositivo. Sobe ao reconectar.` : `${VERB[action]} · sincronizado.`, 'info');
    }).catch((error) => {
      toast(`A decisão não pôde ser sincronizada: ${error.message} Nada foi registrado; o pedido voltou para a sua fila.`, 'error');
    });
  }
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
      const nodes = decisionContext(ctx, request, rfq, { onDecide });
      const actions = nodes.pop();
      const dialog = sheet = drawer({ title: rfq.title, subtitle: 'Contexto da decisão', body: nodes.slice(1), footer: [actions], className: 'quick-view decision-sheet',
        onClose: () => { if (location.hash.startsWith('#request-')) history.replaceState(null, '', location.pathname + location.search); } });
      dialog.dataset.entity = `approval:${request.id}`;
      return;
    }
    context.replaceChildren(...decisionContext(ctx, request, rfq, { onDecide }));
    emit('approval.opened', { object: { type: 'approval', id: request.id, title: rfq.title, rfq_id: rfq.id }, actor: { id: viewer, name: ctx.viewer?.name } });
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

// Demais telas da empresa: aprovações, propostas, contratos, provedores,
// tarefas, notificações e configurações.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { el, icon, money, percent, formatDate, formatDateTime, relativeDays, daysUntil, productLabel, demandHeadline, RFQ_STATUS, CONTRACT_STATUS, PROPOSAL_STATUS, PROVIDER_KINDS, ROLE_LABELS, timeAgo, fold, todayIso, renewalStage } from '../core.js';
import { card, pill, tag, button, linkButton, emptyState, errorState, loading, tabs, definitionList, toast, confirmDialog, drawer, field, person, avatar } from '../ui.js';
import { memberName, currentStep, approvalSummaryLine, comparisonMatrix, revisionTimeline, approvalActions, approvalSteps, coverage, lazyDocuments } from './shared.js';
import { NOTIFICATION_META, notificationItem } from '../shell.js';
import { CONTRACT_CATEGORIES } from '../../../lib/finance/contract-terms.mjs';
import { loadEntities, entitySettings, memberScopes, entityContextSelect, inContext, contractEntityControl, entityName } from './entities.js';

// Cada tela desta página baixa só o que usa: abrir Tarefas ou Notificações não
// carrega contratos, relacionamento, policy, integrações nem SSO (code
// splitting por capability; ver docs/FINANCIAL_BUNDLE_HEADROOM.md).
const LAZY = {
  policy: () => import('./policy.js'),
  contractCenter: () => import('./contract-center.js'),
  relationship: () => import('./provider-relationship.js'),
  integrations: () => import('./integrations.js'),
  sso: () => import('./sso.js'),
  passport: () => import('../../../lib/finance/passport.mjs')
};
const mods = {};
const need = (...keys) => Promise.all(keys.map(async (key) => { mods[key] ||= await LAZY[key](); }));

/* global __ARANDU_DEMO__ */
const DEMO_BUILD = typeof __ARANDU_DEMO__ !== 'undefined' && __ARANDU_DEMO__ === true;

// ------------------------------------------------------------ aprovações
export async function approvalsInbox(ctx) {
  ctx.header({ title: 'Aprovações', subtitle: 'Decisões que dependem de você e pedidos que você acompanha.' });
  const [approvals] = await Promise.all([ctx.loadApprovals(), need('policy')]);
  const rfqs = new Map((ctx.data.rfqs || []).map((rfq) => [rfq.id, rfq]));
  const viewer = ctx.viewer?.id;
  // Pedido com policy: o servidor diz se a pessoa tem etapa ativa (própria ou delegada).
  const isTurn = (row) => row.viewer_can_act ?? (currentStep(row)?.approver_id === viewer);
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
export async function proposalsList(ctx) {
  ctx.header({ title: 'Propostas recebidas', subtitle: 'Todas as respostas de provedores, com versão e revisão respondida.' });
  const rows = [];
  for (const rfq of ctx.data.rfqs || []) for (const proposal of rfq.proposals || []) rows.push({ rfq, proposal });
  if (!rows.length) return emptyState({ title: 'Nenhuma proposta recebida ainda', text: 'Convide provedores em uma solicitação aberta. As respostas aparecem aqui.', iconName: 'inbox', action: linkButton('Ver solicitações', ctx.href('/finance/rfqs.html'), { iconName: 'arrowRight' }) });
  rows.sort((a, b) => String(b.proposal.submitted_at).localeCompare(String(a.proposal.submitted_at)));
  const table = el('table', { class: 'data-table' });
  table.append(el('thead', {}, el('tr', {}, ['Provedor', 'Solicitação', 'Versão', 'Enviada', 'Validade', 'Cobertura'].map((label) => el('th', { scope: 'col', text: label })))));
  const body = el('tbody');
  for (const { rfq, proposal } of rows) {
    const outdated = proposal.rfq_revision && proposal.rfq_revision < (rfq.revision || 1);
    const cov = coverage(rfq.product, proposal.terms);
    const validDays = daysUntil(proposal.terms?.valid_until);
    body.append(el('tr', { class: 'row-link', dataset: { entity: 'proposal', id: proposal.id, rfq: rfq.id } }, [
      el('td', { 'data-label': 'Provedor', class: 'cell-primary' }, [el('a', { class: 'row-title stretched', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#propostas`), text: proposal.provider_name }), el('span', { class: 'row-sub', text: PROVIDER_KINDS[proposal.provider_kind] || 'Provedor' })]),
      el('td', { 'data-label': 'Solicitação' }, [el('span', { text: rfq.title }), el('span', { class: 'row-sub', text: RFQ_STATUS[rfq.status]?.label })]),
      el('td', { 'data-label': 'Versão' }, [el('span', { text: `v${proposal.version}` }), proposal.rfq_revision ? el('span', { class: `row-sub${outdated ? ' warn-text' : ''}`, text: `rev. ${proposal.rfq_revision}${outdated ? ` (atual ${rfq.revision})` : ''}` }) : null]),
      el('td', { 'data-label': 'Enviada', text: formatDate(proposal.submitted_at) }),
      el('td', { 'data-label': 'Validade', class: validDays !== null && validDays < 5 ? 'urgent' : '' }, proposal.terms?.valid_until ? el('span', { text: `${formatDate(proposal.terms.valid_until, { withYear: false })}${validDays !== null && validDays >= 0 ? ` · ${relativeDays(proposal.terms.valid_until)}` : validDays < 0 ? ' · vencida' : ''}` }) : el('span', { class: 'muted', text: 'não informada' })),
      el('td', { 'data-label': 'Cobertura' }, el('span', { class: 'coverage-inline' }, [el('span', { class: 'coverage-bar' }, el('span', { class: 'coverage-fill', style: `width:${Math.round(cov.ratio * 100)}%` })), el('span', { class: 'small', text: `${cov.filled}/${cov.total}` })]))
    ]));
  }
  table.append(body);
  return el('div', { class: 'table-card' }, table);
}

// --------------------------------------------------------------- contratos
function lifecycleBar(contract) {
  const start = Date.parse(`${contract.starts_on}T00:00:00Z`);
  const end = Date.parse(`${contract.ends_on}T00:00:00Z`);
  const today = Date.parse(`${todayIso()}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return el('p', { class: 'muted small', text: 'Datas de vigência incompletas.' });
  const pos = (time) => `${Math.max(0, Math.min(100, ((time - start) / (end - start)) * 100)).toFixed(2)}%`;
  const notice = end - Number(contract.renewal_notice_days || 0) * 86400000;
  const opens = Date.parse(`${renewalStage(contract).opensAt}T00:00:00Z`);
  const marks = [['90 dias', end - 90 * 86400000], ['60 dias', end - 60 * 86400000], ['30 dias', end - 30 * 86400000]].filter(([, time]) => time > start);
  const bar = el('div', { class: 'life-track' }, [
    el('span', { class: 'life-elapsed', style: `width:${pos(today)}` }),
    el('span', { class: 'life-window', style: `left:${pos(opens)};width:calc(${pos(notice)} - ${pos(opens)})`, title: 'Janela de decisão (até o aviso prévio)' }),
    el('span', { class: 'life-after', style: `left:${pos(notice)};width:calc(100% - ${pos(notice)})`, title: 'Depois do prazo de aviso prévio' }),
    ...marks.map(([label, time]) => el('span', { class: `life-mark${today >= time ? ' reached' : ''}`, style: `left:${pos(time)}`, title: `${label} antes do vencimento` })),
    el('span', { class: 'life-notice', style: `left:${pos(notice)}`, title: 'Data limite do aviso prévio' }),
    today >= start && today <= end ? el('span', { class: 'life-today', style: `left:${pos(today)}` }, el('span', { class: 'life-today-label', text: 'Hoje' })) : null
  ]);
  const legend = el('ol', { class: 'life-legend' }, [
    ['Início', contract.starts_on, today >= start], ['90 dias', new Date(end - 90 * 86400000).toISOString().slice(0, 10), today >= end - 90 * 86400000],
    ['60 dias', new Date(end - 60 * 86400000).toISOString().slice(0, 10), today >= end - 60 * 86400000], ['30 dias', new Date(end - 30 * 86400000).toISOString().slice(0, 10), today >= end - 30 * 86400000],
    ['Aviso prévio', new Date(notice).toISOString().slice(0, 10), today >= notice], ['Vencimento', contract.ends_on, today >= end]
  ].filter(([, date]) => date >= contract.starts_on).sort((a, b) => a[1].localeCompare(b[1]) || (a[0] === 'Aviso prévio' ? -1 : 1)).map(([label, date, reached]) => el('li', { class: `life-point${reached ? ' reached' : ''}` }, [el('span', { class: 'life-point-label', text: label }), el('span', { class: 'life-point-date', text: formatDate(date, { withYear: false }) }), reached ? el('span', { class: 'sr-only', text: '(alcançado)' }) : null])));
  return el('div', { class: 'lifecycle-bar', role: 'img', 'aria-label': `Vigência de ${formatDate(contract.starts_on)} a ${formatDate(contract.ends_on)}; aviso prévio em ${formatDate(new Date(notice).toISOString().slice(0, 10))}` }, [bar, legend]);
}

function contractNextAction(contract) {
  if (!['active', 'renewing'].includes(contract.status)) return { tone: 'neutral', icon: 'clock', text: 'Contrato encerrado. Mantido para histórico.' };
  const stage = renewalStage(contract);
  if (contract.status === 'renewing' && stage.stage !== 'past_notice') return { tone: 'info', icon: 'repeat', text: `Nova concorrência em andamento. Compare as propostas antes do aviso prévio (${formatDate(stage.deadline)}).` };
  if (stage.stage === 'window') return { tone: 'warning', icon: 'alert', text: `Janela de renovação aberta. Decida até ${formatDate(stage.deadline)} (${relativeDays(stage.deadline)}, prazo do aviso prévio) se renova, renegocia ou troca.`, cta: true };
  if (stage.stage === 'past_notice') return { tone: 'danger', icon: 'alert', text: `O prazo do aviso prévio passou em ${formatDate(stage.deadline)}. Negocie com o provedor ou prepare a substituição antes do vencimento (${formatDate(contract.ends_on)}).`, cta: true };
  if (stage.stage === 'expired') return { tone: 'neutral', icon: 'clock', text: 'Vigência encerrada. Atualize o status do contrato.' };
  return { tone: 'success', icon: 'checkCircle', text: `Nada a fazer agora. A janela de decisão abre ${relativeDays(stage.opensAt)} (${formatDate(stage.opensAt)}).` };
}

export async function contracts(ctx) {
  const [entities] = await Promise.all([loadEntities(ctx), need('contractCenter')]);
  const rows = (ctx.data.contracts || []).filter((row) => inContext(entities, row));
  const manage = ctx.can('create_rfq');
  const refresh = manage ? button('Atualizar marcos de renovação', { size: 'sm', iconName: 'refresh', onClick: async (event) => {
    const target = event.currentTarget;
    target.disabled = true;
    try {
      const result = await ctx.api('renewals', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id }) });
      toast(result.tasks_created ? `${result.tasks_created} tarefa(s) de renovação criada(s).` : 'Marcos em dia. Nenhuma tarefa nova.');
      if (result.tasks_created) ctx.reload();
    } catch (error) { toast(error.message, 'error'); } finally { target.disabled = false; }
  } }) : null;
  const context = entityContextSelect(entities, { onChange: () => ctx.rerender() });
  const importButton = mods.contractCenter.importContractButton(ctx, entities);
  ctx.header({ title: 'Contratos e renovações', subtitle: 'Termos versionados, aditivos, marcos próprios, aviso prévio e próxima ação de cada contrato.', actions: [context, importButton, refresh].filter(Boolean) });
  if (!rows.length && (ctx.data.contracts || []).length) return emptyState({ title: 'Nenhum contrato nesta entidade', text: 'Troque a entidade em foco para ver os demais contratos que você pode ler.', iconName: 'building' });
  if (!rows.length) return emptyState({ title: 'Nenhum contrato registrado ainda', text: 'Depois de uma decisão, registre o contrato com vigência e aviso prévio. O Arandu acompanha a renovação.', iconName: 'briefcase' });
  const ordered = [...rows].sort((a, b) => (['active', 'renewing'].includes(b.status) - ['active', 'renewing'].includes(a.status)) || String(a.review_from).localeCompare(String(b.review_from)));
  // Contratos que pedem ação primeiro.
  const root = el('div', { class: 'stack' });
  for (const contract of ordered) {
    const next = contractNextAction(contract);
    const restart = manage && contract.status === 'active' ? button('Iniciar nova concorrência', { variant: next.cta ? 'primary' : 'secondary', size: 'sm', iconName: 'repeat', onClick: async (event) => {
      const target = event.currentTarget;
      if (!await confirmDialog({ title: 'Iniciar nova concorrência?', description: `Criamos um rascunho com a demanda do contrato atual com ${contract.provider_name}. Convites, propostas e decisões anteriores não são copiados. O contrato passa para “Em renovação”.`, confirmLabel: 'Criar rascunho' })) return;
      target.disabled = true;
      try {
        const result = await ctx.api('contract-renewal-rfq', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, contract_id: contract.id }) });
        toast('Nova concorrência criada como rascunho.');
        location.assign(ctx.href(`/finance/rfq.html?id=${encodeURIComponent(result.id)}`));
      } catch (error) { toast(error.message, 'error'); target.disabled = false; }
    } }) : null;
    const source = (ctx.data.rfqs || []).find((rfq) => rfq.id === contract.rfq_id);
    root.append(el('article', { class: `contract-card${location.hash === `#contract-${contract.id}` ? ' highlighted' : ''}`, id: `contract-${contract.id}`, tabindex: '-1', dataset: { entity: 'contract', id: contract.id } }, [
      el('header', { class: 'contract-head' }, [
        el('div', {}, [
          el('p', { class: 'contract-kicker', text: `${CONTRACT_CATEGORIES[contract.product] || productLabel(contract.product)}${source ? ` · ${source.title}` : contract.title ? ` · ${contract.title}` : ''}` }),
          el('h2', { class: 'contract-title', text: contract.provider_name || 'Provedor' }),
          entities.rows.length ? el('p', { class: 'contract-entity', 'aria-label': `Entidade: ${entityName(entities, contract.legal_entity_id)}` }, contractEntityControl(ctx, entities, contract)) : null
        ]),
        el('div', { class: 'contract-status' }, [pill(CONTRACT_STATUS[contract.status]), contract.days_to_end !== null && contract.days_to_end !== undefined && ['active', 'renewing'].includes(contract.status)
          ? el('span', { class: `contract-days${contract.days_to_end <= 60 ? ' warn' : ''}`, text: contract.days_to_end >= 0 ? `vence em ${contract.days_to_end} dias` : 'vencido' }) : null])
      ]),
      ['active', 'renewing'].includes(contract.status) ? lifecycleBar(contract) : null,
      el('div', { class: `next-action-box tone-${next.tone}` }, [icon(next.icon, { size: 16 }), el('span', { class: 'next-action-label', text: 'Próxima ação' }), el('span', { class: 'next-action-text', text: next.text }), restart]),
      el('dl', { class: 'deflist deflist-3' }, [
        ['Vigência', `${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}`], ['Prazo do aviso prévio', `${contract.renewal_notice_days} dias antes do fim · ${formatDate(contract.review_from)}`],
        ['Custo registrado', contract.cost_summary || 'Não informado'], contract.main_conditions ? ['Condições', contract.main_conditions] : null,
        contract.document_reference ? ['Documento', contract.document_reference] : null
      ].filter(Boolean).map(([label, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: label }), el('dd', { class: value === 'Não informado' ? 'missing' : '', text: value })]))),
      el('div', { class: 'contract-open' }, [button('Abrir contrato: termos, aditivos e marcos', { size: 'sm', iconName: 'file', onClick: () => mods.contractCenter.openContract(ctx, contract) }),
        contract.origin === 'imported' ? tag('Carteira existente') : null, contract.current_version ? tag(`Termos v${contract.current_version}`, 'accent') : tag('Termos não estruturados', 'warning')]),
      lazyDocuments(ctx, 'contract', contract.id, 'Documentos do contrato', { canUpload: ctx.can('upload_document') }),
      source ? el('a', { class: 'contract-link', href: ctx.href(`/finance/rfq.html?id=${source.id}#decisao`) }, [el('span', { text: 'Ver processo e decisão de origem' }), icon('arrowRight', { size: 14 })]) : null
    ]));
  }
  if (location.hash.startsWith('#contract-')) queueMicrotask(() => { const target = document.querySelector(location.hash); target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true }); });
  return root;
}

// -------------------------------------------------------------- provedores
export async function providers(ctx) {
  const rows = ctx.data.providers || [];
  // Memória de relacionamento (contatos, issues, avaliações da empresa, mapa).
  const relationshipEnabled = (await loadEntities(ctx)).available;
  if (relationshipEnabled) await need('relationship');
  const manage = ctx.can('create_rfq');
  const add = manage ? button('Cadastrar provedor', { variant: 'primary', iconName: 'plus', onClick: () => providerDrawer(ctx) }) : null;
  ctx.header({ title: 'Provedores', subtitle: 'Bancos, fintechs e adquirentes com quem a empresa cota. É um cadastro da empresa, não uma atestação.', actions: add ? [add] : [] });
  if (!rows.length) return emptyState({ title: 'Nenhum provedor cadastrado', text: 'Cadastre ao menos três instituições para ter o que comparar.', iconName: 'building', action: add ? button('Cadastrar o primeiro provedor', { variant: 'primary', iconName: 'plus', onClick: () => providerDrawer(ctx) }) : null });
  const participation = new Map();
  for (const rfq of ctx.data.rfqs || []) for (const invite of rfq.invites || []) participation.set(invite.provider_id, (participation.get(invite.provider_id) || 0) + 1);
  const search = el('input', { type: 'search', class: 'input', placeholder: 'Buscar por nome, tipo ou região', 'aria-label': 'Buscar provedor' });
  const count = el('span', { class: 'result-count', role: 'status', 'aria-live': 'polite' });
  const table = el('table', { class: 'data-table' });
  table.append(el('thead', {}, el('tr', {}, ['Provedor', 'Tipo', 'Região', 'Participações', 'Verificação'].map((label) => el('th', { scope: 'col', text: label })))));
  const body = el('tbody');
  table.append(body);
  const draw = () => {
    const term = fold(search.value);
    body.replaceChildren();
    const visible = rows.filter((row) => fold(`${row.name} ${row.region} ${PROVIDER_KINDS[row.kind]}`).includes(term));
    for (const provider of visible) {
      body.append(el('tr', { id: `provider-${provider.id}`, dataset: { entity: 'provider', id: provider.id } }, [
        el('td', { 'data-label': 'Provedor', class: 'cell-primary' }, [person(provider.name, provider.website || null),
          relationshipEnabled ? button('Relacionamento', { size: 'sm', variant: 'ghost', iconName: 'users', attrs: { 'aria-label': `Relacionamento com ${provider.name}` }, onClick: () => mods.relationship.openProviderRelationship(ctx, provider) }) : null]),
        el('td', { 'data-label': 'Tipo', text: PROVIDER_KINDS[provider.kind] || provider.kind }),
        el('td', { 'data-label': 'Região', text: provider.region || '—' }),
        el('td', { 'data-label': 'Participações', text: `${participation.get(provider.id) || 0} solicitação(ões)` }),
        el('td', { 'data-label': 'Verificação' }, provider.verification_state === 'EVIDENCIA_REGISTRADA'
          ? tag(`Evidência registrada em ${formatDate(provider.regulator_checked_at)}`, 'success')
          : el('span', { class: 'muted small', title: 'O cadastro é uma referência da empresa, não uma atestação de regularidade.', text: 'Sem verificação registrada' }))
      ]));
    }
    count.textContent = `${visible.length} de ${rows.length}`;
  };
  search.addEventListener('input', draw);
  draw();
  return el('div', { class: 'list-page' }, [el('div', { class: 'toolbar' }, [el('div', { class: 'toolbar-search' }, [icon('search'), search]), count]), el('div', { class: 'table-card' }, table)]);
}

function providerDrawer(ctx) {
  const form = el('form', { class: 'stack', id: 'provider-form', novalidate: true });
  const name = el('input', { name: 'name', maxlength: '200' });
  const kind = el('select', { name: 'kind' });
  for (const [value, label] of Object.entries(PROVIDER_KINDS)) kind.add(new Option(label, value));
  const region = el('input', { name: 'region', maxlength: '120' });
  const website = el('input', { name: 'website', type: 'url', placeholder: 'https://' });
  const notes = el('textarea', { name: 'notes', rows: '3', maxlength: '1000' });
  const nameField = field({ label: 'Nome', control: name, required: true });
  form.append(nameField, field({ label: 'Tipo', control: kind }), field({ label: 'Região de atuação', control: region, optionalLabel: true }),
    field({ label: 'Site', control: website, optionalLabel: true, hint: 'Somente https.' }), field({ label: 'Notas internas', control: notes, optionalLabel: true, hint: 'Visíveis apenas para a sua empresa.' }),
    el('p', { class: 'callout callout-info compact' }, [icon('shield', { size: 14 }), el('span', { text: 'O Arandu não afirma que um provedor é regulado sem autoridade, registro, evidência e data de consulta.' })]));
  const save = button('Cadastrar provedor', { variant: 'primary', type: 'submit', iconName: 'check', attrs: { form: 'provider-form' } });
  const dialog = drawer({ title: 'Cadastrar provedor', body: form, footer: [button('Cancelar', { variant: 'ghost', onClick: () => dialog.close() }), save] });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (name.value.trim().length < 2) { nameField.setError('Informe o nome do provedor.'); name.focus(); return; }
    if (website.value && !/^https:\/\//.test(website.value)) { website.closest('.field').setError('Use um endereço https.'); return; }
    save.disabled = true;
    try {
      await ctx.api('providers', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, ...Object.fromEntries(new FormData(form)) }) });
      dialog.close();
      toast('Provedor cadastrado.');
      ctx.reload();
    } catch (error) { toast(error.message, 'error'); save.disabled = false; }
  });
  name.focus();
}

// ----------------------------------------------------------------- tarefas
export async function tasks(ctx) {
  ctx.header({ title: 'Tarefas', subtitle: 'Pendências da equipe: renovações, conferências e combinados dos processos.' });
  const root = el('div', { class: 'stack' });
  const box = el('div', {}, loading());
  const form = el('form', { class: 'inline-form task-new', novalidate: true });
  const title = el('input', { name: 'title', maxlength: '200', placeholder: 'Nova tarefa…' });
  const due = el('input', { name: 'due_on', type: 'date', min: todayIso() });
  form.append(field({ label: 'Nova tarefa', control: title }), field({ label: 'Prazo', control: due, optionalLabel: true }), button('Adicionar', { variant: 'primary', type: 'submit', iconName: 'plus' }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (title.value.trim().length < 2) { title.closest('.field').setError('Descreva a tarefa.'); title.focus(); return; }
    try {
      await ctx.api('tasks', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, title: title.value, due_on: due.value || null }) });
      title.value = ''; due.value = '';
      toast('Tarefa criada.');
      draw();
    } catch (error) { toast(error.message, 'error'); }
  });
  let showDone = false;
  const toggle = button('Mostrar concluídas', { variant: 'ghost', size: 'sm', onClick: () => { showDone = !showDone; toggle.querySelector('.btn-label').textContent = showDone ? 'Ocultar concluídas' : 'Mostrar concluídas'; draw(); } });
  async function draw() {
    try {
      const { rows } = await ctx.api(`tasks?organization_id=${encodeURIComponent(ctx.organization.id)}`);
      const visible = (rows || []).filter((row) => showDone || row.status === 'open');
      const list = el('ul', { class: 'task-list', role: 'list' });
      const rfqs = new Map((ctx.data.rfqs || []).map((rfq) => [rfq.id, rfq]));
      for (const task of visible) {
        const days = daysUntil(task.due_on);
        const check = el('input', { type: 'checkbox', checked: task.status === 'done', 'aria-label': `${task.status === 'done' ? 'Reabrir' : 'Concluir'}: ${task.title}` });
        check.addEventListener('change', async () => {
          check.disabled = true;
          try {
            await ctx.api('tasks', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, task_id: task.id, status: check.checked ? 'done' : 'open' }) });
            toast(check.checked ? 'Tarefa concluída.' : 'Tarefa reaberta.');
            draw();
          } catch (error) { toast(error.message, 'error'); check.checked = !check.checked; check.disabled = false; }
        });
        const related = task.related_type === 'rfq' && rfqs.get(task.related_id) ? el('a', { href: ctx.href(`/finance/rfq.html?id=${task.related_id}`), text: rfqs.get(task.related_id).title })
          : task.related_type === 'contract' ? el('a', { href: ctx.href(`/finance/contracts.html#contract-${task.related_id}`), text: 'Ver contrato' }) : null;
        list.append(el('li', { class: `task-item${task.status === 'done' ? ' done' : ''}${location.hash === `#task-${task.id}` ? ' highlighted' : ''}`, id: `task-${task.id}` }, [
          check, el('div', { class: 'task-main' }, [el('span', { class: 'task-title', text: task.title }), el('span', { class: 'task-meta' }, [task.assignee_name ? `${task.assignee_name}` : null, related ? ' · ' : null, related].filter(Boolean))]),
          task.due_on ? el('span', { class: `task-due${task.status === 'open' && days < 0 ? ' overdue' : task.status === 'open' && days <= 2 ? ' soon' : ''}` }, [icon('calendar', { size: 12 }), el('span', { text: `${formatDate(task.due_on, { withYear: false })}${task.status === 'open' ? ` · ${relativeDays(task.due_on)}` : ''}` })]) : null
        ]));
      }
      box.replaceChildren(visible.length ? list : emptyState({ title: showDone ? 'Nenhuma tarefa' : 'Nenhuma tarefa aberta', text: 'Tarefas de renovação são criadas automaticamente a partir dos contratos.', iconName: 'checkCircle', compact: true }));
      if (location.hash.startsWith('#task-')) document.querySelector(location.hash)?.scrollIntoView({ block: 'center' });
    } catch (error) { box.replaceChildren(errorState({ error, onRetry: draw })); }
  }
  draw();
  root.append(card({ body: form }), el('div', { class: 'row-actions end' }, toggle), card({ flush: true, body: box }));
  return root;
}

// ----------------------------------------------------------- notificações
export async function notifications(ctx) {
  ctx.header({ title: 'Notificações', subtitle: 'Aprovações, propostas, menções, prazos e renovações — o que é prioritário vem primeiro.',
    actions: [linkButton('Preferências', ctx.href('/finance/settings.html#notificacoes'), { iconName: 'settings' })] });
  const box = el('div', { class: 'card card-flush' }, loading());
  const markAll = button('Marcar todas como lidas', { size: 'sm', iconName: 'check' });
  const filter = el('select', { class: 'input', 'aria-label': 'Filtrar por tipo' });
  filter.add(new Option('Todos os tipos', ''));
  for (const [value, label] of [['approval', 'Aprovações'], ['proposal', 'Propostas'], ['mention', 'Menções e comentários'], ['renewal_due', 'Renovações'], ['deadline', 'Prazos']]) filter.add(new Option(label, value));
  let rows = [];
  const draw = () => {
    const visible = rows.filter((row) => !filter.value || row.event_type.startsWith(filter.value) || (filter.value === 'mention' && row.event_type === 'comment'));
    const groups = new Map();
    for (const row of visible) {
      const key = daysUntil(row.created_at) === 0 ? 'Hoje' : daysUntil(row.created_at) === -1 ? 'Ontem' : daysUntil(row.created_at) >= -7 ? 'Nesta semana' : 'Anteriores';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    box.replaceChildren();
    for (const [label, items] of groups) box.append(el('section', { class: 'notice-group' }, [el('h2', { class: 'notice-group-title', text: label }), el('div', { class: 'notification-list' }, items.map((row) => notificationItem(ctx, row)))]));
    if (!visible.length) box.append(emptyState({ title: 'Nenhuma notificação', text: 'Você será avisado sobre aprovações, propostas, menções, prazos e renovações.', iconName: 'bell' }));
    markAll.disabled = !rows.some((row) => !row.read_at);
  };
  const load = async () => {
    try { rows = (await ctx.api(`notifications?organization_id=${encodeURIComponent(ctx.organization.id)}`)).rows || []; draw(); }
    catch (error) { box.replaceChildren(errorState({ error, onRetry: load })); }
  };
  filter.addEventListener('change', draw);
  markAll.addEventListener('click', async () => {
    try { await ctx.api('notifications', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id }) }); toast('Todas marcadas como lidas.'); await load(); ctx.refreshBell?.(); }
    catch (error) { toast(error.message, 'error'); }
  });
  load();
  return el('div', { class: 'stack' }, [el('div', { class: 'toolbar' }, [filter, el('span', { class: 'spacer' }), markAll]), box]);
}

// ---------------------------------------------------------- configurações
const REVENUE_BANDS = [['ate_360k', 'Até R$ 360 mil'], ['360k_4_8m', 'R$ 360 mil a R$ 4,8 milhões'], ['4_8m_30m', 'R$ 4,8 a R$ 30 milhões'], ['30m_300m', 'R$ 30 a R$ 300 milhões'], ['acima_300m', 'Acima de R$ 300 milhões']];
const PREFERENCE_TYPES = [['approval_requested', 'Aprovação solicitada a mim'], ['approval_approved', 'Aprovação concluída'], ['approval_rejected', 'Aprovação rejeitada'],
  ['approval_changes_requested', 'Alterações pedidas'], ['proposal_received', 'Nova proposta recebida'], ['proposal_revised', 'Proposta revisada'], ['mention', 'Menções'],
  ['comment', 'Comentários de provedores'], ['renewal_due', 'Renovação de contrato'], ['task_assigned', 'Tarefa atribuída'],
  ['policy_exception_requested', 'Exceção de policy para decidir'], ['policy_exception_decided', 'Exceção de policy decidida']];

export async function settings(ctx) {
  ctx.header({ title: 'Configurações', subtitle: 'Empresa, perfil financeiro, política de aprovação, notificações e equipe.' });
  // Seções avançadas (policy, integrações, SSO) só existem para quem as vê.
  const advanced = ctx.mode !== 'demo';
  const admin = ctx.viewer?.role === 'admin';
  await need('passport', 'relationship', ...(advanced ? ['policy'] : []), ...(advanced && admin ? ['integrations', 'sso'] : []));
  const organization = ctx.data.organization || ctx.organization;
  const sections = [];
  const nav = el('nav', { class: 'settings-nav', 'aria-label': 'Seções de configuração' });
  const add = (id, title, subtitle, body) => {
    nav.append(el('a', { href: `#${id}`, text: title }));
    sections.push(card({ id, title, subtitle, body }));
  };

  // Empresa.
  const orgForm = el('form', { class: 'field-grid', id: 'organization-form', novalidate: true });
  const trade = el('input', { name: 'trade_name', value: organization.trade_name || '' });
  const cnpj = el('input', { name: 'tax_identifier', inputmode: 'numeric', value: organization.tax_identifier ? String(organization.tax_identifier).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '', placeholder: '00.000.000/0000-00' });
  const sector = el('input', { name: 'sector', value: organization.sector || '' });
  const band = el('select', { name: 'revenue_band' });
  band.add(new Option('Selecione…', ''));
  for (const [value, label] of REVENUE_BANDS) band.add(new Option(label, value));
  band.value = organization.revenue_band || '';
  const canEdit = ctx.can('create_rfq');
  orgForm.append(field({ label: 'Nome fantasia', control: trade }), field({ label: 'CNPJ', control: cnpj, hint: ctx.mode === 'demo' ? 'CNPJ fictício da demonstração.' : 'Conferimos formato e dígitos; não consultamos base oficial.' }),
    field({ label: 'Setor', control: sector }), field({ label: 'Faixa de faturamento', control: band }),
    canEdit ? el('div', { class: 'form-actions span-2' }, button('Salvar dados da empresa', { variant: 'primary', type: 'submit' })) : null);
  if (!canEdit) for (const control of orgForm.querySelectorAll('input,select')) control.disabled = true;
  orgForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(orgForm));
    for (const [key, value] of Object.entries(body)) if (value === '') delete body[key];
    try { await ctx.api('organizations', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, ...body }) }); toast('Dados da empresa atualizados.'); }
    catch (error) { toast(error.message, 'error'); }
  });
  add('empresa', 'Empresa', organization.legal_name, orgForm);

  // Identidade de quem usa: aparece em aprovações, comentários, tarefas e responsáveis.
  const me = (ctx.members || []).find((member) => member.user_id === ctx.viewer?.id);
  if (me) {
    const nameInput = el('input', { name: 'display_name', maxlength: '120', value: me.display_name || '', autocomplete: 'name', required: true });
    const titleInput = el('input', { name: 'title', maxlength: '80', value: me.title || '', autocomplete: 'organization-title', placeholder: 'Ex.: Gerente Financeira' });
    const meForm = el('form', { class: 'inline-form', novalidate: true, id: 'member-profile-form' }, [
      field({ label: 'Seu nome', control: nameInput, required: true }), field({ label: 'Cargo', control: titleInput, optionalLabel: true }),
      button('Salvar', { type: 'submit', iconName: 'check' })]);
    meForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (nameInput.value.trim().length < 2) { toast('Informe seu nome, com pelo menos 2 caracteres.', 'error'); nameInput.focus(); return; }
      try { await ctx.api('members/me', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, display_name: nameInput.value.trim(), title: titleInput.value.trim() }) }); toast('Nome e cargo atualizados.'); ctx.reload(); }
      catch (error) { toast(error.message, 'error'); }
    });
    add('voce', 'Seu nome e cargo', 'Como a equipe vê você em aprovações, comentários e tarefas. O e-mail nunca aparece nessas telas.', meForm);
  }

  // Perfil financeiro reaproveitável: mora no Financial Passport, com
  // proveniência, frescor e histórico por campo. Aqui fica só o resumo.
  const profile = ctx.data.profile || [];
  const passportSummary = mods.passport.buildPassport({ organization: ctx.organization, rows: profile });
  add('perfil', 'Perfil financeiro', 'Informado uma vez, reaproveitado em cada solicitação, com origem, responsável e revisão de cada dado.', [
    el('p', { class: 'muted', text: `${passportSummary.coverage.filled} de ${passportSummary.coverage.relevant} campos do catálogo preenchidos${passportSummary.attention.length ? ` · ${passportSummary.attention.length} pedem revisão` : ''}.` }),
    linkButton('Abrir o Financial Passport', ctx.href('/finance/passport.html'), { variant: 'secondary', iconName: 'shield' })
  ]);

  // Entidades do grupo e escopo de acesso por entidade (multi-entity).
  const entities = await loadEntities(ctx);
  if (entities.available) {
    add('entidades', 'Entidades do grupo', 'Entidades legais e unidades. Processos e contratos de uma entidade só aparecem para quem tem o grupo inteiro ou aquela entidade no escopo.', entitySettings(ctx, entities));
    add('escopos', 'Escopo de acesso por entidade', 'Tesouraria do grupo enxerga tudo; escopo restrito enxerga só as entidades concedidas. O banco aplica a regra em toda leitura e escrita.', memberScopes(ctx, entities));
  }

  if (entities.available) {
    add('scorecards', 'Scorecards de provedores', 'Critérios e pesos definidos pela sua empresa para avaliar provedores. Versionados; o Arandu não fornece nota própria.', mods.relationship.scorecardSettings(ctx));
  }

  // Política de aprovação.
  const policyBox = el('div', {}, loading());
  ctx.api(`approval-policy?organization_id=${encodeURIComponent(ctx.organization.id)}`).then((policy) => {
    const toggle = el('input', { type: 'checkbox', role: 'switch', checked: Boolean(policy.required_for_decision), disabled: ctx.viewer?.role !== 'admin' && ctx.viewer?.role });
    toggle.addEventListener('change', async () => {
      toggle.disabled = true;
      try {
        await ctx.api('approval-policy', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, required_for_decision: toggle.checked }) });
        toast(toggle.checked ? 'Aprovação agora é obrigatória antes de decidir.' : 'Aprovação passou a ser opcional.');
      } catch (error) { toggle.checked = !toggle.checked; toast(error.message, 'error'); } finally { toggle.disabled = false; }
    });
    policyBox.replaceChildren(el('label', { class: 'switch-row' }, [toggle, el('span', {}, [el('strong', { text: 'Exigir aprovação antes de registrar qualquer decisão' }),
      el('span', { class: 'muted small', text: policy.updated_at ? ` Atualizada em ${formatDateTime(policy.updated_at)}.` : ' Nenhuma exigência configurada.' })])]),
    ctx.viewer?.role && ctx.viewer.role !== 'admin' ? el('p', { class: 'muted small', text: `Somente administradores alteram esta regra.${ctx.mode === 'demo' ? ' Troque para a persona Admin para experimentar.' : ''}` }) : el('p', { class: 'muted small', text: 'Mudanças ficam registradas na trilha da organização.' }));
  }).catch((error) => policyBox.replaceChildren(errorState({ error })));
  add('aprovacao', 'Regra geral de aprovação', 'Quando ligada, nenhuma decisão é registrada sem um pedido aprovado para a mesma proposta e versão. Policies abaixo detalham quem aprova e em que ordem.', policyBox);

  // Governança: Policy & Approval Engine v2 e delegação temporária. O
  // transporte da demonstração não tem o engine; lá vale só a regra geral.
  if (ctx.mode !== 'demo') {
    add('governanca', 'Governança: policies de aprovação', 'Regras da sua empresa, por grupo e por entidade: quem aprova, em que ordem, sob qual versão. Versões ativadas são imutáveis.', mods.policy.policySettings(ctx, entities));
    add('delegacao', 'Delegação de aprovação', 'Substituto temporário para as suas etapas de aprovação, com trilha.', mods.policy.delegationSettings(ctx));
    // Public API v1 & Webhooks: administração da organização.
    if (ctx.viewer?.role === 'admin') {
      add('integracoes', 'Integrações: API e webhooks', 'Contas de serviço com escopo e entidades, tokens que expiram e webhooks assinados. Para ERP, TMS e plataformas de dados.', mods.integrations.integrationSettings(ctx, entities));
      add('sso', 'Segurança: SSO corporativo', 'Login pelo provedor de identidade da empresa (SAML/OIDC), com domínio verificado, exigência opcional de SSO e revogação de sessões.', mods.sso.ssoSettings(ctx));
      // Carregado sob demanda: só administradores abrem esta seção. O build de
      // demonstração não tem API (tudo responde 404) e não empacota o módulo.
      if (!DEMO_BUILD) {
        const governanceBox = el('div', {}, loading());
        import('./governance.js').then(({ governanceSettings }) => governanceBox.replaceChildren(governanceSettings(ctx)))
          .catch((error) => governanceBox.replaceChildren(errorState({ error })));
        add('dados', 'Governança de dados', 'Classificação, retenção, legal hold, export portável e offboarding da organização.', governanceBox);
      }
    }
  }

  // Preferências de notificação.
  const prefBox = el('div', {}, loading());
  ctx.api(`notification-preferences?organization_id=${encodeURIComponent(ctx.organization.id)}`).then(({ rows }) => {
    const saved = new Map((rows || []).map((row) => [row.event_type, row]));
    const grid = el('table', { class: 'pref-table' });
    grid.append(el('thead', {}, el('tr', {}, [el('th', { scope: 'col', text: 'Aviso' }), el('th', { scope: 'col', text: 'No aplicativo' }), el('th', { scope: 'col', text: 'Por e-mail' })])));
    const body = el('tbody');
    for (const [type, label] of PREFERENCE_TYPES) {
      const current = saved.get(type) || { in_app: true, email: false };
      const inApp = el('input', { type: 'checkbox', checked: current.in_app !== false, 'aria-label': `${label} no aplicativo` });
      const email = el('input', { type: 'checkbox', checked: Boolean(current.email), 'aria-label': `${label} por e-mail` });
      const persist = async (control) => {
        control.disabled = true;
        try {
          await ctx.api('notification-preferences', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, event_type: type, in_app: inApp.checked, email: email.checked }) });
          toast(`${label}: preferência salva.`);
        } catch (error) { control.checked = !control.checked; toast(error.message, 'error'); } finally { control.disabled = false; }
      };
      inApp.addEventListener('change', () => persist(inApp));
      email.addEventListener('change', () => persist(email));
      body.append(el('tr', {}, [el('th', { scope: 'row', text: label }), el('td', {}, inApp), el('td', {}, email)]));
    }
    grid.append(body);
    prefBox.replaceChildren(grid, el('p', { class: 'callout callout-info compact' }, [icon('info', { size: 14 }), el('span', { text: ctx.mode === 'demo'
      ? 'Na demonstração nenhum e-mail é enviado: a preferência é guardada e o envio é apenas simulado.'
      : 'O envio por e-mail depende do provedor de e-mail configurado no ambiente. Sem ele, a preferência é guardada e nada é enviado.' })]));
  }).catch((error) => prefBox.replaceChildren(errorState({ error })));
  add('notificacoes', 'Notificações', 'Escolha o que chega até você. Os avisos nunca incluem condições financeiras no e-mail.', prefBox);

  // Equipe.
  const team = el('ul', { class: 'member-list', role: 'list' }, (ctx.members || []).map((member) => el('li', { class: 'member-row' }, [
    person(member.display_name || memberName(ctx.members, member.user_id), member.title || null), tag(ROLE_LABELS[member.role] || member.role), member.user_id === ctx.viewer?.id ? tag('você', 'accent') : null
  ])));
  add('equipe', 'Equipe e papéis', 'Quem cria solicitações, quem aprova e quem só acompanha.', (ctx.members || []).length ? team : emptyState({ title: 'Equipe indisponível', compact: true }));

  if (ctx.mode === 'demo') {
    const fail = button('Simular falha na próxima gravação', { iconName: 'alert', onClick: () => { ctx.transport.simulateFailure(); toast('A próxima ação que grava dados vai falhar uma vez. Veja a mensagem de erro e tente de novo.', 'info'); } });
    add('demonstracao', 'Demonstração', 'Ferramentas para experimentar estados de erro. Existem só no ambiente demonstrativo.', [
      el('p', { class: 'muted small', text: `Estado salvo neste navegador (chave ${ctx.transport.storageKey}). ${ctx.transport.counts().emails} e-mail(s) simulado(s) — nenhum enviado.` }), fail,
      el('p', { class: 'muted small', text: 'O console operacional da plataforma (saúde de jobs, outbox e envios, sem dados de clientes) também tem uma versão de exemplo.' }),
      linkButton('Ver console operacional de exemplo', ctx.href('/finance/ops.html'), { iconName: 'shield', size: 'sm' })]);
    // Aparência e layout: preferências locais da camada de experiência da demo.
    ctx.demoSettings?.(add);
  }
  const layout = el('div', { class: 'settings-layout' }, [nav, el('div', { class: 'stack' }, sections)]);
  if (location.hash) queueMicrotask(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }));
  return layout;
}

export { avatar, money, percent, PROPOSAL_STATUS, CONTRACT_STATUS };

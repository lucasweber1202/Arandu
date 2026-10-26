// Demais telas da empresa: aprovações, propostas, contratos, provedores,
// tarefas, notificações e configurações.

import { PRODUCTS } from '../../../lib/finance/products.mjs';
import { el, icon, money, percent, formatDate, formatDateTime, relativeDays, daysUntil, plural, productLabel, demandHeadline, RFQ_STATUS, CONTRACT_STATUS, PROPOSAL_STATUS, PROVIDER_KINDS, ROLE_LABELS, timeAgo, fold, todayIso, renewalStage } from '../core.js';
import { card, pill, tag, button, linkButton, emptyState, errorState, loading, tabs, definitionList, toast, confirmDialog, drawer, field, person, avatar, onSubmit } from '../ui.js';
import { memberName, currentStep, approvalSummaryLine, comparisonMatrix, revisionTimeline, approvalActions, approvalSteps, coverage, lazyDocuments, keyTerms, termsSummary, isViewerTurn, TASK_EDITORS, taskChangeError } from './shared.js';
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
  center: () => import('./relationship-center.js'),
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
export async function proposalsList(ctx) {
  ctx.header({ title: 'Propostas recebidas', subtitle: 'Respostas das instituições convidadas, com versão, validade e cobertura dos campos pedidos.' });
  const rows = [];
  for (const rfq of ctx.data.rfqs || []) for (const proposal of rfq.proposals || []) rows.push({ rfq, proposal });
  if (!rows.length) return emptyState({ title: 'Nenhuma proposta recebida ainda', text: 'Convide provedores em uma solicitação aberta. As respostas aparecem aqui.', iconName: 'inbox', action: linkButton('Ver solicitações', ctx.href('/finance/rfqs.html'), { iconName: 'arrowRight' }) });
  rows.sort((a, b) => String(b.proposal.submitted_at).localeCompare(String(a.proposal.submitted_at)));
  const table = el('table', { class: 'data-table' });
  table.append(el('thead', {}, el('tr', {}, ['Instituição', 'Solicitação', 'Condições', 'Versão', 'Enviada', 'Validade', 'Cobertura'].map((label) => el('th', { scope: 'col', text: label })))));
  const body = el('tbody');
  for (const { rfq, proposal } of rows) {
    const outdated = proposal.rfq_revision && proposal.rfq_revision < (rfq.revision || 1);
    const cov = coverage(rfq.product, proposal.terms);
    const validDays = daysUntil(proposal.terms?.valid_until);
    const live = ['open', 'collecting', 'comparing'].includes(rfq.status);
    body.append(el('tr', { class: 'row-link', dataset: { entity: 'proposal', id: proposal.id, rfq: rfq.id } }, [
      el('td', { 'data-label': 'Instituição', class: 'cell-primary' }, [el('a', { class: 'row-title stretched', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#propostas`), text: proposal.provider_name }), el('span', { class: 'row-sub', text: PROVIDER_KINDS[proposal.provider_kind] || 'Provedor' })]),
      el('td', { 'data-label': 'Solicitação' }, [el('span', { text: rfq.title }), el('span', { class: 'row-sub', text: RFQ_STATUS[rfq.status]?.label })]),
      el('td', { 'data-label': 'Condições', class: 'small' }, termsSummary(rfq.product, proposal.terms)),
      el('td', { 'data-label': 'Versão' }, [el('span', { text: `v${proposal.version}` }),
        // Retirada ou em preparação não pode parecer resposta válida.
        proposal.status && !['submitted', 'revised'].includes(proposal.status) ? el('span', { class: 'row-sub warn-text', text: PROPOSAL_STATUS[proposal.status]?.label || 'Situação desconhecida' }) : null, proposal.rfq_revision ? el('span', { class: `row-sub${outdated ? ' warn-text' : ''}`, text: `rev. ${proposal.rfq_revision}${outdated ? ` (atual ${rfq.revision})` : ''}` }) : null]),
      // Resposta depois do prazo informado é registrada como tal (fato, não juízo).
      el('td', { 'data-label': 'Enviada' }, [el('span', { text: formatDate(proposal.submitted_at) }),
        rfq.response_deadline && proposal.submitted_at && String(proposal.submitted_at).slice(0, 10) > rfq.response_deadline ? el('span', { class: 'row-sub warn-text', text: 'após o prazo de resposta' }) : null]),
      // Validade só é alerta enquanto o processo ainda decide; em processo encerrado
      // é registro histórico (com ano), sem vermelho de urgência.
      el('td', { 'data-label': 'Validade', class: live && validDays !== null && validDays < 5 ? 'urgent' : '' }, proposal.terms?.valid_until ? el('span', { class: live ? '' : 'muted', text: `${formatDate(proposal.terms.valid_until, { withYear: !live })}${validDays !== null && validDays >= 0 ? ` · ${relativeDays(proposal.terms.valid_until)}` : validDays < 0 ? (live ? ' · vencida' : ' · expirou') : ''}` }) : el('span', { class: 'muted', text: 'não informada' })),
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
  ].filter(([, date]) => date >= contract.starts_on).sort((a, b) => a[1].localeCompare(b[1]) || (a[0] === 'Aviso prévio' ? -1 : 1))
    // Marcos na mesma data (aviso prévio de 60 dias = marco de 60 dias) viram um rótulo só, sem data repetida.
    .reduce((list, point) => { const last = list.at(-1); if (last && last[1] === point[1]) last[0] = `${last[0]} · ${point[0]}`; else list.push([...point]); return list; }, [])
    .map(([label, date, reached]) => el('li', { class: `life-point${reached ? ' reached' : ''}` }, [el('span', { class: 'life-point-label', text: label }), el('span', { class: 'life-point-date', text: formatDate(date, { withYear: 'auto' }) }), reached ? el('span', { class: 'sr-only', text: '(alcançado)' }) : null])));
  return el('div', { class: 'lifecycle-bar', role: 'img', 'aria-label': `Vigência de ${formatDate(contract.starts_on)} a ${formatDate(contract.ends_on)}; aviso prévio em ${formatDate(new Date(notice).toISOString().slice(0, 10))}` }, [bar, legend]);
}

// Dias até o vencimento pelo calendário de quem lê (daysUntil), a mesma conta
// do Painel. O days_to_end da API arredonda a partir do instante da requisição
// e, à tarde, dá um dia a menos que o Painel para o mesmo contrato.
function contractDays(contract) {
  const days = daysUntil(contract.ends_on);
  if (days === null || !['active', 'renewing'].includes(contract.status)) return null;
  return el('span', { class: `contract-days${days <= 60 ? ' warn' : ''}`, text: days === 0 ? 'vence hoje' : days === 1 ? 'vence amanhã' : days > 1 ? `vence em ${days} dias` : 'vencido' });
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

// Pós-contratação a um clique: implantação e obrigações DESTE contrato. A API
// filtra por contract_id (#211) e a página de destino diz o recorte aplicado.
function contractLifecycleLinks(ctx, contract) {
  if (!['active', 'renewing'].includes(contract.status)) return null;
  // contract_id vai à API; contrato só diz à página de onde a pessoa veio.
  const query = new URLSearchParams({ contract_id: contract.id, contrato: contract.id });
  const who = contract.provider_name || 'esta instituição';
  return el('nav', { class: 'contract-lifecycle-links', 'aria-label': `Pós-contratação do contrato com ${who}` }, [
    el('a', { class: 'contract-link', href: ctx.href(`/finance/implementations.html?${query}`) }, [el('span', { text: 'Implantação deste contrato' }), icon('arrowRight', { size: 14 })]),
    el('a', { class: 'contract-link', href: ctx.href(`/finance/covenants.html?${query}`) }, [el('span', { text: 'Covenants e obrigações deste contrato' }), icon('arrowRight', { size: 14 })])
  ]);
}

export async function contracts(ctx) {
  const [entities] = await Promise.all([loadEntities(ctx), need('contractCenter')]);
  const rows = (ctx.data.contracts || []).filter((row) => inContext(entities, row));
  const requestedId = location.hash.startsWith('#contract-') ? location.hash.slice('#contract-'.length) : null;
  if (new URLSearchParams(location.search).get('abrir') === 'contrato' && requestedId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedId)) {
    const known = rows.find(row => row.id === requestedId);
    if (known) queueMicrotask(() => mods.contractCenter.openContract(ctx, known));
    else if (!(ctx.data.contracts || []).some(row => row.id === requestedId)) {
      // Um contrato fora do recorte recente continua acessível pelo endpoint
      // existente, sem aceitar objeto de outra organização/entidade em foco.
      ctx.api(`contract-detail?id=${encodeURIComponent(requestedId)}`).then(detail => {
        if (detail.contract?.id !== requestedId || detail.contract?.organization_id !== ctx.organization.id || !inContext(entities, detail.contract)) throw new Error('Contrato indisponível neste contexto.');
        mods.contractCenter.openContract(ctx, detail.contract, { initialDetail: detail });
      }).catch(error => toast(error.message, 'error'));
    }
  }
  const manage = ctx.can('create_rfq');
  const refresh = manage ? button('Atualizar marcos de renovação', { size: 'sm', iconName: 'refresh', onClick: async (event) => {
    const target = event.currentTarget;
    target.disabled = true;
    try {
      const result = await ctx.api('renewals', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id }) });
      toast(result.tasks_created ? `${plural(result.tasks_created, 'tarefa de renovação criada', 'tarefas de renovação criadas')}.` : 'Marcos em dia. Nenhuma tarefa nova.');
      if (result.tasks_created) ctx.reload();
    } catch (error) { toast(error.message, 'error'); } finally { target.disabled = false; }
  } }) : null;
  const context = entityContextSelect(entities, { onChange: () => ctx.rerender() });
  const importButton = mods.contractCenter.importContractButton(ctx, entities);
  ctx.header({ title: 'Contratos e renovações', subtitle: 'Termos versionados, aditivos, marcos próprios, aviso prévio e próxima ação de cada contrato.', actions: [context, importButton, refresh].filter(Boolean) });
  // Filtro de entidade sem contrato não é carteira vazia: diz o recorte e não oferece o "primeiro" registro.
  if (!rows.length && (ctx.data.contracts || []).length) return emptyState({ title: 'Nenhum contrato nesta entidade', text: ctx.can('create_rfq') ? 'Há contratos carregados em outras entidades do grupo. Troque a entidade no seletor acima ou registre um contrato desta entidade.' : 'Há contratos carregados em outras entidades do grupo. Troque a entidade no seletor acima para vê-los.', iconName: 'briefcase',
    action: mods.contractCenter.importContractButton(ctx, entities) });
  if (!rows.length && !ctx.can('create_rfq')) return emptyState({ title: 'Nenhum contrato registrado ainda', text: 'Quando a equipe registrar contratos, você acompanha aqui vigência, aviso prévio e próxima ação. Registrar contratos fica com administração e gestão financeira.', iconName: 'briefcase' });
  if (!rows.length) return emptyState({ title: 'Nenhum contrato registrado ainda', text: 'Registre os contratos que a empresa já tem com vigência e aviso prévio: o Arandu abre a tarefa de revisão da renovação e acompanha os marcos. Contratos de uma concorrência no Arandu entram pela decisão.', iconName: 'briefcase',
    action: mods.contractCenter.importContractButton(ctx, entities, { label: 'Registrar o primeiro contrato', variant: 'primary' }) });
  const ordered = [...rows].sort((a, b) => (['active', 'renewing'].includes(b.status) - ['active', 'renewing'].includes(a.status)) || String(a.review_from).localeCompare(String(b.review_from)));
  // Contratos que pedem ação primeiro.
  const root = el('div', { class: 'stack' });
  // Destaque por âncora (#contract-…) ou pelo link de origem da implantação (?id=…).
  const focusId = location.hash.startsWith('#contract-') ? location.hash.slice('#contract-'.length) : new URLSearchParams(location.search).get('id');
  for (const contract of ordered) {
    const next = contractNextAction(contract);
    // Só crédito e adquirência têm concorrência no Arandu. Em renovação, o
    // mesmo botão leva à concorrência já aberta a partir deste contrato.
    const sourceable = ['credit', 'acquiring'].includes(contract.product);
    const restart = manage && sourceable && ['active', 'renewing'].includes(contract.status) ? button(contract.status === 'renewing' ? 'Abrir concorrência de renovação' : 'Iniciar nova concorrência', { variant: next.cta ? 'primary' : 'secondary', size: 'sm', iconName: 'repeat', onClick: async (event) => {
      const target = event.currentTarget;
      if (!await confirmDialog({ title: contract.status === 'renewing' ? 'Abrir concorrência de renovação?' : 'Iniciar nova concorrência?', description: `Se já houver uma concorrência de renovação em andamento para este contrato com ${contract.provider_name}, ela é aberta. Senão, criamos um rascunho com a demanda do contrato atual; convites, propostas e decisões anteriores não são copiados, e o contrato passa para “Em renovação”.`, confirmLabel: contract.status === 'renewing' ? 'Continuar' : 'Criar rascunho' })) return;
      target.disabled = true;
      try {
        const result = await ctx.api('contract-renewal-rfq', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, contract_id: contract.id }) });
        toast('Abrindo a concorrência de renovação.');
        location.assign(ctx.href(`/finance/rfq.html?id=${encodeURIComponent(result.id)}`));
      } catch (error) { toast(error.message, 'error'); target.disabled = false; }
    } }) : null;
    // O contrato guarda a decisão (decision_id), não a solicitação: a origem é
    // a solicitação cuja decisão registrada é a deste contrato.
    const source = contract.decision_id ? (ctx.data.rfqs || []).find((rfq) => rfq.decision_id && rfq.decision_id === contract.decision_id) : null;
    root.append(el('article', { class: `contract-card${focusId === contract.id ? ' highlighted' : ''}`, id: `contract-${contract.id}`, tabindex: '-1', dataset: { entity: 'contract', id: contract.id } }, [
      el('header', { class: 'contract-head' }, [
        el('div', {}, [
          el('p', { class: 'contract-kicker', text: `${CONTRACT_CATEGORIES[contract.product] || productLabel(contract.product)}${source ? ` · ${source.title}` : contract.title ? ` · ${contract.title}` : ''}` }),
          el('h2', { class: 'contract-title', text: contract.provider_name || 'Provedor' }),
          entities.rows.length ? el('p', { class: 'contract-entity', 'aria-label': `Entidade: ${entityName(entities, contract.legal_entity_id)}` }, contractEntityControl(ctx, entities, contract)) : null
        ]),
        el('div', { class: 'contract-status' }, [pill(CONTRACT_STATUS[contract.status]), contractDays(contract)])
      ]),
      ['active', 'renewing'].includes(contract.status) ? lifecycleBar(contract) : null,
      el('div', { class: `next-action-box tone-${next.tone}` }, [icon(next.icon, { size: 16 }), el('span', { class: 'next-action-label', text: 'Próxima ação' }), el('span', { class: 'next-action-text', text: next.text }), restart]),
      el('dl', { class: 'deflist deflist-3' }, [
        ['Vigência', `${formatDate(contract.starts_on)} → ${formatDate(contract.ends_on)}`], ['Prazo do aviso prévio', `${contract.renewal_notice_days} dias antes do fim · ${formatDate(contract.review_from)}`],
        // Quem responde pelo contrato: a renovação e os marcos têm dono.
        ['Responsável', contract.owner_id ? memberName(ctx.members, contract.owner_id) : 'Não informado'],
        ['Custo registrado', contract.cost_summary || 'Não informado'], contract.main_conditions ? ['Condições', contract.main_conditions] : null,
        contract.document_reference ? ['Documento', contract.document_reference] : null
      ].filter(Boolean).map(([label, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: label }), el('dd', { class: value === 'Não informado' ? 'missing' : '', text: value })]))),
      el('div', { class: 'contract-open' }, [button('Abrir contrato: termos, aditivos e marcos', { size: 'sm', iconName: 'file', onClick: () => mods.contractCenter.openContract(ctx, contract) }),
        contract.origin === 'imported' ? tag('Carteira existente') : null, contract.current_version ? tag(`Termos v${contract.current_version}`, 'accent') : tag('Termos não estruturados', 'warning'),
        source ? el('a', { class: 'contract-link contract-origin', href: ctx.href(`/finance/rfq.html?id=${source.id}#decisao`) }, [el('span', { text: 'Ver processo e decisão de origem' }), icon('arrowRight', { size: 14 })]) : null]),
      lazyDocuments(ctx, 'contract', contract.id, 'Documentos do contrato', { canUpload: ctx.can('upload_document') }),
      contractLifecycleLinks(ctx, contract)
    ]));
  }
  if (focusId) queueMicrotask(() => { const target = document.getElementById(`contract-${focusId}`); target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true }); });
  return root;
}

// -------------------------------------------------------------- provedores
export async function providers(ctx) {
  const rows = ctx.data.providers || [];
  // Memória de relacionamento (contatos, issues, avaliações da empresa, mapa).
  const entities = await loadEntities(ctx);
  const relationshipEnabled = entities.available;
  await need('center', 'contractCenter', ...(relationshipEnabled ? ['relationship'] : []));
  const manage = ctx.can('create_rfq');
  const add = manage ? button('Cadastrar instituição', { variant: 'primary', iconName: 'plus', attrs: { 'data-intent': 'cadastrar-instituicao' }, onClick: () => providerDrawer(ctx) }) : null;
  ctx.header({ title: 'Instituições', subtitle: 'Bancos, fintechs e adquirentes com quem a empresa se relaciona: contratos, vencimentos e processos de cada uma. É um cadastro da empresa, não uma atestação.', actions: add ? [add] : [] });
  if (!rows.length) return emptyState({ title: 'Nenhuma instituição cadastrada', text: 'Registre a primeira instituição para organizar o relacionamento e as condições existentes.', iconName: 'building', action: add ? button('Cadastrar instituição', { variant: 'primary', iconName: 'plus', onClick: () => providerDrawer(ctx) }) : null });
  // Índice de relacionamento: fatos do histórico da própria empresa, em ordem alfabética (nada de ranking).
  const participation = new Map();
  const proposalsBy = new Map();
  for (const rfq of ctx.data.rfqs || []) {
    for (const invite of rfq.invites || []) participation.set(invite.provider_id, (participation.get(invite.provider_id) || 0) + 1);
    for (const proposal of rfq.proposals || []) proposalsBy.set(proposal.provider_id, (proposalsBy.get(proposal.provider_id) || 0) + 1);
  }
  const liveContracts = new Map();
  for (const contract of ctx.data.contracts || []) {
    if (!['active', 'renewing'].includes(contract.status) || !contract.provider_id) continue;
    const list = liveContracts.get(contract.provider_id) || [];
    list.push(contract);
    liveContracts.set(contract.provider_id, list);
  }
  const search = el('input', { type: 'search', class: 'input', placeholder: 'Buscar por nome, tipo ou região', 'aria-label': 'Buscar provedor' });
  const count = el('span', { class: 'result-count', role: 'status', 'aria-live': 'polite' });
  const table = el('table', { class: 'data-table provider-table' });
  table.append(el('thead', {}, el('tr', {}, ['Instituição', 'Tipo e região', 'Contratos vigentes carregados', 'Próximo vencimento carregado', 'Processos carregados', 'Verificação'].map((label) => el('th', { scope: 'col', text: label })))));
  const body = el('tbody');
  table.append(body);
  const draw = () => {
    const term = fold(search.value);
    body.replaceChildren();
    const visible = rows.filter((row) => fold(`${row.name} ${row.region} ${PROVIDER_KINDS[row.kind]}`).includes(term));
    for (const provider of visible) {
      body.append(el('tr', { id: `provider-${provider.id}`, dataset: { entity: 'provider', id: provider.id } }, [
        el('td', { 'data-label': 'Provedor', class: 'cell-primary' }, [person(provider.name, provider.website || null),
          relationshipEnabled ? button('Relacionamento', { size: 'sm', variant: 'ghost', iconName: 'users', attrs: { 'aria-label': `Relacionamento com ${provider.name}` }, onClick: () => { const url = new URL(location.href); url.searchParams.set('provider_id', provider.id); history.replaceState(null, '', url.pathname + url.search + url.hash); mods.relationship.openProviderRelationship(ctx, provider); } }) : null]),
        el('td', { 'data-label': 'Tipo e região' }, [el('span', { text: PROVIDER_KINDS[provider.kind] || 'Tipo não informado' }), el('span', { class: 'cell-sub muted small', text: provider.region || 'Região não informada' })]),
        el('td', { 'data-label': 'Contratos vigentes', class: 'num', text: String((liveContracts.get(provider.id) || []).length) }),
        el('td', { 'data-label': 'Próximo vencimento' }, (() => {
          const next = (liveContracts.get(provider.id) || []).map((contract) => contract.ends_on).filter(Boolean).sort()[0];
          return next ? [el('span', { text: formatDate(next) }), el('span', { class: 'cell-sub muted small', text: relativeDays(next) })] : el('span', { class: 'muted', text: (liveContracts.get(provider.id) || []).length ? 'Vencimento não informado' : 'Nenhum no recorte carregado' });
        })()),
        el('td', { 'data-label': 'Processos', text: `${plural(participation.get(provider.id) || 0, 'convite', 'convites')} · ${plural(proposalsBy.get(provider.id) || 0, 'proposta', 'propostas')}` }),
        el('td', { 'data-label': 'Verificação' }, provider.verification_state === 'EVIDENCIA_REGISTRADA'
          ? tag(`Evidência registrada em ${formatDate(provider.regulator_checked_at)}`, 'success')
          : el('span', { class: 'muted small', title: 'O cadastro é uma referência da empresa, não uma atestação de regularidade.', text: 'Sem verificação registrada' }))
      ]));
    }
    count.textContent = `${visible.length} de ${rows.length}`;
  };
  search.addEventListener('input', draw);
  const requested = new URLSearchParams(location.search).get('provider_id')?.toLowerCase();
  if (requested && relationshipEnabled) {
    const provider = rows.find(row => row.id === requested);
    if (provider) queueMicrotask(() => mods.relationship.openProviderRelationship(ctx, provider));
    else queueMicrotask(async () => {
      const current = () => location.pathname.endsWith('/providers.html') && new URLSearchParams(location.search).get('provider_id')?.toLowerCase() === requested;
      try {
        const detail = await ctx.api(`provider-relationship?organization_id=${encodeURIComponent(ctx.organization.id)}&provider_id=${encodeURIComponent(requested)}`);
        if (detail.provider?.id !== requested) throw new Error('Instituição indisponível.');
        if (current()) mods.relationship.openProviderRelationship(ctx, detail.provider, {initialDetail:detail});
      } catch { if (current()) toast('Instituição indisponível no seu escopo autorizado. Tente novamente pela lista.', 'error'); }
    });
  }
  draw();
  const openRelationship = relationshipEnabled ? (provider) => { const url = new URL(location.href); url.searchParams.set('provider_id', provider.id); history.replaceState(null, '', url.pathname + url.search + url.hash); mods.relationship.openProviderRelationship(ctx, provider); } : null;
  const center = mods.center.relationshipWorkQueue(ctx, { entities, onOpenProvider: openRelationship,
    importButton: manage ? (providerId) => mods.contractCenter.importContractButton(ctx, entities, { label: 'Registrar contrato existente', size: 'sm', providerId }) : null });
  return el('div', { class: 'list-page' }, [
    center,
    el('h2', { class: 'form-section-title', text: 'Todas as instituições' }),
    el('p', { class: 'callout callout-info compact', role: 'note', text: 'Recorte dos registros carregados e autorizados: até 200 instituições, 200 contratos e 200 solicitações recentes. Convites e propostas se referem a essas solicitações; rascunhos e propostas retiradas não contam. Contagens e vencimentos não representam o histórico completo.' }),
    el('div', { class: 'toolbar' }, [el('div', { class: 'toolbar-search' }, [icon('search'), search]), count]), el('div', { class: 'table-card' }, table)
  ]);
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
  const save = button('Cadastrar instituição', { variant: 'primary', type: 'submit', iconName: 'check', attrs: { form: 'provider-form' } });
  const dialog = drawer({ title: 'Cadastrar instituição', body: form, footer: [button('Cancelar', { variant: 'ghost', onClick: () => dialog.close() }), save] });
  onSubmit(form, async (event) => {
    event.preventDefault();
    if (name.value.trim().length < 2) { nameField.setError('Informe o nome do provedor.'); name.focus(); return; }
    if (website.value && !/^https:\/\//.test(website.value)) { website.closest('.field').setError('Use um endereço https.'); return; }
    save.disabled = true;
    try {
      const created = await ctx.api('providers', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, ...Object.fromEntries(new FormData(form)) }) });
      dialog.close();
      // Primeiro valor sem a instituição no portal: o cadastro abre direto o
      // relacionamento, onde contato, contrato e questões são os próximos passos.
      const id = created?.row?.id;
      toast(id ? 'Instituição cadastrada. Ela não precisa ter conta no Arandu: registre agora um contato ou um contrato existente.' : 'Instituição cadastrada.');
      if (id) {
        const url = new URL(location.href);
        url.searchParams.delete('acao');
        url.searchParams.set('provider_id', id);
        history.replaceState(null, '', url.pathname + url.search + url.hash);
      }
      ctx.reload();
    } catch (error) { toast(error.message, 'error'); save.disabled = false; }
  });
  name.focus();
}

// ----------------------------------------------------------------- tarefas
// Responsável de tarefa (contrato da #204): só gestores atribuem; só admin,
// gestor financeiro e analista podem responder (o banco confere papel, membro e
// escopo de entidade). Candidatos vêm dos membros da própria empresa já
// carregados; leitor e provedor nunca aparecem. Nome nunca é identificador.
const TASK_FILTERS = [['abertas', 'Abertas'], ['minhas', 'Atribuídas a mim'], ['sem-responsavel', 'Sem responsável'], ['concluidas', 'Concluídas']];
function assigneeCandidates(ctx) {
  return (ctx.members || []).filter((member) => member.user_id && ['admin', 'finance_manager', 'analyst'].includes(member.role))
    .map((member) => [member.user_id, `${member.display_name || ROLE_LABELS[member.role] || 'Membro'}${member.user_id === ctx.viewer?.id ? ' (você)' : ''}`]);
}
function assigneeSelect(ctx, current, label) {
  const select = el('select', { class: 'input task-assignee', ...(label ? { 'aria-label': label } : {}) });
  select.add(new Option('Sem responsável', ''));
  for (const [value, text] of assigneeCandidates(ctx)) select.add(new Option(text, value));
  // Responsável que não está mais entre os membros carregados: fica visível como tal, sem inventar nome.
  if (current && ![...select.options].some((option) => option.value === current)) select.add(new Option('Responsável indisponível', current));
  select.value = current || '';
  return select;
}
// Resultado desconhecido: rede, prazo ou erro do servidor. Recusa explícita (4xx) é definitiva.
const unknownOutcome = (error) => !error.status || error.status >= 500 || error.code === 'task_creation_unknown';

export async function tasks(ctx) {
  ctx.header({ title: 'Tarefas', subtitle: 'Pendências da equipe: quem responde, até quando e de onde cada uma vem.' });
  const canAssign = ctx.can('create_rfq');
  const canEdit = TASK_EDITORS.includes(ctx.viewer?.role);
  const root = el('div', { class: 'stack' });
  const box = el('div', {}, loading());
  const form = el('form', { class: 'inline-form task-new', id: 'task-new', novalidate: true });
  const title = el('input', { name: 'title', maxlength: '200', placeholder: 'Nova tarefa…' });
  const due = el('input', { name: 'due_on', type: 'date', min: todayIso() });
  const assignee = canAssign ? assigneeSelect(ctx, '', null) : null;
  const submit = button('Adicionar', { variant: 'primary', type: 'submit', iconName: 'plus' });
  const pendingNote = el('p', { class: 'callout callout-warning compact', role: 'status', hidden: true });
  form.append(...[field({ label: 'Nova tarefa', control: title }), field({ label: 'Prazo', control: due, optionalLabel: true }),
    assignee && field({ label: 'Responsável', control: assignee, optionalLabel: true }), submit,
    !canAssign && el('p', { class: 'muted small task-new-note', text: 'A tarefa é criada sem responsável. Gestores financeiros e administradores definem quem responde.' }), pendingNote].filter(Boolean));
  // Uma intenção de criação = uma chave. Repetir depois de resultado desconhecido
  // reaproveita a chave (o servidor não duplica); confirmação ou recusa definitiva a encerram.
  let pending = null;
  let submitting = false;
  const payload = () => ({ organization_id: ctx.organization.id, title: title.value.trim(), due_on: due.value || null, ...(assignee && assignee.value ? { assignee_id: assignee.value } : {}) });
  const samePayload = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  onSubmit(form, async (event) => {
    event.preventDefault();
    if (submitting) return;
    if (title.value.trim().length < 2) { title.closest('.field').setError('Descreva a tarefa.'); title.focus(); return; }
    const body = payload();
    if (pending && !samePayload(pending.body, body)) {
      const discard = await confirmDialog({ title: 'Descartar a tentativa anterior?', description: 'Não confirmamos se a tarefa anterior foi registrada. A lista será recarregada para você conferir; a nova tarefa usa os dados atuais.', confirmLabel: 'Descartar e criar nova' });
      if (!discard) return;
      pending = null;
      pendingNote.hidden = true;
      await draw();
    }
    pending ||= { key: crypto.randomUUID(), body };
    submitting = true;
    submit.disabled = true;
    try {
      const result = await ctx.api('tasks', { method: 'POST', body: JSON.stringify({ ...pending.body, idempotency_key: pending.key }) });
      pending = null;
      pendingNote.hidden = true;
      title.value = ''; due.value = ''; if (assignee) assignee.value = '';
      toast('Tarefa criada.');
      await draw(result?.row?.id);
    } catch (error) {
      if (unknownOutcome(error)) {
        // Reconciliação segura: relê a lista persistida (o servidor pede isso no 409
        // task_creation_unknown) e diz o que encontrou. A chave da tentativa é mantida;
        // nada é reenviado sozinho.
        // Título igual NÃO prova que a tarefa é desta tentativa (pode haver
        // homônimas antigas ou de colegas). Só o servidor confirma, pela mesma
        // chave: "Conferir com o servidor" reenvia a tentativa idempotente e ele
        // devolve a tarefa já gravada ou a grava uma única vez.
        pendingNote.replaceChildren('Não confirmamos se a tarefa foi criada. Conferindo a lista…');
        pendingNote.hidden = false;
        const rows = await draw();
        const sameTitle = (rows || []).filter((row) => row.title === pending.body.title && row.status === 'open').length;
        pendingNote.replaceChildren(
          el('span', { text: `Não confirmamos se a tarefa foi criada. ${sameTitle ? `A lista mostra ${sameTitle === 1 ? 'uma tarefa aberta' : `${sameTitle} tarefas abertas`} com este título, mas o título sozinho não prova que é a sua. ` : ''}Use “Conferir com o servidor”: ele repete a mesma tentativa e nunca cria uma segunda tarefa.` }),
          ' ',
          button('Conferir com o servidor', { size: 'sm', iconName: 'refresh', onClick: () => form.requestSubmit() })
        );
        toast('Não foi possível confirmar a criação da tarefa. Seus dados continuam no formulário.', 'error');
      } else {
        pending = null;
        pendingNote.hidden = true;
        toast(error.message, 'error');
      }
    } finally { submitting = false; submit.disabled = false; }
  });

  const url = new URL(location.href);
  const requestedTask = /^#task-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(location.hash)?.[1] || null;
  const filter = el('select', { class: 'input', 'aria-label': 'Mostrar tarefas' });
  if (requestedTask) filter.add(new Option('Tarefa deste link', 'vinculada'));
  for (const [value, text] of TASK_FILTERS) filter.add(new Option(text, value));
  filter.value = [...filter.options].some(({value}) => value === url.searchParams.get('filtro')) ? url.searchParams.get('filtro') : requestedTask ? 'vinculada' : 'abertas';
  const scopeNote = el('span', { class: 'muted small', role: 'status', 'aria-live': 'polite' });
  filter.addEventListener('change', () => {
    const next = new URL(location.href);
    if (filter.value === 'abertas' && !requestedTask) next.searchParams.delete('filtro'); else next.searchParams.set('filtro', filter.value);
    history.replaceState(null, '', next.pathname + next.search + next.hash);
    draw();
  });
  // Cada filtro é uma consulta ao servidor (#206): status, responsável e cursor.
  // A tela nunca soma um total global que a API não informa; diz quantas
  // tarefas carregou e se há mais.
  const PAGE = 50;
  const query = (cursor) => {
    const q = new URLSearchParams({ organization_id: ctx.organization.id, limit: String(PAGE) });
    if (filter.value === 'vinculada') { q.set('task_id', requestedTask); return `tasks?${q}`; }
    if (filter.value === 'concluidas') q.set('status', 'done'); else q.set('status', 'open');
    if (filter.value === 'minhas' && ctx.viewer?.id) q.set('assignee_id', ctx.viewer.id);
    if (filter.value === 'sem-responsavel') q.set('unassigned', 'true');
    if (cursor) q.set('cursor', cursor);
    return `tasks?${q}`;
  };
  let loaded = [];
  let nextCursor = null;
  let generation = 0;
  const more = button('Carregar mais tarefas', { iconName: 'chevronDown', onClick: () => loadMore() });
  more.hidden = true;
  const outcomeError = { unknown: 'Não foi possível confirmar a alteração. Recarregue a lista antes de tentar de novo.' };
  // PATCH 200 confirma a linha gravada (desde #206 a API devolve 404 quando nada
  // foi alterado). A lista é relida no filtro atual para mostrar o estado salvo.
  async function confirmed(task) {
    const rows = await draw(task.id);
    return rows ? 'yes' : 'unknown';
  }

  async function changeStatus(task, check) {
    const wanted = check.checked ? 'done' : 'open';
    // Até a confirmação a linha fica ocupada e diz que está salvando: nada aparece como concluído sem o servidor.
    check.disabled = true;
    const row = check.closest('.task-item');
    row?.setAttribute('aria-busy', 'true');
    row?.querySelector('.task-meta')?.append(el('span', { class: 'task-saving', text: ' · Salvando…' }));
    try {
      await ctx.api('tasks', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, task_id: task.id, status: wanted }) });
      const outcome = await confirmed(task);
      if (outcome === 'yes') toast(wanted === 'done' ? 'Tarefa concluída.' : 'Tarefa reaberta.');
      else toast(outcomeError[outcome], 'error');
    } catch (error) {
      toast(taskChangeError(error), 'error');
      await draw(task.id);
    }
  }

  async function changeAssignee(task, select) {
    const persisted = task.assignee_id || '';
    if (select.value === persisted) return;
    select.disabled = true;
    try {
      // Nunca mostra o novo responsável antes do servidor confirmar: recarrega a lista persistida.
      await ctx.api('tasks', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, task_id: task.id, assignee_id: select.value || null }) });
      const wanted = select.value || null;
      const outcome = await confirmed(task);
      if (outcome === 'yes') toast(wanted ? 'Responsável atualizado.' : 'Tarefa ficou sem responsável.');
      else toast(outcomeError[outcome], 'error');
    } catch (error) {
      select.value = persisted;
      select.disabled = false;
      // O mesmo 403 cobre papel de quem atribui e elegibilidade de quem recebe (escopo de entidade).
      toast(error.status === 403 ? 'A alteração de responsável não foi permitida (permissão ou escopo da pessoa escolhida). Nada mudou.' : taskChangeError(error), 'error');
    }
  }

  // Primeira página do filtro atual; respostas de um filtro anterior são descartadas.
  async function draw(focusId = null) {
    const mine = ++generation;
    box.setAttribute('aria-busy', 'true');
    more.hidden = true;
    try {
      const data = await ctx.api(query(null));
      if (mine !== generation) return null;
      loaded = (data.rows || []).filter((row) => filter.value !== 'vinculada' || row.id === requestedTask);
      nextCursor = filter.value !== 'vinculada' && data.page?.has_more ? data.page.next_cursor : null;
      render(focusId);
      return loaded;
    } catch (error) {
      if (mine !== generation) return null;
      box.replaceChildren(errorState({ error, onRetry: () => draw() }));
      scopeNote.textContent = '';
      return null;
    } finally { if (mine === generation) box.removeAttribute('aria-busy'); }
  }
  async function loadMore() {
    if (!nextCursor) return;
    const mine = generation;
    more.disabled = true;
    try {
      const data = await ctx.api(query(nextCursor));
      if (mine !== generation) return;
      const known = new Set(loaded.map((row) => row.id));
      loaded = [...loaded, ...(data.rows || []).filter((row) => !known.has(row.id))];
      nextCursor = data.page?.has_more ? data.page.next_cursor : null;
      render();
    } catch (error) {
      if (mine === generation) toast(error.status === 400 ? 'A lista mudou desde a última página. Recarregamos do início.' : 'Não foi possível carregar mais tarefas. As já exibidas continuam como estavam.', 'error');
      if (mine === generation && error.status === 400) await draw();
    } finally { more.disabled = false; }
  }
  function render(focusId = null) {
    {
      const visible = loaded;
      scopeNote.textContent = `${visible.length} ${visible.length === 1 ? 'tarefa carregada' : 'tarefas carregadas'}${nextCursor ? ' · há mais neste filtro' : visible.length ? ' · todas deste filtro' : ''}`;
      more.hidden = !nextCursor;
      // Abertas agrupadas por urgência (§35.8): o que venceu, o que vence nesta
      // semana e o resto. A ordem do servidor (prazo) é mantida dentro de cada grupo.
      const grouped = !['concluidas', 'vinculada'].includes(filter.value);
      const BUCKETS = [['overdue', 'Vencidas'], ['week', 'Próximos 7 dias'], ['later', 'Mais adiante'], ['none', 'Sem prazo']];
      const bucketOf = (task) => {
        if (task.status !== 'open' || !task.due_on) return task.due_on ? 'later' : 'none';
        const days = daysUntil(task.due_on);
        return days < 0 ? 'overdue' : days <= 7 ? 'week' : 'later';
      };
      const lists = new Map(BUCKETS.map(([key]) => [key, el('ul', { class: 'task-group-list', role: 'list' })]));
      const single = el('ul', { class: 'task-list', role: 'list' });
      const rfqs = new Map((ctx.data.rfqs || []).map((rfq) => [rfq.id, rfq]));
      const contractsById = new Map((ctx.data.contracts || []).map((row) => [row.id, row]));
      for (const task of visible) {
        const days = daysUntil(task.due_on);
        // Leitor vê o estado como texto; quem pode alterar recebe a caixa.
        const check = canEdit && task.status !== 'cancelled' ? el('input', { type: 'checkbox', checked: task.status === 'done', 'aria-label': `${task.status === 'done' ? 'Reabrir' : 'Concluir'}: ${task.title}` }) : null;
        check?.addEventListener('change', () => changeStatus(task, check));
        const state = check ? null : el('span', { class: 'task-state', text: task.status === 'cancelled' ? 'Cancelada' : task.status === 'done' ? 'Concluída' : 'Aberta' });
        // Tarefa de contrato diz qual contrato e quando ele vence de fato:
        // concluir a tarefa não muda o vencimento nem o aviso prévio.
        const contract = task.related_type === 'contract' ? contractsById.get(task.related_id) : null;
        const related = task.related_type === 'rfq' && rfqs.get(task.related_id) ? el('a', { href: ctx.href(`/finance/rfq.html?id=${task.related_id}`), text: rfqs.get(task.related_id).title })
          : task.related_type === 'contract' ? el('a', { href: ctx.href(`/finance/contracts.html#contract-${task.related_id}`), text: contract ? `${contract.provider_name || 'Contrato'} · ${contract.title || CONTRACT_CATEGORIES[contract.product] || 'contrato'}` : 'Ver contrato' }) : null;
        const contractDue = contract && ['active', 'renewing'].includes(contract.status) && contract.ends_on
          ? el('span', { class: 'task-contract-due', text: `Contrato vence em ${formatDate(contract.ends_on)}${contract.review_from ? ` · aviso prévio até ${formatDate(contract.review_from)}` : ''}` }) : null;
        const owner = !task.assignee_id ? 'Sem responsável' : task.assignee_id === ctx.viewer?.id ? `${task.assignee_name || 'Você'} (você)` : task.assignee_name || 'Responsável indisponível';
        const ownerNode = canAssign && task.status === 'open'
          ? (() => { const select = assigneeSelect(ctx, task.assignee_id, `Responsável: ${task.title}`); select.addEventListener('change', () => changeAssignee(task, select)); return select; })()
          : el('span', { class: `task-owner${task.assignee_id ? '' : ' muted'}`, text: owner });
        (grouped ? lists.get(bucketOf(task)) : single).append(el('li', { class: `task-item${task.status === 'done' ? ' done' : ''}${location.hash === `#task-${task.id}` || focusId === task.id ? ' highlighted' : ''}`, id: `task-${task.id}`, dataset: { assignee: task.assignee_id ? 'set' : 'none' } }, [
          check, el('div', { class: 'task-main' }, [state, el('span', { class: 'task-title', text: task.title }),
            el('span', { class: 'task-meta' }, [el('span', { class: 'sr-only', text: 'Responsável: ' }), canAssign && task.status === 'open' ? null : owner, canAssign && task.status === 'open' ? null : (related ? ' · ' : null), related].filter(Boolean)), contractDue]),
          canAssign && task.status === 'open' ? el('label', { class: 'task-owner-field' }, [el('span', { class: 'sr-only', text: 'Responsável' }), ownerNode]) : null,
          task.due_on ? el('span', { class: `task-due${task.status === 'open' && days < 0 ? ' overdue' : task.status === 'open' && days <= 2 ? ' soon' : ''}` }, [icon('calendar', { size: 12 }), el('span', { text: `${formatDate(task.due_on, { withYear: false })}${task.status === 'open' ? ` · ${relativeDays(task.due_on)}` : ''}` })]) : el('span', { class: 'task-due muted', text: 'sem prazo' })
        ]));
      }
      const empty = { abertas: ['Nenhuma tarefa aberta', 'Tarefas de renovação são criadas automaticamente a partir dos contratos.'], minhas: ['Nenhuma tarefa aberta atribuída a você', 'Quando alguém atribuir uma tarefa a você, ela aparece aqui.'],
        vinculada: ['Tarefa não disponível neste escopo', 'Atualize a lista ou confira o acesso à entidade desta tarefa.'], 'sem-responsavel': ['Toda tarefa aberta tem responsável', null], concluidas: ['Nenhuma tarefa concluída', null] }[filter.value];
      const list = grouped
        ? el('div', { class: 'task-list task-groups' }, BUCKETS.filter(([key]) => lists.get(key).children.length).map(([key, label]) => el('section', { class: `notice-group task-group task-group-${key}`, 'aria-label': label }, [
          el('h2', { class: 'notice-group-title', text: `${label} · ${lists.get(key).children.length}` }), lists.get(key)])))
        : single;
      box.replaceChildren(visible.length ? list : emptyState({ title: empty[0], text: empty[1], iconName: 'checkCircle', compact: true }));
      const target = focusId ? document.getElementById(`task-${focusId}`) : requestedTask ? document.getElementById(`task-${requestedTask}`) : null;
      target?.scrollIntoView({ block: 'center' });
    }
  }
  draw();
  const readOnly = el('p', { class: 'callout callout-info compact task-readonly' }, [icon('lock', { size: 14 }), el('span', { text: 'Seu papel acompanha as tarefas da equipe: criar, concluir e reabrir ficam com administradores, gestores financeiros e analistas.' })]);
  root.append(card({ body: canEdit ? form : readOnly }), el('div', { class: 'toolbar task-toolbar' }, [field({ label: 'Mostrar', control: filter }), scopeNote]), card({ flush: true, body: box }), el('div', { class: 'task-more' }, more));
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

const ROLE_SCOPE = {
  admin: { can: ['Administrar equipe, papéis e a regra de aprovação', 'Criar solicitações, convidar instituições e registrar decisões e contratos', 'Aprovar quando for aprovador designado', 'Atribuir, concluir e reabrir tarefas'], cannot: [] },
  finance_manager: { can: ['Criar solicitações, convidar instituições e registrar decisões e contratos', 'Aprovar quando for aprovador designado', 'Atribuir, concluir e reabrir tarefas', 'Atualizar o perfil financeiro'], cannot: ['Equipe, papéis e regra geral de aprovação (administração)'] },
  analyst: { can: ['Comparar propostas e preparar a análise', 'Atualizar o perfil financeiro e anexar documentos', 'Concluir e reabrir tarefas', 'Aprovar quando for aprovador designado'], cannot: ['Criar solicitações e registrar decisões ou contratos (gestão financeira)', 'Atribuir responsáveis de tarefas (gestão financeira)', 'Equipe, papéis e regra de aprovação (administração)'] },
  viewer: { can: ['Acompanhar solicitações, propostas, contratos e tarefas', 'Aprovar ou pedir alterações quando for aprovador designado', 'Ler os comentários da equipe'], cannot: ['Comentar e mencionar (análise e gestão)', 'Criar solicitações e registrar decisões ou contratos (gestão financeira)', 'Concluir, criar ou atribuir tarefas (análise e gestão)', 'Alterar dados da empresa e o perfil financeiro'] }
};

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
  // DOM append(null) imprime "null": quem só lê não recebe o botão, nem texto no lugar dele.
  orgForm.append(...[field({ label: 'Nome fantasia', control: trade }), field({ label: 'CNPJ', control: cnpj, hint: ctx.mode === 'demo' ? 'CNPJ fictício da demonstração.' : 'Conferimos formato e dígitos; não consultamos base oficial.' }),
    field({ label: 'Setor', control: sector }), field({ label: 'Faixa de faturamento', control: band }),
    canEdit ? el('div', { class: 'form-actions span-2' }, button('Salvar dados da empresa', { variant: 'primary', type: 'submit' })) : null].filter(Boolean));
  if (!canEdit) for (const control of orgForm.querySelectorAll('input,select')) control.disabled = true;
  onSubmit(orgForm, async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(orgForm));
    for (const [key, value] of Object.entries(body)) if (value === '') delete body[key];
    try { await ctx.api('organizations', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, ...body }) }); toast('Dados da empresa atualizados.'); }
    catch (error) { toast(error.message, 'error'); }
  });
  add('empresa', 'Empresa', organization.legal_name, orgForm);

  // Seu acesso (usuário convidado): organização, papel e o que ele permite, em
  // linguagem de tarefa. Espelha UI_PERMISSION_ROLES/TASK_EDITORS; o servidor continua a autoridade.
  const role = ctx.viewer?.role;
  const scope = ROLE_SCOPE[role];
  // O sandbox legado (/demo) não recebe capability nova (CLAUDE.md).
  if (scope && ctx.mode !== 'demo') {
    add('acesso', 'Seu acesso', `${ROLE_LABELS[role] || 'Papel'} em ${organization.legal_name}`, el('div', { class: 'access-scope', id: 'access-scope' }, [
      el('div', {}, [el('h3', { class: 'access-scope-title', text: 'Você pode' }), el('ul', { class: 'access-list' }, scope.can.map((text) => el('li', { text })))]),
      el('div', {}, [el('h3', { class: 'access-scope-title', text: 'Fica com outros papéis' }), scope.cannot.length ? el('ul', { class: 'access-list muted' }, scope.cannot.map((text) => el('li', { text }))) : el('p', { class: 'muted small', text: 'Nada: este é o papel com acesso completo à organização.' })]),
      el('p', { class: 'muted small span-2', text: role === 'admin' ? 'Papéis são definidos em "Equipe e papéis". O acesso a cada entidade do grupo segue o escopo concedido.' : 'Precisa de outro acesso? Peça a um administrador da organização. O acesso a cada entidade do grupo segue o escopo concedido.' })
    ]));
  }

  // Identidade de quem usa: aparece em aprovações, comentários, tarefas e responsáveis.
  const me = (ctx.members || []).find((member) => member.user_id === ctx.viewer?.id);
  if (me) {
    const nameInput = el('input', { name: 'display_name', maxlength: '120', value: me.display_name || '', autocomplete: 'name', required: true });
    const titleInput = el('input', { name: 'title', maxlength: '80', value: me.title || '', autocomplete: 'organization-title', placeholder: 'Ex.: Gerente Financeira' });
    const meForm = el('form', { class: 'inline-form', novalidate: true, id: 'member-profile-form' }, [
      field({ label: 'Seu nome', control: nameInput, required: true }), field({ label: 'Cargo', control: titleInput, optionalLabel: true }),
      button('Salvar', { type: 'submit', iconName: 'check' })]);
    onSubmit(meForm, async (event) => {
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

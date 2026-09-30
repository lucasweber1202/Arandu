// Painel da demonstração: "Precisa de você" primeiro, depois módulos que a
// pessoa escolhe, ordena e dimensiona. Cada persona começa com um painel
// próprio (ver personas.js); o layout fica só neste navegador.
//
// Os módulos só mostram contagens e valores que já existem nos dados — nada
// de estimativa de economia, ranking de provedor ou recomendação.

import { el, icon, daysUntil, relativeDays, formatDate, formatDateTime, productLabel, demandHeadline, RFQ_STATUS, CONTRACT_STATUS, ROLE_LABELS, PROVIDER_KINDS, timeAgo, money, renewalStage, humanizeKey } from '../../src/core.js';
import { pill, linkButton, button, emptyState, progress, toast, avatar } from '../../src/ui.js';
import { actionItems, greeting } from '../../src/views/dashboard.js';
import { memberName, currentStep, approvalSummaryLine, eventTitle } from '../../src/views/shared.js';
import { DEFAULT_DASHBOARDS } from './personas.js';
import { PRESETS, PRESET_ORDER, applyPreset } from './presets.js';
import { dashboardLayout, saveDashboardLayout, resetDashboardLayout, readState } from './preferences.js';

const PIPELINE = [['draft', 'Rascunho'], ['open', 'Aberta'], ['collecting', 'Em coleta'], ['comparing', 'Em avaliação'], ['decided', 'Decidida'], ['contracted', 'Contratada']];
const ACTIVE = ['open', 'collecting', 'comparing'];

// ------------------------------------------------------------- utilidades
const quick = (type, id) => ({ 'data-quick': `${type}:${id}` });
function moduleList(rows, emptyNode) {
  return rows.length ? el('ul', { class: 'dm-list', role: 'list' }, rows) : emptyNode;
}
function row({ href, title, meta, side = null, sideClass = '', iconName = null, tone = 'neutral', attrs = {} }) {
  return el('li', { class: 'dm-row' }, [
    iconName ? el('span', { class: `dm-row-icon tone-${tone}` }, icon(iconName, { size: 14 })) : null,
    el('span', { class: 'dm-row-main' }, [el('a', { class: 'dm-row-title stretched', href, text: title, ...attrs }), meta ? el('span', { class: 'dm-row-meta', text: meta }) : null]),
    side ? el('span', { class: `dm-row-side ${sideClass}`.trim() }, side) : null
  ]);
}
const deadlineText = (rfq) => (rfq.response_deadline ? relativeDays(rfq.response_deadline) : 'sem prazo');

// ----------------------------------------------------------------- módulos
function attentionModule(ctx, model) {
  const { items } = model;
  const visible = 6;
  const list = el('ul', { class: 'need-list', role: 'list' }, items.map((item, index) => el('li', { class: `need tone-${item.tone}`, hidden: index >= visible }, [
    el('span', { class: 'need-icon' }, icon(item.icon, { size: 16 })),
    el('span', { class: 'need-main' }, [
      el('a', { class: 'need-title stretched', href: item.href, text: item.title }),
      el('span', { class: 'need-detail', text: item.detail }),
      el('span', { class: 'need-meta' }, [el('span', { class: 'need-kind', text: item.kind }), item.when ? el('span', { text: ` · ${item.when}` }) : null])
    ]),
    el('span', { class: 'need-cta', 'aria-hidden': 'true' }, [el('span', { text: item.cta }), icon('arrowRight', { size: 14 })])
  ])));
  const more = items.length > visible ? button(`Mostrar mais ${items.length - visible}`, { variant: 'ghost', size: 'sm', iconName: 'chevronDown', onClick: () => {
    for (const node of list.children) node.hidden = false;
    more.remove();
    list.children[visible]?.querySelector('a')?.focus();
  } }) : null;
  const body = items.length ? [list, more] : [emptyState({ title: 'Tudo em dia', text: ctx.can('create_rfq') ? 'Nenhuma aprovação, prazo ou renovação exige ação agora.' : 'Nenhuma aprovação aguarda você.', iconName: 'checkCircle', compact: true,
    action: ctx.can('create_rfq') ? linkButton('Nova solicitação', ctx.href('/finance/new-rfq.html'), { iconName: 'plus', size: 'sm' }) : null })];
  return { id: 'precisa-de-voce', title: 'Precisa de você', count: items.length || null, body, className: 'dm-attention' };
}

function summaryModule(ctx, model) {
  const { rfqs, approvals, contracts } = model;
  const active = rfqs.filter((rfq) => ACTIVE.includes(rfq.status));
  const proposals = rfqs.reduce((sum, rfq) => sum + (rfq.proposals || []).length, 0);
  const figures = [
    ['Concorrências ativas', active.length, ctx.href('/finance/rfqs.html')],
    ['Propostas recebidas', proposals, ctx.href('/finance/proposals.html')],
    ['Aguardando aprovação', approvals.filter((row) => row.status === 'pending').length, ctx.href('/finance/approvals.html')],
    ['Contratos vigentes', contracts.filter((row) => ['active', 'renewing'].includes(row.status)).length, ctx.href('/finance/contracts.html')]
  ];
  // Para quem aprova, o volume em jogo: soma dos valores pedidos, sem projeção.
  if (ctx.persona?.key === 'approver') {
    const credit = active.filter((rfq) => rfq.product === 'credit').reduce((sum, rfq) => sum + Number(rfq.demand?.amount || 0), 0);
    if (credit) figures.push(['Crédito em concorrência', money(credit, { compact: true }), ctx.href('/finance/rfqs.html?product=credit')]);
  }
  return { id: 'resumo', title: 'Em andamento', body: el('dl', { class: 'figures' }, figures.map(([label, value, href]) => el('div', { class: 'figure' }, [
    el('dt', {}, el('a', { href, text: label })), el('dd', { class: 'num', text: String(value) })]))) };
}

function pipelineModule(ctx, model) {
  const { rfqs } = model;
  const total = rfqs.length || 1;
  void total;
  // Fluxo do procurement com a contagem de cada etapa; cada etapa filtra a lista.
  const bar = el('ol', { class: 'flow', 'aria-label': 'Solicitações por etapa' }, PIPELINE.map(([status, label], index) => {
    const count = rfqs.filter((rfq) => rfq.status === status).length;
    return el('li', { class: `flow-step${count ? '' : ' is-empty'}`, dataset: { status } }, [
      index ? el('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, icon('chevronRight', { size: 14 })) : null,
      el('a', { href: ctx.href(`/finance/rfqs.html?status=${status}`), 'aria-label': `${label}: ${count}` }, [el('span', { class: 'flow-count num', text: String(count) }), el('span', { class: 'flow-label', text: label })])
    ]);
  }));
  const inFlight = rfqs.filter((rfq) => ACTIVE.includes(rfq.status)).sort((a, b) => String(a.response_deadline || '9999').localeCompare(String(b.response_deadline || '9999')));
  const list = moduleList(inFlight.map((rfq) => {
    const invited = (rfq.invites || []).length || rfq.invites_count || 0;
    const answered = (rfq.proposals || []).length;
    const days = daysUntil(rfq.response_deadline);
    return el('li', { class: 'dm-row dm-process' }, [
      el('span', { class: 'dm-row-main' }, [el('a', { class: 'dm-row-title stretched', href: ctx.href(`/finance/rfq.html?id=${rfq.id}`), text: rfq.title, ...quick('rfq', rfq.id) }),
        el('span', { class: 'dm-row-meta', text: `${productLabel(rfq.product, { short: true })} · ${demandHeadline(rfq)}` })]),
      pill(rfq.pending_approval ? { label: 'Em aprovação', tone: 'warning', icon: 'clock' } : RFQ_STATUS[rfq.status], { size: 'sm' }),
      progress(answered, Math.max(invited, answered), { label: `${answered} de ${invited} responderam` }),
      el('span', { class: `dm-row-side num${['open', 'collecting'].includes(rfq.status) && days !== null && days <= 2 ? ' is-urgent' : ''}`, text: deadlineText(rfq) })
    ]);
  }), emptyState({ title: 'Nenhuma concorrência em andamento', compact: true }));
  return { id: 'pipeline', title: 'Pipeline', subtitle: 'Concorrências em andamento, com prazo e respostas.', link: ['Solicitações', ctx.href('/finance/rfqs.html')], body: [bar, list] };
}

function recentRfqsModule(ctx, model) {
  const recent = [...model.rfqs].sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at))).slice(0, 5);
  return { id: 'recentes', title: 'Solicitações recentes', link: ['Todas', ctx.href('/finance/rfqs.html?sort=recent')],
    body: moduleList(recent.map((rfq) => row({ href: ctx.href(`/finance/rfq.html?id=${rfq.id}`), title: rfq.title, attrs: quick('rfq', rfq.id),
      meta: `${RFQ_STATUS[rfq.status]?.label || rfq.status} · atualizada ${timeAgo(rfq.updated_at || rfq.created_at)}`, side: el('span', { class: 'num', text: demandHeadline(rfq) }) })),
    emptyState({ title: 'Nenhuma solicitação ainda', compact: true, iconName: 'file' })) };
}

function approvalsModule(ctx, model) {
  const byId = new Map(model.rfqs.map((rfq) => [rfq.id, rfq]));
  const pending = model.approvals.filter((request) => request.status === 'pending');
  const rows = pending.map((request) => {
    const rfq = byId.get(request.rfq_id);
    if (!rfq) return null;
    const proposal = (rfq.proposals || []).find((item) => item.id === request.proposal_id);
    const step = currentStep(request);
    const mine = step?.approver_id === ctx.viewer?.id;
    const approved = (request.steps || []).filter((item) => item.status === 'approved').length;
    return el('li', { class: `dm-row dm-approval${mine ? ' is-mine' : ''}` }, [
      el('span', { class: 'dm-row-main' }, [
        el('a', { class: 'dm-row-title stretched', href: ctx.href(`/finance/approvals.html#request-${request.id}`), text: rfq.title }),
        el('span', { class: 'dm-row-meta', text: `${proposal?.provider_name || 'Proposta'} · ${demandHeadline(rfq)} · pedido por ${memberName(ctx.members, request.requested_by)} ${timeAgo(request.requested_at)}` }),
        request.rationale ? el('span', { class: 'dm-row-quote', text: `“${request.rationale}”` }) : null
      ]),
      el('span', { class: 'dm-row-side' }, [mine ? pill({ label: 'Aguardando você', tone: 'warning', icon: 'clock' }, { size: 'sm' }) : el('span', { class: 'muted small', text: `${approved} de ${(request.steps || []).length} aprovaram` })])
    ]);
  }).filter(Boolean);
  return { id: 'aprovacoes', title: 'Aprovações', count: pending.length || null, subtitle: 'Pedidos em andamento, com a justificativa de quem pediu.', link: ['Caixa de aprovação', ctx.href('/finance/approvals.html')],
    body: moduleList(rows, emptyState({ title: 'Nenhum pedido de aprovação em andamento', compact: true, iconName: 'checkCircle' })) };
}

function renewalsModule(ctx, model) {
  const rows = model.contracts.filter((contract) => ['active', 'renewing'].includes(contract.status)).map((contract) => ({ contract, stage: renewalStage(contract) }))
    .filter(({ stage }) => ['window', 'past_notice'].includes(stage.stage) || (stage.stage === 'upcoming' && stage.daysToDeadline <= 150))
    .sort((a, b) => a.stage.daysToDeadline - b.stage.daysToDeadline).slice(0, 5);
  return { id: 'renovacoes', title: 'Renovações', subtitle: 'Prazo que importa: o do aviso prévio.', link: ['Contratos', ctx.href('/finance/contracts.html')],
    body: moduleList(rows.map(({ contract, stage }) => {
      const urgent = ['window', 'past_notice'].includes(stage.stage);
      return row({ href: ctx.href(`/finance/contracts.html#contract-${contract.id}`), title: contract.provider_name, attrs: quick('contract', contract.id), iconName: urgent ? 'repeat' : 'calendar', tone: urgent ? 'warning' : 'neutral',
        meta: `${productLabel(contract.product, { short: true })} · ${stage.stage === 'past_notice' ? 'aviso prévio vencido' : urgent ? `decidir até ${formatDate(stage.deadline, { withYear: false })}` : `janela abre ${formatDate(stage.opensAt, { withYear: false })}`}`,
        side: el('span', { class: 'num', text: stage.stage === 'past_notice' ? `vence ${relativeDays(contract.ends_on)}` : relativeDays(stage.deadline) }), sideClass: urgent ? 'is-warn' : '' });
    }), emptyState({ title: 'Nenhuma renovação nos próximos meses', compact: true, iconName: 'calendar' })) };
}

function contractsModule(ctx, model) {
  const rows = model.contracts.filter((contract) => ['active', 'renewing'].includes(contract.status)).sort((a, b) => String(a.ends_on).localeCompare(String(b.ends_on)));
  return { id: 'contratos', title: 'Contratos vigentes', link: ['Contratos', ctx.href('/finance/contracts.html')],
    body: moduleList(rows.map((contract) => row({ href: ctx.href(`/finance/contracts.html#contract-${contract.id}`), title: contract.provider_name, attrs: quick('contract', contract.id),
      meta: `${productLabel(contract.product, { short: true })} · ${CONTRACT_STATUS[contract.status]?.label}`, side: el('span', { class: 'num', text: `até ${formatDate(contract.ends_on, { withYear: false })}` }) })),
    emptyState({ title: 'Nenhum contrato vigente', compact: true, iconName: 'briefcase' })) };
}

function tasksModule(ctx, model) {
  const tasks = (model.tasks || []).filter((task) => task.status !== 'done').slice(0, 5);
  const list = el('ul', { class: 'dm-list', role: 'list' });
  for (const task of tasks) {
    const days = daysUntil(task.due_on);
    const check = el('input', { type: 'checkbox', 'aria-label': `Concluir: ${task.title}` });
    const item = el('li', { class: 'dm-row dm-task' }, [check, el('span', { class: 'dm-row-main' }, [
      el('span', { class: 'dm-row-title', text: task.title }),
      el('span', { class: 'dm-row-meta', text: [task.assignee_name, task.due_on ? `prazo ${formatDate(task.due_on, { withYear: false })}` : 'sem prazo'].filter(Boolean).join(' · ') })
    ]), el('span', { class: `dm-row-side num${days !== null && days < 0 ? ' is-urgent' : ''}`, text: days === null ? '' : relativeDays(task.due_on) })]);
    check.addEventListener('change', async () => {
      check.disabled = true;
      try {
        await ctx.api('tasks', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, task_id: task.id, status: 'done' }) });
        item.classList.add('is-done');
        toast('Tarefa concluída.');
      } catch (error) { check.checked = false; check.disabled = false; toast(error.message, 'error'); }
    });
    list.append(item);
  }
  return { id: 'tarefas', title: 'Tarefas', link: ['Todas', ctx.href('/finance/tasks.html')], body: tasks.length ? list : emptyState({ title: 'Nenhuma tarefa aberta', compact: true, iconName: 'checkCircle' }) };
}

function activityModule(ctx, model) {
  const feed = el('ol', { class: 'activity' }, el('li', { class: 'muted small', text: 'Carregando…' }));
  ctx.api(`events?organization_id=${encodeURIComponent(ctx.organization.id)}`).then(({ rows }) => {
    feed.replaceChildren();
    const titles = new Map(model.rfqs.map((rfq) => [rfq.id, rfq.title]));
    for (const entry of (rows || []).slice(0, 7)) {
      feed.append(el('li', { class: 'activity-item' }, [el('span', { class: 'activity-dot', 'aria-hidden': 'true' }), el('span', { class: 'activity-text' }, [
        el('strong', { text: eventTitle(entry.event_type) }), ` · ${entry.metadata?.provider || titles.get(entry.entity_id) || ''}`.replace(/ · $/, '')]), el('time', { class: 'activity-time', datetime: entry.happened_at, text: timeAgo(entry.happened_at) })]));
    }
    if (!feed.children.length) feed.append(el('li', { class: 'muted small', text: 'Sem atividade recente.' }));
  }).catch(() => feed.replaceChildren(el('li', { class: 'muted small', text: 'Atividade indisponível no momento.' })));
  return { id: 'atividade', title: 'Atividade recente', body: feed };
}

function providersModule(ctx, model) {
  const participation = new Map();
  for (const rfq of model.rfqs) for (const invite of rfq.invites || []) {
    const last = participation.get(invite.provider_id);
    if (!last || String(invite.created_at) > String(last)) participation.set(invite.provider_id, invite.created_at);
  }
  const providers = [...(ctx.data.providers || [])].sort((a, b) => String(participation.get(b.id) || b.created_at).localeCompare(String(participation.get(a.id) || a.created_at))).slice(0, 5);
  return { id: 'provedores', title: 'Provedores recentes', link: ['Provedores', ctx.href('/finance/providers.html')],
    body: moduleList(providers.map((provider) => row({ href: ctx.href(`/finance/providers.html#provider-${provider.id}`), title: provider.name, attrs: quick('provider', provider.id),
      meta: `${PROVIDER_KINDS[provider.kind] || 'Provedor'} · ${provider.region || '—'}`, side: el('span', { class: 'muted small', text: participation.get(provider.id) ? `convidado ${timeAgo(participation.get(provider.id))}` : 'sem convites' }) })),
    emptyState({ title: 'Nenhum provedor cadastrado', compact: true, iconName: 'building' })) };
}

function favoritesModule(ctx) {
  const favorites = readState().favorites;
  const resolve = (entry) => {
    if (entry.type === 'rfq') { const rfq = (ctx.data.rfqs || []).find((item) => item.id === entry.id); return rfq && { title: rfq.title, meta: RFQ_STATUS[rfq.status]?.label, href: ctx.href(`/finance/rfq.html?id=${rfq.id}`), iconName: 'file' }; }
    if (entry.type === 'contract') { const contract = (ctx.data.contracts || []).find((item) => item.id === entry.id); return contract && { title: contract.provider_name, meta: `Contrato · ${CONTRACT_STATUS[contract.status]?.label}`, href: ctx.href(`/finance/contracts.html#contract-${contract.id}`), iconName: 'briefcase' }; }
    const provider = (ctx.data.providers || []).find((item) => item.id === entry.id);
    return provider && { title: provider.name, meta: PROVIDER_KINDS[provider.kind], href: ctx.href(`/finance/providers.html#provider-${provider.id}`), iconName: 'building' };
  };
  const rows = favorites.map((entry) => ({ entry, info: resolve(entry) })).filter(({ info }) => info);
  return { id: 'favoritos', title: 'Favoritos', body: moduleList(rows.map(({ entry, info }) => row({ href: info.href, title: info.title, meta: info.meta, iconName: info.iconName, attrs: quick(entry.type, entry.id) })),
    el('p', { class: 'dm-hint' }, [icon('star', { size: 14 }), el('span', { text: 'Marque solicitações, contratos e provedores como favoritos na quick view para vê-los aqui.' })])) };
}

function shortcutsModule(ctx) {
  const key = ctx.persona?.key;
  const sets = {
    buyer: [['Nova solicitação', '/finance/new-rfq.html', 'plus'], ['Propostas recebidas', '/finance/proposals.html', 'inbox'], ['Contratos e renovações', '/finance/contracts.html', 'briefcase'], ['Tarefas', '/finance/tasks.html', 'tasks']],
    approver: [['Caixa de aprovação', '/finance/approvals.html', 'checkCircle'], ['Solicitações em avaliação', '/finance/rfqs.html?status=comparing', 'scale'], ['Contratos', '/finance/contracts.html', 'briefcase']],
    admin: [['Equipe e papéis', '/finance/settings.html#equipe', 'users'], ['Política de aprovação', '/finance/settings.html#aprovacao', 'shield'], ['Perfil financeiro', '/finance/settings.html#perfil', 'layers'], ['Aparência', '/finance/settings.html#aparencia', 'sliders']]
  };
  const links = sets[key] || sets.buyer;
  return { id: 'atalhos', title: 'Acesso rápido', body: el('ul', { class: 'shortcut-grid', role: 'list' }, links.map(([label, path, iconName]) => el('li', {}, el('a', { class: 'shortcut', href: ctx.href(path) }, [el('span', { class: 'shortcut-icon' }, icon(iconName, { size: 16 })), el('span', { text: label }), icon('arrowRight', { size: 14, className: 'shortcut-arrow' })])))) };
}

function governanceModule(ctx) {
  const members = ctx.members || [];
  const byRole = new Map();
  for (const member of members) byRole.set(member.role, (byRole.get(member.role) || 0) + 1);
  const profile = ctx.data.profile || [];
  const stale = profile.filter((field) => -daysUntil(field.updated_at) >= 150);
  const policy = el('dd', { text: 'Carregando…' });
  ctx.api(`approval-policy?organization_id=${encodeURIComponent(ctx.organization.id)}`).then((result) => {
    policy.textContent = result.required_for_decision ? 'Obrigatória antes de decidir' : 'Opcional';
    policy.className = result.required_for_decision ? 'is-ok' : 'is-warn';
  }).catch(() => { policy.textContent = 'Indisponível'; });
  return { id: 'governanca', title: 'Governança', subtitle: 'Quem decide, com que regra e com que dados.', link: ['Configurações', ctx.href('/finance/settings.html')], body: [
    el('dl', { class: 'gov-grid' }, [
      el('div', { class: 'gov-item' }, [el('dt', {}, el('a', { href: ctx.href('/finance/settings.html#aprovacao'), text: 'Política de aprovação' })), policy]),
      el('div', { class: 'gov-item' }, [el('dt', {}, el('a', { href: ctx.href('/finance/settings.html#equipe'), text: 'Equipe' })),
        el('dd', { text: [...byRole].map(([role, count]) => `${count} ${ROLE_LABELS[role] || role}`).join(' · ') || '—' })]),
      el('div', { class: 'gov-item' }, [el('dt', {}, el('a', { href: ctx.href('/finance/settings.html#perfil'), text: 'Perfil financeiro' })),
        el('dd', { class: stale.length ? 'is-warn' : 'is-ok', text: stale.length ? `${stale.length} de ${profile.length} campos para revisar` : `${profile.length} campos atualizados` })])
    ]),
    stale.length ? el('p', { class: 'dm-hint' }, [icon('clock', { size: 14 }), el('span', { text: `Revisar: ${stale.slice(0, 3).map((field) => humanizeKey(field.field_key)).join(', ')}${stale.length > 3 ? '…' : ''}` })]) : null,
    el('ul', { class: 'avatar-stack', role: 'list', 'aria-label': 'Equipe' }, members.slice(0, 6).map((member) => el('li', { title: `${member.display_name} · ${ROLE_LABELS[member.role] || member.role}` }, avatar(member.display_name, { size: 'sm' }))))
  ] };
}

export const MODULES = Object.freeze({
  attention: { label: 'Precisa de você', render: attentionModule },
  summary: { label: 'Resumo', render: summaryModule },
  pipeline: { label: 'Pipeline', render: pipelineModule },
  'recent-rfqs': { label: 'Solicitações recentes', render: recentRfqsModule },
  approvals: { label: 'Aprovações', render: approvalsModule },
  renewals: { label: 'Renovações', render: renewalsModule },
  tasks: { label: 'Tarefas', render: tasksModule },
  contracts: { label: 'Contratos vigentes', render: contractsModule },
  activity: { label: 'Atividade recente', render: activityModule },
  providers: { label: 'Provedores recentes', render: providersModule },
  favorites: { label: 'Favoritos', render: favoritesModule },
  shortcuts: { label: 'Acesso rápido', render: shortcutsModule },
  governance: { label: 'Governança', render: governanceModule }
});

/** Layout efetivo: o salvo, completado com módulos novos (ocultos) e sem ids desconhecidos. */
export function resolveLayout(persona) {
  const base = DEFAULT_DASHBOARDS[persona] || DEFAULT_DASHBOARDS.buyer;
  const saved = dashboardLayout(persona);
  if (!saved) return { order: [...base.order], hidden: [...base.hidden], sizes: { ...base.sizes } };
  const order = saved.order.filter((id) => MODULES[id]);
  for (const id of Object.keys(MODULES)) if (!order.includes(id)) order.push(id);
  const hidden = saved.hidden.filter((id) => MODULES[id]);
  for (const id of Object.keys(MODULES)) if (!saved.order.includes(id) && !hidden.includes(id)) hidden.push(id);
  return { order, hidden, sizes: { ...saved.sizes } };
}
const sizeOf = (layout, id) => layout.sizes[id] || 'half';

// ------------------------------------------------------------------ painel
export async function dashboard(ctx) {
  const persona = ctx.persona?.key || 'buyer';
  const approvals = await ctx.loadApprovals();
  const items = actionItems(ctx, approvals);
  if (ctx.can('create_rfq')) {
    const editor = await ctx.api(`rfq-editor?organization_id=${encodeURIComponent(ctx.organization.id)}`).catch(() => null);
    const payload = editor?.draft?.payload;
    if (payload && (payload.title || payload.product)) {
      items.push({ rank: 2, tone: 'neutral', icon: 'edit', kind: 'Rascunho em edição', title: `Continuar: ${payload.title || 'nova solicitação sem título'}`,
        detail: `Salvo ${formatDateTime(editor.draft.updated_at)}. Ainda não foi criado nem enviado a provedores.`, cta: 'Continuar', href: ctx.href('/finance/new-rfq.html') });
      items.sort((a, b) => a.rank - b.rank || (Number.isFinite(a.due) ? a.due : 9999) - (Number.isFinite(b.due) ? b.due : 9999));
    }
  }
  const model = { items, approvals, rfqs: ctx.data.rfqs || [], contracts: ctx.data.contracts || [], tasks: ctx.data.tasks || [] };
  let layout = resolveLayout(persona);
  let editing = false;

  const now = new Date();
  const today = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const customize = button('Personalizar', { variant: 'ghost', iconName: 'layout', attrs: { id: 'customize-dashboard', 'aria-pressed': 'false' } });
  ctx.header({
    title: greeting(ctx.viewer?.name),
    subtitle: `${today} · ${ctx.organization.legal_name}`,
    actions: [customize, ctx.can('create_rfq') ? linkButton('Nova solicitação', ctx.href('/finance/new-rfq.html'), { variant: 'primary', iconName: 'plus' }) : null]
  });

  const root = el('div', { class: 'dash', id: 'dashboard', dataset: { persona } });
  const live = el('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const grid = el('div', { class: 'dash-modules' });
  const tray = el('section', { class: 'dash-tray', hidden: true, 'aria-labelledby': 'tray-title' });
  const editBar = el('div', { class: 'dash-editbar', hidden: true }, [
    el('p', { class: 'dash-editbar-text' }, [icon('layout', { size: 16 }), el('span', { text: 'Personalizando o painel. Arraste pela alça ou use as setas; as mudanças ficam salvas neste navegador.' })]),
    presetPicker(),
    el('div', { class: 'dash-editbar-actions' }, [
      button('Restaurar layout padrão', { variant: 'ghost', size: 'sm', iconName: 'refresh', attrs: { id: 'dashboard-reset' }, onClick: () => {
        resetDashboardLayout(persona);
        layout = resolveLayout(persona);
        draw();
        announce('Layout padrão restaurado.');
        toast('Layout padrão restaurado.', 'info');
      } }),
      button('Concluir', { variant: 'primary', size: 'sm', iconName: 'check', attrs: { id: 'dashboard-done' }, onClick: () => setEditing(false) })
    ])
  ]);

  function presetPicker() {
    const current = readState().appearance.preset;
    const group = el('div', { class: 'preset-picker', role: 'group', 'aria-label': 'Preset do workspace' });
    for (const key of PRESET_ORDER) {
      const option = el('button', { type: 'button', class: 'preset-option', 'aria-pressed': String(current === key), title: PRESETS[key].text, dataset: { preset: key }, text: PRESETS[key].label });
      option.addEventListener('click', () => {
        applyPreset(key);
        layout = resolveLayout(persona);
        for (const node of group.children) node.setAttribute('aria-pressed', String(node.dataset.preset === key));
        custom.hidden = true;
        draw();
        announce(`Preset ${PRESETS[key].label} aplicado.`);
        toast(`Workspace ${PRESETS[key].label.toLowerCase()} aplicado. Você ainda pode ajustar tudo.`, 'info');
      });
      group.append(option);
    }
    const custom = el('span', { class: 'preset-custom', hidden: current !== 'custom', text: 'Personalizado' });
    group.append(custom);
    return group;
  }
  const announce = (text) => { live.textContent = ''; requestAnimationFrame(() => { live.textContent = text; }); };
  const persist = () => saveDashboardLayout(persona, { order: layout.order, hidden: layout.hidden, sizes: layout.sizes });
  const visibleIds = () => layout.order.filter((id) => !layout.hidden.includes(id));

  function move(id, delta, { focus = 'up' } = {}) {
    const ids = visibleIds();
    const index = ids.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ids.length) return;
    const swapWith = ids[target];
    const order = [...layout.order];
    const a = order.indexOf(id);
    const b = order.indexOf(swapWith);
    [order[a], order[b]] = [order[b], order[a]];
    layout.order = order;
    persist();
    draw();
    announce(`${MODULES[id].label} movido para a posição ${target + 1} de ${ids.length}.`);
    const next = grid.querySelector(`[data-module="${id}"] [data-move="${focus}"]`);
    (next && !next.disabled ? next : grid.querySelector(`[data-module="${id}"] .dm-edit button:not([disabled])`))?.focus();
    grid.querySelector(`[data-module="${id}"]`)?.classList.add('is-moved');
  }
  function place(id, beforeId) {
    const order = layout.order.filter((item) => item !== id);
    const index = beforeId ? order.indexOf(beforeId) : order.length;
    order.splice(index < 0 ? order.length : index, 0, id);
    layout.order = order;
    persist();
    draw();
    announce(`${MODULES[id].label} movido para a posição ${visibleIds().indexOf(id) + 1}.`);
    grid.querySelector(`[data-module="${id}"]`)?.classList.add('is-moved');
  }
  function hide(id) {
    const ids = visibleIds();
    const neighbor = ids[ids.indexOf(id) + 1] || ids[ids.indexOf(id) - 1];
    layout.hidden = [...layout.hidden, id];
    persist();
    draw();
    announce(`${MODULES[id].label} ocultado. Ele fica disponível em “Módulos ocultos”.`);
    (grid.querySelector(`[data-module="${neighbor}"] .dm-edit button`) || tray.querySelector('button'))?.focus();
  }
  function show(id) {
    layout.hidden = layout.hidden.filter((item) => item !== id);
    persist();
    draw();
    announce(`${MODULES[id].label} exibido no painel.`);
    const node = grid.querySelector(`[data-module="${id}"]`);
    node?.classList.add('is-moved');
    node?.querySelector('.dm-edit button')?.focus();
  }
  function resize(id) {
    layout.sizes = { ...layout.sizes, [id]: sizeOf(layout, id) === 'full' ? 'half' : 'full' };
    persist();
    draw();
    announce(`${MODULES[id].label}: ${sizeOf(layout, id) === 'full' ? 'largura inteira' : 'meia largura'}.`);
    grid.querySelector(`[data-module="${id}"] [data-resize]`)?.focus();
  }

  function editControls(id, index, total) {
    const label = MODULES[id].label;
    const full = sizeOf(layout, id) === 'full';
    const handle = el('span', { class: 'dm-grip', title: 'Arraste para mover', 'aria-hidden': 'true' }, icon('grip', { size: 16 }));
    return el('div', { class: 'dm-edit', role: 'group', 'aria-label': `Organizar ${label}` }, [
      handle,
      el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Mover ${label} para cima`, title: 'Mover para cima', disabled: index === 0, dataset: { move: 'up' }, onclick: () => move(id, -1, { focus: 'up' }) }, icon('arrowUp', { size: 16 })),
      el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Mover ${label} para baixo`, title: 'Mover para baixo', disabled: index === total - 1, dataset: { move: 'down' }, onclick: () => move(id, 1, { focus: 'down' }) }, icon('arrowDown', { size: 16 })),
      el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Largura inteira: ${label}`, 'aria-pressed': String(full), title: full ? 'Usar meia largura' : 'Usar largura inteira', dataset: { resize: '' }, onclick: () => resize(id) }, icon('width', { size: 16 })),
      el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Ocultar ${label}`, title: 'Ocultar módulo', dataset: { hide: '' }, onclick: () => hide(id) }, icon('eyeOff', { size: 16 }))
    ]);
  }

  function renderModule(id, index, total) {
    let spec;
    try { spec = MODULES[id].render(ctx, model); } catch (error) { spec = { id, title: MODULES[id].label, body: emptyState({ title: 'Módulo indisponível', text: error.message, compact: true, iconName: 'alert' }) }; }
    const headingId = `module-${id}-title`;
    const section = el('section', { class: `dm dm-${sizeOf(layout, id)} ${spec.className || ''}`.trim(), id: spec.id, 'aria-labelledby': headingId, dataset: { module: id } }, [
      el('header', { class: 'dm-head' }, [
        el('h2', { class: 'dm-title', id: headingId }, [el('span', { text: spec.title }), spec.count ? el('span', { class: 'dm-count num', text: String(spec.count) }) : null]),
        spec.subtitle ? el('p', { class: 'dm-subtitle', text: spec.subtitle }) : null,
        spec.link ? el('a', { class: 'dm-link', href: spec.link[1] }, [el('span', { text: spec.link[0] }), icon('arrowRight', { size: 14 })]) : null,
        editing ? editControls(id, index, total) : null
      ]),
      el('div', { class: 'dm-body' }, spec.body)
    ]);
    if (editing) wireDrag(section, id);
    return section;
  }

  let dragged = null;
  function wireDrag(section, id) {
    const grip = section.querySelector('.dm-grip');
    grip.addEventListener('pointerdown', () => { section.draggable = true; });
    section.addEventListener('dragstart', (event) => {
      dragged = id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
      requestAnimationFrame(() => section.classList.add('is-dragging'));
    });
    section.addEventListener('dragend', () => { section.draggable = false; section.classList.remove('is-dragging'); dragged = null; for (const node of grid.querySelectorAll('.is-drop-target')) node.classList.remove('is-drop-target'); });
    section.addEventListener('dragover', (event) => {
      if (!dragged || dragged === id) return;
      event.preventDefault();
      for (const node of grid.querySelectorAll('.is-drop-target')) if (node !== section) node.classList.remove('is-drop-target');
      section.classList.add('is-drop-target');
    });
    section.addEventListener('dragleave', (event) => { if (!section.contains(event.relatedTarget)) section.classList.remove('is-drop-target'); });
    section.addEventListener('drop', (event) => {
      event.preventDefault();
      if (!dragged || dragged === id) return;
      const rect = section.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      const ids = visibleIds().filter((item) => item !== dragged);
      const anchor = after ? ids[ids.indexOf(id) + 1] || null : id;
      place(dragged, anchor);
    });
  }

  function draw() {
    const ids = visibleIds();
    grid.replaceChildren(...ids.map((id, index) => renderModule(id, index, ids.length)));
    const hiddenIds = layout.order.filter((id) => layout.hidden.includes(id));
    tray.replaceChildren(el('h2', { class: 'dash-tray-title', id: 'tray-title', text: 'Módulos ocultos' }),
      hiddenIds.length ? el('ul', { class: 'dash-tray-list', role: 'list' }, hiddenIds.map((id) => el('li', {}, button(MODULES[id].label, { size: 'sm', iconName: 'plus', attrs: { 'aria-label': `Exibir ${MODULES[id].label}` }, onClick: () => show(id) }))))
        : el('p', { class: 'muted small', text: 'Todos os módulos estão no painel.' }));
    tray.hidden = !editing;
  }
  function setEditing(on) {
    editing = on;
    root.dataset.editing = String(on);
    editBar.hidden = !on;
    customize.setAttribute('aria-pressed', String(on));
    customize.querySelector('.btn-label').textContent = on ? 'Personalizando…' : 'Personalizar';
    draw();
    if (on) { editBar.querySelector('button')?.focus(); announce('Modo de personalização. Use os botões de cada módulo para mover, redimensionar ou ocultar.'); }
    else { customize.focus(); announce('Painel salvo.'); if (location.hash === '#personalizar') history.replaceState(null, '', location.pathname + location.search); }
  }
  customize.addEventListener('click', () => setEditing(!editing));
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape' && editing && !event.defaultPrevented) { event.preventDefault(); setEditing(false); } });

  root.append(live, editBar, grid, tray);
  draw();
  if (location.hash === '#personalizar') queueMicrotask(() => setEditing(true));
  return root;
}

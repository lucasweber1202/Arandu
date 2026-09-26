// Painel: começa pelo que precisa da pessoa agora, não por números.

import { el, icon, daysUntil, relativeDays, formatDate, formatDateTime, productLabel, demandHeadline, RFQ_STATUS, timeAgo, money, renewalStage } from '../core.js';
import { card, pill, linkButton, emptyState, person, progress, button, toast } from '../ui.js';
import { memberName, currentStep, approvalSummaryLine, eventTitle } from './shared.js';

const PIPELINE = [['draft', 'Rascunho'], ['open', 'Aberta'], ['collecting', 'Em coleta'], ['comparing', 'Em avaliação'], ['decided', 'Decidida'], ['contracted', 'Contratada']];

export function greeting(name) {
  const hour = new Date().getHours();
  const period = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return name ? `${period}, ${name.split(' ')[0]}` : period;
}

/**
 * Itens de ação ordenados por urgência. Cada item diz o quê, por quê e leva
 * direto ao lugar certo — o painel nunca pede para a pessoa procurar.
 */
export function actionItems(ctx, approvals) {
  const data = ctx.data;
  const items = [];
  const rfqs = data.rfqs || [];
  const byId = new Map(rfqs.map((rfq) => [rfq.id, rfq]));
  const viewer = ctx.viewer?.id;
  const manage = ctx.can('create_rfq');

  for (const request of approvals) {
    const step = currentStep(request);
    const rfq = byId.get(request.rfq_id);
    if (!rfq) continue;
    if (step && step.approver_id === viewer) {
      items.push({ rank: 0, tone: 'warning', icon: 'checkCircle', kind: 'Aprovação',
        title: `Aprovar: ${rfq.title}`, detail: `Solicitado por ${memberName(ctx.members, request.requested_by)} · ${approvalSummaryLine(request)}`,
        when: request.requested_at ? timeAgo(request.requested_at) : '', cta: 'Revisar', href: ctx.href(`/finance/approvals.html#request-${request.id}`) });
    }
  }
  if (manage) {
    const latestByRfq = new Map();
    for (const request of approvals) if (!latestByRfq.has(request.rfq_id)) latestByRfq.set(request.rfq_id, request);
    for (const [rfqId, request] of latestByRfq) {
      const rfq = byId.get(rfqId);
      if (!rfq || !['collecting', 'comparing'].includes(rfq.status)) continue;
      if (['changes_requested', 'rejected'].includes(request.status)) {
        const actor = (request.steps || []).find((step) => step.status === request.status);
        items.push({ rank: 1, tone: 'danger', icon: 'edit', kind: 'Aprovação', title: `${request.status === 'rejected' ? 'Rejeitada' : 'Alterações pedidas'}: ${rfq.title}`,
          detail: actor?.comment ? `${memberName(ctx.members, actor.approver_id)}: “${actor.comment}”` : 'Revise e solicite nova aprovação.', cta: 'Ver motivo', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#aprovacoes`) });
      } else if (request.status === 'approved' && !rfq.decision_id && !request.stale) {
        items.push({ rank: 1, tone: 'success', icon: 'flag', kind: 'Decisão', title: `Registrar decisão: ${rfq.title}`,
          detail: 'Aprovação concluída. Falta registrar a escolha para seguir ao contrato.', cta: 'Registrar', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#decisao`) });
      }
    }
    for (const rfq of rfqs) {
      if (['open', 'collecting'].includes(rfq.status)) {
        const days = daysUntil(rfq.response_deadline);
        const invited = (rfq.invites || []).length || rfq.invites_count || 0;
        const answered = (rfq.proposals || []).length;
        if (days !== null && days >= 0 && days <= 7) {
          items.push({ rank: days <= 2 ? 1 : 2, due: days, tone: days <= 2 ? 'danger' : 'warning', icon: 'clock', kind: 'Prazo', title: `Encerra ${relativeDays(rfq.response_deadline)}: ${rfq.title}`,
            detail: `${answered} de ${invited || '—'} provedores responderam`, cta: 'Acompanhar', href: ctx.href(`/finance/rfq.html?id=${rfq.id}`) });
        } else if (days !== null && days < 0) {
          items.push({ rank: 1, due: days, tone: 'warning', icon: 'clock', kind: 'Prazo', title: `Prazo encerrado: ${rfq.title}`, detail: `${answered} proposta(s). Encerre a coleta para avaliar.`, cta: 'Avaliar', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#comparacao`) });
        }
        if (!invited) items.push({ rank: 2, tone: 'accent', icon: 'send', kind: 'Convites', title: `Convide provedores: ${rfq.title}`, detail: 'A solicitação está aberta, mas ninguém foi convidado.', cta: 'Convidar', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#visao-geral`) });
      }
      // Com pedido de aprovação em qualquer estado, a ação já aparece pela aprovação.
      if (rfq.status === 'comparing' && !rfq.pending_approval && !['pending', 'approved', 'changes_requested', 'rejected'].includes(latestByRfq.get(rfq.id)?.status)) {
        items.push({ rank: 2, tone: 'accent', icon: 'scale', kind: 'Avaliação', title: `Avaliar propostas: ${rfq.title}`, detail: `${(rfq.proposals || []).length} proposta(s) prontas para comparar`, cta: 'Comparar', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#comparacao`) });
      }
      if (rfq.status === 'decided') items.push({ rank: 2, tone: 'accent', icon: 'briefcase', kind: 'Contrato', title: `Registrar contrato: ${rfq.title}`, detail: 'Decisão registrada. Informe vigência e aviso prévio para acompanhar a renovação.', cta: 'Registrar', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#decisao`) });
      if (rfq.status === 'draft' && rfq.owner_id === viewer) items.push({ rank: 3, tone: 'neutral', icon: 'edit', kind: 'Rascunho', title: `Revisar e abrir: ${rfq.title}`, detail: 'Rascunho ainda não enviado a nenhum provedor.', cta: 'Abrir', href: ctx.href(`/finance/rfq.html?id=${rfq.id}`) });
    }
    for (const contract of data.contracts || []) {
      const stage = renewalStage(contract);
      if (stage.stage === 'window' && contract.status === 'active') {
        items.push({ rank: stage.daysToDeadline <= 7 ? 1 : 2, due: stage.daysToDeadline, tone: 'warning', icon: 'repeat', kind: 'Renovação', title: `Decidir renovação: ${contract.provider_name}`,
          detail: `${productLabel(contract.product, { short: true })} · aviso prévio ${relativeDays(stage.deadline)} (${formatDate(stage.deadline)}) · vence ${formatDate(contract.ends_on)}`, cta: 'Decidir', href: ctx.href(`/finance/contracts.html#contract-${contract.id}`) });
      } else if (stage.stage === 'past_notice') {
        items.push({ rank: 1, due: stage.daysToDeadline, tone: 'danger', icon: 'alert', kind: 'Renovação', title: `Aviso prévio vencido: ${contract.provider_name}`,
          detail: `Vence ${relativeDays(contract.ends_on)} (${formatDate(contract.ends_on)}). Negocie ou prepare a substituição.`, cta: 'Ver', href: ctx.href(`/finance/contracts.html#contract-${contract.id}`) });
      } else if (stage.stage === 'window' && contract.status === 'renewing') {
        items.push({ rank: 3, tone: 'accent', icon: 'repeat', kind: 'Renovação', title: `Renovação em andamento: ${contract.provider_name}`,
          detail: `Compare as propostas antes de ${formatDate(stage.deadline)}.`, cta: 'Acompanhar', href: ctx.href(`/finance/contracts.html#contract-${contract.id}`) });
      }
    }
  }
  for (const task of data.tasks || []) {
    const days = daysUntil(task.due_on);
    if (task.assignee_id && task.assignee_id !== viewer) continue;
    if (days !== null && days <= 2) items.push({ rank: days < 0 ? 1 : 3, due: days, tone: days < 0 ? 'danger' : 'neutral', icon: 'tasks', kind: 'Tarefa', title: task.title,
      detail: days < 0 ? `Vencida ${relativeDays(task.due_on)}` : `Prazo ${relativeDays(task.due_on)}`, cta: 'Ver', href: ctx.href(`/finance/tasks.html#task-${task.id}`) });
  }
  // Mesmo nível de prioridade: o que vence antes vem primeiro.
  const due = (item) => (Number.isFinite(item.due) ? item.due : 9999);
  return items.sort((a, b) => a.rank - b.rank || due(a) - due(b));
}

function actionRow(item) {
  return el('li', { class: `action-row tone-${item.tone}` }, [
    el('span', { class: 'action-icon' }, icon(item.icon, { size: 16 })),
    el('div', { class: 'action-text' }, [
      el('span', { class: 'action-kind', text: item.kind }),
      el('a', { class: 'action-title stretched', href: item.href, text: item.title }),
      el('span', { class: 'action-detail', text: item.detail })
    ]),
    item.when ? el('span', { class: 'action-when', text: item.when }) : null,
    el('span', { class: 'action-cta', 'aria-hidden': 'true' }, [el('span', { text: item.cta }), icon('chevronRight', { size: 14 })])
  ]);
}

export async function dashboard(ctx) {
  const data = ctx.data;
  const rfqs = data.rfqs || [];
  ctx.header({
    title: 'Painel',
    subtitle: `${greeting(ctx.viewer?.name)} · ${ctx.organization.legal_name}`,
    actions: ctx.can('create_rfq') ? [linkButton('Nova solicitação', ctx.href('/finance/new-rfq.html'), { variant: 'primary', iconName: 'plus' })] : []
  });
  const approvals = await ctx.loadApprovals();
  const items = actionItems(ctx, approvals);
  // Rascunho do assistente ainda não criado: sem isso, quem sai no meio só
  // reencontra o que digitou abrindo "Nova solicitação" por acaso.
  if (ctx.can('create_rfq')) {
    const editor = await ctx.api(`rfq-editor?organization_id=${encodeURIComponent(ctx.organization.id)}`).catch(() => null);
    const payload = editor?.draft?.payload;
    if (payload && (payload.title || payload.product)) {
      items.push({ rank: 2, tone: 'neutral', icon: 'edit', kind: 'Rascunho em edição', title: `Continuar: ${payload.title || 'nova solicitação sem título'}`,
        detail: `Salvo ${formatDateTime(editor.draft.updated_at)}. Ainda não foi criado nem enviado a provedores.`, cta: 'Continuar', href: ctx.href('/finance/new-rfq.html') });
      items.sort((a, b) => a.rank - b.rank || (Number.isFinite(a.due) ? a.due : 9999) - (Number.isFinite(b.due) ? b.due : 9999));
    }
  }

  const root = el('div', { class: 'dashboard' });
  const attention = el('section', { class: 'attention card', id: 'precisa-de-voce', 'aria-labelledby': 'attention-title' });
  attention.append(el('div', { class: 'card-head' }, [
    el('div', { class: 'card-head-text' }, [el('h2', { class: 'card-title', id: 'attention-title', text: 'Precisa de você' }),
      el('p', { class: 'card-subtitle', text: items.length ? `${items.length} ${items.length === 1 ? 'item pede' : 'itens pedem'} ação, do mais urgente ao menos urgente.` : 'Nada pendente com você agora.' })])
  ]));
  const list = el('ul', { class: 'action-list', role: 'list' }, items.slice(0, 8).map(actionRow));
  attention.append(items.length ? list : emptyState({ title: 'Tudo em dia', text: ctx.can('create_rfq') ? 'Nenhuma aprovação, prazo ou renovação exige ação. Que tal estruturar a próxima necessidade?' : 'Nenhuma aprovação aguarda você.', iconName: 'checkCircle',
    action: ctx.can('create_rfq') ? linkButton('Nova solicitação', ctx.href('/finance/new-rfq.html'), { iconName: 'plus' }) : null }));
  if (items.length > 8) attention.append(el('p', { class: 'card-foot muted', text: `+ ${items.length - 8} itens de menor prioridade nas listas de solicitações, contratos e tarefas.` }));

  // Resumo discreto: contagens reais, nenhuma estimativa de economia.
  const active = rfqs.filter((rfq) => ['open', 'collecting', 'comparing'].includes(rfq.status));
  const proposals = rfqs.reduce((sum, rfq) => sum + (rfq.proposals || []).length, 0);
  const contracts = (data.contracts || []).filter((row) => ['active', 'renewing'].includes(row.status));
  const summary = el('dl', { class: 'summary-strip', 'aria-label': 'Resumo' }, [
    ['Concorrências ativas', active.length], ['Propostas recebidas', proposals], ['Aguardando aprovação', approvals.filter((row) => row.status === 'pending').length], ['Contratos vigentes', contracts.length]
  ].map(([label, value]) => el('div', { class: 'summary-item' }, [el('dt', { text: label }), el('dd', { text: String(value) })])));

  // Pipeline clicável.
  const pipeline = el('ol', { class: 'pipeline', 'aria-label': 'Solicitações por etapa' });
  for (const [status, label] of PIPELINE) {
    const count = rfqs.filter((rfq) => rfq.status === status).length;
    pipeline.append(el('li', {}, el('a', { class: `pipeline-stage${count ? '' : ' empty'}`, href: ctx.href(`/finance/rfqs.html?status=${status}`) }, [
      el('span', { class: 'pipeline-count', text: String(count) }), el('span', { class: 'pipeline-label', text: label })
    ])));
  }
  const inFlight = rfqs.filter((rfq) => ['open', 'collecting', 'comparing'].includes(rfq.status))
    .sort((a, b) => String(a.response_deadline || '9999').localeCompare(String(b.response_deadline || '9999')));
  const processes = el('ul', { class: 'process-list', role: 'list' }, inFlight.map((rfq) => {
    const invited = (rfq.invites || []).length || rfq.invites_count || 0;
    return el('li', { class: 'process-row' }, [
      el('div', { class: 'process-main' }, [
        el('a', { class: 'process-title stretched', href: ctx.href(`/finance/rfq.html?id=${rfq.id}`), text: rfq.title }),
        el('span', { class: 'process-meta', text: `${productLabel(rfq.product, { short: true })} · ${demandHeadline(rfq)} · rev. ${rfq.revision || 1}` })
      ]),
      pill(RFQ_STATUS[rfq.status], { size: 'sm' }),
      progress((rfq.proposals || []).length, invited || (rfq.proposals || []).length, { label: `${(rfq.proposals || []).length} de ${invited} responderam` }),
      el('span', { class: `process-deadline${daysUntil(rfq.response_deadline) !== null && daysUntil(rfq.response_deadline) <= 2 ? ' urgent' : ''}`, text: rfq.response_deadline ? relativeDays(rfq.response_deadline) : 'sem prazo' })
    ]);
  }));
  const pipelineCard = card({ title: 'Concorrências em andamento', subtitle: 'Da abertura à avaliação, com prazo e respostas.',
    actions: [linkButton('Ver todas', ctx.href('/finance/rfqs.html'), { variant: 'ghost', size: 'sm', iconName: 'arrowRight' })],
    body: [pipeline, inFlight.length ? processes : emptyState({ title: 'Nenhuma concorrência em andamento', text: 'Solicitações abertas aparecem aqui com prazo e número de respostas.', compact: true })] });

  // Contratos: próximos marcos.
  const upcoming = contracts.sort((a, b) => String(a.review_from).localeCompare(String(b.review_from))).slice(0, 3);
  const contractList = el('ul', { class: 'mini-list', role: 'list' }, upcoming.map((contract) => {
    const days = daysUntil(contract.ends_on);
    const stage = renewalStage(contract);
    const inWindow = ['window', 'past_notice'].includes(stage.stage);
    return el('li', { class: 'mini-row' }, [
      el('span', { class: `mini-icon ${inWindow ? 'tone-warning' : 'tone-neutral'}` }, icon(inWindow ? 'repeat' : 'calendar', { size: 14 })),
      el('div', { class: 'mini-main' }, [
        el('a', { class: 'mini-title stretched', href: ctx.href(`/finance/contracts.html#contract-${contract.id}`), text: contract.provider_name }),
        el('span', { class: 'mini-meta', text: `${productLabel(contract.product, { short: true })} · ${stage.stage === 'past_notice' ? 'aviso prévio vencido' : inWindow ? `decidir até ${formatDate(stage.deadline, { withYear: false })}` : `janela abre ${formatDate(stage.opensAt, { withYear: false })}`}` })
      ]),
      el('span', { class: `mini-side${inWindow ? ' warn' : ''}`, text: days !== null ? `${days} dias` : '—' })
    ]);
  }));
  const contractsCard = card({ title: 'Contratos e renovações', actions: [linkButton('Contratos', ctx.href('/finance/contracts.html'), { variant: 'ghost', size: 'sm', iconName: 'arrowRight' })],
    body: upcoming.length ? contractList : emptyState({ title: 'Nenhum contrato vigente', text: 'Contratos registrados depois de uma decisão aparecem aqui com as datas de renovação.', compact: true }) });

  // Tarefas com conclusão rápida.
  const tasks = (data.tasks || []).slice(0, 5);
  const taskList = el('ul', { class: 'mini-list', role: 'list' });
  for (const task of tasks) {
    const days = daysUntil(task.due_on);
    const check = el('input', { type: 'checkbox', 'aria-label': `Concluir: ${task.title}` });
    check.addEventListener('change', async () => {
      check.disabled = true;
      try {
        await ctx.api('tasks', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, task_id: task.id, status: 'done' }) });
        row.classList.add('done');
        toast('Tarefa concluída.');
      } catch (error) { check.checked = false; check.disabled = false; toast(error.message, 'error'); }
    });
    const row = el('li', { class: 'mini-row task-row' }, [check, el('div', { class: 'mini-main' }, [
      el('span', { class: 'mini-title', text: task.title }),
      el('span', { class: 'mini-meta', text: [task.assignee_name, task.due_on ? `prazo ${formatDate(task.due_on, { withYear: false })}` : 'sem prazo'].filter(Boolean).join(' · ') })
    ]), el('span', { class: `mini-side${days !== null && days < 0 ? ' danger' : ''}`, text: days === null ? '' : relativeDays(task.due_on) })]);
    taskList.append(row);
  }
  const tasksCard = card({ title: 'Tarefas', actions: [linkButton('Todas', ctx.href('/finance/tasks.html'), { variant: 'ghost', size: 'sm', iconName: 'arrowRight' })],
    body: tasks.length ? taskList : emptyState({ title: 'Nenhuma tarefa aberta', compact: true, iconName: 'checkCircle' }) });

  // Atividade recente da organização.
  const feed = el('ol', { class: 'activity compact' }, el('li', { class: 'muted', text: 'Carregando…' }));
  ctx.api(`events?organization_id=${encodeURIComponent(ctx.organization.id)}`).then(({ rows }) => {
    feed.replaceChildren();
    const titles = new Map(rfqs.map((rfq) => [rfq.id, rfq.title]));
    for (const row of (rows || []).slice(0, 6)) {
      const label = eventTitle(row.event_type);
      feed.append(el('li', { class: 'activity-item' }, [el('span', { class: 'activity-dot', 'aria-hidden': 'true' }), el('span', { class: 'activity-text' }, [
        el('strong', { text: label }), ` · ${row.metadata?.provider || titles.get(row.entity_id) || ''}`.replace(/ · $/, '')]), el('time', { class: 'activity-time', datetime: row.happened_at, text: timeAgo(row.happened_at) })]));
    }
    if (!feed.children.length) feed.append(el('li', { class: 'muted', text: 'Sem atividade recente.' }));
  }).catch(() => feed.replaceChildren(el('li', { class: 'muted', text: 'Atividade indisponível no momento.' })));
  const activityCard = card({ title: 'Atividade recente', body: feed });

  root.append(attention, summary, el('div', { class: 'dash-grid' }, [
    el('div', { class: 'dash-main' }, [pipelineCard, activityCard]),
    el('div', { class: 'dash-side' }, [contractsCard, tasksCard])
  ]));
  if (!rfqs.length) root.prepend(firstUse(ctx));
  return root;
}

function firstUse(ctx) {
  const steps = [
    ['Complete os dados da empresa', 'CNPJ, setor e faixa de faturamento.', '/finance/settings.html', Boolean(ctx.data.organization?.sector)],
    ['Cadastre os provedores com quem fala', 'Bancos, fintechs e adquirentes.', '/finance/providers.html', (ctx.data.providers || []).length >= 1],
    ['Crie a primeira solicitação', 'Crédito empresarial ou adquirência.', '/finance/new-rfq.html', false]
  ];
  return card({ title: 'Primeiros passos', id: 'buyer-onboarding', subtitle: 'Três passos para a primeira concorrência.', body: el('ol', { class: 'onboarding' }, steps.map(([title, text, path, done]) =>
    el('li', { class: `onboarding-step${done ? ' done' : ''}` }, [el('span', { class: 'onboarding-mark' }, icon(done ? 'check' : 'arrowRight', { size: 14 })),
      el('span', {}, [el('a', { href: ctx.href(path), text: title }), el('span', { class: 'muted', text: ` — ${text}` })]), done ? el('span', { class: 'sr-only', text: '(concluído)' }) : null]))) });
}

export { money, person, button };

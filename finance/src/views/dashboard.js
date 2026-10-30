// Painel: começa pelo que precisa da pessoa agora, não por números.

import { el, icon, daysUntil, relativeDays, plural, formatDate, formatDateTime, productLabel, demandHeadline, RFQ_STATUS, timeAgo, money, renewalStage } from '../core.js';
import { card, pill, linkButton, emptyState, person, progress, button, toast } from '../ui.js';
import { memberName, currentStep, approvalSummaryLine, eventTitle, isViewerTurn, TASK_EDITORS, taskChangeError } from './shared.js';
import { loadEntities, entitySummaryCard } from './entities.js';
import { startButton } from './intake.js';

// Pendências visíveis antes de "Mostrar mais" (Constitution §1.3: uma próxima ação clara).
const FIRST_ITEMS = 5;
const FIRST_TASKS = 3;
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
    if (isViewerTurn(request, viewer)) {
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
          items.push({ rank: 1, due: days, tone: 'warning', icon: 'clock', kind: 'Prazo', title: `Prazo encerrado: ${rfq.title}`, detail: `${plural(answered, 'proposta', 'propostas')}. Encerre a coleta para avaliar.`, cta: 'Avaliar', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#comparacao`) });
        }
        if (!invited) items.push({ rank: 2, tone: 'accent', icon: 'send', kind: 'Convites', title: `Convide provedores: ${rfq.title}`, detail: 'A solicitação está aberta, mas ninguém foi convidado.', cta: 'Convidar', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#visao-geral`) });
      }
      // Com pedido de aprovação em qualquer estado, a ação já aparece pela aprovação.
      if (rfq.status === 'comparing' && !rfq.pending_approval && !['pending', 'approved', 'changes_requested', 'rejected'].includes(latestByRfq.get(rfq.id)?.status)) {
        items.push({ rank: 2, tone: 'accent', icon: 'scale', kind: 'Avaliação', title: `Avaliar propostas: ${rfq.title}`, detail: `${plural((rfq.proposals || []).length, 'proposta pronta', 'propostas prontas')} para comparar`, cta: 'Comparar', href: ctx.href(`/finance/rfq.html?id=${rfq.id}#comparacao`) });
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
  const contractsById = new Map((data.contracts || []).map((row) => [row.id, row]));
  // Leitor não conclui nem assume tarefa (fin_task_edit): tarefa sem responsável não é
  // "precisa de você" para ele. Só a que foi atribuída a ele aparece aqui.
  const worksTasks = TASK_EDITORS.includes(ctx.viewer?.role);
  for (const task of data.tasks || []) {
    const days = daysUntil(task.due_on);
    if (task.assignee_id && task.assignee_id !== viewer) continue;
    if (!task.assignee_id && !worksTasks) continue;
    // Tarefa de contrato diz de qual contrato é: "Obrigação: Dívida líquida"
    // sozinha não dizia com qual instituição.
    const contract = task.related_type === 'contract' ? contractsById.get(task.related_id) : null;
    const about = contract ? `${contract.provider_name || 'Contrato'} · ${productLabel(contract.product, { short: true })} · ` : '';
    // Tarefa sem responsável aparece para a equipe, mas não como se fosse de quem lê.
    const owner = task.assignee_id === viewer ? 'Com você · ' : 'Sem responsável · ';
    if (days !== null && days <= 2) items.push({ rank: days < 0 ? 1 : 3, due: days, taskId: task.id, tone: days < 0 ? 'danger' : 'neutral', icon: 'tasks', kind: 'Tarefa', title: task.title,
      detail: `${owner}${about}${days < 0 ? `Vencida ${relativeDays(task.due_on)}` : `Prazo ${relativeDays(task.due_on)}`}`, cta: 'Ver', href: ctx.href(`/finance/tasks.html#task-${task.id}`) });
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
    // Entrada por objetivo: um único primário; cada intenção leva ao fluxo existente.
    actions: [button('Consultas', { iconName: 'search', attrs: { 'data-intent': 'consultas' }, onClick: () => import('./guided-queries.js').then((m) => m.openGuidedQueries(ctx)) }), startButton(ctx)].filter(Boolean)
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
      el('p', { class: 'card-subtitle', text: items.length ? `${items.length} ${items.length === 1 ? 'item pede' : 'itens pedem'} ação, do mais urgente ao menos urgente.` : ctx.approvalsError ? 'Parte das pendências não carregou.' : 'Nada pendente com você agora.' })])
  ]));
  // Poucas pendências à vista; o restante continua inteiro na mesma lista,
  // aberto sob demanda — nada some, só deixa de competir com o mais urgente.
  // Tarefas soltas não escondem o passo de um processo (aprovação, prazo,
  // renovação): no máximo FIRST_TASKS delas entram no bloco visível.
  const shown = [];
  let shownTasks = 0;
  for (const item of items) {
    if (shown.length >= FIRST_ITEMS) break;
    if (item.kind === 'Tarefa') { if (shownTasks >= FIRST_TASKS) continue; shownTasks += 1; }
    shown.push(item);
  }
  const hidden = items.filter((item) => !shown.includes(item));
  const list = el('ul', { class: 'action-list', role: 'list' }, shown.map(actionRow));
  const rest = hidden.length ? el('details', { class: 'action-more' }, [
    el('summary', { text: `Mostrar mais ${plural(hidden.length, 'pendência', 'pendências')}` }),
    el('ul', { class: 'action-list', role: 'list' }, hidden.map(actionRow))]) : null;
  // Aprovações que não carregaram não podem virar "Tudo em dia".
  const approvalsMissing = ctx.approvalsError ? el('p', { class: 'callout callout-warning compact', role: 'alert' }, [icon('alert'),
    el('span', { text: 'Não conseguimos carregar as aprovações agora; pode haver pedido aguardando você. ' }),
    el('a', { href: ctx.href('/finance/approvals.html'), text: 'Abrir Aprovações' })]) : null;
  if (approvalsMissing) attention.append(approvalsMissing);
  attention.append(items.length ? el('div', {}, [list, rest].filter(Boolean)) : approvalsMissing ? el('p', { class: 'muted small', text: 'Os demais itens (prazos, renovações e tarefas) não pedem ação agora.' }) : emptyState({ title: 'Tudo em dia', text: ctx.can('create_rfq') ? 'Nenhuma aprovação, prazo ou renovação exige ação. Que tal estruturar a próxima necessidade?' : 'Nenhuma aprovação aguarda você.', iconName: 'checkCircle',
    action: ctx.can('create_rfq') ? linkButton('Nova solicitação', ctx.href('/finance/new-rfq.html'), { iconName: 'plus' }) : null }));

  // Resumo discreto: contagens reais, nenhuma estimativa de economia.
  const active = rfqs.filter((rfq) => ['open', 'collecting', 'comparing'].includes(rfq.status));
  const proposals = rfqs.reduce((sum, rfq) => sum + (rfq.proposals || []).length, 0);
  const contracts = (data.contracts || []).filter((row) => ['active', 'renewing'].includes(row.status));
  // Cada contagem leva à lista que a explica: número sem consequência não entra (Constitution §2).
  const summary = el('dl', { class: 'summary-strip', 'aria-label': 'Resumo' }, [
    ['Concorrências ativas', active.length, '/finance/rfqs.html'], ['Propostas recebidas', proposals, '/finance/proposals.html'],
    ['Aguardando aprovação', approvals.filter((row) => row.status === 'pending').length, '/finance/approvals.html'], ['Contratos vigentes', contracts.length, '/finance/contracts.html']
  ].map(([label, value, path]) => el('div', { class: 'summary-item' }, [el('dt', { text: label }), el('dd', {}, el('a', { class: 'summary-link', href: ctx.href(path), text: String(value), 'aria-label': `${label}: ${value}. Abrir lista` }))])));

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
      // Prazo de resposta só é urgência enquanto a coleta está aberta; em
      // avaliação, "há 3 dias" em vermelho sugeria atraso que não existe.
      rfq.status === 'comparing'
        ? el('span', { class: 'process-deadline', text: 'coleta encerrada' })
        : el('span', { class: `process-deadline${daysUntil(rfq.response_deadline) !== null && daysUntil(rfq.response_deadline) <= 2 ? ' urgent' : ''}`, text: rfq.response_deadline ? relativeDays(rfq.response_deadline) : 'sem prazo' })
    ]);
  }));
  const pipelineCard = card({ title: 'Concorrências em andamento', subtitle: 'Da abertura à avaliação, com prazo e respostas.',
    actions: [linkButton('Ver todas', ctx.href('/finance/rfqs.html'), { variant: 'ghost', size: 'sm', iconName: 'arrowRight' })],
    body: [inFlight.length ? processes : emptyState({ title: 'Nenhuma concorrência em andamento', text: 'Solicitações abertas aparecem aqui com prazo e número de respostas.', compact: true }),
      // Contagem por etapa é consulta, não tarefa: fica sob demanda.
      el('details', { class: 'pipeline-more' }, [el('summary', { text: 'Ver solicitações por etapa' }), pipeline])] });

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
        el('span', { class: 'mini-meta', text: `${productLabel(contract.product, { short: true })} · ${stage.stage === 'past_notice' ? 'aviso prévio vencido' : inWindow ? `decidir até ${formatDate(stage.deadline, { withYear: 'auto' })}` : `janela abre ${formatDate(stage.opensAt, { withYear: 'auto' })}`}` })
      ]),
      // Mesma conta e mesmo texto da página Contratos ("vence em N dias"): um
      // número solto ao lado de "decidir até" lia como prazo da decisão.
      el('span', { class: `mini-side${inWindow ? ' warn' : ''}`, text: days === null ? '—' : days === 0 ? 'vence hoje' : days === 1 ? 'vence amanhã' : days < 0 ? 'vencido' : `vence em ${days} dias` })
    ]);
  }));
  const contractsCard = card({ title: 'Contratos e renovações', actions: [linkButton('Contratos', ctx.href('/finance/contracts.html'), { variant: 'ghost', size: 'sm', iconName: 'arrowRight' })],
    // Primeiro valor (§35.10): contrato que a empresa já tem entra sem concorrência.
    body: upcoming.length ? contractList : emptyState({ title: 'Nenhum contrato vigente', text: 'Registre um contrato que a empresa já tem ou feche uma concorrência: vencimento, aviso prévio e renovação passam a ser acompanhados aqui.', compact: true,
      action: ctx.can('create_rfq') ? linkButton('Registrar contrato existente', ctx.href('/finance/contracts.html?acao=registrar-contrato'), { size: 'sm', iconName: 'plus' }) : null }) });

  // Tarefas com conclusão rápida. O que já está em "Precisa de você" não se repete aqui.
  const listed = new Set(items.map((item) => item.taskId).filter(Boolean));
  const tasks = (data.tasks || []).filter((task) => !listed.has(task.id)).slice(0, 5);
  const taskList = el('ul', { class: 'mini-list', role: 'list' });
  // Mesma regra do banco (fin_task_edit): leitor acompanha, não conclui.
  const canEdit = TASK_EDITORS.includes(ctx.viewer?.role);
  for (const task of tasks) {
    const days = daysUntil(task.due_on);
    const check = canEdit ? el('input', { type: 'checkbox', 'aria-label': `Concluir: ${task.title}` }) : null;
    check?.addEventListener('change', async () => {
      check.disabled = true;
      row.setAttribute('aria-busy', 'true');
      try {
        await ctx.api('tasks', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, task_id: task.id, status: 'done' }) });
        // Desde #206 o 200 confirma a linha gravada; sem alteração a API devolve 404 (tratado abaixo).
        row.classList.add('done');
        toast('Tarefa concluída.');
      } catch (error) {
        check.checked = false; check.disabled = false;
        toast(taskChangeError(error), 'error');
      } finally { row.removeAttribute('aria-busy'); }
    });
    const row = el('li', { class: 'mini-row task-row' }, [check || el('span', { class: 'mini-icon tone-neutral' }, icon('tasks', { size: 14 })), el('div', { class: 'mini-main' }, [
      el('span', { class: 'mini-title', text: task.title }),
      el('span', { class: 'mini-meta', text: [task.assignee_id ? task.assignee_name || 'Responsável indisponível' : 'Sem responsável', task.due_on ? `prazo ${formatDate(task.due_on, { withYear: false })}` : 'sem prazo'].filter(Boolean).join(' · ') })
    ]), el('span', { class: `mini-side${days !== null && days < 0 ? ' danger' : ''}`, text: days === null ? '' : relativeDays(task.due_on) })]);
    taskList.append(row);
  }
  const tasksCard = card({ title: listed.size ? 'Outras tarefas' : 'Tarefas', actions: [linkButton('Todas', ctx.href('/finance/tasks.html'), { variant: 'ghost', size: 'sm', iconName: 'arrowRight' })],
    body: tasks.length ? taskList : emptyState({ title: listed.size ? 'Nenhuma outra tarefa aberta' : 'Nenhuma tarefa aberta', text: listed.size ? 'As tarefas com prazo próximo estão em "Precisa de você".' : undefined, compact: true, iconName: 'checkCircle' }) });

  // Atividade recente da organização.
  const feed = el('ol', { class: 'activity compact' }, el('li', { class: 'muted', text: 'Carregando…' }));
  // Histórico é nível 4: só é buscado quando a pessoa abre a seção.
  const loadFeed = () => ctx.api(`events?organization_id=${encodeURIComponent(ctx.organization.id)}`).then(({ rows }) => {
    feed.replaceChildren();
    // Contexto legível do objeto: título da solicitação ou instituição do contrato.
    const titles = new Map([...rfqs.map((rfq) => [rfq.id, rfq.title]), ...(data.contracts || []).map((contract) => [contract.id, contract.provider_name || contract.title])]);
    // Eventos iguais em sequência (ex.: várias regras versionadas) viram uma linha com contagem.
    const groups = [];
    for (const row of rows || []) {
      const last = groups.at(-1);
      if (last && last.row.event_type === row.event_type && last.row.entity_id === row.entity_id) last.count += 1;
      else groups.push({ row, count: 1 });
    }
    for (const { row, count } of groups.slice(0, 6)) {
      const label = eventTitle(row.event_type);
      // metadata.provider só é nome de instituição em eventos de proposta/convite;
      // em extração é o extrator técnico e nunca aparece na tela.
      const providerEvent = /^(proposal_|provider_invited|invite_accepted)/.test(row.event_type);
      const context = (providerEvent && row.metadata?.provider) || titles.get(row.entity_id) || '';
      feed.append(el('li', { class: 'activity-item' }, [el('span', { class: 'activity-dot', 'aria-hidden': 'true' }), el('span', { class: 'activity-text' }, [
        el('strong', { text: label }), count > 1 ? ` (${count})` : '', context ? ` · ${context}` : '']), el('time', { class: 'activity-time', datetime: row.happened_at, text: timeAgo(row.happened_at) })]));
    }
    if (!feed.children.length) feed.append(el('li', { class: 'muted', text: 'Sem atividade recente.' }));
  }).catch(() => feed.replaceChildren(el('li', { class: 'muted', text: 'Atividade indisponível no momento.' })));
  const activity = el('details', { class: 'card activity-disclosure', id: 'atividade' }, [
    el('summary', { class: 'card-title', text: 'Atividade recente da empresa' }), feed]);
  let feedLoaded = false;
  activity.addEventListener('toggle', () => { if (activity.open && !feedLoaded) { feedLoaded = true; loadFeed(); } });
  const activityCard = activity;

  // Consolidado por entidade: só aparece quando o grupo tem entidades.
  const entities = await loadEntities(ctx);
  const entityCard = entities.rows.length ? entitySummaryCard(ctx) : null;
  // Inteligência de valor só no produto real (a demo não simula esses SoR);
  // carregada sob demanda para não pesar no bundle do Painel.
  const valueCard = ctx.mode === 'demo' ? null : await import('./executive.js').then((m) => m.executiveSection(ctx, entities)).catch(() => null);
  root.append(attention, summary, el('div', { class: 'dash-grid' }, [
    // Trabalho antes de painel (Constitution §1.3, guideline §35.8): processos,
    // renovações e tarefas vêm antes dos indicadores de portfólio. No celular a
    // coluna lateral desce: a inteligência de valor fica depois dela, em largura
    // total, para não empurrar renovações e tarefas para o fim da página.
    el('div', { class: 'dash-main' }, [entityCard, pipelineCard, activityCard].filter(Boolean)),
    el('div', { class: 'dash-side' }, [contractsCard, tasksCard])
  ]), ...[valueCard].filter(Boolean));
  if (!rfqs.length) root.prepend(firstUse(ctx));
  return root;
}

function firstUse(ctx) {
  const steps = [
    ['Complete os dados da empresa', 'CNPJ, setor e faixa de faturamento.', '/finance/settings.html', Boolean(ctx.data.organization?.sector)],
    ['Cadastre os provedores com quem fala', 'Bancos, fintechs e adquirentes.', '/finance/providers.html', (ctx.data.providers || []).length >= 1],
    // Valor antes da primeira proposta: o que a empresa já tem passa a ter prazo e próxima ação.
    ['Registre um contrato que já existe', 'O Arandu acompanha vencimento, aviso prévio e renovação.', '/finance/contracts.html?acao=registrar-contrato', (ctx.data.contracts || []).length >= 1],
    ['Crie a primeira solicitação', 'Crédito empresarial ou adquirência.', '/finance/new-rfq.html', false]
  ];
  // Os quatro passos são de gestão (o servidor recusa a quem só lê). Quem
  // acompanha não recebe uma lista de ações impossíveis: lê quem faz e onde
  // acompanhar o que já existe.
  if (!ctx.can('create_rfq')) {
    const known = [['Contratos registrados', (ctx.data.contracts || []).length, '/finance/contracts.html'], ['Instituições cadastradas', (ctx.data.providers || []).length, '/finance/providers.html']];
    return card({ title: 'Primeiros passos', id: 'buyer-onboarding', subtitle: 'A empresa ainda não abriu nenhuma solicitação no Arandu.', body: [
      el('p', { class: 'prose', text: 'Cadastrar instituições, registrar contratos existentes e abrir solicitações fica com administradores e gestores financeiros. Sua conta acompanha o que eles registram e responde ao que for atribuído a você.' }),
      el('ul', { class: 'onboarding' }, known.map(([title, count, path]) => el('li', { class: 'onboarding-step' }, [el('span', { class: 'onboarding-mark' }, icon('eye', { size: 14 })),
        el('span', {}, [el('a', { href: ctx.href(path), text: title }), el('span', { class: 'muted', text: count ? ` — ${count} na lista carregada` : ' — nenhum ainda' })])])))
    ] });
  }
  return card({ title: 'Primeiros passos', id: 'buyer-onboarding', subtitle: 'Comece pelo que a empresa já tem e chegue à primeira concorrência.', body: el('ol', { class: 'onboarding' }, steps.map(([title, text, path, done]) =>
    el('li', { class: `onboarding-step${done ? ' done' : ''}` }, [el('span', { class: 'onboarding-mark' }, icon(done ? 'check' : 'arrowRight', { size: 14 })),
      el('span', {}, [el('a', { href: ctx.href(path), text: title }), el('span', { class: 'muted', text: ` — ${text}` })]), done ? el('span', { class: 'sr-only', text: '(concluído)' }) : null]))) });
}

export { money, person, button };

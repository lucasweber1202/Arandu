/* global __ARANDU_DEMO__ */
// Plano de renovações: contratos vigentes organizados pelo prazo do aviso
// prévio, com o que já existe para agir em cada um — responsável, renovação em
// andamento, tarefas abertas — e duas ações reais: abrir/iniciar a concorrência
// de renovação (rota canônica, idempotente no servidor) e registrar uma tarefa
// de preparação ligada ao contrato (POST tasks com chave de idempotência).
//
// Datas vêm do contrato (fim e aviso prévio). Sem data, o contrato aparece
// como "sem data para planejar" — nunca como tranquilo. Nada aqui é risco,
// recomendação ou renovação executada.

import { el, icon, formatDate, relativeDays, productLabel, plural, renewalStage, textSpan } from '../../core.js';
import { button, confirmDialog, mutedText, tag, toast } from '../../ui.js';
import { renewalButton } from './renewal.js';
import { memberName } from '../shared/people.js';
import { sequence, pagerFooter, sectionError, partialNote, queryString } from '../shared/operational.js';

const LIVE = new Set(['active', 'renewing']);
const HORIZON_DAYS = 180;
const BUCKETS = [
  ['past_notice', 'Aviso prévio vencido', 'O prazo para avisar a instituição já passou; confira o contrato antes de agir.'],
  ['soon', 'Decidir em até 30 dias', 'Prazo do aviso prévio nos próximos 30 dias.'],
  ['window', 'Janela de renovação aberta', 'Prazo do aviso prévio em mais de 30 dias.'],
  ['upcoming', `Próximos ${HORIZON_DAYS / 30} meses`, 'A janela ainda não abriu.'],
  ['expired', 'Fim da vigência já passou', 'Contrato vigente no cadastro, mas com fim no passado: confirme a situação.'],
  ['undated', 'Sem data para planejar', 'Falta fim de vigência no cadastro; o prazo do aviso não pode ser calculado.']
];

/** Em qual grupo do plano um contrato vigente entra (ou null se fora do horizonte). Exportada para teste. */
export function renewalBucket(contract) {
  if (!LIVE.has(contract.status)) return null;
  if (!contract.ends_on) return 'undated';
  const stage = renewalStage(contract);
  if (stage.stage === 'expired') return 'expired';
  if (stage.stage === 'past_notice') return 'past_notice';
  // Sem aviso prévio registrado não há data-limite: o término decide o grupo, sem "decidir em até 30 dias".
  const days = stage.noticeKnown ? stage.daysToDeadline : stage.daysToEnd;
  if (stage.stage === 'window') return stage.noticeKnown && days <= 30 ? 'soon' : 'window';
  if (stage.stage === 'upcoming' && days <= HORIZON_DAYS) return 'upcoming';
  return null;
}

/** Estado do ciclo de vida exibido no plano. Uma concorrência aberta não renova o contrato. Exportada para teste. */
export function renewalLifecycle(contract) {
  if (contract.status === 'renewing') return { key: 'renewing', label: 'Renovação iniciada', hint: 'Concorrência de renovação aberta; o contrato atual continua vigente até um novo contrato ser registrado.' };
  return { key: 'active', label: 'Vigente', hint: 'Contrato vigente sem renovação iniciada.' };
}

/** Filtra contratos do plano por responsável, estado, entidade e texto. Exportada para teste. */
export function filterRenewalPlan(contracts, { owner = '', stage = '', entity = '', query = '' } = {}, viewerId = null) {
  const q = String(query || '').trim().toLocaleLowerCase('pt-BR');
  return contracts.filter((c) => LIVE.has(c.status)
    && (owner !== 'mine' || c.owner_id === viewerId) && (owner !== 'none' || !c.owner_id)
    && (!stage || renewalLifecycle(c).key === stage)
    && (!entity || (entity === 'group' ? !c.legal_entity_id : c.legal_entity_id === entity))
    && (!q || `${c.provider_name || ''} ${c.title || ''}`.toLocaleLowerCase('pt-BR').includes(q)));
}

/**
 * Tarefa de preparação ligada ao contrato (POST tasks com chave de
 * idempotência). Resultado incerto mantém a chave: conferir reenvia a mesma
 * solicitação, sem duplicar. Não inicia concorrência nem avisa a instituição.
 */
export function prepareTaskButton(ctx, contract, deadline, onCreated) {
  let pending = null;
  const action = button('Registrar tarefa de preparação', { size: 'sm', variant: 'ghost', iconName: 'plus', onClick: async () => {
    if (!pending) {
      const ok = await confirmDialog({ title: 'Registrar tarefa de preparação?', confirmLabel: 'Registrar tarefa',
        description: `Cria uma tarefa ligada a este contrato${deadline ? `, com prazo no fim do aviso prévio (${formatDate(deadline)})` : ''}. Não inicia concorrência, não avisa a instituição e não altera o contrato.` });
      if (!ok) return;
      pending = { idempotency_key: crypto.randomUUID(), organization_id: ctx.organization.id, related_type: 'contract', related_id: contract.id,
        title: `Preparar renovação: ${contract.provider_name || 'contrato'} · ${productLabel(contract.product, { short: true })}`, due_on: deadline || null };
    }
    action.disabled = true;
    try {
      const data = await ctx.send('tasks', pending);
      if (!data.row?.id) throw Object.assign(new Error('Não confirmamos o registro da tarefa.'), { status: 0, code: 'task_creation_unknown' });
      pending = null;
      onCreated?.(data.row);
      toast('Tarefa registrada no contrato.');
      action.remove();
    } catch (error) {
      const unknown = !error.status || error.status >= 500 || error.code === 'task_creation_unknown';
      if (unknown) {
        toast('Não confirmamos o registro. "Conferir registro" reenvia a mesma solicitação e não cria outra tarefa.', 'error');
        action.querySelector('.btn-label').textContent = 'Conferir registro';
      } else { pending = null; toast(error.message || 'A tarefa não foi registrada.', 'error'); }
      action.disabled = false;
    }
  } });
  return action;
}

export function renewalWorkbench(ctx, contracts, { coverage = { state: 'complete' }, entities = null } = {}) {
  const manage = ctx.can('create_rfq');
  const sandbox = __ARANDU_DEMO__ && ctx.mode === 'demo';
  const tasks = ctx.data.tasks || [];
  // A visão geral traz até 100 tarefas abertas: além disso, a contagem é parcial.
  const tasksPartial = tasks.length >= 100;
  const openTasks = new Map();
  for (const task of tasks) if (task.related_type === 'contract' && task.status === 'open') openTasks.set(task.related_id, (openTasks.get(task.related_id) || 0) + 1);
  const memberName = (id) => (ctx.members || []).find((m) => m.user_id === id)?.display_name || null;

  const owner = el('select', { class: 'input', 'aria-label': 'Plano de renovações: responsável' }, [
    new Option('Qualquer responsável', ''), new Option('Meus contratos', 'mine'), new Option('Sem responsável', 'none')]);
  const stageSelect = el('select', { class: 'input', 'aria-label': 'Plano de renovações: estado' }, [
    new Option('Qualquer estado', ''), new Option('Vigente, sem renovação iniciada', 'active'), new Option('Renovação iniciada', 'renewing')]);
  const entityRows = entities?.rows || [];
  const entitySelect = entityRows.length ? el('select', { class: 'input', 'aria-label': 'Plano de renovações: entidade jurídica' }, [
    new Option('Qualquer entidade', ''), new Option('Nível de grupo', 'group'),
    ...entityRows.map((e) => new Option(`${e.depth ? '— ' : ''}${e.short_name || e.legal_name || 'Entidade'}`, e.id))]) : null;
  const search = el('input', { class: 'input', type: 'search', placeholder: 'Instituição ou contrato', 'aria-label': 'Plano de renovações: buscar instituição ou contrato' });
  // Busca vinda de outra tela (ex.: Relationship 360 → ?plano_busca=<instituição>).
  search.value = new URLSearchParams(location.search).get('plano_busca') || '';
  const entityLabel = (id) => !entities ? null : !id ? 'Nível de grupo' : (entities.byId?.get(id)?.short_name || entities.byId?.get(id)?.legal_name || 'Entidade sem acesso de leitura');
  const body = el('div', { class: 'stack renewal-plan' });
  const created = new Map(); // tarefas confirmadas nesta tela, por contrato

  const taskAction = (contract, deadline, countNode) => manage && !sandbox ? prepareTaskButton(ctx, contract, deadline, () => {
    created.set(contract.id, (created.get(contract.id) || 0) + 1);
    countNode.replaceWith(taskCount(contract));
  }) : null;

  function taskCount(contract) {
    // Encontradas na leitura da visão geral + confirmadas agora pelo servidor.
    // Sem nenhuma: "não encontrada" só quando a leitura cobre todas as abertas.
    const found = openTasks.get(contract.id) || 0, fresh = created.get(contract.id) || 0, n = found + fresh;
    return el('a', { class: 'renewal-tasks small', href: ctx.href(`/finance/tasks.html?contrato=${encodeURIComponent(contract.id)}`),
      text: n ? `${plural(n, 'tarefa aberta', 'tarefas abertas')}${fresh ? ` (${fresh} registrada${fresh > 1 ? 's' : ''} agora)` : ''}${tasksPartial ? ' · pode haver mais' : ''}`
        : tasksPartial ? 'Tarefas do contrato (leitura parcial)' : 'Nenhuma tarefa aberta encontrada' });
  }

  function row(contract) {
    const stage = renewalStage(contract);
    const deadline = contract.ends_on && stage.noticeKnown ? stage.deadline : null;
    const who = contract.owner_id ? memberName(contract.owner_id) || 'Responsável sem acesso de leitura' : null;
    const count = taskCount(contract);
    return el('li', { class: 'renewal-row', dataset: { contract: contract.id } }, [
      el('div', { class: 'renewal-main' }, [
        el('a', { class: 'renewal-title', href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${contract.id}`), text: `${contract.provider_name || 'Instituição'} · ${contract.title || productLabel(contract.product, { short: true })}` }),
        el('span', { class: 'row-sub', text: deadline ? `Aviso prévio até ${formatDate(deadline)} (${relativeDays(deadline)}) · fim ${formatDate(contract.ends_on)}` : contract.ends_on ? `Data-limite do aviso desconhecida · fim ${formatDate(contract.ends_on)} (${relativeDays(contract.ends_on)})` : 'Fim de vigência não cadastrado' }),
        el('span', { class: 'renewal-meta' }, [
          who ? textSpan(`Responsável: ${who}`) : tag('Sem responsável', 'warning'),
          tag(renewalLifecycle(contract).label, contract.status === 'renewing' ? 'accent' : 'neutral'),
          entityLabel(contract.legal_entity_id) ? textSpan(`Entidade: ${entityLabel(contract.legal_entity_id)}`) : null,
          !stage.noticeKnown && contract.ends_on ? tag('Aviso prévio não cadastrado', 'warning') : null,
          count
        ].filter(Boolean))
      ]),
      el('div', { class: 'renewal-actions' }, [renewalButton(ctx, contract), taskAction(contract, deadline, count)].filter(Boolean))
    ]);
  }

  function draw() {
    const scoped = filterRenewalPlan(contracts, { owner: owner.value, stage: stageSelect.value, entity: entitySelect?.value || '', query: search.value }, ctx.viewer?.id);
    const grouped = new Map(BUCKETS.map(([key]) => [key, []]));
    let later = 0;
    for (const contract of scoped) {
      const key = renewalBucket(contract);
      if (key) grouped.get(key).push(contract); else later += 1;
    }
    for (const list of grouped.values()) list.sort((a, b) => String(renewalStage(a).deadline || a.ends_on || '9999').localeCompare(String(renewalStage(b).deadline || b.ends_on || '9999')));
    const groups = BUCKETS.filter(([key]) => grouped.get(key).length).map(([key, label, hint]) => el('section', { class: `renewal-group renewal-${key}`, id: `renewal-group-${key}`, 'aria-label': label }, [
      el('h3', { class: 'renewal-group-title' }, [textSpan(label), el('span', { class: 'chip-count', text: String(grouped.get(key).length) })]),
      mutedText(hint), el('ul', { class: 'renewal-list', role: 'list' }, grouped.get(key).map(row))]));
    const nav = groups.length > 1 ? el('nav', { class: 'toolbar-chips renewal-jump', 'aria-label': 'Ir para grupo do plano' },
      BUCKETS.filter(([key]) => grouped.get(key).length).map(([key, label]) => el('a', { class: 'chip', href: `#renewal-group-${key}`, text: `${label} · ${grouped.get(key).length}` }))) : null;
    body.replaceChildren(...[
      nav,
      ...(groups.length ? groups : [mutedText(scoped.length ? `Nenhum contrato vigente com prazo de aviso nos próximos ${HORIZON_DAYS / 30} meses neste recorte.` : 'Nenhum contrato vigente neste recorte.')]),
      later ? mutedText(`${plural(later, 'contrato vigente tem', 'contratos vigentes têm')} aviso prévio depois de ${HORIZON_DAYS / 30} meses e não entra no plano.`) : null,
      coverage.state !== 'complete' ? el('p', { class: 'callout callout-warning compact', role: 'note' }, [icon('alert', { size: 14 }), textSpan('O plano usa só os contratos carregados nesta tela; a carteira completa não foi lida.')]) : null,
      mutedText('Iniciar uma concorrência não renova o contrato: ele segue vigente até um novo contrato ser registrado no cadastro.'),
      tasksPartial ? mutedText('Contagem de tarefas a partir das 100 tarefas abertas mais próximas; abra as tarefas do contrato para ver todas.') : null
    ].filter(Boolean));
  }
  for (const control of [owner, stageSelect, entitySelect].filter(Boolean)) control.addEventListener('change', draw);
  search.addEventListener('input', draw);
  draw();
  return el('section', { class: 'renewal-workbench', id: 'plano-renovacoes', 'aria-labelledby': 'plano-renovacoes-title' }, [
    el('div', { class: 'card-head' }, [el('div', { class: 'card-head-text' }, [
      el('h2', { class: 'card-title', id: 'plano-renovacoes-title', text: 'Plano de renovações' }),
      el('p', { class: 'card-subtitle', text: 'Contratos vigentes pelo prazo do aviso prévio, com responsável, renovação em andamento e tarefas. Datas do cadastro do contrato.' })])]),
    el('div', { class: 'toolbar renewal-filters' }, [search, owner, stageSelect, entitySelect].filter(Boolean)),
    el('div', { class: 'card-body' }, body)
  ]);
}

// ------------------------------------------------- operação no servidor (10.1)
// Com servidor real, o plano lê GET renewal-operations: filtros, urgência,
// prazos e vínculos (tarefas, marcos, concorrências de renovação) vêm do banco
// com cursor estável. O cálculo local acima continua apenas no sandbox legado.

const URGENCY_LABELS = {
  expired: ['Vencido', 'danger', 'Fim da vigência já passou ou o contrato está encerrado.'],
  notice_due: ['Aviso prévio no prazo', 'warning', 'O prazo do aviso prévio chegou ou passou.'],
  renewing: ['Renovação em andamento', 'accent', 'Concorrência de renovação aberta; o contrato atual segue vigente até um novo ser registrado.'],
  upcoming: ['A vencer', 'neutral', 'Aviso prévio ainda no futuro.']
};
const PLAN_PARAMS = { owner: 'plano_dono', urgency: 'plano_urgencia', legal_entity_id: 'plano_entidade', due_from: 'plano_de', due_to: 'plano_ate' };

/** Situação do responsável sem confundir ausência com atribuição. Exportada para teste. */
export function ownerStatusText(row, name) {
  if (row.owner_status === 'member_unavailable') return 'Responsável cadastrado não é mais membro da organização';
  if (row.owner_status === 'unassigned' || !row.owner_id) return 'Sem responsável';
  return `Responsável: ${name || 'membro sem nome visível'}`;
}

/** Lê os filtros do plano da URL (recuperação de contexto). Exportada para teste. */
export function planFiltersFromUrl(search) {
  const params = new URLSearchParams(search);
  return Object.fromEntries(Object.entries(PLAN_PARAMS).map(([key, param]) => [key, params.get(param) || '']));
}

export function renewalOperations(ctx, { entities = null, contracts = [], fallback = null } = {}) {
  const byId = new Map(contracts.map((c) => [c.id, c]));
  const filters = planFiltersFromUrl(location.search);
  const state = { rows: [], page: null, coverage: null, loading: false, error: null };
  const reads = sequence();
  const body = el('div', { class: 'stack renewal-plan' });

  const select = (label, options, key) => {
    const node = el('select', { class: 'input', 'aria-label': `Plano de renovações: ${label}` }, options.map(([text, value]) => new Option(text, value)));
    node.value = filters[key];
    node.addEventListener('change', () => { filters[key] = node.value; persist(); load(); });
    return node;
  };
  const owner = select('responsável', [['Qualquer responsável', ''], ...(ctx.viewer?.id ? [['Comigo', ctx.viewer.id]] : []), ['Sem responsável válido', 'none']], 'owner');
  if (filters.owner === 'mine' && ctx.viewer?.id) { filters.owner = ctx.viewer.id; owner.value = ctx.viewer.id; }
  const urgency = select('urgência', [['Qualquer urgência', ''], ...Object.entries(URGENCY_LABELS).map(([key, [label]]) => [label, key])], 'urgency');
  const entityRows = entities?.rows || [];
  const entity = entityRows.length ? select('entidade jurídica', [['Qualquer entidade', ''], ...entityRows.map((e) => [`${e.depth ? '— ' : ''}${e.short_name || e.legal_name || 'Entidade'}`, e.id])], 'legal_entity_id') : null;
  const dateInput = (label, key) => {
    const node = el('input', { class: 'input', type: 'date', 'aria-label': `Plano de renovações: ${label}` });
    node.value = filters[key];
    node.addEventListener('change', () => { filters[key] = node.value; persist(); load(); });
    return node;
  };
  const from = dateInput('aviso prévio a partir de', 'due_from');
  const to = dateInput('aviso prévio até', 'due_to');
  const search = el('input', { class: 'input', type: 'search', placeholder: 'Instituição ou contrato (itens carregados)', 'aria-label': 'Plano de renovações: buscar entre os contratos carregados' });
  search.value = new URLSearchParams(location.search).get('plano_busca') || '';
  search.addEventListener('input', draw);

  function persist() {
    const params = new URLSearchParams(location.search);
    for (const [key, param] of Object.entries(PLAN_PARAMS)) { if (filters[key]) params.set(param, key === 'owner' && filters[key] === ctx.viewer?.id ? 'mine' : filters[key]); else params.delete(param); }
    const query = params.toString();
    history.replaceState(history.state, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
  }

  async function load({ append = false } = {}) {
    const token = reads.next();
    state.loading = true; state.error = null;
    if (!append) { state.rows = []; state.page = null; state.coverage = null; }
    draw();
    try {
      if (filters.due_from && filters.due_to && filters.due_from > filters.due_to) throw Object.assign(new Error('A data inicial do aviso prévio é posterior à final.'), { status: 400 });
      const data = await ctx.api(`renewal-operations?${queryString({ organization_id: ctx.organization.id, limit: 25, ...filters, cursor: append ? state.page?.next_cursor : null })}`);
      if (!reads.isCurrent(token)) return;
      const seen = new Set(state.rows.map((row) => row.id));
      state.rows = [...state.rows, ...(data.rows || []).filter((row) => !seen.has(row.id))];
      state.page = data.page || null; state.coverage = data.coverage || null;
      toolbar.hidden = false;
    } catch (error) {
      if (!reads.isCurrent(token)) return;
      if (error.status !== 503) toolbar.hidden = false;
      // Modo degradado: serviço ausente neste ambiente (schema do Arandu 10 não
      // aplicado = 503). O plano local sobre os contratos carregados volta, com
      // aviso explícito de que não é a carteira lida pelo servidor.
      if (error.status === 503 && !append && fallback && !Object.values(filters).some(Boolean)) { section.replaceWith(fallback()); return; }
      state.error = error;
    }
    state.loading = false;
    draw();
  }

  const entityLabel = (id) => !entities ? null : !id ? 'Nível de grupo' : (entities.byId?.get(id)?.short_name || entities.byId?.get(id)?.legal_name || 'Entidade sem acesso de leitura');
  const enrichment = () => state.coverage?.enrichment || {};
  const partial = (key) => enrichment()[key] && enrichment()[key].complete === false;

  function row(item) {
    const known = byId.get(item.id) || {};
    const contract = { ...known, ...item, provider_name: known.provider_name };
    const [label, tone, hint] = URGENCY_LABELS[item.urgency] || ['Situação não informada', 'neutral', ''];
    const contractHref = ctx.href(`/finance/contracts.html?abrir=contrato#contract-${item.id}`);
    const links = [
      ...(item.renewal_rfqs || []).map((rfq) => el('a', { href: ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}&contrato=${encodeURIComponent(item.id)}`), text: `Concorrência de renovação: ${rfq.title || 'sem título'} (${RFQ_LABEL[rfq.status] || 'situação não informada'})` })),
      item.history?.source_rfq_id ? el('a', { href: ctx.href(`/finance/rfq.html?id=${encodeURIComponent(item.history.source_rfq_id)}`), text: 'Concorrência de origem' }) : null,
      item.history?.parent_contract_id ? el('a', { href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${item.history.parent_contract_id}`), text: 'Contrato anterior' }) : null,
      el('a', { href: contractHref, text: 'Histórico do contrato' })
    ].filter(Boolean);
    const tasks = item.tasks || [], milestones = item.milestones || [];
    const nextMilestone = milestones.find((m) => m.status !== 'done' && m.status !== 'completed');
    const canStart = item.actions?.can_start_renewal && ['active', 'renewing'].includes(item.status);
    return el('li', { class: 'renewal-row', dataset: { contract: item.id, urgency: item.urgency } }, [
      el('div', { class: 'renewal-main' }, [
        el('a', { class: 'renewal-title', href: contractHref, text: `${contract.provider_name || 'Instituição'} · ${item.title || productLabel(item.product, { short: true })}` }),
        el('span', { class: 'row-sub', text: [
          item.notice_on ? `Aviso prévio ${formatDate(item.notice_on)} (${relativeDays(item.notice_on)})` : 'Aviso prévio não cadastrado',
          item.ends_on ? `fim ${formatDate(item.ends_on)}${Number.isFinite(item.days_to_end) ? ` · ${item.days_to_end >= 0 ? `${item.days_to_end} dia(s) restantes` : `encerrado há ${-item.days_to_end} dia(s)`}` : ''}` : 'fim não cadastrado'
        ].join(' · ') }),
        el('span', { class: 'renewal-meta' }, [
          tag(label, tone),
          item.owner_status === 'assigned' ? textSpan(ownerStatusText(item, memberName(ctx.members, item.owner_id))) : tag(ownerStatusText(item), 'warning'),
          entityLabel(item.legal_entity_id) ? textSpan(`Entidade: ${entityLabel(item.legal_entity_id)}`) : null,
          el('a', { class: 'small', href: ctx.href(`/finance/tasks.html?contrato=${encodeURIComponent(item.id)}`), text: tasks.length ? `${plural(tasks.length, 'tarefa aberta', 'tarefas abertas')}${partial('tasks') ? ' · pode haver mais' : ''}` : partial('tasks') ? 'Tarefas: leitura parcial' : 'Nenhuma tarefa vinculada encontrada' }),
          nextMilestone ? textSpan(`Próximo marco: ${nextMilestone.title || 'marco'}${nextMilestone.due_on ? ` em ${formatDate(nextMilestone.due_on)}` : ''}`) : partial('milestones') ? textSpan('Marcos: leitura parcial') : null
        ].filter(Boolean)),
        hint ? mutedText(hint) : null,
        el('nav', { class: 'renewal-links small', 'aria-label': 'Registros vinculados' }, links)
      ].filter(Boolean)),
      el('div', { class: 'renewal-actions' }, [canStart ? renewalButton(ctx, contract) : null,
        ctx.can('create_rfq') && ['active', 'renewing'].includes(item.status) ? prepareTaskButton(ctx, contract, item.notice_on || null, () => load()) : null].filter(Boolean))
    ]);
  }

  function draw() {
    const q = search.value.trim().toLocaleLowerCase('pt-BR');
    const visible = q ? state.rows.filter((item) => `${byId.get(item.id)?.provider_name || ''} ${item.title || ''}`.toLocaleLowerCase('pt-BR').includes(q)) : state.rows;
    const content = state.error ? [sectionError(state.error, () => load())]
      : state.loading && !state.rows.length ? [el('p', { class: 'muted small', role: 'status', text: 'Carregando plano…' })]
      : !visible.length ? [mutedText(q && state.rows.length ? 'Nenhum contrato carregado corresponde à busca.' : 'Nenhum contrato neste recorte.')]
      : [el('ul', { class: 'renewal-list', role: 'list' }, visible.map(row))];
    const partialSources = ['tasks', 'milestones', 'renewal_links'].filter(partial);
    body.replaceChildren(...[
      ...content,
      partialSources.length ? partialNote('Vínculos lidos até o limite por página (tarefas, marcos ou concorrências). Ausência aqui não significa que o registro não existe: confira no contrato.') : null,
      q && state.page?.has_more ? mutedText('A busca considera apenas os contratos já carregados.') : null,
      state.error ? null : pagerFooter({ shown: state.rows.length, page: state.page, coverage: state.coverage, loading: state.loading, onMore: () => load({ append: true }) }),
      mutedText('Iniciar uma concorrência não renova o contrato: ele segue vigente até um novo contrato ser registrado. Nenhuma negociação ou mensagem à instituição é enviada automaticamente.')
    ].filter(Boolean));
  }

  // Filtros só aparecem depois da primeira resposta do servidor: se ela for 503
  // e o plano cair no modo local, nenhum controle do plano do servidor fica visível.
  const toolbar = el('div', { class: 'toolbar renewal-filters', hidden: true }, [search, owner, urgency, entity, from, to].filter(Boolean));
  const section = el('section', { class: 'renewal-workbench', id: 'plano-renovacoes', 'aria-labelledby': 'plano-renovacoes-title' }, [
    el('div', { class: 'card-head' }, [el('div', { class: 'card-head-text' }, [
      el('h2', { class: 'card-title', id: 'plano-renovacoes-title', text: 'Plano de renovações' }),
      el('p', { class: 'card-subtitle', text: 'Contratos vigentes, em renovação ou vencidos, ordenados pelo aviso prévio. Datas, urgência e vínculos calculados pelo servidor.' })])]),
    toolbar,
    el('div', { class: 'card-body' }, body)
  ]);
  load();
  return section;
}
const RFQ_LABEL = { draft: 'rascunho', open: 'aberta', collecting: 'em coleta', comparing: 'em avaliação', decided: 'decidida', contracted: 'contratada', closed: 'encerrada', cancelled: 'cancelada' };

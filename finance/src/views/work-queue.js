// Caixa de trabalho (Executive Action Center, Arandu 10.1): consome a API
// canônica work-intelligence, uma seção por chamada e cursor independente.
//
// Não há sistema paralelo de tarefas: as linhas são tarefas, pedidos de
// aprovação, rascunhos de demanda e contratos do banco, sob RLS. Contagens são
// sempre desta página (coverage.total = null): nunca anunciamos total da
// carteira. Ações levam ao comando canônico; a presença na fila não autoriza
// nada — o servidor reconfere tudo, e aprovação só é votada no detalhe.

import { el, formatDate, relativeDays, productLabel, timeAgo, textSpan, textStrong } from '../core.js';
import { button, mutedText, tag, toast } from '../ui.js';
import { memberName } from './shared/people.js';
import { sequence, operationalError, pagerFooter, sectionError, queryString } from './shared/operational.js';

export const WORK_SECTIONS = [
  ['tasks', 'Tarefas', 'Tarefas abertas, das mais próximas do prazo.'],
  ['approvals', 'Aprovações', 'Pedidos pendentes. Votar exige abrir o pedido: lá as etapas e a autorização são conferidas.'],
  ['demands', 'Demandas', 'Rascunhos de demanda e o que falta para ficarem prontos.'],
  ['contracts', 'Contratos', 'Contratos vencidos, com aviso prévio no prazo ou em renovação.']
];
const URGENCY = { expired: ['Vencido', 'danger'], notice_due: ['Aviso prévio no prazo', 'warning'], renewing: ['Em renovação', 'accent'], upcoming: ['A vencer', 'neutral'] };
const OWNER_FILTERS = new Set(['tasks', 'demands', 'contracts']);

/** Por que o item merece atenção, só com fatos da linha. Exportada para teste. */
export function workReason(section, row, today = new Date().toISOString().slice(0, 10)) {
  if (section === 'tasks') {
    if (row.overdue) return `Prazo vencido em ${formatDate(row.due_on)}`;
    if (row.unassigned) return 'Sem responsável';
    return row.due_on ? (row.due_on === today ? 'Vence hoje' : `Prazo ${formatDate(row.due_on)}`) : 'Sem prazo definido';
  }
  if (section === 'approvals') {
    if (row.context_coverage === 'incomplete' || row.freshness === 'unknown') return 'Contexto não pôde ser conferido';
    if (row.stale) return 'Desatualizado: precisa ser pedido de novo';
    if (row.expired) return 'Prazo do pedido expirado';
    return 'Aguardando decisão';
  }
  if (section === 'demands') {
    const r = row.readiness;
    if (!r) return 'Prontidão não informada';
    if (r.ready) return 'Campos obrigatórios preenchidos';
    const n = r.coverage?.missing ?? r.missing_fields?.length ?? 0;
    return n ? `${n} campo(s) obrigatório(s) faltando` : 'Há campos com valor inválido';
  }
  if (section === 'contracts') {
    if (row.owner_status === 'member_unavailable') return 'Responsável não é mais membro da organização';
    if (row.urgency === 'expired') return 'Fim da vigência já passou';
    if (row.urgency === 'notice_due') return 'Prazo de aviso prévio atingido';
    if (row.urgency === 'renewing') return 'Renovação em andamento';
    return 'A vencer';
  }
  return '';
}

/** Rota de destino do item, preservando o identificador canônico. Exportada para teste. */
export function workHref(section, row) {
  if (section === 'tasks') return row.related_type === 'contract' && row.related_id ? `/finance/contracts.html?abrir=contrato#contract-${row.related_id}`
    : row.related_type === 'rfq' && row.related_id ? `/finance/rfq.html?id=${row.related_id}` : `/finance/tasks.html#task-${row.id}`;
  if (section === 'approvals') return `/finance/approvals.html#request-${row.id}`;
  if (section === 'demands') return `/finance/rfq.html?id=${row.id}#prontidao`;
  if (section === 'contracts') return `/finance/contracts.html?abrir=contrato#contract-${row.id}`;
  return '/finance/dashboard.html';
}

export function workQueue(ctx) {
  const rfqTitles = new Map((ctx.data.rfqs || []).map((rfq) => [rfq.id, rfq.title]));
  const contracts = new Map((ctx.data.contracts || []).map((c) => [c.id, c]));
  const states = Object.fromEntries(WORK_SECTIONS.map(([key]) => [key, { rows: [], page: null, coverage: null, loading: false, error: null, loaded: false, owner: '', seq: sequence() }]));
  let active = WORK_SECTIONS[0][0];
  const panel = el('div', { class: 'work-panel', role: 'tabpanel', id: 'work-panel', tabindex: '-1' });
  const tabList = el('div', { class: 'work-tabs toolbar-chips', role: 'tablist', 'aria-label': 'Seções da caixa de trabalho' });

  async function load(key, { append = false } = {}) {
    const state = states[key];
    const token = state.seq.next();
    state.loading = true; state.error = null;
    if (!append) { state.rows = []; state.page = null; }
    if (key === active) draw();
    try {
      const data = await ctx.api(`work-intelligence?${queryString({ organization_id: ctx.organization.id, section: key, limit: 20,
        owner: state.owner === 'mine' ? ctx.viewer?.id : state.owner, cursor: append ? state.page?.next_cursor : null })}`);
      if (!state.seq.isCurrent(token)) return;
      const seen = new Set(state.rows.map((row) => row.id));
      state.rows = [...state.rows, ...(data.rows || []).filter((row) => !seen.has(row.id))];
      state.page = data.page || null; state.coverage = data.coverage || null; state.loaded = true;
    } catch (error) {
      if (!state.seq.isCurrent(token)) return;
      state.error = error;
    }
    state.loading = false;
    if (key === active) draw();
  }

  async function assign(task, trigger) {
    trigger.disabled = true;
    try {
      await ctx.send('tasks', { organization_id: ctx.organization.id, task_id: task.id, assignee_id: ctx.viewer.id }, 'PATCH');
      toast('Tarefa assumida.');
      load('tasks');
    } catch (error) { toast(operationalError(error), 'error'); trigger.disabled = false; }
  }

  function rowNode(key, row) {
    const href = ctx.href(workHref(key, row));
    let title, sub, tags = [], actions = [];
    if (key === 'tasks') {
      title = row.title || 'Tarefa';
      sub = `${row.assignee_id ? `Responsável: ${memberName(ctx.members, row.assignee_id)}` : 'Sem responsável'}${row.due_on ? ` · prazo ${formatDate(row.due_on)} (${relativeDays(row.due_on)})` : ''}`;
      if (row.overdue) tags.push(tag('Atrasada', 'danger'));
      if (row.unassigned && row.actions?.can_edit && ctx.viewer?.id) actions.push(button('Assumir', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `Assumir ${title}` }, onClick: (event) => assign(row, event.currentTarget) }));
    } else if (key === 'approvals') {
      title = rfqTitles.get(row.rfq_id) || 'Pedido de aprovação';
      sub = `Pedido por ${memberName(ctx.members, row.requested_by)} ${timeAgo(row.requested_at)}${row.proposal_version ? ` · proposta v${row.proposal_version}` : ''}${row.expires_at ? ` · expira ${formatDate(row.expires_at)}` : ''}`;
      if (row.stale || row.context_coverage === 'incomplete') tags.push(tag(row.context_coverage === 'incomplete' ? 'Contexto inconclusivo' : 'Desatualizado', 'warning'));
    } else if (key === 'demands') {
      title = row.title || 'Demanda sem título';
      sub = `${productLabel(row.product, { short: true })} · ${row.owner_id ? `responsável ${memberName(ctx.members, row.owner_id)}` : 'sem responsável'} · alterada ${timeAgo(row.updated_at)}`;
      tags.push(row.readiness?.ready ? tag('Pronta para publicar', 'success') : tag('Incompleta', 'warning'));
    } else {
      const c = contracts.get(row.id);
      title = `${c?.provider_name || 'Instituição'} · ${row.title || productLabel(row.product, { short: true })}`;
      sub = `${row.notice_on ? `Aviso prévio ${formatDate(row.notice_on)} (${relativeDays(row.notice_on)})` : 'Aviso prévio não cadastrado'} · fim ${row.ends_on ? formatDate(row.ends_on) : 'não cadastrado'} · ${row.owner_status === 'assigned' ? `responsável ${memberName(ctx.members, row.owner_id)}` : row.owner_status === 'member_unavailable' ? 'responsável sem acesso à organização' : 'sem responsável'}`;
      const [label, tone] = URGENCY[row.urgency] || ['Situação não informada', 'neutral'];
      tags.push(tag(label, tone));
      if (row.renewal_rfqs?.length) tags.push(tag(`${row.renewal_rfqs.length} concorrência(s) de renovação`, 'neutral'));
    }
    return el('li', { class: 'work-row', dataset: { id: row.id, section: key } }, [
      el('div', { class: 'work-main' }, [el('a', { class: 'work-title', href, text: title }), el('span', { class: 'row-sub', text: sub }),
        el('span', { class: 'work-reason small' }, [textStrong('Por quê: '), textSpan(workReason(key, row))])]),
      el('div', { class: 'work-side' }, [...tags, ...actions, el('a', { class: 'btn btn-ghost btn-sm', href, text: key === 'approvals' ? 'Abrir pedido' : 'Abrir' })])
    ]);
  }

  function ownerFilter(key) {
    if (!OWNER_FILTERS.has(key)) return null;
    const state = states[key];
    const select = el('select', { class: 'input input-sm', 'aria-label': 'Filtrar por responsável' }, [
      new Option('Qualquer responsável', ''), ...(ctx.viewer?.id ? [new Option('Comigo', 'mine')] : []), new Option('Sem responsável', 'none')]);
    select.value = state.owner;
    select.addEventListener('change', () => { state.owner = select.value; load(key); });
    return select;
  }

  function draw() {
    tabList.replaceChildren(...WORK_SECTIONS.map(([key, label]) => {
      const state = states[key];
      const count = state.loaded && !state.error ? `${state.rows.length}${state.page?.has_more ? '+' : ''}` : null;
      const tab = el('button', { type: 'button', role: 'tab', id: `work-tab-${key}`, class: `chip${key === active ? ' active' : ''}`, 'aria-selected': String(key === active), 'aria-controls': 'work-panel', tabindex: key === active ? '0' : '-1' },
        [textSpan(label), count ? el('span', { class: 'chip-count', 'aria-label': `${count} nesta página`, text: count }) : null].filter(Boolean));
      tab.addEventListener('click', () => select(key));
      tab.addEventListener('keydown', (event) => {
        const index = WORK_SECTIONS.findIndex(([k]) => k === key);
        const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (step) { event.preventDefault(); select(WORK_SECTIONS[(index + step + WORK_SECTIONS.length) % WORK_SECTIONS.length][0], true); }
      });
      return tab;
    }));
    const state = states[active];
    const [, , hint] = WORK_SECTIONS.find(([key]) => key === active);
    panel.setAttribute('aria-labelledby', `work-tab-${active}`);
    const content = state.error ? sectionError(state.error, () => load(active))
      : !state.loaded ? el('p', { class: 'muted small', role: 'status', text: 'Carregando…' })
      : state.rows.length ? el('ul', { class: 'work-list', role: 'list' }, state.rows.map((row) => rowNode(active, row)))
      : mutedText(state.owner ? 'Nenhum item com este filtro.' : 'Nenhum item pendente nesta seção.');
    const enrichment = active === 'contracts' && state.coverage?.enrichment && Object.values(state.coverage.enrichment).some((item) => item && item.complete === false)
      ? mutedText('Tarefas, marcos ou concorrências vinculadas foram lidos até o limite por página; pode haver mais no contrato.') : null;
    panel.replaceChildren(...[
      el('div', { class: 'work-toolbar' }, [mutedText(hint), ownerFilter(active)].filter(Boolean)),
      content, enrichment,
      state.error ? null : pagerFooter({ shown: state.rows.length, page: state.page, coverage: state.coverage, loading: state.loading && state.loaded, onMore: () => load(active, { append: true }) })
    ].filter(Boolean));
  }

  function select(key, focus = false) {
    active = key;
    if (!states[key].loaded && !states[key].loading) load(key);
    draw();
    if (focus) tabList.querySelector(`#work-tab-${key}`)?.focus();
  }

  select(active);
  return el('div', { class: 'card-body work-queue', id: 'caixa-de-trabalho' }, [
    mutedText('Registros que pedem ação, lidos direto do servidor. Contagens são da página carregada, não da carteira inteira.'), tabList, panel]);
}

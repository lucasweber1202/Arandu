// Tarefas operacionais: criação, atribuição, filtros e conclusão.
// Extraído de company.js (v7.0): uma capability por módulo e rota.

import { el, icon, formatDate, relativeDays, daysUntil, ROLE_LABELS, todayIso, textSpan } from '../../core.js';
import { card, button, emptyState, errorState, loading, toast, confirmDialog, field, onSubmit, toastError } from '../../ui.js';
import { TASK_EDITORS, taskChangeError } from '../shared/tasks.js';
import { CONTRACT_CATEGORIES } from '../../../../lib/finance/contract-terms.mjs';

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
      const result = await ctx.send('tasks', { ...pending.body, idempotency_key: pending.key });
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
          textSpan(`Não confirmamos se a tarefa foi criada. ${sameTitle ? `A lista mostra ${sameTitle === 1 ? 'uma tarefa aberta' : `${sameTitle} tarefas abertas`} com este título, mas o título sozinho não prova que é a sua. ` : ''}Use “Conferir com o servidor”: ele repete a mesma tentativa e nunca cria uma segunda tarefa.`),
          ' ',
          button('Conferir com o servidor', { size: 'sm', iconName: 'refresh', onClick: () => form.requestSubmit() })
        );
        toast('Não foi possível confirmar a criação da tarefa. Seus dados continuam no formulário.', 'error');
      } else {
        pending = null;
        pendingNote.hidden = true;
        toastError(error);
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
  // Recorte por contrato (?contrato=<id>): vai ao servidor como contract_id e
  // combina com situação e responsável; nunca é um filtro sobre o que já carregou.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let contractScope = UUID.test(url.searchParams.get('contrato') || '') ? url.searchParams.get('contrato') : null;
  const scopedContract = contractScope ? (ctx.data.contracts || []).find((row) => row.id === contractScope) : null;
  const contractChip = contractScope ? el('span', { class: 'callout callout-info compact task-contract-scope' }, [
    textSpan(`Somente tarefas do contrato ${scopedContract ? `${scopedContract.provider_name || 'Contrato'} · ${scopedContract.title || CONTRACT_CATEGORIES[scopedContract.product] || 'contrato'}` : 'selecionado'}`),
    el('a', { class: 'btn btn-ghost btn-sm', href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${contractScope}`), text: 'Abrir contrato' }),
    button('Ver todas as tarefas', { variant: 'ghost', size: 'sm', onClick: () => {
      contractScope = null; contractChip.remove();
      const next = new URL(location.href); next.searchParams.delete('contrato');
      history.replaceState(null, '', next.pathname + next.search + next.hash);
      draw();
    } })
  ]) : null;
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
    if (contractScope) q.set('contract_id', contractScope);
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
      await ctx.send('tasks', { organization_id: ctx.organization.id, task_id: task.id, status: wanted }, 'PATCH');
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
      await ctx.send('tasks', { organization_id: ctx.organization.id, task_id: task.id, assignee_id: select.value || null }, 'PATCH');
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
          : task.related_type === 'contract' ? el('a', { href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${task.related_id}`), text: contract ? `${contract.provider_name || 'Contrato'} · ${contract.title || CONTRACT_CATEGORIES[contract.product] || 'contrato'}` : 'Ver contrato' }) : null;
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
          task.due_on ? el('span', { class: `task-due${task.status === 'open' && days < 0 ? ' overdue' : task.status === 'open' && days <= 2 ? ' soon' : ''}` }, [icon('calendar', { size: 12 }), textSpan(`${formatDate(task.due_on, { withYear: false })}${task.status === 'open' ? ` · ${relativeDays(task.due_on)}` : ''}`)]) : el('span', { class: 'task-due muted', text: 'sem prazo' })
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
  const readOnly = el('p', { class: 'callout callout-info compact task-readonly' }, [icon('lock', { size: 14 }), textSpan('Seu papel acompanha as tarefas da equipe: criar, concluir e reabrir ficam com administradores, gestores financeiros e analistas.')]);
  root.append(...[card({ body: canEdit ? form : readOnly }), el('div', { class: 'toolbar task-toolbar' }, [field({ label: 'Mostrar', control: filter }), scopeNote]), contractChip, card({ flush: true, body: box }), el('div', { class: 'task-more' }, more)].filter(Boolean));
  // Radar de prazos: contratos, solicitações e tarefas da visão geral já carregada,
  // sob demanda (o módulo não pesa na lista de tarefas).
  const radarSlot = el('div', { class: 'deadline-radar-slot' });
  root.append(radarSlot);
  import('../deadline-radar.js').then((m) => { if (radarSlot.parentNode) { const radar = m.deadlineRadar(ctx);
    radarSlot.replaceWith(radar);
    // Link direto (Painel → "Radar de prazos"): leva o foco ao radar quando ele chega.
    if (location.hash === '#deadline-radar') { radar.setAttribute('tabindex', '-1'); radar.scrollIntoView({ block: 'start' }); radar.focus({ preventScroll: true }); } } })
    .catch(() => radarSlot.replaceWith(el('p', { class: 'callout callout-warning compact', role: 'alert', text: 'O radar de prazos não carregou. Recarregue a página para tentar de novo; a lista de tarefas acima não foi afetada.' })));
  return root;
}

// ----------------------------------------------------------- notificações

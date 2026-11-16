// Cenários salvos na empresa (Arandu 10): a fonte de verdade é o servidor.
//
// GET/POST/PATCH decision-scenarios, /detail (histórico), /archive,
// /duplicate e /compare. Este módulo não guarda ranking, pontuação, economia
// nem decisão: o cenário persistido é nome + pesos + contexto auditado; o
// resultado vem do motor canônico do servidor a cada comparação.
//
// Concorrência: edição e arquivo levam expected_version. Um 409 nunca é
// repetido às cegas: a tela oferece reler a versão atual ou salvar como novo.
// Criação/duplicação levam request_key; envio sem confirmação reaproveita a
// mesma chave, e o servidor devolve o mesmo registro em vez de duplicar.

import { el, icon, formatDateTime, textSpan, textStrong } from '../../core.js';
import { button, confirmDialog, drawer, mutedText, tag, toast } from '../../ui.js';
import { memberName } from '../shared/people.js';
import { sequence, requestKey, outcomeUnknown, operationalError, pagerFooter, sectionError, queryString } from '../shared/operational.js';

export const MAX_COMPARE = 3;
const STALE_LABELS = {
  context_unavailable: 'contexto atual não pôde ser conferido',
  rfq_changed: 'a solicitação mudou',
  process_changed: 'o estado do processo mudou',
  proposals_changed: 'as propostas mudaram'
};
// Tipos gravados por fin_scenario_command: 'scenario_' || operação.
const EVENT_LABELS = { scenario_create: 'Criado', scenario_update: 'Editado', scenario_archive: 'Arquivado', scenario_duplicate: 'Criado como cópia' };

/** Motivos de obsolescência em texto; código desconhecido nunca é omitido. Exportada para teste. */
export function scenarioStaleText(scenario) {
  if (!scenario?.stale) return null;
  const reasons = (scenario.stale_reasons || []).map((code) => STALE_LABELS[code] || 'o servidor marcou o contexto como desatualizado');
  return `Desatualizado: ${reasons.length ? [...new Set(reasons)].join(', ') : 'o servidor marcou o contexto como desatualizado'}.`;
}

/** Rótulo de evento do histórico (formato canônico ou o próprio tipo humanizado). Exportada para teste. */
export function historyLabel(event) {
  return EVENT_LABELS[event?.event_type] || 'Alteração registrada';
}

/** Pesos iguais (ordem das chaves irrelevante). Exportada para teste. */
export function sameWeights(a, b) {
  const norm = (w) => JSON.stringify(Object.entries(w || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]).sort(([x], [y]) => x.localeCompare(y)));
  return norm(a) === norm(b);
}

/**
 * Biblioteca de cenários salvos. `onEdit(scenario)` leva um cenário salvo ao
 * editor de rascunho; `onCompared(result)` recebe o resultado do motor.
 */
export function scenarioLibrary(ctx, rfq, { specs, onEdit, onCompared }) {
  const canWrite = ctx.can('edit_scenario');
  const state = { status: 'active', rows: [], page: null, loading: false, error: null, selected: new Set() };
  const reads = sequence();
  const body = el('div', { class: 'stack scenario-library-body' });
  const statusLine = el('p', { class: 'muted small scenario-library-status', role: 'status', 'aria-live': 'polite' });
  const tabsNode = el('div', { class: 'toolbar-chips', role: 'group', 'aria-label': 'Cenários salvos: ativos ou arquivados' });
  const compareButton = button('Comparar selecionados', { size: 'sm', variant: 'primary', iconName: 'scale', onClick: () => compare() });
  const label = (key) => specs.find((spec) => spec.key === key)?.label || 'Critério';

  async function load({ append = false } = {}) {
    const token = reads.next();
    state.loading = true; state.error = null;
    if (!append) { state.rows = []; state.page = null; }
    draw();
    try {
      const data = await ctx.api(`decision-scenarios?${queryString({ rfq_id: rfq.id, status: state.status, limit: 25, cursor: append ? state.page?.next_cursor : null })}`);
      if (!reads.isCurrent(token)) return;
      const seen = new Set(state.rows.map((row) => row.id));
      state.rows = [...state.rows, ...(data.rows || []).filter((row) => !seen.has(row.id))];
      state.page = data.page || null;
    } catch (error) {
      if (!reads.isCurrent(token)) return;
      state.error = error;
    }
    state.loading = false;
    draw();
  }

  /** Substitui (ou insere) uma linha com a versão devolvida pelo servidor. */
  function upsert(scenario) {
    const matchesTab = scenario.status === state.status;
    const index = state.rows.findIndex((row) => row.id === scenario.id);
    if (index >= 0 && matchesTab) state.rows[index] = scenario;
    else if (index >= 0) { state.rows.splice(index, 1); state.selected.delete(scenario.id); }
    else if (matchesTab) state.rows.unshift(scenario);
    draw();
  }

  async function detail(id) {
    const data = await ctx.api(`decision-scenarios/detail?${queryString({ id, limit: 25 })}`);
    return data;
  }

  /**
   * Salva um rascunho. Novo: POST com a chave do rascunho (reaproveitada se o
   * envio anterior ficou sem confirmação). Existente: PATCH com expected_version.
   * Devolve {ok, scenario} ou {ok:false, kind:'conflict'|'unknown'|'error', error}.
   */
  async function save(draft, { refreshContext = false } = {}) {
    const name = String(draft.name || '').trim();
    const weights = Object.fromEntries(Object.entries(draft.weights || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));
    try {
      let result;
      if (draft.persisted) {
        result = await ctx.send('decision-scenarios', { id: draft.persisted.id, expected_version: draft.persisted.version, name, weights, ...(refreshContext ? { refresh_context: true } : {}) }, 'PATCH');
      } else {
        draft.requestKey ||= requestKey('scenario');
        result = await ctx.send('decision-scenarios', { rfq_id: rfq.id, name, weights, request_key: draft.requestKey });
        draft.requestKey = null;
      }
      upsert(result.scenario);
      return { ok: true, scenario: result.scenario };
    } catch (error) {
      if (error.status === 409) return { ok: false, kind: 'conflict', error };
      // Resultado desconhecido: na criação a chave fica guardada para conferir.
      if (outcomeUnknown(error)) return { ok: false, kind: 'unknown', error };
      if (!draft.persisted) draft.requestKey = null;
      return { ok: false, kind: 'error', error };
    }
  }

  async function duplicate(scenario, trigger) {
    trigger.disabled = true;
    const key = trigger.dataset.requestKey || requestKey('scenario-copy');
    trigger.dataset.requestKey = key;
    const name = `${scenario.name} (cópia)`.slice(0, 120);
    try {
      const result = await ctx.send('decision-scenarios/duplicate', { id: scenario.id, name, request_key: key });
      delete trigger.dataset.requestKey;
      upsert(result.scenario);
      toast('Cópia salva na empresa.');
    } catch (error) {
      if (!outcomeUnknown(error)) delete trigger.dataset.requestKey;
      toast(outcomeUnknown(error) ? 'Não confirmamos a cópia. Tentar de novo confere o mesmo envio, sem duplicar.' : operationalError(error), 'error');
      trigger.disabled = false;
    }
  }

  async function archive(scenario, trigger) {
    const ok = await confirmDialog({ title: 'Arquivar este cenário?', description: 'O cenário sai da lista ativa e não pode mais ser editado. O histórico continua disponível em Arquivados.', confirmLabel: 'Arquivar' });
    if (!ok) return;
    trigger.disabled = true;
    try {
      const result = await ctx.send('decision-scenarios/archive', { id: scenario.id, expected_version: scenario.version });
      upsert(result.scenario);
      toast('Cenário arquivado.');
    } catch (error) {
      toast(operationalError(error), 'error');
      if (error.status === 409) await load();
      else trigger.disabled = false;
    }
  }

  async function refreshContext(scenario, trigger) {
    const ok = await confirmDialog({ title: 'Atualizar o contexto do cenário?', description: 'O cenário passa a referenciar a revisão atual da solicitação e as versões atuais das propostas. Nome e pesos não mudam. A versão anterior continua no histórico.', confirmLabel: 'Atualizar contexto' });
    if (!ok) return;
    trigger.disabled = true;
    const result = await save({ name: scenario.name, weights: scenario.weights, persisted: { id: scenario.id, version: scenario.version } }, { refreshContext: true });
    if (result.ok) toast('Contexto atualizado. Compare de novo para ver o resultado atual.');
    else { toast(operationalError(result.error), 'error'); if (result.kind === 'conflict') await load(); else trigger.disabled = false; }
  }

  async function compare() {
    const ids = [...state.selected];
    if (!ids.length) return;
    compareButton.disabled = true;
    statusLine.textContent = 'Comparando pelo motor canônico…';
    try {
      const data = await ctx.send('decision-scenarios/compare', { rfq_id: rfq.id, scenario_ids: ids });
      statusLine.textContent = '';
      onCompared?.(data);
    } catch (error) {
      statusLine.textContent = operationalError(error);
      onCompared?.(null);
      // Obsolescência: a lista é relida para mostrar quais cenários precisam de atualização.
      if (error.code === 'scenario_stale') await load();
    }
    compareButton.disabled = false;
  }

  function openHistory(scenario) {
    const list = el('ol', { class: 'scenario-history plain-list', 'aria-label': 'Histórico do cenário' });
    const foot = el('div');
    const content = el('div', { class: 'stack' }, [el('p', { class: 'muted small', role: 'status', text: 'Carregando histórico…' })]);
    let cursor = null, rows = [];
    const histories = sequence();
    const fetchPage = async () => {
      const token = histories.next();
      try {
        const data = await ctx.api(`decision-scenarios/detail?${queryString({ id: scenario.id, limit: 25, cursor })}`);
        if (!histories.isCurrent(token)) return;
        rows = [...rows, ...(data.history || [])];
        cursor = data.coverage?.history?.next_cursor || null;
        list.replaceChildren(...rows.map((event) => el('li', { class: 'scenario-history-row' }, [
          textStrong(historyLabel(event)),
          textSpan(` · ${memberName(ctx.members, event.actor_id)} · ${formatDateTime(event.happened_at)}`),
          event.metadata?.version ? textSpan(` · versão ${event.metadata.version}`) : null,
          event.metadata?.name ? el('span', { class: 'row-sub', text: `Nome: ${event.metadata.name}` }) : null,
          event.metadata?.weights ? el('span', { class: 'row-sub', text: `Pesos: ${Object.entries(event.metadata.weights).map(([k, v]) => `${label(k)} ${v}`).join(' · ')}` }) : null
        ].filter(Boolean))));
        content.replaceChildren(
          el('dl', { class: 'deflist deflist-2' }, [
            ['Criado por', `${memberName(ctx.members, data.scenario.created_by)} · ${formatDateTime(data.scenario.created_at)}`],
            ['Última alteração', `${memberName(ctx.members, data.scenario.updated_by)} · ${formatDateTime(data.scenario.updated_at)}`],
            ['Versão atual', String(data.scenario.version)],
            ['Situação', data.scenario.status === 'archived' ? 'Arquivado' : scenarioStaleText(data.scenario) || 'Contexto atual']
          ].map(([k, v]) => el('div', { class: 'deflist-row' }, [el('dt', { text: k }), el('dd', { text: v })]))),
          rows.length ? list : mutedText('Nenhum evento retornado.'), foot);
        foot.replaceChildren(...[pagerFooter({ shown: rows.length, page: data.coverage?.history, onMore: fetchPage, label: 'Carregar eventos anteriores' })].filter(Boolean));
      } catch (error) {
        if (histories.isCurrent(token)) content.replaceChildren(sectionError(error, fetchPage));
      }
    };
    drawer({ title: 'Histórico do cenário', subtitle: scenario.name, body: content });
    fetchPage();
  }

  function scenarioRow(scenario) {
    const active = scenario.status === 'active';
    const checkbox = el('input', { type: 'checkbox', 'aria-label': `Selecionar ${scenario.name} para comparar` });
    checkbox.checked = state.selected.has(scenario.id);
    checkbox.disabled = !active || (!checkbox.checked && state.selected.size >= MAX_COMPARE);
    checkbox.addEventListener('change', () => { if (checkbox.checked) state.selected.add(scenario.id); else state.selected.delete(scenario.id); draw(); });
    const stale = scenarioStaleText(scenario);
    const actions = [
      button('Histórico', { size: 'sm', variant: 'ghost', iconName: 'clock', attrs: { 'aria-label': `Histórico de ${scenario.name}` }, onClick: () => openHistory(scenario) }),
      active && canWrite ? button('Editar', { size: 'sm', variant: 'ghost', iconName: 'edit', attrs: { 'aria-label': `Editar ${scenario.name}` }, onClick: () => onEdit?.(scenario) }) : null,
      active && canWrite && scenario.stale ? button('Atualizar contexto', { size: 'sm', variant: 'ghost', iconName: 'refresh', attrs: { 'aria-label': `Atualizar contexto de ${scenario.name}` }, onClick: (event) => refreshContext(scenario, event.currentTarget) }) : null,
      canWrite ? button('Duplicar', { size: 'sm', variant: 'ghost', iconName: 'plus', attrs: { 'aria-label': `Duplicar ${scenario.name}` }, onClick: (event) => duplicate(scenario, event.currentTarget) }) : null,
      active && canWrite ? button('Arquivar', { size: 'sm', variant: 'ghost', iconName: 'x', attrs: { 'aria-label': `Arquivar ${scenario.name}` }, onClick: (event) => archive(scenario, event.currentTarget) }) : null
    ].filter(Boolean);
    return el('li', { class: 'scenario-saved', dataset: { scenario: scenario.id } }, [
      el('label', { class: 'scenario-saved-main' }, [active ? checkbox : null,
        el('span', { class: 'scenario-saved-text' }, [
          textStrong(scenario.name),
          el('span', { class: 'row-sub', text: `Versão ${scenario.version} · ${memberName(ctx.members, scenario.updated_by)} · ${formatDateTime(scenario.updated_at)}` }),
          el('span', { class: 'row-sub', text: Object.entries(scenario.weights || {}).map(([k, v]) => `${label(k)} ${v}`).join(' · ') })
        ])].filter(Boolean)),
      el('span', { class: 'scenario-saved-tags' }, [
        !active ? tag('Arquivado', 'neutral') : stale ? tag('Desatualizado', 'warning') : tag('Contexto atual', 'success')
      ]),
      stale ? el('p', { class: 'small muted scenario-stale', text: stale }) : null,
      el('div', { class: 'row-actions' }, actions)
    ].filter(Boolean));
  }

  function draw() {
    tabsNode.replaceChildren(...[['active', 'Ativos'], ['archived', 'Arquivados']].map(([key, text]) => {
      const chip = el('button', { type: 'button', class: `chip${state.status === key ? ' active' : ''}`, 'aria-pressed': String(state.status === key), text });
      chip.addEventListener('click', () => { if (state.status === key) return; state.status = key; state.selected.clear(); load(); });
      return chip;
    }));
    compareButton.hidden = state.status !== 'active';
    compareButton.disabled = !state.selected.size;
    compareButton.querySelector('.btn-label') && (compareButton.querySelector('.btn-label').textContent = state.selected.size ? `Comparar ${state.selected.size} selecionado(s)` : 'Selecione até 3 para comparar');
    const content = [];
    if (state.error) content.push(sectionError(state.error, () => load()));
    else if (state.loading && !state.rows.length) content.push(el('p', { class: 'muted small', role: 'status', text: 'Carregando cenários salvos…' }));
    else if (!state.rows.length) content.push(mutedText(state.status === 'active' ? 'Nenhum cenário salvo nesta solicitação.' : 'Nenhum cenário arquivado.'));
    else content.push(el('ul', { class: 'scenario-saved-list', role: 'list' }, state.rows.map(scenarioRow)));
    const pager = !state.error ? pagerFooter({ shown: state.rows.length, page: state.page, loading: state.loading, onMore: () => load({ append: true }) }) : null;
    body.replaceChildren(...content, ...(pager ? [pager] : []));
  }

  load();
  const node = el('section', { class: 'scenario-library', 'aria-labelledby': `scenario-library-${rfq.id}` }, [
    el('div', { class: 'cc-head' }, [el('h4', { id: `scenario-library-${rfq.id}`, text: 'Cenários salvos na empresa' }), tabsNode]),
    canWrite ? null : el('p', { class: 'muted small', text: 'Seu papel permite consultar e comparar cenários, sem criar ou alterar.' }),
    body, el('div', { class: 'form-actions' }, [compareButton]), statusLine
  ].filter(Boolean));
  return { node, save, reload: load, detail };
}

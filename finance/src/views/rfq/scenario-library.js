// Cenários salvos na empresa (Arandu 10, contrato v1.2: decision-scenarios).
//
// O servidor guarda nome, pesos, versão, autoria e o contexto auditado (revisão
// da solicitação e versões das propostas). Nenhum resultado ou posição é
// gravado: comparar salvos recalcula pelo motor canônico no servidor, e um
// contexto obsoleto devolve 409 `scenario_stale` até a pessoa atualizar o
// contexto de forma explícita. Cenário salvo é análise, não decisão.
//
// Criação e duplicação reutilizam a mesma `request_key` ao repetir após falha
// incerta (o servidor devolve o mesmo registro, sem duplicar).

import { el, icon, formatDateTime, textSpan, textStrong } from '../../core.js';
import { button, confirmDialog, drawer, mutedText, tag, toast, promptDialog } from '../../ui.js';
import { memberName } from '../shared/people.js';

const STALE = { context_unavailable: 'não foi possível conferir o contexto atual', rfq_changed: 'a solicitação mudou depois do cenário',
  process_changed: 'o estado do processo mudou', proposals_changed: 'propostas mudaram (versão, estado ou documento)' };
export const scenarioStaleText = (reasons = []) => reasons.map((code) => STALE[code] || 'contexto alterado').join('; ');
const EVENT = { decision_scenario_created: 'Criado', decision_scenario_updated: 'Atualizado', decision_scenario_archived: 'Arquivado', decision_scenario_duplicated: 'Duplicado', decision_scenario_context_refreshed: 'Contexto atualizado' };
const MAX_COMPARE = 3;
const newKey = () => `scn:${crypto.randomUUID()}`;
const unknownOutcome = (error) => !error?.status || error.status >= 500;

/**
 * Painel de cenários salvos.
 * @param {object} opts
 * @param {() => Array<{name:string, weights:object}>} opts.sessionScenarios cenários desta aba
 * @param {(weights:object, name:string) => void} opts.onLoad leva pesos salvos para a análise da aba
 * @param {(scenarios:Array<{name:string,result:object}>) => void} opts.onCompared resultado do servidor
 */
export function scenarioLibrary(ctx, rfq, { sessionScenarios, onLoad, onCompared }) {
  const write = ctx.can('create_rfq');
  const root = el('section', { class: 'studio-library card', id: 'cenarios-salvos', 'aria-labelledby': 'cenarios-salvos-title' });
  const body = el('div', { class: 'stack' });
  const status = el('p', { class: 'small', role: 'status', 'aria-live': 'polite' });
  const pendingKeys = new Map(); // nome do cenário da aba → chave da última tentativa incerta
  const selected = new Set();
  let rows = [], page = null, archived = false, loading = false;

  async function load({ more = false } = {}) {
    if (loading) return;
    loading = true;
    if (!more) body.replaceChildren(mutedText('Carregando cenários salvos…'));
    try {
      const params = new URLSearchParams({ rfq_id: rfq.id, limit: '25', status: archived ? 'archived' : 'active' });
      if (more && page?.next_cursor) params.set('cursor', page.next_cursor);
      const result = await ctx.api(`decision-scenarios?${params}`);
      rows = more ? [...rows, ...(result.rows || [])] : (result.rows || []);
      page = result.page || null;
      for (const id of [...selected]) if (!rows.some((row) => row.id === id)) selected.delete(id);
      draw();
    } catch (error) {
      body.replaceChildren(el('p', { class: 'callout callout-warning compact', role: 'alert' }, [icon('alert', { size: 14 }),
        textSpan(error?.status === 403 ? 'Sua conta não pode consultar cenários salvos desta solicitação.' : 'Não conseguimos carregar os cenários salvos. A análise desta aba continua disponível. '),
        error?.status === 403 ? null : button('Tentar de novo', { size: 'sm', onClick: () => load() })].filter(Boolean)));
    } finally { loading = false; }
  }

  function scenarioRow(scenario) {
    const check = !archived ? el('input', { type: 'checkbox', 'aria-label': `Selecionar ${scenario.name} para comparar`, checked: selected.has(scenario.id) }) : null;
    check?.addEventListener('change', () => {
      if (check.checked && selected.size >= MAX_COMPARE) { check.checked = false; status.textContent = `Compare até ${MAX_COMPARE} cenários por vez.`; return; }
      if (check.checked) selected.add(scenario.id); else selected.delete(scenario.id);
      drawCompare();
    });
    const author = memberName(ctx.members, scenario.updated_by || scenario.created_by);
    const actions = [
      button('Usar na análise', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `Usar ${scenario.name} na análise desta aba` }, onClick: () => { onLoad({ ...scenario.weights }, scenario.name); status.textContent = `Pesos de “${scenario.name}” levados para a análise desta aba. Calcule para ver o resultado.`; } }),
      button('Histórico', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `Histórico de ${scenario.name}` }, onClick: () => openHistory(scenario) }),
      write && !archived && scenario.stale ? button('Atualizar contexto', { size: 'sm', variant: 'secondary', iconName: 'refresh', attrs: { 'aria-label': `Atualizar contexto de ${scenario.name}` }, onClick: () => refresh(scenario) }) : null,
      write && !archived ? button('Duplicar', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `Duplicar ${scenario.name} na empresa` }, onClick: () => duplicate(scenario) }) : null,
      write && !archived ? button('Arquivar', { size: 'sm', variant: 'danger-ghost', attrs: { 'aria-label': `Arquivar ${scenario.name}` }, onClick: () => archive(scenario) }) : null
    ].filter(Boolean);
    return el('li', { class: 'library-row', dataset: { scenario: scenario.id, stale: String(Boolean(scenario.stale)) } }, [
      check,
      el('div', { class: 'library-main' }, [
        textStrong(scenario.name),
        el('span', { class: 'row-sub', text: `v${scenario.version} · ${author} · ${formatDateTime(scenario.updated_at || scenario.created_at)}` }),
        el('span', { class: 'row-sub', text: Object.entries(scenario.weights || {}).map(([key, value]) => `${key.replaceAll('_', ' ')} ${value}`).join(' · ') }),
        scenario.stale ? el('span', { class: 'library-stale small' }, [tag('Desatualizado', 'warning'), textSpan(` ${scenarioStaleText(scenario.stale_reasons)}.`)]) : null
      ].filter(Boolean)),
      el('div', { class: 'row-actions' }, actions)
    ].filter(Boolean));
  }

  const compareBox = el('div', { class: 'form-actions' });
  function drawCompare() {
    const picked = rows.filter((row) => selected.has(row.id));
    compareBox.replaceChildren(...(archived || !rows.length ? [] : [
      button(picked.length ? `Comparar ${picked.length} salvo(s) no servidor` : 'Selecione até 3 para comparar', { size: 'sm', variant: 'primary', iconName: 'scale', attrs: { disabled: !picked.length || undefined }, onClick: () => compare(picked) }),
      picked.some((row) => row.stale) ? mutedText('Há cenário desatualizado na seleção: o servidor recusa a comparação até o contexto ser atualizado.', 'span') : null
    ].filter(Boolean)));
  }

  function draw() {
    const list = rows.length ? el('ul', { class: 'library-list', role: 'list' }, rows.map(scenarioRow))
      : mutedText(archived ? 'Nenhum cenário arquivado.' : 'Nenhum cenário salvo nesta solicitação ainda.');
    body.replaceChildren(...[list, page?.has_more ? button('Carregar mais cenários', { size: 'sm', onClick: () => load({ more: true }) }) : null, compareBox].filter(Boolean));
    drawCompare();
  }

  // Salvar um cenário desta aba na empresa (POST idempotente).
  const saveBox = el('div', { class: 'form-actions library-save' });
  function drawSave() {
    if (!write) { saveBox.replaceChildren(mutedText('Sua função consulta cenários salvos; salvar fica com administradores, gestores e analistas.', 'span')); return; }
    saveBox.replaceChildren(...sessionScenarios().map((scenario) => button(pendingKeys.has(scenario.name) ? `Conferir envio de “${scenario.name}”` : `Salvar “${scenario.name}” na empresa`, {
      size: 'sm', variant: 'secondary', iconName: 'check', onClick: (event) => save(scenario, event.currentTarget) })));
  }
  async function save(scenario, node) {
    const weights = Object.fromEntries(Object.entries(scenario.weights || {}).filter(([, value]) => Number(value) > 0).map(([key, value]) => [key, Number(value)]));
    const name = String(scenario.name || '').trim();
    if (name.length < 2) { status.textContent = 'Dê ao cenário um nome com pelo menos 2 caracteres.'; return; }
    if (!Object.keys(weights).length) { status.textContent = 'Defina ao menos um peso antes de salvar.'; return; }
    const key = pendingKeys.get(name) || newKey();
    pendingKeys.set(name, key);
    node.disabled = true;
    try {
      const result = await ctx.send('decision-scenarios', { rfq_id: rfq.id, name, weights, request_key: key });
      if (!result?.scenario?.id) throw Object.assign(new Error('Não confirmamos o registro.'), { status: 0 });
      pendingKeys.delete(name);
      status.textContent = `“${name}” salvo na empresa (v${result.scenario.version}).`;
      toast('Cenário salvo.');
      archived = false;
      await load();
    } catch (error) {
      if (unknownOutcome(error)) status.textContent = 'Não confirmamos o salvamento. “Conferir envio” repete a mesma solicitação e não cria outro cenário.';
      else { pendingKeys.delete(name); status.textContent = error?.code === 'scenario_conflict' ? 'Já existe envio com esta chave e conteúdo diferente; recarregue a lista antes de tentar de novo.' : (error?.message || 'O cenário não foi salvo.'); }
    } finally { drawSave(); }
  }

  async function duplicate(scenario) {
    const name = await promptDialog({ title: 'Duplicar cenário na empresa', description: 'A cópia mantém pesos e o contexto de origem (inclusive se estiver desatualizado). Nenhum resultado é copiado.',
      label: 'Nome da cópia', minLength: 2, confirmLabel: 'Duplicar', placeholder: `${scenario.name} (cópia)`.slice(0, 120) });
    if (name === null) return;
    const key = newKey();
    const attempt = async () => ctx.send('decision-scenarios/duplicate', { id: scenario.id, name: name.trim(), request_key: key });
    try { await attempt(); }
    catch (error) {
      if (!unknownOutcome(error)) { status.textContent = error?.message || 'A cópia não foi criada.'; return; }
      try { await attempt(); } catch (again) { status.textContent = 'Não confirmamos a cópia. Recarregue a lista antes de tentar de novo.'; return; }
    }
    status.textContent = `Cópia “${name.trim()}” criada.`;
    await load();
  }

  async function archive(scenario) {
    if (!await confirmDialog({ title: `Arquivar “${scenario.name}”?`, description: 'O cenário sai da lista ativa e não aceita edição. O histórico continua disponível. Nenhuma decisão ou aprovação é afetada.', confirmLabel: 'Arquivar', tone: 'danger' })) return;
    try {
      await ctx.send('decision-scenarios/archive', { id: scenario.id, expected_version: scenario.version });
      status.textContent = `“${scenario.name}” arquivado.`;
    } catch (error) {
      status.textContent = error?.status === 409 ? 'O cenário mudou desde a leitura (outra pessoa ou aba). A lista foi recarregada; confira antes de arquivar.' : (error?.message || 'O cenário não foi arquivado.');
    }
    await load();
  }

  async function refresh(scenario) {
    if (!await confirmDialog({ title: 'Atualizar o contexto deste cenário?', description: `Motivo: ${scenarioStaleText(scenario.stale_reasons)}. O cenário passa a se referir à solicitação e às propostas atuais, com os mesmos pesos. A versão anterior fica no histórico.`, confirmLabel: 'Atualizar contexto' })) return;
    try {
      const result = await ctx.send('decision-scenarios', { id: scenario.id, expected_version: scenario.version, name: scenario.name, weights: scenario.weights, refresh_context: true }, 'PATCH');
      status.textContent = `Contexto de “${scenario.name}” atualizado (v${result?.scenario?.version ?? scenario.version + 1}).`;
    } catch (error) {
      status.textContent = error?.status === 409 ? 'O cenário mudou desde a leitura. A lista foi recarregada; confira antes de tentar de novo.' : (error?.message || 'O contexto não foi atualizado.');
    }
    await load();
  }

  async function compare(picked) {
    status.textContent = 'Recalculando os cenários salvos pelo motor de comparação…';
    try {
      const result = await ctx.send('decision-scenarios/compare', { rfq_id: rfq.id, scenario_ids: picked.map((row) => row.id) });
      onCompared((result.scenarios || []).map((item) => ({ name: item.scenario?.name || 'Cenário salvo', result: item.weighted })));
      status.textContent = `Comparação recalculada no servidor para ${plural(picked.length)}. ${result.notice || ''}`.trim();
    } catch (error) {
      status.textContent = error?.code === 'scenario_stale' || error?.status === 409
        ? 'O contexto de algum cenário selecionado não corresponde mais à solicitação. Atualize o contexto explicitamente antes de comparar; nenhum resultado parcial foi exibido.'
        : (error?.message || 'A comparação não foi recalculada.');
      if (error?.status === 409) await load();
    }
  }
  const plural = (n) => (n === 1 ? '1 cenário' : `${n} cenários`);

  async function openHistory(scenario) {
    const list = el('ol', { class: 'activity compact' }, el('li', { class: 'muted', text: 'Carregando histórico…' }));
    drawer({ title: `Histórico: ${scenario.name}`, subtitle: 'Versões imutáveis registradas pelo servidor, com autoria e data.', body: [list,
      mutedText('O histórico registra nome, pesos e contexto de cada versão. Nenhum resultado ou posição é guardado.')] });
    try {
      const result = await ctx.api(`decision-scenarios/detail?${new URLSearchParams({ id: scenario.id, limit: '50' })}`);
      const rows = result.history || [];
      list.replaceChildren(...(rows.length ? rows.map((row) => el('li', { class: 'activity-item' }, [el('span', { class: 'activity-dot', 'aria-hidden': 'true' }),
        el('span', { class: 'activity-text' }, [textStrong(EVENT[row.event_type] || 'Registro'), ` · v${row.metadata?.version ?? '—'} · ${row.metadata?.name || scenario.name} · ${memberName(ctx.members, row.actor_id)}`]),
        el('time', { class: 'activity-time', datetime: row.happened_at, text: formatDateTime(row.happened_at) })])) : [el('li', { class: 'muted', text: 'Sem eventos registrados.' })]),
        ...(result.coverage?.history?.has_more ? [el('li', { class: 'muted small', text: 'Há eventos mais antigos não exibidos.' })] : []));
    } catch (error) {
      list.replaceChildren(el('li', { class: 'muted', text: error?.message || 'Histórico indisponível no momento.' }));
    }
  }

  const toggle = el('select', { class: 'input', 'aria-label': 'Cenários salvos: situação' }, [new Option('Ativos', 'active'), new Option('Arquivados', 'archived')]);
  toggle.addEventListener('change', () => { archived = toggle.value === 'archived'; selected.clear(); load(); });
  root.append(
    el('div', { class: 'card-head' }, [el('div', { class: 'card-head-text' }, [
      el('h4', { class: 'card-title', id: 'cenarios-salvos-title', text: 'Cenários salvos na empresa' }),
      el('p', { class: 'card-subtitle', text: 'Pesos e contexto guardados com autoria e histórico. Comparar recalcula no servidor; nada aqui decide ou aprova.' })]), toggle]),
    el('div', { class: 'card-body stack' }, [saveBox, body, status]));
  drawSave();
  load();
  return { node: root, refreshSave: drawSave };
}

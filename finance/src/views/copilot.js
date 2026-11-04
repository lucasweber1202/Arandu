// Arandu Copilot: interface sobre o contrato `financial-copilot-v1`
// (docs/PLATFORM_INTELLIGENCE_BACKEND_CONTRACTS_2026_11.md, seção Copilot).
//
// - `POST copilot/ask` recebe só {organization_id, question}. O contexto da
//   página entra como TEXTO da pergunta, identificado na tela; o acesso é
//   sempre o do JWT da pessoa no servidor (o texto não concede nada).
// - Resposta exibida como texto seguro, SEMPRE junto das fontes devolvidas.
// - Ação preparada só é gravada por `POST copilot/confirm` depois da revisão
//   humana, com a mesma `request_key` (replay idempotente).
// - Sem modelo configurado (503) a tela diz isso e oferece as consultas
//   guiadas determinísticas; nunca apresenta texto determinístico como IA.
// - Sem histórico persistido: a conversa vive só nesta aba.

import { el, icon, formatDate, formatDateTime, uid } from '../core.js';
import { button, drawer, field, toast, sessionLink } from '../ui.js';
import { ACTIVITY_KINDS } from './crm/model.js';

const MAX = 3000;
let pageContext = null;
let openDialog = null;
const turns = [];

/** Telas declaram o objeto em foco: {type:'contract'|'provider'|'rfq'|'opportunity', id, label}. */
export function setCopilotContext(context) { pageContext = context && context.label ? { ...context } : null; }
export function clearCopilotContext(match = null) { if (!match || pageContext?.id === match) pageContext = null; }

const CONTEXT_NOUN = { contract: 'o contrato', provider: 'a instituição', rfq: 'a negociação', opportunity: 'a oportunidade' };
const SUGGESTIONS = {
  none: ['Quais contratos vencem nos próximos 90 dias?', 'Quais instituições possuem negociações abertas?', 'Quais oportunidades estão aguardando revisão?', 'Quais atividades de relacionamento estão vencidas?'],
  contract: ['Explique as condições deste contrato.', 'Quais atividades e processos estão ligados a este contrato?', 'Quando vence e qual é o aviso prévio registrado?'],
  provider: ['Resuma nosso relacionamento com esta instituição.', 'Quais atividades estão pendentes com esta instituição?', 'Prepare um follow-up com esta instituição para a próxima semana.'],
  rfq: ['Quais são os próximos passos desta negociação?', 'Resuma as propostas recebidas nesta negociação.'],
  opportunity: ['Explique esta oportunidade e a fonte do sinal.']
};

/** Link de cada fonte para a tela canônica do objeto (o backend devolve tipo e id). */
export function sourceHref(ctx, s) {
  const id = encodeURIComponent(s.id || '');
  const map = {
    contract: `/finance/contracts.html?abrir=contrato#contract-${s.id}`, contracts: `/finance/contracts.html?abrir=contrato#contract-${s.id}`,
    rfq: `/finance/rfq.html?id=${id}`, rfqs: `/finance/rfq.html?id=${id}`, proposal: null, proposals: null,
    opportunity: `/finance/opportunities.html?id=${id}`, opportunities: `/finance/opportunities.html?id=${id}`,
    task: `/finance/tasks.html#task-${s.id}`, tasks: `/finance/tasks.html#task-${s.id}`,
    provider: `/finance/providers.html?provider_id=${id}`, providers: `/finance/providers.html?provider_id=${id}`
  };
  const href = Object.hasOwn(map, s.object_type) ? map[s.object_type] : (typeof s.href === 'string' && s.href.startsWith('/finance/') ? s.href : null);
  return href ? ctx.href(href) : null;
}
const TYPE_LABEL = { contract: 'Contrato', contracts: 'Contrato', rfq: 'Negociação', rfqs: 'Negociação', proposal: 'Proposta', proposals: 'Proposta', opportunity: 'Oportunidade', opportunities: 'Oportunidade', task: 'Tarefa', tasks: 'Tarefa', provider: 'Instituição', providers: 'Instituição', activity: 'Atividade', process: 'Processo comercial', crm: 'Relacionamento', guarantee: 'Cálculo de garantia' };

export function copilotErrorMessage(error) {
  const code = error?.code;
  if (code === 'copilot_not_configured') return { title: 'Copilot generativo não configurado neste ambiente', text: 'Nenhum modelo de IA está habilitado aqui. Use as consultas guiadas: elas respondem a partir dos seus registros, sem texto gerado.', guided: true };
  if (error?.status === 429 || code === 'rate_limited') return { title: 'Limite de perguntas atingido', text: 'São até 10 perguntas por pessoa a cada dez minutos. Aguarde e tente novamente.' };
  if (error?.status === 400) return { title: 'Pergunta não aceita', text: `Revise a pergunta (até ${MAX} caracteres, sem marcações).` };
  if (error?.status === 403) return { title: 'Sem permissão', text: 'Seu acesso não permite usar o Copilot nesta organização.' };
  if (error?.status === 401) return { title: 'Sessão expirada', text: error.message };
  if (error?.status === 503) return { title: 'Copilot indisponível para esta pergunta', text: 'O modelo ou uma ferramenta financeira não respondeu dentro dos limites. Nenhuma ação foi executada e nenhuma resposta foi inventada.', retry: true };
  return { title: 'Não foi possível consultar agora', text: 'Falha de conexão. Nenhuma ação foi executada.', retry: true };
}

export function openCopilot(ctx, { context = pageContext, question = '' } = {}) {
  if (openDialog?.isConnected) { openDialog.querySelector('#copilot-question')?.focus(); return openDialog; }
  const log = el('div', { class: 'copilot-log', role: 'log', 'aria-live': 'polite', 'aria-label': 'Conversa com o Copilot' });
  const input = el('textarea', { id: 'copilot-question', class: 'input', rows: '3', maxlength: String(MAX), placeholder: 'Pergunte sobre contratos, instituições, negociações ou relacionamento…' });
  input.value = question;
  const counter = el('span', { class: 'muted small', 'aria-live': 'off' });
  const send = button('Perguntar', { variant: 'primary', type: 'submit', iconName: 'send' });
  const stop = button('Cancelar', { variant: 'ghost', attrs: { hidden: true } });
  let useContext = Boolean(context);
  const scopeChip = el('div', { class: 'copilot-scope' });
  const drawScope = () => {
    scopeChip.replaceChildren(icon('layers', { size: 14 }),
      el('span', { text: useContext && context ? `Contexto: ${CONTEXT_NOUN[context.type] || 'o registro'} ${context.label}` : `Contexto: toda a organização (${ctx.organization.legal_name})` }),
      ...(context ? [button(useContext ? 'Remover contexto' : `Usar ${context.label}`, { size: 'sm', variant: 'ghost', onClick: () => { useContext = !useContext; drawScope(); drawSuggestions(); } })] : []));
  };
  const suggestions = el('div', { class: 'copilot-suggestions', role: 'group', 'aria-label': 'Sugestões de pergunta' });
  const drawSuggestions = () => suggestions.replaceChildren(...(SUGGESTIONS[useContext && context ? context.type : 'none'] || SUGGESTIONS.none)
    .map((text) => button(text, { size: 'sm', variant: 'secondary', onClick: () => { input.value = text; input.focus(); updateCount(); } })));
  const updateCount = () => { counter.textContent = `${input.value.length}/${MAX}`; };
  input.addEventListener('input', updateCount);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); form.requestSubmit(); } });
  const form = el('form', { class: 'copilot-form', novalidate: true }, [field({ label: 'Sua pergunta', control: input }), el('div', { class: 'copilot-form-actions' }, [counter, stop, send])]);
  let current = null;
  const ask = async (text) => {
    const q = text.trim();
    if (q.length < 3) { input.focus(); return; }
    const scoped = useContext && context;
    const full = scoped ? `Sobre ${CONTEXT_NOUN[context.type] || 'o registro'} "${context.label}" (${TYPE_LABEL[context.type] || 'registro'} em foco na tela): ${q}` : q;
    if (full.length > MAX) { toast(`A pergunta com o contexto passa de ${MAX} caracteres. Encurte o texto.`, 'error'); return; }
    const turn = { question: q, scope: scoped ? context.label : null, state: 'loading' };
    turns.push(turn);
    const node = turnNode(turn);
    log.append(node);
    node.scrollIntoView({ block: 'nearest' });
    input.value = ''; updateCount();
    const token = current = {};
    send.disabled = true; stop.hidden = false;
    try {
      const result = await ctx.send('copilot/ask', { organization_id: ctx.organization.id, question: full });
      if (token !== current || turn.state === 'cancelled') return;
      Object.assign(turn, { state: 'done', result });
    } catch (error) {
      if (token !== current || turn.state === 'cancelled') return;
      Object.assign(turn, { state: 'error', error, retry: () => ask(q) });
    } finally {
      if (token === current) { send.disabled = false; stop.hidden = true; current = null; }
      node.replaceWith(turnNode(turn));
    }
  };
  stop.addEventListener('click', () => {
    const last = turns.at(-1);
    if (last?.state === 'loading') { last.state = 'cancelled'; current = null; send.disabled = false; stop.hidden = true; log.lastElementChild?.replaceWith(turnNode(last)); }
  });
  form.addEventListener('submit', (event) => { event.preventDefault(); if (!send.disabled) ask(input.value); });

  function turnNode(turn) {
    const head = el('div', { class: 'copilot-q' }, [el('strong', { text: 'Você' }), turn.scope ? el('span', { class: 'muted small', text: ` · sobre ${turn.scope}` }) : null, el('p', { text: turn.question })]);
    const box = el('article', { class: 'copilot-turn', dataset: { state: turn.state } }, [head]);
    if (turn.state === 'loading') box.append(el('p', { class: 'muted small copilot-loading', role: 'status' }, [icon('clock', { size: 14 }), ' Consultando seus registros autorizados…']));
    if (turn.state === 'cancelled') box.append(el('p', { class: 'muted small', text: 'Pergunta cancelada nesta tela. Consultas não gravam nada.' }));
    if (turn.state === 'error') {
      const info = copilotErrorMessage(turn.error);
      box.append(el('div', { class: 'callout callout-warning compact', role: 'alert' }, [el('strong', { text: info.title }), el('p', { class: 'small', text: info.text }),
        el('div', { class: 'crm-row-actions' }, [
          info.retry ? button('Tentar novamente', { size: 'sm', iconName: 'refresh', onClick: () => { turns.splice(turns.indexOf(turn), 1); box.remove(); turn.retry(); } }) : null,
          info.guided ? button('Abrir consultas guiadas', { size: 'sm', iconName: 'search', onClick: () => import('./guided-queries.js').then((m) => m.openGuidedQueries(ctx, context?.type === 'provider' && useContext ? { providerId: context.id, providerName: context.label } : {})) }) : null,
          sessionLink(turn.error)
        ])]));
    }
    if (turn.state === 'done') box.append(answerNode(turn.result));
    return box;
  }
  function answerNode(r) {
    const sources = Array.isArray(r.sources) ? r.sources : [];
    const actions = Array.isArray(r.prepared_actions) ? r.prepared_actions : [];
    return el('div', { class: 'copilot-a' }, [
      el('div', { class: 'copilot-a-head' }, [icon('sparkles', { size: 14 }), el('strong', { text: 'Copilot' }), el('span', { class: 'muted small', text: ' · texto gerado por IA a partir das fontes abaixo; confira antes de decidir' })]),
      el('p', { class: 'copilot-answer', text: r.answer || '' }),
      sources.length ? el('section', { class: 'copilot-sources', 'aria-label': 'Fontes' }, [el('h4', { text: `Fontes (${sources.length})` }),
        el('ol', { class: 'plain-list' }, sources.map((s) => {
          const href = sourceHref(ctx, s);
          const meta = [TYPE_LABEL[s.object_type] || 'Registro', s.version != null ? `versão ${s.version}` : null, s.updated_at ? `atualizado em ${formatDate(s.updated_at)}` : null].filter(Boolean).join(' · ');
          return el('li', {}, [href ? el('a', { href, text: s.label || 'Registro' }) : el('span', { text: s.label || 'Registro' }), el('span', { class: 'muted small', text: ` — ${meta}` })]);
        }))])
        : el('p', { class: 'muted small', text: actions.length ? 'Nenhuma fonte consultada: a ação abaixo é só uma proposta para sua revisão.' : 'Sem fontes: a resposta não afirma fatos financeiros.' }),
      ...actions.map(actionNode),
      el('p', { class: 'muted small copilot-meta', text: 'Conversa não é salva: uma nova pergunta consulta as fontes de novo.' })
    ]);
  }
  function actionNode(action) {
    if (action?.prepared_action) action = action.prepared_action;
    if (action?.type !== 'create_crm_activity' || !action.payload?.values) return el('p', { class: 'muted small', text: 'O Copilot sugeriu uma ação que esta tela ainda não sabe revisar. Nada foi executado.' });
    const v = action.payload.values;
    return el('section', { class: 'copilot-action', 'aria-label': 'Atividade preparada para revisão' }, [
      el('h4', { text: 'Atividade preparada — ainda não gravada' }),
      el('dl', { class: 'deflist deflist-2' }, [
        ['Tipo', ACTIVITY_KINDS[v.kind] || 'Atividade'], ['Assunto', v.subject], ['Prazo', v.due_on ? formatDate(v.due_on) : v.occurred_at ? `Aconteceu em ${formatDateTime(v.occurred_at)}` : 'Sem prazo'],
        ['Situação', v.status === 'planned' ? 'Compromisso planejado' : v.status === 'recorded' ? 'Já realizada' : 'Planejada'], ['Observações', v.notes || '—'], ['Fonte', v.source_reference]
      ].map(([k, value]) => el('div', { class: 'deflist-row' }, [el('dt', { text: k }), el('dd', { text: value || '—' })]))),
      el('p', { class: 'muted small', text: action.notice || 'Vínculos, responsável e estado são autorizados de novo na confirmação.' }),
      el('div', { class: 'crm-row-actions' }, [button('Revisar e confirmar', { size: 'sm', variant: 'primary', iconName: 'check', onClick: () => reviewAction(ctx, action) })])
    ]);
  }

  const body = el('div', { class: 'stack copilot' }, [
    el('p', { class: 'callout callout-info compact', role: 'note', text: 'O Copilot consulta apenas os registros que você já pode ver, cita as fontes e só prepara atividades: nada é gravado, enviado ou decidido sem a sua confirmação. Não recomenda instituição.' }),
    scopeChip, suggestions, log, form]);
  for (const turn of turns) log.append(turnNode(turn));
  drawScope(); drawSuggestions(); updateCount();
  openDialog = drawer({ title: 'Copilot financeiro', subtitle: 'Perguntas sobre seus contratos, instituições, negociações e relacionamento.', body, className: 'drawer-wide copilot-drawer', onClose: () => { openDialog = null; } });
  queueMicrotask(() => input.focus());
  return openDialog;
}

/** Revisão humana da atividade preparada; grava somente aqui, por copilot/confirm. */
export function reviewAction(ctx, action) {
  const p = action.payload;
  const v = { ...p.values };
  const kind = el('select', { class: 'input' }, Object.entries(ACTIVITY_KINDS).map(([k, label]) => new Option(label, k, false, k === v.kind)));
  const subject = el('input', { class: 'input', maxlength: '200', value: v.subject || '' });
  const due = el('input', { class: 'input', type: 'date', value: v.due_on || '' });
  const notes = el('textarea', { class: 'input', rows: '3', maxlength: '4000' });
  notes.value = v.notes || '';
  const source = el('input', { class: 'input', maxlength: '500', value: v.source_reference || '' });
  const planned = (v.status || (v.due_on ? 'planned' : null)) === 'planned' || !v.occurred_at;
  const fields = [field({ label: 'Tipo', control: kind }), field({ label: 'Assunto', control: subject, required: true }),
    planned ? field({ label: 'Prazo', control: due, required: true }) : null, field({ label: 'Observações', control: notes, optionalLabel: true }),
    field({ label: 'Fonte', control: source, required: true, hint: 'Origem da informação. Fica no histórico da atividade.' })].filter(Boolean);
  const errors = el('div', { class: 'callout callout-error', role: 'alert', hidden: true });
  const save = button('Confirmar e gravar', { variant: 'primary', type: 'submit' });
  const form = el('form', { class: 'stack', novalidate: true }, [
    el('p', { class: 'muted small', text: 'Revise os campos. A atividade só é registrada depois que você confirmar; o banco autoriza novamente vínculos e responsável.' }), ...fields, errors, save]);
  const dialog = drawer({ title: 'Revisar atividade preparada', body: form });
  let pending = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    const values = { ...v, kind: kind.value, subject: subject.value.trim(), notes: notes.value.trim() || null, source_reference: source.value.trim() };
    if (planned) { values.due_on = due.value || null; values.status = 'planned'; }
    let bad = null;
    for (const [node, ok, text] of [[subject, values.subject.length >= 2, 'Informe o assunto.'], [source, values.source_reference.length >= 2, 'Informe a fonte.'], ...(planned ? [[due, Boolean(values.due_on), 'Informe o prazo.']] : [])]) {
      node.closest('.field').setError(ok ? '' : text);
      if (!ok && !bad) bad = node;
    }
    if (bad) { bad.focus(); return; }
    if (values.notes === null) delete values.notes;
    pending = true; save.disabled = true; errors.hidden = true;
    try {
      const result = await ctx.send('copilot/confirm', { organization_id: p.organization_id || ctx.organization.id, ...(p.legal_entity_id ? { legal_entity_id: p.legal_entity_id } : {}), request_key: p.request_key || (p.request_key = uid()), values, confirmation: true });
      dialog.close();
      const provider = values.related_type === 'provider' ? values.related_id : null;
      toast(result.replayed ? 'Esta atividade já tinha sido registrada; nada foi duplicado.' : 'Atividade registrada.', 'success',
        provider ? { action: el('a', { class: 'btn btn-sm btn-ghost', href: ctx.href(`/finance/providers.html?provider_id=${encodeURIComponent(provider)}`), text: 'Abrir instituição' }) } : {});
    } catch (error) {
      errors.replaceChildren(el('span', { text: error.status === 409 ? 'Esta confirmação já foi usada com outro conteúdo. Nada foi sobrescrito.'
        : error.status === 400 ? 'O banco recusou a atividade: confira assunto, fonte, prazo e vínculo. Nada foi gravado.'
          : error.status === 403 ? 'Seu acesso não permite registrar esta atividade.'
            : !error.status || error.status >= 500 ? 'Sem confirmação do servidor. Pode ter sido gravada: repetir aqui reenvia a mesma ação, sem duplicar.' : (error.message || 'Não foi possível gravar.') }), ...(sessionLink(error) ? [' ', sessionLink(error)] : []));
      errors.hidden = false;
      save.disabled = false;
      if (!error.status || error.status >= 500) save.querySelector('.btn-label').textContent = 'Repetir a mesma confirmação';
    } finally { pending = false; }
  });
  return dialog;
}

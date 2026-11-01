// Financial Relationship Workspace (CRM visual 1.0).
//
// Consome somente o contrato `financial-crm-v1` (docs/FINANCIAL_CRM_V1.md):
// GET/POST/PATCH crm-contacts, crm-activities, crm-processes e GET crm-history.
// Nada é calculado ou inventado aqui: contagens são do que foi carregado, cada
// registro mostra sua fonte declarada, e uma etapa comercial "Ganho" não fecha
// contrato nem altera a negociação financeira.
//
// Regras de escrita do contrato aplicadas na tela:
// - uma `request_key` por intenção: repetir após falha incerta reenvia a MESMA
//   chave (replay), nunca uma nova;
// - PATCH sempre com `expected_version`; 409 vira conflito legível, com o que a
//   pessoa digitou preservado e opção de recarregar;
// - sucesso só depois da resposta do servidor.

import { el, icon, formatDate, formatDateTime, todayIso, uid, plural, productLabel } from '../core.js';
import { button, tag, field, drawer, toast, loading, errorState, emptyState, confirmDialog, onSubmit, sessionLink } from '../ui.js';

export const ACTIVITY_KINDS = Object.freeze({
  meeting: 'Reunião', call: 'Ligação', commercial_interaction: 'Interação comercial', note: 'Nota interna',
  follow_up: 'Follow-up', commitment: 'Compromisso', email_record: 'E-mail (anotação)'
});
export const ACTIVITY_STATUS = Object.freeze({ recorded: ['Realizada', 'success'], planned: ['Planejada', 'info'], cancelled: ['Cancelada', 'neutral'], archived: ['Arquivada', 'neutral'] });
export const STAGES = Object.freeze({
  prospect: 'Prospecção', qualification: 'Qualificação', engagement: 'Relacionamento ativo',
  negotiation: 'Em negociação', won: 'Ganho (declarado)', lost: 'Encerrado sem acordo'
});
const STAGE_ORDER = Object.keys(STAGES);
const REFERENCE_LABEL = { provider: 'Instituição', contract: 'Contrato', rfq: 'Negociação', opportunity: 'Oportunidade', proposal: 'Proposta', task: 'Tarefa' };
const EVENT_TEXT = {
  crm_contact_created: 'Contato registrado', crm_contact_updated: 'Contato atualizado', crm_activity_created: 'Atividade registrada',
  crm_activity_updated: 'Atividade atualizada', crm_process_created: 'Processo criado', crm_process_updated: 'Processo atualizado'
};
const FIELD_TEXT = {
  name: 'nome', title: 'cargo ou título', email: 'e-mail', phone: 'telefone', owner_id: 'responsável', source_reference: 'fonte', status: 'estado',
  kind: 'tipo', subject: 'assunto', notes: 'observações', occurred_at: 'data em que aconteceu', due_on: 'prazo', contact_id: 'contato', process_id: 'processo',
  related_type: 'vínculo', related_id: 'vínculo', stage: 'etapa', next_action: 'próximo passo', outcome: 'resultado'
};

/** Mensagem legível para os erros do contrato CRM; nunca texto técnico. */
export function crmErrorMessage(error) {
  if (!error) return 'Não foi possível concluir. Tente novamente.';
  if (error.status === 409) return 'Outra pessoa alterou este registro depois que você o abriu, ou esta mesma ação já foi enviada com outro conteúdo. Nada foi sobrescrito: recarregue para ver a versão atual.';
  if (error.status === 403) return 'Seu acesso não permite esta ação nesta organização ou entidade. Peça a quem administra o Arandu.';
  if (error.status === 404) return 'Registro indisponível no seu escopo. Ele pode ter sido arquivado ou pertencer a outra entidade.';
  if (error.status === 503) return 'O registro comercial ainda não está disponível neste ambiente. Nada foi gravado.';
  if (error.status === 400) return 'Confira os campos obrigatórios, a fonte e o vínculo escolhido. Nada foi gravado.';
  if (error.status === 401) return error.message;
  if (!error.status || error.status >= 500) return 'Não recebemos confirmação do servidor. Pode ter sido gravado: confira a lista antes de repetir. Repetir aqui reenvia a mesma ação, sem duplicar.';
  return error.message || 'Não foi possível concluir.';
}

const enc = encodeURIComponent;
const memberLabel = (ctx, id) => {
  if (!id) return 'Sem responsável';
  const row = (ctx.members || []).find((m) => m.user_id === id);
  if (!row) return 'Pessoa sem acesso atual';
  return `${row.display_name || row.email || 'Pessoa da equipe'}${id === ctx.viewer?.id ? ' (você)' : ''}`;
};
const writers = (ctx) => (ctx.members || []).filter((m) => m.user_id && ['admin', 'finance_manager', 'analyst', 'provider_user'].includes(m.role));
/** Escrita no CRM: buyer admin/gestão/analista; instituição admin/usuário da instituição (contrato §Transporte). */
export function canWriteCrm(ctx) {
  const role = ctx.viewer?.role || (ctx.members || []).find((m) => m.user_id === ctx.viewer?.id)?.role;
  return ['admin', 'finance_manager', 'analyst', 'provider_user'].includes(role);
}
function localDateTime(value) {
  const d = value ? new Date(value) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** datetime-local → ISO com fuso (o contrato exige timezone explícito). */
function isoWithZone(local) {
  const d = new Date(local);
  if (!Number.isFinite(d.getTime())) return null;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const pad = (n) => String(Math.trunc(Math.abs(n))).padStart(2, '0');
  return `${local.length === 16 ? `${local}:00` : local}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

/** Lê todas as páginas de um recurso CRM (até `max` linhas), seguindo `next`. */
export async function crmList(ctx, resource, params = {}, { max = 200 } = {}) {
  const rows = [];
  let after = null;
  do {
    const q = new URLSearchParams({ organization_id: ctx.organization.id, limit: '100', ...params });
    if (after) q.set('after', after);
    const page = await ctx.api(`${resource}?${q}`);
    rows.push(...(page.rows || []));
    after = page.next;
  } while (after && rows.length < max);
  return { rows, truncated: Boolean(after) };
}

// ----------------------------------------------------------------- formulário
/**
 * Formulário CRM em painel. `fields`: [{ key, label, control, required, hint, read }].
 * Uma chave idempotente por abertura; a mesma chave é reenviada se a pessoa
 * repetir após falha incerta. Fecha só com confirmação do servidor.
 */
function crmForm({ title, intro = null, fields, send, done, onSaved, onConflict = null }) {
  const requestKey = uid();
  const errors = el('div', { class: 'callout callout-error', role: 'alert', hidden: true });
  const save = button('Gravar', { variant: 'primary', type: 'submit' });
  const form = el('form', { class: 'stack crm-form', novalidate: true }, [intro ? el('p', { class: 'muted small', text: intro }) : null]);
  const wrapped = fields.filter(Boolean).map((spec) => {
    const wrap = field({ label: spec.label, control: spec.control, hint: spec.hint || null, required: Boolean(spec.required), optionalLabel: !spec.required && !spec.noOptional });
    if (spec.hidden) wrap.hidden = true;
    spec.wrap = wrap;
    form.append(wrap);
    return spec;
  });
  form.append(errors, el('div', { class: 'form-actions' }, [save]));
  let dirty = false;
  form.addEventListener('input', () => { dirty = true; });
  const dialog = drawer({ title, body: form, confirmClose: async () => !dirty || confirmDialog({ title: 'Descartar o que foi preenchido?', description: 'Nada deste formulário foi gravado.', confirmLabel: 'Descartar', tone: 'danger' }) });
  onSubmit(form, async (event) => {
    event.preventDefault();
    errors.hidden = true;
    let firstInvalid = null;
    const values = {};
    for (const spec of wrapped) {
      if (spec.wrap.hidden) { spec.wrap.setError(''); continue; }
      const raw = spec.read ? spec.read() : (spec.control.value.trim() === '' ? null : spec.control.value.trim());
      const problem = spec.required && (raw === null || raw === '') ? `Informe ${spec.label.toLowerCase()}.` : spec.validate?.(raw) || '';
      spec.wrap.setError(problem);
      if (problem && !firstInvalid) firstInvalid = spec.control;
      if (raw !== undefined && !(raw === null && spec.skipNull)) values[spec.key] = raw;
    }
    if (firstInvalid) { firstInvalid.focus(); return; }
    try {
      const result = await send(values, requestKey);
      dirty = false;
      dialog.close();
      toast(result?.replayed ? `${done} (a mesma ação já havia sido registrada; nada foi duplicado)` : done);
      onSaved?.(result);
    } catch (error) {
      errors.replaceChildren(el('span', { text: crmErrorMessage(error) }), ...(sessionLink(error) ? [' ', sessionLink(error)] : []),
        ...(error.status === 409 && onConflict ? [' ', button('Recarregar dados', { size: 'sm', iconName: 'refresh', onClick: () => { dirty = false; dialog.close(); onConflict(); } })] : []));
      errors.hidden = false;
      if (!error.status || error.status >= 500) save.querySelector('.btn-label').textContent = 'Repetir a mesma ação';
    }
  });
  return dialog;
}
const input = (attrs = {}) => el('input', { class: 'input', ...attrs });
const textarea = (attrs = {}) => el('textarea', { class: 'input', rows: '3', ...attrs });
function select(options, value = '') {
  const node = el('select', { class: 'input' });
  for (const [v, label] of options) node.add(new Option(label, v, false, v === value));
  node.value = value ?? '';
  return node;
}
const ownerOptions = (ctx) => [['', 'Sem responsável definido'], ...writers(ctx).map((m) => [m.user_id, memberLabel(ctx, m.user_id)])];

// ------------------------------------------------------------- workspace
/**
 * Workspace de relacionamento de UMA instituição: contatos, atividades/agenda,
 * processos comerciais e histórico. `links`: contratos e negociações da
 * instituição já autorizados no painel, usados como vínculos possíveis.
 *
 * Buyer: escopo é `provider` (cadastro do comprador). Instituição: escopo é a
 * própria organização, com `counterparty` opcional (convite aceito).
 */
export function crmWorkspace(ctx, { provider = null, contracts = [], rfqs = [], entities = null, counterparty = null } = {}) {
  const write = canWriteCrm(ctx);
  const root = el('section', { class: 'cc-section crm-workspace', 'aria-labelledby': 'crm-title' });
  const state = { contacts: [], activities: [], processes: [], truncated: false, error: null, loaded: false };
  const scopeId = provider?.id || counterparty?.id || null;
  const links = [
    ...(provider ? [['provider', provider.id, `Instituição: ${provider.name}`]] : []),
    ...contracts.map((c) => ['contract', c.id, `Contrato: ${c.title || productLabel(c.product) || 'sem título'}`]),
    ...rfqs.map((r) => ['rfq', r.id, `Negociação: ${r.title || productLabel(r.product)}`])
  ];
  const linkLabel = (type, id) => links.find(([t, i]) => t === type && i === id)?.[2] || (type ? `${REFERENCE_LABEL[type] || 'Registro'} vinculado` : null);
  const linkHref = (type, id) => type === 'contract' ? ctx.href(`/finance/contracts.html?abrir=contrato#contract-${id}`)
    : type === 'rfq' ? ctx.href(`/finance/rfq.html?id=${enc(id)}`)
      : type === 'opportunity' ? ctx.href(`/finance/opportunities.html#opportunity-${id}`)
        : type === 'task' ? ctx.href(`/finance/tasks.html#task-${id}`) : null;

  async function load() {
    root.replaceChildren(head(), loading('Carregando relacionamento comercial…'));
    try {
      const contactParams = provider ? { provider_id: provider.id } : {};
      const contacts = await crmList(ctx, 'crm-contacts', contactParams);
      // O contrato não filtra atividades/processos por instituição: buscamos os
      // vinculados à instituição, aos seus contratos/negociações e aos seus contatos.
      const anchors = [...links.map(([, id]) => ['related_id', id]), ...contacts.rows.slice(0, 20).map((c) => ['contact_id', c.id])].slice(0, 30);
      const fanout = async (resource) => {
        if (!provider) return crmList(ctx, resource, {});
        const pages = await Promise.all(anchors.map(([key, id]) => crmList(ctx, resource, { [key]: id, ...(resource === 'crm-processes' ? {} : {}) }, { max: 100 })));
        const byId = new Map();
        for (const page of pages) for (const row of page.rows) byId.set(row.id, row);
        return { rows: [...byId.values()], truncated: pages.some((p) => p.truncated) || links.length + contacts.rows.length > 30 };
      };
      const [activities, processes] = await Promise.all([fanout('crm-activities'), fanout('crm-processes')]);
      Object.assign(state, { contacts: contacts.rows, activities: activities.rows, processes: processes.rows, truncated: contacts.truncated || activities.truncated || processes.truncated, error: null, loaded: true });
      render();
    } catch (error) {
      state.error = error;
      root.replaceChildren(head(), error.status === 503
        ? el('p', { class: 'callout callout-info compact', text: 'O registro comercial (contatos, atividades e processos) ainda não está disponível neste ambiente.' })
        : errorState({ title: 'Não foi possível carregar o relacionamento comercial', error: { ...error, message: crmErrorMessage(error) }, onRetry: load }));
    }
  }
  function head() {
    return el('div', { class: 'cc-head' }, [
      el('div', {}, [el('h3', { id: 'crm-title', text: 'Relacionamento comercial' }),
        el('p', { class: 'muted small', text: 'Contatos, reuniões, compromissos e processos registrados pela sua equipe. São declarações da organização: não comprovam envio, aceite da instituição nem mudam a negociação financeira.' })]),
      el('div', { class: 'crm-actions' }, [
        provider && ctx.mode !== 'demo' ? button('Resumir com o Copilot', { size: 'sm', variant: 'ghost', iconName: 'sparkles', onClick: () => import('./copilot.js').then((m) => m.openCopilot(ctx, { context: { type: 'provider', id: provider.id, label: provider.name }, question: 'Resuma nosso relacionamento com esta instituição: contatos, atividades pendentes, processos e contratos.' })) }) : null,
        state.loaded ? button('Atualizar', { size: 'sm', variant: 'ghost', iconName: 'refresh', onClick: load }) : null])
    ]);
  }

  function render() {
    const today = todayIso();
    const planned = state.activities.filter((a) => a.status === 'planned');
    const overdue = planned.filter((a) => a.due_on && a.due_on < today);
    const tabsBar = el('div', { class: 'segmented crm-tabs', role: 'tablist', 'aria-label': 'Relacionamento comercial' });
    const panel = el('div', { class: 'crm-panel', role: 'tabpanel', tabindex: '-1' });
    const items = [
      ['agenda', `Agenda${overdue.length ? ` · ${overdue.length} vencido${overdue.length > 1 ? 's' : ''}` : ''}`, agendaView],
      ['contatos', `Contatos (${state.contacts.filter((c) => !c.archived_at).length})`, contactsView],
      ['atividades', `Atividades (${state.activities.length})`, activitiesView],
      ['processos', `Processos (${state.processes.length})`, processesView]
    ];
    const buttons = items.map(([id, label, view]) => {
      const tab = el('button', { type: 'button', role: 'tab', class: 'segment', id: `crm-tab-${id}`, 'aria-controls': 'crm-panel', 'aria-selected': 'false', dataset: { crmTab: id }, text: label });
      tab.addEventListener('click', () => show(id));
      tab.addEventListener('keydown', (event) => {
        const i = items.findIndex(([key]) => key === id);
        const next = event.key === 'ArrowRight' ? items[(i + 1) % items.length] : event.key === 'ArrowLeft' ? items[(i - 1 + items.length) % items.length] : null;
        if (next) { event.preventDefault(); show(next[0]); tabsBar.querySelector(`[data-crm-tab="${next[0]}"]`).focus(); }
      });
      return tab;
    });
    panel.id = 'crm-panel';
    tabsBar.append(...buttons);
    const show = (id) => {
      root.dataset.crmView = id;
      for (const tab of buttons) { const on = tab.dataset.crmTab === id; tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1; }
      panel.setAttribute('aria-labelledby', `crm-tab-${id}`);
      panel.replaceChildren(items.find(([key]) => key === id)[2]());
    };
    const actions = write ? el('div', { class: 'crm-actions' }, [
      button('Novo contato', { size: 'sm', iconName: 'plus', onClick: () => contactForm() }),
      button('Registrar atividade', { size: 'sm', iconName: 'calendar', onClick: () => activityForm() }),
      button('Novo processo', { size: 'sm', variant: 'primary', iconName: 'flag', onClick: () => processForm() })
    ]) : el('p', { class: 'muted small', text: 'Seu acesso permite consultar o relacionamento comercial, sem registrar ou alterar.' });
    root.replaceChildren(head(), actions,
      ...(state.truncated ? [el('p', { class: 'callout callout-info compact', role: 'note', text: 'Há mais registros do que o recorte carregado (vínculos com até 30 contratos, negociações e contatos). Use a busca para localizar um registro específico.' })] : []),
      tabsBar, panel);
    show(root.dataset.crmView || (planned.length ? 'agenda' : 'contatos'));
  }
  const reload = () => load();

  // ------------------------------------------------------------ contatos
  function contactsView() {
    const search = input({ type: 'search', placeholder: 'Buscar por nome, cargo ou e-mail', 'aria-label': 'Buscar contato' });
    const status = select([['active', 'Ativos'], ['archived', 'Arquivados'], ['all', 'Todos']], 'active');
    status.setAttribute('aria-label', 'Situação do contato');
    const list = el('ul', { class: 'plain-list crm-list', role: 'list' });
    const count = el('p', { class: 'muted small', role: 'status' });
    const draw = () => {
      const term = search.value.trim().toLocaleLowerCase('pt-BR');
      const rows = state.contacts.filter((c) => (status.value === 'all' || (status.value === 'archived') === Boolean(c.archived_at))
        && (!term || [c.name, c.title, c.email].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(term)));
      count.textContent = `${plural(rows.length, 'contato', 'contatos')} no recorte carregado`;
      list.replaceChildren(...rows.map(contactRow));
      if (!rows.length) list.append(el('li', {}, emptyState({ compact: true, iconName: 'users', title: state.contacts.length ? 'Nenhum contato neste filtro' : 'Nenhum contato registrado', text: write && !state.contacts.length ? 'Registre gerentes, analistas e outras pessoas com quem a equipe fala nesta instituição.' : null })));
    };
    search.addEventListener('input', draw);
    status.addEventListener('change', draw);
    draw();
    return el('div', { class: 'stack' }, [el('div', { class: 'toolbar' }, [el('div', { class: 'toolbar-search' }, [icon('search'), search]), status]), count, list]);
  }
  function contactRow(c) {
    const acts = state.activities.filter((a) => a.contact_id === c.id).length;
    return el('li', { class: 'crm-row', id: `crm-contact-${c.id}`, dataset: { crm: 'contact' } }, [
      el('div', { class: 'crm-row-main' }, [
        el('strong', { text: c.name }),
        el('span', { class: 'muted small', text: [c.title, c.email, c.phone, entities && c.legal_entity_id ? entities.byId?.get(c.legal_entity_id)?.legal_name : null].filter(Boolean).join(' · ') || 'Sem cargo ou contato informado' }),
        el('span', { class: 'muted small', text: `Responsável: ${memberLabel(ctx, c.owner_id)} · ${plural(acts, 'atividade', 'atividades')} · fonte: ${c.source_reference || 'não informada (registro anterior)'}` })
      ]),
      c.archived_at ? tag('Arquivado', 'neutral') : null,
      el('div', { class: 'crm-row-actions' }, [
        button('Histórico', { size: 'sm', variant: 'ghost', onClick: () => historyDrawer('contact', c.id, c.name) }),
        write && !c.archived_at ? button('Editar', { size: 'sm', variant: 'ghost', iconName: 'edit', attrs: { 'aria-label': `Editar ${c.name}` }, onClick: () => contactForm(c) }) : null,
        write && !c.archived_at ? button('Registrar atividade', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `Registrar atividade com ${c.name}` }, onClick: () => activityForm({ contact_id: c.id }) }) : null,
        write ? button(c.archived_at ? 'Reativar' : 'Arquivar', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `${c.archived_at ? 'Reativar' : 'Arquivar'} ${c.name}` }, onClick: () => toggleArchive('crm-contacts', c, c.archived_at ? 'active' : 'archived', c.name) }) : null
      ])
    ]);
  }
  function contactForm(row = null) {
    const name = input({ maxlength: '120', value: row?.name || '' });
    const title = input({ maxlength: '120', value: row?.title || '' });
    const email = input({ type: 'email', maxlength: '254', value: row?.email || '' });
    const phone = input({ type: 'tel', maxlength: '40', value: row?.phone || '' });
    const owner = select(ownerOptions(ctx), row?.owner_id || '');
    const source = input({ maxlength: '500', value: row ? '' : '', placeholder: 'Ex.: cartão de visita entregue na reunião de 10/10' });
    const entity = !row && entities?.rows?.length && !counterparty ? select([['', 'Nível de grupo (todas as entidades)'], ...entities.rows.map((e) => [e.id, e.legal_name])], '') : null;
    const fields = [
      { key: 'name', label: 'Nome', control: name, required: true, validate: (v) => /@/.test(v || '') ? 'Use o nome da pessoa; o e-mail vai no campo próprio.' : (v || '').length < 2 ? 'Mínimo de 2 caracteres.' : '' },
      { key: 'title', label: 'Cargo ou função', control: title, skipNull: !row, validate: (v) => v && v.length < 2 ? 'Mínimo de 2 caracteres.' : '' },
      { key: 'email', label: 'E-mail', control: email, skipNull: !row, validate: (v) => v && !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(v) ? 'E-mail em formato inválido.' : '' },
      { key: 'phone', label: 'Telefone', control: phone, skipNull: !row, validate: (v) => v && !/^[0-9+() .-]{6,40}$/.test(v) ? 'Use apenas números, espaço, +, ( ) e -.' : '' },
      { key: 'owner_id', label: 'Responsável na sua equipe', control: owner, skipNull: true },
      entity ? { key: '__entity', label: 'Entidade', control: entity, hint: 'Contato específico de uma entidade só aparece para quem tem acesso a ela.', read: () => undefined } : null,
      { key: 'source_reference', label: row ? 'Fonte desta alteração' : 'Fonte da informação', control: source, required: true, hint: 'De onde veio o dado (reunião, e-mail, cartão). Fica no histórico.' }
    ];
    crmForm({
      title: row ? `Editar contato: ${row.name}` : `Novo contato${provider ? ` · ${provider.name}` : ''}`,
      intro: row ? 'Só os campos alterados são enviados. Se alguém tiver editado antes, nada é sobrescrito.' : null,
      fields, done: row ? 'Contato atualizado.' : 'Contato registrado.', onSaved: reload, onConflict: reload,
      send: (values, key) => {
        if (row) {
          const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => k === 'source_reference' || (row[k] ?? null) !== v));
          if (Object.keys(changed).length === 1) return Promise.reject(Object.assign(new Error('Nenhum campo foi alterado.'), { status: 422, message: 'Nenhum campo foi alterado.' }));
          return ctx.api('crm-contacts', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, id: row.id, expected_version: row.version, request_key: key, values: changed }) });
        }
        return ctx.api('crm-contacts', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, legal_entity_id: entity?.value || null, provider_id: provider?.id || null, counterparty_organization_id: counterparty?.id || null, request_key: key, values }) });
      }
    });
  }

  async function toggleArchive(resource, row, status, label) {
    const archiving = status === 'archived';
    const ok = await confirmDialog({ title: archiving ? `Arquivar ${label}?` : `Reativar ${label}?`, description: archiving ? 'O registro sai das listas ativas, mas continua no histórico e pode ser reativado.' : 'O registro volta às listas ativas.', confirmLabel: archiving ? 'Arquivar' : 'Reativar', tone: archiving ? 'danger' : 'primary' });
    if (!ok) return;
    const source = archiving ? 'Arquivado pela equipe na Central de Relacionamentos' : 'Reativado pela equipe na Central de Relacionamentos';
    try {
      await ctx.api(resource, { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, id: row.id, expected_version: row.version, request_key: uid(), values: { status, source_reference: source } }) });
      toast(archiving ? 'Registro arquivado.' : 'Registro reativado.');
      reload();
    } catch (error) { toast(crmErrorMessage(error), 'error'); if (error.status === 409) reload(); }
  }

  // ----------------------------------------------------------- atividades
  function activitiesView() {
    const kind = select([['', 'Todos os tipos'], ...Object.entries(ACTIVITY_KINDS)], '');
    kind.setAttribute('aria-label', 'Tipo de atividade');
    const when = select([['', 'Realizadas e planejadas'], ['recorded', 'Já aconteceram'], ['planned', 'Compromissos futuros e pendentes'], ['cancelled', 'Canceladas'], ['archived', 'Arquivadas']], '');
    when.setAttribute('aria-label', 'Situação da atividade');
    const list = el('ul', { class: 'plain-list crm-list', role: 'list' });
    const draw = () => {
      const rows = state.activities.filter((a) => (!kind.value || a.kind === kind.value) && (when.value ? a.status === when.value : ['recorded', 'planned'].includes(a.status)))
        .sort((a, b) => String(b.occurred_at || b.due_on || '').localeCompare(String(a.occurred_at || a.due_on || '')));
      list.replaceChildren(...rows.map(activityRow));
      if (!rows.length) list.append(el('li', {}, emptyState({ compact: true, iconName: 'calendar', title: 'Nenhuma atividade neste filtro', text: write ? 'Registre reuniões, ligações, notas e compromissos para formar a memória do relacionamento.' : null })));
    };
    kind.addEventListener('change', draw); when.addEventListener('change', draw);
    draw();
    return el('div', { class: 'stack' }, [el('div', { class: 'toolbar' }, [kind, when]), list]);
  }
  function activityRow(a) {
    const [statusLabel, tone] = ACTIVITY_STATUS[a.status] || ['Situação não informada', 'neutral'];
    const late = a.status === 'planned' && a.due_on && a.due_on < todayIso();
    const contact = state.contacts.find((c) => c.id === a.contact_id);
    const process = state.processes.find((p) => p.id === a.process_id);
    const href = linkHref(a.related_type, a.related_id);
    const when = a.status === 'recorded' ? `Aconteceu em ${formatDateTime(a.occurred_at)}` : a.due_on ? `${late ? 'Venceu em' : 'Prazo'} ${formatDate(a.due_on)}` : 'Sem prazo';
    return el('li', { class: `crm-row${late ? ' crm-row-late' : ''}`, id: `crm-activity-${a.id}`, dataset: { crm: 'activity', status: a.status } }, [
      el('div', { class: 'crm-row-main' }, [
        el('span', { class: 'muted small', text: ACTIVITY_KINDS[a.kind] || 'Atividade' }),
        el('strong', { text: a.subject }),
        el('span', { class: 'small', text: [when, contact ? `com ${contact.name}` : null, `responsável: ${memberLabel(ctx, a.owner_id)}`].filter(Boolean).join(' · ') }),
        a.notes ? el('p', { class: 'small crm-notes', text: a.notes }) : null,
        el('span', { class: 'muted small' }, [`Fonte: ${a.source_reference}`, process ? ` · Processo: ${process.title}` : '', ...(a.related_type ? [' · ', href ? el('a', { href, text: linkLabel(a.related_type, a.related_id) }) : linkLabel(a.related_type, a.related_id)] : [])])
      ]),
      tag(late ? 'Vencida' : statusLabel, late ? 'danger' : tone),
      el('div', { class: 'crm-row-actions' }, [
        button('Histórico', { size: 'sm', variant: 'ghost', onClick: () => historyDrawer('activity', a.id, a.subject) }),
        write && a.status === 'planned' ? button('Marcar como realizada', { size: 'sm', attrs: { 'aria-label': `Marcar como realizada: ${a.subject}` }, onClick: () => completeActivity(a) }) : null,
        write && ['planned', 'recorded'].includes(a.status) ? button('Editar', { size: 'sm', variant: 'ghost', iconName: 'edit', attrs: { 'aria-label': `Editar ${a.subject}` }, onClick: () => activityForm({}, a) }) : null,
        write && a.status === 'planned' ? button('Cancelar compromisso', { size: 'sm', variant: 'ghost', onClick: () => setActivityStatus(a, 'cancelled') }) : null
      ])
    ]);
  }
  async function setActivityStatus(a, status) {
    const ok = await confirmDialog({ title: status === 'cancelled' ? `Cancelar "${a.subject}"?` : 'Confirmar', description: 'A atividade continua no histórico como cancelada.', confirmLabel: 'Cancelar compromisso', tone: 'danger' });
    if (!ok) return;
    try {
      await ctx.api('crm-activities', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, id: a.id, expected_version: a.version, request_key: uid(), values: { status, source_reference: 'Cancelado pela equipe na Central de Relacionamentos' } }) });
      toast('Compromisso cancelado.'); reload();
    } catch (error) { toast(crmErrorMessage(error), 'error'); if (error.status === 409) reload(); }
  }
  function completeActivity(a) {
    const occurred = input({ type: 'datetime-local', value: localDateTime() });
    const notes = textarea({ maxlength: '4000' });
    const source = input({ maxlength: '500', value: '' , placeholder: 'Ex.: ata da reunião' });
    crmForm({
      title: `Registrar realização: ${a.subject}`, intro: 'Informe quando aconteceu. A atividade passa de planejada para realizada; nada é dado como concluído antes disto.',
      fields: [
        { key: 'occurred_at', label: 'Quando aconteceu', control: occurred, required: true, read: () => occurred.value ? isoWithZone(occurred.value) : null, validate: (v) => v && Date.parse(v) > Date.now() + 60000 ? 'Data futura: use um compromisso planejado.' : '' },
        { key: 'notes', label: 'Observações', control: notes, skipNull: true },
        { key: 'source_reference', label: 'Fonte', control: source, required: true }
      ],
      done: 'Atividade registrada como realizada.', onSaved: reload, onConflict: reload,
      send: (values, key) => ctx.api('crm-activities', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, id: a.id, expected_version: a.version, request_key: key, values: { ...values, status: 'recorded' } }) })
    });
  }
  function referenceSelect(current = null) {
    const options = [['', 'Sem vínculo financeiro'], ...links.map(([type, id, label]) => [`${type}:${id}`, label])];
    if (current?.related_type && !links.some(([t, i]) => t === current.related_type && i === current.related_id)) options.push([`${current.related_type}:${current.related_id}`, linkLabel(current.related_type, current.related_id)]);
    return select(options, current?.related_type ? `${current.related_type}:${current.related_id}` : (provider ? `provider:${provider.id}` : ''));
  }
  const readReference = (node) => () => node.value ? { related_type: node.value.split(':')[0], related_id: node.value.split(':')[1] } : { related_type: null, related_id: null };

  function activityForm(preset = {}, row = null) {
    const kind = select(Object.entries(ACTIVITY_KINDS), row?.kind || preset.kind || 'meeting');
    const mode = select([['recorded', 'Já aconteceu'], ['planned', 'Compromisso futuro ou pendente']], row?.status || preset.status || 'recorded');
    const subject = input({ maxlength: '200', value: row?.subject || preset.subject || '' });
    const occurred = input({ type: 'datetime-local', value: row?.occurred_at ? localDateTime(row.occurred_at) : localDateTime() });
    const due = input({ type: 'date', value: row?.due_on || preset.due_on || '' });
    const contact = select([['', 'Sem contato específico'], ...state.contacts.filter((c) => !c.archived_at || c.id === row?.contact_id).map((c) => [c.id, c.name])], row?.contact_id || preset.contact_id || '');
    const proc = select([['', 'Sem processo'], ...state.processes.filter((p) => p.status === 'active' || p.id === row?.process_id).map((p) => [p.id, p.title])], row?.process_id || preset.process_id || '');
    const owner = select(ownerOptions(ctx), row?.owner_id || preset.owner_id || ctx.viewer?.id || '');
    const reference = referenceSelect(row);
    const notes = textarea({ maxlength: '4000', value: row?.notes || preset.notes || '' });
    const source = input({ maxlength: '500', value: preset.source_reference || '', placeholder: 'Ex.: reunião presencial com a equipe do banco' });
    const fields = [
      { key: 'kind', label: 'Tipo', control: kind, required: true, noOptional: true },
      row ? null : { key: 'status', label: 'Quando', control: mode, required: true, hint: 'Separa o que já aconteceu do que ainda vai acontecer.' },
      { key: 'subject', label: 'Assunto', control: subject, required: true, validate: (v) => (v || '').length < 2 ? 'Mínimo de 2 caracteres.' : '' },
      { key: 'occurred_at', label: 'Quando aconteceu', control: occurred, required: true, read: () => occurred.value ? isoWithZone(occurred.value) : null, validate: (v) => v && Date.parse(v) > Date.now() + 60000 ? 'Esta data está no futuro: registre como compromisso.' : '' },
      { key: 'due_on', label: 'Prazo', control: due, required: true, validate: (v) => v && !row && v < todayIso() ? 'O prazo já passou. Confira a data.' : '' },
      { key: 'contact_id', label: 'Contato', control: contact, skipNull: !row },
      { key: 'process_id', label: 'Processo comercial', control: proc, skipNull: !row },
      { key: 'owner_id', label: 'Responsável', control: owner, skipNull: true },
      row ? null : { key: '__ref', label: 'Vínculo financeiro', control: reference, read: () => undefined },
      { key: 'notes', label: 'Observações', control: notes, skipNull: !row, hint: 'Notas internas da sua organização: a instituição não as vê.' },
      { key: 'source_reference', label: row ? 'Fonte desta alteração' : 'Fonte', control: source, required: true }
    ].filter(Boolean);
    const sync = () => {
      const status = row?.status || mode.value;
      fields.find((f) => f.key === 'occurred_at').wrap && (fields.find((f) => f.key === 'occurred_at').wrap.hidden = status !== 'recorded');
      fields.find((f) => f.key === 'due_on').wrap && (fields.find((f) => f.key === 'due_on').wrap.hidden = status !== 'planned');
    };
    mode.addEventListener('change', sync);
    crmForm({
      title: row ? `Editar atividade: ${row.subject}` : `Registrar atividade${provider ? ` · ${provider.name}` : ''}`,
      fields, done: row ? 'Atividade atualizada.' : 'Atividade registrada.', onSaved: reload, onConflict: reload,
      send: (values, key) => {
        const body = { ...values };
        if (row) {
          const changed = Object.fromEntries(Object.entries(body).filter(([k, v]) => k === 'source_reference' || (row[k] ?? null) !== v));
          if (Object.keys(changed).length === 1) return Promise.reject(Object.assign(new Error('Nenhum campo foi alterado.'), { status: 422 }));
          return ctx.api('crm-activities', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, id: row.id, expected_version: row.version, request_key: key, values: changed }) });
        }
        const ref = readReference(reference)();
        if (ref.related_type) Object.assign(body, ref);
        for (const k of ['occurred_at', 'due_on']) if (body[k] === undefined || body[k] === null) delete body[k];
        return ctx.api('crm-activities', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, legal_entity_id: null, request_key: key, values: body }) });
      }
    });
    sync();
  }

  // ------------------------------------------------------------ agenda
  function agendaView() {
    const today = todayIso();
    const planned = state.activities.filter((a) => a.status === 'planned');
    const groups = [
      ['Vencidos', planned.filter((a) => a.due_on && a.due_on < today), 'Compromissos cujo prazo já passou e seguem pendentes.'],
      ['Hoje', planned.filter((a) => a.due_on === today), null],
      ['Próximos', planned.filter((a) => a.due_on && a.due_on > today).sort((a, b) => a.due_on.localeCompare(b.due_on)), null],
      ['Sem prazo', planned.filter((a) => !a.due_on), null]
    ];
    const unowned = planned.filter((a) => !a.owner_id).length + state.processes.filter((p) => p.status === 'active' && !p.owner_id).length;
    const processDue = state.processes.filter((p) => p.status === 'active' && p.due_on && !['won', 'lost'].includes(p.stage)).sort((a, b) => a.due_on.localeCompare(b.due_on));
    if (!planned.length && !processDue.length) return emptyState({ compact: true, iconName: 'calendar', title: 'Nenhum compromisso pendente', text: 'Compromissos e follow-ups planejados aparecem aqui por prazo. Atividades realizadas ficam em Atividades.' });
    return el('div', { class: 'stack crm-agenda' }, [
      unowned ? el('p', { class: 'callout callout-warning compact', text: `${plural(unowned, 'item pendente', 'itens pendentes')} sem responsável definido.` }) : null,
      ...groups.filter(([, rows]) => rows.length).map(([title, rows, hint]) => el('section', { class: 'crm-agenda-group', 'aria-label': title }, [
        el('h4', { text: `${title} (${rows.length})` }), hint ? el('p', { class: 'muted small', text: hint }) : null,
        el('ul', { class: 'plain-list crm-list', role: 'list' }, rows.map(activityRow))
      ])),
      processDue.length ? el('section', { class: 'crm-agenda-group', 'aria-label': 'Próximos passos de processos' }, [
        el('h4', { text: `Próximos passos de processos (${processDue.length})` }),
        el('ul', { class: 'plain-list crm-list', role: 'list' }, processDue.map((p) => el('li', { class: `crm-row${p.due_on < today ? ' crm-row-late' : ''}` }, [
          el('div', { class: 'crm-row-main' }, [el('strong', { text: p.next_action }), el('span', { class: 'muted small', text: `${p.title} · ${STAGES[p.stage]} · ${p.due_on < today ? 'venceu em' : 'até'} ${formatDate(p.due_on)} · ${memberLabel(ctx, p.owner_id)}` })])
        ])))
      ]) : null
    ]);
  }

  // ----------------------------------------------------------- processos
  function processesView() {
    const layout = select([['board', 'Quadro por etapa'], ['table', 'Tabela']], 'board');
    layout.setAttribute('aria-label', 'Formato da lista de processos');
    const showArchived = el('input', { type: 'checkbox', id: 'crm-show-archived' });
    const area = el('div');
    const draw = () => {
      const rows = state.processes.filter((p) => showArchived.checked || p.status === 'active');
      if (!rows.length) { area.replaceChildren(emptyState({ compact: true, iconName: 'flag', title: 'Nenhum processo comercial', text: write ? 'Crie um processo para acompanhar uma conversa comercial: prospecção, negociação e resultado.' : null })); return; }
      if (layout.value === 'table') {
        area.replaceChildren(el('div', { class: 'table-card' }, el('table', { class: 'data-table compact' }, [
          el('thead', {}, el('tr', {}, ['Processo', 'Etapa', 'Responsável', 'Próximo passo', 'Data', 'Vínculo'].map((t) => el('th', { scope: 'col', text: t })))),
          el('tbody', {}, rows.map((p) => el('tr', { dataset: { crm: 'process' } }, [
            el('td', { 'data-label': 'Processo' }, el('button', { type: 'button', class: 'link-button', text: p.title, onclick: () => processDetail(p) })),
            el('td', { 'data-label': 'Etapa', text: STAGES[p.stage] }), el('td', { 'data-label': 'Responsável', text: memberLabel(ctx, p.owner_id) }),
            el('td', { 'data-label': 'Próximo passo', text: p.next_action }), el('td', { 'data-label': 'Data', text: p.due_on ? formatDate(p.due_on) : '—' }),
            el('td', { 'data-label': 'Vínculo', text: linkLabel(p.related_type, p.related_id) || '—' })
          ])))
        ])));
        return;
      }
      area.replaceChildren(el('div', { class: 'crm-board', role: 'list', 'aria-label': 'Processos por etapa' }, STAGE_ORDER.map((stage) => {
        const items = rows.filter((p) => p.stage === stage);
        return el('section', { class: 'crm-column', role: 'listitem', 'aria-label': `${STAGES[stage]}: ${items.length}` }, [
          el('h4', { class: 'crm-column-title' }, [STAGES[stage], el('span', { class: 'tab-count', text: String(items.length) })]),
          el('ul', { class: 'plain-list', role: 'list' }, items.map(processCard))
        ]);
      })));
    };
    layout.addEventListener('change', draw); showArchived.addEventListener('change', draw);
    draw();
    return el('div', { class: 'stack' }, [
      el('p', { class: 'muted small', text: 'Etapas comerciais são declarações da equipe. "Ganho" não fecha contrato, não aprova proposta e não registra economia.' }),
      el('div', { class: 'toolbar' }, [layout, el('label', { class: 'checkbox', for: 'crm-show-archived' }, [showArchived, ' Mostrar arquivados'])]), area]);
  }
  function processCard(p) {
    const href = linkHref(p.related_type, p.related_id);
    const stage = write && p.status === 'active' ? select(STAGE_ORDER.map((s) => [s, STAGES[s]]), p.stage) : null;
    if (stage) {
      stage.setAttribute('aria-label', `Etapa de ${p.title}`);
      stage.addEventListener('change', () => changeStage(p, stage.value, () => { stage.value = p.stage; }));
    }
    return el('li', { class: 'crm-card', id: `crm-process-${p.id}`, dataset: { crm: 'process', stage: p.stage } }, [
      el('button', { type: 'button', class: 'link-button crm-card-title', text: p.title, onclick: () => processDetail(p) }),
      el('span', { class: 'small', text: `Próximo passo: ${p.next_action}${p.due_on ? ` · até ${formatDate(p.due_on)}` : ''}` }),
      el('span', { class: 'muted small', text: `Responsável: ${memberLabel(ctx, p.owner_id)}` }),
      p.related_type ? (href ? el('a', { class: 'small', href, text: linkLabel(p.related_type, p.related_id) }) : el('span', { class: 'small', text: linkLabel(p.related_type, p.related_id) })) : null,
      p.outcome ? el('span', { class: 'small', text: `Resultado declarado: ${p.outcome}` }) : null,
      p.status === 'archived' ? tag('Arquivado', 'neutral') : null,
      stage ? field({ label: 'Etapa', control: stage, className: 'crm-stage-field' }) : null
    ]);
  }
  async function changeStage(p, next, revert) {
    if (next === p.stage) return;
    let outcome = null;
    if (['won', 'lost'].includes(next)) {
      const { promptDialog } = await import('../ui.js');
      outcome = await promptDialog({ title: `${STAGES[next]}: registrar resultado`, description: next === 'won' ? 'Descreva o que foi acordado. Isto não fecha contrato nem aprova proposta: o contrato é registrado no Contract Center.' : 'Descreva por que o processo terminou sem acordo.', label: 'Resultado', minLength: 3, confirmLabel: 'Registrar etapa' });
      if (!outcome) { revert(); return; }
    }
    try {
      await ctx.api('crm-processes', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, id: p.id, expected_version: p.version, request_key: uid(), values: { stage: next, ...(outcome ? { outcome } : {}), source_reference: 'Etapa atualizada pela equipe na Central de Relacionamentos' } }) });
      toast(`Etapa atualizada para ${STAGES[next]}.`);
      reload();
    } catch (error) { revert(); toast(crmErrorMessage(error), 'error'); if (error.status === 409) reload(); }
  }
  function processDetail(p) {
    const href = linkHref(p.related_type, p.related_id);
    const acts = state.activities.filter((a) => a.process_id === p.id);
    const contact = state.contacts.find((c) => c.id === p.contact_id);
    const body = el('div', { class: 'stack' }, [
      el('dl', { class: 'deflist deflist-2' }, [
        ['Etapa', STAGES[p.stage]], ['Responsável', memberLabel(ctx, p.owner_id)], ['Próximo passo', p.next_action], ['Data relevante', p.due_on ? formatDate(p.due_on) : 'Não informada'],
        ['Contato', contact?.name || 'Não informado'], ['Fonte', p.source_reference], ['Resultado declarado', p.outcome || 'Ainda sem resultado'], ['Situação', p.status === 'archived' ? 'Arquivado' : 'Ativo']
      ].map(([k, v]) => el('div', { class: 'deflist-row' }, [el('dt', { text: k }), el('dd', { text: v })]))),
      p.related_type ? el('p', {}, ['Objeto financeiro vinculado: ', href ? el('a', { href, text: linkLabel(p.related_type, p.related_id) }) : linkLabel(p.related_type, p.related_id)]) : el('p', { class: 'muted small', text: 'Sem objeto financeiro vinculado.' }),
      el('h3', { text: `Atividades do processo (${acts.length})` }),
      acts.length ? el('ul', { class: 'plain-list crm-list' }, acts.map((a) => el('li', { text: `${ACTIVITY_KINDS[a.kind]} · ${a.subject} · ${a.status === 'recorded' ? formatDateTime(a.occurred_at) : a.due_on ? `prazo ${formatDate(a.due_on)}` : 'sem prazo'}` }))) : el('p', { class: 'muted small', text: 'Nenhuma atividade vinculada.' }),
      el('div', { class: 'crm-row-actions' }, [
        write && p.status === 'active' ? button('Editar processo', { size: 'sm', iconName: 'edit', onClick: () => { dialog.close(); processForm(p); } }) : null,
        write && p.status === 'active' ? button('Registrar atividade', { size: 'sm', onClick: () => { dialog.close(); activityForm({ process_id: p.id, contact_id: p.contact_id || '' }); } }) : null,
        write ? button(p.status === 'archived' ? 'Reativar' : 'Arquivar', { size: 'sm', variant: 'ghost', onClick: () => { dialog.close(); toggleArchive('crm-processes', p, p.status === 'archived' ? 'active' : 'archived', p.title); } }) : null
      ]),
      el('h3', { text: 'Histórico' }), historyList('process', p.id)
    ]);
    const dialog = drawer({ title: p.title, subtitle: 'Processo comercial', body });
  }
  function processForm(row = null) {
    const title = input({ maxlength: '200', value: row?.title || '' });
    const stage = select(STAGE_ORDER.map((s) => [s, STAGES[s]]), row?.stage || 'prospect');
    const next = input({ maxlength: '200', value: row?.next_action || '' });
    const due = input({ type: 'date', value: row?.due_on || '' });
    const owner = select(ownerOptions(ctx), row?.owner_id || ctx.viewer?.id || '');
    const contact = select([['', 'Sem contato específico'], ...state.contacts.filter((c) => !c.archived_at || c.id === row?.contact_id).map((c) => [c.id, c.name])], row?.contact_id || '');
    const reference = referenceSelect(row);
    const outcome = textarea({ maxlength: '4000', value: row?.outcome || '' });
    const source = input({ maxlength: '500', placeholder: 'Ex.: reunião de planejamento da tesouraria' });
    const fields = [
      { key: 'title', label: 'Título', control: title, required: true, validate: (v) => (v || '').length < 2 ? 'Mínimo de 2 caracteres.' : '' },
      { key: 'stage', label: 'Etapa', control: stage, required: true, noOptional: true },
      { key: 'next_action', label: 'Próximo passo', control: next, required: true },
      { key: 'due_on', label: 'Data relevante', control: due, skipNull: !row },
      { key: 'owner_id', label: 'Responsável', control: owner, skipNull: true },
      { key: 'contact_id', label: 'Contato', control: contact, skipNull: !row },
      row ? null : { key: '__ref', label: 'Contrato, negociação ou instituição vinculada', control: reference, read: () => undefined, hint: 'O vínculo é fixado na criação e aparece no contrato ou na negociação.' },
      { key: 'outcome', label: 'Resultado declarado', control: outcome, skipNull: !row, hint: 'Obrigatório para "Ganho" ou "Encerrado sem acordo".', validate: (v) => ['won', 'lost'].includes(stage.value) && (!v || v.length < 3) ? 'Descreva o resultado para encerrar o processo.' : '' },
      { key: 'source_reference', label: row ? 'Fonte desta alteração' : 'Fonte', control: source, required: true }
    ].filter(Boolean);
    crmForm({
      title: row ? `Editar processo: ${row.title}` : `Novo processo comercial${provider ? ` · ${provider.name}` : ''}`,
      intro: row ? null : 'Um processo acompanha uma conversa comercial. Ele não substitui a negociação formal (RFQ) nem o contrato.',
      fields, done: row ? 'Processo atualizado.' : 'Processo criado.', onSaved: reload, onConflict: reload,
      send: (values, key) => {
        if (row) {
          const changed = Object.fromEntries(Object.entries(values).filter(([k, v]) => k === 'source_reference' || (row[k] ?? null) !== v));
          if (Object.keys(changed).length === 1) return Promise.reject(Object.assign(new Error('Nenhum campo foi alterado.'), { status: 422 }));
          return ctx.api('crm-processes', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, id: row.id, expected_version: row.version, request_key: key, values: changed }) });
        }
        const body = { ...values, ...Object.fromEntries(Object.entries(readReference(reference)()).filter(([, v]) => v)) };
        if (!['won', 'lost'].includes(body.stage) && body.outcome == null) delete body.outcome;
        return ctx.api('crm-processes', { method: 'POST', body: JSON.stringify({ organization_id: ctx.organization.id, legal_entity_id: null, request_key: key, values: body }) });
      }
    });
  }

  // ------------------------------------------------------------ histórico
  function historyList(type, id) {
    const box = el('div', {}, loading('Carregando histórico…'));
    ctx.api(`crm-history?organization_id=${enc(ctx.organization.id)}&object_type=${type}&object_id=${enc(id)}&limit=50`).then((page) => {
      const rows = page.rows || [];
      box.replaceChildren(rows.length ? el('ol', { class: 'timeline crm-history', role: 'list' }, rows.map((e) => el('li', { class: 'timeline-item' }, [
        el('strong', { text: EVENT_TEXT[e.event_type || e.type] || 'Atualização registrada' }),
        el('span', { class: 'muted small', text: [formatDateTime(e.happened_at), e.actor_id ? memberLabel(ctx, e.actor_id) : null].filter(Boolean).join(' · ') }),
        changedFields(e) ? el('span', { class: 'small', text: changedFields(e) }) : null,
        e.payload?.source_reference ? el('span', { class: 'muted small', text: `Fonte: ${e.payload.source_reference}` }) : null
      ]))) : el('p', { class: 'muted small', text: 'Nenhum evento registrado para este item.' }),
      ...(page.next ? [el('p', { class: 'muted small', text: 'Exibindo os 50 primeiros eventos.' })] : []));
    }).catch((error) => box.replaceChildren(errorState({ title: 'Histórico indisponível', error: { ...error, message: crmErrorMessage(error) } })));
    return box;
  }
  function changedFields(e) {
    const keys = e.payload?.changed_fields || (e.payload?.after ? Object.keys(e.payload.after) : null);
    if (!Array.isArray(keys) || !keys.length) return null;
    return `Alterou: ${keys.filter((k) => k !== 'source_reference').map((k) => FIELD_TEXT[k] || 'outro campo').join(', ')}`;
  }
  function historyDrawer(type, id, label) {
    drawer({ title: `Histórico: ${label}`, subtitle: 'Eventos autorizados deste registro, com data, autor e fonte.', body: historyList(type, id) });
  }

  // Ponto de entrada externo (ex.: pré-preenchimento do Copilot ou de um contrato).
  root.crm = { activityForm: (preset) => activityForm(preset), processForm: () => processForm(), reload };
  load();
  return root;
}

/**
 * Agenda e pipeline da organização inteira (Central de Relacionamentos):
 * compromissos planejados e processos ativos, com nome da instituição quando
 * o vínculo é a própria instituição. Leitura apenas; ações abrem a instituição.
 */
export function crmOrganizationPanel(ctx, { providers = [], contracts = [], onOpenProvider = null } = {}) {
  const root = el('section', { class: 'card crm-org', id: 'crm-agenda', 'aria-labelledby': 'crm-org-title' });
  const providerName = new Map(providers.map((p) => [p.id, p.name]));
  const contractProvider = new Map(contracts.map((c) => [c.id, c.provider_id]));
  const providerOf = (row) => row.related_type === 'provider' ? row.related_id : row.related_type === 'contract' ? contractProvider.get(row.related_id) : null;
  const headline = el('div', { class: 'cc-head' }, [el('div', {}, [el('h2', { id: 'crm-org-title', class: 'card-title', text: 'Agenda e processos comerciais' }),
    el('p', { class: 'muted small', text: 'Compromissos pendentes e processos ativos registrados pela equipe, de todas as instituições do seu escopo.' })])]);
  const load = async () => {
    root.replaceChildren(headline, loading('Carregando agenda…'));
    try {
      const [planned, processes] = await Promise.all([crmList(ctx, 'crm-activities', { status: 'planned' }), crmList(ctx, 'crm-processes', { status: 'active' })]);
      const today = todayIso();
      const filter = select([['all', 'Todos os pendentes'], ['overdue', 'Vencidos'], ['today', 'Hoje'], ['unowned', 'Sem responsável'], ['no_date', 'Sem prazo definido'], ['mine', 'Meus']], 'all');
      filter.setAttribute('aria-label', 'Filtrar agenda');
      const instOptions = providers.filter((p) => [...planned.rows, ...processes.rows].some((r) => providerOf(r) === p.id));
      const inst = select([['', 'Todas as instituições'], ...instOptions.map((p) => [p.id, p.name])], '');
      inst.setAttribute('aria-label', 'Instituição');
      const ownerIds = [...new Set([...planned.rows, ...processes.rows].map((r) => r.owner_id).filter(Boolean))];
      const owner = select([['', 'Todos os responsáveis'], ...ownerIds.map((id) => [id, memberLabel(ctx, id)])], '');
      owner.setAttribute('aria-label', 'Responsável');
      const list = el('ul', { class: 'plain-list crm-list', role: 'list' });
      const row = (kind, r) => {
        const pid = providerOf(r);
        const due = r.due_on;
        const late = due && due < today;
        return el('li', { class: `crm-row${late ? ' crm-row-late' : ''}`, dataset: { crm: kind } }, [
          el('div', { class: 'crm-row-main' }, [
            el('span', { class: 'muted small', text: kind === 'activity' ? ACTIVITY_KINDS[r.kind] : `Processo · ${STAGES[r.stage]}` }),
            el('strong', { text: kind === 'activity' ? r.subject : `${r.title}: ${r.next_action}` }),
            el('span', { class: 'small', text: [due ? `${late ? 'Venceu em' : 'Prazo'} ${formatDate(due)}` : 'Sem prazo', `responsável: ${memberLabel(ctx, r.owner_id)}`, pid && providerName.get(pid) ? providerName.get(pid) : null].filter(Boolean).join(' · ') })
          ]),
          late ? tag('Vencido', 'danger') : null,
          pid && onOpenProvider && providers.find((p) => p.id === pid) ? button('Abrir instituição', { size: 'sm', variant: 'ghost', attrs: { 'aria-label': `Abrir relacionamento com ${providerName.get(pid)}` }, onClick: () => onOpenProvider(providers.find((p) => p.id === pid)) }) : null
        ]);
      };
      const draw = () => {
        const v = filter.value;
        const pick = (r) => (!inst.value || providerOf(r) === inst.value) && (!owner.value || r.owner_id === owner.value)
          && (v === 'all' || (v === 'overdue' && r.due_on && r.due_on < today) || (v === 'today' && r.due_on === today) || (v === 'unowned' && !r.owner_id) || (v === 'mine' && r.owner_id === ctx.viewer?.id) || (v === 'no_date' && !r.due_on));
        const items = [...planned.rows.filter(pick).map((r) => ['activity', r]), ...processes.rows.filter((r) => !['won', 'lost'].includes(r.stage)).filter(pick).map((r) => ['process', r])]
          .sort(([, a], [, b]) => String(a.due_on || '9999').localeCompare(String(b.due_on || '9999')));
        list.replaceChildren(...items.slice(0, 50).map(([k, r]) => row(k, r)));
        if (!items.length) list.append(el('li', {}, emptyState({ compact: true, iconName: 'calendar', title: 'Nada pendente neste filtro', text: 'Registre compromissos e processos no relacionamento de cada instituição.' })));
      };
      for (const node of [filter, inst, owner]) node.addEventListener('change', draw);
      const stageCounts = STAGE_ORDER.slice(0, 4).map((s) => [s, processes.rows.filter((p) => p.stage === s).length]);
      root.replaceChildren(headline,
        el('ul', { class: 'pipeline', 'aria-label': 'Processos ativos por etapa' }, stageCounts.map(([s, n]) => el('li', { class: `pipeline-stage${n ? '' : ' empty'}` }, [el('span', { class: 'pipeline-count', text: String(n) }), el('span', { class: 'pipeline-label', text: STAGES[s] })]))),
        el('div', { class: 'toolbar' }, [filter, inst, owner]), list,
        ...(planned.truncated || processes.truncated ? [el('p', { class: 'muted small', text: 'Mostrando os primeiros 200 registros de cada tipo.' })] : []));
      draw();
    } catch (error) {
      if (error.status === 503) { root.replaceChildren(headline, el('p', { class: 'callout callout-info compact', text: 'O registro comercial ainda não está disponível neste ambiente.' })); return; }
      root.replaceChildren(headline, errorState({ title: 'Agenda indisponível', error: { ...error, message: crmErrorMessage(error) }, onRetry: load }));
    }
  };
  load();
  return root;
}

/**
 * Relacionamento comercial vinculado a um objeto financeiro (contrato ou
 * negociação): processos e atividades com `related_id` igual ao objeto. Leitura;
 * a edição continua no relacionamento da instituição.
 */
export function crmLinkedPanel(ctx, { relatedId, providerId = null, providerName = null, noun = 'este contrato' }) {
  const box = el('section', { class: 'cc-section crm-linked', 'aria-label': 'Relacionamento comercial vinculado' }, [el('h3', { text: 'Relacionamento comercial vinculado' }), loading('Carregando vínculos…')]);
  Promise.all([crmList(ctx, 'crm-processes', { related_id: relatedId }, { max: 50 }), crmList(ctx, 'crm-activities', { related_id: relatedId }, { max: 50 })]).then(([processes, activities]) => {
    const today = todayIso();
    const items = [
      ...processes.rows.map((p) => el('li', { class: 'crm-row', dataset: { crm: 'process' } }, [el('div', { class: 'crm-row-main' }, [el('span', { class: 'muted small', text: `Processo · ${STAGES[p.stage]}` }), el('strong', { text: p.title }), el('span', { class: 'small', text: `Próximo passo: ${p.next_action}${p.due_on ? ` · até ${formatDate(p.due_on)}` : ''} · ${memberLabel(ctx, p.owner_id)}` })])])),
      ...activities.rows.filter((a) => ['planned', 'recorded'].includes(a.status)).map((a) => el('li', { class: `crm-row${a.status === 'planned' && a.due_on && a.due_on < today ? ' crm-row-late' : ''}`, dataset: { crm: 'activity' } }, [el('div', { class: 'crm-row-main' }, [el('span', { class: 'muted small', text: `${ACTIVITY_KINDS[a.kind] || 'Atividade'} · ${ACTIVITY_STATUS[a.status]?.[0] || ''}` }), el('strong', { text: a.subject }), el('span', { class: 'small', text: a.status === 'recorded' ? `Aconteceu em ${formatDateTime(a.occurred_at)}` : a.due_on ? `Prazo ${formatDate(a.due_on)}` : 'Sem prazo' })])]))
    ];
    box.replaceChildren(el('h3', { text: 'Relacionamento comercial vinculado' }),
      items.length ? el('ul', { class: 'plain-list crm-list' }, items) : el('p', { class: 'muted small', text: `Nenhum processo ou atividade vinculado a ${noun}.` }),
      ...(providerId ? [el('a', { class: 'btn btn-ghost btn-sm', href: ctx.href(`/finance/providers.html?provider_id=${enc(providerId)}`) }, el('span', { class: 'btn-label', text: `Abrir relacionamento${providerName ? ` com ${providerName}` : ''}` }))] : []));
  }).catch((error) => box.replaceChildren(el('h3', { text: 'Relacionamento comercial vinculado' }), el('p', { class: 'muted small', text: error.status === 503 ? 'Registro comercial indisponível neste ambiente.' : 'Vínculos comerciais indisponíveis agora.' })));
  return box;
}

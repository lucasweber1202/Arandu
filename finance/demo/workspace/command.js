// Central de comando da demonstração (Ctrl+K / ⌘K).
//
// Um command palette, não um chatbot: navegar, criar, trocar de persona,
// mudar aparência e buscar solicitações, contratos, provedores, propostas e
// tarefas já carregados. Enter abre; Shift+Enter espia (quick view) quando o
// item permite. Recentes e favoritos aparecem antes de digitar.

import { el, icon, fold, productLabel, formatDate, RFQ_STATUS, CONTRACT_STATUS, PROVIDER_KINDS } from '../../src/core.js';
import { readState } from './preferences.js';
import { PERSONA_META, PERSONA_ORDER } from './personas.js';
import { workQueue, approvalNext } from './next-action.js';
import { readOS, updateOS } from './platform/os-store.js';
import { mark, track } from './platform/telemetry.js';
import { CONNECTORS, ADAPTERS } from './integrations/registry.js';
import { ROLE_LABELS } from '../../src/core.js';

const TYPE_ICONS = { person: 'user', comment: 'message', integration: 'plug', setting: 'settings', recentSearch: 'clock', view: 'bookmark', context: 'search', invite: 'send', rfq: 'file', contract: 'briefcase', provider: 'building', proposal: 'inbox', task: 'tasks', approval: 'checkCircle', work: 'arrowRight', action: 'arrowRight', nav: 'arrowRight', admin: 'settings', persona: 'user', pref: 'sliders' };
// Prioridade: 1 objetos de trabalho · 2 páginas · 3 ações de trabalho · 4 filtros ·
// 5 administração · 6 personas e aparência. O cosmético nunca disputa com o trabalho.
const GROUP_ORDER = ['Seu trabalho', 'Nesta página', 'Solicitações', 'Aprovações', 'Propostas', 'Contratos', 'Provedores', 'Tarefas', 'Oportunidades', 'Convites', 'Pessoas', 'Comentários', 'Recentes', 'Favoritos', 'Buscas recentes',
  'Navegação', 'Ações', 'Filtros salvos', 'Integrações', 'Configurações', 'Administração', 'Personas', 'Aparência'];
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');

function commands(ctx, hooks) {
  const company = ctx.audience === 'company';
  const go = (path) => () => location.assign(ctx.href(path));
  const list = [];
  const add = (item) => list.push({ type: 'action', group: 'Ações', ...item });
  const nav = (id, title, path, iconName, keywords = '') => list.push({ type: 'nav', id, group: 'Navegação', title, detail: 'Ir para', icon: iconName, keywords, run: go(path) });
  if (company) {
    if (ctx.can('create_rfq')) add({ id: 'new-rfq', title: 'Nova solicitação', detail: 'Crédito ou adquirência', icon: 'plus', keywords: 'criar rfq pedido', run: go('/finance/new-rfq.html') });
    if (ctx.can('create_rfq')) add({ id: 'intake', title: 'Nova solicitação guiada', detail: 'O que você precisa fazer? · modelos', icon: 'sparkles', keywords: 'intake modelo template capital giro financiamento renovacao', run: go('/finance/intake.html') });
    add({ id: 'my-approvals', title: 'Minhas aprovações', detail: hooks.pendingApprovals ? `${hooks.pendingApprovals} aguardando você` : 'Caixa de aprovação', icon: 'checkCircle', keywords: 'aprovar pendentes cfo', run: go('/finance/approvals.html') });
    add({ id: 'find-provider', title: 'Encontrar provedor', detail: 'Buscar por nome, tipo ou região', icon: 'building', keywords: 'banco fintech adquirente', run: () => hooks.reopen('provedor ') });
    list.push({ type: 'pref', id: 'customize-dashboard', group: 'Aparência', title: 'Personalizar painel', detail: 'Presets, módulos e ordem', icon: 'layout', keywords: 'layout modulos dashboard editar preset', run: hooks.customizeDashboard });
    for (const [id, title, path, iconName, keywords] of [
      ['go-dashboard', 'Início', '/finance/dashboard.html', 'home', 'painel dashboard inicio'], ['go-rfqs', 'Solicitações', '/finance/rfqs.html', 'file', 'rfq lista concorrencias'],
      ['go-approvals', 'Aprovações', '/finance/approvals.html', 'checkCircle', 'aprovar caixa'], ['go-proposals', 'Propostas', '/finance/proposals.html', 'inbox', 'ofertas'],
      ['go-contracts', 'Contratos e renovações', '/finance/contracts.html', 'briefcase', 'renovacao vigencia'], ['go-providers', 'Provedores', '/finance/providers.html', 'building', 'bancos fintechs'],
      ['go-tasks', 'Tarefas', '/finance/tasks.html', 'tasks', 'pendencias'], ['go-notifications', 'Notificações', '/finance/notifications.html', 'bell', 'avisos']
    ]) nav(id, title, path, iconName, keywords);
    for (const [id, title, path, iconName, keywords] of [
      ['go-settings', 'Configurações', '/finance/settings.html', 'settings', 'empresa conta'], ['go-team', 'Equipe e papéis', '/finance/settings.html#equipe', 'users', 'membros rbac governanca'],
      ['go-policy', 'Política de aprovação', '/finance/settings.html#aprovacao', 'shield', 'regra aprovacao governanca'], ['go-profile', 'Perfil financeiro', '/finance/settings.html#perfil', 'layers', 'dados empresa faturamento']
    ]) list.push({ type: 'admin', id, group: 'Administração', title, detail: 'Configurações', icon: iconName, keywords, run: go(path) });
    for (const view of hooks.views?.() || []) list.push({ type: 'view', id: `view-${view.id}`, group: 'Filtros salvos', title: view.name, detail: view.page === 'contracts' ? 'Contratos' : 'Solicitações', icon: 'bookmark', keywords: 'visao filtro lista salvo', run: () => location.assign(view.href) });
  } else {
    nav('go-provider-home', 'Início do portal', '/provider/index.html', 'home', 'inicio');
    nav('go-provider-invites', 'Convites', '/provider/index.html#convites', 'send', 'convite aceitar recebidos');
    nav('go-provider-rfqs', 'Oportunidades', '/provider/rfqs.html', 'inbox', 'propostas prazos responder demandas');
    nav('go-provider-invite', 'Aceitar convite por código', '/provider/invite.html', 'lock', 'token codigo convite');
  }
  for (const action of hooks.contextActions?.() || []) list.push({ type: 'context', group: 'Nesta página', ...action });
  if (hooks.openHelp) add({ id: 'shortcuts', title: 'Atalhos de teclado e ajuda', detail: '? a qualquer momento', icon: 'keyboard', keywords: 'atalho teclado ajuda glossario conceitos', run: hooks.openHelp });
  if (hooks.toggleOffline) add({ id: 'toggle-offline', title: 'Simular offline / reconectar', detail: 'Fila de sincronização da demo', icon: 'cloudOff', keywords: 'offline rede sincronizar fila conflito', run: hooks.toggleOffline });
  list.push({ type: 'admin', id: 'restore-demo', group: 'Administração', title: 'Restaurar demonstração…', detail: 'Dados, aparência ou tudo', icon: 'refresh', keywords: 'reset reiniciar limpar', run: hooks.openRestore });
  const pref = (item) => list.push({ type: 'pref', group: 'Aparência', ...item });
  pref({ id: 'open-preferences', title: 'Aparência e preferências', detail: 'Tema, densidade, preset, comportamento', icon: 'sliders', keywords: 'configurar tema', run: hooks.openPreferences });
  const theme = readState().appearance.theme;
  for (const [value, label, iconName] of [['light', 'Tema claro', 'sun'], ['dark', 'Tema escuro', 'moon'], ['system', 'Tema do sistema', 'monitor']]) {
    if (value !== theme) pref({ id: `theme-${value}`, title: label, detail: 'Alternar tema', icon: iconName, keywords: 'tema dark light modo escuro claro', run: () => hooks.setAppearance('theme', value) });
  }
  for (const [value, label] of hooks.presets || []) pref({ id: `preset-${value}`, title: `Workspace ${label.toLowerCase()}`, detail: 'Aplicar preset', icon: 'layout', keywords: 'preset densidade executivo operacional compacto equilibrado', run: () => hooks.applyPreset(value) });
  pref({ id: 'toggle-focus', title: readState().shell.focus ? 'Sair do modo foco' : 'Ativar modo foco', detail: 'Esconde a barra lateral e o que é periférico', icon: 'maximize', keywords: 'foco tela cheia concentrar', run: hooks.toggleFocus });
  pref({ id: 'toggle-sidebar', title: 'Alternar barra lateral', detail: `Expandida ou compacta · ${isMac() ? '⌘B' : 'Ctrl+B'}`, icon: 'sidebar', keywords: 'menu lateral recolher', run: hooks.toggleSidebar });
  for (const key of PERSONA_ORDER) {
    const meta = PERSONA_META[key];
    if (ctx.persona?.key === key) continue;
    list.push({ type: 'persona', id: `persona-${key}`, group: 'Personas', title: `Ver como ${meta.name}`, detail: `${meta.group} · ${meta.title}`, icon: 'user', keywords: `persona papel ${meta.group} ${meta.area}`, run: () => hooks.switchPersona(key) });
  }
  return list;
}

// Destaca os termos buscados no título (sem mudar o texto lido pelo leitor de tela).
let lastTerms = [];
export function highlight(text, terms) {
  const folded = fold(text);
  if (!terms.length || folded.length !== text.length) return [text];
  const marks = new Array(text.length).fill(false);
  for (const term of terms) { let at = folded.indexOf(term); while (at >= 0) { for (let i = at; i < at + term.length; i += 1) marks[i] = true; at = folded.indexOf(term, at + term.length); } }
  const parts = [];
  let start = 0;
  for (let i = 1; i <= text.length; i += 1) if (i === text.length || marks[i] !== marks[start]) { parts.push(marks[start] ? el('mark', { class: 'command-mark', text: text.slice(start, i) }) : text.slice(start, i)); start = i; }
  return parts;
}

function records(ctx) {
  const rows = [];
  const data = ctx.data || {};
  if (ctx.audience === 'company') {
    for (const rfq of data.rfqs || []) {
      rows.push({ type: 'rfq', id: rfq.id, group: 'Solicitações', title: rfq.title, detail: `${productLabel(rfq.product, { short: true })} · ${RFQ_STATUS[rfq.status]?.label || rfq.status}`, href: ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}`), peek: true });
      for (const proposal of rfq.proposals || []) rows.push({ type: 'proposal', id: proposal.id, group: 'Propostas', title: proposal.provider_name, detail: `v${proposal.version} · ${rfq.title}`, href: ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}#propostas`), peek: true });
    }
    for (const contract of data.contracts || []) rows.push({ type: 'contract', id: contract.id, group: 'Contratos', title: contract.provider_name || 'Contrato', detail: `${productLabel(contract.product, { short: true })} · ${CONTRACT_STATUS[contract.status]?.label || ''} · vence ${formatDate(contract.ends_on)}`, href: ctx.href(`/finance/contracts.html#contract-${contract.id}`), peek: true });
    for (const provider of data.providers || []) rows.push({ type: 'provider', id: provider.id, group: 'Provedores', title: provider.name, detail: `${PROVIDER_KINDS[provider.kind] || 'Provedor'} · ${provider.region || '—'}`, href: ctx.href(`/finance/providers.html#provider-${provider.id}`), peek: true });
    for (const request of ctx.demoApprovals || []) {
      const rfq = (data.rfqs || []).find((item) => item.id === request.rfq_id);
      if (!rfq) continue;
      const next = approvalNext(request, rfq, { viewerId: ctx.viewer?.id, members: ctx.members });
      rows.push({ type: 'approval', id: request.id, group: 'Aprovações', title: `Aprovação: ${rfq.title}`, detail: `${next.state} · ${next.action}`, keywords: 'aprovar aprovacao decisao', href: ctx.href(`/finance/approvals.html#request-${request.id}`) });
    }
    for (const member of ctx.members || []) rows.push({ type: 'person', id: member.user_id, group: 'Pessoas', title: member.display_name, detail: [member.title, ROLE_LABELS[member.role]].filter(Boolean).join(' · '), keywords: 'pessoa equipe membro', href: ctx.href('/finance/settings.html#equipe') });
    // Comentários da camada: a empresa lê internos e os visíveis ao provedor (o provedor não passa por aqui).
    const hrefOf = (row) => (row.object_type === 'approval' ? `/finance/approvals.html#request-${row.object_id}` : row.object_type === 'contract' ? `/finance/contracts.html#contract-${row.object_id}` : '/finance/proposals.html');
    for (const row of readOS().comments.slice(-40)) rows.push({ type: 'comment', id: row.id, group: 'Comentários', title: row.body.slice(0, 90), detail: `${row.author} · ${row.scope === 'internal' ? 'Interno' : 'Visível ao provedor'}`, keywords: 'comentario conversa mencao', href: ctx.href(hrefOf(row)) });
    for (const def of CONNECTORS) rows.push({ type: 'integration', id: def.id, group: 'Integrações', title: def.name, detail: ADAPTERS[def.id].status() === 'connected' ? 'Conectado (simulado)' : 'Não conectado', keywords: `integracao conector ${def.category}`, href: ctx.href(`/finance/integrations.html#int-${def.id}`) });
    for (const [id, title, path, keywords] of [['appearance', 'Aparência e workspace', '/finance/settings.html#aparencia', 'tema densidade'], ['policies', 'Políticas de aprovação (versões)', '/finance/policies.html', 'workflow regra versao governanca'],
      ['integrations', 'Central de integrações', '/finance/integrations.html', 'slack teams erp sso'], ['usage', 'Uso da demonstração', '/finance/usage.html', 'funil analytics auditoria flags desempenho'],
      ['notifications', 'Central de notificações', '/finance/notifications.html', 'avisos mencoes'], ['profile', 'Perfil financeiro e procedência', '/finance/settings.html#perfil', 'open finance fonte']]) rows.push({ type: 'setting', id, group: 'Configurações', title, detail: 'Abrir', keywords, href: ctx.href(path) });
    for (const task of data.tasks || []) rows.push({ type: 'task', id: task.id, group: 'Tarefas', title: task.title, detail: task.due_on ? `prazo ${formatDate(task.due_on)}` : 'sem prazo', href: ctx.href(`/finance/tasks.html#task-${task.id}`) });
  } else {
    for (const row of data.pending_invites || []) rows.push({ type: 'invite', id: row.invite_id, group: 'Convites', icon: 'send', title: row.title || 'Convite', detail: `${row.buyer_name || ''} · responder até ${formatDate(row.response_deadline)}`, href: ctx.href('/provider/index.html#convites') });
    for (const row of data.assignments || []) rows.push({ type: 'rfq', id: row.rfq_id, group: 'Oportunidades', title: row.title || 'Solicitação', detail: `${row.buyer_name || ''}${row.response_deadline ? ` · prazo ${formatDate(row.response_deadline)}` : ''}`, href: row.proposal_id ? ctx.href(`/provider/proposal.html?proposal=${encodeURIComponent(row.proposal_id)}`) : ctx.href('/provider/rfqs.html') });
  }
  return rows;
}

export function installPalette(ctx, hooks) {
  let dialog = document.getElementById('command-center');
  dialog?.remove();
  dialog = el('dialog', { id: 'command-center', class: 'command-dialog dw-palette', 'aria-label': 'Central de comando' });
  const input = el('input', { id: 'command-query', type: 'search', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'command-results', 'aria-autocomplete': 'list',
    autocomplete: 'off', spellcheck: 'false', placeholder: ctx.audience === 'company' ? 'Buscar ou executar… (solicitações, contratos, provedores, ações)' : 'Buscar oportunidades ou executar uma ação…', 'aria-label': 'Buscar ou executar um comando' });
  const results = el('ul', { id: 'command-results', role: 'listbox', class: 'command-results', 'aria-label': 'Resultados' });
  const status = el('p', { class: 'command-status', role: 'status', 'aria-live': 'polite' });
  let options = [];
  let active = -1;
  let pool = [];

  const setActive = (index) => {
    active = options.length ? (index + options.length) % options.length : -1;
    options.forEach((option, position) => option.setAttribute('aria-selected', String(position === active)));
    if (active >= 0) { input.setAttribute('aria-activedescendant', options[active].id); options[active].scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };
  const execute = (row, { peek = false } = {}) => {
    if (row.type !== 'recentSearch') rememberSearch();
    dialog.close();
    // Depois que o foco voltou para a página: o painel lateral assume dali.
    if (peek && row.peek) { setTimeout(() => { if (!hooks.quickView(row.type, row.id)) location.assign(row.href); }, 30); return; }
    if (row.run) row.run();
    else if (row.href) location.assign(row.href);
  };
  let currentRows = [];
  const draw = (rows, note = '') => {
    currentRows = rows;
    results.replaceChildren();
    options = [];
    let group = null;
    rows.forEach((row, index) => {
      if (row.group !== group) {
        group = row.group;
        results.append(el('li', { role: 'presentation', class: 'command-group', text: group }));
      }
      const option = el('li', { role: 'option', id: `command-option-${index}`, class: 'command-option', 'aria-selected': 'false' }, [
        el('span', { class: 'command-icon' }, icon(row.icon || TYPE_ICONS[row.type] || 'arrowRight')),
        el('span', { class: 'command-text' }, [el('span', { class: 'command-title' }, highlight(row.title, lastTerms)), row.detail ? el('span', { class: 'command-detail', text: row.detail }) : null]),
        row.peek ? el('span', { class: 'command-kind', text: '⇧↵ espiar' }) : null
      ]);
      option.addEventListener('click', (event) => execute(row, { peek: event.shiftKey }));
      option.addEventListener('mousemove', () => { if (options[active] !== option) setActive(options.indexOf(option)); });
      options.push(option);
      results.append(option);
    });
    status.textContent = note || (rows.length ? `${rows.length} resultado${rows.length > 1 ? 's' : ''}. ↑ ↓ para navegar, Enter para abrir.` : 'Nada encontrado. Tente outro termo.');
    setActive(0);
  };
  const search = () => {
    const started = performance.now();
    const terms = fold(input.value.trim()).split(/\s+/).filter(Boolean);
    lastTerms = terms;
    if (!terms.length) {
      const state = readState();
      const suggestions = new Set(PERSONA_META[ctx.persona?.key]?.suggestions || []);
      const byId = new Map(pool.map((row) => [`${row.type}:${row.id}`, row]));
      const entity = (entry, group) => {
        const row = byId.get(`${entry.type}:${entry.id}`);
        return row ? { ...row, group } : null;
      };
      const priority = [...suggestions];
      const work = ctx.audience === 'company' ? workQueue({ rfqs: ctx.data?.rfqs || [], approvals: ctx.demoApprovals || [], contracts: ctx.data?.contracts || [], tasks: ctx.data?.tasks || [], viewerId: ctx.viewer?.id, members: ctx.members, canManage: ctx.can('create_rfq') })
        .slice(0, 4).map((item) => ({ type: 'work', id: `work-${item.kind}-${item.id}`, group: 'Seu trabalho', title: `${item.action}${item.kind === 'task' ? '' : ` — ${item.title}`}`, detail: [item.state, item.due?.text].filter(Boolean).join(' · '), icon: 'arrowRight', href: ctx.href(item.href) })) : [];
      const rows = [
        ...work,
        ...pool.filter((row) => row.type === 'action').sort((a, b) => (priority.includes(a.id) ? priority.indexOf(a.id) : 50) - (priority.includes(b.id) ? priority.indexOf(b.id) : 50)).slice(0, 4),
        ...pool.filter((row) => row.type === 'context'),
        ...readOS().recentSearches.slice().reverse().slice(0, 4).map((query, index) => ({ type: 'recentSearch', id: `recent-search-${index}`, group: 'Buscas recentes', title: query, detail: 'Buscar de novo', run: () => hooks.reopen(query) })),
        ...state.recents.map((entry) => entity(entry, 'Recentes')).filter(Boolean).slice(0, 4),
        ...state.favorites.map((entry) => entity(entry, 'Favoritos')).filter(Boolean).slice(0, 4),
        ...pool.filter((row) => row.type === 'nav').sort((a, b) => (priority.includes(a.id) ? priority.indexOf(a.id) : 50) - (priority.includes(b.id) ? priority.indexOf(b.id) : 50)).slice(0, 5),
        ...pool.filter((row) => row.type === 'persona')
      ];
      draw(rows, 'Digite para buscar solicitações, contratos, provedores, visões e ações. Shift+Enter espia sem sair da página.');
      return;
    }
    const haystack = (row) => fold(`${row.title} ${row.detail || ''} ${row.group} ${row.keywords || ''}`);
    const hits = pool.filter((row) => terms.every((term) => haystack(row).includes(term)));
    const rank = (row) => {
      const title = fold(row.title);
      if (terms.every((term) => title.startsWith(term) || title.includes(` ${term}`))) return 0;
      if (terms.every((term) => title.includes(term))) return 1;
      return 2;
    };
    const tier = (row) => (GROUP_ORDER.includes(row.group) ? GROUP_ORDER.indexOf(row.group) : 99);
    const ordered = hits.map((row, index) => ({ row, index })).sort((a, b) => rank(a.row) - rank(b.row) || tier(a.row) - tier(b.row) || a.index - b.index).map(({ row }) => row);
    // Agrupa mantendo a ordem de relevância do primeiro de cada grupo.
    const groups = [];
    for (const row of ordered.slice(0, 30)) { let bucket = groups.find((entry) => entry.name === row.group); if (!bucket) groups.push(bucket = { name: row.group, rows: [] }); bucket.rows.push(row); }
    draw(groups.flatMap((entry) => entry.rows));
    mark('search', performance.now() - started, { results: ordered.length });
  };
  const rememberSearch = () => {
    const query = input.value.trim();
    if (query.length < 2) return;
    updateOS((draft) => { draft.recentSearches = [...draft.recentSearches.filter((value) => value !== query), query]; });
    track('search_performed', { length: query.length });
  };
  input.addEventListener('input', search);
  input.addEventListener('keydown', (event) => {
    // Escape fecha mesmo com texto digitado (o campo de busca nativo só o limparia).
    if (event.key === 'Escape') { event.preventDefault(); dialog.close(); return; }
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(active + 1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(active - 1); }
    if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      const index = Number(options[active].id.replace('command-option-', ''));
      execute(currentRows[index], { peek: event.shiftKey });
    }
  });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  let opener = null;
  dialog.addEventListener('close', () => { (opener && document.contains(opener) ? opener : document.querySelector('#command-trigger'))?.focus(); });
  dialog.append(el('div', { class: 'command-input' }, [icon('search', { size: 18 }), input, el('kbd', { class: 'kbd', text: 'Esc' })]), results, status,
    el('p', { class: 'command-foot' }, [el('kbd', { class: 'kbd', text: '↑↓' }), ' navegar ', el('kbd', { class: 'kbd', text: '↵' }), ' abrir ', el('kbd', { class: 'kbd', text: '⇧↵' }), ' espiar ', el('kbd', { class: 'kbd', text: 'Esc' }), ' fechar']));
  document.body.append(dialog);

  const api = {
    open(query = '') {
      opener = document.activeElement;
      pool = [...commands(ctx, hooks), ...records(ctx)];
      input.value = query;
      search();
      if (!dialog.open) dialog.showModal();
      input.focus();
    },
    close() { if (dialog.open) dialog.close(); },
    get isOpen() { return dialog.open; }
  };
  return api;
}

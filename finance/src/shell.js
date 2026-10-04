// Estrutura do espaço de trabalho: barra lateral, barra superior, navegação
// móvel, busca (Ctrl/Cmd+K), central de notificações e faixa da demonstração.

import { el, icon, fold, timeAgo, productLabel, RFQ_STATUS, CONTRACT_STATUS, formatDate } from './core.js';
import { avatar, iconButton, button, toast, confirmDialog } from './ui.js';

const COMPANY_NAV = [
  { key: 'dashboard', label: 'Painel', path: '/finance/dashboard.html', icon: 'home' },
  { key: 'rfqs', label: 'Solicitações', path: '/finance/rfqs.html', icon: 'file', views: ['rfqs', 'rfq', 'newRfq'] },
  { key: 'approvals', label: 'Aprovações', path: '/finance/approvals.html', icon: 'checkCircle' },
  { key: 'proposals', label: 'Propostas', path: '/finance/proposals.html', icon: 'inbox' },
  { key: 'contracts', label: 'Contratos', path: '/finance/contracts.html', icon: 'briefcase' },
  { key: 'portfolio', label: 'Portfólio', path: '/finance/portfolio.html', icon: 'layers' },
  { key: 'value', label: 'Valor', path: '/finance/value.html', icon: 'layers' },
  { key: 'fees', label: 'Tarifas', path: '/finance/fees.html', icon: 'scale' },
  { key: 'providers', label: 'Provedores', path: '/finance/providers.html', icon: 'building' },
  { key: 'passport', label: 'Passport', path: '/finance/passport.html', icon: 'shield' },
  { key: 'tasks', label: 'Tarefas', path: '/finance/tasks.html', icon: 'tasks' },
  { key: 'notifications', label: 'Notificações', path: '/finance/notifications.html', icon: 'bell', mobileOnly: true },
  { key: 'settings', label: 'Configurações', path: '/finance/settings.html', icon: 'settings' }
];
const PROVIDER_NAV = [
  { key: 'providerHome', label: 'Início', path: '/provider/index.html', icon: 'home' },
  { key: 'providerRfqs', label: 'Oportunidades', path: '/provider/rfqs.html', icon: 'inbox', views: ['providerRfqs', 'providerProposal'] },
  { key: 'providerInvite', label: 'Código de convite', path: '/provider/invite.html', icon: 'send' }
];
const MOBILE_TABS = { company: ['dashboard', 'rfqs', 'approvals', 'contracts'], provider: ['providerHome', 'providerRfqs', 'providerInvite'] };

export function navFor(audience) { return audience === 'provider' ? PROVIDER_NAV : COMPANY_NAV; }

function activeKey(ctx) {
  const view = ctx.view === 'home' ? 'dashboard' : ctx.view;
  return navFor(ctx.audience).find((item) => item.key === view || item.views?.includes(view))?.key;
}

export function renderSidebar(ctx, counts = {}) {
  const aside = document.querySelector('.sidebar');
  if (!aside) return;
  const current = activeKey(ctx);
  const nav = el('nav', { class: 'side-nav', 'aria-label': 'Navegacao do portal' });
  const list = el('ul', { role: 'list' });
  for (const item of navFor(ctx.audience).filter((entry) => !entry.mobileOnly)) {
    const count = counts[item.key];
    list.append(el('li', {}, el('a', { href: ctx.href(item.path), class: 'side-link', 'aria-current': item.key === current ? 'page' : null }, [
      icon(item.icon, { size: 18 }), el('span', { class: 'side-label', text: item.label }),
      count ? el('span', { class: 'side-count', 'aria-label': `${count} pendentes`, text: String(count) }) : null
    ])));
  }
  nav.append(list);
  const brand = el('a', { class: 'brand', href: ctx.href(ctx.audience === 'provider' ? '/provider/index.html' : '/finance/dashboard.html') }, [
    el('span', { class: 'brand-mark', 'aria-hidden': 'true', text: 'A' }),
    el('span', { class: 'brand-text' }, [el('span', { class: 'brand-name', text: 'Arandu' }), el('span', { class: 'brand-sub', text: 'Financial Procurement' })])
  ]);
  const workspace = ctx.organization ? el('div', { class: 'workspace-switch' }, [
    el('span', { class: 'workspace-avatar', 'aria-hidden': 'true', text: (ctx.organization.legal_name || '?').slice(0, 1) }),
    el('span', { class: 'workspace-text' }, [
      el('span', { class: 'workspace-name', text: ctx.organization.legal_name }),
      el('span', { class: 'workspace-kind', text: ctx.audience === 'provider' ? 'Espaço do provedor' : 'Espaço da empresa' })
    ])
  ]) : null;
  if (workspace && ctx.organizations?.length > 1) {
    const select = el('select', { class: 'workspace-select', 'aria-label': 'Organização ativa' });
    for (const organization of ctx.organizations) select.add(new Option(organization.legal_name, organization.id));
    select.value = ctx.organization.id;
    select.addEventListener('change', () => {
      try { sessionStorage.setItem('arandu-finance-org', select.value); } catch { /* segue sem memória */ }
      location.reload();
    });
    workspace.append(select);
  }
  const foot = el('div', { class: 'side-foot' }, [
    el('a', { class: 'side-minor', href: ctx.href('/finance/boundaries.html') }, [icon('shield', { size: 16 }), el('span', { text: 'Limites do produto' })]),
    ctx.viewer ? el('div', { class: 'side-user' }, [avatar(ctx.viewer.name || 'Você', { size: 'sm' }), el('span', { class: 'side-user-text' }, [
      el('span', { class: 'side-user-name', text: ctx.viewer.name || 'Sua conta' }),
      el('span', { class: 'side-user-role', text: ctx.viewer.title || ctx.viewer.roleLabel || '' })
    ])]) : null
  ]);
  aside.replaceChildren(brand, workspace, nav, foot);
}

export function renderMobileNav(ctx, counts = {}) {
  document.querySelector('.mobile-tabbar')?.remove();
  const current = activeKey(ctx);
  const items = navFor(ctx.audience);
  const bar = el('nav', { class: 'mobile-tabbar', 'aria-label': 'Navegação principal' });
  for (const key of MOBILE_TABS[ctx.audience]) {
    const item = items.find((entry) => entry.key === key);
    const count = counts[key];
    bar.append(el('a', { href: ctx.href(item.path), class: 'tab-item', 'aria-current': key === current ? 'page' : null }, [
      el('span', { class: 'tab-icon' }, [icon(item.icon, { size: 20 }), count ? el('span', { class: 'tab-badge', text: String(count) }) : null]),
      el('span', { class: 'tab-label', text: item.label })
    ]));
  }
  const more = el('button', { type: 'button', class: 'tab-item', 'aria-haspopup': 'dialog' }, [el('span', { class: 'tab-icon' }, icon('menu', { size: 20 })), el('span', { class: 'tab-label', text: 'Mais' })]);
  more.addEventListener('click', () => openMoreSheet(ctx, counts));
  bar.append(more);
  document.body.append(bar);
}

function openMoreSheet(ctx, counts) {
  const sheet = el('dialog', { class: 'sheet', 'aria-label': 'Todas as seções' });
  const list = el('ul', { role: 'list', class: 'sheet-list' });
  for (const item of navFor(ctx.audience)) {
    list.append(el('li', {}, el('a', { href: ctx.href(item.path), class: 'sheet-link' }, [icon(item.icon, { size: 18 }), el('span', { text: item.label }),
      counts[item.key] ? el('span', { class: 'side-count', text: String(counts[item.key]) }) : null])));
  }
  list.append(el('li', {}, el('a', { href: ctx.href('/finance/boundaries.html'), class: 'sheet-link' }, [icon('shield', { size: 18 }), el('span', { text: 'Limites do produto' })])));
  sheet.append(el('div', { class: 'sheet-head' }, [el('span', { class: 'sheet-title', text: ctx.organization?.legal_name || 'Arandu' }), iconButton('x', 'Fechar', { onClick: () => sheet.close() })]), list);
  sheet.addEventListener('close', () => sheet.remove());
  sheet.addEventListener('click', (event) => { if (event.target === sheet) sheet.close(); });
  document.body.append(sheet);
  sheet.showModal();
}

/** O servidor devolve estado e datas em forma técnica; a busca mostra texto de gente. */
export function readableDetail(detail) {
  const text = String(detail || '').trim();
  const status = RFQ_STATUS[text] || CONTRACT_STATUS[text];
  if (status) return status.label;
  return text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (iso) => formatDate(iso));
}

export function renderTopbar(ctx) {
  const bar = document.querySelector('.topbar');
  if (!bar) return {};
  const mobileBrand = el('a', { class: 'topbar-brand', href: ctx.href(ctx.audience === 'provider' ? '/provider/index.html' : '/finance/dashboard.html'), 'aria-label': 'Arandu — início' },
    [el('span', { class: 'brand-mark', 'aria-hidden': 'true', text: 'A' }), el('span', { class: 'topbar-org', text: ctx.organization?.legal_name || 'Arandu' })]);
  const actions = el('div', { class: 'topbar-actions' });
  // No celular a faixa da demonstração rola para fora da tela: este selo fica sempre visível.
  if (ctx.mode === 'demo') actions.append(el('span', { class: 'demo-chip', title: 'Ambiente demonstrativo. Dados fictícios.' }, [icon('info', { size: 12 }), el('span', { text: 'Demo · dados fictícios' })]));
  // Ambiente de demonstração com banco próprio: o produto real, com empresa fictícia.
  else if (ctx.environment === 'demo') actions.append(el('span', { class: 'demo-chip env-chip', id: 'environment-chip', title: 'Ambiente de demonstração: produto real, empresa e instituições fictícias.' }, [icon('info', { size: 12 }), el('span', { class: 'env-long', text: 'Ambiente de demonstração' }), el('span', { class: 'env-short', text: 'Demo' })]));
  let searchButton = null;
  if (ctx.audience === 'company' && ctx.organization) {
    searchButton = el('button', { type: 'button', id: 'command-trigger', class: 'search-trigger', 'aria-keyshortcuts': 'Control+K Meta+K', 'aria-label': 'Buscar (Ctrl+K)' }, [
      icon('search'), el('span', { class: 'search-trigger-text', text: 'Buscar' }), el('kbd', { class: 'kbd', 'aria-hidden': 'true', text: navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl K' })
    ]);
    actions.append(searchButton);
  }
  const bell = ctx.organization ? el('button', { type: 'button', id: 'notification-trigger', class: 'icon-btn bell', 'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-label': 'Notificações' },
    [icon('bell', { size: 18 }), el('span', { class: 'bell-badge', hidden: true })]) : null;
  if (bell) actions.append(bell);
  if (ctx.viewer) {
    const account = el('div', { class: 'account' });
    const trigger = el('button', { type: 'button', class: 'account-trigger', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': `Conta de ${ctx.viewer.name || 'usuário'}` }, avatar(ctx.viewer.name || 'Você', { size: 'sm' }));
    const panel = el('div', { class: 'account-menu', hidden: true }, [
      el('p', { class: 'account-name', text: ctx.viewer.name || 'Sua conta' }),
      el('p', { class: 'account-detail', text: [ctx.viewer.title, ctx.organization?.legal_name].filter(Boolean).join(' · ') }),
      ctx.audience === 'company' ? el('a', { class: 'menu-item', href: ctx.href('/finance/settings.html') }, [icon('settings'), el('span', { text: 'Configurações' })]) : null,
      ctx.mode === 'demo'
        ? el('a', { class: 'menu-item', href: '/demo/index.html' }, [icon('swap'), el('span', { text: 'Sair da demonstração' })])
        : el('button', { type: 'button', class: 'menu-item', id: 'logout' }, [icon('logout'), el('span', { text: 'Sair' })])
    ]);
    trigger.addEventListener('click', () => { panel.hidden = !panel.hidden; trigger.setAttribute('aria-expanded', String(!panel.hidden)); });
    document.addEventListener('click', (event) => { if (!account.contains(event.target)) { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); } });
    panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') { panel.hidden = true; trigger.focus(); } });
    panel.querySelector('#logout')?.addEventListener('click', async () => {
      try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* sai mesmo sem resposta */ }
      location.assign('/login.html');
    });
    account.append(trigger, panel);
    actions.append(account);
  }
  bar.replaceChildren(mobileBrand, el('div', { class: 'topbar-crumbs', id: 'breadcrumbs' }), actions);
  return { searchButton, bell };
}

// ----------------------------------------------------------- faixa demo
export function renderDemoBanner(ctx) {
  if (ctx.mode !== 'demo') return;
  document.querySelector('.demo-banner')?.remove();
  const persona = ctx.persona;
  const banner = el('div', { class: 'demo-banner', role: 'region', 'aria-label': 'Ambiente demonstrativo' });
  const text = el('p', { class: 'demo-text' }, [
    icon('info', { size: 16 }), el('strong', { text: 'Ambiente demonstrativo' }),
    el('span', { class: 'demo-sub', text: 'Dados fictícios. Nenhuma operação financeira real será executada.' })
  ]);
  const group = el('div', { class: 'persona-switch', role: 'radiogroup', 'aria-label': 'Visualizar como' });
  group.append(el('span', { class: 'persona-label', 'aria-hidden': 'true', text: 'Visualizar como:' }));
  for (const [key, label] of [['buyer', 'Comprador'], ['approver', 'Aprovador'], ['provider', 'Provedor'], ['admin', 'Admin']]) {
    const selected = persona?.key === key;
    const option = el('button', { type: 'button', role: 'radio', class: 'persona-option', 'aria-checked': String(selected), dataset: { persona: key }, text: label });
    option.addEventListener('click', () => {
      for (const node of group.querySelectorAll('.persona-option')) node.setAttribute('aria-checked', String(node === option));
      ctx.switchPersona(key);
    });
    option.addEventListener('keydown', (event) => {
      const options = [...group.querySelectorAll('.persona-option')];
      const index = options.indexOf(option);
      if (['ArrowRight', 'ArrowDown'].includes(event.key)) { event.preventDefault(); options[(index + 1) % options.length].focus(); }
      if (['ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); options[(index - 1 + options.length) % options.length].focus(); }
    });
    option.tabIndex = selected ? 0 : -1;
    group.append(option);
  }
  const who = el('span', { class: 'persona-who', text: persona ? `${persona.name} · ${persona.title}` : '' });
  const reset = el('button', { type: 'button', class: 'demo-reset', id: 'demo-reset' }, [icon('refresh', { size: 14 }), el('span', { text: 'Restaurar demonstração' })]);
  reset.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Restaurar a demonstração?',
      description: 'Tudo o que você criou ou alterou nesta demonstração será apagado deste navegador e o conjunto fictício inicial voltará. Nenhum dado real é afetado.',
      confirmLabel: 'Restaurar dados iniciais', tone: 'danger'
    });
    if (!ok) return;
    ctx.transport.reset();
    toast('Demonstração restaurada ao estado inicial.');
    setTimeout(() => location.assign(ctx.href(persona?.audience === 'provider' ? '/provider/index.html' : '/finance/dashboard.html')), 400);
  });
  banner.append(text, el('div', { class: 'demo-controls' }, [group, who, reset]));
  document.body.prepend(banner);
  // Barras fixas abaixo da faixa usam a altura real dela (muda ao quebrar linha).
  const measure = () => document.documentElement.style.setProperty('--banner-h', `${banner.offsetHeight}px`);
  measure();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(measure).observe(banner);
}

// ------------------------------------------------------------------ busca
const KIND_LABELS = { rfq: 'Solicitação', proposal: 'Proposta', provider: 'Provedor', contract: 'Contrato', task: 'Tarefa', action: 'Ação' };
const KIND_ICONS = { rfq: 'file', proposal: 'inbox', provider: 'building', contract: 'briefcase', task: 'tasks', action: 'arrowRight' };

function localItems(ctx) {
  const data = ctx.data || {};
  const items = [];
  if (ctx.can('create_rfq')) items.push({ kind: 'action', title: 'Criar solicitação', detail: 'Crédito ou adquirência', href: ctx.href('/finance/new-rfq.html') });
  items.push(
    { kind: 'action', title: 'Abrir aprovações', detail: 'Caixa de aprovação', href: ctx.href('/finance/approvals.html') },
    { kind: 'action', title: 'Ver contratos e renovações', detail: 'Ciclo de vida', href: ctx.href('/finance/contracts.html') },
    { kind: 'action', title: 'Ver notificações', detail: 'Central de avisos', href: ctx.href('/finance/notifications.html') }
  );
  for (const rfq of data.rfqs || []) {
    items.push({ kind: 'rfq', title: rfq.title, detail: `${productLabel(rfq.product, { short: true })} · ${RFQ_STATUS[rfq.status]?.label || rfq.status}`, href: ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}`) });
    for (const proposal of rfq.proposals || []) items.push({ kind: 'proposal', title: proposal.provider_name, detail: rfq.title, href: ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}#propostas`) });
  }
  for (const provider of data.providers || []) items.push({ kind: 'provider', title: provider.name, detail: provider.region || '', href: ctx.href(`/finance/providers.html#provider-${provider.id}`) });
  for (const contract of data.contracts || []) items.push({ kind: 'contract', title: contract.provider_name || 'Contrato', detail: `${productLabel(contract.product, { short: true })} · vence ${contract.ends_on}`, href: ctx.href(`/finance/contracts.html#contract-${contract.id}`) });
  for (const task of data.tasks || []) items.push({ kind: 'task', title: task.title, detail: task.due_on ? `prazo ${task.due_on}` : '', href: ctx.href(`/finance/tasks.html#task-${task.id}`) });
  return items;
}

export function installCommandCenter(ctx, trigger) {
  if (!trigger || typeof HTMLDialogElement === 'undefined') return;
  const dialog = el('dialog', { id: 'command-center', class: 'command-dialog', 'aria-label': 'Buscar no espaço da empresa' });
  const input = el('input', { id: 'command-query', type: 'search', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'command-results', 'aria-autocomplete': 'list',
    autocomplete: 'off', placeholder: 'Buscar solicitações, propostas, provedores, contratos, tarefas…', 'aria-label': 'Buscar no espaço da empresa' });
  const results = el('ul', { id: 'command-results', role: 'listbox', class: 'command-results', 'aria-label': 'Resultados' });
  const status = el('p', { class: 'command-status', role: 'status', 'aria-live': 'polite' });
  const items = localItems(ctx);
  let options = [];
  let active = -1;
  let timer;
  let sequence = 0;

  const setActive = (index) => {
    active = options.length ? (index + options.length) % options.length : -1;
    options.forEach((option, position) => option.setAttribute('aria-selected', String(position === active)));
    if (active >= 0) { input.setAttribute('aria-activedescendant', options[active].id); options[active].scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };
  const render = (rows, note = '') => {
    results.replaceChildren();
    options = [];
    let group = null;
    rows.forEach((row, index) => {
      if (row.kind !== group) {
        group = row.kind;
        results.append(el('li', { role: 'presentation', class: 'command-group', text: KIND_LABELS[row.kind] || row.kind }));
      }
      const option = el('li', { role: 'option', id: `command-option-${index}`, class: 'command-option', 'aria-selected': 'false', dataset: { href: row.href } }, [
        el('span', { class: 'command-icon' }, icon(KIND_ICONS[row.kind] || 'arrowRight')),
        el('span', { class: 'command-text' }, [el('span', { class: 'command-title', text: row.title }), row.detail ? el('span', { class: 'command-detail', text: row.detail }) : null]),
        el('span', { class: 'command-kind', text: KIND_LABELS[row.kind] || row.kind })
      ]);
      option.addEventListener('click', () => go(row.href));
      option.addEventListener('mousemove', () => setActive(options.indexOf(option)));
      options.push(option);
      results.append(option);
    });
    status.textContent = note || (rows.length ? `${rows.length} resultado${rows.length > 1 ? 's' : ''}. Use ↑ ↓ e Enter.` : 'Nenhum resultado nesta organização. Tente outro termo.');
    setActive(0);
  };
  const go = (href) => { dialog.close(); location.assign(href); };
  const localSearch = (term) => {
    const terms = fold(term).split(/\s+/).filter(Boolean);
    if (!terms.length) return items.filter((item) => item.kind === 'action').concat(items.filter((item) => item.kind === 'rfq').slice(0, 5));
    const hits = items.filter((item) => terms.every((part) => fold(`${item.title} ${item.detail} ${KIND_LABELS[item.kind]}`).includes(part)));
    // Com termo digitado, registros vêm antes de atalhos; títulos antes de detalhes.
    const rank = (item) => (item.kind === 'action' ? 2 : terms.every((part) => fold(item.title).includes(part)) ? 0 : 1);
    return hits.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(({ item }) => item).slice(0, 20);
  };
  const draw = () => {
    clearTimeout(timer);
    const term = input.value.trim();
    const current = ++sequence;
    const local = localSearch(term);
    if (term.length < 2) { render(local); return; }
    render(local, 'Buscando…');
    timer = setTimeout(async () => {
      try {
        const response = await ctx.api(`search?organization_id=${encodeURIComponent(ctx.organization.id)}&q=${encodeURIComponent(term)}`);
        if (current !== sequence || !dialog.open) return;
        const seen = new Set();
        const rows = (response.rows || []).map((row) => ({ kind: row.kind, title: row.title, detail: readableDetail(row.detail), href: ctx.href(row.href) }))
          .concat(local.filter((item) => item.kind === 'action'))
          .filter((row) => { const key = `${row.kind}:${row.title}:${row.href}`; if (seen.has(key)) return false; seen.add(key); return true; });
        render(rows);
      } catch {
        if (current === sequence) render(local, 'A busca completa está indisponível; mostrando resultados já carregados.');
      }
    }, 220);
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(active + 1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(active - 1); }
    if (event.key === 'Enter' && active >= 0) { event.preventDefault(); go(options[active].dataset.href); }
  });
  dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); dialog.close(); } });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => trigger.focus());
  dialog.append(el('div', { class: 'command-input' }, [icon('search', { size: 18 }), input, el('kbd', { class: 'kbd', text: 'Esc' })]), results, status,
    el('p', { class: 'command-foot' }, [el('kbd', { class: 'kbd', text: '↑↓' }), ' navegar ', el('kbd', { class: 'kbd', text: 'Enter' }), ' abrir ', el('kbd', { class: 'kbd', text: 'Esc' }), ' fechar']));
  document.body.append(dialog);
  const open = () => { input.value = ''; draw(); dialog.showModal(); input.focus(); };
  trigger.addEventListener('click', open);
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if (!dialog.open) open(); }
  });
}

// ------------------------------------------------------ notificações
export const NOTIFICATION_META = Object.freeze({
  approval_requested: { label: 'Aprovação', icon: 'checkCircle', priority: 0, tone: 'warning' },
  policy_exception_requested: { label: 'Exceção', icon: 'alert', priority: 0, tone: 'warning' },
  policy_exception_decided: { label: 'Exceção', icon: 'checkCircle', priority: 2, tone: 'info' },
  mention: { label: 'Menção', icon: 'at', priority: 1, tone: 'accent' },
  invite_received: { label: 'Convite', icon: 'send', priority: 1, tone: 'accent' },
  approval_changes_requested: { label: 'Aprovação', icon: 'edit', priority: 1, tone: 'warning' },
  approval_rejected: { label: 'Aprovação', icon: 'x', priority: 1, tone: 'danger' },
  proposal_received: { label: 'Proposta', icon: 'inbox', priority: 2, tone: 'info' },
  proposal_revised: { label: 'Proposta', icon: 'repeat', priority: 2, tone: 'info' },
  deadline: { label: 'Prazo', icon: 'clock', priority: 2, tone: 'warning' },
  renewal_due: { label: 'Renovação', icon: 'calendar', priority: 2, tone: 'warning' },
  approval_approved: { label: 'Aprovação', icon: 'checkCircle', priority: 3, tone: 'success' },
  comment: { label: 'Comentário', icon: 'message', priority: 3, tone: 'neutral' },
  rfq_revised: { label: 'Revisão', icon: 'repeat', priority: 3, tone: 'neutral' },
  task_assigned: { label: 'Tarefa', icon: 'tasks', priority: 3, tone: 'neutral' }
});

export function notificationHref(ctx, row) {
  if (ctx.audience === 'provider') {
    if (row.object_type === 'invite') return ctx.href('/provider/index.html#convites');
    if (row.object_type === 'rfq') return ctx.href(`/provider/rfqs.html#rfq-${row.object_id}`);
    return ctx.href('/provider/index.html');
  }
  const id = encodeURIComponent(row.object_id);
  if (row.object_type === 'rfq') {
    const tab = { approval_requested: 'aprovacoes', approval_approved: 'decisao', approval_rejected: 'aprovacoes', approval_changes_requested: 'aprovacoes',
      policy_exception_requested: 'aprovacoes', policy_exception_decided: 'aprovacoes', mention: 'atividade', comment: 'atividade', proposal_received: 'propostas', proposal_revised: 'propostas' }[row.event_type];
    return ctx.href(`/finance/rfq.html?id=${id}${tab ? `#${tab}` : ''}`);
  }
  if (row.object_type === 'contract') return ctx.href(`/finance/contracts.html#contract-${id}`);
  if (row.object_type === 'task') return ctx.href(`/finance/tasks.html#task-${id}`);
  return ctx.href('/finance/notifications.html');
}

export function notificationItem(ctx, row, { onOpen = null } = {}) {
  const meta = NOTIFICATION_META[row.event_type] || { label: 'Aviso', icon: 'bell', tone: 'neutral' };
  const link = el('a', { class: `notice${row.read_at ? '' : ' unread'}`, href: notificationHref(ctx, row), dataset: { id: row.id } }, [
    el('span', { class: `notice-icon tone-${meta.tone}` }, icon(meta.icon, { size: 16 })),
    el('span', { class: 'notice-text' }, [
      el('span', { class: 'notice-title' }, [row.read_at ? null : el('span', { class: 'sr-only', text: 'Não lida: ' }), row.title]),
      el('span', { class: 'notice-body', text: row.body }),
      el('span', { class: 'notice-meta', text: `${meta.label} · ${timeAgo(row.created_at)}` })
    ]),
    row.read_at ? null : el('span', { class: 'unread-dot', 'aria-hidden': 'true' })
  ]);
  link.addEventListener('click', (event) => {
    if (row.read_at) return;
    event.preventDefault();
    const destination = link.href;
    ctx.api('notifications', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, ids: [row.id] }) })
      .catch(() => {}).finally(() => { onOpen?.(); location.assign(destination); });
  });
  return link;
}

export function installNotificationCenter(ctx, bell) {
  if (!bell) return;
  const badge = bell.querySelector('.bell-badge');
  const panel = el('div', { class: 'notification-panel', id: 'notification-center', role: 'dialog', 'aria-label': 'Notificações', hidden: true });
  const list = el('div', { class: 'notification-list', 'aria-live': 'polite' });
  const filter = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Filtrar notificações' });
  let onlyUnread = true;
  const unreadButton = el('button', { type: 'button', class: 'segment', 'aria-pressed': 'true', text: 'Não lidas' });
  const allButton = el('button', { type: 'button', class: 'segment', 'aria-pressed': 'false', text: 'Todas' });
  filter.append(unreadButton, allButton);
  const markAll = button('Marcar todas como lidas', { variant: 'ghost', size: 'sm', iconName: 'check' });
  let rows = [];
  const draw = () => {
    list.replaceChildren();
    const visible = rows.filter((row) => !onlyUnread || !row.read_at)
      .sort((a, b) => (a.read_at ? 1 : 0) - (b.read_at ? 1 : 0)
        || (NOTIFICATION_META[a.event_type]?.priority ?? 9) - (NOTIFICATION_META[b.event_type]?.priority ?? 9)
        || String(b.created_at).localeCompare(String(a.created_at)));
    for (const row of visible.slice(0, 12)) list.append(notificationItem(ctx, row));
    if (!visible.length) list.append(el('div', { class: 'notification-empty' }, [icon('checkCircle', { size: 20 }), el('p', { text: onlyUnread ? 'Nada novo. Você está em dia.' : 'Nenhuma notificação por enquanto.' })]));
    const unread = rows.filter((row) => !row.read_at).length;
    badge.hidden = !unread;
    badge.textContent = unread > 9 ? '9+' : String(unread);
    bell.setAttribute('aria-label', unread ? `Notificações, ${unread} não lidas` : 'Notificações');
    markAll.disabled = !unread;
  };
  const refresh = async () => {
    try {
      const result = await ctx.api(`notifications?organization_id=${encodeURIComponent(ctx.organization.id)}`);
      rows = result.rows || [];
      draw();
    } catch (error) {
      list.replaceChildren(el('p', { class: 'muted pad', text: `Não foi possível carregar notificações: ${error.message}` }));
    }
  };
  unreadButton.addEventListener('click', () => { onlyUnread = true; unreadButton.setAttribute('aria-pressed', 'true'); allButton.setAttribute('aria-pressed', 'false'); draw(); });
  allButton.addEventListener('click', () => { onlyUnread = false; allButton.setAttribute('aria-pressed', 'true'); unreadButton.setAttribute('aria-pressed', 'false'); draw(); });
  markAll.addEventListener('click', async () => {
    markAll.disabled = true;
    try {
      await ctx.api('notifications', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id }) });
      rows = rows.map((row) => ({ ...row, read_at: row.read_at || new Date().toISOString() }));
      draw();
      toast('Notificações marcadas como lidas.');
    } catch (error) { toast(error.message, 'error'); markAll.disabled = false; }
  });
  panel.append(
    el('div', { class: 'notification-head' }, [el('h2', { class: 'notification-title', text: 'Notificações' }), filter]),
    list,
    el('div', { class: 'notification-foot' }, [markAll,
      el('a', { class: 'btn btn-ghost btn-sm', href: ctx.href(ctx.audience === 'provider' ? '/provider/index.html' : '/finance/notifications.html') }, [el('span', { text: 'Ver todas' })]),
      ctx.audience === 'company' ? el('a', { class: 'btn btn-ghost btn-sm', href: ctx.href('/finance/settings.html#notificacoes') }, [icon('settings'), el('span', { text: 'Preferências' })]) : null])
  );
  const close = () => { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); };
  bell.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    bell.setAttribute('aria-expanded', String(open));
    if (open) { refresh(); panel.querySelector('.segment')?.focus(); }
  });
  panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') { close(); bell.focus(); } });
  document.addEventListener('click', (event) => { if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) close(); });
  bell.parentElement.append(panel);
  refresh();
  return { refresh };
}

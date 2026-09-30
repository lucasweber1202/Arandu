// Shell da demonstração: navegação → workspace → contexto.
//
// * Barra lateral silenciosa, agrupada por intenção (Trabalho, Gestão) e com
//   favoritos e visões da pessoa; automática, expandida, compacta ou oculta.
// * Topbar mínima: onde estou (trilha), buscar ou executar, ● DEMO,
//   notificações e um único menu de conta que também troca a persona.
// O shell nunca decide permissão: só reorganiza os links que o papel já vê.

import { el, icon } from '../../src/core.js';
import { avatar, button, linkButton, toast, confirmDialog } from '../../src/ui.js';
import * as prefs from './preferences.js';
import { PERSONA_META, PERSONA_ORDER } from './personas.js';
import { popover, closeOpenPopover } from './popover.js';
import { activeView } from './saved-views.js';

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
export const mod = () => (isMac() ? '⌘' : 'Ctrl+');

export function announce(text) {
  let region = document.getElementById('dw-announcer');
  if (!region) { region = el('p', { id: 'dw-announcer', class: 'sr-only', role: 'status', 'aria-live': 'polite' }); document.body.append(region); }
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = text; });
}

/** Onde "Início" leva, conforme a persona e a preferência de página inicial. */
export function homeHref(ctx) {
  if (ctx.persona?.audience === 'provider' || ctx.audience === 'provider') return ctx.href('/provider/index.html');
  const home = prefs.readState().behavior.home;
  return ctx.href(home === 'rfqs' ? '/finance/rfqs.html' : home === 'approvals' ? '/finance/approvals.html' : '/finance/dashboard.html');
}

// --------------------------------------------------------- navegação
/** Estrutura da navegação por público. `views` marca quais telas acendem o item. */
export function navModel(ctx) {
  if (ctx.audience === 'provider') {
    return [
      { key: 'providerHome', label: 'Início', icon: 'home', href: ctx.href('/provider/index.html'), count: 'none' },
      // Oportunidade = demanda que dá para responder; Proposta = a resposta; Convite = o acesso.
      { group: 'Meu trabalho', items: [
        { key: 'providerRfqs', label: 'Oportunidades', icon: 'inbox', href: ctx.href('/provider/rfqs.html'), views: ['providerRfqs', 'providerProposal'] },
        { key: 'providerInvites', label: 'Convites', icon: 'send', href: ctx.href('/provider/index.html#convites'), count: 'providerHome' },
        { key: 'providerInvite', label: 'Aceitar por código', icon: 'lock', href: ctx.href('/provider/invite.html') }
      ] }
    ];
  }
  return [
    // Meu trabalho (o que precisa de mim) → Processos (objetos em andamento) → Rede (contexto).
    { group: 'Meu trabalho', items: [
      { key: 'dashboard', label: 'Início', icon: 'home', href: ctx.href('/finance/dashboard.html'), views: ['dashboard', 'home'] },
      { key: 'approvals', label: 'Aprovações', icon: 'checkCircle', href: ctx.href('/finance/approvals.html') },
      { key: 'tasks', label: 'Tarefas', icon: 'tasks', href: ctx.href('/finance/tasks.html') }
    ] },
    { group: 'Processos', items: [
      { key: 'rfqs', label: 'Solicitações', icon: 'file', href: ctx.href('/finance/rfqs.html'), views: ['rfqs', 'rfq', 'newRfq'] },
      { key: 'proposals', label: 'Propostas', icon: 'inbox', href: ctx.href('/finance/proposals.html') },
      { key: 'contracts', label: 'Contratos', icon: 'briefcase', href: ctx.href('/finance/contracts.html') }
    ] },
    { group: 'Rede', items: [
      { key: 'providers', label: 'Provedores', icon: 'building', href: ctx.href('/finance/providers.html') }
    ] }
  ];
}
const isActive = (ctx, item) => item.key === ctx.view || item.views?.includes(ctx.view);

function navLink(ctx, item, counts) {
  const count = counts?.[item.count || item.key];
  return el('li', {}, el('a', { class: 'side-link', href: item.href, 'aria-current': isActive(ctx, item) ? 'page' : null, dataset: { tip: item.label } }, [
    icon(item.icon, { size: 17 }), el('span', { class: 'side-label', text: item.label }),
    count ? el('span', { class: 'side-count', 'aria-label': `${count} pendentes`, text: String(count) }) : null
  ]));
}

const TYPE_ICON = { rfq: 'file', contract: 'briefcase', provider: 'building' };
function favoriteTarget(ctx, entry) {
  if (entry.type === 'rfq') { const rfq = (ctx.data.rfqs || []).find((row) => row.id === entry.id); return rfq ? { title: rfq.title, href: ctx.href(`/finance/rfq.html?id=${rfq.id}`) } : null; }
  if (entry.type === 'contract') { const contract = (ctx.data.contracts || []).find((row) => row.id === entry.id); return contract ? { title: contract.provider_name || 'Contrato', href: ctx.href(`/finance/contracts.html#contract-${contract.id}`) } : null; }
  const provider = (ctx.data.providers || []).find((row) => row.id === entry.id);
  return provider ? { title: provider.name, href: ctx.href(`/finance/providers.html#provider-${provider.id}`) } : null;
}
export function viewHref(ctx, view) {
  if (view.page === 'contracts') return ctx.href(`/finance/contracts.html${view.extra ? `?visao=${view.id}` : ''}`);
  return ctx.href(`/finance/rfqs.html?${view.query ? `${view.query}&` : ''}visao=${view.id}`);
}

/** Favoritos e visões fixadas: a parte pessoal da barra. */
export function sidebarPersonal(ctx) {
  const box = el('div', { class: 'side-personal' });
  if (ctx.audience !== 'company') return box;
  const state = prefs.readState();
  const favorites = state.favorites.map((entry) => ({ entry, target: favoriteTarget(ctx, entry) })).filter(({ target }) => target).slice(0, 6);
  box.append(el('section', { class: 'side-section', 'aria-labelledby': 'side-favorites' }, [
    el('h2', { class: 'side-section-title', id: 'side-favorites' }, [icon('star', { size: 12 }), el('span', { text: 'Favoritos' })]),
    favorites.length ? el('ul', { role: 'list' }, favorites.map(({ entry, target }) => el('li', {}, el('a', { class: 'side-link side-sub', href: target.href, dataset: { quick: `${entry.type}:${entry.id}`, tip: target.title } }, [
      icon(TYPE_ICON[entry.type], { size: 15 }), el('span', { class: 'side-label', text: target.title })]))))
      : el('p', { class: 'side-empty', text: 'Marque ☆ numa solicitação, contrato ou provedor.' })
  ]));
  const pinned = state.savedViews.filter((view) => view.pinned);
  const currentView = new URLSearchParams(location.search).get('visao') || (['rfqs', 'contracts'].includes(ctx.view) ? activeView(ctx, ctx.view)?.id : null);
  box.append(el('section', { class: 'side-section', 'aria-labelledby': 'side-views' }, [
    el('h2', { class: 'side-section-title', id: 'side-views' }, [icon('bookmark', { size: 12 }), el('span', { text: 'Filtros salvos' })]),
    pinned.length ? el('ul', { role: 'list' }, pinned.map((view) => el('li', {}, el('a', { class: 'side-link side-sub', href: viewHref(ctx, view), 'aria-current': currentView === view.id ? 'page' : null, dataset: { tip: view.name } }, [
      icon('bookmark', { size: 15 }), el('span', { class: 'side-label', text: view.name })]))))
      : el('p', { class: 'side-empty', text: 'Salve um filtro em Solicitações ou Contratos e fixe-o aqui.' })
  ]));
  return box;
}

function workspaceSwitch(ctx) {
  const org = ctx.organization;
  if (!org) return null;
  const wrap = el('div', { class: 'dw-anchor side-org-wrap' });
  const trigger = el('button', { type: 'button', class: 'side-org', 'aria-label': `Organização: ${org.legal_name}`, dataset: { tip: org.legal_name } }, [
    el('span', { class: 'side-org-mark', 'aria-hidden': 'true', text: (org.legal_name || '?').slice(0, 1) }),
    el('span', { class: 'side-org-name', text: String(org.legal_name || '').replace(/ Ltda\.?/, '').replace(/ — DEMO$/, '') }),
    icon('chevronDown', { size: 14, className: 'side-org-chevron' })
  ]);
  const panel = el('div', { class: 'dw-panel org-panel', 'aria-label': 'Organização' }, [
    el('p', { class: 'org-panel-name', text: org.legal_name }),
    el('p', { class: 'org-panel-kind', text: ctx.audience === 'provider' ? 'Espaço do provedor · fictício' : 'Espaço da empresa · fictício' }),
    ctx.audience === 'company' ? linkButton('Dados da empresa', ctx.href('/finance/settings.html#empresa'), { variant: 'ghost', size: 'sm', iconName: 'settings' }) : null,
    el('p', { class: 'org-panel-note', text: 'Na demonstração há uma organização por persona. Troque de papel no menu da conta.' })
  ]);
  popover({ trigger, panel, role: 'dialog' });
  wrap.append(trigger, panel);
  return wrap;
}

export function renderSidebar(ctx, counts = {}) {
  const aside = document.querySelector('.sidebar');
  if (!aside) return;
  aside.id = 'app-sidebar';
  aside.setAttribute('aria-label', 'Barra lateral');
  const collapse = el('button', { type: 'button', class: 'icon-btn side-collapse', 'aria-controls': 'app-sidebar', dataset: { sidebarToggle: '' } }, icon('sidebar', { size: 17 }));
  collapse.addEventListener('click', toggleSidebar);
  const head = el('div', { class: 'side-head' }, [
    el('a', { class: 'brand', href: homeHref(ctx), 'aria-label': 'Arandu — início', dataset: { tip: 'Início' } }, [
      el('span', { class: 'brand-mark', 'aria-hidden': 'true', text: 'A' }), el('span', { class: 'brand-text' }, el('span', { class: 'brand-name', text: 'Arandu' }))]),
    collapse
  ]);
  const list = el('ul', { role: 'list' });
  for (const entry of navModel(ctx)) {
    if (!entry.group) { list.append(navLink(ctx, entry, counts)); continue; }
    list.append(el('li', { class: 'side-group' }, [
      el('span', { class: 'side-group-title', 'aria-hidden': 'true', text: entry.group }),
      el('ul', { role: 'list', 'aria-label': entry.group }, entry.items.map((item) => navLink(ctx, item, counts)))
    ]));
  }
  const nav = el('nav', { class: 'side-nav', 'aria-label': 'Navegacao do portal' }, list);
  const foot = el('div', { class: 'side-foot' }, [
    ctx.audience === 'company' ? el('a', { class: 'side-link', href: ctx.href('/finance/settings.html'), 'aria-current': ctx.view === 'settings' ? 'page' : null, dataset: { tip: 'Configurações' } }, [
      icon('settings', { size: 17 }), el('span', { class: 'side-label', text: 'Configurações' })]) : null
  ]);
  aside.replaceChildren(head, workspaceSwitch(ctx) || '', nav, el('hr', { class: 'side-rule' }), sidebarPersonal(ctx), foot);
  sidebarTooltip();
  syncShell();
}

// ------------------------------------------------------ estados da barra
export function sidebarEffective() { return document.documentElement.dataset.sidebarState || 'expanded'; }
export function toggleSidebar() {
  if (prefs.readState().shell.focus) { prefs.setFocus(false); announce('Modo foco desativado. Barra lateral visível.'); syncShell(); return; }
  const root = document.documentElement;
  // Tablet com preferência automática: expandir sobrepõe o conteúdo por um
  // instante, sem mudar a preferência nem empurrar a área de trabalho.
  if (root.dataset.sidebarOverlay === 'on') { closeSidebarOverlay(); return; }
  if (prefs.readState().appearance.sidebar === 'auto' && sidebarEffective() === 'compact' && matchMedia('(min-width: 960px) and (max-width: 1279px)').matches) {
    root.dataset.sidebarOverlay = 'on';
    root.dataset.sidebarState = 'expanded';
    announce('Barra lateral aberta sobre o conteúdo. Esc fecha.');
    syncShell();
    document.querySelector('.sidebar a, .sidebar button')?.focus();
    return;
  }
  const current = sidebarEffective();
  const next = current === 'expanded' ? 'compact' : 'expanded';
  prefs.setAppearance('sidebar', next);
  announce(next === 'compact' ? 'Barra lateral compacta: só ícones.' : 'Barra lateral expandida.');
  syncShell();
}
export function closeSidebarOverlay() {
  const root = document.documentElement;
  if (root.dataset.sidebarOverlay !== 'on') return;
  delete root.dataset.sidebarOverlay;
  root.dataset.sidebarState = prefs.resolveSidebar(prefs.readState().appearance.sidebar);
  syncShell();
}
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && document.documentElement.dataset.sidebarOverlay === 'on') closeSidebarOverlay(); });
  document.addEventListener('pointerdown', (event) => {
    if (document.documentElement.dataset.sidebarOverlay === 'on' && !event.target.closest?.('.sidebar, [data-sidebar-toggle], .dw-popover')) closeSidebarOverlay();
  });
}
export function toggleFocus(force) {
  const on = typeof force === 'boolean' ? force : !prefs.readState().shell.focus;
  prefs.setFocus(on);
  announce(on ? 'Modo foco ativado. Barra lateral e elementos periféricos ocultos.' : 'Modo foco desativado.');
  syncShell();
  if (on) document.querySelector('#main')?.focus({ preventScroll: true });
}
export function syncShell() {
  const effective = sidebarEffective();
  const focus = prefs.readState().shell.focus;
  const visible = !focus && effective === 'expanded';
  for (const node of document.querySelectorAll('[data-sidebar-toggle]')) {
    node.setAttribute('aria-expanded', String(visible));
    const label = focus || effective === 'hidden' ? 'Mostrar barra lateral' : effective === 'expanded' ? 'Recolher barra lateral' : 'Expandir barra lateral';
    node.setAttribute('aria-label', label);
    node.title = `${label} (${mod()}B)`;
  }
  for (const node of document.querySelectorAll('[data-check="focus"]')) node.setAttribute('aria-checked', String(focus));
  for (const node of document.querySelectorAll('[data-check="compact"]')) node.setAttribute('aria-checked', String(effective === 'compact'));
}

let tip = null;
function sidebarTooltip() {
  if (tip) return;
  tip = el('div', { class: 'dw-tip', role: 'tooltip', id: 'dw-tip', hidden: true });
  document.body.append(tip);
  const show = (target) => {
    const compact = sidebarEffective() === 'compact' && !prefs.readState().shell.focus && matchMedia('(min-width: 960px)').matches;
    if (!compact || !target?.dataset.tip) { tip.hidden = true; return; }
    const rect = target.getBoundingClientRect();
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    tip.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    tip.style.left = `${Math.round(rect.right + 10)}px`;
  };
  document.addEventListener('mouseover', (event) => { const target = event.target.closest?.('.sidebar [data-tip]'); if (target) show(target); else tip.hidden = true; });
  document.addEventListener('focusin', (event) => { const target = event.target.closest?.('.sidebar [data-tip]'); if (target) show(target); else tip.hidden = true; });
  document.addEventListener('scroll', () => { tip.hidden = true; }, true);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') tip.hidden = true; });
}

// ------------------------------------------------------------ topbar
function demoIndicator(ctx, { openRestore }) {
  const wrap = el('div', { class: 'dw-anchor' });
  const trigger = el('button', { type: 'button', class: 'demo-indicator', id: 'demo-indicator', 'aria-label': 'Ambiente demonstrativo: dados fictícios. Ver detalhes' },
    [el('span', { class: 'demo-dot', 'aria-hidden': 'true' }), el('span', { class: 'demo-indicator-text', 'aria-hidden': 'true', text: 'DEMO' })]);
  const emails = el('span', { text: '' });
  const panel = el('div', { class: 'dw-panel demo-panel', 'aria-labelledby': 'demo-panel-title' }, [
    el('h2', { class: 'dw-panel-title', id: 'demo-panel-title' }, [el('span', { class: 'demo-dot', 'aria-hidden': 'true' }), el('span', { text: 'Ambiente demonstrativo' })]),
    el('ul', { class: 'demo-facts', role: 'list' }, [
      ['shield', 'Dados fictícios', 'Empresas, pessoas, CNPJ e taxas são inventados e marcados “— DEMO”.'],
      ['lock', 'Nenhuma operação financeira real', 'Nada aqui contrata crédito, movimenta dinheiro ou envia proposta a uma instituição.'],
      ['layers', 'Dados locais', 'Tudo fica só neste navegador. Nenhuma chamada ao servidor real, nenhuma métrica de uso.'],
      ['send', 'Nenhum e-mail externo', emails]
    ].map(([iconName, title, text]) => el('li', { class: 'demo-fact' }, [el('span', { class: 'demo-fact-icon' }, icon(iconName, { size: 14 })), el('span', {}, [el('strong', { text: title }), el('span', { class: 'demo-fact-text' }, text)])]))),
    el('div', { class: 'dw-panel-actions' }, [
      button('Restaurar demonstração…', { size: 'sm', iconName: 'refresh', attrs: { id: 'demo-restore' }, onClick: () => { closeOpenPopover(); openRestore(); } }),
      linkButton('Sobre a demonstração', '/demo/index.html#sobre', { variant: 'ghost', size: 'sm' })
    ])
  ]);
  popover({ trigger, panel, role: 'dialog', onOpen: () => { const count = ctx.transport.counts?.().emails ?? 0; emails.textContent = `Envios são só simulados: ${count} e-mail${count === 1 ? '' : 's'} registrado${count === 1 ? '' : 's'} nesta demonstração, nenhum enviado.`; } });
  wrap.append(trigger, panel);
  return wrap;
}

/** Menu da conta: identidade, troca de persona e o espaço de trabalho num só lugar. */
function accountMenu(ctx, hooks) {
  const wrap = el('div', { class: 'dw-anchor' });
  const meta = PERSONA_META[ctx.persona?.key] || PERSONA_META.buyer;
  const trigger = el('button', { type: 'button', class: 'persona-trigger', id: 'persona-trigger', 'aria-label': `Visualizando como ${meta.name} (${meta.group}). Conta, persona e preferências` }, [
    avatar(meta.name, { size: 'sm' }),
    el('span', { class: 'persona-trigger-name', 'aria-hidden': 'true', text: meta.name.split(' ')[0] }),
    icon('chevronDown', { size: 14, className: 'persona-trigger-chevron' })
  ]);
  const entry = (label, iconName, onClick, { check = null, href = null, danger = false, id = null, hint = null } = {}) => {
    const node = href
      ? el('a', { role: 'menuitem', class: 'dw-menu-item', href, id }, [icon(iconName, { size: 16 }), el('span', { class: 'dw-menu-label', text: label })])
      : el('button', { type: 'button', role: check ? 'menuitemcheckbox' : 'menuitem', class: `dw-menu-item${danger ? ' is-danger' : ''}`, id, dataset: check ? { check } : {} }, [
        icon(iconName, { size: 16 }), el('span', { class: 'dw-menu-label', text: label }), hint ? el('kbd', { class: 'kbd', 'aria-hidden': 'true', text: hint }) : null,
        check ? el('span', { class: 'dw-switch', 'aria-hidden': 'true' }) : null]);
    if (onClick) node.addEventListener('click', () => { if (!check) menu.hide({ restore: false }); onClick(); });
    return node;
  };
  const personas = PERSONA_ORDER.map((key) => {
    const persona = PERSONA_META[key];
    const selected = key === ctx.persona?.key;
    const item = el('button', { type: 'button', role: 'menuitemradio', class: 'persona-item', 'aria-checked': String(selected), dataset: { persona: key }, 'aria-label': `${persona.group}: ${persona.name}, ${persona.title}` }, [
      avatar(persona.name, { size: 'sm' }),
      el('span', { class: 'persona-item-text' }, [el('span', { class: 'persona-item-name', text: persona.name }), el('span', { class: 'persona-item-title', text: `${persona.group} · ${persona.title}` })]),
      selected ? icon('check', { size: 16, className: 'persona-item-check' }) : null
    ]);
    item.addEventListener('click', () => { menu.hide({ restore: false }); if (selected) trigger.focus(); else hooks.switchPersona(key); });
    return item;
  });
  const company = ctx.audience === 'company';
  const panel = el('div', { class: 'dw-menu account-menu-dw', 'aria-label': 'Conta, persona e preferências' }, [
    el('div', { class: 'dw-menu-identity', 'aria-hidden': 'true' }, [el('span', { class: 'dw-menu-identity-name', text: meta.name }), el('span', { class: 'dw-menu-identity-org', text: `${meta.title} · ${meta.org}` })]),
    el('p', { class: 'dw-menu-group', 'aria-hidden': 'true', text: 'Visualizar como' }),
    ...personas,
    el('hr', { class: 'dw-menu-sep' }),
    entry('Aparência e preferências…', 'sliders', hooks.openPreferences, { id: 'open-preferences' }),
    company ? entry('Personalizar painel', 'layout', hooks.customizeDashboard) : null,
    entry('Modo foco', 'maximize', () => toggleFocus(), { check: 'focus' }),
    entry('Barra lateral compacta', 'sidebar', () => toggleSidebar(), { check: 'compact' }),
    el('hr', { class: 'dw-menu-sep' }),
    entry('Limites do produto', 'shield', null, { href: ctx.href('/finance/boundaries.html') }),
    entry('Restaurar demonstração…', 'refresh', hooks.openRestore),
    entry('Sair da demonstração', 'logout', null, { href: '/demo/index.html' })
  ].filter(Boolean));
  const menu = popover({ trigger, panel, role: 'menu', onOpen: syncShell });
  wrap.append(trigger, panel);
  return wrap;
}

export function renderTopbar(ctx, hooks) {
  document.querySelector('.demo-banner')?.remove();
  const bar = document.querySelector('.topbar');
  const actions = bar?.querySelector('.topbar-actions');
  if (!bar || !actions) return null;
  const bell = actions.querySelector('#notification-trigger');
  const bellPanel = actions.querySelector('#notification-center');
  const signedIn = Boolean(ctx.organization && ctx.persona);
  const search = signedIn ? el('button', { type: 'button', id: 'command-trigger', class: 'search-trigger', 'aria-keyshortcuts': 'Control+K Meta+K', 'aria-label': `Buscar ou executar (${mod()}K)` }, [
    icon('search', { size: 15 }), el('span', { class: 'search-trigger-text', text: 'Buscar ou executar…' }), el('kbd', { class: 'kbd', 'aria-hidden': 'true', text: isMac() ? '⌘K' : 'Ctrl K' })]) : null;
  const focusExit = el('button', { type: 'button', class: 'focus-exit', id: 'focus-exit' }, [icon('minimize', { size: 14 }), el('span', { text: 'Sair do modo foco' })]);
  focusExit.addEventListener('click', () => toggleFocus(false));
  const toggle = el('button', { type: 'button', class: 'icon-btn topbar-sidebar-toggle', 'aria-controls': 'app-sidebar', dataset: { sidebarToggle: '' } }, icon('sidebar', { size: 17 }));
  toggle.addEventListener('click', () => {
    if (sidebarEffective() === 'hidden' && !prefs.readState().shell.focus) { prefs.setAppearance('sidebar', 'expanded'); syncShell(); return; }
    toggleSidebar();
  });
  const brand = bar.querySelector('.topbar-brand');
  if (brand) brand.href = homeHref(ctx);
  const crumbs = bar.querySelector('.topbar-crumbs');
  bar.replaceChildren(...[toggle, brand, crumbs, el('div', { class: 'topbar-center' }, search || ''),
    el('div', { class: 'topbar-actions' }, [focusExit, demoIndicator(ctx, hooks), bell, bellPanel, signedIn ? accountMenu(ctx, hooks) : null].filter(Boolean))].filter(Boolean));
  syncShell();
  return { search };
}

// -------------------------------------------------------------- restaurar
export async function openRestore(ctx) {
  const choice = el('fieldset', { class: 'restore-options' }, [el('legend', { class: 'sr-only', text: 'O que restaurar' })]);
  for (const [value, title, text, checked] of [
    ['data', 'Dados demonstrativos', 'Solicitações, propostas, aprovações, contratos e tarefas voltam ao conjunto inicial. Aparência, painel e favoritos ficam.', true],
    ['appearance', 'Aparência e layout', 'Tema, densidade, preset, barra lateral, comportamento, colunas e painéis voltam ao padrão. Os dados ficam.', false],
    ['all', 'Tudo', 'Dados e todas as preferências, inclusive favoritos, visões salvas e recentes.', false]
  ]) {
    choice.append(el('label', { class: 'radio-card restore-option' }, [el('input', { type: 'radio', name: 'restore-scope', value, checked }), el('span', { class: 'radio-card-text' }, [el('strong', { text: title }), el('span', { class: 'muted small', text })])]));
  }
  const ok = await confirmDialog({ title: 'Restaurar a demonstração', description: 'Escolha o que volta ao início. Nada real é afetado: tudo vive só neste navegador.', body: choice, confirmLabel: 'Restaurar', tone: 'danger' });
  if (!ok) return;
  const scope = choice.querySelector('input:checked')?.value || 'data';
  if (scope === 'appearance') {
    prefs.resetAppearanceAndLayout();
    syncShell();
    toast('Aparência e layout restaurados ao padrão.');
    ctx.rerender?.();
    return;
  }
  ctx.transport.reset();
  try { sessionStorage.removeItem('arandu-demo-tray'); } catch { /* sem memória de sessão */ }
  if (scope === 'all') prefs.resetWorkspace();
  toast(scope === 'all' ? 'Demonstração restaurada: dados e preferências voltaram ao início.' : 'Dados demonstrativos restaurados ao conjunto inicial.');
  setTimeout(() => location.assign(ctx.href(ctx.persona?.audience === 'provider' ? '/provider/index.html' : '/finance/dashboard.html')), 350);
}

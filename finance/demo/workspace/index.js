// Camada de experiência da demonstração — laboratório da próxima interface.
//
// Carregada por finance/app.js SOMENTE em páginas /demo/* de um build que
// habilita a demonstração (mesma trava do motor fictício). Não chama servidor,
// não cria credencial e não muda regra: reorganiza a apresentação por cima das
// telas do produto e guarda preferências só neste navegador.
//
// Peças:
//   * shell      — barra lateral expandida/compacta/oculta, topbar com
//                  "● DEMO", seletor de persona e menu do espaço de trabalho;
//   * preferências — tema, densidade, cor de destaque, barra lateral, movimento;
//   * quick view — consultar solicitação, proposta, provedor e contrato sem sair;
//   * comando    — Ctrl/⌘+K com ações, navegação, personas e busca;
//   * contexto   — rolagem e filtros preservados ao voltar para listas;
//   * favoritos e visualizações salvas.

import { el, icon, registerIcons } from '../../src/core.js';
import { avatar, button, linkButton, toast, confirmDialog, drawer, saveIndicator } from '../../src/ui.js';
import { WORKSPACE_ICONS } from './icons.js';
import * as prefs from './preferences.js';
import { PERSONA_META, PERSONA_ORDER } from './personas.js';
import { popover, closeOpenPopover } from './popover.js';
import { installPalette } from './command.js';
import { openQuickView } from './quick-view.js';
import { installViewsBar } from './saved-views.js';

registerIcons(WORKSPACE_ICONS);

export const dashboard = async (ctx) => (await import('./dashboard.js')).dashboard(ctx);

const state = { ctx: null, palette: null, globalsInstalled: false, tip: null };
const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const mod = () => (isMac() ? '⌘' : 'Ctrl+');
const home = (ctx) => ctx.href(ctx.persona?.audience === 'provider' ? '/provider/index.html' : '/finance/dashboard.html');

function announce(text) {
  let region = document.getElementById('dw-announcer');
  if (!region) { region = el('p', { id: 'dw-announcer', class: 'sr-only', role: 'status', 'aria-live': 'polite' }); document.body.append(region); }
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = text; });
}

// --------------------------------------------------------- barra lateral
function sidebarEffective() {
  return document.documentElement.dataset.sidebarState || 'expanded';
}
export function toggleSidebar() {
  const current = prefs.readState();
  if (current.shell.focus) { prefs.setFocus(false); announce('Modo foco desativado. Barra lateral visível.'); syncShell(); return; }
  const next = sidebarEffective() === 'expanded' ? 'compact' : 'expanded';
  prefs.setAppearance('sidebar', next);
  announce(next === 'compact' ? 'Barra lateral compacta: só ícones.' : 'Barra lateral expandida.');
  syncShell();
}
export function toggleFocus(force) {
  const on = typeof force === 'boolean' ? force : !prefs.readState().shell.focus;
  prefs.setFocus(on);
  announce(on ? 'Modo foco ativado. Barra lateral e elementos periféricos ocultos.' : 'Modo foco desativado.');
  syncShell();
  if (on) document.querySelector('#main')?.focus({ preventScroll: true });
}
/** Atualiza rótulos e estados que dependem da preferência atual. */
function syncShell() {
  const effective = sidebarEffective();
  const focus = prefs.readState().shell.focus;
  for (const node of document.querySelectorAll('[data-sidebar-toggle]')) {
    node.setAttribute('aria-expanded', String(!focus && effective === 'expanded'));
    const label = focus ? 'Mostrar barra lateral' : effective === 'expanded' ? 'Recolher barra lateral' : 'Expandir barra lateral';
    node.setAttribute('aria-label', label);
    node.title = `${label} (${mod()}B)`;
  }
  for (const node of document.querySelectorAll('[data-check="focus"]')) node.setAttribute('aria-checked', String(focus));
  for (const node of document.querySelectorAll('[data-check="compact"]')) node.setAttribute('aria-checked', String(effective === 'compact'));
}

function sidebarTooltip() {
  if (state.tip) return state.tip;
  const tip = el('div', { class: 'dw-tip', role: 'tooltip', hidden: true });
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
  state.tip = tip;
  return tip;
}

const TYPE_ICON = { rfq: 'file', contract: 'briefcase', provider: 'building' };
function favoriteTarget(ctx, entry) {
  if (entry.type === 'rfq') { const rfq = (ctx.data.rfqs || []).find((row) => row.id === entry.id); return rfq ? { title: rfq.title, href: ctx.href(`/finance/rfq.html?id=${rfq.id}`) } : null; }
  if (entry.type === 'contract') { const contract = (ctx.data.contracts || []).find((row) => row.id === entry.id); return contract ? { title: contract.provider_name || 'Contrato', href: ctx.href(`/finance/contracts.html#contract-${contract.id}`) } : null; }
  const provider = (ctx.data.providers || []).find((row) => row.id === entry.id);
  return provider ? { title: provider.name, href: ctx.href(`/finance/providers.html#provider-${provider.id}`) } : null;
}

function sidebarExtras(ctx) {
  const box = el('div', { class: 'side-extra' });
  if (ctx.audience !== 'company') return box;
  const current = prefs.readState();
  const favorites = current.favorites.map((entry) => ({ entry, target: favoriteTarget(ctx, entry) })).filter(({ target }) => target).slice(0, 6);
  box.append(el('section', { class: 'side-section', 'aria-labelledby': 'side-favorites' }, [
    el('h2', { class: 'side-section-title', id: 'side-favorites' }, [icon('star', { size: 12 }), el('span', { text: 'Favoritos' })]),
    favorites.length ? el('ul', { role: 'list' }, favorites.map(({ entry, target }) => el('li', {}, el('a', { class: 'side-link side-sub', href: target.href, dataset: { quick: `${entry.type}:${entry.id}`, tip: target.title } }, [
      icon(TYPE_ICON[entry.type], { size: 16 }), el('span', { class: 'side-label', text: target.title })]))))
      : el('p', { class: 'side-empty', text: 'Use ☆ em solicitações, contratos e provedores.' })
  ]));
  const pinned = current.savedViews.filter((view) => view.pinned);
  if (pinned.length) {
    const here = ctx.view === 'rfqs' ? prefs.cleanQuery(location.search) : null;
    box.append(el('section', { class: 'side-section', 'aria-labelledby': 'side-views' }, [
      el('h2', { class: 'side-section-title', id: 'side-views' }, [icon('bookmark', { size: 12 }), el('span', { text: 'Visualizações' })]),
      el('ul', { role: 'list' }, pinned.map((view) => el('li', {}, el('a', { class: 'side-link side-sub', href: ctx.href(`/finance/rfqs.html${view.query ? `?${view.query}` : ''}`), 'aria-current': here !== null && here === view.query ? 'page' : null, dataset: { tip: view.name } }, [
        icon('bookmark', { size: 16 }), el('span', { class: 'side-label', text: view.name })]))))
    ]));
  }
  return box;
}

export function decorateSidebar(ctx) {
  const aside = document.querySelector('.sidebar');
  if (!aside) return;
  aside.id = 'app-sidebar';
  aside.setAttribute('aria-label', 'Barra lateral');
  for (const link of aside.querySelectorAll('.side-link')) link.dataset.tip ||= link.querySelector('.side-label')?.textContent || '';
  for (const link of aside.querySelectorAll('.side-minor')) link.dataset.tip = link.textContent.trim();
  const brand = aside.querySelector('.brand');
  if (brand && !aside.querySelector('.side-head')) {
    const collapse = el('button', { type: 'button', class: 'icon-btn side-collapse', 'aria-controls': 'app-sidebar', dataset: { sidebarToggle: '' } }, icon('sidebar', { size: 18 }));
    collapse.addEventListener('click', toggleSidebar);
    const head = el('div', { class: 'side-head' });
    brand.replaceWith(head);
    head.append(brand, collapse);
  }
  aside.querySelector('.side-extra')?.remove();
  aside.querySelector('.side-nav')?.after(sidebarExtras(ctx));
  sidebarTooltip();
  syncShell();
}

// --------------------------------------------------------------- topbar
function demoIndicator(ctx) {
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
      button('Restaurar demonstração…', { size: 'sm', iconName: 'refresh', attrs: { id: 'demo-restore' }, onClick: () => { closeOpenPopover(); openRestore(ctx); } }),
      linkButton('Sobre a demonstração', '/demo/index.html#sobre', { variant: 'ghost', size: 'sm' })
    ])
  ]);
  popover({ trigger, panel, role: 'dialog', onOpen: () => { const count = ctx.transport.counts?.().emails ?? 0; emails.textContent = `Envios são só simulados: ${count} e-mail${count === 1 ? '' : 's'} registrado${count === 1 ? '' : 's'} nesta demonstração, nenhum enviado.`; } });
  wrap.append(trigger, panel);
  return wrap;
}

function personaSwitcher(ctx) {
  const wrap = el('div', { class: 'dw-anchor' });
  const meta = PERSONA_META[ctx.persona?.key] || PERSONA_META.buyer;
  const trigger = el('button', { type: 'button', class: 'persona-trigger', id: 'persona-trigger', 'aria-label': `Visualizando como ${meta.name} (${meta.group}). Trocar persona` }, [
    avatar(meta.name, { size: 'sm' }),
    el('span', { class: 'persona-trigger-text', 'aria-hidden': 'true' }, [el('span', { class: 'persona-trigger-kicker', text: 'Visualizando como' }), el('span', { class: 'persona-trigger-name', text: meta.name })]),
    icon('chevronDown', { size: 14, className: 'persona-trigger-chevron' })
  ]);
  const panel = el('div', { class: 'dw-menu persona-menu', 'aria-label': 'Trocar persona' }, [el('p', { class: 'dw-menu-group', 'aria-hidden': 'true', text: 'Visualizar a demonstração como' })]);
  for (const key of PERSONA_ORDER) {
    const persona = PERSONA_META[key];
    const selected = key === ctx.persona?.key;
    const item = el('button', { type: 'button', role: 'menuitemradio', class: 'persona-item', 'aria-checked': String(selected), dataset: { persona: key }, 'aria-label': `${persona.group}: ${persona.name}, ${persona.title}` }, [
      avatar(persona.name, { size: 'sm' }),
      el('span', { class: 'persona-item-text' }, [
        el('span', { class: 'persona-item-group', text: persona.group }),
        el('span', { class: 'persona-item-name', text: persona.name }),
        el('span', { class: 'persona-item-title', text: `${persona.title} · ${persona.org}` })
      ]),
      selected ? icon('check', { size: 16, className: 'persona-item-check' }) : null
    ]);
    item.addEventListener('click', () => {
      menu.hide({ restore: false });
      if (selected) { trigger.focus(); return; }
      switchPersona(ctx, key);
    });
    panel.append(item);
  }
  panel.append(el('p', { class: 'dw-menu-foot', text: 'A persona muda o que você vê, não uma credencial: tudo continua fictício.' }));
  const menu = popover({ trigger, panel, role: 'menu' });
  wrap.append(trigger, panel);
  return wrap;
}

function switchPersona(ctx, key) {
  closeOpenPopover();
  state.palette?.close();
  document.querySelector('#view')?.classList.add('is-switching');
  ctx.switchPersona(key);
}

function workspaceMenu(ctx) {
  const wrap = el('div', { class: 'dw-anchor' });
  const trigger = el('button', { type: 'button', class: 'icon-btn workspace-menu-trigger', id: 'workspace-menu-trigger', 'aria-label': 'Espaço de trabalho: aparência e preferências', title: 'Aparência e preferências' }, icon('sliders', { size: 18 }));
  const entry = (label, iconName, onClick, { check = null, href = null, danger = false, id = null } = {}) => {
    const node = href
      ? el('a', { role: 'menuitem', class: 'dw-menu-item', href, id }, [icon(iconName, { size: 16 }), el('span', { class: 'dw-menu-label', text: label })])
      : el('button', { type: 'button', role: check ? 'menuitemcheckbox' : 'menuitem', class: `dw-menu-item${danger ? ' is-danger' : ''}`, id, dataset: check ? { check } : {} }, [icon(iconName, { size: 16 }), el('span', { class: 'dw-menu-label', text: label }),
        check ? el('span', { class: 'dw-switch', 'aria-hidden': 'true' }) : null]);
    if (onClick) node.addEventListener('click', () => { if (!check) menu.hide({ restore: false }); onClick(); });
    return node;
  };
  const company = ctx.audience === 'company';
  const panel = el('div', { class: 'dw-menu workspace-menu', 'aria-label': 'Espaço de trabalho' }, [
    el('div', { class: 'dw-menu-identity', 'aria-hidden': 'true' }, [el('span', { class: 'dw-menu-identity-name', text: ctx.viewer?.name || PERSONA_META[ctx.persona?.key]?.name || 'Demonstração' }),
      el('span', { class: 'dw-menu-identity-org', text: [ctx.viewer?.title, ctx.organization?.legal_name].filter(Boolean).join(' · ') })]),
    entry('Aparência e preferências…', 'sliders', () => openPreferences(ctx), { id: 'open-preferences' }),
    company ? entry('Personalizar painel', 'layout', () => customizeDashboard(ctx)) : null,
    entry('Modo foco', 'maximize', () => toggleFocus(), { check: 'focus' }),
    entry('Barra lateral compacta', 'sidebar', () => toggleSidebar(), { check: 'compact' }),
    el('hr', { class: 'dw-menu-sep' }),
    entry('Buscar e comandos', 'command', () => state.palette?.open(), {}),
    company ? entry('Configurações', 'settings', null, { href: ctx.href('/finance/settings.html') }) : null,
    entry('Limites do produto', 'shield', null, { href: ctx.href('/finance/boundaries.html') }),
    el('hr', { class: 'dw-menu-sep' }),
    entry('Restaurar demonstração…', 'refresh', () => openRestore(ctx)),
    entry('Sair da demonstração', 'logout', null, { href: '/demo/index.html' })
  ].filter(Boolean));
  const menu = popover({ trigger, panel, role: 'menu', onOpen: syncShell });
  wrap.append(trigger, panel);
  return wrap;
}

export function installShell(ctx) {
  state.ctx = ctx;
  document.querySelector('.demo-banner')?.remove();
  const bar = document.querySelector('.topbar');
  const actions = bar?.querySelector('.topbar-actions');
  if (!bar || !actions) return;
  actions.querySelector('.demo-chip')?.remove();
  actions.querySelector('.account')?.remove();
  const bell = actions.querySelector('#notification-trigger');
  const bellPanel = actions.querySelector('#notification-center');
  let search = actions.querySelector('#command-trigger');
  if (!search && ctx.organization) {
    search = el('button', { type: 'button', id: 'command-trigger', class: 'search-trigger', 'aria-keyshortcuts': 'Control+K Meta+K', 'aria-label': `Buscar e comandos (${mod()}K)` }, [
      icon('search'), el('span', { class: 'search-trigger-text', text: 'Buscar' }), el('kbd', { class: 'kbd', 'aria-hidden': 'true', text: isMac() ? '⌘K' : 'Ctrl K' })]);
  }
  if (search) search.setAttribute('aria-label', `Buscar e comandos (${mod()}K)`);
  const focusExit = el('button', { type: 'button', class: 'focus-exit', id: 'focus-exit' }, [icon('minimize', { size: 14 }), el('span', { text: 'Sair do modo foco' })]);
  focusExit.addEventListener('click', () => toggleFocus(false));
  const signedIn = Boolean(ctx.organization && ctx.persona);
  actions.replaceChildren(...[focusExit, search, demoIndicator(ctx), signedIn ? personaSwitcher(ctx) : null, bell, bellPanel, workspaceMenu(ctx)].filter(Boolean));
  if (!bar.querySelector('.topbar-sidebar-toggle')) {
    const toggle = el('button', { type: 'button', class: 'icon-btn topbar-sidebar-toggle', 'aria-controls': 'app-sidebar', dataset: { sidebarToggle: '' } }, icon('sidebar', { size: 18 }));
    toggle.addEventListener('click', toggleSidebar);
    bar.querySelector('.topbar-crumbs')?.before(toggle);
  }
  if (signedIn && search) {
    state.palette = installPalette(ctx, {
      quickView: (type, id) => openQuickView(ctx, type, id),
      setAppearance: (key, value) => { prefs.setAppearance(key, value); announce('Preferência aplicada.'); syncShell(); },
      toggleFocus: () => toggleFocus(), toggleSidebar, openPreferences: () => openPreferences(ctx), openRestore: () => openRestore(ctx),
      customizeDashboard: () => customizeDashboard(ctx), switchPersona: (key) => switchPersona(ctx, key)
    });
    search.addEventListener('click', () => state.palette.open());
  }
  installGlobals();
  syncShell();
}

// ------------------------------------------------------------ preferências
let panelSeq = 0;
function preferencesPanel(ctx) {
  const prefix = `pref${++panelSeq}`;
  const saved = saveIndicator('idle', 'Alterações aplicadas na hora e salvas neste navegador.');
  const groups = [];
  const group = (key, legend, options, { hint = null, swatches = false } = {}) => {
    const current = prefs.readState().appearance[key];
    const fieldset = el('fieldset', { class: 'pref-group', dataset: { pref: key } }, [el('legend', { class: 'pref-legend', text: legend })]);
    const row = el('div', { class: `pref-options${swatches ? ' pref-swatches' : ''}` });
    for (const [value, label, iconName] of options) {
      const input = el('input', { type: 'radio', name: `${prefix}-${key}`, value, checked: value === current, class: 'pref-input' });
      input.addEventListener('change', () => {
        if (!input.checked) return;
        prefs.setAppearance(key, value);
        syncShell();
        saved.set('saved', `${legend}: ${label}. Salvo neste navegador.`);
      });
      row.append(el('label', { class: 'pref-option' }, [input, el('span', { class: 'pref-option-face' }, [
        swatches ? el('span', { class: 'pref-swatch', dataset: { swatch: value }, 'aria-hidden': 'true' }) : iconName ? icon(iconName, { size: 16 }) : null,
        el('span', { text: label })])]));
    }
    fieldset.append(row);
    if (hint) fieldset.append(el('p', { class: 'pref-hint', text: hint }));
    groups.push(fieldset);
  };
  group('theme', 'Tema', [['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon'], ['system', 'Sistema', 'monitor']]);
  group('accent', 'Cor de destaque', [['indigo', 'Índigo'], ['blue', 'Azul'], ['emerald', 'Esmeralda'], ['graphite', 'Grafite'], ['violet', 'Violeta']], { swatches: true, hint: 'Paleta controlada: todas as opções mantêm o contraste dos botões e links.' });
  group('density', 'Densidade', [['compact', 'Compacta', 'menu'], ['comfortable', 'Confortável', 'layers'], ['spacious', 'Espaçosa', 'maximize']], { hint: 'Compacta mostra mais linhas nas tabelas; espaçosa dá mais respiro à leitura.' });
  group('sidebar', 'Barra lateral', [['expanded', 'Expandida', 'sidebar'], ['compact', 'Compacta', 'grip'], ['auto', 'Automática', 'monitor']], { hint: 'Automática: expandida em telas largas, compacta em notebooks. No celular, a navegação fica na barra inferior.' });
  group('motion', 'Movimento', [['normal', 'Normal', 'sparkles'], ['reduced', 'Reduzido', 'minimize']], { hint: prefs.systemPrefersReducedMotion() ? 'Seu sistema pede movimento reduzido: ele é respeitado mesmo com “Normal”.' : 'Reduzido remove transições e animações.' });
  const unsubscribe = prefs.subscribe((next) => {
    for (const fieldset of groups) for (const input of fieldset.querySelectorAll('input')) input.checked = input.value === next.appearance[fieldset.dataset.pref];
  });
  const reset = button('Restaurar aparência padrão', { variant: 'ghost', size: 'sm', iconName: 'refresh', onClick: () => {
    prefs.update((draft) => { draft.appearance = { ...prefs.DEFAULT_APPEARANCE }; });
    prefs.applyAppearance();
    syncShell();
    saved.set('saved', 'Aparência padrão restaurada.');
  } });
  const node = el('div', { class: 'pref-panel' }, [...groups, el('div', { class: 'pref-foot' }, [saved.node, reset,
    ctx.audience === 'company' ? linkButton('Personalizar painel', ctx.href('/finance/dashboard.html#personalizar'), { variant: 'ghost', size: 'sm', iconName: 'layout' }) : null])]);
  node.cleanup = unsubscribe;
  return node;
}
export function openPreferences(ctx) {
  closeOpenPopover();
  const body = preferencesPanel(ctx);
  drawer({ title: 'Aparência e preferências', subtitle: 'Preferências desta demonstração, guardadas só neste navegador.', body, className: 'prefs-drawer', onClose: () => body.cleanup?.() });
}

// --------------------------------------------------------------- restaurar
export async function openRestore(ctx) {
  const choice = el('fieldset', { class: 'restore-options' }, [el('legend', { class: 'sr-only', text: 'O que restaurar' })]);
  for (const [value, title, text, checked] of [
    ['data', 'Dados demonstrativos', 'Solicitações, propostas, aprovações, contratos e tarefas voltam ao conjunto inicial. Aparência, painel e favoritos ficam.', true],
    ['appearance', 'Aparência e layout', 'Tema, densidade, cor, barra lateral, modo foco e painéis voltam ao padrão. Os dados ficam.', false],
    ['all', 'Tudo', 'Dados e todas as preferências, inclusive favoritos, visualizações salvas e recentes.', false]
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
    if (ctx.view === 'dashboard' || ctx.view === 'home') ctx.rerender?.();
    return;
  }
  ctx.transport.reset();
  if (scope === 'all') prefs.resetWorkspace();
  toast(scope === 'all' ? 'Demonstração restaurada: dados e preferências voltaram ao início.' : 'Dados demonstrativos restaurados ao conjunto inicial.');
  setTimeout(() => location.assign(home(ctx)), 350);
}

export function customizeDashboard(ctx) {
  if (ctx.view === 'dashboard' || ctx.view === 'home') { document.querySelector('#customize-dashboard')?.click(); return; }
  location.assign(ctx.href('/finance/dashboard.html#personalizar'));
}

// --------------------------------------------------------------- contexto
const CONTEXT_KEY = 'arandu-demo-context';
const LIST_VIEWS = new Set(['rfqs', 'proposals', 'contracts', 'providers', 'tasks', 'approvals', 'notifications']);
function readContext() {
  try { const value = JSON.parse(sessionStorage.getItem(CONTEXT_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}
function writeContext(value) { try { sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(value)); } catch { /* sem memória de sessão */ } }
function rememberPlace() {
  const ctx = state.ctx;
  if (!ctx || !LIST_VIEWS.has(ctx.view)) return;
  const context = readContext();
  const key = location.pathname + location.search;
  context.scroll = { ...(context.scroll || {}), [key]: Math.round(scrollY) };
  context.lists = { ...(context.lists || {}), [ctx.view]: key };
  writeContext(context);
}
function restorePlace(ctx) {
  if (!LIST_VIEWS.has(ctx.view)) return;
  const context = readContext();
  const key = location.pathname + location.search;
  const navigation = performance.getEntriesByType?.('navigation')?.[0]?.type;
  const requested = context.restore === key;
  if (requested) { delete context.restore; writeContext(context); }
  if (!(requested || navigation === 'back_forward')) return;
  const top = context.scroll?.[key];
  if (Number.isFinite(top) && top > 0) requestAnimationFrame(() => requestAnimationFrame(() => scrollTo({ top, behavior: 'instant' })));
}

// ------------------------------------------------------- telas existentes
function starButton(type, id, title, { compact = true } = {}) {
  const on = prefs.isFavorite(type, id);
  const node = el('button', { type: 'button', class: `${compact ? 'row-star' : 'btn btn-ghost btn-icon-only page-star'}${on ? ' is-on' : ''}`, 'aria-pressed': String(on), 'aria-label': `Favoritar ${title}`, title: on ? 'Remover dos favoritos' : 'Favoritar' }, icon('star', { size: compact ? 15 : 16 }));
  node.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const next = prefs.toggleFavorite(type, id, title);
    node.setAttribute('aria-pressed', String(next));
    node.classList.toggle('is-on', next);
    node.title = next ? 'Remover dos favoritos' : 'Favoritar';
    announce(next ? `${title} adicionado aos favoritos.` : `${title} removido dos favoritos.`);
  });
  return node;
}
function copyLink(href) {
  const url = new URL(href, location.origin).toString();
  navigator.clipboard?.writeText(url).then(() => toast('Link copiado.', 'info'), () => toast(`Copie o link: ${url}`, 'info'));
}
function focusButton() {
  const on = prefs.readState().shell.focus;
  const node = button(on ? 'Sair do foco' : 'Modo foco', { variant: 'ghost', iconName: on ? 'minimize' : 'maximize', attrs: { 'aria-pressed': String(on), class: 'btn btn-ghost focus-toggle', title: 'Esconde a barra lateral e o que é periférico' } });
  node.addEventListener('click', () => {
    toggleFocus();
    const next = prefs.readState().shell.focus;
    node.setAttribute('aria-pressed', String(next));
    node.querySelector('.btn-label').textContent = next ? 'Sair do foco' : 'Modo foco';
    node.replaceChild(icon(next ? 'minimize' : 'maximize'), node.querySelector('svg'));
  });
  return node;
}

function enhanceRfqList(ctx) {
  for (const row of document.querySelectorAll('#view tr[data-entity="rfq"]')) {
    const link = row.querySelector('a.row-title');
    if (!link) continue;
    link.dataset.quick = `rfq:${row.dataset.id}`;
    link.setAttribute('aria-describedby', 'quick-hint');
    link.after(starButton('rfq', row.dataset.id, link.textContent));
  }
  if (!document.getElementById('quick-hint')) document.body.append(el('p', { id: 'quick-hint', class: 'sr-only', text: 'Abre um resumo lateral. Use Ctrl ou ⌘ com clique para abrir a página completa.' }));
  installViewsBar(ctx, { apply: (query) => {
    history.pushState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
    ctx.rerender();
  } });
}
function enhanceProposals() {
  for (const row of document.querySelectorAll('#view tr[data-entity="proposal"]')) {
    const link = row.querySelector('a.row-title');
    if (link) { link.dataset.quick = `proposal:${row.dataset.id}`; link.setAttribute('aria-describedby', 'quick-hint'); }
  }
  if (!document.getElementById('quick-hint')) document.body.append(el('p', { id: 'quick-hint', class: 'sr-only', text: 'Abre um resumo lateral. Use Ctrl ou ⌘ com clique para abrir a página completa.' }));
}
function enhanceProviders(ctx) {
  for (const row of document.querySelectorAll('#view tr[data-entity="provider"]')) {
    const provider = (ctx.data.providers || []).find((item) => item.id === row.dataset.id);
    const cell = row.querySelector('td.cell-primary');
    if (!provider || !cell || cell.querySelector('.row-peek')) continue;
    row.classList.add('row-link');
    cell.append(el('button', { type: 'button', class: 'row-peek stretched', 'aria-label': `Ver resumo de ${provider.name}`, onclick: () => openQuickView(ctx, 'provider', provider.id) }), starButton('provider', provider.id, provider.name));
  }
}
function enhanceContracts(ctx) {
  for (const card of document.querySelectorAll('#view article[data-entity="contract"]')) {
    const contract = (ctx.data.contracts || []).find((item) => item.id === card.dataset.id);
    const status = card.querySelector('.contract-status');
    if (!contract || !status || status.querySelector('.row-star')) continue;
    const href = ctx.href(`/finance/contracts.html#contract-${contract.id}`);
    const source = (ctx.data.rfqs || []).find((rfq) => rfq.id === contract.rfq_id);
    const more = contextMenu(`Mais ações: ${contract.provider_name}`, [
      { label: 'Ver resumo', icon: 'eye', onClick: () => openQuickView(ctx, 'contract', contract.id) },
      { label: 'Copiar link', icon: 'copy', onClick: () => copyLink(href) },
      source ? { label: 'Abrir processo de origem', icon: 'file', href: ctx.href(`/finance/rfq.html?id=${source.id}#decisao`) } : null,
      { label: 'Abrir em nova aba', icon: 'external', href, newTab: true }
    ]);
    status.append(starButton('contract', contract.id, contract.provider_name || 'Contrato'), more);
  }
}
function enhanceRfqDetail(ctx) {
  const id = new URLSearchParams(location.search).get('id');
  const rfq = (ctx.data.rfqs || []).find((item) => item.id === id);
  if (!rfq) return;
  prefs.recordRecent('rfq', rfq.id, rfq.title);
  const actions = document.querySelector('.page-actions');
  if (actions && !actions.querySelector('.page-star')) actions.prepend(starButton('rfq', rfq.id, rfq.title, { compact: false }), focusButton());
  // Menu "Mais": ações de interface ao lado das de processo; as destrutivas seguem separadas no fim.
  const list = actions?.querySelector('.menu-list');
  if (list && !list.querySelector('[data-dw]')) {
    const firstDanger = list.querySelector('.menu-item.danger');
    const close = () => { list.hidden = true; list.previousElementSibling?.setAttribute('aria-expanded', 'false'); };
    const href = ctx.href(`/finance/rfq.html?id=${rfq.id}`);
    const items = [
      el('button', { type: 'button', role: 'menuitem', class: 'menu-item', dataset: { dw: '' }, onclick: () => { close(); copyLink(href); } }, [icon('copy'), el('span', { text: 'Copiar link' })]),
      el('a', { role: 'menuitem', class: 'menu-item', href, target: '_blank', rel: 'noopener', dataset: { dw: '' } }, [icon('external'), el('span', { text: 'Abrir em nova aba' })])
    ];
    for (const item of items) list.insertBefore(item, firstDanger);
    if (firstDanger) list.insertBefore(el('hr', { class: 'dw-menu-sep', dataset: { dw: '' } }), firstDanger);
  }
  const back = document.querySelector('#breadcrumbs a[href*="/finance/rfqs.html"]');
  const last = readContext().lists?.rfqs;
  if (back && last) {
    back.href = last;
    back.addEventListener('click', () => { const context = readContext(); context.restore = last; writeContext(context); });
  }
}

/** Menu ••• acessível para ações contextuais de uma linha ou cartão. */
function contextMenu(label, items) {
  const wrap = el('div', { class: 'dw-anchor' });
  const trigger = el('button', { type: 'button', class: 'icon-btn sm row-more', 'aria-label': label, title: 'Mais ações' }, icon('more', { size: 16 }));
  const panel = el('div', { class: 'dw-menu dw-menu-sm' });
  for (const item of items.filter(Boolean)) {
    const node = item.href
      ? el('a', { role: 'menuitem', class: 'dw-menu-item', href: item.href, target: item.newTab ? '_blank' : null, rel: item.newTab ? 'noopener' : null }, [icon(item.icon, { size: 16 }), el('span', { class: 'dw-menu-label', text: item.label })])
      : el('button', { type: 'button', role: 'menuitem', class: 'dw-menu-item' }, [icon(item.icon, { size: 16 }), el('span', { class: 'dw-menu-label', text: item.label })]);
    if (item.onClick) node.addEventListener('click', () => { menu.hide({ restore: false }); item.onClick(); });
    panel.append(node);
  }
  const menu = popover({ trigger, panel, role: 'menu' });
  wrap.append(trigger, panel);
  return wrap;
}

export function afterRender(ctx, { failure = null } = {}) {
  state.ctx = ctx;
  const view = document.querySelector('#view');
  if (view) {
    view.classList.remove('is-switching');
    view.classList.remove('dw-enter');
    void view.offsetWidth;
    view.classList.add('dw-enter');
  }
  if (failure || !ctx.organization) return;
  if (ctx.view === 'rfqs') enhanceRfqList(ctx);
  if (ctx.view === 'proposals') enhanceProposals(ctx);
  if (ctx.view === 'providers') enhanceProviders(ctx);
  if (ctx.view === 'contracts') enhanceContracts(ctx);
  if (ctx.view === 'rfq') enhanceRfqDetail(ctx);
  if (ctx.view === 'newRfq') document.querySelector('.page-actions')?.prepend(focusButton());
  // Seções de Configurações por âncora (#equipe, #aparencia…), já com a página montada.
  if (ctx.view === 'settings' && /^#[a-z-]+$/.test(location.hash)) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }));
  restorePlace(ctx);
}

/** Seção "Aparência" dentro de Configurações da demonstração. */
export function settingsSection(ctx) {
  return (add) => add('aparencia', 'Aparência', 'Tema, cor de destaque, densidade, barra lateral e movimento. Preferências deste navegador, só na demonstração.', preferencesPanel(ctx));
}

// ------------------------------------------------------------- globais
function installGlobals() {
  if (state.globalsInstalled) return;
  state.globalsInstalled = true;
  try { history.scrollRestoration = 'manual'; } catch { /* navegador antigo */ }
  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'k') {
      if (!state.palette) return;
      event.preventDefault();
      if (state.palette.isOpen) state.palette.close(); else { closeOpenPopover(); state.palette.open(); }
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === 'b' && matchMedia('(min-width: 960px)').matches) {
      event.preventDefault();
      toggleSidebar();
    }
  });
  // Quick view: clique simples espia; Ctrl/⌘/Shift/botão do meio seguem o link normal.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const quick = event.target.closest?.('a[data-quick]');
    if (quick && state.ctx) {
      const [type, id] = quick.dataset.quick.split(':');
      if (openQuickView(state.ctx, type, id)) { event.preventDefault(); return; }
    }
    if (event.target.closest?.('a[href]')) rememberPlace();
  });
  addEventListener('pagehide', rememberPlace);
  addEventListener('popstate', () => { if (state.ctx?.view === 'rfqs') state.ctx.rerender(); });
  addEventListener('resize', () => syncShell(), { passive: true });
  prefs.subscribe(() => {
    if (state.ctx) { document.querySelector('.sidebar .side-extra')?.replaceWith(sidebarExtras(state.ctx)); syncShell(); }
  });
}

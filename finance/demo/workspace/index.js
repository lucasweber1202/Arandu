// Camada de experiência da demonstração — laboratório da próxima interface.
//
// Carregada por finance/app.js SOMENTE em páginas /demo/* de um build que
// habilita a demonstração (mesma trava do motor fictício). Não chama servidor,
// não cria credencial e não muda regra: reorganiza a apresentação por cima das
// telas do produto e guarda preferências só neste navegador.
//
// Modelo:  NAVEGAÇÃO → WORKSPACE → CONTEXTO
//   shell.js          barra lateral, topbar, menu da conta/persona, restaurar
//   responsive.js     barra inferior por persona no celular
//   dashboard.js      fila de trabalho personalizável; presets.js
//   rfq-page.js       tela de solicitação; compare.js (workspace de comparação)
//   comparison-tray.js  bandeja de propostas selecionadas
//   quick-view.js     resumo lateral universal; approval.js (CFO)
//   table-preferences.js, saved-views.js, contracts.js, timeline.js
//   command.js        Ctrl/⌘+K; assist.js (ações factuais, política de IA)
//   preferences.js    registro local versionado (v2, migra v1)

import { el, icon, registerIcons } from '../../src/core.js';
import { button, linkButton, toast, drawer, saveIndicator } from '../../src/ui.js';
import { WORKSPACE_ICONS } from './icons.js';
import * as prefs from './preferences.js';
import { closeOpenPopover } from './popover.js';
import { installPalette } from './command.js';
import { openQuickView } from './quick-view.js';
import { openApproval } from './approval.js';
import { renderSidebar, renderTopbar, toggleSidebar, toggleFocus, syncShell, announce, openRestore, sidebarPersonal, viewHref } from './shell.js';
import { renderMobileNav } from './responsive.js';
import { enhanceRfq } from './rfq-page.js';
import { leaveCompare } from './compare.js';
import { installTray } from './comparison-tray.js';
import { enhanceRfqTable } from './table-preferences.js';
import { installViewsBar, activeView, builtinViews } from './saved-views.js';
import { enhanceContracts } from './contracts.js';
import { contextActions } from './assist.js';
import { PRESETS, PRESET_ORDER, applyPreset } from './presets.js';

registerIcons(WORKSPACE_ICONS);

export const dashboard = async (ctx) => (await import('./dashboard.js')).dashboard(ctx);

// Visão pedida pela barra lateral (?visao=): lida antes de a lista reescrever o endereço.
const initialViewId = new URLSearchParams(location.search).get('visao');
const state = { ctx: null, palette: null, globalsInstalled: false, counts: {} };

// --------------------------------------------------------------- hooks
function hooks(ctx) {
  return {
    switchPersona: (key) => switchPersona(ctx, key),
    openPreferences: () => openPreferences(ctx),
    openRestore: () => openRestore(ctx),
    customizeDashboard: () => customizeDashboard(ctx),
    openPalette: () => state.palette?.open()
  };
}
function switchPersona(ctx, key) {
  closeOpenPopover();
  state.palette?.close();
  leaveCompare();
  document.querySelector('#view')?.classList.add('is-switching');
  ctx.switchPersona(key);
}
export function customizeDashboard(ctx) {
  if (ctx.view === 'dashboard' || ctx.view === 'home') { document.querySelector('#customize-dashboard')?.click(); return; }
  location.assign(ctx.href('/finance/dashboard.html#personalizar'));
}

// ------------------------------------------------------------ shell
export function installShell(ctx) {
  state.ctx = ctx;
  const shellHooks = hooks(ctx);
  const topbar = renderTopbar(ctx, shellHooks);
  if (topbar?.search) {
    const paletteHooks = {
      quickView: (type, id) => openQuickView(ctx, type, id),
      setAppearance: (key, value) => { prefs.setAppearance(key, value); announce('Preferência aplicada.'); syncShell(); },
      applyPreset: (key) => { applyPreset(key); announce(`Preset ${PRESETS[key].label} aplicado.`); ctx.rerender?.(); },
      presets: PRESET_ORDER.map((key) => [key, PRESETS[key].label]),
      toggleFocus: () => toggleFocus(), toggleSidebar,
      openPreferences: shellHooks.openPreferences, openRestore: shellHooks.openRestore,
      customizeDashboard: shellHooks.customizeDashboard, switchPersona: shellHooks.switchPersona,
      reopen: (query) => setTimeout(() => state.palette.open(query), 0),
      views: () => [...builtinViews(ctx, 'rfqs').filter((view) => view.id !== 'all').map((view) => ({ ...view, page: 'rfqs', href: ctx.href(`/finance/rfqs.html?${view.query ? `${view.query}&` : ''}visao=${view.id}`) })),
        ...prefs.readState().savedViews.map((view) => ({ ...view, href: viewHref(ctx, view) }))],
      contextActions: () => contextActions(ctx, {
        openCompare: () => document.querySelector('#tab-comparacao')?.click(),
        showMissing: () => { document.querySelector('#tab-comparacao')?.click(); setTimeout(() => document.querySelector('#compare-missing-toggle')?.click(), 60); },
        openHistory: () => { document.querySelector('#tab-visao-geral')?.click(); setTimeout(() => document.querySelector('#revisoes')?.scrollIntoView({ block: 'start' }), 60); }
      })
    };
    state.palette = installPalette(ctx, paletteHooks);
    topbar.search.addEventListener('click', () => state.palette.open());
    if (ctx.audience === 'company') ctx.loadApprovals?.().then((rows) => {
      paletteHooks.pendingApprovals = rows.filter((row) => row.status === 'pending' && (row.steps || []).filter((step) => step.status === 'pending').sort((a, b) => a.position - b.position)[0]?.approver_id === ctx.viewer?.id).length;
    }).catch(() => {});
  }
  installGlobals();
}
export function decorateSidebar(ctx, counts = {}) {
  state.counts = counts;
  renderSidebar(ctx, counts);
}

// ---------------------------------------------------------- preferências
let panelSeq = 0;
function radioGroup({ legend, name, options, current, onChange, hint = null, swatches = false, key }) {
  const fieldset = el('fieldset', { class: 'pref-group', dataset: { pref: key } }, [el('legend', { class: 'pref-legend', text: legend })]);
  const row = el('div', { class: `pref-options${swatches ? ' pref-swatches' : ''}` });
  for (const [value, label, iconName] of options) {
    const input = el('input', { type: 'radio', name, value, checked: value === current, class: 'pref-input' });
    input.addEventListener('change', () => { if (input.checked) onChange(value, label); });
    row.append(el('label', { class: 'pref-option' }, [input, el('span', { class: 'pref-option-face' }, [
      swatches ? el('span', { class: 'pref-swatch', dataset: { swatch: value }, 'aria-hidden': 'true' }) : iconName ? icon(iconName, { size: 15 }) : null, el('span', { text: label })])]));
  }
  fieldset.append(row);
  if (hint) fieldset.append(el('p', { class: 'pref-hint', text: hint }));
  return fieldset;
}
function preferencesPanel(ctx) {
  const prefix = `pref${++panelSeq}`;
  const saved = saveIndicator('idle', 'Alterações aplicadas na hora e salvas neste navegador.');
  const current = prefs.readState();
  const appearance = (key, legend, options, extra = {}) => radioGroup({ key, legend, name: `${prefix}-${key}`, options, current: current.appearance[key], ...extra,
    onChange: (value, label) => { prefs.setAppearance(key, value); syncShell(); saved.set('saved', `${legend}: ${label}. Salvo.`); } });
  const behavior = (key, legend, options, extra = {}) => radioGroup({ key: `b-${key}`, legend, name: `${prefix}-b-${key}`, options, current: current.behavior[key], ...extra,
    onChange: (value, label) => { prefs.setBehavior(key, value); saved.set('saved', `${legend}: ${label}. Salvo.`); } });
  const preset = radioGroup({ key: 'preset', legend: 'Workspace', name: `${prefix}-preset`, current: current.appearance.preset,
    options: [...PRESET_ORDER.map((key) => [key, PRESETS[key].label]), ['custom', 'Personalizado']],
    hint: 'Pontos de partida: densidade, barra lateral, detalhe e módulos do painel. Ajustes manuais viram “Personalizado”.',
    onChange: (value, label) => { if (value !== 'custom') applyPreset(value); else prefs.setAppearance('preset', 'custom', { keepPreset: true }); syncShell(); saved.set('saved', `Workspace ${label.toLowerCase()} aplicado.`); } });
  const sections = [
    el('h3', { class: 'pref-section', text: 'Workspace' }), preset,
    appearance('density', 'Densidade', [['auto', 'Automática', 'monitor'], ['compact', 'Compacta', 'menu'], ['comfortable', 'Confortável', 'layers'], ['spacious', 'Espaçosa', 'maximize']],
      { hint: 'Automática: compacta em notebooks, confortável em telas grandes e tablets. A escolha manual tem precedência.' }),
    appearance('sidebar', 'Barra lateral', [['auto', 'Automática', 'monitor'], ['expanded', 'Expandida', 'sidebar'], ['compact', 'Compacta', 'grip'], ['hidden', 'Oculta', 'eyeOff']],
      { hint: 'Automática: expandida em telas largas, compacta em notebooks e tablets. Alterne a qualquer momento com Ctrl/⌘+B.' }),
    appearance('detail', 'Informação secundária', [['full', 'Completa', 'layers'], ['essential', 'Essencial', 'minimize']], { hint: 'Essencial esconde metadados de apoio em listas e no painel.' }),
    el('h3', { class: 'pref-section', text: 'Aparência' }),
    appearance('theme', 'Tema', [['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon'], ['system', 'Sistema', 'monitor']]),
    appearance('accent', 'Cor de destaque', [['indigo', 'Índigo'], ['blue', 'Azul'], ['emerald', 'Esmeralda'], ['graphite', 'Grafite'], ['violet', 'Violeta']], { swatches: true, hint: 'Paleta controlada: todas as opções mantêm o contraste de botões e links.' }),
    appearance('motion', 'Movimento', [['normal', 'Normal', 'sparkles'], ['reduced', 'Reduzido', 'minimize']], { hint: prefs.systemPrefersReducedMotion() ? 'Seu sistema pede movimento reduzido: ele é respeitado mesmo com “Normal”.' : 'Reduzido remove transições e animações.' }),
    ctx.audience === 'company' ? el('h3', { class: 'pref-section', text: 'Comportamento' }) : null,
    ctx.audience === 'company' ? behavior('rfqClick', 'Ao clicar numa solicitação', [['quick', 'Abrir resumo lateral', 'eye'], ['page', 'Abrir a página', 'arrowRight']]) : null,
    ctx.audience === 'company' ? behavior('home', 'Página inicial', [['overview', 'Visão geral', 'home'], ['rfqs', 'Solicitações', 'file'], ['approvals', 'Aprovações', 'checkCircle']], { hint: 'Para onde levam a marca Arandu, “Início” no celular e a troca de persona.' }) : null,
    ctx.audience === 'company' ? behavior('afterCreate', 'Depois de criar uma solicitação', [['stay', 'Permanecer nela', 'file'], ['list', 'Voltar para a lista', 'menu']]) : null
  ].filter(Boolean);
  const unsubscribe = prefs.subscribe((next) => {
    for (const fieldset of sections.filter((node) => node.dataset?.pref)) {
      const key = fieldset.dataset.pref;
      const value = key.startsWith('b-') ? next.behavior[key.slice(2)] : next.appearance[key];
      for (const input of fieldset.querySelectorAll('input')) input.checked = input.value === value;
    }
  });
  const reset = button('Restaurar padrão', { variant: 'ghost', size: 'sm', iconName: 'refresh', onClick: () => {
    prefs.update((draft) => { draft.appearance = { ...prefs.DEFAULT_APPEARANCE }; draft.behavior = { ...prefs.DEFAULT_BEHAVIOR }; });
    prefs.applyAppearance();
    syncShell();
    saved.set('saved', 'Aparência e comportamento padrão restaurados.');
  } });
  const node = el('div', { class: 'pref-panel' }, [...sections, el('div', { class: 'pref-foot' }, [saved.node, reset,
    ctx.audience === 'company' ? linkButton('Personalizar painel', ctx.href('/finance/dashboard.html#personalizar'), { variant: 'ghost', size: 'sm', iconName: 'layout' }) : null])]);
  node.cleanup = unsubscribe;
  return node;
}
export function openPreferences(ctx) {
  closeOpenPopover();
  const body = preferencesPanel(ctx);
  drawer({ title: 'Aparência e preferências', subtitle: 'Guardadas só neste navegador, só na demonstração.', body, className: 'prefs-drawer', onClose: () => body.cleanup?.() });
}
export function settingsSection(ctx) {
  return (add) => add('aparencia', 'Aparência e workspace', 'Preset, densidade, barra lateral, tema, cor, movimento e comportamento. Preferências deste navegador, só na demonstração.', preferencesPanel(ctx));
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
const lastListHref = (ctx) => readContext().lists?.rfqs || ctx.href('/finance/rfqs.html');
const markRestore = (ctx) => () => { const context = readContext(); context.restore = lastListHref(ctx); writeContext(context); };

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

// ------------------------------------------------------- telas existentes
function enhanceProposals(ctx) {
  import('./comparison-tray.js').then(({ trayCheckbox }) => {
    for (const row of document.querySelectorAll('#view tr[data-entity="proposal"]')) {
      const link = row.querySelector('a.row-title');
      const rfq = (ctx.data.rfqs || []).find((item) => item.id === row.dataset.rfq);
      const proposal = rfq?.proposals?.find((item) => item.id === row.dataset.id);
      if (!link || !proposal || row.dataset.dw) continue;
      row.dataset.dw = '1';
      link.dataset.quick = `proposal:${proposal.id}`;
      link.setAttribute('aria-describedby', 'quick-hint');
      row.querySelector('td.cell-primary')?.prepend(trayCheckbox(rfq, proposal, { label: '' }));
    }
  });
  if (!document.getElementById('quick-hint')) document.body.append(el('p', { id: 'quick-hint', class: 'sr-only', text: 'Abre um resumo lateral. Use Ctrl ou ⌘ com clique para abrir a página completa.' }));
}
function enhanceProviders(ctx) {
  import('./rfq-page.js').then(({ starButton }) => {
    for (const row of document.querySelectorAll('#view tr[data-entity="provider"]')) {
      const provider = (ctx.data.providers || []).find((item) => item.id === row.dataset.id);
      const cell = row.querySelector('td.cell-primary');
      if (!provider || !cell || cell.querySelector('.row-peek')) continue;
      row.classList.add('row-link');
      cell.append(el('button', { type: 'button', class: 'row-peek stretched', 'aria-label': `Ver resumo de ${provider.name}`, onclick: () => openQuickView(ctx, 'provider', provider.id) }), starButton('provider', provider.id, provider.name));
    }
  });
}
function enhanceTasks(ctx) {
  for (const item of document.querySelectorAll('#view .task-item')) {
    const id = item.id.replace(/^task-/, '');
    const title = item.querySelector('.task-title');
    if (!title || title.closest('button') || !(ctx.data.tasks || []).some((task) => task.id === id)) continue;
    const peek = el('button', { type: 'button', class: 'task-peek', 'aria-label': `Ver resumo: ${title.textContent}` }, icon('eye', { size: 14 }));
    peek.addEventListener('click', () => openQuickView(ctx, 'task', id));
    item.append(peek);
  }
}
function enhanceApprovals(ctx) {
  // "Ver contexto" abre a experiência de aprovação da demonstração.
  ctx.loadApprovals().then((rows) => {
    for (const row of document.querySelectorAll('#view .inbox-row')) {
      const request = rows.find((item) => `request-${item.id}` === row.id);
      const rfq = request && (ctx.data.rfqs || []).find((item) => item.id === request.rfq_id);
      const open = [...row.querySelectorAll('button')].find((node) => node.textContent.trim() === 'Ver contexto');
      if (!request || !rfq || !open || open.dataset.dw) continue;
      open.dataset.dw = '1';
      open.addEventListener('click', (event) => { event.stopImmediatePropagation(); openApproval(ctx, request, rfq); }, true);
    }
    if (location.hash.startsWith('#request-')) {
      const request = rows.find((item) => `#request-${item.id}` === location.hash);
      const rfq = request && (ctx.data.rfqs || []).find((item) => item.id === request.rfq_id);
      if (request && rfq) setTimeout(() => { for (const dialog of document.querySelectorAll('dialog.drawer[open]:not(.quick-view)')) dialog.close(); openApproval(ctx, request, rfq); }, 0);
    }
  });
}
function enhanceRfqList(ctx) {
  const page = document.querySelector('#view .list-page');
  const toolbar = page?.querySelector('.toolbar');
  if (!toolbar) return;
  const extra = activeView(ctx, 'rfqs', initialViewId)?.extra || '';
  installViewsBar(ctx, { page: 'rfqs', anchor: toolbar, currentHidden: () => prefs.hiddenColumns('rfqs'), onApply: (view) => {
    history.pushState(null, '', `${location.pathname}${view.query ? `?${view.query}` : ''}`);
    ctx.rerender();
  } });
  enhanceRfqTable(ctx, { extra, announce });
  let flash = null;
  try { flash = sessionStorage.getItem('arandu-demo-flash'); sessionStorage.removeItem('arandu-demo-flash'); } catch { flash = null; }
  if (flash) toast(flash);
}

/** Trilha na topbar quando a tela não define uma. */
function sectionCrumb(ctx) {
  const crumbs = document.querySelector('#breadcrumbs');
  if (!crumbs || crumbs.children.length) return;
  const label = document.querySelector('.page-head h1')?.textContent?.trim();
  if (label && !['dashboard', 'home'].includes(ctx.view)) crumbs.replaceChildren(el('ol', { class: 'crumbs', 'aria-label': 'Você está em' }, el('li', {}, el('span', { 'aria-current': 'page', text: label }))));
}

export function afterRender(ctx, { failure = null } = {}) {
  state.ctx = ctx;
  const view = document.querySelector('#view');
  if (view) {
    view.classList.remove('is-switching', 'dw-enter');
    void view.offsetWidth;
    view.classList.add('dw-enter');
  }
  document.body.dataset.view = ctx.view;
  if (!failure && ctx.organization) renderMobileNav(ctx, state.counts, hooks(ctx));
  if (failure || !ctx.organization) return;
  document.querySelector('.sidebar .side-personal')?.replaceWith(sidebarPersonal(ctx));
  sectionCrumb(ctx);
  if (ctx.view === 'rfqs') enhanceRfqList(ctx);
  if (ctx.view === 'proposals') enhanceProposals(ctx);
  if (ctx.view === 'providers') enhanceProviders(ctx);
  if (ctx.view === 'contracts') enhanceContracts(ctx, { initialViewId });
  if (ctx.view === 'tasks') setTimeout(() => enhanceTasks(ctx), 300);
  if (ctx.view === 'approvals') enhanceApprovals(ctx);
  if (ctx.view === 'rfq') enhanceRfq(ctx, { lastListHref: () => lastListHref(ctx), markRestore: markRestore(ctx), focusButton });
  if (ctx.view === 'newRfq') document.querySelector('.page-actions')?.prepend(focusButton());
  if (ctx.view === 'settings' && /^#[a-z-]+$/.test(location.hash)) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }));
  installTray(ctx);
  restorePlace(ctx);
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
      if (document.documentElement.dataset.sidebarState === 'hidden' && !prefs.readState().shell.focus) { prefs.setAppearance('sidebar', 'expanded'); syncShell(); announce('Barra lateral visível.'); return; }
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
    if (state.ctx) { document.querySelector('.sidebar .side-personal')?.replaceWith(sidebarPersonal(state.ctx)); syncShell(); }
  });
}

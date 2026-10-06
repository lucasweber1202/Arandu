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
//
// Work OS (v3), organizado por domínio:
//   platform/         os-store (registro local), bus (eventos + auditoria),
//                     local-first (cache SWR), sync (otimista + fila offline),
//                     telemetry (desempenho, flags, analytics), conflict
//   collaboration/    presença, atividade, comentários com escopo, notificações
//   workflows/        políticas versionadas, construtor, intake com modelos
//   integrations/     conectores simulados (adaptadores), central, ERP, Open Finance
//   analytics/        Uso da demonstração (funil, sessão, auditoria, flags)
//   help/             atalhos de teclado e ajuda (?)

import { el, icon, registerIcons } from '../../src/core.js';
import { button, linkButton, toast, drawer, saveIndicator } from '../../src/ui.js';
import { WORKSPACE_ICONS } from './icons.js';
import * as prefs from './preferences.js';
import { closeOpenPopover } from './popover.js';
import { openQuickView, setInspectorHook } from './quick-view.js';
import { installInspector, openInspector, resetInspector } from './inspector.js';
import { installFilterBar } from './filters.js';
import { installRouteBar } from './route.js';
import { renderSidebar, renderTopbar, toggleSidebar, toggleFocus, syncShell, announce, openRestore, sidebarPersonal, viewHref } from './shell.js';
import { renderMobileNav } from './responsive.js';
import { leaveCompare } from './compare.js';
import { installTray } from './comparison-tray.js';
import { enhanceRfqTable } from './table-preferences.js';
import { starButton } from './star.js';
import { installViewsBar, activeView, builtinViews } from './saved-views.js';
import { contextActions } from './assist.js';
import { PRESETS, PRESET_ORDER, applyPreset } from './presets.js';
import { on, listenerCount } from './platform/bus.js';
import { flag, mark, track, sessionNote, wireAnalytics, perfSummary, PERF_BUDGETS } from './platform/telemetry.js';
import { cacheStats } from './platform/local-first.js';
import { syncIndicator, setNetwork, isOffline } from './platform/sync.js';
import { wireNotifications } from './collaboration/notify.js';
import { installShortcuts, openHelp } from './help/keyboard.js';

registerIcons(WORKSPACE_ICONS);

export const dashboard = async (ctx) => (await import('./dashboard.js')).dashboard(ctx);
/** Telas que a demonstração substitui ou acrescenta (mesmos dados, mesmas regras do produto). */
export const views = {
  ...(flag('decisionInbox') ? { approvals: async (ctx) => (await import('./decision-inbox.js')).decisionInbox(ctx) } : {}),
  notifications: async (ctx) => (await import('./collaboration/center.js')).notificationCenter(ctx),
  workIntake: async (ctx) => (await import('./workflows/intake.js')).intakePage(ctx),
  workPolicies: async (ctx) => (await import('./workflows/builder.js')).policyBuilder(ctx),
  workIntegrations: async (ctx) => (await import('./integrations/center.js')).integrationCenter(ctx),
  workUsage: async (ctx) => (await import('./analytics/usage.js')).usagePage(ctx)
};

// Visão pedida pela barra lateral (?visao=): lida antes de a lista reescrever o endereço.
const initialViewId = new URLSearchParams(location.search).get('visao');
const state = { ctx: null, palette: null, globalsInstalled: false, counts: {}, renderSeq: 0, firstRender: true, lastReload: 0 };

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

// A central de comando carrega no primeiro uso (Ctrl/⌘+K ou clique): o
// pacote inicial fica leve e a abertura continua imediata depois disso.
//
// Entre o pedido de abertura e a chegada do módulo, o que a pessoa digita não
// pode se perder nem cair na página: as teclas vão para um buffer, o Enter fica
// pendente e é executado sobre a busca completa assim que a central abre (antes,
// o Enter executava o primeiro item da lista vazia — uma navegação). Esc cancela.
function lazyPalette(ctx, paletteHooks) {
  let real = null;
  let loading = null;
  let pending = null;
  const load = () => (loading ||= import('./command.js').then(({ installPalette }) => { real = installPalette(ctx, paletteHooks); return real; })
    // Falha de rede ao buscar o módulo: libera o teclado e permite tentar de novo.
    .catch((error) => { stopBuffer(); loading = null; throw error; }));
  const stopBuffer = () => { pending = null; document.removeEventListener('keydown', buffer, true); };
  function buffer(event) {
    if (!pending || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const consume = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (event.key === 'Escape') { consume(); stopBuffer(); return; }
    if (pending.submit) { consume(); return; }
    if (event.key === 'Enter') { consume(); pending.submit = { peek: event.shiftKey }; return; }
    if (event.key === 'Backspace') { consume(); pending.query = pending.query.slice(0, -1); return; }
    if (event.key.length === 1) { consume(); pending.query += event.key; }
  }
  // Pré-carrega quando o navegador estiver ocioso.
  (globalThis.requestIdleCallback || ((run) => setTimeout(run, 1200)))(() => load());
  return {
    open(query = '') {
      if (real) { real.open(query); return Promise.resolve(real); }
      if (pending) return loading;
      pending = { query, submit: null };
      document.addEventListener('keydown', buffer, true);
      return load().then((palette) => {
        const request = pending;
        stopBuffer();
        if (!request) return palette;
        palette.open(request.query);
        if (request.submit) palette.submit(request.submit);
        return palette;
      });
    },
    close: () => { if (pending) stopBuffer(); real?.close(); },
    get isOpen() { return Boolean(pending) || Boolean(real?.isOpen); }
  };
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
      openHelp, toggleOffline: () => { setNetwork(isOffline() ? 'online' : 'offline', ctx); announce(isOffline() ? 'Offline simulado: alterações ficam na fila.' : 'Reconectado. Enviando a fila.'); },
      reopen: (query) => setTimeout(() => state.palette.open(query), 0),
      views: () => [...builtinViews(ctx, 'rfqs').filter((view) => view.id !== 'all').map((view) => ({ ...view, page: 'rfqs', href: ctx.href(`/finance/rfqs.html?${view.query ? `${view.query}&` : ''}visao=${view.id}`) })),
        ...prefs.readState().savedViews.map((view) => ({ ...view, href: viewHref(ctx, view) }))],
      contextActions: () => contextActions(ctx, {
        openCompare: () => document.querySelector('#tab-comparacao')?.click(),
        showMissing: () => { document.querySelector('#tab-comparacao')?.click(); setTimeout(() => document.querySelector('#compare-missing-toggle')?.click(), 60); },
        openHistory: () => { document.querySelector('#tab-visao-geral')?.click(); setTimeout(() => document.querySelector('#revisoes')?.scrollIntoView({ block: 'start' }), 60); }
      })
    };
    state.palette = lazyPalette(ctx, paletteHooks);
    topbar.search.addEventListener('click', () => state.palette.open());
    if (ctx.audience === 'company') ctx.loadApprovals?.().then((rows) => {
      paletteHooks.pendingApprovals = rows.filter((row) => row.status === 'pending' && (row.steps || []).filter((step) => step.status === 'pending').sort((a, b) => a.position - b.position)[0]?.approver_id === ctx.viewer?.id).length;
    }).catch(() => {});
  }
  installGlobals();
  installWorkOS(ctx, topbar);
  setInspectorHook((context, type, id) => openInspector(context, type, id));
}

// ------------------------------------------------------------- Work OS
let debugTimer = null;
function togglePerfDebug() {
  const existing = document.getElementById('perf-debug');
  if (existing) { existing.remove(); clearInterval(debugTimer); return; }
  const panel = el('aside', { id: 'perf-debug', class: 'perf-debug', 'aria-label': 'Depuração de desempenho (demonstração)' });
  const draw = () => {
    const stats = cacheStats();
    panel.replaceChildren(el('p', { class: 'perf-debug-title', text: 'Depuração · Alt+Shift+D' }),
      el('p', { text: `Ouvintes: ${listenerCount()} · Cache: ${stats.entries} (${stats.hits} acertos, ${stats.revalidations} revalidações)` }),
      el('ul', {}, perfSummary().map((row) => el('li', { class: PERF_BUDGETS[row.name] && row.p95 > PERF_BUDGETS[row.name] ? 'is-over' : '', text: `${row.name}: mediana ${row.median} ms · p95 ${row.p95} ms${PERF_BUDGETS[row.name] ? ` / ${PERF_BUDGETS[row.name]}` : ''}` }))));
  };
  draw();
  debugTimer = setInterval(draw, 2000);
  document.body.append(panel);
}

function installWorkOS(ctx, topbar) {
  // Topbar: sincronização (simulada) e ajuda, ao lado das notificações.
  const actions = document.querySelector('.topbar .topbar-actions');
  if (actions && ctx.organization) {
    if (flag('offlineSim')) actions.insertBefore(syncIndicator(ctx), actions.querySelector('#notification-trigger') || actions.firstChild);
    if (!actions.querySelector('#help-trigger')) actions.insertBefore(el('button', { type: 'button', class: 'icon-btn', id: 'help-trigger', 'aria-label': 'Ajuda e atalhos (?)', title: 'Ajuda e atalhos (?)', 'aria-keyshortcuts': 'Shift+?', onclick: openHelp }, icon('help', { size: 17 })),
      actions.querySelector('#notification-trigger') || null);
  }
  void topbar;
  if (state.workOSInstalled) return;
  state.workOSInstalled = true;
  wireAnalytics();
  wireNotifications(() => (state.ctx?.members || []).map((member) => ({ ...member, self: member.user_id === state.ctx?.viewer?.id })));
  installShortcuts(ctx, { go: (path) => location.assign(state.ctx.href(path)), announce });
  // Painel de depuração escondido: ?debug=1 ou Alt+Shift+D. Só na demonstração.
  globalThis.__aranduWorkOS = Object.freeze({ listenerCount, cacheStats, perfSummary });
  if (new URLSearchParams(location.search).has('debug')) togglePerfDebug();
  document.addEventListener('keydown', (event) => { if (event.altKey && event.shiftKey && event.key.toLowerCase() === 'd') { event.preventDefault(); togglePerfDebug(); } });
  try { if (!sessionStorage.getItem('arandu-demo-started')) { sessionStorage.setItem('arandu-demo-started', '1'); track('demo_started', { persona: ctx.persona?.key }); } } catch { /* sem sessão */ }
  // Cache local-first: se a revalidação trouxe algo novo (outra aba, outra persona), a tela se atualiza sem piscar.
  let timer = null;
  on('sync.revalidated', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (Date.now() - state.lastReload < 3000 || document.querySelector('dialog[open], html[data-inspector=on]') || document.activeElement?.matches?.('input, textarea, select')) return;
      state.lastReload = Date.now();
      state.ctx?.reload();
    }, 250);
  });
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
  // Superfície principal: só tema e densidade. O resto vive em "Preferências avançadas".
  // Enquanto a densidade é automática, nenhuma das duas fica marcada: escolher é explícito.
  const effectiveDensity = () => (['compact', 'comfortable'].includes(prefs.readState().appearance.density) ? prefs.readState().appearance.density : null);
  const simpleDensity = radioGroup({ key: 'density-simple', legend: 'Densidade', name: `${prefix}-density-simple`, current: effectiveDensity(),
    options: [['comfortable', 'Confortável', 'layers'], ['compact', 'Compacta', 'menu']], hint: 'Sem escolha, a densidade acompanha a tela: compacta em notebooks, confortável em telas grandes.',
    onChange: (value, label) => { prefs.setAppearance('density', value); syncShell(); saved.set('saved', `Densidade: ${label}. Salvo.`); } });
  const advanced = [
    el('h3', { class: 'pref-section', text: 'Workspace' }), preset,
    appearance('density', 'Densidade detalhada', [['auto', 'Automática', 'monitor'], ['compact', 'Compacta', 'menu'], ['comfortable', 'Confortável', 'layers'], ['spacious', 'Espaçosa', 'maximize']],
      { hint: 'Automática: compacta em notebooks, confortável em telas grandes e tablets. A escolha manual tem precedência.' }),
    appearance('sidebar', 'Barra lateral', [['auto', 'Automática', 'monitor'], ['expanded', 'Expandida', 'sidebar'], ['compact', 'Compacta', 'grip'], ['hidden', 'Oculta', 'eyeOff']],
      { hint: 'Automática: expandida em telas largas, compacta em notebooks e tablets. Alterne a qualquer momento com Ctrl/⌘+B.' }),
    appearance('detail', 'Informação secundária', [['full', 'Completa', 'layers'], ['essential', 'Essencial', 'minimize']], { hint: 'Essencial esconde metadados de apoio em listas e no painel.' }),
    appearance('accent', 'Cor de destaque', [['indigo', 'Arandu'], ['blue', 'Azul'], ['emerald', 'Esmeralda'], ['graphite', 'Grafite'], ['violet', 'Violeta']], { swatches: true, hint: 'Paleta controlada: todas as opções mantêm o contraste de botões e links.' }),
    appearance('motion', 'Movimento', [['normal', 'Normal', 'sparkles'], ['reduced', 'Reduzido', 'minimize']], { hint: prefs.systemPrefersReducedMotion() ? 'Seu sistema pede movimento reduzido: ele é respeitado mesmo com “Normal”.' : 'Reduzido remove transições e animações.' }),
    ctx.audience === 'company' ? el('h3', { class: 'pref-section', text: 'Comportamento' }) : null,
    ctx.audience === 'company' ? behavior('rfqClick', 'Ao clicar numa solicitação', [['quick', 'Abrir resumo lateral', 'eye'], ['page', 'Abrir a página', 'arrowRight']]) : null,
    ctx.audience === 'company' ? behavior('home', 'Página inicial', [['overview', 'Visão geral', 'home'], ['rfqs', 'Solicitações', 'file'], ['approvals', 'Aprovações', 'checkCircle']], { hint: 'Para onde levam a marca Arandu, “Início” no celular e a troca de persona.' }) : null,
    ctx.audience === 'company' ? behavior('afterCreate', 'Depois de criar uma solicitação', [['stay', 'Permanecer nela', 'file'], ['list', 'Voltar para a lista', 'menu']]) : null
  ].filter(Boolean);
  const sections = [
    appearance('theme', 'Tema', [['system', 'Sistema', 'monitor'], ['light', 'Claro', 'sun'], ['dark', 'Escuro', 'moon']]),
    simpleDensity,
    el('details', { class: 'pref-advanced', id: 'pref-advanced' }, [el('summary', { class: 'pref-advanced-summary', text: 'Preferências avançadas' }),
      el('p', { class: 'pref-hint', text: 'Preset do workspace, barra lateral, cor, movimento e comportamento de cliques.' }), ...advanced])
  ].filter(Boolean);
  const unsubscribe = prefs.subscribe((next) => {
    for (const fieldset of node.querySelectorAll('fieldset[data-pref]')) {
      const key = fieldset.dataset.pref;
      const value = key === 'density-simple' ? effectiveDensity() : key.startsWith('b-') ? next.behavior[key.slice(2)] : next.appearance[key];
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
  Promise.resolve({ starButton }).then(({ starButton }) => {
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
  // A barra de filtros salvos se redesenha sozinha quando um filtro é salvo (prefs.subscribe).
  const filters = installFilterBar(ctx, { page: 'rfqs', announce, activeViewId: () => activeView(ctx, 'rfqs')?.id });
  if (filters) new MutationObserver(() => filters.redraw()).observe(document.querySelector('#view .list-page tbody') || document.body, { childList: true });
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
  resetInspector();
  const view = document.querySelector('#view');
  if (view) {
    view.classList.remove('is-switching', 'dw-enter');
    void view.offsetWidth;
    view.classList.add('dw-enter');
  }
  document.body.dataset.view = ctx.view;
  if (!failure && ctx.organization) renderMobileNav(ctx, state.counts, hooks(ctx));
  if (failure || !ctx.organization) return;
  // Medições locais: primeira tela desde a navegação; depois, cada re-render.
  if (state.firstRender) { state.firstRender = false; mark('route', performance.now(), { view: ctx.view }); track('page_viewed', { view: ctx.view }); sessionNote(`abriu ${document.querySelector('.page-head h1')?.textContent?.trim() || ctx.view}`, { persona: ctx.persona?.name }); }
  if (ctx.view === 'rfq') track('rfq_opened');
  if (ctx.view === 'contracts') track('contract_opened');
  document.querySelector('.sidebar .side-personal')?.replaceWith(sidebarPersonal(ctx));
  sectionCrumb(ctx);
  installInspector(ctx);
  installRouteBar(ctx);
  // A gramática da próxima ação precisa das aprovações; as telas esperam por elas.
  const seq = ++state.renderSeq;
  ctx.loadApprovals().catch(() => []).then((rows) => {
    ctx.demoApprovals = rows;
    if (seq !== state.renderSeq) return;
    enhanceView(ctx);
  });
}

function enhanceView(ctx) {
  if (ctx.view === 'rfqs') enhanceRfqList(ctx);
  if (ctx.view === 'proposals') enhanceProposals(ctx);
  if (ctx.view === 'providers') enhanceProviders(ctx);
  if (ctx.view === 'contracts') import('./contracts.js').then(({ enhanceContracts }) => enhanceContracts(ctx, { initialViewId }));
  if (ctx.view === 'tasks') setTimeout(() => enhanceTasks(ctx), 300);
  if (ctx.view === 'rfq') import('./rfq-page.js').then(({ enhanceRfq }) => enhanceRfq(ctx, { lastListHref: () => lastListHref(ctx), markRestore: markRestore(ctx), focusButton }));
  if (ctx.view === 'newRfq') document.querySelector('.page-actions')?.prepend(focusButton());
  if (ctx.view === 'providerProposal') import('./provider-portal.js').then(({ enhanceProviderProposal }) => enhanceProviderProposal(ctx));
  if (['providerHome', 'providerRfqs'].includes(ctx.view)) import('./provider-portal.js').then(({ enhanceOpportunities }) => enhanceOpportunities(ctx));
  if (ctx.view === 'settings') import('./settings-architecture.js').then(({ organizeSettings }) => { organizeSettings({ openRestore: () => openRestore(ctx) }); enhanceProfileProvenance(ctx); if (/^#[a-z-]+$/.test(location.hash)) document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }); });
  if (ctx.view === 'settings' && /^#[a-z-]+$/.test(location.hash)) requestAnimationFrame(() => document.querySelector(location.hash)?.scrollIntoView({ block: 'start' }));
  installTray(ctx);
  restorePlace(ctx);
}

/** Perfil financeiro: de onde veio cada dado (Fonte · Atualizado · Responsável). */
function enhanceProfileProvenance(ctx) {
  const section = document.querySelector('#perfil');
  if (!section || section.querySelector('#provenance-table')) return;
  import('./integrations/center.js').then(({ provenanceTable }) => {
    if (section.querySelector('#provenance-table')) return;
    section.append(el('div', { class: 'provenance-wrap' }, [el('h3', { class: 'pref-section', text: 'Procedência dos dados' }),
      el('p', { class: 'pref-hint' }, ['Fonte, data e responsável de cada campo. ', el('a', { href: ctx.href('/finance/integrations.html#open-finance'), text: 'Conectar Open Finance (simulado)' })]),
      provenanceTable(ctx)]));
  });
}

// Pré-carrega a próxima página ao passar o mouse (navegação sem espera).
const prefetched = new Set();
function prefetch(href) {
  if (prefetched.has(href) || prefetched.size > 24) return;
  prefetched.add(href);
  document.head.append(el('link', { rel: 'prefetch', href, as: 'document' }));
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
  document.addEventListener('pointerover', (event) => {
    const link = event.target.closest?.('a[href^="/demo/"]');
    if (link && !link.target && link.origin === location.origin && link.pathname !== location.pathname) prefetch(link.pathname);
  }, { passive: true });
  addEventListener('popstate', () => { if (state.ctx?.view === 'rfqs') state.ctx.rerender(); });
  addEventListener('resize', () => syncShell(), { passive: true });
  prefs.subscribe(() => {
    if (state.ctx) { document.querySelector('.sidebar .side-personal')?.replaceWith(sidebarPersonal(state.ctx)); syncShell(); }
  });
}

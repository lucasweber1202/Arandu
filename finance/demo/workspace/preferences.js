// Preferências de interface da demonstração.
//
// Um único registro versionado no localStorage DESTE navegador guarda
// aparência, comportamento, layout do painel, favoritos, visões salvas,
// colunas de tabela e recentes. Nada aqui é dado de negócio: é preferência de
// tela. Nada sai do navegador, nada é lido de uma página real (/finance,
// /provider) e o registro é validado campo a campo antes de ser usado — um
// valor adulterado é descartado e o padrão volta.
//
// Versões do registro:
//   v1 (PR #86): aparência, painel, favoritos, visões de Solicitações, recentes.
//   v2: + densidade/barra "auto"/"hidden", preset, detalhe, comportamento,
//       visões de Contratos com filtro extra e colunas, colunas por tabela.
//   v3 (Workspace 2.0): o painel ganha o módulo "Em andamento" (processos com a
//       próxima ação) logo depois de "Precisa de você", inclusive em layouts
//       já personalizados. Nada é removido.
// As migrações v1 → v2 → v3 preservam tudo o que a pessoa já tinha escolhido.

export const WORKSPACE_KEY = 'arandu-demo-workspace';
export const WORKSPACE_VERSION = 3;

export const APPEARANCE_OPTIONS = Object.freeze({
  theme: ['light', 'dark', 'system'],
  density: ['auto', 'compact', 'comfortable', 'spacious'],
  sidebar: ['auto', 'expanded', 'compact', 'hidden'],
  motion: ['normal', 'reduced'],
  accent: ['indigo', 'blue', 'emerald', 'graphite', 'violet'],
  preset: ['balanced', 'compact', 'executive', 'operational', 'custom'],
  detail: ['full', 'essential']
});
export const DEFAULT_APPEARANCE = Object.freeze({ theme: 'light', density: 'auto', sidebar: 'auto', motion: 'normal', accent: 'indigo', preset: 'balanced', detail: 'full' });

export const BEHAVIOR_OPTIONS = Object.freeze({
  rfqClick: ['quick', 'page'],
  home: ['overview', 'rfqs', 'approvals'],
  afterCreate: ['stay', 'list']
});
export const DEFAULT_BEHAVIOR = Object.freeze({ rfqClick: 'quick', home: 'overview', afterCreate: 'stay' });

const ENTITY_TYPES = new Set(['rfq', 'contract', 'provider', 'proposal', 'approval', 'task']);
const FAVORITE_TYPES = new Set(['rfq', 'contract', 'provider']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODULE_ID = /^[a-z][a-z-]{1,23}$/;
const COLUMN_ID = /^[a-z][a-z-]{1,23}$/;
const VIEW_ID = /^v-[a-z0-9]{4,16}$/;
const PERSONAS = new Set(['buyer', 'approver', 'provider', 'admin']);
// Filtros que cada lista entende; nada além disso entra numa visão salva.
export const VIEW_PAGES = Object.freeze({
  rfqs: { params: ['q', 'status', 'product', 'owner', 'sort'], extras: ['', 'urgent', 'waiting'] },
  contracts: { params: [], extras: ['', 'renewal', 'active', 'ended'] }
});
export const VIEW_PARAMS = VIEW_PAGES.rfqs.params;
const LIMITS = { favorites: 24, savedViews: 24, recents: 10, columns: 12 };

const text = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : '');
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/** Mantém só os filtros conhecidos da página, na ordem canônica. */
export function cleanQuery(query, page = 'rfqs') {
  let params;
  try { params = new URLSearchParams(String(query || '').replace(/^\?/, '')); } catch { return ''; }
  const out = new URLSearchParams();
  for (const key of VIEW_PAGES[page]?.params || []) {
    const value = text(params.get(key) || '', 120);
    if (value) out.set(key, value);
  }
  return out.toString();
}

function sanitizeEntity(entry) {
  if (!entry || !ENTITY_TYPES.has(entry.type) || !UUID.test(String(entry.id))) return null;
  return { type: entry.type, id: entry.id, title: text(entry.title, 160) || 'Sem título', at: Number.isFinite(entry.at) ? entry.at : 0 };
}
function sanitizeLayout(layout) {
  if (!layout || typeof layout !== 'object') return null;
  const order = Array.isArray(layout.order) ? [...new Set(layout.order.filter((id) => MODULE_ID.test(String(id))))].slice(0, 40) : [];
  const hidden = Array.isArray(layout.hidden) ? [...new Set(layout.hidden.filter((id) => MODULE_ID.test(String(id))))].slice(0, 40) : [];
  const sizes = {};
  for (const [id, size] of Object.entries(layout.sizes || {})) if (MODULE_ID.test(id) && ['full', 'half'].includes(size)) sizes[id] = size;
  return { order, hidden, sizes };
}
const columns = (list) => (Array.isArray(list) ? [...new Set(list.filter((id) => COLUMN_ID.test(String(id))))].slice(0, LIMITS.columns) : []);
function sanitizeView(view) {
  if (!view || !VIEW_ID.test(String(view.id)) || !VIEW_PAGES[view.page]) return null;
  const name = text(view.name, 60);
  if (!name) return null;
  return { id: view.id, name, page: view.page, query: cleanQuery(view.query, view.page), extra: pick(view.extra ?? '', VIEW_PAGES[view.page].extras, ''),
    hiddenColumns: columns(view.hiddenColumns), pinned: view.pinned === true };
}

/** v2 → v3: "Em andamento" entra visível logo depois de "Precisa de você". */
function migrateV2(raw) {
  const dashboard = {};
  for (const [persona, layout] of Object.entries(raw.dashboard || {})) {
    if (!layout || typeof layout !== 'object' || !Array.isArray(layout.order) || layout.order.includes('inflight')) { dashboard[persona] = layout; continue; }
    const order = [...layout.order];
    const at = order.indexOf('attention');
    order.splice(at < 0 ? 0 : at + 1, 0, 'inflight');
    dashboard[persona] = { ...layout, order, hidden: (layout.hidden || []).filter((id) => id !== 'inflight') };
  }
  return { ...raw, version: 3, dashboard };
}

/** Converte registros antigos (v1, v2) no formato atual sem perder escolhas. */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') return {};
  if (raw.version === WORKSPACE_VERSION) return raw;
  if (raw.version === 2) return migrateV2(raw);
  if (raw.version === 1) {
    return migrateV2({
      ...raw,
      version: 2,
      // Quem já escolheu densidade e barra mantém; o preset vira "personalizado"
      // se algo foge do padrão antigo, para não sobrescrever a escolha.
      appearance: { ...raw.appearance, preset: raw.appearance && (raw.appearance.density !== 'comfortable' || raw.appearance.sidebar !== 'auto') ? 'custom' : 'balanced', detail: 'full' },
      behavior: { ...DEFAULT_BEHAVIOR },
      savedViews: (raw.savedViews || []).map((view) => ({ ...view, extra: '', hiddenColumns: [] })),
      tables: {}
    });
  }
  return {};
}

export function sanitize(raw) {
  const source = migrate(raw);
  const appearance = {};
  for (const [key, allowed] of Object.entries(APPEARANCE_OPTIONS)) appearance[key] = pick(source.appearance?.[key], allowed, DEFAULT_APPEARANCE[key]);
  const behavior = {};
  for (const [key, allowed] of Object.entries(BEHAVIOR_OPTIONS)) behavior[key] = pick(source.behavior?.[key], allowed, DEFAULT_BEHAVIOR[key]);
  const dashboard = {};
  for (const [persona, layout] of Object.entries(source.dashboard || {})) {
    if (!PERSONAS.has(persona)) continue;
    const clean = sanitizeLayout(layout);
    if (clean) dashboard[persona] = clean;
  }
  const seen = new Set();
  const favorites = (Array.isArray(source.favorites) ? source.favorites : []).map(sanitizeEntity).filter((entry) => {
    if (!entry || !FAVORITE_TYPES.has(entry.type)) return false;
    const key = `${entry.type}:${entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, LIMITS.favorites);
  const savedViews = (Array.isArray(source.savedViews) ? source.savedViews : []).map(sanitizeView).filter(Boolean).slice(0, LIMITS.savedViews);
  const recents = (Array.isArray(source.recents) ? source.recents : []).map(sanitizeEntity).filter(Boolean).slice(0, LIMITS.recents);
  const tables = {};
  for (const page of Object.keys(VIEW_PAGES)) if (source.tables?.[page]) tables[page] = { hidden: columns(source.tables[page].hidden) };
  return { version: WORKSPACE_VERSION, appearance, behavior, shell: { focus: source.shell?.focus === true }, dashboard, favorites, savedViews, recents, tables };
}

// ------------------------------------------------------------------ store
let storage = null;
try { storage = globalThis.localStorage || null; } catch { storage = null; }
let cache = null;
const listeners = new Set();

export function readState() {
  if (cache) return cache;
  let parsed = null;
  try { parsed = JSON.parse(storage?.getItem(WORKSPACE_KEY) || 'null'); } catch { parsed = null; }
  cache = sanitize(parsed);
  // Registro antigo (v1, v2) é regravado já migrado: a próxima leitura é direta.
  if (parsed && [1, 2].includes(parsed.version)) { try { storage?.setItem(WORKSPACE_KEY, JSON.stringify(cache)); } catch { /* segue em memória */ } }
  return cache;
}

function persist(state) {
  cache = sanitize(state);
  try { storage?.setItem(WORKSPACE_KEY, JSON.stringify(cache)); } catch { /* segue só em memória */ }
  for (const listener of listeners) listener(cache);
  return cache;
}

/** Aplica uma alteração (função que recebe um rascunho) e grava. */
export function update(mutator) {
  const draft = structuredClone(readState());
  mutator(draft);
  return persist(draft);
}
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }

export function setAppearance(key, value, { keepPreset = false } = {}) {
  if (!APPEARANCE_OPTIONS[key]?.includes(value)) return readState();
  const next = update((draft) => {
    draft.appearance[key] = value;
    // Mudar à mão algo que um preset controla vira "personalizado".
    if (!keepPreset && ['density', 'sidebar', 'detail'].includes(key)) draft.appearance.preset = 'custom';
  });
  applyAppearance(next);
  return next;
}
export function setBehavior(key, value) {
  if (!BEHAVIOR_OPTIONS[key]?.includes(value)) return readState();
  return update((draft) => { draft.behavior[key] = value; });
}
export function setFocus(on) {
  const next = update((draft) => { draft.shell.focus = Boolean(on); });
  applyAppearance(next);
  return next;
}

export function resetAppearanceAndLayout() {
  const next = update((draft) => {
    draft.appearance = { ...DEFAULT_APPEARANCE };
    draft.behavior = { ...DEFAULT_BEHAVIOR };
    draft.shell = { focus: false };
    draft.dashboard = {};
    draft.tables = {};
  });
  applyAppearance(next);
  return next;
}
/** Apaga tudo o que é preferência de tela. */
export function resetWorkspace() {
  cache = null;
  try { storage?.removeItem(WORKSPACE_KEY); } catch { /* nada guardado */ }
  const next = readState();
  applyAppearance(next);
  for (const listener of listeners) listener(next);
  return next;
}

// --------------------------------------------------------------- favoritos
export function isFavorite(type, id) { return readState().favorites.some((entry) => entry.type === type && entry.id === id); }
export function toggleFavorite(type, id, title) {
  const on = !isFavorite(type, id);
  update((draft) => {
    draft.favorites = draft.favorites.filter((entry) => !(entry.type === type && entry.id === id));
    if (on) draft.favorites.unshift({ type, id, title, at: Date.now() });
  });
  return on;
}
export function recordRecent(type, id, title) {
  if (!ENTITY_TYPES.has(type) || !UUID.test(String(id))) return;
  update((draft) => {
    draft.recents = [{ type, id, title, at: Date.now() }, ...draft.recents.filter((entry) => !(entry.type === type && entry.id === id))];
  });
}

// ---------------------------------------------------------------- visões
const newViewId = () => `v-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 18);
export function saveView({ name, page = 'rfqs', query = '', extra = '', hiddenColumns = [] }) {
  const id = newViewId();
  update((draft) => { draft.savedViews.push({ id, name, page, query: cleanQuery(query, page), extra, hiddenColumns, pinned: false }); });
  return id;
}
export function editView(id, changes) {
  update((draft) => {
    const view = draft.savedViews.find((item) => item.id === id);
    if (!view) return;
    if (changes.name !== undefined) view.name = changes.name;
    if (changes.query !== undefined) view.query = cleanQuery(changes.query, view.page);
    if (changes.extra !== undefined) view.extra = changes.extra;
    if (changes.hiddenColumns !== undefined) view.hiddenColumns = changes.hiddenColumns;
  });
}
export function removeView(id) { update((draft) => { draft.savedViews = draft.savedViews.filter((view) => view.id !== id); }); }
export function restoreView(view, index) { update((draft) => { draft.savedViews.splice(Math.min(index, draft.savedViews.length), 0, view); }); }
export function toggleViewPin(id) { update((draft) => { const view = draft.savedViews.find((item) => item.id === id); if (view) view.pinned = !view.pinned; }); }

// ----------------------------------------------------------------- tabelas
export function hiddenColumns(page) { return readState().tables[page]?.hidden || []; }
export function setHiddenColumns(page, hidden) { update((draft) => { draft.tables[page] = { hidden }; }); }

// ---------------------------------------------------------------- painel
export function dashboardLayout(persona) { return readState().dashboard[persona] || null; }
export function saveDashboardLayout(persona, layout, { keepPreset = false } = {}) {
  update((draft) => { draft.dashboard[persona] = layout; if (!keepPreset) draft.appearance.preset = 'custom'; });
}
export function resetDashboardLayout(persona) { update((draft) => { delete draft.dashboard[persona]; }); }

// --------------------------------------------------------------- aparência
const media = (query) => (typeof matchMedia === 'function' ? matchMedia(query) : null);
export function systemPrefersDark() { return Boolean(media('(prefers-color-scheme: dark)')?.matches); }
export function systemPrefersReducedMotion() { return Boolean(media('(prefers-reduced-motion: reduce)')?.matches); }
const matches = (query) => media(query)?.matches === true;

/** Densidade automática: confortável em telas grandes e tablets, compacta em notebooks. */
export function resolveDensity(pref) {
  if (pref !== 'auto') return pref;
  return matches('(min-width: 1100px) and (max-width: 1439px)') ? 'compact' : 'comfortable';
}
/** Barra automática: expandida a partir de 1280 px, compacta abaixo. */
export function resolveSidebar(pref) {
  if (pref !== 'auto') return pref;
  return media('(min-width: 1280px)')?.matches === false ? 'compact' : 'expanded';
}

/**
 * Escreve a aparência como atributos no <html>. O CSS da demonstração
 * (finance/demo/experience.css) traduz cada atributo em tokens.
 */
export function applyAppearance(state = readState(), root = globalThis.document?.documentElement) {
  if (!root) return;
  const { appearance, shell } = state;
  const theme = appearance.theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : appearance.theme;
  root.classList.add('dw');
  root.dataset.theme = theme;
  root.dataset.themePref = appearance.theme;
  root.dataset.density = resolveDensity(appearance.density);
  root.dataset.densityPref = appearance.density;
  root.dataset.sidebar = appearance.sidebar;
  root.dataset.sidebarState = resolveSidebar(appearance.sidebar);
  root.dataset.motion = appearance.motion === 'reduced' || systemPrefersReducedMotion() ? 'reduced' : 'normal';
  root.dataset.accent = appearance.accent;
  root.dataset.preset = appearance.preset;
  root.dataset.detail = appearance.detail;
  root.dataset.focus = shell.focus ? 'on' : 'off';
  const meta = globalThis.document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d1015' : '#f7f7f5');
}

let watching = false;
/** Acompanha o sistema (tema, movimento, largura) e outras abas da mesma demonstração. */
export function watchEnvironment() {
  if (watching) return;
  watching = true;
  const reapply = () => applyAppearance();
  media('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => { if (readState().appearance.theme === 'system') reapply(); });
  for (const query of ['(prefers-reduced-motion: reduce)', '(min-width: 1280px)', '(min-width: 1100px) and (max-width: 1439px)']) media(query)?.addEventListener?.('change', reapply);
  globalThis.addEventListener?.('storage', (event) => {
    if (event.key !== WORKSPACE_KEY) return;
    cache = null;
    const next = readState();
    applyAppearance(next);
    for (const listener of listeners) listener(next);
  });
}

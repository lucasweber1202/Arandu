// Preferências de interface da demonstração.
//
// Um único registro versionado no localStorage DESTE navegador guarda
// aparência, layout do painel, favoritos, visualizações salvas e recentes.
// Nada aqui é dado de negócio: é preferência de tela. Nada sai do navegador,
// nada é lido de uma página real (/finance, /provider) e o registro é
// validado campo a campo antes de ser usado — um valor adulterado é
// descartado e o padrão volta.

export const WORKSPACE_KEY = 'arandu-demo-workspace';
export const WORKSPACE_VERSION = 1;

export const APPEARANCE_OPTIONS = Object.freeze({
  theme: ['light', 'dark', 'system'],
  density: ['compact', 'comfortable', 'spacious'],
  sidebar: ['expanded', 'compact', 'auto'],
  motion: ['normal', 'reduced'],
  accent: ['indigo', 'blue', 'emerald', 'graphite', 'violet']
});
export const DEFAULT_APPEARANCE = Object.freeze({ theme: 'light', density: 'comfortable', sidebar: 'auto', motion: 'normal', accent: 'indigo' });

const ENTITY_TYPES = new Set(['rfq', 'contract', 'provider', 'proposal']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODULE_ID = /^[a-z][a-z-]{1,23}$/;
const VIEW_ID = /^v-[a-z0-9]{4,16}$/;
const PERSONAS = new Set(['buyer', 'approver', 'provider', 'admin']);
// Filtros que a lista de solicitações entende; nada além disso entra numa visualização salva.
export const VIEW_PARAMS = Object.freeze(['q', 'status', 'product', 'owner', 'sort']);
const LIMITS = { favorites: 24, savedViews: 20, recents: 10 };

const text = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, '').trim().slice(0, max) : '');
const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/** Mantém só os filtros conhecidos, na ordem canônica. */
export function cleanQuery(query) {
  let params;
  try { params = new URLSearchParams(String(query || '').replace(/^\?/, '')); } catch { return ''; }
  const out = new URLSearchParams();
  for (const key of VIEW_PARAMS) {
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

export function sanitize(raw) {
  const source = raw && typeof raw === 'object' && raw.version === WORKSPACE_VERSION ? raw : {};
  const appearance = {};
  for (const [key, allowed] of Object.entries(APPEARANCE_OPTIONS)) appearance[key] = pick(source.appearance?.[key], allowed, DEFAULT_APPEARANCE[key]);
  const dashboard = {};
  for (const [persona, layout] of Object.entries(source.dashboard || {})) {
    if (!PERSONAS.has(persona)) continue;
    const clean = sanitizeLayout(layout);
    if (clean) dashboard[persona] = clean;
  }
  const seen = new Set();
  const favorites = (Array.isArray(source.favorites) ? source.favorites : []).map(sanitizeEntity).filter((entry) => {
    if (!entry || entry.type === 'proposal') return false;
    const key = `${entry.type}:${entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, LIMITS.favorites);
  const savedViews = (Array.isArray(source.savedViews) ? source.savedViews : []).map((view) => {
    if (!view || !VIEW_ID.test(String(view.id)) || view.page !== 'rfqs') return null;
    const name = text(view.name, 60);
    return name ? { id: view.id, name, page: 'rfqs', query: cleanQuery(view.query), pinned: view.pinned === true } : null;
  }).filter(Boolean).slice(0, LIMITS.savedViews);
  const recents = (Array.isArray(source.recents) ? source.recents : []).map(sanitizeEntity).filter(Boolean).slice(0, LIMITS.recents);
  return { version: WORKSPACE_VERSION, appearance, shell: { focus: source.shell?.focus === true }, dashboard, favorites, savedViews, recents };
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

export function setAppearance(key, value) {
  if (!APPEARANCE_OPTIONS[key]?.includes(value)) return readState();
  const next = update((draft) => { draft.appearance[key] = value; });
  applyAppearance(next);
  return next;
}
export function setFocus(on) {
  const next = update((draft) => { draft.shell.focus = Boolean(on); });
  applyAppearance(next);
  return next;
}

export function resetAppearanceAndLayout() {
  const next = update((draft) => {
    draft.appearance = { ...DEFAULT_APPEARANCE };
    draft.shell = { focus: false };
    draft.dashboard = {};
  });
  applyAppearance(next);
  return next;
}
/** Apaga tudo o que é preferência de tela (aparência, layout, favoritos, visualizações e recentes). */
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

// ---------------------------------------------------------- visualizações
export function saveView(name, query) {
  const id = `v-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(0, 18);
  update((draft) => { draft.savedViews.push({ id, name, page: 'rfqs', query: cleanQuery(query), pinned: false }); });
  return id;
}
export function removeView(id) { update((draft) => { draft.savedViews = draft.savedViews.filter((view) => view.id !== id); }); }
export function restoreView(view, index) { update((draft) => { draft.savedViews.splice(Math.min(index, draft.savedViews.length), 0, view); }); }
export function toggleViewPin(id) { update((draft) => { const view = draft.savedViews.find((item) => item.id === id); if (view) view.pinned = !view.pinned; }); }

// ---------------------------------------------------------------- painel
export function dashboardLayout(persona) { return readState().dashboard[persona] || null; }
export function saveDashboardLayout(persona, layout) { update((draft) => { draft.dashboard[persona] = layout; }); }
export function resetDashboardLayout(persona) { update((draft) => { delete draft.dashboard[persona]; }); }

// --------------------------------------------------------------- aparência
const media = (query) => (typeof matchMedia === 'function' ? matchMedia(query) : null);
export function systemPrefersDark() { return Boolean(media('(prefers-color-scheme: dark)')?.matches); }
export function systemPrefersReducedMotion() { return Boolean(media('(prefers-reduced-motion: reduce)')?.matches); }

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
  root.dataset.density = appearance.density;
  root.dataset.sidebar = appearance.sidebar;
  // "Automática": expandida em telas largas, compacta em notebooks.
  root.dataset.sidebarState = appearance.sidebar === 'auto' ? (media('(min-width: 1280px)')?.matches === false ? 'compact' : 'expanded') : appearance.sidebar;
  root.dataset.motion = appearance.motion === 'reduced' || systemPrefersReducedMotion() ? 'reduced' : 'normal';
  root.dataset.accent = appearance.accent;
  root.dataset.focus = shell.focus ? 'on' : 'off';
  const meta = globalThis.document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#0d1015' : '#f6f7f9');
}

let watching = false;
/** Acompanha o sistema (tema/movimento) e outras abas da mesma demonstração. */
export function watchEnvironment() {
  if (watching) return;
  watching = true;
  media('(prefers-color-scheme: dark)')?.addEventListener?.('change', () => { if (readState().appearance.theme === 'system') applyAppearance(); });
  media('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', () => applyAppearance());
  media('(min-width: 1280px)')?.addEventListener?.('change', () => applyAppearance());
  globalThis.addEventListener?.('storage', (event) => {
    if (event.key !== WORKSPACE_KEY) return;
    cache = null;
    const next = readState();
    applyAppearance(next);
    for (const listener of listeners) listener(next);
  });
}

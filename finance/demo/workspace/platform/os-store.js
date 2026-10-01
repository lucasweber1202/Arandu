// Registro local do "Work OS" da demonstração.
//
// Fonte única do que NÃO é dado financeiro do motor: integrações simuladas,
// políticas de aprovação versionadas, comentários de proposta/aprovação/
// contrato, notificações do centro, diretório corporativo, procedência de
// dados, feature flags, analytics local, linha do tempo da sessão, medições de
// desempenho, fila offline e conflitos. O dado financeiro (solicitações,
// propostas, aprovações, contratos) continua vindo do motor fictício
// (finance/demo/engine.js) — nada aqui o duplica.
//
// Tudo fica neste navegador, sob uma chave própria, versionada e validada.
// Registro adulterado ou de outra versão volta ao conjunto inicial.

export const OS_KEY = 'arandu-demo-os';
export const OS_VERSION = 1;
const CAPS = { comments: 200, notifications: 200, analytics: 600, session: 200, perf: 200, outbox: 50, audit: 300, recentSearches: 8, templates: 20 };

let storage = null;
try { storage = globalThis.localStorage || null; } catch { storage = null; }
let cache = null;
const listeners = new Set();

/** Conjunto inicial: coerente com o motor (mesmas pessoas, mesmos processos). */
export function initialState() {
  return {
    version: OS_VERSION,
    integrations: {},
    // Política v2 foi a que valeu para os processos em andamento; v3 já está publicada.
    policies: {
      current: 3,
      versions: [
        { version: 1, published_at: '2026-03-02T12:00:00Z', published_by: 'Helena Prado', note: 'Primeira política: toda decisão de crédito passa pelo CFO.',
          rules: [{ id: 'r-credit', name: 'Crédito', active: true, product: 'credit', condition: null, stages: ['cfo'] }] },
        { version: 2, published_at: '2026-06-15T12:00:00Z', published_by: 'Helena Prado', note: 'Crédito acima de R$ 1 milhão passa também pela Controladoria.',
          rules: [
            { id: 'r-credit-large', name: 'Crédito acima de R$ 1 milhão', active: true, product: 'credit', condition: { field: 'amount', op: 'gt', value: 1000000 }, stages: ['controller', 'cfo'] },
            { id: 'r-credit', name: 'Crédito até R$ 1 milhão', active: true, product: 'credit', condition: null, stages: ['cfo'] },
            { id: 'r-acquiring', name: 'Adquirência', active: true, product: 'acquiring', condition: null, stages: ['treasury', 'controller'] }
          ] },
        { version: 3, published_at: '2026-09-20T12:00:00Z', published_by: 'Helena Prado', note: 'Crédito acima de R$ 5 milhões exige também o CEO.',
          rules: [
            { id: 'r-credit-xl', name: 'Crédito acima de R$ 5 milhões', active: true, product: 'credit', condition: { field: 'amount', op: 'gt', value: 5000000 }, stages: ['controller', 'cfo', 'ceo'] },
            { id: 'r-credit-large', name: 'Crédito acima de R$ 1 milhão', active: true, product: 'credit', condition: { field: 'amount', op: 'gt', value: 1000000 }, stages: ['controller', 'cfo'] },
            { id: 'r-credit', name: 'Crédito até R$ 1 milhão', active: true, product: 'credit', condition: null, stages: ['cfo'] },
            { id: 'r-acquiring', name: 'Adquirência', active: true, product: 'acquiring', condition: null, stages: ['treasury', 'controller'] }
          ] }
      ],
      draft: null,
      // Versão com que cada processo começou (processos em andamento ficaram na v2).
      byRfq: { 'de000000-0000-4000-8000-000400000001': 2, 'de000000-0000-4000-8000-000400000008': 2, 'de000000-0000-4000-8000-000400000005': 2 }
    },
    comments: [
      { id: 'c-seed-1', object_type: 'approval', object_id: 'de000000-0000-4000-8000-000700000001', author: 'Helena Prado', author_id: 'de000000-0000-4000-8000-000100000003',
        body: 'Garantias conferidas com o jurídico; a cessão de 30% está dentro do limite que combinamos com @Ricardo Alves.', scope: 'internal', mentions: ['de000000-0000-4000-8000-000100000002'], resolved: false, at: '2026-09-29T14:00:00Z' }
    ],
    notifications: [],
    directory: { provider: null, connected: false, users: [], groups: [], mappings: { 'Finance-Team': 'buyer', CFO: 'approver', 'Procurement-Admin': 'admin' } },
    profile: { provenance: {}, openFinance: null },
    erp: { provider: null, imported: null },
    flags: {},
    analytics: [],
    session: [],
    perf: [],
    outbox: [],
    network: 'online',
    conflict: null,
    audit: [],
    templates: [],
    recentSearches: [],
    presenceSeed: 1
  };
}

const arr = (value, cap) => (Array.isArray(value) ? value.slice(-cap) : []);
const obj = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export function sanitize(raw) {
  const base = initialState();
  if (!raw || typeof raw !== 'object' || raw.version !== OS_VERSION) return base;
  const policies = obj(raw.policies);
  return {
    ...base,
    integrations: obj(raw.integrations),
    policies: Array.isArray(policies.versions) && policies.versions.length ? { current: Number(policies.current) || policies.versions.length, versions: policies.versions, draft: policies.draft || null, byRfq: obj(policies.byRfq) } : base.policies,
    comments: arr(raw.comments, CAPS.comments),
    notifications: arr(raw.notifications, CAPS.notifications),
    directory: { ...base.directory, ...obj(raw.directory) },
    profile: { ...base.profile, ...obj(raw.profile) },
    erp: { ...base.erp, ...obj(raw.erp) },
    flags: obj(raw.flags),
    analytics: arr(raw.analytics, CAPS.analytics),
    session: arr(raw.session, CAPS.session),
    perf: arr(raw.perf, CAPS.perf),
    outbox: arr(raw.outbox, CAPS.outbox),
    network: raw.network === 'offline' ? 'offline' : 'online',
    conflict: raw.conflict && typeof raw.conflict === 'object' ? raw.conflict : null,
    audit: arr(raw.audit, CAPS.audit),
    templates: arr(raw.templates, CAPS.templates),
    recentSearches: arr(raw.recentSearches, CAPS.recentSearches).filter((value) => typeof value === 'string')
  };
}

export function readOS() {
  if (cache) return cache;
  let parsed = null;
  try { parsed = JSON.parse(storage?.getItem(OS_KEY) || 'null'); } catch { parsed = null; }
  cache = sanitize(parsed);
  return cache;
}
function persist(state) {
  for (const [key, cap] of Object.entries(CAPS)) if (Array.isArray(state[key])) state[key] = state[key].slice(-cap);
  cache = state;
  try { storage?.setItem(OS_KEY, JSON.stringify(state)); } catch { /* segue em memória */ }
  for (const listener of listeners) listener(state);
  return state;
}
/** Aplica uma alteração num rascunho e grava. */
export function updateOS(mutator) {
  const draft = structuredClone(readOS());
  mutator(draft);
  return persist(draft);
}
export function subscribeOS(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function resetOS() {
  cache = null;
  try { storage?.removeItem(OS_KEY); } catch { /* nada guardado */ }
  const next = readOS();
  for (const listener of listeners) listener(next);
  return next;
}
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('storage', (event) => {
    if (event.key !== OS_KEY) return;
    cache = null;
    const next = readOS();
    for (const listener of listeners) listener(next);
  });
}
export const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

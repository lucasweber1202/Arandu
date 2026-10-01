// Transporte local-first da demonstração (stale-while-revalidate + fila offline).
//
// Envolve o motor fictício (finance/demo/engine.js) sem mudar suas regras:
//   GET    responde na hora com o último resultado conhecido (memória e
//          sessionStorage desta aba) e revalida em segundo plano; se o motor
//          devolver algo diferente, avisa a camada ('sync.revalidated').
//   escrita passa direto ao motor, limpa o cache e avisa ('data.changed').
//   offline (simulado) escritas do produto são recusadas com mensagem útil;
//          ações da própria camada (aprovar na caixa, comentar) vão para a
//          fila e são enviadas ao reconectar.
// Carregado por finance/app.js SOMENTE em /demo de um build demonstrativo.

import { emit } from './bus.js';
import { readOS } from './os-store.js';

const CACHE_KEY = 'arandu-demo-swr';
const MAX_ENTRIES = 60;
const clone = (value) => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
const stats = { hits: 0, misses: 0, revalidations: 0, changed: 0 };

function loadSession() {
  try { return new Map(Object.entries(JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}'))); } catch { return new Map(); }
}
function saveSession(map) {
  try {
    const entries = [...map.entries()].slice(-MAX_ENTRIES);
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* cota: fica só em memória */ }
}
let active = null;
export function clearCache() { active?.clear(); try { sessionStorage.removeItem(CACHE_KEY); } catch { /* nada */ } }
export const cacheStats = () => ({ ...stats, entries: active?.size() || 0 });

export function withLocalFirst(engine) {
  let cache = loadSession();
  const keyOf = (path) => `${engine.persona?.()?.key || 'anon'}|${path}`;
  const invalidate = () => { cache = new Map(); try { sessionStorage.removeItem(CACHE_KEY); } catch { /* nada */ } };
  active = { clear: () => { cache = new Map(); }, size: () => cache.size };
  // Outra aba mudou o estado fictício: o cache desta aba deixa de valer.
  globalThis.addEventListener?.('storage', (event) => { if (event.key === engine.storageKey) invalidate(); });

  async function revalidate(path, options, key, previous) {
    stats.revalidations += 1;
    try {
      const fresh = await engine.request(path, options);
      const changed = JSON.stringify(fresh) !== JSON.stringify(previous);
      cache.set(key, fresh);
      saveSession(cache);
      if (changed) { stats.changed += 1; emit('sync.revalidated', { detail: { path }, audit: false }); }
    } catch { /* revalidação silenciosa: o dado em cache continua valendo */ }
  }

  const transport = Object.create(engine);
  Object.assign(transport, {
    localFirst: true,
    async request(path, options = {}) {
      const method = String(options.method || 'GET').toUpperCase();
      if (method === 'GET') {
        const key = keyOf(path);
        if (cache.has(key)) {
          stats.hits += 1;
          const value = cache.get(key);
          setTimeout(() => revalidate(path, options, key, value), 0);
          return clone(value);
        }
        stats.misses += 1;
        const value = await engine.request(path, options);
        cache.set(key, value);
        saveSession(cache);
        return clone(value);
      }
      if (readOS().network === 'offline') {
        const error = new Error('Você está offline (simulado). Esta ação precisa de conexão: nada foi enviado. Aprovações e comentários feitos pela caixa ficam na fila e sobem ao reconectar.');
        error.status = 0;
        error.code = 'demo_offline';
        throw error;
      }
      const result = await engine.request(path, options);
      invalidate();
      emit('data.changed', { detail: { path, method }, audit: false });
      return result;
    },
    setPersona(key) { invalidate(); return engine.setPersona(key); },
    reset() { invalidate(); return engine.reset(); },
    invalidate
  });
  return transport;
}

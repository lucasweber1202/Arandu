// Estado de sincronização visível: sincronizado · sincronizando · offline · falha.
//
// Ações otimistas da camada (aprovar na caixa, comentar, concluir tarefa)
// mudam a tela na hora e sobem em segundo plano. Com a rede "desligada"
// (simulação), elas entram na fila local — "3 alterações aguardando
// sincronização" — e são enviadas em ordem ao reconectar. Uma falha mantém o
// item na fila com a mensagem e "Tentar novamente"; nada é perdido.

import { el, icon } from '../../../src/core.js';
import { readOS, updateOS, subscribeOS, uid } from './os-store.js';
import { emit, on } from './bus.js';
import { popover } from '../popover.js';

const executors = new Map();
const state = { inflight: 0, error: null, ctx: null, lastSync: Date.now() };
const listeners = new Set();
const notify = () => { for (const listener of listeners) listener(status()); };

export function registerExecutor(kind, run) { executors.set(kind, run); }
export const isOffline = () => readOS().network === 'offline';
export function status() {
  const pending = readOS().outbox.length;
  return { network: readOS().network, pending, inflight: state.inflight, error: state.error, lastSync: state.lastSync,
    label: state.error ? 'Falha ao sincronizar' : isOffline() ? (pending ? `Offline · ${pending} ${pending === 1 ? 'alteração aguardando' : 'alterações aguardando'} sincronização` : 'Offline · alterações ficam neste dispositivo')
      : state.inflight || pending ? 'Sincronizando…' : 'Sincronizado' };
}
export function onStatus(listener) { listeners.add(listener); return () => listeners.delete(listener); }

/**
 * Executa uma ação otimista: `apply` muda a tela já; `kind/payload` é o que
 * sobe. Offline → fila. Falha → `rollback` e mensagem útil.
 */
export async function optimistic({ kind, payload, label, apply = null, rollback = null, ctx = state.ctx }) {
  const started = performance.now();
  apply?.();
  const applied = performance.now() - started;
  if (isOffline()) {
    updateOS((draft) => { draft.outbox.push({ id: uid('ob'), kind, payload, label, at: new Date().toISOString() }); });
    emit('sync.queued', { detail: { kind, label }, audit: false });
    notify();
    return { queued: true, applied };
  }
  state.inflight += 1;
  notify();
  try {
    const run = executors.get(kind);
    if (!run) throw new Error(`Ação sem executor: ${kind}`);
    const result = await run(ctx, payload);
    state.error = null;
    state.lastSync = Date.now();
    return { queued: false, applied, result };
  } catch (error) {
    rollback?.(error);
    state.error = error.message;
    throw error;
  } finally {
    state.inflight -= 1;
    notify();
  }
}

/** Envia a fila em ordem; o que falhar fica, com o motivo. */
export async function flush(ctx = state.ctx) {
  if (isOffline()) return { sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const item of [...readOS().outbox]) {
    state.inflight += 1;
    notify();
    try {
      await executors.get(item.kind)?.(ctx, item.payload);
      updateOS((draft) => { draft.outbox = draft.outbox.filter((entry) => entry.id !== item.id); });
      sent += 1;
    } catch (error) {
      failed += 1;
      state.error = `${item.label}: ${error.message}`;
      updateOS((draft) => { const entry = draft.outbox.find((row) => row.id === item.id); if (entry) entry.error = error.message; });
    } finally {
      state.inflight -= 1;
      notify();
    }
  }
  if (!failed) { state.error = null; state.lastSync = Date.now(); }
  emit('sync.flushed', { detail: { sent, failed }, audit: false });
  notify();
  return { sent, failed };
}
export function setNetwork(mode, ctx = state.ctx) {
  updateOS((draft) => { draft.network = mode === 'offline' ? 'offline' : 'online'; });
  notify();
  if (mode !== 'offline') return flush(ctx);
  return Promise.resolve({ sent: 0, failed: 0 });
}

const ago = (time) => { const seconds = Math.round((Date.now() - time) / 1000); return seconds < 10 ? 'agora' : seconds < 60 ? `há ${seconds} s` : `há ${Math.round(seconds / 60)} min`; };

/** Indicador na topbar + painel com a fila e a simulação de rede. */
let indicator = null;
export function syncIndicator(ctx) {
  state.ctx = ctx;
  // Um só indicador por página: trocar de persona reaproveita o mesmo nó e os mesmos ouvintes.
  if (indicator) return indicator;
  const wrap = el('div', { class: 'dw-anchor sync-anchor' });
  const dot = el('span', { class: 'sync-dot', 'aria-hidden': 'true' });
  const text = el('span', { class: 'sync-text' });
  const trigger = el('button', { type: 'button', class: 'sync-pill', id: 'sync-indicator' }, [dot, text]);
  const live = el('span', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const list = el('ul', { class: 'sync-list', role: 'list' });
  const toggle = el('button', { type: 'button', class: 'btn btn-sm', id: 'network-toggle' });
  const retry = el('button', { type: 'button', class: 'btn btn-sm btn-ghost', id: 'sync-retry', hidden: true }, el('span', { class: 'btn-label', text: 'Tentar novamente' }));
  const meta = el('p', { class: 'sync-meta' });
  const panel = el('div', { class: 'dw-panel sync-panel', 'aria-labelledby': 'sync-title' }, [
    el('h2', { class: 'dw-panel-title', id: 'sync-title', text: 'Sincronização' }), meta, list,
    el('div', { class: 'dw-panel-actions' }, [toggle, retry]),
    el('p', { class: 'sync-note', text: 'Simulação da demonstração: a "rede" é local. Nada sai deste navegador.' })
  ]);
  popover({ trigger, panel, role: 'dialog' });
  toggle.addEventListener('click', () => setNetwork(isOffline() ? 'online' : 'offline', ctx));
  retry.addEventListener('click', () => flush(ctx));
  let previous = '';
  const draw = () => {
    const current = status();
    const key = current.error ? 'error' : current.network === 'offline' ? 'offline' : current.inflight || current.pending ? 'syncing' : 'synced';
    wrap.dataset.sync = key;
    document.documentElement.dataset.network = current.network;
    text.textContent = key === 'synced' ? 'Sincronizado' : key === 'syncing' ? 'Sincronizando…' : key === 'offline' ? (current.pending ? `Offline · ${current.pending}` : 'Offline') : 'Falha';
    trigger.setAttribute('aria-label', `${current.label}. Ver detalhes`);
    if (current.label !== previous) { live.textContent = current.label; previous = current.label; }
    meta.textContent = current.error ? current.error : current.network === 'offline' ? current.label : `Última sincronização: ${ago(current.lastSync)}.`;
    list.replaceChildren(...readOS().outbox.map((item) => el('li', { class: `sync-item${item.error ? ' is-error' : ''}` }, [icon(item.error ? 'alert' : 'clock', { size: 13 }), el('span', { text: item.label }), item.error ? el('span', { class: 'sync-error', text: item.error }) : null])));
    toggle.replaceChildren(icon(current.network === 'offline' ? 'refresh' : 'x', { size: 14 }), el('span', { class: 'btn-label', text: current.network === 'offline' ? 'Reconectar' : 'Simular offline' }));
    retry.hidden = !(current.error && current.network === 'online' && current.pending);
  };
  onStatus(draw);
  subscribeOS(draw);
  on('sync.revalidated', () => { state.lastSync = Date.now(); draw(); });
  setInterval(draw, 15000);
  draw();
  wrap.append(trigger, panel, live);
  indicator = wrap;
  return wrap;
}

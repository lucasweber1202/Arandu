// Camada de eventos local da demonstração (delta model).
//
//   ação → emit('approval.approved', { object, actor, origin, detail })
//        → registro de auditoria (os-store: audit)
//        → assinantes nesta aba (fila, inbox, notificações, analytics, atividade)
//        → outras abas da mesma demo (BroadcastChannel)
//
// Não é a arquitetura de sincronização de um produto real: é o efeito — uma
// mudança num objeto e todas as superfícies que o mostram reagem, sem reload.
// Todo evento tem pessoa, ação, momento, objeto e origem (web, Slack, ERP,
// Open Finance, automação).

import { readOS, updateOS, uid } from './os-store.js';

export const EVENT_TYPES = /* @__PURE__ */ Object.freeze([
  'rfq.updated', 'rfq.created', 'proposal.submitted', 'approval.requested', 'approval.approved', 'approval.rejected', 'approval.changes_requested',
  'approval.opened', 'contract.created', 'comment.created', 'comment.resolved', 'mention.created', 'integration.connected', 'integration.disconnected',
  'integration.synced', 'directory.imported', 'erp.imported', 'financial_profile.updated', 'policy.published', 'policy.draft_saved',
  'sync.queued', 'sync.flushed', 'sync.revalidated', 'sync.conflict', 'sync.conflict_resolved', 'data.changed', 'task.completed', 'flag.changed', 'notification.read'
]);
export const ORIGINS = /* @__PURE__ */ Object.freeze({ web: 'Web', slack: 'Slack', teams: 'Microsoft Teams', erp: 'ERP', open_finance: 'Open Finance', automation: 'Automação', directory: 'Diretório' });

const listeners = new Map();
let channel = null;
try { channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('arandu-demo-bus') : null; channel?.unref?.(); } catch { channel = null; }

function dispatch(event) {
  for (const key of [event.type, '*']) for (const listener of listeners.get(key) || []) {
    try { listener(event); } catch (error) { console.error(error); }
  }
}
channel?.addEventListener('message', (message) => { if (message.data?.type) dispatch({ ...message.data, remote: true }); });

// Eventos efêmeros (fila, revalidação, dados alterados) não entram na auditoria; conflitos entram.
const EPHEMERAL = new Set(['sync.queued', 'sync.flushed', 'sync.revalidated', 'data.changed', 'notification.read']);
/** Registra e distribui um evento. */
export function emit(type, { object = null, actor = null, origin = 'web', detail = null, audit = true } = {}) {
  const event = { id: uid('ev'), type, at: new Date().toISOString(), object, actor, origin, detail };
  if (audit && !EPHEMERAL.has(type)) updateOS((draft) => { draft.audit.push(event); });
  dispatch(event);
  try { channel?.postMessage(event); } catch { /* sem canal */ }
  return event;
}
// Ouvinte com dono (nó da tela): sai sozinho quando o nó, depois de montado,
// deixa o documento. A varredura roda a cada nova inscrição, então re-render
// nenhum acumula ouvintes — mesmo sem evento algum no meio.
const owners = new WeakMap();
function sweep() {
  for (const set of listeners.values()) for (const listener of set) {
    const owner = owners.get(listener);
    if (!owner) continue;
    if (owner.node.isConnected) owner.mounted = true;
    else if (owner.mounted) set.delete(listener);
  }
}
export function on(type, listener, { owner = null } = {}) {
  sweep();
  if (!listeners.has(type)) listeners.set(type, new Set());
  if (owner) {
    const record = { node: owner, mounted: false };
    owners.set(listener, record);
    // A tela anexa o nó no mesmo ciclo: no próximo quadro ele já está montado.
    const check = () => { if (owner.isConnected) record.mounted = true; };
    (globalThis.requestAnimationFrame || ((run) => setTimeout(run, 16)))(check);
    setTimeout(check, 1000);
  }
  listeners.get(type).add(listener);
  return () => listeners.get(type)?.delete(listener);
}
/** Eventos auditados, mais recentes primeiro, com filtros simples. */
export function auditLog({ objectId = null, types = null, limit = 200 } = {}) {
  return readOS().audit.filter((event) => (!objectId || event.object?.id === objectId) && (!types || types.includes(event.type))).slice(-limit).reverse();
}

/** Quantos ouvintes estão ativos (painel de depuração e teste de vazamento). */
export function listenerCount() { sweep(); let total = 0; for (const set of listeners.values()) total += set.size; return total; }

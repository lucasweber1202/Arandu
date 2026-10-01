// Notificações da camada (menções, integrações, sistema) ligadas a eventos.
//
// As notificações do motor (propostas, aprovações, decisões) continuam vindo
// do motor; estas completam o centro com o que a camada produz. Cada uma
// nasce de um evento do barramento — nunca de um texto solto.

import { readOS, updateOS, uid } from '../platform/os-store.js';
import { on } from '../platform/bus.js';

export const CATEGORIES = Object.freeze([
  ['needs', 'Precisa de você'], ['mentions', 'Menções'], ['process', 'Processos'], ['integrations', 'Integrações'], ['system', 'Sistema']
]);

export function pushNotification({ userId, category, title, body = '', href = null, event = null }) {
  if (!userId) return null;
  const row = { id: uid('nt'), user_id: userId, category, title, body, href, event, at: new Date().toISOString(), read: false };
  updateOS((draft) => { draft.notifications.push(row); });
  return row;
}
export function localNotifications(userId) { return readOS().notifications.filter((row) => row.user_id === userId).slice().reverse(); }
export function markLocalRead(ids = null, userId = null) {
  updateOS((draft) => { for (const row of draft.notifications) if ((!ids || ids.includes(row.id)) && (!userId || row.user_id === userId)) row.read = true; });
}

/** Regras evento → notificação (quem recebe e em que categoria). */
let wired = false;
export function wireNotifications(members = () => []) {
  if (wired) return;
  wired = true;
  on('mention.created', (event) => {
    if (event.remote) return;
    for (const userId of event.detail?.mentions || []) {
      pushNotification({ userId, category: 'mentions', title: `${event.actor?.name || 'Alguém'} mencionou você em ${event.object?.title || 'um processo'}`, body: event.detail?.excerpt || '', href: event.detail?.href || null, event: event.id });
    }
  });
  on('integration.connected', (event) => {
    if (event.remote) return;
    const admins = members().filter((member) => member.role === 'admin').map((member) => member.user_id);
    for (const userId of new Set([...admins, event.actor?.id].filter(Boolean))) pushNotification({ userId, category: 'integrations', title: `${event.object?.title} conectado`, body: 'Conexão simulada na demonstração: nenhum dado real trafega.', href: '/finance/integrations.html', event: event.id });
  });
  on('directory.imported', (event) => {
    if (event.remote || !event.actor?.id) return;
    pushNotification({ userId: event.actor.id, category: 'integrations', title: `Diretório importado: ${event.detail?.users || 0} pessoas`, body: 'Papéis atribuídos pelo mapeamento de grupos.', href: '/finance/integrations.html#identidade', event: event.id });
  });
  on('sync.flushed', (event) => {
    if (event.remote || !event.detail?.sent) return;
    const userId = members().find((member) => member.self)?.user_id;
    if (userId) pushNotification({ userId, category: 'system', title: `${event.detail.sent} alteração${event.detail.sent === 1 ? '' : 'ões'} sincronizada${event.detail.sent === 1 ? '' : 's'}`, body: 'A fila offline foi enviada ao reconectar.', event: event.id });
  });
  on('policy.published', (event) => {
    if (event.remote) return;
    for (const member of members().filter((row) => ['admin', 'finance_manager'].includes(row.role))) pushNotification({ userId: member.user_id, category: 'system', title: `Política de aprovação v${event.detail?.version} publicada`, body: 'Novos processos seguem a nova versão; os em andamento continuam na versão em que começaram.', href: '/finance/policies.html', event: event.id });
  });
}

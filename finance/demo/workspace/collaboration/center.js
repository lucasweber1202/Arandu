// Central de notificações do Work OS.
//
//   Precisa de você · Menções · Processos · Integrações · Sistema
//
// Uma lista só, duas fontes: as notificações do motor (propostas, aprovações,
// decisões, menções na solicitação) e as da camada (menções em aprovação e
// contrato, integrações, fila offline, políticas). Marcar como lida é
// otimista: some da contagem na hora e grava em seguida.

import { el, icon, timeAgo, formatDateTime } from '../../../src/core.js';
import { button, emptyState, toast } from '../../../src/ui.js';
import { notificationHref } from '../../../src/shell.js';
import { CATEGORIES, localNotifications, markLocalRead } from './notify.js';
import { subscribeOS } from '../platform/os-store.js';
import { emit } from '../platform/bus.js';

const ENGINE_CATEGORY = (row) => (row.event_type === 'mention' ? 'mentions'
  : ['approval_requested', 'approval_changes_requested', 'approval_rejected', 'renewal_due', 'task_assigned'].includes(row.event_type) ? 'needs' : 'process');

/** Normaliza as duas fontes (testável sem DOM). */
export function mergeNotifications(engineRows, localRows, hrefOf = () => null) {
  return [
    ...engineRows.map((row) => ({ id: `engine:${row.id}`, source: 'engine', rawId: row.id, category: ENGINE_CATEGORY(row), title: row.title, body: row.body, at: row.created_at, read: Boolean(row.read_at), href: hrefOf(row) })),
    ...localRows.map((row) => ({ id: `local:${row.id}`, source: 'local', rawId: row.id, category: row.category, title: row.title, body: row.body, at: row.at, read: row.read, href: row.href }))
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export async function notificationCenter(ctx) {
  ctx.header({ title: 'Notificações', subtitle: 'O que aconteceu e o que precisa de você — ligado aos eventos de cada processo.' });
  const userId = ctx.viewer?.id;
  let engineRows = [];
  let category = 'all';
  let unreadOnly = false;
  const list = el('ul', { class: 'ncenter-list', role: 'list', 'aria-live': 'polite' });
  const nav = el('nav', { class: 'ncenter-nav', 'aria-label': 'Categorias de notificação' });
  const unreadToggle = el('button', { type: 'button', class: 'ft-token', 'aria-pressed': 'false', id: 'notifications-unread' }, el('span', { class: 'ft-value', text: 'Só não lidas' }));
  const markAll = button('Marcar todas como lidas', { size: 'sm', iconName: 'check', attrs: { id: 'notifications-mark-all' } });
  const rows = () => mergeNotifications(engineRows, localNotifications(userId), (row) => notificationHref(ctx, row));

  const markRead = async (items) => {
    const engine = items.filter((item) => item.source === 'engine' && !item.read).map((item) => item.rawId);
    const local = items.filter((item) => item.source === 'local' && !item.read).map((item) => item.rawId);
    for (const row of engineRows) if (engine.includes(row.id)) row.read_at = new Date().toISOString();
    if (local.length) markLocalRead(local, userId);
    draw();
    emit('notification.read', { detail: { count: engine.length + local.length }, audit: false });
    if (engine.length) {
      try { await ctx.api('notifications', { method: 'PATCH', body: JSON.stringify({ organization_id: ctx.organization.id, ids: engine }) }); ctx.refreshBell?.(); }
      catch (error) { toast(`Não foi possível marcar como lida: ${error.message}`, 'error'); }
    }
  };
  const draw = () => {
    const all = rows();
    nav.replaceChildren(...[['all', 'Todas'], ...CATEGORIES].map(([value, label]) => {
      const unread = all.filter((item) => !item.read && (value === 'all' || item.category === value)).length;
      const node = el('button', { type: 'button', class: 'ncenter-cat', 'aria-pressed': String(value === category), dataset: { category: value } }, [el('span', { text: label }), unread ? el('span', { class: 'ncenter-count num', 'aria-label': `${unread} não lidas`, text: String(unread) }) : null]);
      node.addEventListener('click', () => { category = value; draw(); });
      return node;
    }));
    const visible = all.filter((item) => (category === 'all' || item.category === category) && (!unreadOnly || !item.read));
    const label = [['all', 'Todas'], ...CATEGORIES].find(([value]) => value === category)[1];
    list.replaceChildren(...(visible.length ? visible.map((item) => el('li', { class: `ncenter-item${item.read ? ' is-read' : ''}`, dataset: { category: item.category } }, [
      el('span', { class: 'ncenter-dot', 'aria-hidden': 'true' }),
      el('div', { class: 'ncenter-main' }, [
        item.href ? el('a', { class: 'ncenter-title', href: item.href, text: item.title, onclick: () => markRead([item]) }) : el('p', { class: 'ncenter-title', text: item.title }),
        item.body ? el('p', { class: 'ncenter-body', text: item.body }) : null,
        el('p', { class: 'ncenter-meta' }, [el('span', { text: CATEGORIES.find(([value]) => value === item.category)?.[1] || '' }), ' · ', el('time', { datetime: item.at, title: formatDateTime(item.at), text: timeAgo(item.at) }), item.read ? null : el('span', { class: 'sr-only', text: ' · não lida' })])
      ]),
      item.read ? null : el('button', { type: 'button', class: 'icon-btn sm ncenter-read', 'aria-label': `Marcar como lida: ${item.title}`, title: 'Marcar como lida', onclick: () => markRead([item]) }, icon('check', { size: 14 }))
    ])) : [el('li', {}, emptyState({ title: category === 'all' ? 'Nenhuma notificação' : `Nada em ${label}`,
      text: category === 'needs' ? 'Quando uma decisão ou prazo precisar de você, aparece aqui.' : 'Você será avisado de propostas, aprovações, menções e integrações.', iconName: 'bell', compact: true,
      action: button('Ver o que está em andamento', { size: 'sm', onClick: () => location.assign(ctx.href('/finance/dashboard.html')) }) }))]));
    markAll.disabled = !all.some((item) => !item.read);
  };
  unreadToggle.addEventListener('click', () => { unreadOnly = !unreadOnly; unreadToggle.setAttribute('aria-pressed', String(unreadOnly)); unreadToggle.classList.toggle('is-active', unreadOnly); draw(); });
  markAll.addEventListener('click', () => markRead(rows()));
  const unsubscribe = subscribeOS(() => { if (!list.isConnected && list.dataset.mounted) { unsubscribe(); return; } list.dataset.mounted = '1'; draw(); });
  ctx.api(`notifications?organization_id=${encodeURIComponent(ctx.organization.id)}`).then((result) => { engineRows = result.rows || []; draw(); }).catch(() => draw());
  draw();
  return el('div', { class: 'ncenter' }, [nav, el('div', { class: 'ncenter-body-wrap' }, [el('div', { class: 'ncenter-tools' }, [unreadToggle, markAll]), list])]);
}

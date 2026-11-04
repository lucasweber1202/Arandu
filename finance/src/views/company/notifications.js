// Notificações do usuário.
// Extraído de company.js (v7.0): uma capability por módulo e rota.

import { el, daysUntil } from '../../core.js';
import { button, linkButton, emptyState, errorState, loading, toast } from '../../ui.js';
import { notificationItem } from '../../shell.js';

export async function notifications(ctx) {
  ctx.header({ title: 'Notificações', subtitle: 'Aprovações, propostas, menções, prazos e renovações — o que é prioritário vem primeiro.',
    actions: [linkButton('Preferências', ctx.href('/finance/settings.html#notificacoes'), { iconName: 'settings' })] });
  const box = el('div', { class: 'card card-flush' }, loading());
  const markAll = button('Marcar todas como lidas', { size: 'sm', iconName: 'check' });
  const filter = el('select', { class: 'input', 'aria-label': 'Filtrar por tipo' });
  filter.add(new Option('Todos os tipos', ''));
  for (const [value, label] of [['approval', 'Aprovações'], ['proposal', 'Propostas'], ['mention', 'Menções e comentários'], ['renewal_due', 'Renovações'], ['deadline', 'Prazos']]) filter.add(new Option(label, value));
  let rows = [];
  const draw = () => {
    const visible = rows.filter((row) => !filter.value || row.event_type.startsWith(filter.value) || (filter.value === 'mention' && row.event_type === 'comment'));
    const groups = new Map();
    for (const row of visible) {
      const key = daysUntil(row.created_at) === 0 ? 'Hoje' : daysUntil(row.created_at) === -1 ? 'Ontem' : daysUntil(row.created_at) >= -7 ? 'Nesta semana' : 'Anteriores';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    box.replaceChildren();
    for (const [label, items] of groups) box.append(el('section', { class: 'notice-group' }, [el('h2', { class: 'notice-group-title', text: label }), el('div', { class: 'notification-list' }, items.map((row) => notificationItem(ctx, row)))]));
    if (!visible.length) box.append(emptyState({ title: 'Nenhuma notificação', text: 'Você será avisado sobre aprovações, propostas, menções, prazos e renovações.', iconName: 'bell' }));
    markAll.disabled = !rows.some((row) => !row.read_at);
  };
  const load = async () => {
    try { rows = (await ctx.api(`notifications?organization_id=${encodeURIComponent(ctx.organization.id)}`)).rows || []; draw(); }
    catch (error) { box.replaceChildren(errorState({ error, onRetry: load })); }
  };
  filter.addEventListener('change', draw);
  markAll.addEventListener('click', async () => {
    try { await ctx.send('notifications', { organization_id: ctx.organization.id }, 'PATCH'); toast('Todas marcadas como lidas.'); await load(); ctx.refreshBell?.(); }
    catch (error) { toast(error.message, 'error'); }
  });
  load();
  return el('div', { class: 'stack' }, [el('div', { class: 'toolbar' }, [filter, el('span', { class: 'spacer' }), markAll]), box]);
}

// ---------------------------------------------------------- configurações

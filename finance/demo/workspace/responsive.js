// Navegação móvel: barra inferior derivada da persona, não quatro apps.
//
//   Comprador   Início · Solicitações · Propostas · Mais
//   Aprovador   Início · Aprovações · Solicitações · Mais
//   Provedor    Início · Convites · Propostas · Mais
//   Admin       Início · Equipe · Configuração · Mais
//
// "Mais" abre uma folha com o restante da navegação (a mesma do desktop),
// as visões fixadas e as preferências. Abaixo de 960 px não há barra lateral.

import { el, icon } from '../../src/core.js';
import { iconButton } from '../../src/ui.js';
import { navModel, homeHref, sidebarPersonal } from './shell.js';

const TABS = {
  buyer: ['home', 'rfqs', 'proposals'],
  approver: ['home', 'approvals', 'rfqs'],
  admin: ['home', 'team', 'settings'],
  provider: ['home', 'invites', 'providerRfqs']
};

function tabDefs(ctx) {
  return {
    home: { label: 'Início', icon: 'home', href: homeHref(ctx), active: ['dashboard', 'home', 'providerHome'].includes(ctx.view) && !location.hash.startsWith('#convites') },
    rfqs: { label: 'Solicitações', icon: 'file', href: ctx.href('/finance/rfqs.html'), active: ['rfqs', 'rfq', 'newRfq'].includes(ctx.view), count: 'rfqs' },
    proposals: { label: 'Propostas', icon: 'inbox', href: ctx.href('/finance/proposals.html'), active: ctx.view === 'proposals' },
    approvals: { label: 'Aprovações', icon: 'checkCircle', href: ctx.href('/finance/approvals.html'), active: ctx.view === 'approvals' },
    team: { label: 'Equipe', icon: 'users', href: ctx.href('/finance/settings.html#equipe'), active: ctx.view === 'settings' && location.hash === '#equipe' },
    settings: { label: 'Configuração', icon: 'settings', href: ctx.href('/finance/settings.html'), active: ctx.view === 'settings' && location.hash !== '#equipe' },
    invites: { label: 'Convites', icon: 'send', href: ctx.href('/provider/index.html#convites'), active: ctx.view === 'providerHome' && location.hash.startsWith('#convites'), count: 'providerHome' },
    providerRfqs: { label: 'Propostas', icon: 'inbox', href: ctx.href('/provider/rfqs.html'), active: ['providerRfqs', 'providerProposal'].includes(ctx.view), count: 'providerRfqs' }
  };
}

export function renderMobileNav(ctx, counts = {}, hooks = {}) {
  const existing = document.querySelector('.mobile-tabbar');
  if (!existing) return;
  const defs = tabDefs(ctx);
  const keys = TABS[ctx.persona?.key] || TABS.buyer;
  const bar = el('nav', { class: 'mobile-tabbar dw-tabbar', 'aria-label': 'Navegação principal' });
  for (const key of keys) {
    const tab = defs[key];
    const count = tab.count ? counts[tab.count] : null;
    bar.append(el('a', { href: tab.href, class: 'tab-item', 'aria-current': tab.active ? 'page' : null }, [
      el('span', { class: 'tab-icon' }, [icon(tab.icon, { size: 20 }), count ? el('span', { class: 'tab-badge', text: String(count) }) : null]),
      el('span', { class: 'tab-label', text: tab.label })
    ]));
  }
  const more = el('button', { type: 'button', class: 'tab-item', 'aria-haspopup': 'dialog', id: 'mobile-more' }, [el('span', { class: 'tab-icon' }, icon('menu', { size: 20 })), el('span', { class: 'tab-label', text: 'Mais' })]);
  more.addEventListener('click', () => openMoreSheet(ctx, counts, hooks));
  bar.append(more);
  existing.replaceWith(bar);
}

function openMoreSheet(ctx, counts, hooks) {
  const sheet = el('dialog', { class: 'sheet dw-sheet', 'aria-labelledby': 'more-title' });
  const link = (item) => el('a', { href: item.href, class: 'sheet-link', 'aria-current': item.key === ctx.view || item.views?.includes(ctx.view) ? 'page' : null }, [
    icon(item.icon, { size: 18 }), el('span', { text: item.label }), counts[item.key] ? el('span', { class: 'side-count', text: String(counts[item.key]) }) : null]);
  const groups = [];
  for (const entry of navModel(ctx)) {
    if (!entry.group) groups.push(el('ul', { role: 'list', class: 'sheet-list' }, el('li', {}, link(entry))));
    else groups.push(el('p', { class: 'sheet-group', text: entry.group }), el('ul', { role: 'list', class: 'sheet-list' }, entry.items.map((item) => el('li', {}, link(item)))));
  }
  const action = (label, iconName, run) => {
    const node = el('button', { type: 'button', class: 'sheet-link' }, [icon(iconName, { size: 18 }), el('span', { text: label })]);
    node.addEventListener('click', () => { sheet.close(); run(); });
    return el('li', {}, node);
  };
  sheet.append(
    el('div', { class: 'sheet-head' }, [el('h2', { class: 'sheet-title', id: 'more-title', text: ctx.organization?.legal_name || 'Arandu' }), iconButton('x', 'Fechar', { onClick: () => sheet.close() })]),
    ...groups,
    ctx.audience === 'company' ? el('ul', { role: 'list', class: 'sheet-list' }, [el('li', {}, link({ key: 'notifications', label: 'Notificações', icon: 'bell', href: ctx.href('/finance/notifications.html') })),
      el('li', {}, link({ key: 'settings', label: 'Configurações', icon: 'settings', href: ctx.href('/finance/settings.html') }))]) : null,
    ctx.audience === 'company' ? sidebarPersonal(ctx) : null,
    el('p', { class: 'sheet-group', text: 'Espaço de trabalho' }),
    el('ul', { role: 'list', class: 'sheet-list' }, [
      hooks.openPalette ? action('Buscar ou executar', 'search', hooks.openPalette) : null,
      hooks.openPreferences ? action('Aparência e preferências', 'sliders', hooks.openPreferences) : null,
      hooks.openRestore ? action('Restaurar demonstração…', 'refresh', hooks.openRestore) : null,
      el('li', {}, el('a', { class: 'sheet-link', href: ctx.href('/finance/boundaries.html') }, [icon('shield', { size: 18 }), el('span', { text: 'Limites do produto' })]))
    ].filter(Boolean))
  );
  sheet.addEventListener('close', () => { document.querySelector('#mobile-more')?.focus(); setTimeout(() => sheet.remove(), 0); });
  sheet.addEventListener('click', (event) => { if (event.target === sheet) sheet.close(); });
  document.body.append(sheet);
  sheet.showModal();
}

// Popover acessível (menu ou diálogo não modal) ancorado num botão.
//
// * aria-expanded / aria-controls / aria-haspopup no gatilho;
// * setas, Home/End entre itens de menu; Escape fecha e devolve o foco;
// * clique fora ou Tab para fora fecha sem roubar o foco;
// * só um popover aberto por vez.

let current = null;
let seq = 0;

export function popover({ trigger, panel, role = 'menu', onOpen = null, onClose = null }) {
  panel.id ||= `dw-popover-${++seq}`;
  panel.hidden = true;
  panel.classList.add('dw-popover');
  if (role === 'menu') panel.setAttribute('role', 'menu');
  else { panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'false'); }
  trigger.setAttribute('aria-haspopup', role === 'menu' ? 'menu' : 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-controls', panel.id);

  const items = () => [...panel.querySelectorAll('[role^="menuitem"], [data-popover-item]')].filter((node) => !node.disabled && !node.closest('[hidden]'));
  const api = {
    get open() { return !panel.hidden; },
    show({ focus = 'auto' } = {}) {
      if (current && current !== api) current.hide({ restore: false });
      current = api;
      onOpen?.();
      panel.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => {
        const list = items();
        const checked = list.find((node) => node.getAttribute('aria-checked') === 'true');
        const target = focus === 'last' ? list[list.length - 1] : focus === 'auto' ? checked || list[0] : list[0];
        (target || panel.querySelector('button, a, input, [tabindex]'))?.focus();
      });
    },
    hide({ restore = true } = {}) {
      if (panel.hidden) return;
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      if (current === api) current = null;
      onClose?.();
      if (restore) trigger.focus();
    },
    toggle() { if (panel.hidden) api.show(); else api.hide(); }
  };

  trigger.addEventListener('click', (event) => { event.stopPropagation(); api.toggle(); });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' && role === 'menu') { event.preventDefault(); api.show({ focus: 'first' }); }
    if (event.key === 'ArrowUp' && role === 'menu') { event.preventDefault(); api.show({ focus: 'last' }); }
  });
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); api.hide(); return; }
    if (event.key === 'Tab') { api.hide({ restore: false }); return; }
    if (role !== 'menu') return;
    const list = items();
    const index = list.indexOf(document.activeElement);
    const move = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 }[event.key];
    if (move === undefined || !list.length) return;
    event.preventDefault();
    list[(move + list.length) % list.length].focus();
  });
  document.addEventListener('click', (event) => {
    if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) api.hide({ restore: false });
  });
  return api;
}

export function closeOpenPopover() { current?.hide({ restore: false }); }

/**
 * Menu ••• para ações contextuais de uma linha ou cartão. Itens:
 * { label, icon, onClick } ou { label, icon, href, newTab }; `danger` fica por último, separado.
 */
export function contextMenu(label, items, { el, icon }) {
  const wrap = el('div', { class: 'dw-anchor' });
  const trigger = el('button', { type: 'button', class: 'icon-btn sm row-more', 'aria-label': label, title: 'Mais ações' }, icon('more', { size: 16 }));
  const panel = el('div', { class: 'dw-menu dw-menu-sm' });
  const list = items.filter(Boolean);
  list.forEach((item, index) => {
    if (item.danger && index > 0 && !list[index - 1].danger) panel.append(el('hr', { class: 'dw-menu-sep' }));
    const node = item.href
      ? el('a', { role: 'menuitem', class: 'dw-menu-item', href: item.href, target: item.newTab ? '_blank' : null, rel: item.newTab ? 'noopener' : null }, [icon(item.icon, { size: 16 }), el('span', { class: 'dw-menu-label', text: item.label })])
      : el('button', { type: 'button', role: 'menuitem', class: `dw-menu-item${item.danger ? ' is-danger' : ''}` }, [icon(item.icon, { size: 16 }), el('span', { class: 'dw-menu-label', text: item.label })]);
    node.addEventListener('click', (event) => { event.stopPropagation(); menu.hide({ restore: false }); item.onClick?.(); });
    panel.append(node);
  });
  const menu = popover({ trigger, panel, role: 'menu' });
  wrap.addEventListener('click', (event) => event.stopPropagation());
  wrap.append(trigger, panel);
  return wrap;
}

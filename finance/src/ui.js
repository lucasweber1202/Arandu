// Componentes da interface financeira.
//
// Pequenos, sem framework, todos acessíveis por teclado. Cada um devolve um nó
// pronto; nenhum injeta HTML a partir de dado.

import { el, icon, initials, fieldValue, enumLabel } from './core.js';

export function button(label, { variant = 'secondary', iconName = null, type = 'button', size = null, onClick = null, attrs = {} } = {}) {
  const node = el('button', { type, class: `btn btn-${variant}${size ? ` btn-${size}` : ''}`, ...attrs },
    [iconName ? icon(iconName) : null, el('span', { class: 'btn-label', text: label })]);
  if (onClick) node.addEventListener('click', onClick);
  return node;
}
export function linkButton(label, href, { variant = 'secondary', iconName = null, size = null, attrs = {} } = {}) {
  return el('a', { href, class: `btn btn-${variant}${size ? ` btn-${size}` : ''}`, ...attrs },
    [iconName ? icon(iconName) : null, el('span', { class: 'btn-label', text: label })]);
}
export function iconButton(name, label, { onClick = null, attrs = {} } = {}) {
  const node = el('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, ...attrs }, icon(name, { size: 18 }));
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

/** Estado sempre com texto; a cor apenas reforça. */
export function pill(meta, { size = null } = {}) {
  const info = meta || { label: '—', tone: 'neutral' };
  return el('span', { class: `pill pill-${info.tone || 'neutral'}${size ? ` pill-${size}` : ''}` },
    [info.icon ? icon(info.icon, { size: 12 }) : el('span', { class: 'pill-dot', 'aria-hidden': 'true' }), el('span', { text: info.label })]);
}
export function tag(text, tone = 'neutral') { return el('span', { class: `tag tag-${tone}`, text }); }

export function avatar(name, { size = 'md', tone = null } = {}) {
  const hue = [...String(name || '')].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;
  return el('span', { class: `avatar avatar-${size} avatar-h${tone ?? hue}`, 'aria-hidden': 'true', text: initials(name) });
}
export function person(name, detail = null) {
  return el('span', { class: 'person' }, [avatar(name, { size: 'sm' }), el('span', { class: 'person-text' },
    [el('span', { class: 'person-name', text: name || '—' }), detail ? el('span', { class: 'person-detail', text: detail }) : null])]);
}

export function card({ title = null, subtitle = null, actions = null, id = null, className = '', body = [], headingLevel = 2, flush = false } = {}) {
  const heading = title ? el(`h${headingLevel}`, { class: 'card-title', text: title }) : null;
  const head = title || actions ? el('div', { class: 'card-head' }, [
    el('div', { class: 'card-head-text' }, [heading, subtitle ? el('p', { class: 'card-subtitle', text: subtitle }) : null]),
    actions ? el('div', { class: 'card-actions' }, actions) : null
  ]) : null;
  return el('section', { class: `card${flush ? ' card-flush' : ''} ${className}`.trim(), id }, [head, el('div', { class: 'card-body' }, body)]);
}

export function emptyState({ title, text = null, action = null, iconName = 'inbox', compact = false }) {
  return el('div', { class: `empty${compact ? ' empty-compact' : ''}` }, [
    el('span', { class: 'empty-icon' }, icon(iconName, { size: 20 })),
    el('p', { class: 'empty-title', text: title }),
    text ? el('p', { class: 'empty-text', text }) : null,
    action ? el('div', { class: 'empty-action' }, action) : null
  ]);
}
export function errorState({ title = 'Não foi possível carregar', error = null, onRetry = null }) {
  return el('div', { class: 'empty empty-error', role: 'alert' }, [
    el('span', { class: 'empty-icon' }, icon('alert', { size: 20 })),
    el('p', { class: 'empty-title', text: title }),
    error ? el('p', { class: 'empty-text', text: error.message || String(error) }) : null,
    onRetry ? el('div', { class: 'empty-action' }, button('Tentar novamente', { iconName: 'refresh', onClick: onRetry })) : null
  ]);
}
export function skeleton(lines = 3) {
  return el('div', { class: 'skeleton-block', 'aria-hidden': 'true' }, Array.from({ length: lines }, (_, index) =>
    el('span', { class: 'skeleton-line', style: `width:${[92, 78, 64, 85, 70][index % 5]}%` })));
}
export function loading(label = 'Carregando…') {
  return el('div', { class: 'loading-state', role: 'status' }, [skeleton(4), el('span', { class: 'sr-only', text: label })]);
}

/** Lista de definição com ausências explícitas ("Não informado"). */
export function definitionList(fields, values, { showMissing = false, columns = 2 } = {}) {
  const list = el('dl', { class: `deflist deflist-${columns}` });
  for (const field of fields) {
    const formatted = fieldValue(field, values?.[field.key]);
    if (formatted === null && !showMissing) continue;
    list.append(el('div', { class: 'deflist-row' }, [
      el('dt', { text: field.label.replace(/\s*\((?:R\$|%)\)$/, '') }),
      el('dd', { class: formatted === null ? 'missing' : '', text: formatted ?? 'Não informado' })
    ]));
  }
  return list;
}

// ------------------------------------------------------------------- abas
/**
 * Abas ARIA com seta esquerda/direita, Home/End e âncora no endereço, para
 * que recarregar ou voltar no histórico mantenha a aba aberta.
 */
export function tabs(items, { label, initial = null, onChange = null } = {}) {
  const list = el('div', { class: 'tabs', role: 'tablist', 'aria-label': label });
  const panels = el('div', { class: 'tab-panels' });
  const buttons = [];
  const built = new Map();
  const select = (id, { focus = false, push = true } = {}) => {
    const item = items.find((entry) => entry.id === id) || items[0];
    for (const tab of buttons) {
      const active = tab.dataset.tab === item.id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    }
    for (const panel of panels.children) panel.hidden = panel.dataset.tab !== item.id;
    if (!built.has(item.id)) {
      const panel = [...panels.children].find((node) => node.dataset.tab === item.id);
      built.set(item.id, true);
      const content = item.render();
      if (content instanceof Promise) {
        panel.append(loading());
        content.then((node) => panel.replaceChildren(node)).catch((error) => panel.replaceChildren(errorState({ error })));
      } else panel.append(content);
    }
    if (push && location.hash !== `#${item.id}`) history.replaceState(null, '', `${location.pathname}${location.search}#${item.id}`);
    onChange?.(item.id);
  };
  for (const item of items) {
    const tab = el('button', { type: 'button', role: 'tab', id: `tab-${item.id}`, class: 'tab', 'aria-controls': `panel-${item.id}`, dataset: { tab: item.id } },
      [el('span', { text: item.label }), item.count !== undefined && item.count !== null ? el('span', { class: 'tab-count', text: String(item.count) }) : null]);
    tab.addEventListener('click', () => select(item.id));
    tab.addEventListener('keydown', (event) => {
      const index = buttons.indexOf(tab);
      let next = null;
      if (event.key === 'ArrowRight') next = buttons[(index + 1) % buttons.length];
      if (event.key === 'ArrowLeft') next = buttons[(index - 1 + buttons.length) % buttons.length];
      if (event.key === 'Home') next = buttons[0];
      if (event.key === 'End') next = buttons[buttons.length - 1];
      if (next) { event.preventDefault(); select(next.dataset.tab, { focus: true }); }
    });
    buttons.push(tab);
    list.append(tab);
    panels.append(el('div', { role: 'tabpanel', id: `panel-${item.id}`, class: 'tab-panel', 'aria-labelledby': `tab-${item.id}`, tabindex: '0', dataset: { tab: item.id }, hidden: true }));
  }
  const wanted = (location.hash || '').slice(1);
  const start = items.some((item) => item.id === wanted) ? wanted : (initial || items[0].id);
  queueMicrotask(() => select(start, { push: false }));
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (items.some((item) => item.id === id)) select(id, { push: false });
  });
  return { node: el('div', { class: 'tabset' }, [el('div', { class: 'tabs-scroll' }, list), panels]), select };
}

// ---------------------------------------------------------- toast e status
let toastRegion = null;
export function toast(text, tone = 'success', { action = null } = {}) {
  if (!toastRegion) {
    toastRegion = el('div', { class: 'toast-region', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  const iconName = tone === 'error' ? 'alert' : tone === 'info' ? 'info' : 'checkCircle';
  const node = el('div', { class: `toast toast-${tone}` }, [icon(iconName), el('span', { class: 'toast-text', text })]);
  if (action) node.append(action);
  const close = iconButton('x', 'Fechar aviso', { onClick: () => node.remove() });
  node.append(close);
  toastRegion.append(node);
  setTimeout(() => node.classList.add('toast-leave'), tone === 'error' ? 9000 : 4200);
  setTimeout(() => node.remove(), tone === 'error' ? 9400 : 4600);
  return node;
}

/** Indicador de salvamento com estados explícitos e texto sempre presente. */
export function saveIndicator(initial = 'idle', text = '') {
  const node = el('span', { class: 'save-indicator', role: 'status', 'aria-live': 'polite' });
  const set = (state, label) => {
    node.dataset.state = state;
    const iconName = { saving: 'refresh', saved: 'checkCircle', error: 'alert', conflict: 'alert', dirty: 'edit', idle: 'clock', offline: 'alert' }[state] || 'clock';
    node.replaceChildren(icon(iconName, { size: 14 }), el('span', { text: label }));
  };
  set(initial, text);
  return { node, set };
}

// ------------------------------------------------------------- diálogos
function baseDialog({ title, description = null, className = '' }) {
  const dialog = el('dialog', { class: `dialog ${className}`.trim(), 'aria-labelledby': 'dialog-title' });
  const heading = el('h2', { id: 'dialog-title', class: 'dialog-title', text: title });
  const close = iconButton('x', 'Fechar', { onClick: () => dialog.close('cancel') });
  dialog.append(el('div', { class: 'dialog-head' }, [heading, close]));
  if (description) dialog.append(el('p', { class: 'dialog-description', text: description }));
  document.body.append(dialog);
  dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 0));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close('cancel'); });
  return dialog;
}

export function confirmDialog({ title, description = null, body = null, confirmLabel = 'Confirmar', tone = 'primary' }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const dialog = baseDialog({ title, description });
    if (body) dialog.append(el('div', { class: 'dialog-body' }, body));
    const ok = button(confirmLabel, { variant: tone, onClick: () => dialog.close('ok') });
    const cancel = button('Cancelar', { variant: 'ghost', onClick: () => dialog.close('cancel') });
    dialog.append(el('div', { class: 'dialog-actions' }, [cancel, ok]));
    dialog.addEventListener('close', () => { opener?.focus?.(); resolve(dialog.returnValue === 'ok'); });
    dialog.showModal();
    ok.focus();
  });
}

/** Pede um texto (ex.: motivo de rejeição) com validação inline. */
export function promptDialog({ title, description = null, label, minLength = 0, confirmLabel = 'Confirmar', tone = 'primary', placeholder = '' }) {
  return new Promise((resolve) => {
    const opener = document.activeElement;
    const dialog = baseDialog({ title, description });
    const form = el('form', { method: 'dialog', class: 'dialog-body', novalidate: true });
    const input = el('textarea', { id: 'dialog-input', rows: '4', maxlength: '2000', placeholder, 'aria-describedby': 'dialog-error' });
    const error = el('p', { id: 'dialog-error', class: 'field-error', hidden: true });
    form.append(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), input]), error);
    const ok = button(confirmLabel, { variant: tone, type: 'submit' });
    const cancel = button('Cancelar', { variant: 'ghost', onClick: () => dialog.close('cancel') });
    form.append(el('div', { class: 'dialog-actions' }, [cancel, ok]));
    let value = null;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (input.value.trim().length < minLength) {
        error.textContent = `Escreva pelo menos ${minLength} caracteres para quem vai ler.`;
        error.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      value = input.value.trim();
      dialog.close('ok');
    });
    dialog.append(form);
    dialog.addEventListener('close', () => { opener?.focus?.(); resolve(dialog.returnValue === 'ok' ? value : null); });
    dialog.showModal();
    input.focus();
  });
}

/** Painel lateral para contexto (aprovação, cadastro) sem perder a página. */
export function drawer({ title, subtitle = null, body, footer = null, onClose = null, className = '' }) {
  const opener = document.activeElement;
  const dialog = el('dialog', { class: `drawer ${className}`.trim(), 'aria-labelledby': 'drawer-title' });
  dialog.append(el('div', { class: 'drawer-head' }, [
    el('div', {}, [el('h2', { id: 'drawer-title', class: 'drawer-title', text: title }), subtitle ? el('p', { class: 'drawer-subtitle', text: subtitle }) : null]),
    iconButton('x', 'Fechar painel', { onClick: () => dialog.close() })
  ]));
  dialog.append(el('div', { class: 'drawer-body' }, body));
  if (footer) dialog.append(el('div', { class: 'drawer-foot' }, footer));
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { onClose?.(); opener?.focus?.(); setTimeout(() => dialog.remove(), 0); });
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

// ------------------------------------------------------------ formulários
let fieldSeq = 0;
/**
 * Campo rotulado com dica e erro associados por `aria-describedby`.
 * `control` pode ser qualquer input/select/textarea já criado.
 */
export function field({ label, control, hint = null, required = false, optionalLabel = false, className = '' }) {
  const id = control.id || `f${++fieldSeq}`;
  control.id = id;
  const hintNode = hint ? el('span', { class: 'field-hint', id: `${id}-hint`, text: hint }) : null;
  const error = el('span', { class: 'field-error', id: `${id}-error`, hidden: true });
  control.setAttribute('aria-describedby', [hintNode ? `${id}-hint` : null, `${id}-error`].filter(Boolean).join(' '));
  if (required) control.required = true;
  const wrap = el('div', { class: `field ${className}`.trim() }, [
    el('label', { class: 'field-label', for: id }, [label, required ? el('span', { class: 'req', 'aria-hidden': 'true', text: ' *' }) : null,
      optionalLabel ? el('span', { class: 'optional', text: ' (opcional)' }) : null]),
    control, hintNode, error
  ]);
  wrap.setError = (text) => {
    error.textContent = text || '';
    error.hidden = !text;
    if (text) control.setAttribute('aria-invalid', 'true'); else control.removeAttribute('aria-invalid');
  };
  return wrap;
}

/**
 * Formulário declarativo em painel. `specs`: [chave, rótulo, tipo | [[valor, texto]], atributos].
 * `submit(valores)` recebe números como Number (vazio = null), caixas como boolean e
 * texto vazio como null; o erro do servidor aparece no próprio formulário.
 */
export function formDrawer(title, intro, specs, submit, done = 'Registro preservado.') {
  const values = {};
  const read = [];
  const form = el('form', { class: 'stack' }, [intro ? el('p', { class: 'muted small', text: intro }) : null, ...specs.map(([key, label, kind = 'text', attrs = {}]) => {
    const control = Array.isArray(kind) ? el('select', {}, kind.map(([value, text]) => el('option', { value, text })))
      : el(kind === 'textarea' ? 'textarea' : 'input', { type: kind === 'textarea' ? null : kind, maxlength: kind === 'text' ? 200 : kind === 'textarea' ? 1000 : null, ...(kind === 'number' ? { min: 0, step: '.01' } : {}), ...attrs });
    read.push(() => { values[key] = kind === 'checkbox' ? control.checked : control.value === '' ? null : kind === 'number' ? Number(control.value) : control.value; });
    return field({ label, control, required: Boolean(attrs.required) });
  })]);
  const errors = el('p', { class: 'callout callout-error', role: 'alert', hidden: true });
  const save = button('Registrar', { variant: 'primary', type: 'submit' });
  form.append(errors, save);
  const dialog = drawer({ title, body: form });
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); save.disabled = true; errors.hidden = true;
    read.forEach((fn) => fn());
    try { await submit(values); dialog.close(); toast(done); }
    catch (e) { errors.textContent = e.message; errors.hidden = false; }
    finally { save.disabled = false; }
  });
  return dialog;
}

/** Controle para um campo do catálogo de produtos. */
export function catalogControl(spec, value = null) {
  let control;
  if (spec.type === 'enum') {
    control = el('select', { name: spec.key });
    control.add(new Option('Selecione…', ''));
    for (const option of spec.options) control.add(new Option(enumLabel(option), option));
  } else if (spec.type === 'bool') {
    control = el('select', { name: spec.key });
    for (const [optionValue, text] of [['', 'Selecione…'], ['true', 'Sim'], ['false', 'Não']]) control.add(new Option(text, optionValue));
  } else if (spec.type === 'text' && (spec.max ?? 0) > 400) {
    control = el('textarea', { name: spec.key, rows: '3', maxlength: String(spec.max) });
  } else {
    const numeric = ['money', 'percent', 'number', 'int'].includes(spec.type);
    control = el('input', {
      name: spec.key, type: numeric ? 'number' : spec.type === 'date' ? 'date' : 'text',
      inputmode: numeric ? 'decimal' : null, step: spec.type === 'int' ? '1' : numeric ? 'any' : null,
      min: numeric && spec.min !== undefined ? String(spec.min) : null, max: numeric && spec.max !== undefined && spec.max < 1e9 ? String(spec.max) : null,
      maxlength: spec.type === 'text' ? String(spec.max ?? 200) : null
    });
  }
  if (value !== null && value !== undefined) control.value = String(value);
  return control;
}

export function unitSuffix(spec) {
  if (spec.type === 'money') return 'R$';
  if (spec.type === 'percent') return '%';
  return null;
}

/** Linha de progresso (x de y) com texto acessível. */
export function progress(value, total, { label = null } = {}) {
  const ratio = total ? Math.max(0, Math.min(1, value / total)) : 0;
  return el('span', { class: 'progress', role: 'img', 'aria-label': label || `${value} de ${total}` },
    [el('span', { class: 'progress-bar' }, el('span', { class: 'progress-fill', style: `width:${Math.round(ratio * 100)}%` })),
      el('span', { class: 'progress-text', text: `${value}/${total}` })]);
}

export function menu(label, items, { iconName = 'more', visibleLabel = '' } = {}) {
  const wrap = el('div', { class: 'menu' });
  // Com rótulo visível o menu deixa de ser um ícone solto fácil de ignorar.
  const trigger = visibleLabel
    ? el('button', { type: 'button', class: 'btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': label, title: label }, [el('span', { text: visibleLabel }), icon('chevronDown', { size: 16 })])
    : el('button', { type: 'button', class: 'btn btn-ghost btn-icon-only', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': label, title: label }, icon(iconName));
  const list = el('div', { class: 'menu-list', role: 'menu', hidden: true });
  const closeMenu = () => { list.hidden = true; trigger.setAttribute('aria-expanded', 'false'); };
  for (const item of items.filter(Boolean)) {
    const entry = item.href
      ? el('a', { role: 'menuitem', class: 'menu-item', href: item.href }, [icon(item.icon || 'arrowRight'), el('span', { text: item.label })])
      : el('button', { type: 'button', role: 'menuitem', class: `menu-item${item.danger ? ' danger' : ''}` }, [icon(item.icon || 'arrowRight'), el('span', { text: item.label })]);
    if (item.onClick) entry.addEventListener('click', () => { closeMenu(); item.onClick(); });
    list.append(entry);
  }
  trigger.addEventListener('click', () => {
    const open = list.hidden;
    list.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) list.querySelector('.menu-item')?.focus();
  });
  list.addEventListener('keydown', (event) => {
    const entries = [...list.querySelectorAll('.menu-item')];
    const index = entries.indexOf(document.activeElement);
    if (event.key === 'Escape') { closeMenu(); trigger.focus(); }
    if (event.key === 'ArrowDown') { event.preventDefault(); entries[(index + 1) % entries.length]?.focus(); }
    if (event.key === 'ArrowUp') { event.preventDefault(); entries[(index - 1 + entries.length) % entries.length]?.focus(); }
  });
  document.addEventListener('click', (event) => { if (!wrap.contains(event.target)) closeMenu(); });
  wrap.append(trigger, list);
  return wrap;
}

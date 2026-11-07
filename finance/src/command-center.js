// Busca do espaço da empresa (Ctrl/Cmd+K): diálogo, resultados locais e busca
// no servidor. Carregada na primeira abertura; o atalho e o botão ficam no
// shell (installCommandCenter), então nenhuma rota baixa isto ao abrir.
import { el, icon, fold, productLabel, RFQ_STATUS, CONTRACT_STATUS, formatDate } from './core.js';
import { SEARCH_KIND_LABELS } from '../../lib/finance/command-center.mjs';
import { readableDetail } from './shell.js';

const KIND_LABELS = { ...SEARCH_KIND_LABELS, action: 'Ação' };
const KIND_ICONS = { rfq: 'file', proposal: 'inbox', provider: 'building', contract: 'briefcase', task: 'tasks', implementation: 'tasks', covenant: 'calendar', performance: 'scale', spend: 'layers', action: 'arrowRight' };

function localItems(ctx) {
  const data = ctx.data || {};
  const items = [];
  if (ctx.can('create_rfq')) items.push({ kind: 'action', title: 'Criar solicitação', detail: 'Crédito ou adquirência', href: ctx.href('/finance/new-rfq.html') });
  items.push(
    { kind: 'action', title: 'Abrir aprovações', detail: 'Caixa de aprovação', href: ctx.href('/finance/approvals.html') },
    { kind: 'action', title: 'Ver contratos e renovações', detail: 'Ciclo de vida', href: ctx.href('/finance/contracts.html') },
    { kind: 'action', title: 'Ver notificações', detail: 'Central de avisos', href: ctx.href('/finance/notifications.html') }
  );
  for (const rfq of data.rfqs || []) {
    items.push({ kind: 'rfq', title: rfq.title, detail: `${productLabel(rfq.product, { short: true })} · ${RFQ_STATUS[rfq.status]?.label || rfq.status}`, href: ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}`) });
    for (const proposal of rfq.proposals || []) items.push({ kind: 'proposal', title: proposal.provider_name, detail: rfq.title, href: ctx.href(`/finance/rfq.html?id=${encodeURIComponent(rfq.id)}#propostas`) });
  }
  for (const provider of data.providers || []) items.push({ kind: 'provider', title: provider.name, detail: provider.region || '', href: ctx.href(`/finance/providers.html#provider-${provider.id}`) });
  for (const contract of data.contracts || []) items.push({ kind: 'contract', title: contract.provider_name || 'Contrato', detail: `${productLabel(contract.product, { short: true })}${contract.ends_on ? ` · vence ${formatDate(contract.ends_on)}` : ''}`, href: ctx.href(`/finance/contracts.html?abrir=contrato#contract-${contract.id}`) });
  for (const task of data.tasks || []) items.push({ kind: 'task', title: task.title, detail: task.due_on ? `prazo ${formatDate(task.due_on)}` : '', href: ctx.href(`/finance/tasks.html#task-${task.id}`) });
  return items;
}

export function createCommandCenter(ctx, trigger) {
  const dialog = el('dialog', { id: 'command-center', class: 'command-dialog', 'aria-label': 'Buscar no espaço da empresa' });
  const input = el('input', { id: 'command-query', type: 'search', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'command-results', 'aria-autocomplete': 'list',
    autocomplete: 'off', placeholder: 'Buscar solicitações, propostas, provedores, contratos, tarefas…', 'aria-label': 'Buscar no espaço da empresa' });
  const results = el('ul', { id: 'command-results', role: 'listbox', class: 'command-results', 'aria-label': 'Resultados' });
  const status = el('p', { class: 'command-status', role: 'status', 'aria-live': 'polite' });
  const items = localItems(ctx);
  let options = [];
  let active = -1;
  let timer;
  let sequence = 0;

  const setActive = (index) => {
    active = options.length ? (index + options.length) % options.length : -1;
    options.forEach((option, position) => option.setAttribute('aria-selected', String(position === active)));
    if (active >= 0) { input.setAttribute('aria-activedescendant', options[active].id); options[active].scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };
  const render = (rows, note = '') => {
    results.replaceChildren();
    options = [];
    let group = null;
    rows.forEach((row, index) => {
      if (row.kind !== group) {
        group = row.kind;
        results.append(el('li', { role: 'presentation', class: 'command-group', text: KIND_LABELS[row.kind] || row.kind }));
      }
      const option = el('li', { role: 'option', id: `command-option-${index}`, class: 'command-option', 'aria-selected': 'false', dataset: { href: row.href } }, [
        el('span', { class: 'command-icon' }, icon(KIND_ICONS[row.kind] || 'arrowRight')),
        el('span', { class: 'command-text' }, [el('span', { class: 'command-title', text: row.title }), row.detail ? el('span', { class: 'command-detail', text: row.detail }) : null]),
        el('span', { class: 'command-kind', text: KIND_LABELS[row.kind] || row.kind })
      ]);
      option.addEventListener('click', () => go(row.href));
      option.addEventListener('mousemove', () => setActive(options.indexOf(option)));
      options.push(option);
      results.append(option);
    });
    status.textContent = note || (rows.length ? `${rows.length} resultado${rows.length > 1 ? 's' : ''}. Use ↑ ↓ e Enter.` : 'Nenhum resultado nesta organização. Tente outro termo.');
    setActive(0);
  };
  const go = (href) => { dialog.close(); location.assign(href); };
  const localSearch = (term) => {
    const terms = fold(term).split(/\s+/).filter(Boolean);
    if (!terms.length) return items.filter((item) => item.kind === 'action').concat(items.filter((item) => item.kind === 'rfq').slice(0, 5));
    const hits = items.filter((item) => terms.every((part) => fold(`${item.title} ${item.detail} ${KIND_LABELS[item.kind]}`).includes(part)));
    // Com termo digitado, registros vêm antes de atalhos; títulos antes de detalhes.
    const rank = (item) => (item.kind === 'action' ? 2 : terms.every((part) => fold(item.title).includes(part)) ? 0 : 1);
    return hits.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(({ item }) => item).slice(0, 20);
  };
  const draw = () => {
    clearTimeout(timer);
    const term = input.value.trim();
    const current = ++sequence;
    const local = localSearch(term);
    if (term.length < 2) { render(local); return; }
    render(local, 'Buscando…');
    timer = setTimeout(async () => {
      try {
        const response = await ctx.api(`search?organization_id=${ctx.orgId}&q=${encodeURIComponent(term)}`);
        if (current !== sequence || !dialog.open) return;
        const seen = new Set();
        const rows = (response.rows || []).map((row) => ({ kind: row.kind, title: row.title, detail: readableDetail(row.detail), href: ctx.href(row.href) }))
          .concat(local.filter((item) => item.kind === 'action'))
          .filter((row) => { const key = `${row.kind}:${row.title}:${row.href}`; if (seen.has(key)) return false; seen.add(key); return true; });
        render(rows);
      } catch {
        if (current === sequence) render(local, 'A busca completa está indisponível; mostrando resultados já carregados.');
      }
    }, 220);
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(active + 1); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(active - 1); }
    if (event.key === 'Enter' && active >= 0) { event.preventDefault(); go(options[active].dataset.href); }
  });
  dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); dialog.close(); } });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => trigger.focus());
  dialog.append(el('div', { class: 'command-input' }, [icon('search', { size: 18 }), input, el('kbd', { class: 'kbd', text: 'Esc' })]), results, status,
    el('p', { class: 'command-foot' }, [el('kbd', { class: 'kbd', text: '↑↓' }), ' navegar ', el('kbd', { class: 'kbd', text: 'Enter' }), ' abrir ', el('kbd', { class: 'kbd', text: 'Esc' }), ' fechar']));
  document.body.append(dialog);
  const open = () => { if (dialog.open) return; input.value = ''; draw(); dialog.showModal(); input.focus(); };
  return { open };
}


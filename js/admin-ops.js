(() => {
  if (!document.body.classList.contains('admin-shell')) return;

  const state = { query: '', status: '' };
  const q = (sel, root = document) => root.querySelector(sel);
  const qa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const text = (node) => (node ? node.textContent || '' : '').trim();

  function ensureToolbar() {
    const host = q('[data-admin-list]');
    if (!host || q('[data-admin-ops-toolbar]')) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'admin-ops-toolbar';
    toolbar.dataset.adminOpsToolbar = 'true';
    toolbar.innerHTML = `
      <input data-admin-search type="search" placeholder="Buscar no painel atual" />
      <select data-admin-status-filter><option value="">Todos os status</option></select>
      <button class="cta secondary" type="button" data-admin-copy-visible>Copiar visíveis</button>
      <button class="cta secondary" type="button" data-admin-export-visible>Exportar CSV</button>
    `;
    host.parentElement.insertBefore(toolbar, host);
  }

  function updateStatusOptions() {
    const select = q('[data-admin-status-filter]');
    if (!select) return;
    const values = [...new Set(qa('[data-admin-status-select]').map((item) => item.value).filter(Boolean))];
    const previous = select.value;
    select.innerHTML = '<option value="">Todos os status</option>' + values.map((value) => `<option value="${value}">${value}</option>`).join('');
    if (values.includes(previous)) select.value = previous;
  }

  function visibleRows() {
    return qa('.admin-item').filter((item) => item.style.display !== 'none');
  }

  function applyFilters() {
    ensureToolbar();
    updateStatusOptions();
    const query = state.query.toLowerCase();
    const status = state.status;
    qa('.admin-item').forEach((item) => {
      const itemText = text(item).toLowerCase();
      const current = q('[data-admin-status-select]', item)?.value || '';
      const okQuery = !query || itemText.includes(query);
      const okStatus = !status || current === status;
      item.style.display = okQuery && okStatus ? '' : 'none';
    });
  }

  function rowsAsText() {
    return visibleRows().map((item) => text(item).replace(/\s+/g, ' ')).join('\n');
  }

  function toCsv() {
    const rows = visibleRows().map((item) => {
      const title = text(q('strong', item));
      const detail = text(q('small', item));
      const status = q('[data-admin-status-select]', item)?.value || '';
      return [title, detail, status].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',');
    });
    return ['titulo,detalhe,status', ...rows].join('\n');
  }

  function exportCsv() {
    const blob = new Blob([toCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `arandu-admin-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-admin-search]')) { state.query = event.target.value || ''; applyFilters(); }
    if (event.target.matches('[data-admin-status-filter]')) { state.status = event.target.value || ''; applyFilters(); }
  });

  document.addEventListener('click', async (event) => {
    if (event.target.closest('[data-admin-copy-visible]')) {
      try { await navigator.clipboard.writeText(rowsAsText()); } catch (_) {}
    }
    if (event.target.closest('[data-admin-export-visible]')) exportCsv();
  });

  const observer = new MutationObserver(() => applyFilters());
  document.addEventListener('DOMContentLoaded', () => {
    const list = q('[data-admin-list]');
    if (list) observer.observe(list, { childList: true, subtree: true });
    applyFilters();
  });
})();

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

  function ensureDrawer() {
    if (q('[data-admin-detail-drawer]')) return q('[data-admin-detail-drawer]');
    const drawer = document.createElement('aside');
    drawer.className = 'admin-detail-drawer';
    drawer.dataset.adminDetailDrawer = 'true';
    drawer.hidden = true;
    drawer.innerHTML = '<div class="admin-detail-head"><div><p class="eyebrow">Detalhe operacional</p><h2>Registro selecionado</h2></div><button type="button" data-admin-detail-close>×</button></div><div data-admin-detail-body></div>';
    document.body.appendChild(drawer);
    return drawer;
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
    ensureDrawer();
    updateStatusOptions();
    const query = state.query.toLowerCase();
    const status = state.status;
    qa('.admin-item').forEach((item) => {
      const itemText = text(item).toLowerCase();
      const current = q('[data-admin-status-select]', item)?.value || '';
      const okQuery = !query || itemText.includes(query);
      const okStatus = !status || current === status;
      item.style.display = okQuery && okStatus ? '' : 'none';
      addDetailButton(item);
    });
  }

  function addDetailButton(item) {
    if (q('[data-admin-open-detail]', item)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cta secondary admin-detail-button';
    button.dataset.adminOpenDetail = 'true';
    button.textContent = 'Detalhes';
    item.appendChild(button);
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

  function openDetail(item) {
    const drawer = ensureDrawer();
    const title = text(q('strong', item)) || 'Registro';
    const detail = text(q('small', item)) || 'Sem subtítulo';
    const status = q('[data-admin-status-select]', item)?.value || '';
    const id = item.dataset.adminId || '';
    q('h2', drawer).textContent = title;
    q('[data-admin-detail-body]', drawer).innerHTML = `
      <dl class="admin-detail-list">
        <div><dt>ID</dt><dd>${id || 'não informado'}</dd></div>
        <div><dt>Resumo</dt><dd>${detail}</dd></div>
        <div><dt>Status atual</dt><dd>${status || 'sem status'}</dd></div>
      </dl>
      <div class="admin-detail-actions">
        <button class="cta secondary" type="button" data-admin-copy-detail>Copiar resumo</button>
        <a class="cta secondary" href="operacao.html">Abrir operação</a>
      </div>
      <p class="admin-detail-note">Use este painel para triagem rápida. Para produção, o próximo passo é vincular notas, tarefas e histórico por entidade.</p>`;
    drawer.dataset.currentSummary = `${title}\n${detail}\nStatus: ${status}\nID: ${id}`;
    drawer.hidden = false;
    drawer.classList.add('is-open');
  }

  function closeDetail() {
    const drawer = q('[data-admin-detail-drawer]');
    if (!drawer) return;
    drawer.hidden = true;
    drawer.classList.remove('is-open');
  }

  function bind() {
    document.addEventListener('input', (event) => {
      if (event.target.matches('[data-admin-search]')) { state.query = event.target.value || ''; applyFilters(); }
      if (event.target.matches('[data-admin-status-filter]')) { state.status = event.target.value || ''; applyFilters(); }
    });

    document.addEventListener('click', async (event) => {
      if (event.target.closest('[data-admin-copy-visible]')) {
        try { await navigator.clipboard.writeText(rowsAsText()); } catch (_) {}
      }
      if (event.target.closest('[data-admin-export-visible]')) exportCsv();
      const detailButton = event.target.closest('[data-admin-open-detail]');
      if (detailButton) openDetail(detailButton.closest('.admin-item'));
      if (event.target.closest('[data-admin-detail-close]')) closeDetail();
      if (event.target.closest('[data-admin-copy-detail]')) {
        const drawer = q('[data-admin-detail-drawer]');
        try { await navigator.clipboard.writeText(drawer?.dataset.currentSummary || ''); } catch (_) {}
      }
    });
  }

  function init() {
    bind();
    const list = q('[data-admin-list]');
    if (list) new MutationObserver(() => applyFilters()).observe(list, { childList: true, subtree: true });
    applyFilters();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

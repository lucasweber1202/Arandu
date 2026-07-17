(() => {
  const API = '/api/admin';
  const DASHBOARD = '/api/dashboard';
  const TOKEN_KEY = 'arandu.adminToken.v1';

  const panels = {
    submissions: { label: 'Submissões', title: ['artist_name', 'name', 'email'], subtitle: ['city', 'portfolio_url'], statusField: 'status' },
    leads: { label: 'Leads', title: ['name', 'email', 'whatsapp'], subtitle: ['type', 'source_page'], statusField: 'status' },
    obras: { label: 'Obras', title: ['title'], subtitle: ['artist_name', 'artist_id', 'price_label'], statusField: 'status' },
    artistas: { label: 'Artistas', title: ['name'], subtitle: ['city', 'region', 'artist_level'], statusField: 'status' },
    reservations: { label: 'Reservas', title: ['name', 'artwork_id'], subtitle: ['whatsapp', 'deadline'], statusField: 'status' },
    certificados: { label: 'Certificados', title: ['code'], subtitle: ['artwork_id', 'artist_id'], statusField: 'verification_status' },
    briefs: { label: 'Empresas', title: ['company', 'name', 'email'], subtitle: ['project_type', 'budget'], statusField: 'status' },
    proposals: { label: 'Propostas', title: ['client', 'proposal_number'], subtitle: ['space', 'total'], statusField: 'status' },
    tasks: { label: 'Tarefas', title: ['title'], subtitle: ['entity_type', 'owner_name', 'due_at'], statusField: 'status' }
  };

  const statusLabels = {
    available: 'disponível', in_conversation: 'em conversa', reserved: 'reservada', sold: 'vendida', not_published: 'não publicada', archived: 'arquivada',
    prospected: 'prospectado', in_review: 'em análise', approved: 'aprovado', published: 'publicado', paused: 'pausado',
    draft: 'rascunho', valid: 'válido', under_review: 'em revisão', revoked: 'revogado',
    new: 'novo', contacted: 'contatado', qualified: 'qualificado', proposal: 'proposta', won: 'ganho', lost: 'perdido',
    received: 'recebido', screening: 'triagem', curatorial_review: 'curadoria', declined: 'recusado',
    requested: 'solicitada', confirmed: 'confirmada', expired: 'expirada', cancelled: 'cancelada', converted: 'convertida',
    sent: 'enviada', open: 'aberta', doing: 'fazendo', done: 'feito', low: 'baixa', normal: 'normal', high: 'alta'
  };

  let activePanel = 'submissions';
  let activeCreate = 'artistas';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clean = (value) => String(value ?? '').trim();

  function token() {
    return clean($('#admin-token')?.value || localStorage.getItem(TOKEN_KEY) || localStorage.getItem('arandu.admin.token'));
  }

  function headers() {
    return { 'Content-Type': 'application/json', 'x-arandu-admin-token': token() };
  }

  function setStatus(message, type = '') {
    const node = $('[data-admin-status]');
    if (!node) return;
    node.textContent = message || '';
    node.className = `admin-status ${type ? `is-${type}` : ''}`;
  }

  function label(value) {
    return statusLabels[value] || value || 'sem status';
  }

  function pick(item, keys) {
    for (const key of keys) {
      if (item?.[key] !== undefined && item?.[key] !== null && item?.[key] !== '') return item[key];
    }
    return '';
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `Erro ${response.status}`);
    return data;
  }

  function renderMetrics(metrics = {}, mode = '') {
    const root = $('[data-admin-dashboard]');
    if (!root) return;
    const order = [
      ['artists', 'artistas'], ['artworks', 'obras'], ['leads', 'leads'], ['submissions', 'submissões'], ['reservations', 'reservas'], ['certificates', 'certificados'], ['briefs', 'briefs'], ['proposals', 'propostas'], ['tasks', 'tarefas']
    ];
    root.innerHTML = order.map(([key, text]) => `<article class="admin-metric"><strong>${Number(metrics[key] || 0)}</strong><span>${text}</span></article>`).join('') + (mode === 'demo' ? '<p class="admin-help">Modo demo: configure o Supabase para ver dados reais.</p>' : '');
  }

  async function loadDashboard() {
    if (!token()) {
      renderMetrics({}, 'demo');
      return;
    }
    try {
      const data = await fetchJson(DASHBOARD, { headers: headers() });
      renderMetrics(data.metrics || {}, data.mode);
    } catch (error) {
      renderMetrics({}, 'demo');
    }
  }

  function renderPanelTabs() {
    const root = $('[data-admin-tabs]');
    if (!root) return;
    root.innerHTML = Object.entries(panels).map(([key, cfg]) => `<button class="admin-tab ${key === activePanel ? 'is-active' : ''}" type="button" data-admin-panel="${key}">${cfg.label}</button>`).join('');
  }

  function itemTitle(item, panel) {
    return clean(pick(item, panels[panel].title)) || item.id || 'Registro sem título';
  }

  function itemSubtitle(item, panel) {
    const values = panels[panel].subtitle.map((key) => item?.[key]).filter((value) => value !== undefined && value !== null && value !== '').map((value) => Array.isArray(value) ? value.join(', ') : value);
    return values.join(' · ') || item.id || '';
  }

  function renderPanel(data) {
    const root = $('[data-admin-list]');
    const title = $('[data-admin-panel-title]');
    if (title) title.textContent = panels[activePanel]?.label || activePanel;
    if (!root) return;
    const items = Array.isArray(data.items) ? data.items : [];
    const options = Array.isArray(data.statusOptions) ? data.statusOptions : [];
    if (!items.length) {
      root.innerHTML = `<div class="admin-help">${data.mode === 'demo' ? 'Painel disponível em modo demo. Configure Supabase e ARANDU_ADMIN_TOKEN para operar dados reais.' : 'Nenhum registro encontrado neste painel.'}</div>`;
      return;
    }
    root.innerHTML = items.map((item) => {
      const current = item[panels[activePanel].statusField] || item.status || '';
      const select = options.length ? `<select data-admin-status-select>${options.map((status) => `<option value="${status}" ${status === current ? 'selected' : ''}>${label(status)}</option>`).join('')}</select>` : `<small>${label(current)}</small>`;
      return `<article class="admin-item" data-admin-id="${item.id || ''}"><div><strong>${itemTitle(item, activePanel)}</strong><small>${itemSubtitle(item, activePanel)}</small></div>${select}<button class="cta secondary" type="button" data-admin-save-status>Atualizar</button></article>`;
    }).join('');
  }

  async function loadPanel(panel = activePanel) {
    activePanel = panel;
    renderPanelTabs();
    if (!token()) {
      renderPanel({ items: [], mode: 'demo' });
      setStatus('Informe o ARANDU_ADMIN_TOKEN para carregar o painel interno.', 'error');
      return;
    }
    setStatus('Carregando painel...');
    try {
      const data = await fetchJson(`${API}?panel=${encodeURIComponent(activePanel)}`, { headers: headers() });
      renderPanel(data);
      setStatus(data.mode === 'demo' ? 'Servidor em modo demo. Variáveis/Supabase ainda não estão completos.' : 'Painel carregado.', 'ok');
    } catch (error) {
      renderPanel({ items: [] });
      setStatus(error.message || 'Não foi possível carregar o painel.', 'error');
    }
  }

  async function updateStatus(card) {
    const id = clean(card?.dataset.adminId);
    const status = clean($('[data-admin-status-select]', card)?.value);
    if (!id || !status) return;
    setStatus('Atualizando status...');
    try {
      await fetchJson(API, { method: 'PATCH', headers: headers(), body: JSON.stringify({ panel: activePanel, id, status }) });
      setStatus('Status atualizado.', 'ok');
      await Promise.all([loadPanel(activePanel), loadDashboard()]);
    } catch (error) {
      setStatus(error.message || 'Erro ao atualizar status.', 'error');
    }
  }

  function renderCreateTabs() {
    $$('[data-create-tab]').forEach((button) => button.classList.toggle('is-active', button.dataset.createTab === activeCreate));
    $$('[data-admin-create]').forEach((form) => form.classList.toggle('is-active', form.dataset.adminCreate === activeCreate));
  }

  function formPayload(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    Object.keys(data).forEach((key) => { data[key] = clean(data[key]); });
    return data;
  }

  async function createRecord(form) {
    if (!token()) { setStatus('Informe o token administrativo antes de cadastrar.', 'error'); return; }
    const panel = form.dataset.adminCreate;
    setStatus('Criando registro...');
    try {
      await fetchJson(API, { method: 'POST', headers: headers(), body: JSON.stringify({ panel, data: formPayload(form) }) });
      form.reset();
      setStatus('Registro criado.', 'ok');
      await Promise.all([loadPanel(panel), loadDashboard()]);
    } catch (error) {
      setStatus(error.message || 'Erro ao criar registro.', 'error');
    }
  }

  function loadExtraAdminTools() {
    if (!document.body.classList.contains('admin-shell')) return;
    if (!document.getElementById('arandu-admin-ops-css')) {
      const link = document.createElement('link');
      link.id = 'arandu-admin-ops-css';
      link.rel = 'stylesheet';
      link.href = 'css/arandu-admin-ops.css?v=20260625';
      document.head.appendChild(link);
    }
    if (!document.getElementById('arandu-admin-ops-js')) {
      const script = document.createElement('script');
      script.id = 'arandu-admin-ops-js';
      script.src = 'js/admin-ops.js?v=20260625';
      script.defer = true;
      document.body.appendChild(script);
    }
  }

  function bind() {
    const tokenInput = $('#admin-token');
    if (tokenInput) tokenInput.value = localStorage.getItem(TOKEN_KEY) || localStorage.getItem('arandu.admin.token') || '';
    document.addEventListener('click', (event) => {
      const saveToken = event.target.closest('[data-admin-save-token]');
      if (saveToken) { const value=clean($('#admin-token')?.value); localStorage.setItem(TOKEN_KEY,value); localStorage.setItem('arandu.admin.token',value); setStatus('Token salvo neste navegador.', 'ok'); Promise.all([loadPanel(activePanel), loadDashboard()]); return; }
      const clearToken = event.target.closest('[data-admin-clear-token]');
      if (clearToken) { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('arandu.admin.token'); if (tokenInput) tokenInput.value = ''; setStatus('Token removido deste navegador.'); renderPanel({ items: [] }); return; }
      const panelButton = event.target.closest('[data-admin-panel]');
      if (panelButton) { loadPanel(panelButton.dataset.adminPanel); return; }
      const statusButton = event.target.closest('[data-admin-save-status]');
      if (statusButton) { updateStatus(statusButton.closest('[data-admin-id]')); return; }
      const createButton = event.target.closest('[data-create-tab]');
      if (createButton) { activeCreate = createButton.dataset.createTab; renderCreateTabs(); }
    });
    document.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-admin-create]');
      if (!form) return;
      event.preventDefault();
      createRecord(form);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadExtraAdminTools();
    bind();
    renderPanelTabs();
    renderCreateTabs();
    loadDashboard();
    loadPanel(activePanel);
  });
})();

const PANEL_ADMIN_TOKEN_KEY = 'arandu.admin.token';
const PANEL_LOCAL_STATUS_KEY = 'arandu.panel.status.v1';

const PANEL_CONFIG = {
  obras: {
    title: 'Obras cadastradas',
    empty: 'Nenhuma obra cadastrada ainda.',
    statusField: 'status',
    statusOptions: ['available', 'in_conversation', 'reserved', 'sold', 'not_published', 'archived'],
    fields: [['title', 'Obra'], ['artist_name', 'Artista'], ['language', 'Linguagem'], ['status', 'Status'], ['price', 'Preço']]
  },
  artistas: {
    title: 'Artistas cadastrados',
    empty: 'Nenhum artista cadastrado ainda.',
    statusField: 'status',
    statusOptions: ['prospected', 'in_review', 'approved', 'published', 'paused', 'archived'],
    fields: [['name', 'Artista'], ['city', 'Cidade'], ['state', 'UF'], ['languages', 'Linguagens'], ['status', 'Status']]
  },
  certificados: {
    title: 'Certificados emitidos',
    empty: 'Nenhum certificado emitido ainda.',
    statusField: 'verification_status',
    statusOptions: ['draft', 'valid', 'under_review', 'revoked'],
    fields: [['code', 'Código'], ['artwork_id', 'Obra'], ['issued_to', 'Emitido para'], ['verification_status', 'Status'], ['issued_at', 'Emissão']]
  },
  leads: {
    title: 'Leads e contatos',
    empty: 'Nenhum lead recebido ainda.',
    statusField: 'status',
    statusOptions: ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived'],
    fields: [['name', 'Nome'], ['type', 'Tipo'], ['email', 'Email'], ['whatsapp', 'WhatsApp'], ['status', 'Status']]
  },
  submissions: {
    title: 'Submissões de artistas',
    empty: 'Nenhuma submissão recebida ainda.',
    statusField: 'status',
    statusOptions: ['received', 'screening', 'curatorial_review', 'approved', 'declined', 'archived'],
    fields: [['artist_name', 'Artista'], ['city', 'Cidade'], ['languages', 'Linguagens'], ['portfolio_url', 'Portfólio'], ['status', 'Status']]
  },
  briefs: {
    title: 'Briefings empresariais',
    empty: 'Nenhum briefing recebido ainda.',
    statusField: 'status',
    statusOptions: ['received', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'archived'],
    fields: [['company', 'Empresa'], ['name', 'Contato'], ['environment', 'Ambiente'], ['budget', 'Orçamento'], ['status', 'Status']]
  },
  proposals: {
    title: 'Propostas curatoriais',
    empty: 'Nenhuma proposta criada ainda.',
    statusField: 'status',
    statusOptions: ['draft', 'sent', 'approved', 'declined', 'expired', 'archived'],
    fields: [['proposal_number', 'Proposta'], ['client', 'Cliente'], ['space', 'Espaço'], ['total', 'Total'], ['status', 'Status']]
  },
  reservations: {
    title: 'Reservas de obras',
    empty: 'Nenhuma reserva criada ainda.',
    statusField: 'status',
    statusOptions: ['requested', 'confirmed', 'expired', 'cancelled', 'converted'],
    fields: [['name', 'Cliente'], ['whatsapp', 'WhatsApp'], ['artwork_id', 'Obra'], ['deadline', 'Prazo'], ['status', 'Status']]
  },
  tasks: {
    title: 'Tarefas operacionais',
    empty: 'Nenhuma tarefa criada ainda.',
    statusField: 'status',
    statusOptions: ['open', 'doing', 'done', 'cancelled'],
    fields: [['title', 'Tarefa'], ['entity_type', 'Entidade'], ['owner_name', 'Responsável'], ['due_at', 'Prazo'], ['status', 'Status']]
  }
};

const PANEL_DEMO = {
  obras: [
    { id: 'estudo-de-solo-04', title: 'Estudo de Solo Nº 04', artist_name: 'Marina Silveira', language: 'Pintura', status: 'available', price: 4200 },
    { id: 'sertao-silencioso', title: 'Sertão Silencioso', artist_name: 'Camila Rebouças', language: 'Fotografia', status: 'available', price: 2100 },
    { id: 'equilibrio-suspenso', title: 'Equilíbrio Suspenso', artist_name: "Arthur D'Avila", language: 'Escultura', status: 'in_conversation', price: 8900 }
  ],
  artistas: [
    { id: 'marina-silveira', name: 'Marina Silveira', city: 'São Paulo', state: 'SP', languages: ['pintura', 'matéria'], status: 'published' },
    { id: 'camila-reboucas', name: 'Camila Rebouças', city: 'Recife', state: 'PE', languages: ['fotografia', 'território'], status: 'published' }
  ],
  certificados: [
    { id: 'cert-1', code: 'ARD-2026-0001', artwork_id: 'estudo-de-solo-04', issued_to: 'Registro curatorial interno', verification_status: 'valid', issued_at: '2026-06-08T12:00:00.000Z' },
    { id: 'cert-2', code: 'ARD-2026-0002', artwork_id: 'sertao-silencioso', issued_to: 'Registro curatorial interno', verification_status: 'valid', issued_at: '2026-06-08T12:00:00.000Z' }
  ],
  leads: [],
  submissions: [],
  briefs: [],
  proposals: [
    { id: 'prop-1', proposal_number: 'ARD-PROP-DEMO', client: 'Clínica Horizonte', space: 'Recepção', total: 15300, status: 'draft' }
  ],
  reservations: [
    { id: 'res-1', name: 'Clínica Horizonte', whatsapp: '+55 21 90000-0000', artwork_id: 'sertao-silencioso', deadline: '2026-06-15T12:00:00.000Z', status: 'requested' }
  ],
  tasks: [
    { id: 'task-1', title: 'Enviar proposta revisada para clínica', entity_type: 'proposal', owner_name: 'Curadoria', due_at: '2026-06-12T12:00:00.000Z', status: 'open' }
  ]
};

let lastRemoteMode = 'demo';

function panelToken() {
  return localStorage.getItem(PANEL_ADMIN_TOKEN_KEY) || '';
}

function setPanelToken(value) {
  localStorage.setItem(PANEL_ADMIN_TOKEN_KEY, String(value || '').trim());
}

function panelStatus(text, isError = false) {
  document.querySelectorAll('[data-panel-status]').forEach((node) => {
    node.textContent = text;
    node.style.color = isError ? '#7b1f17' : '#6f221b';
  });
}

function escapePanelHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

function readStatusOverrides() {
  try {
    return JSON.parse(localStorage.getItem(PANEL_LOCAL_STATUS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeStatusOverrides(data) {
  localStorage.setItem(PANEL_LOCAL_STATUS_KEY, JSON.stringify(data));
}

function readLocalArray(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function getPath(object, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : null), object);
}

function formatValue(value, field) {
  if (Array.isArray(value)) return escapePanelHtml(value.join(', '));
  if ((field === 'price' || field === 'total') && value !== null && value !== undefined) {
    return escapePanelHtml(Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  }
  if ((field.endsWith('_at') || field === 'deadline' || field === 'due_at') && value) {
    return escapePanelHtml(new Date(value).toLocaleString('pt-BR'));
  }
  if (field.includes('url') && value) {
    return `<a href="${escapePanelHtml(value)}" target="_blank" rel="noreferrer">Abrir</a>`;
  }
  return escapePanelHtml(value || '—');
}

function currentPanel() {
  return document.body.dataset.operationalPanel;
}

function currentConfig() {
  return PANEL_CONFIG[currentPanel()];
}

function currentItems() {
  return window.__ARANDU_PANEL_ITEMS__ || [];
}

function itemStatus(item) {
  const config = currentConfig();
  return item?.[config?.statusField || 'status'] || item?.status || item?.verification_status || 'sem_status';
}

function searchableText(item) {
  return JSON.stringify(item).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function activeFilters() {
  return {
    q: (document.querySelector('[data-panel-filter-q]')?.value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    status: document.querySelector('[data-panel-filter-status]')?.value || 'all'
  };
}

function filteredItems() {
  const { q, status } = activeFilters();
  return currentItems().filter((item) => (status === 'all' || itemStatus(item) === status) && (!q || searchableText(item).includes(q)));
}

function normalizeLead(item) {
  const data = item.data || item.payload?.data || {};
  return {
    id: item.id || item.local_id || `lead_${Date.now()}`,
    name: data.nome || data.name || data.nome_artistico || data.empresa || item.name || 'Lead sem nome',
    type: item.type || item.form_type || 'contato',
    email: data.email || item.email || '—',
    whatsapp: data.whatsapp || data.telefone || item.whatsapp || '—',
    company: data.empresa || item.company || '—',
    environment: data.tipo_projeto || data.ambiente || item.environment || '—',
    budget: data.orcamento || item.budget || '—',
    status: item.status || 'new',
    payload: item
  };
}

function normalizeReservation(item) {
  return {
    id: item.id || item.local_id || `reservation_${Date.now()}`,
    name: item.name || item.client_name || 'Solicitante sem nome',
    whatsapp: item.whatsapp || item.client_whatsapp || '—',
    artwork_id: item.artwork_id || item.artworkId || item.id || item.title || '—',
    deadline: item.deadline || item.reserved_until || item.createdAt || null,
    status: item.status || 'requested',
    payload: item
  };
}

function normalizeProposal(item) {
  const items = Array.isArray(item.items) ? item.items : [];
  const total = Number(item.total || 0) || items.reduce((sum, work) => sum + Number(work.price || 0), 0);
  return {
    id: item.id || item.local_id || `proposal_${Date.now()}`,
    proposal_number: item.proposal_number || 'Proposta curatorial',
    client: item.client || item.client_name || 'Cliente não informado',
    space: item.space || item.company || '—',
    total,
    status: item.status || 'draft',
    payload: item
  };
}

function itemsForPanel(panel, remoteData = null) {
  if (remoteData?.mode === 'stored') return remoteData.items || [];

  const overrides = readStatusOverrides();
  const localLeads = readLocalArray('arandu.leads.v1').map(normalizeLead);
  const localReservations = readLocalArray('arandu.reservations.v1').map(normalizeReservation);
  const localProposals = readLocalArray('arandu.proposals.history.v1').map(normalizeProposal);
  const base = panel === 'leads' ? [...localLeads, ...PANEL_DEMO.leads]
    : panel === 'briefs' ? localLeads.filter((lead) => lead.type === 'empresa-intencao' || lead.type === 'proposta-empresa')
    : panel === 'submissions' ? localLeads.filter((lead) => lead.type === 'submissao-artista').map((lead) => ({
      ...lead,
      artist_name: lead.name,
      city: lead.payload?.data?.cidade || '—',
      languages: lead.payload?.data?.linguagens || '—',
      portfolio_url: lead.payload?.data?.portfolio || '—'
    }))
    : panel === 'reservations' ? [...localReservations, ...PANEL_DEMO.reservations]
    : panel === 'proposals' ? [...localProposals, ...PANEL_DEMO.proposals]
    : (PANEL_DEMO[panel] || []);

  const config = PANEL_CONFIG[panel] || {};
  const statusField = config.statusField || 'status';
  return base.map((item) => ({ ...item, [statusField]: overrides[item.id] || item[statusField] || item.status || item.verification_status }));
}

async function adminRequest(path, options = {}) {
  const token = panelToken();
  if (!token) return null;
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-arandu-admin-token': token,
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Não foi possível consultar o painel administrativo.');
  return data;
}

async function fetchRemotePanel(panel) {
  if (!panelToken()) return null;
  try {
    return await adminRequest(`/api/admin?panel=${encodeURIComponent(panel)}`, { method: 'GET' });
  } catch (error) {
    panelStatus(`Não foi possível conectar o painel ao banco: ${error.message}. Usando dados locais.`, true);
    return null;
  }
}

function renderMetrics(items) {
  const target = document.querySelector('[data-panel-metrics]');
  if (!target) return;
  const byStatus = items.reduce((acc, item) => {
    const status = itemStatus(item);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  target.innerHTML = `<div class="grid grid-4"><article class="card"><h3>${items.length}</h3><p>Total filtrado</p></article>${Object.entries(byStatus).slice(0, 7).map(([status, count]) => `<article class="card"><h3>${count}</h3><p>${escapePanelHtml(status)}</p></article>`).join('')}</div>`;
}

function renderFilters(config) {
  const target = document.querySelector('[data-panel-filters]');
  if (!target) return;
  target.innerHTML = `<div class="form-card"><h3>Filtros e ações em lote</h3><div class="grid grid-4"><input data-panel-filter-q placeholder="Buscar por nome, obra, cidade, email..."/><select data-panel-filter-status><option value="all">Todos os status</option>${config.statusOptions.map((status) => `<option value="${escapePanelHtml(status)}">${escapePanelHtml(status)}</option>`).join('')}</select><select data-panel-bulk-status><option value="">Novo status em lote</option>${config.statusOptions.map((status) => `<option value="${escapePanelHtml(status)}">${escapePanelHtml(status)}</option>`).join('')}</select><button class="button secondary" type="button" data-panel-bulk-apply>Aplicar aos selecionados</button></div></div>`;
}

function renderTable(config, items) {
  const target = document.querySelector('[data-panel-table]');
  if (!target) return;
  const visible = items || filteredItems();
  renderMetrics(visible);
  if (!visible.length) {
    target.innerHTML = `<div class="card"><h3>${escapePanelHtml(config.empty)}</h3><p>Nenhum registro corresponde aos filtros atuais.</p></div>`;
    return;
  }
  const header = '<th><input type="checkbox" data-select-all /></th>' + config.fields.map(([, label]) => `<th>${escapePanelHtml(label)}</th>`).join('') + '<th>Ação</th>';
  const rows = visible.map((item) => {
    const cells = config.fields.map(([field]) => `<td>${formatValue(getPath(item, field), field)}</td>`).join('');
    const currentStatus = itemStatus(item);
    const options = config.statusOptions.map((status) => `<option value="${escapePanelHtml(status)}" ${status === currentStatus ? 'selected' : ''}>${escapePanelHtml(status)}</option>`).join('');
    return `<tr><td><input type="checkbox" data-row-select="${escapePanelHtml(item.id)}" /></td>${cells}<td><select data-status-select="${escapePanelHtml(item.id)}">${options}</select><button class="tag" type="button" data-save-status="${escapePanelHtml(item.id)}">Salvar</button><button class="tag" type="button" data-open-detail="${escapePanelHtml(item.id)}">Detalhes</button></td></tr>`;
  }).join('');
  target.innerHTML = `<div class="card"><h3>${escapePanelHtml(config.title)}</h3><div style="overflow:auto"><table class="compare-table"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

async function loadPanel() {
  const config = currentConfig();
  const panel = currentPanel();
  if (!config) return;
  panelStatus(panelToken() ? 'Carregando painel conectado...' : 'Carregando painel local/demo...');
  const remoteData = await fetchRemotePanel(panel);
  lastRemoteMode = remoteData?.mode || 'demo';
  window.__ARANDU_PANEL_ITEMS__ = itemsForPanel(panel, remoteData);
  renderFilters(config);
  renderTable(config, currentItems());

  if (lastRemoteMode === 'stored') {
    panelStatus('Painel conectado ao Supabase. Alterações de status serão salvas no banco.');
  } else if (panelToken()) {
    panelStatus('Token informado, mas o Supabase ainda não está disponível. Alterações ficarão locais.');
  } else {
    panelStatus('Painel operacional em modo local/demo. Informe o ARANDU_ADMIN_TOKEN para conectar ao banco.');
  }
}

function saveLocalStatus(id, status) {
  const config = currentConfig();
  const statusField = config.statusField || 'status';
  const overrides = readStatusOverrides();
  overrides[id] = status;
  writeStatusOverrides(overrides);
  const item = currentItems().find((row) => String(row.id) === String(id));
  if (item) item[statusField] = status;
}

async function saveStatus(id, forcedStatus = null) {
  const panel = currentPanel();
  const config = currentConfig();
  const select = document.querySelector(`[data-status-select="${CSS.escape(id)}"]`);
  const status = forcedStatus || select?.value;
  if (!status) return;

  if (panelToken() && lastRemoteMode === 'stored') {
    try {
      const result = await adminRequest('/api/admin', {
        method: 'PATCH',
        body: JSON.stringify({ panel, id, status })
      });
      const record = result?.record;
      const itemIndex = currentItems().findIndex((row) => String(row.id) === String(id));
      if (itemIndex >= 0 && record) currentItems()[itemIndex] = { ...currentItems()[itemIndex], ...record };
      panelStatus(`Status salvo no banco em ${config.title}.`);
      return;
    } catch (error) {
      saveLocalStatus(id, status);
      panelStatus(`Falha ao salvar no banco: ${error.message}. Status salvo localmente como contingência.`, true);
      return;
    }
  }

  saveLocalStatus(id, status);
  panelStatus(`Status salvo localmente em ${config.title}.`);
}

async function bulkApply() {
  const ids = Array.from(document.querySelectorAll('[data-row-select]:checked')).map((input) => input.dataset.rowSelect);
  const status = document.querySelector('[data-panel-bulk-status]')?.value;
  if (!ids.length || !status) {
    panelStatus('Selecione registros e um novo status.', true);
    return;
  }
  for (const id of ids) await saveStatus(id, status);
  await loadPanel();
}

function exportCsv() {
  const items = filteredItems();
  if (!items.length) return;
  const keys = Array.from(items.reduce((set, item) => {
    Object.keys(item).forEach((key) => set.add(key));
    return set;
  }, new Set()));
  const csv = [keys.join(','), ...items.map((item) => keys.map((key) => `"${String(item[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `arandu-${currentPanel()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('click', async (event) => {
  const save = event.target.closest('[data-save-status]');
  if (save) {
    await saveStatus(save.dataset.saveStatus);
    renderTable(currentConfig());
  }
  if (event.target.closest('[data-panel-refresh]')) await loadPanel();
  if (event.target.closest('[data-panel-export]')) exportCsv();
  if (event.target.closest('[data-panel-bulk-apply]')) await bulkApply();
  if (event.target.closest('[data-select-all]')) {
    document.querySelectorAll('[data-row-select]').forEach((input) => { input.checked = event.target.checked; });
  }
});

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-admin-token]')) setPanelToken(event.target.value);
  if (event.target.matches('[data-panel-filter-q]')) renderTable(currentConfig());
});

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-panel-filter-status]')) renderTable(currentConfig());
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-admin-token]').forEach((input) => { input.value = panelToken(); });
  loadPanel();
});

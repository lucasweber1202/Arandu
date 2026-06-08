const PANEL_ADMIN_TOKEN_KEY = 'arandu.admin.token';

const PANEL_CONFIG = {
  obras: {
    endpoint: '/api/admin/artworks',
    listKey: 'artworks',
    title: 'Obras cadastradas',
    empty: 'Nenhuma obra cadastrada ainda.',
    statusOptions: ['available', 'in_conversation', 'temporarily_reserved', 'sold', 'on_hold', 'not_published'],
    fields: [
      ['title', 'Obra'], ['artists.name', 'Artista'], ['language', 'Linguagem'], ['status', 'Status'], ['price_cents', 'Preço']
    ]
  },
  artistas: {
    endpoint: '/api/admin/artists',
    listKey: 'artists',
    title: 'Artistas cadastrados',
    empty: 'Nenhum artista cadastrado ainda.',
    statusOptions: ['draft', 'screening', 'approved', 'published', 'paused', 'archived'],
    fields: [
      ['name', 'Artista'], ['city', 'Cidade'], ['state', 'UF'], ['languages', 'Linguagens'], ['status', 'Status']
    ]
  },
  certificados: {
    endpoint: '/api/admin/certificates',
    listKey: 'certificates',
    title: 'Certificados emitidos',
    empty: 'Nenhum certificado emitido ainda.',
    statusOptions: ['draft', 'valid', 'revoked', 'under_review'],
    fields: [
      ['code', 'Código'], ['artworks.title', 'Obra'], ['issued_to', 'Emitido para'], ['verification_status', 'Status'], ['issued_at', 'Emissão']
    ]
  },
  leads: {
    endpoint: '/api/admin/crm?type=leads',
    listKey: 'items',
    title: 'Leads e contatos',
    empty: 'Nenhum lead recebido ainda.',
    statusOptions: ['new', 'qualified', 'in_conversation', 'proposal_sent', 'converted', 'archived'],
    fields: [
      ['name', 'Nome'], ['type', 'Tipo'], ['email', 'Email'], ['whatsapp', 'WhatsApp'], ['status', 'Status']
    ]
  },
  submissions: {
    endpoint: '/api/admin/crm?type=submissions',
    listKey: 'items',
    title: 'Submissões de artistas',
    empty: 'Nenhuma submissão recebida ainda.',
    statusOptions: ['received', 'screening', 'curatorial_review', 'approved', 'not_now', 'published', 'archived'],
    fields: [
      ['artist_name', 'Artista'], ['city', 'Cidade'], ['languages', 'Linguagens'], ['portfolio_url', 'Portfólio'], ['status', 'Status']
    ]
  },
  briefs: {
    endpoint: '/api/admin/crm?type=briefs',
    listKey: 'items',
    title: 'Briefings empresariais',
    empty: 'Nenhum briefing recebido ainda.',
    statusOptions: ['received', 'reviewing', 'proposal_draft', 'proposal_sent', 'won', 'lost', 'archived'],
    fields: [
      ['company', 'Empresa'], ['name', 'Contato'], ['environment', 'Ambiente'], ['budget', 'Orçamento'], ['status', 'Status']
    ]
  }
};

function panelToken() { return localStorage.getItem(PANEL_ADMIN_TOKEN_KEY) || ''; }
function setPanelToken(value) { localStorage.setItem(PANEL_ADMIN_TOKEN_KEY, value.trim()); }
function panelStatus(text, isError = false) {
  document.querySelectorAll('[data-panel-status]').forEach((node) => {
    node.textContent = text;
    node.style.color = isError ? '#7b1f17' : '#6f221b';
  });
}
function getPath(object, path) {
  return path.split('.').reduce((acc, key) => acc && acc[key] !== undefined ? acc[key] : null, object);
}
function formatValue(value, field) {
  if (Array.isArray(value)) return value.join(', ');
  if (field === 'price_cents' && value !== null && value !== undefined) return (Number(value) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (field.endsWith('_at') && value) return new Date(value).toLocaleString('pt-BR');
  if (field.includes('url') && value) return `<a href="${value}" target="_blank" rel="noreferrer">Abrir</a>`;
  return value || '—';
}
async function panelRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-arandu-admin-token': panelToken(), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Erro no painel.');
  return data;
}
function renderMetrics(items) {
  const target = document.querySelector('[data-panel-metrics]');
  if (!target) return;
  const byStatus = items.reduce((acc, item) => {
    const status = item.status || item.verification_status || 'sem_status';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  target.innerHTML = `<div class="grid grid-4"><article class="card"><h3>${items.length}</h3><p>Total</p></article>${Object.entries(byStatus).slice(0, 3).map(([status, count]) => `<article class="card"><h3>${count}</h3><p>${status}</p></article>`).join('')}</div>`;
}
function renderTable(config, items) {
  const target = document.querySelector('[data-panel-table]');
  if (!target) return;
  if (!items.length) {
    target.innerHTML = `<div class="card"><h3>${config.empty}</h3><p>Quando o Supabase estiver configurado, os registros aparecerão aqui.</p></div>`;
    return;
  }
  const header = config.fields.map(([, label]) => `<th>${label}</th>`).join('') + '<th>Ação</th>';
  const rows = items.map((item) => {
    const cells = config.fields.map(([field]) => `<td>${formatValue(getPath(item, field), field)}</td>`).join('');
    const currentStatus = item.status || item.verification_status || '';
    const options = config.statusOptions.map((status) => `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${status}</option>`).join('');
    return `<tr>${cells}<td><select data-status-select="${item.id}">${options}</select><button class="tag" type="button" data-save-status="${item.id}">Salvar</button></td></tr>`;
  }).join('');
  target.innerHTML = `<div class="card"><h3>${config.title}</h3><div style="overflow:auto"><table class="compare-table"><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
async function loadPanel() {
  const panel = document.body.dataset.operationalPanel;
  const config = PANEL_CONFIG[panel];
  if (!config) return;
  if (!panelToken()) {
    panelStatus('Informe o token administrativo para carregar dados.', true);
    return;
  }
  try {
    panelStatus('Carregando dados...');
    const data = await panelRequest(config.endpoint);
    const items = data[config.listKey] || [];
    window.__ARANDU_PANEL_ITEMS__ = items;
    renderMetrics(items);
    renderTable(config, items);
    panelStatus(data.mode === 'demo' ? 'Modo demonstração: Supabase não configurado.' : 'Dados carregados.');
  } catch (error) {
    panelStatus(error.message, true);
  }
}
async function saveStatus(id) {
  const panel = document.body.dataset.operationalPanel;
  const config = PANEL_CONFIG[panel];
  const select = document.querySelector(`[data-status-select="${id}"]`);
  if (!config || !select) return;
  const field = panel === 'certificados' ? 'verification_status' : 'status';
  try {
    panelStatus('Atualizando status...');
    await panelRequest(config.endpoint, { method: 'PATCH', body: JSON.stringify({ id, [field]: select.value }) });
    panelStatus('Status atualizado.');
    await loadPanel();
  } catch (error) {
    panelStatus(error.message, true);
  }
}
function exportCsv() {
  const items = window.__ARANDU_PANEL_ITEMS__ || [];
  if (!items.length) return;
  const keys = Array.from(items.reduce((set, item) => { Object.keys(item).forEach((key) => set.add(key)); return set; }, new Set()));
  const csv = [keys.join(','), ...items.map((item) => keys.map((key) => `"${String(item[key] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `arandu-${document.body.dataset.operationalPanel}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
document.addEventListener('click', (event) => {
  const save = event.target.closest('[data-save-status]');
  if (save) saveStatus(save.dataset.saveStatus);
  if (event.target.closest('[data-panel-refresh]')) loadPanel();
  if (event.target.closest('[data-panel-export]')) exportCsv();
});
document.addEventListener('input', (event) => {
  if (event.target.matches('[data-admin-token]')) setPanelToken(event.target.value);
});
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-admin-token]').forEach((input) => { input.value = panelToken(); });
  loadPanel();
});

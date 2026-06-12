import { dataRequest, hasDataConfig, json, readBody } from './_arandu.js';

const ADMIN_TOKEN = process.env.ARANDU_ADMIN_TOKEN;

const PANELS = {
  obras: {
    table: 'artworks',
    read: 'v_artworks_full?select=*&order=created_at.desc',
    statusField: 'status',
    statuses: ['available', 'in_conversation', 'reserved', 'sold', 'not_published', 'archived']
  },
  artistas: {
    table: 'artists',
    read: 'artists?select=*&order=created_at.desc',
    statusField: 'status',
    statuses: ['prospected', 'in_review', 'approved', 'published', 'paused', 'archived']
  },
  certificados: {
    table: 'certificates',
    read: 'certificates?select=*&order=created_at.desc',
    statusField: 'verification_status',
    statuses: ['draft', 'valid', 'under_review', 'revoked']
  },
  leads: {
    table: 'leads',
    read: 'leads?select=*&order=created_at.desc',
    statusField: 'status',
    statuses: ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived']
  },
  submissions: {
    table: 'artist_submissions',
    read: 'artist_submissions?select=*&order=created_at.desc',
    statusField: 'status',
    statuses: ['received', 'screening', 'curatorial_review', 'approved', 'declined', 'archived']
  },
  briefs: {
    table: 'company_briefs',
    read: 'company_briefs?select=*&order=created_at.desc',
    statusField: 'status',
    statuses: ['received', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'archived']
  },
  proposals: {
    table: 'proposals',
    read: 'proposals?select=*&order=created_at.desc',
    statusField: 'status',
    statuses: ['draft', 'sent', 'approved', 'declined', 'expired', 'archived']
  },
  reservations: {
    table: 'reservations',
    read: 'reservations?select=*&order=created_at.desc',
    statusField: 'status',
    statuses: ['requested', 'confirmed', 'expired', 'cancelled', 'converted']
  },
  tasks: {
    table: 'tasks',
    read: 'tasks?select=*&order=created_at.desc',
    statusField: 'status',
    statuses: ['open', 'doing', 'done', 'cancelled']
  }
};

const CREATE_ALIASES = {
  artist: 'artistas',
  artista: 'artistas',
  artists: 'artistas',
  artwork: 'obras',
  obra: 'obras',
  artworks: 'obras',
  certificate: 'certificados',
  certificado: 'certificados',
  certificates: 'certificados',
  task: 'tasks',
  tarefa: 'tasks'
};

function tokenFrom(req) {
  const headerToken = req.headers['x-arandu-admin-token'] || req.headers['X-Arandu-Admin-Token'];
  const authorization = req.headers.authorization || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return String(headerToken || bearer || '').trim();
}

function adminGuard(req) {
  if (!ADMIN_TOKEN) {
    return { ok: false, status: 503, error: 'ARANDU_ADMIN_TOKEN não configurado no servidor.' };
  }
  if (tokenFrom(req) !== ADMIN_TOKEN) {
    return { ok: false, status: 401, error: 'Acesso administrativo não autorizado.' };
  }
  return { ok: true };
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function listFrom(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function money(value) {
  const parsed = Number(String(value || '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function panelConfig(panel) {
  return PANELS[String(panel || '').trim()] || null;
}

function panelFromBody(body) {
  const raw = body.panel || body.type || body.resource || body.kind;
  return CREATE_ALIASES[String(raw || '').trim()] || String(raw || '').trim();
}

function normalizeArtist(body) {
  const name = body.name || body.artist_name;
  const id = body.id || slugify(name);
  return {
    id,
    name,
    legal_name: body.legal_name || null,
    slug: body.slug || id,
    city: body.city || null,
    state: body.state || null,
    languages: listFrom(body.languages),
    curatorial_axes: listFrom(body.axes || body.curatorial_axes),
    profile: body.bio || body.profile || null,
    trajectory: body.trajectory || body.bio || body.profile || null,
    portfolio_url: body.portfolio_url || null,
    instagram: body.instagram || null,
    status: body.status && PANELS.artistas.statuses.includes(body.status) ? body.status : 'in_review',
    payload: body
  };
}

function normalizeArtwork(body) {
  const title = body.title;
  const id = body.id || slugify(title);
  const status = body.status === 'temporarily_reserved' ? 'reserved' : body.status;
  return {
    id,
    slug: body.slug || id,
    title,
    artist_id: body.artist_id || body.artistId || null,
    language: body.language || null,
    type: body.type || body.language || null,
    technique: body.technique || null,
    year: body.year || null,
    dimensions: body.dimensions || null,
    price: money(body.price),
    price_label: body.price_label || null,
    status: PANELS.obras.statuses.includes(status) ? status : 'available',
    certificate: true,
    tags: listFrom(body.tags),
    search: [title, body.technique, body.tags].filter(Boolean).join(' '),
    summary: body.summary || body.curatorial_note || null,
    curatorial_reading: body.curatorial_note || body.curatorial_reading || null,
    published: status !== 'not_published',
    payload: body
  };
}

function normalizeCertificate(body) {
  const status = body.status || body.verification_status || 'draft';
  return {
    code: String(body.code || '').trim().toUpperCase(),
    artwork_id: body.artwork_id || body.artworkId || null,
    artist_id: body.artist_id || body.artistId || null,
    issued_to: body.issued_to || null,
    verification_status: PANELS.certificados.statuses.includes(status) ? status : 'draft',
    issued_at: status === 'valid' ? new Date().toISOString() : null,
    certificate_notes: body.criterios || body.certificate_notes || null,
    payload: body
  };
}

function normalizeTask(body) {
  return {
    title: body.title,
    entity_type: body.entity_type || null,
    entity_id: body.entity_id || null,
    owner_name: body.owner_name || 'Curadoria',
    due_at: body.due_at || null,
    priority: ['low', 'normal', 'high'].includes(body.priority) ? body.priority : 'normal',
    status: PANELS.tasks.statuses.includes(body.status) ? body.status : 'open'
  };
}

function normalizeRecord(panel, body) {
  if (panel === 'artistas') return normalizeArtist(body);
  if (panel === 'obras') return normalizeArtwork(body);
  if (panel === 'certificados') return normalizeCertificate(body);
  if (panel === 'tasks') return normalizeTask(body);
  return null;
}

function validateRecord(panel, record) {
  if (panel === 'artistas' && !record.name) return 'Nome do artista é obrigatório.';
  if (panel === 'obras' && !record.title) return 'Título da obra é obrigatório.';
  if (panel === 'obras' && !record.artist_id) return 'ID do artista é obrigatório para cadastrar obra.';
  if (panel === 'certificados' && !record.code) return 'Código do certificado é obrigatório.';
  if (panel === 'certificados' && !record.artwork_id) return 'ID da obra é obrigatório para certificado.';
  if (panel === 'tasks' && !record.title) return 'Título da tarefa é obrigatório.';
  return null;
}

async function listPanel(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const panel = url.searchParams.get('panel');
  const config = panelConfig(panel);
  if (!config) return json(res, 400, { ok: false, error: 'Painel inválido.' });
  if (!hasDataConfig()) {
    return json(res, 202, { ok: true, mode: 'demo', panel, statusOptions: config.statuses, items: [] });
  }
  const items = await dataRequest(config.read, { method: 'GET', headers: { Prefer: '' } });
  return json(res, 200, { ok: true, mode: 'stored', panel, statusOptions: config.statuses, items: items || [] });
}

async function createRecord(req, res) {
  const body = await readBody(req);
  const panel = panelFromBody(body);
  const config = panelConfig(panel);
  if (!config) return json(res, 400, { ok: false, error: 'Tipo de cadastro inválido.' });
  const record = normalizeRecord(panel, body.data || body);
  if (!record) return json(res, 400, { ok: false, error: 'Este painel ainda não possui criação administrativa.' });
  const validation = validateRecord(panel, record);
  if (validation) return json(res, 400, { ok: false, error: validation });
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, panel, record });
  const saved = await dataRequest(config.table, { method: 'POST', body: JSON.stringify(record) });
  const row = Array.isArray(saved) ? saved[0] || null : saved;
  return json(res, 201, { ok: true, mode: 'stored', stored: true, panel, record: row });
}

async function patchStatus(req, res) {
  const body = await readBody(req);
  const panel = String(body.panel || '').trim();
  const id = String(body.id || '').trim();
  const status = String(body.status || '').trim();
  const config = panelConfig(panel);

  if (!config) return json(res, 400, { ok: false, error: 'Painel inválido.' });
  if (!id) return json(res, 400, { ok: false, error: 'ID obrigatório.' });
  if (!config.statuses.includes(status)) return json(res, 400, { ok: false, error: 'Status inválido para este painel.' });
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, panel, id, status });

  const payload = {
    [config.statusField]: status,
    updated_at: new Date().toISOString()
  };
  const rows = await dataRequest(`${config.table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload)
  });
  const record = Array.isArray(rows) ? rows[0] || null : rows;
  if (!record) return json(res, 404, { ok: false, error: 'Registro não encontrado.' });
  return json(res, 200, { ok: true, mode: 'stored', stored: true, panel, record });
}

export default async function handler(req, res) {
  try {
    const guard = adminGuard(req);
    if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error });
    if (req.method === 'GET') return listPanel(req, res);
    if (req.method === 'POST') return createRecord(req, res);
    if (req.method === 'PATCH') return patchStatus(req, res);
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

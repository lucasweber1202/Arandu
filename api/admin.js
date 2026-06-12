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

function panelConfig(panel) {
  return PANELS[String(panel || '').trim()] || null;
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
    if (req.method === 'PATCH') return patchStatus(req, res);
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

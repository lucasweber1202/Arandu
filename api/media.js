import { dataRequest, hasDataConfig, json, readBody } from './_arandu.js';

const ADMIN_TOKEN = process.env.ARANDU_ADMIN_TOKEN;

function guard(req) {
  const token = String(req.headers['x-arandu-admin-token'] || '').trim();
  if (!ADMIN_TOKEN) return { ok: false, status: 503, error: 'ARANDU_ADMIN_TOKEN não configurado no servidor.' };
  if (token !== ADMIN_TOKEN) return { ok: false, status: 401, error: 'Acesso administrativo não autorizado.' };
  return { ok: true };
}

function clean(value) { return String(value || '').trim(); }
function validUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol); } catch { return false; } }

async function listMedia(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const entityType = clean(url.searchParams.get('entity_type'));
  const entityId = clean(url.searchParams.get('entity_id'));
  if (!entityType || !entityId) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' });
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', items: [] });
  const rows = await dataRequest(`media_assets?select=*&entity_type=eq.${encodeURIComponent(entityType)}&entity_id=eq.${encodeURIComponent(entityId)}&order=position.asc,created_at.desc`, { method: 'GET', headers: { Prefer: '' } });
  return json(res, 200, { ok: true, mode: 'stored', items: rows || [] });
}

async function createMedia(req, res) {
  const body = await readBody(req);
  const record = {
    entity_type: clean(body.entity_type),
    entity_id: clean(body.entity_id),
    asset_type: clean(body.asset_type) || 'image',
    url: clean(body.url),
    alt: clean(body.alt) || null,
    position: Number.isFinite(Number(body.position)) ? Number(body.position) : 1,
    payload: body.payload && typeof body.payload === 'object' ? body.payload : {}
  };
  if (!record.entity_type || !record.entity_id) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' });
  if (!record.url || !validUrl(record.url)) return json(res, 400, { ok: false, error: 'URL de mídia inválida.' });
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, record });
  const saved = await dataRequest('media_assets', { method: 'POST', body: JSON.stringify(record) });
  return json(res, 201, { ok: true, mode: 'stored', stored: true, record: Array.isArray(saved) ? saved[0] || null : saved });
}

export default async function handler(req, res) {
  try {
    const access = guard(req);
    if (!access.ok) return json(res, access.status, { ok: false, error: access.error });
    if (req.method === 'GET') return listMedia(req, res);
    if (req.method === 'POST') return createMedia(req, res);
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

import { dataRequest, firstRecord, hasDataConfig, json, readBody } from './_arandu.js';

function clean(value) {
  return String(value || '').trim();
}

function normalizeSelection(body) {
  const briefing = body.briefing && typeof body.briefing === 'object' ? body.briefing : {};
  const items = Array.isArray(body.items) ? body.items.slice(0, 40) : [];
  return {
    name: clean(body.name || briefing.nome || briefing.name) || null,
    email: clean(body.email || briefing.email) || null,
    whatsapp: clean(body.whatsapp || briefing.whatsapp || briefing.telefone) || null,
    items,
    briefing: {
      ...briefing,
      source: body.source || briefing.source || 'minha-selecao',
      shared_at: body.createdAt || new Date().toISOString()
    },
    status: 'sent'
  };
}

async function createSelection(req, res) {
  const body = await readBody(req);
  const record = normalizeSelection(body);
  if (!record.items.length) return json(res, 400, { ok: false, error: 'Seleção sem obras.' });
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, selection: record });
  const saved = await dataRequest('saved_selections', { method: 'POST', body: JSON.stringify(record) });
  return json(res, 201, { ok: true, mode: 'stored', stored: true, selection: firstRecord(saved) });
}

async function readSelection(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const token = clean(url.searchParams.get('token') || url.searchParams.get('id'));
  if (!token) return json(res, 400, { ok: false, error: 'Token obrigatório.' });
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', selection: null });
  const rows = await dataRequest(`saved_selections?public_token=eq.${encodeURIComponent(token)}&select=*&limit=1`, { method: 'GET', headers: { Prefer: '' } });
  return json(res, 200, { ok: true, mode: 'stored', selection: firstRecord(rows) });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') return readSelection(req, res);
    if (req.method === 'POST') return createSelection(req, res);
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

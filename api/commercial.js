import { dataRequest, firstRecord, hasDataConfig, json, readBody } from './_arandu.js';

const ADMIN_TOKEN = process.env.ARANDU_ADMIN_TOKEN;
const STATUS = ['draft','confirmed','completed','cancelled'];

function guard(req) {
  const token = String(req.headers['x-arandu-admin-token'] || '').trim();
  if (!ADMIN_TOKEN) return { ok: false, status: 503, error: 'ARANDU_ADMIN_TOKEN não configurado no servidor.' };
  if (token !== ADMIN_TOKEN) return { ok: false, status: 401, error: 'Acesso administrativo não autorizado.' };
  return { ok: true };
}

function clean(value) { return String(value || '').trim(); }
function numberValue(value) { const n = Number(String(value || 0).replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }

function normalizeRecord(body) {
  const total = numberValue(body.total);
  const rate = Number.isFinite(Number(body.platform_fee_rate)) ? Number(body.platform_fee_rate) : 0.25;
  const fee = numberValue(body.platform_fee) || total * rate;
  return {
    proposal_id: body.proposal_id || null,
    reservation_id: body.reservation_id || null,
    lead_id: body.lead_id || null,
    client: clean(body.client),
    email: clean(body.email) || null,
    whatsapp: clean(body.whatsapp) || null,
    total,
    platform_fee_rate: rate,
    platform_fee: fee,
    artist_amount: numberValue(body.artist_amount) || Math.max(total - fee, 0),
    status: STATUS.includes(body.status) ? body.status : 'draft',
    logistics_status: body.logistics_status || 'pending',
    notes: body.notes || null,
    payload: body.payload && typeof body.payload === 'object' ? body.payload : {}
  };
}

function normalizeItem(item, position) {
  const price = numberValue(item.price);
  const fee = numberValue(item.platform_fee) || price * 0.25;
  return {
    artwork_id: item.artwork_id || item.artworkId || null,
    artist_id: item.artist_id || item.artistId || null,
    position,
    price,
    platform_fee: fee,
    artist_amount: numberValue(item.artist_amount) || Math.max(price - fee, 0),
    note: item.note || null
  };
}

async function listRecords(res) {
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', items: [] });
  const rows = await dataRequest('commercial_records?select=*&order=created_at.desc', { method: 'GET', headers: { Prefer: '' } });
  return json(res, 200, { ok: true, mode: 'stored', items: rows || [] });
}

async function createRecord(req, res) {
  const body = await readBody(req);
  const record = normalizeRecord(body);
  const items = Array.isArray(body.items) ? body.items.map(normalizeItem) : [];
  if (!record.client) return json(res, 400, { ok: false, error: 'Cliente obrigatório.' });
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, record, items });
  const saved = firstRecord(await dataRequest('commercial_records', { method: 'POST', body: JSON.stringify(record) }));
  const savedItems = items.length ? await dataRequest('commercial_items', { method: 'POST', body: JSON.stringify(items.map((item) => ({ ...item, commercial_record_id: saved.id }))) }) : [];
  return json(res, 201, { ok: true, mode: 'stored', stored: true, record: saved, items: savedItems || [] });
}

async function updateRecord(req, res) {
  const body = await readBody(req);
  const id = clean(body.id);
  const payload = {};
  if (!id) return json(res, 400, { ok: false, error: 'ID obrigatório.' });
  if (STATUS.includes(body.status)) payload.status = body.status;
  if (body.logistics_status !== undefined) payload.logistics_status = clean(body.logistics_status);
  if (body.notes !== undefined) payload.notes = body.notes;
  if (!Object.keys(payload).length) return json(res, 400, { ok: false, error: 'Nenhum campo válido.' });
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, record: { id, ...payload } });
  const rows = await dataRequest(`commercial_records?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  return json(res, 200, { ok: true, mode: 'stored', stored: true, record: firstRecord(rows) });
}

export default async function handler(req, res) {
  try {
    const access = guard(req);
    if (!access.ok) return json(res, access.status, { ok: false, error: access.error });
    if (req.method === 'GET') return listRecords(res);
    if (req.method === 'POST') return createRecord(req, res);
    if (req.method === 'PATCH') return updateRecord(req, res);
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

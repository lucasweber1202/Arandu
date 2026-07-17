const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
const ADMIN_TOKEN = process.env.ARANDU_ADMIN_TOKEN;
const STATUS = ['draft','confirmed','completed','cancelled'];
const MAX_BODY_BYTES = 256 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  const declaredSize = Number(req.headers?.['content-length'] || 0);
  if (declaredSize > MAX_BODY_BYTES) throw new HttpError(413, 'Solicitação muito grande.');
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new HttpError(413, 'Solicitação muito grande.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'JSON inválido.'); }
}

function hasDataConfig() { return Boolean(SUPABASE_URL && SUPABASE_KEY); }
function firstRecord(data) { return Array.isArray(data) ? data[0] || null : data; }

async function dataRequest(resource, options = {}) {
  if (!hasDataConfig()) throw new Error('Banco não configurado.');
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${resource}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    },
    body: options.body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || `Banco ${response.status}`);
  return data;
}

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
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('[Arandu Commercial]', error?.message || error);
    return json(res, status, { ok: false, error: status < 500 ? error.message : 'Não foi possível concluir a operação comercial agora.' });
  }
}

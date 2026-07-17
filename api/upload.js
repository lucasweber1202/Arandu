const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.ARANDU_ADMIN_TOKEN;
const BUCKET = process.env.ARANDU_STORAGE_BUCKET || 'arandu-media';
const MAX_BODY_BYTES = 9 * 1024 * 1024;

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
  if (declaredSize > MAX_BODY_BYTES) throw new HttpError(413, 'Imagem acima do limite permitido.');
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new HttpError(413, 'Imagem acima do limite permitido.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'JSON inválido.'); }
}

function clean(value) { return String(value || '').trim(); }
function slugify(value) { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, ''); }
function tokenFrom(req) { const authorization = req.headers.authorization || ''; return clean(req.headers['x-arandu-admin-token'] || (authorization.startsWith('Bearer ') ? authorization.slice(7) : '')); }
function contentTypeOk(type) { return ['image/jpeg','image/png','image/webp','image/gif'].includes(type); }
function extFrom(type, filename) { const ext = clean(filename).split('.').pop(); if (['jpg','jpeg','png','webp','gif'].includes(ext)) return ext; return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type] || 'jpg'); }

async function storageUpload(path, buffer, contentType) {
  const base = SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'true'
    },
    body: buffer
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Storage ${response.status}`);
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function insertMedia(record) {
  const base = SUPABASE_URL.replace(/\/$/, '');
  await fetch(`${base}/rest/v1/media_assets`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(record)
  }).catch(() => null);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    if (!ADMIN_TOKEN || tokenFrom(req) !== ADMIN_TOKEN) return json(res, 401, { ok: false, error: 'Acesso administrativo não autorizado.' });
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json(res, 503, { ok: false, error: 'Supabase Storage exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.' });

    const body = await readBody(req);
    const entityType = clean(body.entity_type || body.entityType || 'artwork');
    const entityId = clean(body.entity_id || body.entityId || 'sem-id');
    const filename = clean(body.filename || 'imagem');
    const contentType = clean(body.content_type || body.contentType || 'image/jpeg');
    const alt = clean(body.alt || filename);
    const raw = clean(body.base64 || body.data || '').replace(/^data:[^;]+;base64,/, '');

    if (!contentTypeOk(contentType)) return json(res, 400, { ok: false, error: 'Formato permitido: jpg, png, webp ou gif.' });
    if (!raw) return json(res, 400, { ok: false, error: 'Arquivo em base64 obrigatório.' });

    const buffer = Buffer.from(raw, 'base64');
    if (!buffer.length) return json(res, 400, { ok: false, error: 'Arquivo vazio.' });
    if (buffer.length > 6 * 1024 * 1024) return json(res, 413, { ok: false, error: 'Imagem acima de 6MB.' });

    const ext = extFrom(contentType, filename);
    const path = `${slugify(entityType)}/${slugify(entityId)}/${Date.now()}-${slugify(filename).replace(/\.[a-z0-9]+$/, '')}.${ext}`;
    const url = await storageUpload(path, buffer, contentType);
    await insertMedia({ entity_type: entityType, entity_id: entityId, asset_type: 'image', url, alt, position: Number(body.position || 1) || 1, payload: { filename, content_type: contentType, storage_path: path } });
    return json(res, 201, { ok: true, bucket: BUCKET, path, url });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('[Arandu Upload]', error?.message || error);
    return json(res, status, { ok: false, error: status < 500 ? error.message : 'Não foi possível enviar a imagem agora.' });
  }
}

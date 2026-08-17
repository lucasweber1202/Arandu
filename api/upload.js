import { randomUUID } from 'node:crypto';
import { AdminAuthError, applyAdminResponseHeaders, requireAdmin } from '../lib/admin-auth.mjs';
import { requireAdminPermission } from '../lib/admin-rbac.mjs';
import { applyApiSecurityHeaders, crossOriginRejection } from '../lib/http-security.mjs';
import { enforceSensitiveRateLimit } from '../lib/rate-limit.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.ARANDU_STORAGE_BUCKET || 'arandu-media';
const MAX_BODY_BYTES = 9 * 1024 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40_000_000;
const ALLOWED_ENTITY_TYPES = new Set(['artwork', 'artist', 'collection', 'certificate']);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  applyApiSecurityHeaders(res);
  applyAdminResponseHeaders(res, headers);
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

function clean(value, max = 500) { return String(value || '').trim().slice(0, max); }
function slugify(value) { return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, ''); }
function contentTypeOk(type) { return ['image/jpeg','image/png','image/webp','image/gif'].includes(type); }
function detectedImageType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 6 && ['GIF87a','GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) return 'image/gif';
  return null;
}
function extFrom(type) { return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }[type] || 'jpg'); }
function canonicalBase64(value) {
  return typeof value === 'string' && value.length > 0 && value.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}
function imageDimensions(buffer, type) {
  if (type === 'image/png' && buffer.length >= 24) return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (type === 'image/gif' && buffer.length >= 10) return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  if (type === 'image/webp' && buffer.length >= 30 && buffer.subarray(12, 16).toString('ascii') === 'VP8X') {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (type === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > buffer.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += length + 2;
    }
  }
  return null;
}
function containsSensitiveMetadata(buffer, type) {
  if (type !== 'image/jpeg') return false;
  const head = buffer.subarray(0, Math.min(buffer.length, 256 * 1024));
  return head.includes(Buffer.from('Exif\0\0')) || head.includes(Buffer.from('http://ns.adobe.com/xap/1.0/'));
}

async function storageUpload(path, buffer, contentType) {
  const base = SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(8_000),
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': contentType,
      'x-upsert': 'false'
    },
    body: buffer
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Storage ${response.status}`);
  return `${base}/storage/v1/object/public/${BUCKET}/${path}`;
}

async function storageDelete(path) {
  const base = SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
    },
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Falha ao remover objeto órfão do Storage (${response.status}).`);
  }
}

async function insertMedia(record) {
  const base = SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(`${base}/rest/v1/media_assets`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(record),
    signal: AbortSignal.timeout(8_000)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text || `Falha ao gravar metadados da mídia (${response.status}).`);
}

export default async function handler(req, res) {
  try {
    const rejection = crossOriginRejection(req);
    if (rejection) return json(res, rejection.status, { ok: false, error: rejection.error, code: rejection.code });
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const admin = await requireAdmin(req);
    requireAdminPermission(admin.actor, 'media', 'create');
    await enforceSensitiveRateLimit(req, 'admin-upload', {
      limit: 30,
      windowMs: 60 * 60 * 1000,
      identity: admin.actor.id
    });
    applyAdminResponseHeaders(res, admin.headers);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json(res, 503, { ok: false, error: 'Supabase Storage exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.' });

    const body = await readBody(req);
    const entityType = clean(body.entity_type || body.entityType || 'artwork', 80);
    const entityId = clean(body.entity_id || body.entityId || 'sem-id', 160);
    const filename = clean(body.filename || 'imagem', 240);
    const contentType = clean(body.content_type || body.contentType || 'image/jpeg', 80);
    const alt = clean(body.alt || filename, 500);
    const raw = String(body.base64 || body.data || '').trim().replace(/^data:[^;]+;base64,/, '');

    if (!contentTypeOk(contentType)) return json(res, 400, { ok: false, error: 'Formato permitido: jpg, png, webp ou gif.' });
    if (!raw) return json(res, 400, { ok: false, error: 'Arquivo em base64 obrigatório.' });
    if (!canonicalBase64(raw)) return json(res, 400, { ok: false, error: 'Codificação base64 inválida.' });

    const buffer = Buffer.from(raw, 'base64');
    if (!buffer.length) return json(res, 400, { ok: false, error: 'Arquivo vazio.' });
    if (buffer.length > MAX_IMAGE_BYTES) return json(res, 413, { ok: false, error: 'Imagem acima de 6MB.' });
    const detectedType = detectedImageType(buffer);
    if (!detectedType || detectedType !== contentType) return json(res, 400, { ok: false, error: 'O conteúdo do arquivo não corresponde ao formato informado.' });
    const dimensions = imageDimensions(buffer, detectedType);
    if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 12000 || dimensions.height > 12000 || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
      return json(res, 400, { ok: false, error: 'Dimensões da imagem inválidas ou excessivas.' });
    }
    if (containsSensitiveMetadata(buffer, detectedType)) return json(res, 400, { ok: false, error: 'Remova metadados EXIF/XMP da imagem antes do envio.' });

    if (!ALLOWED_ENTITY_TYPES.has(entityType)) return json(res, 400, { ok: false, error: 'Tipo de entidade inválido.' });

    const entityTypeSlug = slugify(entityType);
    const entityIdSlug = slugify(entityId);
    if (!entityTypeSlug || !entityIdSlug) return json(res, 400, { ok: false, error: 'Entidade inválida para armazenamento.' });
    const ext = extFrom(detectedType);
    const path = `${entityTypeSlug}/${entityIdSlug}/${randomUUID()}.${ext}`;
    const url = await storageUpload(path, buffer, detectedType);
    try {
      const position = Math.max(1, Math.min(Number.parseInt(body.position, 10) || 1, 1000));
      await insertMedia({ entity_type: entityType, entity_id: entityId, asset_type: 'image', url, alt, position, payload: { filename, content_type: detectedType, storage_path: path, width: dimensions.width, height: dimensions.height } });
    } catch (metadataError) {
      try {
        await storageDelete(path);
      } catch (cleanupError) {
        console.error('[Arandu Upload Cleanup]', cleanupError?.message || cleanupError);
      }
      throw metadataError;
    }
    return json(res, 201, { ok: true, bucket: BUCKET, path, url });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) console.error('[Arandu Upload]', error?.message || error);
    return json(res, status, {
      ok: false,
      error: status < 500 ? error.message : 'Não foi possível enviar a imagem agora.',
      ...(error instanceof AdminAuthError && error.code ? { code: error.code } : {})
    });
  }
}

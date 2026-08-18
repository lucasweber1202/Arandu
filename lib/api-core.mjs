import { randomUUID } from 'node:crypto';
import { applyApiSecurityHeaders } from './http-security.mjs';

export const DEFAULT_MAX_BODY_BYTES = 128 * 1024;

export class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export function json(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  applyApiSecurityHeaders(res);
  Object.entries(extraHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
}

export function html(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  applyApiSecurityHeaders(res);
  res.end(body);
}

export async function readBody(req, { maxBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  const chunks = [];
  let bytes = 0;
  const declared = String(req?.headers?.['content-length'] || '').trim();
  if (declared && !/^\d+$/.test(declared)) throw new HttpError(400, 'Content-Length inválido.', 'invalid_content_length');
  if (declared && Number(declared) > maxBytes) throw new HttpError(413, 'Solicitação muito grande.', 'payload_too_large');
  for await (const rawChunk of req) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw new HttpError(413, 'Solicitação muito grande.', 'payload_too_large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  let parsed;
  try { parsed = JSON.parse(raw); } catch { throw new HttpError(400, 'JSON inválido.', 'invalid_json'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'O corpo JSON deve ser um objeto.', 'invalid_json_shape');
  }
  return parsed;
}

export function clean(value) { return String(value || '').trim(); }
export function limited(value, max = 500) { return clean(value).slice(0, max); }
export function safeRequestId(value) {
  return limited(value, 160).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 80) || randomUUID();
}
export function cleanEmail(value) { return limited(value, 254).toLowerCase(); }
export function cleanPhone(value) { return clean(value).replace(/\D/g, '').slice(0, 15); }
export function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(value)); }
export function trueFlag(value) { return ['1', 'true', 'yes', 'sim'].includes(clean(value).toLowerCase()); }
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
export function safeObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

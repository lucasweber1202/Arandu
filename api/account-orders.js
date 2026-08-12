import { randomUUID } from 'node:crypto';
import { applyApiSecurityHeaders } from '../lib/http-security.mjs';
import { hasSupabaseAccess, userSupabaseRequest } from '../lib/supabase.mjs';

const COOKIE_NAME = 'arandu_session';
const MAX_AGE = 60 * 60 * 24 * 7;

class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function json(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  applyApiSecurityHeaders(res);
  Object.entries(extraHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
}

function readCookie(req, name) {
  try {
    const cookies = Object.fromEntries(String(req.headers?.cookie || '').split(';').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, decodeURIComponent(value.join('=') || '')];
    }).filter(([key]) => key));
    return cookies[name] || '';
  } catch {
    return '';
  }
}

function readSessionCookie(req) {
  try {
    const value = readCookie(req, COOKIE_NAME);
    if (!value) return null;
    const session = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!session?.access_token || !session?.refresh_token) return null;
    return session;
  } catch {
    return null;
  }
}

function sessionCookie(session) {
  const value = Buffer.from(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || MAX_AGE)
  })).toString('base64url');
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Priority=High; Max-Age=${MAX_AGE}`;
}

async function authRequest(path, options = {}) {
  const baseUrl = clean(process.env.SUPABASE_URL).replace(/\/$/, '');
  const anonKey = clean(process.env.SUPABASE_ANON_KEY);
  if (!baseUrl || !anonKey) throw new HttpError(503, 'Autenticação indisponível.', 'auth_unconfigured');
  const response = await fetch(`${baseUrl}/auth/v1/${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(response.status === 401 ? 401 : 503, 'Não foi possível validar a sessão.', 'session_invalid');
  return data;
}

async function resolveSession(req) {
  let session = readSessionCookie(req);
  if (!session) throw new HttpError(401, 'Entre na sua conta para acompanhar pedidos.', 'authentication_required');

  let refreshed = null;
  const expiresAt = Number(session.expires_at || 0);
  if (expiresAt && expiresAt <= Math.floor(Date.now() / 1000) + 30) {
    refreshed = await authRequest('token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    session = {
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || session.refresh_token,
      expires_at: refreshed.expires_at || Math.floor(Date.now() / 1000) + Number(refreshed.expires_in || 3600)
    };
  }

  const user = await authRequest('user', {
    method: 'GET',
    headers: { Authorization: `Bearer ${session.access_token}` }
  });
  if (!user?.id) throw new HttpError(401, 'Sessão inválida.', 'authentication_required');
  return {
    accessToken: session.access_token,
    user,
    headers: refreshed ? { 'Set-Cookie': sessionCookie(session) } : {}
  };
}

function safeOrder(record) {
  return {
    id: record.id,
    order_number: record.order_number,
    artwork_id: record.artwork_id,
    artist_id: record.artist_id,
    reservation_id: record.reservation_id,
    price_snapshot: record.price_snapshot,
    currency: record.currency,
    status: record.status,
    payment_status: record.payment_status,
    fulfillment_status: record.fulfillment_status,
    certificate_status: record.certificate_status,
    tracking_code: record.tracking_code || null,
    shipping_provider: record.shipping_provider || null,
    created_at: record.created_at,
    updated_at: record.updated_at,
    paid_at: record.paid_at,
    completed_at: record.completed_at,
    cancelled_at: record.cancelled_at,
    shipping_updated_at: record.shipping_updated_at || null
  };
}

export default async function handler(req, res) {
  const requestId = clean(req.headers?.['x-request-id'], 80) || randomUUID();
  res.setHeader('X-Request-ID', requestId);
  try {
    if (req.method !== 'GET') throw new HttpError(405, 'Método não permitido.');
    if (!hasSupabaseAccess('user')) throw new HttpError(503, 'Dados de conta indisponíveis.', 'database_unconfigured');

    const session = await resolveSession(req);
    const userId = encodeURIComponent(session.user.id);
    const rows = await userSupabaseRequest(
      session.accessToken,
      `orders?user_id=eq.${userId}&select=id,order_number,artwork_id,artist_id,reservation_id,price_snapshot,currency,status,payment_status,fulfillment_status,certificate_status,tracking_code,shipping_provider,created_at,updated_at,paid_at,completed_at,cancelled_at,shipping_updated_at&order=created_at.desc&limit=30`,
      { method: 'GET', prefer: '' }
    );
    const orders = Array.isArray(rows) ? rows.map(safeOrder) : [];
    return json(res, 200, { ok: true, mode: 'supabase', count: orders.length, orders }, session.headers);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json(res, status, {
      ok: false,
      error: status < 500 ? error.message : 'Não foi possível carregar seus pedidos agora.',
      ...(error?.code ? { code: error.code } : {}),
      requestId
    });
  }
}

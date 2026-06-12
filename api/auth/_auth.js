const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const COOKIE_NAME = 'arandu_session';
const MAX_AGE = 60 * 60 * 24 * 7;

export function authConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function json(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  Object.entries(extraHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
}

export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function cookieHeader(req) {
  return req.headers.cookie || '';
}

export function readSessionCookie(req) {
  const cookies = Object.fromEntries(cookieHeader(req).split(';').map((part) => {
    const [key, ...value] = part.trim().split('=');
    return [key, decodeURIComponent(value.join('=') || '')];
  }).filter(([key]) => key));
  if (!cookies[COOKIE_NAME]) return null;
  try {
    return JSON.parse(Buffer.from(cookies[COOKIE_NAME], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function sessionCookie(session) {
  const value = Buffer.from(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || MAX_AGE)
  })).toString('base64url');
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${MAX_AGE}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

export async function supabaseAuth(path, options = {}) {
  if (!authConfigured()) throw new Error('Autenticação Supabase não configurada.');
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.msg || data.message || `Auth ${response.status}`);
  return data;
}

export function publicUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email,
    full_name: meta.full_name || meta.name || user.email,
    profile_type: meta.profile_type || 'comprador'
  };
}

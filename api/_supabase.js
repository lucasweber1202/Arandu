const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
const COOKIE_NAME = 'arandu_session';

export function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

export function hasSupabaseAuthConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getSupabaseUrl() {
  return SUPABASE_URL;
}

export function getSupabaseAnonKey() {
  return SUPABASE_ANON_KEY;
}

export function getCookieName() {
  return COOKIE_NAME;
}

export function getCookie(req, name = COOKIE_NAME) {
  const cookie = req.headers.cookie || '';
  const found = cookie.split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : '';
}

export function makeSessionCookie(token, maxAge = 60 * 60 * 24 * 7) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

async function parseResponse(response) {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.msg || data?.message || data?.error_description || 'Supabase request failed.';
    throw new Error(message);
  }

  return data;
}

export async function supabaseRequest(path, options = {}) {
  if (!hasSupabaseConfig()) {
    throw new Error('Supabase environment variables are not configured.');
  }

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path.replace(/^\//, '')}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });

  return parseResponse(response);
}

export async function supabaseAuthRequest(path, options = {}, token = '') {
  if (!hasSupabaseAuthConfig()) {
    throw new Error('Supabase auth environment variables are not configured.');
  }

  const url = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/${path.replace(/^\//, '')}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: token ? `Bearer ${token}` : `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  return parseResponse(response);
}

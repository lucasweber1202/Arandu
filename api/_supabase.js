export function envReady() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export async function supabaseRest(path, options = {}) {
  if (!envReady()) throw new Error('Supabase não configurado.');
  const baseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || data?.error || 'Erro no Supabase.');
  return data;
}

export function requireAdmin(req, res) {
  const expected = process.env.ARANDU_ADMIN_TOKEN;
  if (!expected) return true;
  const received = req.headers['x-arandu-admin-token'];
  if (received !== expected) {
    json(res, 401, { ok: false, error: 'Token administrativo inválido.' });
    return false;
  }
  return true;
}

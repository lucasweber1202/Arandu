import { clearSessionCookie, hasSupabaseAuthConfig, makeSessionCookie, supabaseAuthRequest } from '../_supabase.js';

function send(res, statusCode, payload, cookie = null) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method not allowed.' });

  try {
    const body = await readBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');

    if (!email || !password) return send(res, 400, { ok: false, error: 'Email e senha são obrigatórios.' });

    if (!hasSupabaseAuthConfig()) {
      return send(res, 202, {
        ok: true,
        mode: 'demo',
        user: { id: 'demo-user', email, full_name: 'Usuário demonstração', profile_type: 'comprador' },
        message: 'Login em modo demonstração. Configure Supabase para autenticação real.'
      }, clearSessionCookie());
    }

    const auth = await supabaseAuthRequest('token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    const user = auth.user;
    return send(res, 200, {
      ok: true,
      mode: 'supabase',
      user: user ? {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || '',
        profile_type: user.user_metadata?.profile_type || 'comprador'
      } : null
    }, makeSessionCookie(auth.access_token));
  } catch (error) {
    return send(res, 401, { ok: false, error: error.message || 'Não foi possível entrar.' });
  }
}

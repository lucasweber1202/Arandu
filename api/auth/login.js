import { authConfigured, json, publicUser, readBody, sessionCookie, supabaseAuth } from './_auth.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    if (!authConfigured()) return json(res, 503, { ok: false, error: 'Autenticação Supabase ainda não configurada.' });
    const body = await readBody(req);
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    if (!email || !password) return json(res, 400, { ok: false, error: 'Email e senha são obrigatórios.' });

    const result = await supabaseAuth('token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    return json(res, 200, {
      ok: true,
      authenticated: true,
      user: publicUser(result.user)
    }, { 'Set-Cookie': sessionCookie(result) });
  } catch (error) {
    return json(res, 401, { ok: false, error: error.message || 'Não foi possível entrar.' });
  }
}

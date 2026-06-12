import { authConfigured, json, publicUser, readBody, sessionCookie, supabaseAuth } from './_auth.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    if (!authConfigured()) return json(res, 503, { ok: false, error: 'Autenticação Supabase ainda não configurada.' });
    const body = await readBody(req);
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    const fullName = String(body.fullName || body.full_name || body.name || '').trim();
    const profileType = String(body.profileType || body.profile_type || 'comprador').trim();
    if (!email || !password) return json(res, 400, { ok: false, error: 'Email e senha são obrigatórios.' });

    const result = await supabaseAuth('signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        data: {
          full_name: fullName,
          profile_type: profileType
        }
      })
    });

    const headers = result.access_token ? { 'Set-Cookie': sessionCookie(result) } : {};
    return json(res, 201, {
      ok: true,
      authenticated: Boolean(result.access_token),
      needsEmailConfirmation: !result.access_token,
      user: publicUser(result.user)
    }, headers);
  } catch (error) {
    return json(res, 400, { ok: false, error: error.message || 'Não foi possível criar cadastro.' });
  }
}

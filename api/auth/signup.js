import { clearSessionCookie, hasSupabaseAuthConfig, makeSessionCookie, supabaseAuthRequest, supabaseRequest } from '../_supabase.js';

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
    const fullName = String(body.fullName || body.nome || '').trim();
    const profileType = String(body.profileType || body.tipo || 'comprador');

    if (!email || !password) return send(res, 400, { ok: false, error: 'Email e senha são obrigatórios.' });
    if (password.length < 6) return send(res, 400, { ok: false, error: 'A senha precisa ter pelo menos 6 caracteres.' });

    if (!hasSupabaseAuthConfig()) {
      return send(res, 202, {
        ok: true,
        mode: 'demo',
        user: { id: `demo_${Date.now()}`, email, full_name: fullName, profile_type: profileType },
        message: 'Cadastro recebido em modo demonstração. Configure Supabase para ativar login real.'
      }, clearSessionCookie());
    }

    const signup = await supabaseAuthRequest('signup', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        data: { full_name: fullName, profile_type: profileType }
      })
    });

    const user = signup.user || signup;
    if (user?.id) {
      try {
        await supabaseRequest('profiles', {
          method: 'POST',
          body: JSON.stringify({ id: user.id, email, full_name: fullName, profile_type: profileType })
        });
      } catch {
        // Profile may already exist or table may not be created yet. Auth signup remains valid.
      }
    }

    const token = signup.access_token;
    return send(res, 201, {
      ok: true,
      mode: 'supabase',
      user: user ? { id: user.id, email: user.email || email, full_name: fullName, profile_type: profileType } : null,
      needsEmailConfirmation: !token
    }, token ? makeSessionCookie(token) : null);
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message || 'Erro ao criar cadastro.' });
  }
}

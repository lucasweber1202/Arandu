import { getCookie, hasSupabaseAuthConfig, supabaseAuthRequest } from '../_supabase.js';

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'Method not allowed.' });

  try {
    const token = getCookie(req);
    if (!token) return send(res, 200, { ok: true, authenticated: false, user: null });

    if (!hasSupabaseAuthConfig()) {
      return send(res, 200, { ok: true, authenticated: true, mode: 'demo', user: { id: 'demo-user', email: 'demo@arandu.art', full_name: 'Usuário demonstração', profile_type: 'comprador' } });
    }

    const authUser = await supabaseAuthRequest('user', { method: 'GET' }, token);
    return send(res, 200, {
      ok: true,
      authenticated: true,
      mode: 'supabase',
      user: {
        id: authUser.id,
        email: authUser.email,
        full_name: authUser.user_metadata?.full_name || '',
        profile_type: authUser.user_metadata?.profile_type || 'comprador'
      }
    });
  } catch (error) {
    return send(res, 200, { ok: true, authenticated: false, user: null, error: error.message });
  }
}

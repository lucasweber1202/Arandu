import { authConfigured, json, publicUser, readSessionCookie, supabaseAuth } from './_auth.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    if (!authConfigured()) return json(res, 200, { ok: true, authenticated: false, mode: 'demo', user: null });
    const session = readSessionCookie(req);
    if (!session?.access_token) return json(res, 200, { ok: true, authenticated: false, mode: 'supabase', user: null });
    const user = await supabaseAuth('user', {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    return json(res, 200, { ok: true, authenticated: true, mode: 'supabase', user: publicUser(user) });
  } catch {
    return json(res, 200, { ok: true, authenticated: false, mode: 'supabase', user: null });
  }
}

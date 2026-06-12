import { clearSessionCookie, json } from './_auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  return json(res, 200, { ok: true, authenticated: false }, { 'Set-Cookie': clearSessionCookie() });
}

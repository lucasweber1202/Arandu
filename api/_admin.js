import { sendJson } from './_normalize.js';

export function isAdminRequest(req) {
  const configured = process.env.ARANDU_ADMIN_TOKEN;
  if (!configured) return false;
  const header = req.headers['x-arandu-admin-token'];
  const auth = req.headers.authorization || '';
  const token = header || auth.replace(/^Bearer\s+/i, '');
  return token === configured;
}

export function requireAdmin(req, res) {
  if (isAdminRequest(req)) return true;
  sendJson(res, 401, { ok: false, error: 'Admin token inválido ou ausente.' });
  return false;
}

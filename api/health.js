import { applyApiSecurityHeaders } from '../lib/http-security.mjs';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    applyApiSecurityHeaders(res);
    return res.end(JSON.stringify({ ok: false, error: 'Método não permitido.' }));
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  applyApiSecurityHeaders(res);
  if (req.method === 'HEAD') return res.end();
  return res.end(JSON.stringify({
    ok: true,
    service: 'arandu-api',
    status: 'alive'
  }));
}

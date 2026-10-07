import { applyApiSecurityHeaders } from '../lib/http-security.mjs';
import { safeRequestId } from '../lib/api-core.mjs';
import { releaseIdentity } from '../lib/runtime-mode.mjs';

export default function handler(req, res) {
  // Mesmo identificador da API principal: um health check lento ou com erro
  // no proxy pode ser achado nos logs pelo X-Request-ID.
  res.setHeader('X-Request-ID', safeRequestId(req.headers?.['x-request-id']));
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
    status: 'alive',
    release: releaseIdentity()
  }));
}

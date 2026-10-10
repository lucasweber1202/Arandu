import { applyApiSecurityHeaders } from '../lib/http-security.mjs';
import { safeRequestId } from '../lib/api-core.mjs';
import { releaseIdentity } from '../lib/runtime-mode.mjs';
import { evaluateReadiness } from '../lib/readiness.mjs';
import { safeErrorEvent } from '../lib/observability.mjs';

export default async function handler(req, res) {
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

  // /api/health?probe=ready: readiness (configuração, banco aprovado e
  // backend alcançável). Sem o parâmetro, continua sendo só liveness.
  if (new URL(req.url || '/', 'http://localhost').searchParams.get('probe') === 'ready') {
    const { ready, failing } = await evaluateReadiness();
    // Detalhe só no log estruturado do servidor (nomes e estados, sem valores);
    // a resposta pública fica em ready/not_ready.
    if (!ready) console.error(JSON.stringify(safeErrorEvent({ service: 'arandu-api', route: 'health/ready', status: 503, code: failing, requestId: res.getHeader?.('X-Request-ID') })));
    res.statusCode = ready ? 200 : 503;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    applyApiSecurityHeaders(res);
    if (req.method === 'HEAD') return res.end();
    return res.end(JSON.stringify({ ok: ready, service: 'arandu-api', status: ready ? 'ready' : 'not_ready', release: releaseIdentity() }));
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

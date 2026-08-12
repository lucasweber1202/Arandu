import { randomUUID } from 'node:crypto';
import { AdminAuthError, applyAdminResponseHeaders, requireAdmin } from '../lib/admin-auth.mjs';
import { requireAdminPermission } from '../lib/admin-rbac.mjs';
import { dispatchTransactionalOutbox } from '../lib/email-outbox.mjs';
import { applyApiSecurityHeaders, crossOriginRejection } from '../lib/http-security.mjs';
import { enforceSensitiveRateLimit } from '../lib/rate-limit.mjs';
import { hasSupabaseAccess } from '../lib/supabase.mjs';

function json(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  applyApiSecurityHeaders(res);
  applyAdminResponseHeaders(res, headers);
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  const requestId = String(req.headers?.['x-request-id'] || randomUUID()).slice(0, 80);
  res.setHeader('X-Request-ID', requestId);
  try {
    const rejection = crossOriginRejection(req);
    if (rejection) return json(res, rejection.status, { ok: false, error: rejection.error, code: rejection.code, requestId });
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.', requestId });

    const admin = await requireAdmin(req);
    requireAdminPermission(admin.actor, 'commercial', 'update');
    await enforceSensitiveRateLimit(req, 'admin-email-dispatch', {
      limit: 20,
      windowMs: 10 * 60 * 1000,
      identity: admin.actor.id
    });
    if (!hasSupabaseAccess('admin')) return json(res, 503, { ok: false, error: 'Banco indisponível.', code: 'database_unconfigured', requestId }, admin.headers);

    const result = await dispatchTransactionalOutbox({
      limit: 20,
      workerRef: `admin-${admin.actor.id}-${requestId}`
    });
    return json(res, 200, { ok: true, ...result, requestId }, admin.headers);
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json(res, status, {
      ok: false,
      error: status < 500 ? error.message : 'Não foi possível processar a fila transacional agora.',
      ...(error instanceof AdminAuthError && error.code ? { code: error.code } : {}),
      ...(error?.code ? { code: error.code } : {}),
      requestId
    });
  }
}

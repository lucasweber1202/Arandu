import { randomUUID, timingSafeEqual } from 'node:crypto';
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

const truthy = (value) => ['1', 'true', 'yes', 'sim'].includes(String(value || '').trim().toLowerCase());
const safeRequestId = (value) => String(value || randomUUID()).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 80) || randomUUID();
function authorizedCron(req) {
  const configured = String(process.env.CRON_SECRET || process.env.ARANDU_EMAIL_CRON_SECRET || '');
  const supplied = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (configured.length < 32 || supplied.length !== configured.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

export default async function handler(req, res) {
  const requestId = safeRequestId(req.headers?.['x-request-id']);
  res.setHeader('X-Request-ID', requestId);
  try {
    if (!['GET', 'POST'].includes(req.method)) return json(res, 405, { ok: false, error: 'Método não permitido.', requestId });
    if (!truthy(process.env.ARANDU_EMAIL_DISPATCH_ENABLED)) {
      return json(res, 503, { ok: false, error: 'Despacho transacional desativado.', code: 'email_dispatch_disabled', requestId });
    }

    if (req.method === 'GET') {
      if (!authorizedCron(req)) return json(res, 401, { ok: false, error: 'Cron não autorizado.', code: 'cron_unauthorized', requestId });
      if (!hasSupabaseAccess('admin')) return json(res, 503, { ok: false, error: 'Banco indisponível.', code: 'database_unconfigured', requestId });
      const result = await dispatchTransactionalOutbox({ limit: 20, workerRef: `cron-${requestId}` });
      return json(res, 200, { ok: true, ...result, requestId });
    }

    const rejection = crossOriginRejection(req);
    if (rejection) return json(res, rejection.status, { ok: false, error: rejection.error, code: rejection.code, requestId });

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

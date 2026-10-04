import { runJob, authorizedCron as financeCron } from '../lib/api/domains/finance-jobs.mjs';
import { safeFailure } from '../lib/finance/operational-resilience.mjs';
import { randomUUID } from 'node:crypto';
import { dispatchTransactionalOutbox } from '../lib/email-outbox.mjs';
import { applyApiSecurityHeaders } from '../lib/http-security.mjs';
import { adminSupabaseRpc, hasSupabaseAccess } from '../lib/supabase.mjs';
import { demoDeployment, rejectLegacyArtRoute } from '../lib/legacy-surface.mjs';

// Despacho da outbox transacional (avisos financeiros): só o cron, com o
// segredo compartilhado e lease em fin_job_runs. O gatilho manual pela antiga
// administração da vertical de arte foi aposentado.

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  applyApiSecurityHeaders(res);
  res.end(JSON.stringify(payload));
}

const truthy = (value) => ['1', 'true', 'yes', 'sim'].includes(String(value || '').trim().toLowerCase());
const safeRequestId = (value) => String(value || randomUUID()).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 80) || randomUUID();
function authorizedCron(req) {
  return financeCron(req, { CRON_SECRET: process.env.CRON_SECRET || process.env.ARANDU_EMAIL_CRON_SECRET });
}

async function dispatchWithRun(requestId, workerRef) {
  return runJob('email_outbox', async () => {
    const result = await dispatchTransactionalOutbox({ limit: 20, workerRef });
    const failed = result.retried + result.dead + result.completion_failed + result.deferred;
    return { ...result, status: failed || result.reason ? 'failed' : 'succeeded', processed: result.delivered, failed,
      error_code: failed ? 'outbox_partial_failure' : result.reason ? 'outbox_unavailable' : null };
  }, { rpc: adminSupabaseRpc, requestId: requestId.replace(/[^A-Za-z0-9-]/g, '-'), now: () => new Date(), timeoutMs: 8000 });
}

export default async function handler(req, res) {
  // A demonstração não tem banco nem fila de e-mail: o cron dela não existe.
  if (demoDeployment()) return rejectLegacyArtRoute(res);
  const requestId = safeRequestId(req.headers?.['x-request-id']);
  res.setHeader('X-Request-ID', requestId);
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { ok: false, error: 'Método não permitido.', requestId });
    }
    if (!truthy(process.env.ARANDU_EMAIL_DISPATCH_ENABLED)) {
      return json(res, 503, { ok: false, error: 'Despacho transacional desativado.', code: 'email_dispatch_disabled', requestId });
    }
    if (!authorizedCron(req)) return json(res, 401, { ok: false, error: 'Cron não autorizado.', code: 'cron_unauthorized', requestId });
    if (!hasSupabaseAccess('admin')) return json(res, 503, { ok: false, error: 'Banco indisponível.', code: 'database_unconfigured', requestId });
    const result = await dispatchWithRun(requestId, `cron-${requestId}`);
    return json(res, result.status === 'busy' ? 202 : result.status === 'succeeded' ? 200 : 502, { ok: result.status === 'succeeded', ...result, requestId });
  } catch (error) {
    return json(res, 500, { ok: false, error: 'Não foi possível processar a fila transacional agora.', code: safeFailure(error, 'email_dispatch_failed'), requestId });
  }
}

// Cron com autenticação fail-closed; cada job tem execução persistida e lease
// com fencing. Escritas não são repetidas automaticamente pelo transporte.
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { adminSupabaseRpc, hasSupabaseAccess } from '../../supabase.mjs';
import { json } from '../../api-core.mjs';
import { dispatchWebhooks } from '../../finance/webhook-dispatch.mjs';
import { withDeadline, safeFailure, countResult, invalidResponse } from '../../finance/operational-resilience.mjs';

export function authorizedCron(req, env = process.env) {
  const configured = Buffer.from(String(env.CRON_SECRET || ''));
  const supplied = Buffer.from(String(req.headers?.authorization || '').replace(/^Bearer\s+/i, ''));
  return configured.length >= 32 && supplied.length === configured.length && timingSafeEqual(supplied, configured);
}

export async function runJob(job, action, { rpc, requestId, now, timeoutMs }) {
  const call = (name, args) => withDeadline(signal => rpc(name, args, { signal }), timeoutMs);
  let lease;
  try {
    lease = await call('fin_job_begin', { p_job: job, p_request_id: requestId, p_started_at: new Date(now()).toISOString(), p_lease_seconds: 90 });
    if (lease === null) return { status: 'busy', processed: 0, failed: 0, error_code: 'job_busy' };
    if (!lease || typeof lease.run_id !== 'string' || typeof lease.lease_token !== 'string') throw invalidResponse();
  } catch (error) { return { status: 'failed', processed: 0, failed: 1, error_code: safeFailure(error, 'job_start_failed') }; }
  let result;
  try { result = await action(call); }
  catch (error) { result = { status: 'failed', processed: 0, failed: 1, error_code: safeFailure(error, 'job_execution_failed') }; }
  try {
    const recorded = await call('fin_job_finish', { p_run: lease.run_id, p_lease: lease.lease_token, p_status: result.status,
      p_processed: result.processed, p_failed: result.failed, p_error_code: result.error_code || null });
    if (recorded !== true) throw invalidResponse();
  } catch { return { ...result, status: 'failed', error_code: 'job_record_failed' }; }
  return result;
}

export async function handleFinanceJobs(req, res, job, {
  env = process.env, rpc = adminSupabaseRpc, databaseReady = () => hasSupabaseAccess('admin'), now = () => new Date(),
  dispatch = dispatchWebhooks, timeoutMs = 8000
} = {}) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!['renewals', 'webhooks', 'governance'].includes(job)) return json(res, 404, { ok: false, error: 'Tarefa desconhecida.', code: 'job_not_found' }, headers);
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' }, headers);
  if (!authorizedCron(req, env)) return json(res, 401, { ok: false, error: 'Cron não autorizado.', code: 'cron_unauthorized' }, headers);
  if (!databaseReady()) return json(res, 503, { ok: false, error: 'Banco indisponível.', code: 'database_unconfigured' }, headers);
  const requestId = String(req.headers?.['x-vercel-id'] || '').replace(/[^A-Za-z0-9-]/g, '-').slice(0, 80) || randomUUID();
  const deps = { rpc, requestId, now, timeoutMs };
  const day = new Date(now()).toISOString().slice(0, 10);
  if (job === 'webhooks') {
    const result = await runJob(job, async call => {
      const totals = await dispatch({ rpc, env, limit: 50, budgetMs: 45000 });
      for (const key of ['claimed', 'succeeded', 'failed', 'dead', 'completion_failed', 'deferred']) countResult(totals?.[key]);
      if (totals.claimed !== totals.succeeded + totals.failed + totals.dead + totals.completion_failed + totals.deferred) throw invalidResponse();
      const purged = countResult(await call('fin_api_purge_idempotency', {}));
      const failed = totals.failed + totals.dead + totals.completion_failed + totals.deferred;
      return { ...totals, delivery_failed: totals.failed, status: failed ? 'failed' : 'succeeded', processed: totals.succeeded, failed,
        error_code: failed ? 'webhooks_partial_failure' : null, idempotency_purged: purged };
    }, deps);
    return json(res, result.status === 'busy' ? 202 : result.status === 'succeeded' ? 200 : 502,
      { ok: result.status === 'succeeded', job, ...result, request_id: requestId }, headers);
  }
  if (job === 'governance') {
    const [status, payload] = governanceResponse(await runGovernance({ deps, now }));
    return json(res, status, { ...payload, request_id: requestId }, headers);
  }
  const jobs = {};
  const definitions = [['renewals', 'fin_run_renewal_schedule', { p_day: day }], ['contract_milestones', 'fin_run_contract_milestones', { p_day: day }], ['approval_deadlines', 'fin_run_approval_deadlines', {}]];
  // Falha parcial não desfaz trabalho já commitado; continua os outros jobs e
  // retorna falha ao agendador. O rerun retoma a fila idempotente no banco.
  for (const [name, rpcName, args] of definitions) jobs[name] = await runJob(name, async call => ({
    status: 'succeeded', processed: countResult(await call(rpcName, args)), failed: 0, error_code: null
  }), deps);
  const ok = Object.values(jobs).every(result => result.status === 'succeeded');
  const busy = Object.values(jobs).some(result => result.status === 'busy');
  return json(res, ok ? 200 : busy && Object.values(jobs).every(result => result.status !== 'failed') ? 202 : 502,
    { ok, job, day, tasks_created: jobs.renewals.status === 'succeeded' ? jobs.renewals.processed : null,
      milestone_tasks_created: jobs.contract_milestones.status === 'succeeded' ? jobs.contract_milestones.processed : null,
      approval_deadline_actions: jobs.approval_deadlines.status === 'succeeded' ? jobs.approval_deadlines.processed : null,
      ...(!ok ? { code: busy ? 'job_busy' : 'renewal_job_failed' } : {}), jobs, request_id: requestId }, headers);
}

// Governança de dados (P0.11): retenção, montagem de export e avanço do
// offboarding, cada um com lease/fencing próprio em fin_job_runs. Falha parcial
// de um não desfaz o trabalho já commitado dos outros; o rerun retoma.
export async function runGovernance({ deps, now, exportBudgetMs = 20000 }) {
  const jobs = {};
  jobs.retention = await runJob('retention', async call => {
    const result = await call('fin_governance_retention_run', { p_dry_run: false, p_limit: 500, p_org: null, p_request_id: deps.requestId });
    if (!result || typeof result !== 'object' || !Array.isArray(result.items)) throw invalidResponse();
    return { status: 'succeeded', processed: countResult(result.processed) + countResult(result.exports_expired), failed: 0, error_code: null,
      held: countResult(result.held) };
  }, deps);
  jobs.data_exports = await runJob('data_exports', async call => {
    const started = Number(new Date(now()));
    let processed = 0, failed = 0;
    // Um pacote por chamada; no máximo cinco por execução e dentro do orçamento.
    for (let i = 0; i < 5 && Number(new Date(now())) - started < exportBudgetMs; i += 1) {
      const result = await call('fin_governance_build_export', { p_max_dataset_bytes: 4000000 });
      if (!result || typeof result !== 'object') throw invalidResponse();
      if (countResult(result.processed) === 0) break;
      if (result.status === 'ready') processed += 1; else failed += 1;
    }
    return { status: failed ? 'failed' : 'succeeded', processed, failed, error_code: failed ? 'export_partial_failure' : null };
  }, deps);
  jobs.offboarding = await runJob('offboarding', async call => {
    const result = await call('fin_governance_offboarding_advance', { p_limit: 50 });
    if (!result || typeof result !== 'object') throw invalidResponse();
    return { status: 'succeeded', processed: countResult(result.export_ready) + countResult(result.scheduled_for_deletion), failed: 0, error_code: null,
      held: countResult(result.held) };
  }, deps);
  return jobs;
}

function governanceResponse(jobs) {
  const ok = Object.values(jobs).every(result => result.status === 'succeeded');
  const busy = Object.values(jobs).some(result => result.status === 'busy');
  const status = ok ? 200 : busy && Object.values(jobs).every(result => result.status !== 'failed') ? 202 : 502;
  return [status, { ok, job: 'governance', jobs, ...(!ok ? { code: busy ? 'job_busy' : 'governance_job_failed' } : {}) }];
}

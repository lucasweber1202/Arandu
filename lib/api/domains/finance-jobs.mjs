// Tarefas agendadas do procurement financeiro, chamadas pelo cron do Vercel.
//
// A agenda de renovação roda com o service role porque percorre contratos de
// todas as organizações — e por isso só aceita o segredo do cron, comparado em
// tempo constante. Não existe caminho de navegador até aqui: sem segredo
// configurado (>= 32 caracteres), a rota responde 401 sempre.
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { adminSupabaseRpc, hasSupabaseAccess } from '../../supabase.mjs';
import { json } from '../../api-core.mjs';

export function authorizedCron(req, env = process.env) {
  const configured = String(env.CRON_SECRET || '');
  const supplied = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (configured.length < 32 || supplied.length !== configured.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(configured));
}

export async function handleFinanceJobs(req, res, job, {
  env = process.env, rpc = adminSupabaseRpc, databaseReady = () => hasSupabaseAccess('admin'), now = () => new Date()
} = {}) {
  const headers = { 'Cache-Control': 'no-store' };
  if (job !== 'renewals') return json(res, 404, { ok: false, error: 'Tarefa desconhecida.', code: 'job_not_found' }, headers);
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' }, headers);
  if (!authorizedCron(req, env)) return json(res, 401, { ok: false, error: 'Cron não autorizado.', code: 'cron_unauthorized' }, headers);
  if (!databaseReady()) return json(res, 503, { ok: false, error: 'Banco indisponível.', code: 'database_unconfigured' }, headers);
  // Cada execução fica registrada para o console operacional, com o request id
  // e um código de erro curto — nunca a mensagem do banco nem dados de cliente.
  const requestId = String(req.headers?.['x-vercel-id'] || '').replace(/[^A-Za-z0-9-]/g, '-').slice(0, 80) || randomUUID();
  const startedAt = now().toISOString();
  const day = startedAt.slice(0, 10);
  const record = (status, processed, errorCode = null) => rpc('fin_record_job_run', {
    p_job: 'renewals', p_status: status, p_processed: processed, p_request_id: requestId, p_error_code: errorCode, p_started_at: startedAt
  }).catch(() => null);
  let created;
  try {
    created = Number(await rpc('fin_run_renewal_schedule', { p_day: day })) || 0;
  } catch (error) {
    const code = String(error?.code || 'renewal_failed').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60) || 'renewal_failed';
    await record('failed', 0, code);
    return json(res, 502, { ok: false, error: 'A agenda de renovação não concluiu.', code: 'renewal_job_failed', request_id: requestId }, headers);
  }
  await record('succeeded', created);
  // Marcos próprios e obrigações recorrentes de contrato (Contract Center v2):
  // mesma janela diária, execução registrada à parte. Falha aqui não desfaz
  // a renovação já concluída; fica visível no console operacional.
  let milestones = null;
  try {
    milestones = Number(await rpc('fin_run_contract_milestones', { p_day: day })) || 0;
    await rpc('fin_record_job_run', { p_job: 'contract_milestones', p_status: 'succeeded', p_processed: milestones, p_request_id: requestId, p_error_code: null, p_started_at: startedAt }).catch(() => null);
  } catch (error) {
    const code = String(error?.code || 'milestones_failed').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60) || 'milestones_failed';
    await rpc('fin_record_job_run', { p_job: 'contract_milestones', p_status: 'failed', p_processed: 0, p_request_id: requestId, p_error_code: code, p_started_at: startedAt }).catch(() => null);
  }
  // Prazos de aprovação da policy v2: etapa vencida é escalada uma vez.
  let escalated = null;
  try {
    escalated = Number(await rpc('fin_run_approval_deadlines', {})) || 0;
    await rpc('fin_record_job_run', { p_job: 'approval_deadlines', p_status: 'succeeded', p_processed: escalated, p_request_id: requestId, p_error_code: null, p_started_at: startedAt }).catch(() => null);
  } catch (error) {
    const code = String(error?.code || 'deadlines_failed').toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60) || 'deadlines_failed';
    await rpc('fin_record_job_run', { p_job: 'approval_deadlines', p_status: 'failed', p_processed: 0, p_request_id: requestId, p_error_code: code, p_started_at: startedAt }).catch(() => null);
  }
  return json(res, 200, { ok: true, job: 'renewals', day, tasks_created: created, milestone_tasks_created: milestones, approvals_escalated: escalated, request_id: requestId }, headers);
}

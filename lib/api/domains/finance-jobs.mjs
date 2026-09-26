// Tarefas agendadas do procurement financeiro, chamadas pelo cron do Vercel.
//
// A agenda de renovação roda com o service role porque percorre contratos de
// todas as organizações — e por isso só aceita o segredo do cron, comparado em
// tempo constante. Não existe caminho de navegador até aqui: sem segredo
// configurado (>= 32 caracteres), a rota responde 401 sempre.
import { timingSafeEqual } from 'node:crypto';
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
  const day = now().toISOString().slice(0, 10);
  const created = await rpc('fin_run_renewal_schedule', { p_day: day });
  return json(res, 200, { ok: true, job: 'renewals', day, tasks_created: Number(created) || 0 }, headers);
}

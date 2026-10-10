// Readiness (≠ liveness). `/api/health` diz que a função responde; readiness
// diz se este deploy consegue servir o produto que declara: ambiente declarado,
// configuração de servidor presente, banco com atribuição aprovada para o
// ambiente e Supabase Auth/REST alcançáveis. Só nomes de verificação e estados
// saem na resposta — nunca valores, refs, URLs ou mensagens do upstream.
import { resolveRuntime } from './runtime-mode.mjs';
import { ACTIVE_SUPABASE_ASSIGNMENTS, permanentSupabaseAssignmentProblem } from './deployment-topology.mjs';

const CACHE_MS = 30000;
const TIMEOUT_MS = 2500;
let cached = null;

const supabaseRef = (value) => {
  try { const host = new URL(String(value || '')).hostname.toLowerCase(); return host.endsWith('.supabase.co') ? host.split('.')[0] : null; } catch { return null; }
};

async function reachable(fetchImpl, url, key, accept) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, { method: 'GET', headers: { apikey: key }, signal: controller.signal, redirect: 'manual' });
    return accept(response.status) ? 'ok' : 'unavailable';
  } catch (error) {
    return error?.name === 'AbortError' ? 'timeout' : 'unavailable';
  } finally { clearTimeout(timer); }
}

export async function evaluateReadiness({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (cached && now - cached.at < CACHE_MS && cached.key === env) return cached.result;
  const runtime = resolveRuntime(env);
  const checks = [];
  const add = (name, status) => checks.push({ name, status });
  if (runtime.misconfigured) add('runtime', 'misconfigured');
  else if (runtime.isSandbox) add('runtime', 'sandbox');
  else if (!runtime.environment) add('runtime', 'not_declared');
  else add('runtime', 'ok');

  if (runtime.environment && !runtime.misconfigured) {
    const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'].filter((name) => !String(env[name] || '').trim());
    add('configuration', missing.length ? 'missing' : 'ok');
    const ref = supabaseRef(env.SUPABASE_URL);
    const topology = runtime.isPermanentEnvironment
      ? (permanentSupabaseAssignmentProblem(runtime.environment, ref) ? 'unassigned_database' : 'ok')
      : ((ACTIVE_SUPABASE_ASSIGNMENTS[runtime.environment] || []).includes(ref) ? 'ok' : 'unassigned_database');
    add('topology', topology);
    // Sem configuração ou com banco não aprovado, não há por que tocar a rede.
    if (!missing.length && topology === 'ok') {
      const base = String(env.SUPABASE_URL).replace(/\/+$/, '');
      const key = String(env.SUPABASE_ANON_KEY).trim();
      const [auth, rest] = await Promise.all([
        reachable(fetchImpl, `${base}/auth/v1/health`, key, (status) => status >= 200 && status < 300),
        // A raiz do PostgREST pode responder 200 ou 401 conforme a exposição do
        // schema; qualquer resposta < 500 prova que o serviço atende.
        reachable(fetchImpl, `${base}/rest/v1/`, key, (status) => status < 500)
      ]);
      add('supabase_auth', auth);
      add('supabase_rest', rest);
    }
  }
  const ready = checks.every((check) => check.status === 'ok' || check.status === 'sandbox');
  const failing = checks.filter((check) => check.status !== 'ok' && check.status !== 'sandbox').map((check) => `${check.name}:${check.status}`).join(',');
  const result = Object.freeze({ ready, checks: Object.freeze(checks), failing });
  cached = { at: now, key: env, result };
  return result;
}

export function resetReadinessCache() { cached = null; }

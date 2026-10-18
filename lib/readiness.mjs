// Read-only dependency readiness, not M3 attestation. Public health projects
// only ready/not_ready; diagnostics contain fixed codes, never upstream data.
import { createHash } from 'node:crypto';
import { resolveRuntime, releaseIdentity } from './runtime-mode.mjs';
import { ACTIVE_SUPABASE_ASSIGNMENTS, permanentSupabaseAssignmentProblem } from './deployment-topology.mjs';
import { EXPECTED_SCHEMA_VERSION, REQUIRED_RPCS } from './finance/pilot-doctor.mjs';
import { DOCUMENT_BUCKET, DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES } from './finance/document-storage.mjs';
import { readBoundedResponse } from './bounded-response.mjs';
import { demoPersonaSecretReady, demoPoolStatus } from './finance/demo-entry-readiness.mjs';

const CACHE_MS = 30000, TIMEOUT_MS = 2500;
let cached = null;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const configNames = ['ARANDU_ENV', 'ARANDU_DEPLOYMENT_KIND', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'ARANDU_DEMO_PASSWORD', 'VERCEL_GIT_COMMIT_SHA', 'VERCEL_GIT_COMMIT_REF'];
const actions = {
  demo_personas: 'Configurar o segredo forte das personas somente no servidor Demo autorizado, em acordo com o provisionamento.',
  demo_workspaces: 'Verificar pool sintético e baseline com o operador autorizado; não executar reset global ou provisionamento como probe.',
  configuration: 'Corrigir a configuração no alvo autorizado; não registrar valores.',
  topology: 'Confirmar atribuição aprovada e recovery antes do cutover; não alterar assignments para obter GO.',
  runtime: 'Confirmar o ambiente declarado e o datasource esperado.',
  release_identity: 'Confirmar main e SHA completo do deployment; comparar com --expected-commit no doctor.',
  supabase_auth: 'Verificar disponibilidade do Auth no mesmo projeto.',
  auth_settings: 'Verificar login por e-mail e confirmação de identidade no Auth autorizado.',
  supabase_rest: 'Verificar Data API, credencial de servidor e catálogo do schema.',
  schema: 'Comparar marker e manifesto; preparar rollout autorizado na ordem, com recovery.',
  environment_marker: 'Conferir isolamento e marker do datasource; não executar seed/reset como diagnóstico.',
  critical_rpcs: 'Conferir migrations e cache do PostgREST; não invocar RPC de escrita como probe.',
  storage: 'Verificar bucket privado, limites e disponibilidade; políticas/binários exigem ensaio próprio.'
};

async function probe(fetchImpl, url, key) {
  try {
    const response = await fetchImpl(url, { method: 'GET', headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'manual' });
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel().catch(() => {});
      return { status: [401, 403].includes(response.status) ? 'access_blocked' : response.status === 429 ? 'rate_limited' : 'unavailable' };
    }
    const bytes = await readBoundedResponse(response, 4 * 1024 * 1024);
    return { status: 'ok', data: JSON.parse(bytes.toString('utf8')) };
  } catch (error) {
    return { status: ['AbortError', 'TimeoutError'].includes(error?.name) ? 'timeout' : error?.name === 'SyntaxError' || ['response_too_large', 'missing_body'].includes(error?.message) ? 'inconclusive' : 'unavailable' };
  }
}

export async function evaluateReadiness({ env = process.env, fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  // Snapshot by value: process.env is mutable; cached GO must not survive a
  // changed datasource/key/commit just because the object identity is the same.
  const key = createHash('sha256').update(JSON.stringify(configNames.map(name => env[name] || ''))).digest('hex');
  if (cached && now >= cached.at && now - cached.at < CACHE_MS && cached.key === key && cached.fetchImpl === fetchImpl) return cached.result;
  const runtime = resolveRuntime(env), checks = [];
  const add = (name, status) => checks.push(Object.freeze({ name, status,
    outcome: status === 'ok' ? 'PASS' : status === 'access_blocked' ? 'ACCESS_BLOCKED' : status === 'not_run' ? 'NOT_RUN' : status === 'inconclusive' ? 'INCONCLUSIVE' : ['missing', 'unassigned_database', 'not_declared', 'sandbox'].includes(status) ? 'BLOCKED' : 'FAIL',
    code: `${name}_${status}`.toUpperCase(), next_action: status === 'ok' ? null : actions[name] }));
  add('runtime', runtime.misconfigured ? 'misconfigured' : runtime.isSandbox ? 'sandbox' : !runtime.environment ? 'not_declared' : 'ok');
  if (runtime.isDemo && !runtime.isSandbox) add('demo_personas', demoPersonaSecretReady(env.ARANDU_DEMO_PASSWORD) ? 'ok' : 'missing');
  if (runtime.environment && !runtime.misconfigured) {
    const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'].some(name => !String(env[name] || '').trim());
    let base = null, ref = null;
    try {
      const url = new URL(env.SUPABASE_URL);
      if (url.protocol === 'https:' && /^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) && !url.username && !url.password && !url.port && !url.search && !url.hash && /^\/*$/.test(url.pathname)) {
        base = url.origin; ref = url.hostname.split('.')[0];
      }
    } catch { /* fixed status only */ }
    add('configuration', missing ? 'missing' : base ? 'ok' : 'invalid');
    const topology = runtime.isPermanentEnvironment ? !permanentSupabaseAssignmentProblem(runtime.environment, ref) : (ACTIVE_SUPABASE_ASSIGNMENTS[runtime.environment] || []).includes(ref);
    add('topology', topology ? 'ok' : 'unassigned_database');
    const identity = releaseIdentity(env);
    add('release_identity', identity.branch && identity.commit ? 'ok' : 'inconclusive');
    if (!missing && base && topology) {
      const anon = String(env.SUPABASE_ANON_KEY).trim(), service = String(env.SUPABASE_SERVICE_ROLE_KEY).trim();
      const [auth, settings, rest, schema, marker, bucket] = await Promise.all([
        probe(fetchImpl, `${base}/auth/v1/health`, anon),
        probe(fetchImpl, `${base}/auth/v1/settings`, anon),
        probe(fetchImpl, `${base}/rest/v1/`, service),
        probe(fetchImpl, `${base}/rest/v1/fin_settings?select=value&key=eq.schema_version&limit=2`, service),
        probe(fetchImpl, `${base}/rest/v1/fin_settings?select=value&key=eq.deployment_environment&limit=2`, service),
        probe(fetchImpl, `${base}/storage/v1/bucket/${DOCUMENT_BUCKET}`, service)
      ]);
      add('supabase_auth', auth.status === 'ok' && (!object(auth.data) || auth.data.name !== 'GoTrue') ? 'inconclusive' : auth.status);
      add('auth_settings', settings.status !== 'ok' ? settings.status : settings.data?.external?.email === true && settings.data?.mailer_autoconfirm === false ? 'ok' : 'incompatible');
      const catalog = rest.status === 'ok' && object(rest.data?.paths) && object(rest.data?.definitions);
      add('supabase_rest', rest.status !== 'ok' ? rest.status : catalog ? 'ok' : 'inconclusive');
      add('schema', schema.status !== 'ok' ? schema.status : Array.isArray(schema.data) && schema.data.length === 1 && schema.data[0]?.value === EXPECTED_SCHEMA_VERSION ? 'ok' : 'incompatible');
      const markerValid = Array.isArray(marker.data) && (marker.data.length === 0 ? !runtime.isDemo : marker.data.length === 1 && marker.data[0]?.value === runtime.environment);
      add('environment_marker', marker.status !== 'ok' ? marker.status : markerValid ? 'ok' : 'incompatible');
      // Catalog proves presence/versioned names, not grants/hooks/function bodies.
      add('critical_rpcs', !catalog ? 'not_run' : REQUIRED_RPCS.every(rpc => object(rest.data.paths[`/rpc/${rpc}`])) ? 'ok' : 'incompatible');
      const b = bucket.data;
      const mime = value => Array.isArray(value) ? JSON.stringify([...value].sort()) : null;
      add('storage', bucket.status !== 'ok' ? bucket.status : b?.id === DOCUMENT_BUCKET && b.public === false && Number(b.file_size_limit) === DOCUMENT_MAX_BYTES && mime(b.allowed_mime_types) === mime(Object.keys(DOCUMENT_MIME_TYPES)) ? 'ok' : 'incompatible');
      if (runtime.isDemo) {
        const pool = await probe(fetchImpl, `${base}/rest/v1/fin_demo_workspaces?select=status,baseline_version&status=eq.ready&order=ready_at.asc,id.asc&limit=31`, service);
        add('demo_workspaces', pool.status === 'ok' ? demoPoolStatus(pool.data) : pool.status);
      }
    }
  }
  const ready = checks.every(check => check.outcome === 'PASS');
  const failing = checks.filter(check => check.outcome !== 'PASS').map(check => `${check.name}:${check.status}`).join(',');
  const result = Object.freeze({ ready, checks: Object.freeze(checks), failing });
  cached = { at: now, key, fetchImpl, result };
  return result;
}

export function resetReadinessCache() { cached = null; }

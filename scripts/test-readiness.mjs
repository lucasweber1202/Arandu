import assert from 'node:assert/strict';
import { evaluateReadiness, resetReadinessCache } from '../lib/readiness.mjs';
import { demoPersonaSecretReady, demoPoolStatus, demoPoolTotal } from '../lib/finance/demo-entry-readiness.mjs';
import { BASELINE_VERSION } from '../lib/finance/demo-workspaces.mjs';
import { demoWorkspaceFixture } from './fixtures/demo-workspace.mjs';

for (const value of [undefined, '', 'short1A', 'a'.repeat(20), 'A'.repeat(20), '1'.repeat(20), 'LongSecretWithoutDigits']) assert.equal(demoPersonaSecretReady(value), false);
assert.equal(demoPersonaSecretReady('SyntheticOnlySecret9'), true);
const readyWorkspace = demoWorkspaceFixture();
const poolStatus = (rows, options = {}) => demoPoolStatus(rows, { total: Array.isArray(rows) ? rows.length : null, ...options });
assert.equal(poolStatus([readyWorkspace]), 'ok');
assert.equal(poolStatus([]), 'capacity_unavailable');
assert.equal(demoPoolStatus(null), 'inconclusive');
for (const rows of [[null], [{ ...readyWorkspace, status: 'failed' }], [{ ...readyWorkspace, baseline_version: 'obsolete' }], [readyWorkspace, { ...readyWorkspace, baseline_version: 'obsolete' }],
  [{ status: 'ready', baseline_version: BASELINE_VERSION }], [{ ...readyWorkspace, user_ids: [] }], [{ ...readyWorkspace, personas: { ...readyWorkspace.personas, juliana: readyWorkspace.personas.helena } }],
  [readyWorkspace, demoWorkspaceFixture(2, { buyer_organization_id: readyWorkspace.buyer_organization_id })]]) assert.equal(poolStatus(rows), 'incompatible');
assert.equal(demoPoolStatus([readyWorkspace]), 'inconclusive', 'exact count is mandatory');
assert.equal(poolStatus([readyWorkspace], { total: 2 }), 'inconclusive', 'truncated Data API response cannot prove capacity');
assert.equal(demoPoolTotal('0-9/26'), 26); assert.equal(demoPoolTotal('*/0'), 0); assert.equal(demoPoolTotal('0-9/*'), null);
const now = Date.parse('2026-10-18T12:00:00Z'), future = '2026-10-19T12:00:00Z';
const claims = Array.from({ length: 25 }, (_, i) => demoWorkspaceFixture(i + 2, { status: 'claimed', expires_at: future, idle_expires_at: future }));
assert.equal(poolStatus([readyWorkspace, ...claims], { now }), 'capacity_unavailable', 'ready rows do not override the active ceiling');
assert.equal(poolStatus([readyWorkspace, ...claims.slice(1)], { now }), 'ok');
assert.equal(poolStatus([readyWorkspace, ...claims.map(row => ({ ...row, idle_expires_at: '2026-10-17T00:00:00Z' }))], { now }), 'inconclusive', 'expired response snapshot must not invent free capacity');

const PILOT = 'offgpyysgdhfemjlchod', LEGACY = 'igacnfjeuqhxcmfyepgj';
const secret = 'x'.repeat(40);
const env = extra => ({ ARANDU_ENV: 'pilot', SUPABASE_URL: `https://${PILOT}.supabase.co`, SUPABASE_ANON_KEY: secret,
  SUPABASE_SERVICE_ROLE_KEY: secret + 'y', CRON_SECRET: secret + 'z', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), ...extra });
const { EXPECTED_SCHEMA_VERSION, REQUIRED_RPCS } = await import('../lib/finance/pilot-doctor.mjs');
const { DOCUMENT_MIME_TYPES } = await import('../lib/finance/document-storage.mjs');
let calls = [];
const fake = (overrides = {}) => async (url, options) => {
  calls.push({ url, key: options.headers.apikey });
  assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'manual');
  const u = new URL(url);
  const name = u.pathname.includes('/health') ? 'auth' : u.pathname.includes('/settings') ? 'settings' : u.pathname.includes('/bucket/') ? 'storage'
    : u.searchParams.get('key') === 'eq.schema_version' ? 'schema' : u.searchParams.get('key') === 'eq.deployment_environment' ? 'marker' : 'rest';
  const defaults = { auth: { name: 'GoTrue' }, settings: { external: { email: true }, mailer_autoconfirm: false },
    rest: { definitions: {}, paths: Object.fromEntries(REQUIRED_RPCS.map(rpc => [`/rpc/${rpc}`, {}])) },
    schema: [{ value: EXPECTED_SCHEMA_VERSION }], marker: [],
    storage: { id: 'fin-documents', public: false, file_size_limit: 10485760, allowed_mime_types: Object.keys(DOCUMENT_MIME_TYPES) } };
  const change = overrides[name];
  if (change === 'hang') return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('secret'), { name: 'TimeoutError' }))));
  if (change === 'network') throw new Error(secret);
  return typeof change === 'number' ? new Response(null, { status: change }) : new Response(JSON.stringify(change === undefined ? defaults[name] : change));
};
const status = async (e = env(), fetchImpl = fake()) => { resetReadinessCache(); calls = []; return evaluateReadiness({ env: e, fetchImpl }); };
const byName = r => Object.fromEntries(r.checks.map(c => [c.name, c.status]));
assert.equal((await status({})).ready, false); assert.equal(calls.length, 0);
const missingPersonaSecret = await status(env({ ARANDU_ENV: 'demo' }));
assert.equal(byName(missingPersonaSecret).demo_personas, 'missing'); assert.equal(missingPersonaSecret.ready, false);
assert.equal(byName(await status({ ARANDU_ENV: 'staging-x' })).runtime, 'misconfigured');
assert.equal((await status({ ARANDU_DEPLOYMENT_KIND: 'demo' })).ready, false, 'sandbox is never hosted backend readiness'); assert.equal(calls.length, 0);
for (const ref of [LEGACY, PILOT, 'abcdefghijklmnopqrst']) {
  assert.equal(byName(await status(env({ ARANDU_ENV: 'production', SUPABASE_URL: `https://${ref}.supabase.co` }))).topology, 'unassigned_database'); assert.equal(calls.length, 0);
}
assert.equal(byName(await status(env({ CRON_SECRET: '' }))).configuration, 'missing'); assert.equal(calls.length, 0);
for (const url of [`http://${PILOT}.supabase.co`, `https://user:password@${PILOT}.supabase.co`, `https://${PILOT}.supabase.co?secret=x`, `https://${PILOT}.supabase.co/extra`]) {
  assert.equal((await status(env({ SUPABASE_URL: url }))).ready, false); assert.equal(calls.length, 0);
}
const ok = await status(); assert.equal(ok.ready, true); assert.equal(calls.length, 6);
assert.equal(calls.find(c => c.url.endsWith('/rest/v1/')).key, secret + 'y', 'REST accessibility must be verified with server credentials');
for (const [component, value, expected] of [
  ['auth', 503, 'unavailable'], ['auth', 403, 'access_blocked'], ['auth', 'network', 'unavailable'], ['auth', null, 'inconclusive'],
  ['rest', 401, 'access_blocked'], ['rest', 404, 'unavailable'], ['rest', 429, 'rate_limited'], ['rest', {}, 'inconclusive'],
  ['schema', [{ value: 'financial-surface-hardening-1' }], 'incompatible'], ['schema', [], 'incompatible'],
  ['schema', [{ value: EXPECTED_SCHEMA_VERSION }, { value: EXPECTED_SCHEMA_VERSION }], 'incompatible'],
  ['marker', [{ value: 'demo' }], 'incompatible'], ['settings', { external: { email: false }, mailer_autoconfirm: false }, 'incompatible'],
  ['settings', { external: { email: true }, mailer_autoconfirm: true }, 'incompatible'], ['storage', 503, 'unavailable'],
  ['storage', { id: 'fin-documents', public: true }, 'incompatible']
]) {
  const r = await status(env(), fake({ [component]: value })); assert.equal(r.ready, false, component);
  const check = { auth: 'supabase_auth', rest: 'supabase_rest', marker: 'environment_marker', settings: 'auth_settings' }[component] || component;
  assert.equal(byName(r)[check], expected, component); assert.ok(r.checks.find(c => c.name === check).next_action);
}
for (const rpc of ['fin_record_decision_v2', 'fin_act_on_approval_v2', 'fin_assignment_buyer_names', 'fin_demo_workspace_claim', 'fin_demo_workspace_resume', 'fin_demo_workspace_active', 'fin_demo_require_environment']) {
  const paths = Object.fromEntries(REQUIRED_RPCS.filter(name => name !== rpc).map(name => [`/rpc/${name}`, {}]));
  assert.equal(byName(await status(env(), fake({ rest: { definitions: {}, paths } }))).critical_rpcs, 'incompatible');
}
assert.equal((await status(env({ VERCEL_GIT_COMMIT_SHA: '' }))).ready, false);
assert.equal((await status(env({ VERCEL_GIT_COMMIT_REF: 'pilot' }))).ready, false);
assert.doesNotMatch(JSON.stringify(ok), new RegExp(`${secret}|${PILOT}|supabase\\.co|https?:`));
// Cache reuse, expiry, clock regression and in-place environment mutations.
resetReadinessCache(); calls = [];
const cachedEnv = env(), fetchImpl = fake();
await evaluateReadiness({ env: cachedEnv, fetchImpl, now: 1000 }); await evaluateReadiness({ env: cachedEnv, fetchImpl, now: 20000 });
assert.equal(calls.length, 6); await evaluateReadiness({ env: cachedEnv, fetchImpl, now: 40000 }); assert.equal(calls.length, 12);
cachedEnv.SUPABASE_URL = `https://${LEGACY}.supabase.co`;
assert.equal((await evaluateReadiness({ env: cachedEnv, fetchImpl, now: 40001 })).ready, false); assert.equal(calls.length, 12);
// AbortSignal.timeout is unref'ed; keep the synthetic test process alive until it fires.
const keepAlive = setInterval(() => {}, 1000);
try { assert.equal(byName(await status(env(), fake({ auth: 'hang' }))).supabase_auth, 'timeout'); }
finally { clearInterval(keepAlive); }

// Endpoint: sem probe continua liveness 200; com probe=ready, 503 quando não pronto.
const { default: health } = await import('../api/health.js');
const call = async (url, method = 'GET') => { const res = { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, end(body) { this.body = body; } }; await health({ method, url, headers: {} }, res); return res; };
resetReadinessCache();
const saved = { ...process.env }; for (const k of ['ARANDU_ENV', 'ARANDU_DEPLOYMENT_KIND']) delete process.env[k];
try {
  assert.equal((await call('/api/health')).statusCode, 200);
  const logged = []; const original = console.error; console.error = (line) => logged.push(line);
  let notReady; try { notReady = await call('/api/health?probe=ready'); } finally { console.error = original; }
  assert.equal(notReady.statusCode, 503); assert.equal(JSON.parse(notReady.body).status, 'not_ready');
  // Resposta pública sem detalhe interno; detalhe no log estruturado, sem valores.
  assert.deepEqual(Object.keys(JSON.parse(notReady.body)).sort(), ['ok', 'release', 'service', 'status']);
  assert.match(logged[0], /"route":"health\/ready"/); assert.match(logged[0], /runtime:not_declared/);
  assert.equal((await call('/api/health?probe=ready', 'HEAD')).statusCode, 503);
  assert.ok(notReady.headers['X-Request-ID']);
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  try {
    Object.assign(process.env, env()); console.error = () => {};
    globalThis.fetch = fake(); resetReadinessCache();
    assert.equal((await call('/api/health?probe=ready')).statusCode, 200);
    for (const failure of [{ auth: 503 }, { schema: [{ value: 'financial-surface-hardening-1' }] }, { storage: 403 }]) {
      globalThis.fetch = fake(failure); resetReadinessCache();
      assert.equal((await call('/api/health')).statusCode, 200, 'liveness stays independent');
      const response = await call('/api/health?probe=ready');
      assert.equal(response.statusCode, 503);
      assert.doesNotMatch(response.body, new RegExp(`${secret}|${PILOT}|schema|storage|auth_settings`));
    }
  } finally { globalThis.fetch = originalFetch; console.error = originalError; }
} finally { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
console.log('Readiness: liveness preserved, undeclared/misconfigured/unassigned database not ready without network, Supabase Auth/REST probes with timeout, cache and no secret in response passed.');

// Live check accepts the intentionally public identity; liveness alone cannot GO.
{
  const { assessPublicHealth } = await import('../lib/live-release-health.mjs');
  const payload = { ok: true, service: 'arandu-api', status: 'ready', release: { environment: 'demo', mode: 'demo', datasource: 'supabase', misconfigured: false, branch: 'main', commit: 'a'.repeat(40) } };
  const options = { environment: 'demo', commit: 'a'.repeat(40), readiness: true };
  assert.equal(assessPublicHealth(payload, options).outcome, 'PASS');
  for (const mutate of [p => { p.status = 'alive'; }, p => { p.ok = false; }, p => { p.release.datasource = 'synthetic-fixtures'; },
    p => { p.release.commit = 'b'.repeat(40); }, p => { p.release.environment = 'production'; }, p => { p.secret = 'forbidden'; }, p => { p.release.key = 'forbidden'; }]) {
    const next = structuredClone(payload); mutate(next); assert.equal(assessPublicHealth(next, options).outcome, 'FAIL');
  }
  assert.equal(assessPublicHealth(payload, { ...options, commit: undefined }).code, 'HEALTH_COMMIT_UNPROVEN');
}

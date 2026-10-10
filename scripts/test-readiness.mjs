import assert from 'node:assert/strict';
import { evaluateReadiness, resetReadinessCache } from '../lib/readiness.mjs';

const PILOT = 'offgpyysgdhfemjlchod', LEGACY = 'igacnfjeuqhxcmfyepgj';
const secret = 'x'.repeat(40);
const env = (extra) => ({ SUPABASE_ANON_KEY: secret, SUPABASE_SERVICE_ROLE_KEY: secret + 'y', CRON_SECRET: secret + 'z', ...extra });
let calls = [];
const fake = (auth = 200, rest = 200) => async (url, options) => { calls.push({ url, key: options.headers.apikey }); if (auth === 'hang') return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))); return { status: url.includes('/auth/') ? auth : rest }; };
const status = async (e, fetchImpl = fake()) => { resetReadinessCache(); calls = []; return evaluateReadiness({ env: e, fetchImpl }); };
const byName = (r) => Object.fromEntries(r.checks.map((c) => [c.name, c.status]));

// Sem ambiente declarado: nunca pronto, sem tocar a rede.
assert.equal((await status({})).ready, false); assert.equal(calls.length, 0);
assert.equal(byName(await status({ ARANDU_ENV: 'staging-x' })).runtime, 'misconfigured');
// Sandbox legado: pronto sem backend (é só fixture), sem rede.
assert.deepEqual(await status({ ARANDU_DEPLOYMENT_KIND: 'demo' }), { ready: true, checks: [{ name: 'runtime', status: 'sandbox' }], failing: '' }); assert.equal(calls.length, 0);
// Production sem atribuição aprovada (estado atual): not ready por topologia, sem rede.
for (const ref of [LEGACY, PILOT, 'abcdefghijklmnopqrst']) {
  const r = await status(env({ ARANDU_ENV: 'production', SUPABASE_URL: `https://${ref}.supabase.co` }));
  assert.equal(r.ready, false); assert.equal(byName(r).topology, 'unassigned_database'); assert.equal(calls.length, 0);
}
assert.equal(byName(await status({ ARANDU_ENV: 'demo', SUPABASE_URL: `https://${PILOT}.supabase.co` })).configuration, 'missing');
// Pilot aprovado e serviços respondendo: pronto; REST 401 conta como alcançável.
const ok = await status(env({ ARANDU_ENV: 'pilot', SUPABASE_URL: `https://${PILOT}.supabase.co/` }), fake(200, 401));
assert.equal(ok.ready, true); assert.deepEqual(calls.map((c) => c.url), [`https://${PILOT}.supabase.co/auth/v1/health`, `https://${PILOT}.supabase.co/rest/v1/`]);
assert.equal(byName(await status(env({ ARANDU_ENV: 'pilot', SUPABASE_URL: `https://${PILOT}.supabase.co` }), fake(503, 200))).supabase_auth, 'unavailable');
assert.equal(byName(await status(env({ ARANDU_ENV: 'pilot', SUPABASE_URL: `https://${PILOT}.supabase.co` }), fake(200, 502))).supabase_rest, 'unavailable');
assert.equal(byName(await status(env({ ARANDU_ENV: 'pilot', SUPABASE_URL: `https://${PILOT}.supabase.co` }), fake('hang'))).supabase_auth, 'timeout');
assert.equal(byName(await status(env({ ARANDU_ENV: 'pilot', SUPABASE_URL: `https://${LEGACY}.supabase.co` }))).topology, 'unassigned_database');
// Resposta nunca carrega valor, ref, URL ou chave.
assert.doesNotMatch(JSON.stringify(ok), new RegExp(`${secret}|${PILOT}|supabase\\.co|https?:`));
// Cache curto: a mesma configuração não reconsulta o upstream a cada probe.
resetReadinessCache(); calls = [];
const cachedEnv = env({ ARANDU_ENV: 'pilot', SUPABASE_URL: `https://${PILOT}.supabase.co` });
await evaluateReadiness({ env: cachedEnv, fetchImpl: fake(), now: 1000 }); await evaluateReadiness({ env: cachedEnv, fetchImpl: fake(), now: 20000 });
assert.equal(calls.length, 2); await evaluateReadiness({ env: cachedEnv, fetchImpl: fake(), now: 40000 }); assert.equal(calls.length, 4);

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
} finally { Object.assign(process.env, saved); }
console.log('Readiness: liveness preserved, undeclared/misconfigured/unassigned database not ready without network, Supabase Auth/REST probes with timeout, cache and no secret in response passed.');

#!/usr/bin/env node
// Fase 1 da integração efêmera: antes do seed, prova que banco, Auth,
// PostgREST, Storage e a API do Arandu respondem de verdade e que o RLS está
// ligado. Cria uma conta descartável (*.example), entra pela API real, confere
// a sessão e o RLS com o JWT dela e a remove; não cria organização, para que o
// seed oficial encontre o banco vazio. Cada espera tem prazo; nenhuma repete
// operação que falhou por erro da aplicação.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import { assertLocalEnv } from './assert-local.mjs';
import { EXPECTED_SCHEMA_VERSION } from '../../lib/finance/pilot-doctor.mjs';
import { decodeSessionValue } from '../../lib/session-cookie.mjs';

assertLocalEnv(process.env, 'smoke');
const { SUPABASE_URL: SB, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, ARANDU_DEMO_APP_URL: APP, PILOT_DB_URL: DB } = process.env;
for (const [name, value] of Object.entries({ SUPABASE_URL: SB, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, ARANDU_DEMO_APP_URL: APP, PILOT_DB_URL: DB })) {
  if (!value) { console.error(`${name} ausente.`); process.exit(2); }
}
const results = [];
const must = (condition, message) => { if (!condition) throw new Error(message); };
async function check(name, fn) {
  const started = Date.now();
  try { results.push({ name, ok: true, detail: String(await fn() ?? ''), ms: Date.now() - started }); }
  catch (error) { results.push({ name, ok: false, detail: error.message, ms: Date.now() - started }); }
}
// Prazo de cada espera; o teste de injeção de falhas (scripts/test-ci-demo.mjs) o encurta.
const HEALTH_MS = Number(process.env.CI_DEMO_HEALTH_TIMEOUT_MS) || 90_000;
const fetchT = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(Math.min(15_000, HEALTH_MS)) });
function sql(query) {
  const r = spawnSync('psql', [DB, '-v', 'ON_ERROR_STOP=1', '-At', '-c', query], { encoding: 'utf8', timeout: 30_000 });
  if (r.status !== 0) throw new Error(`SQL: ${(r.stderr || 'timeout').trim().split('\n').pop()}`);
  return r.stdout.trim();
}
async function waitFor(name, url, deadlineMs, init) {
  const until = Date.now() + deadlineMs;
  let last = 'sem resposta';
  while (Date.now() < until) {
    try { const r = await fetchT(url, init); if (r.ok) return r; last = `HTTP ${r.status}`; } catch (error) { last = error.cause?.code || error.message; }
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, deadlineMs / 4)));
  }
  throw new Error(`${name} não ficou saudável em ${deadlineMs / 1000} s (${last})`);
}

await check('Postgres: conexão, versão e schema do Arandu', async () => {
  const version = sql('show server_version');
  const schema = sql("select value from public.fin_settings where key = 'schema_version'");
  must(schema === EXPECTED_SCHEMA_VERSION, `schema_version ${schema || 'ausente'} ≠ ${EXPECTED_SCHEMA_VERSION}`);
  return `PostgreSQL ${version}; schema ${schema}`;
});
await check('Postgres: RLS ligado em todas as tabelas fin_*', async () => {
  const total = Number(sql("select count(*) from pg_tables where schemaname = 'public' and tablename like 'fin\\_%'"));
  const without = sql("select coalesce(string_agg(tablename, ','), '') from pg_tables where schemaname = 'public' and tablename like 'fin\\_%' and not rowsecurity");
  must(total > 0 && !without, `sem RLS: ${without}`);
  return `${total} tabelas fin_* com RLS`;
});
await check('Postgres: banco vazio antes do seed', async () => {
  const orgs = Number(sql('select count(*) from public.fin_organizations'));
  must(orgs === 0, `${orgs} organização(ões) já existem`);
  return '0 organizações';
});
await check('GoTrue (Auth) saudável pelo gateway', async () => { const r = await waitFor('Auth', `${SB}/auth/v1/health`, HEALTH_MS); return `HTTP ${r.status} ${(await r.json()).name || ''}`.trim(); });
await check('PostgREST saudável pelo gateway', async () => { const r = await waitFor('PostgREST', `${SB}/rest/v1/`, HEALTH_MS, { headers: { apikey: ANON } }); return `HTTP ${r.status}`; });
await check('Storage saudável e bucket fin-documents privado', async () => {
  await waitFor('Storage', `${SB}/storage/v1/status`, HEALTH_MS);
  const bucket = sql("select public::text from storage.buckets where id = 'fin-documents'");
  must(bucket === 'false', `bucket fin-documents public=${bucket || 'ausente'}`);
  return 'status OK; fin-documents privado';
});
await check('API do Arandu viva em ARANDU_ENV=demo com Supabase real', async () => {
  const r = await waitFor('API', `${APP}/api/health`, Math.min(60_000, HEALTH_MS));
  const body = await r.json();
  must(body.release?.environment === 'demo' && body.release?.datasource === 'supabase' && !body.release?.misconfigured, `release ${JSON.stringify(body.release)}`);
  return `environment=${body.release.environment}, datasource=${body.release.datasource}`;
});

const email = `smoke.${crypto.randomBytes(4).toString('hex')}@ci-smoke.example`;
const password = `Smoke-${crypto.randomBytes(12).toString('base64url')}-9a`;
let userId = null;
let cookie = null;
await check('Auth: conta descartável criada no GoTrue (admin)', async () => {
  const r = await fetchT(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true }) });
  const data = await r.json();
  must(r.ok && data.id, `HTTP ${r.status} ${data.msg || data.error_code || ''}`);
  userId = data.id;
  return 'conta *.example confirmada';
});
await check('Auth: senha errada recusada pela API do Arandu', async () => {
  const r = await fetchT(`${APP}/api/auth/login`, { method: 'POST', headers: { Origin: APP, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: `${password}x` }) });
  must(r.status >= 400 && r.status < 500 && !r.headers.getSetCookie().some((c) => c.startsWith('arandu_session=')), `HTTP ${r.status}`);
  return `HTTP ${r.status}, sem cookie`;
});
await check('Auth: login real pela API → cookie HttpOnly → sessão autenticada', async () => {
  const r = await fetchT(`${APP}/api/auth/login`, { method: 'POST', headers: { Origin: APP, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const set = r.headers.getSetCookie().find((c) => c.startsWith('arandu_session='));
  must(r.ok && set && /HttpOnly/i.test(set) && /Secure/i.test(set), `HTTP ${r.status}; cookie ${set ? 'sem HttpOnly/Secure' : 'ausente'}`);
  cookie = set.split(';')[0];
  const s = await (await fetchT(`${APP}/api/auth/session`, { headers: { Cookie: cookie } })).json();
  must(s.authenticated === true && s.user?.id === userId, 'sessão não autenticada ou de outro usuário');
  return 'HttpOnly; Secure; sessão do próprio usuário';
});
await check('RLS: usuário sem organização não lê nada; anônimo idem', async () => {
  const token = decodeSessionValue(decodeURIComponent(cookie.split('=')[1])).access_token;
  const asUser = await fetchT(`${SB}/rest/v1/fin_organizations?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
  const rows = await asUser.json();
  const asAnon = await fetchT(`${SB}/rest/v1/fin_rfqs?select=id`, { headers: { apikey: ANON } });
  const anonRows = asAnon.ok ? await asAnon.json() : [];
  must(asUser.ok && Array.isArray(rows) && rows.length === 0, `usuário: HTTP ${asUser.status}, ${rows?.length} linha(s)`);
  must(Array.isArray(anonRows) && anonRows.length === 0, `anônimo: ${anonRows.length} linha(s)`);
  return `usuário 0 linha(s) (HTTP ${asUser.status}); anônimo HTTP ${asAnon.status}, 0 linha(s)`;
});
await check('Auth: conta descartável removida', async () => {
  must(userId, 'sem conta para remover');
  const r = await fetchT(`${SB}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  must(r.ok, `HTTP ${r.status}`);
  must(sql(`select count(*) from auth.users where id = '${userId}'`) === '0', 'conta ainda existe');
  return 'removida do auth.users';
});

console.log('\nSmoke da integração efêmera (banco, Auth, PostgREST, Storage, API)');
for (const row of results) console.log(`  ${row.ok ? 'PASS' : 'FAIL'}  ${row.name}  — ${row.detail} (${row.ms} ms)`);
const failed = results.filter((row) => !row.ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações PASS.`);
process.exit(failed ? 1 : 0);

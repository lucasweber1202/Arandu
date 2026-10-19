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
import { DEMO_POOL_READINESS_PATH, demoPoolTotal, demoPoolStatus } from '../../lib/finance/demo-entry-readiness.mjs';
import { readBoundedResponse } from '../../lib/bounded-response.mjs';

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
await check('Pool: consulta real de capacidade e contagem exata antes do seed', async () => {
  const r = await fetchT(`${SB}/rest/v1/${DEMO_POOL_READINESS_PATH}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, Prefer: 'count=exact' }
  });
  must(r.ok, `HTTP ${r.status}`);
  const rows = JSON.parse((await readBoundedResponse(r, 4 * 1024 * 1024)).toString('utf8'));
  const total = demoPoolTotal(r.headers.get('content-range'));
  must(total === 0 && Array.isArray(rows) && rows.length === 0, 'pool pré-seed não vazio ou contagem ausente');
  must(demoPoolStatus(rows, { total }) === 'capacity_unavailable', 'pool vazio anunciado como pronto');
  return 'GET real aceito; count=0; capacidade indisponível corretamente';
});
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
// R1 (docs/supabase-financial-session-revocation.sql): depois do logout, o JWT
// copiado deixa de valer também no PostgREST direto, não só na API do Arandu.
const restAs = async (jwt, path, init = {}) => {
  const r = await fetchT(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' } });
  const body = await r.json().catch(() => null);
  return { status: r.status, code: body?.code || null };
};
const gotrueLogin = async () => {
  const r = await fetchT(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const data = await r.json();
  must(r.ok && data.access_token, `login GoTrue: HTTP ${r.status}`);
  return data;
};
await check('Sessão: hook de revogação registrado no PostgREST', async () => {
  const config = sql("select array_to_string(rolconfig, ',') from pg_roles where rolname = 'authenticator'");
  must(config.includes('pgrst.db_pre_request=public.fin_request_session_guard'), `authenticator sem o hook (${config})`);
  return 'pgrst.db_pre_request=public.fin_request_session_guard';
});
await check('Sessão: logout local encerra só aquela sessão; a outra segue valendo', async () => {
  const a = await gotrueLogin();
  const b = await gotrueLogin();
  must((await restAs(a.access_token, 'fin_organizations?select=id')).status === 200, 'pré-condição: sessão A ativa');
  const out = await fetchT(`${SB}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${a.access_token}` } });
  must(out.status === 204, `logout local: HTTP ${out.status}`);
  const table = await restAs(a.access_token, 'fin_organizations?select=id');
  const rpc = await restAs(a.access_token, 'rpc/fin_platform_role', { method: 'POST', body: '{}' });
  const write = await restAs(a.access_token, 'rpc/fin_create_organization', { method: 'POST', body: JSON.stringify({ p_name: 'Intruso pós-logout', p_kind: 'BUYER', p_country: 'BR' }) });
  const other = await restAs(b.access_token, 'fin_organizations?select=id');
  must(table.status === 401 && table.code === 'session_revoked', `tabela com token encerrado: HTTP ${table.status} ${table.code}`);
  must(rpc.status === 401 && write.status === 401, `RPC com token encerrado: leitura ${rpc.status}, escrita ${write.status}`);
  must(sql("select count(*) from public.fin_organizations where legal_name = 'Intruso pós-logout'") === '0', 'escrita com token encerrado chegou ao banco');
  must(other.status === 200, `outra sessão derrubada pelo logout local: HTTP ${other.status}`);
  return 'A: tabela 401, RPC 401, escrita 401 (nada gravado); B: 200';
});
await check('Sessão: logout pela API do Arandu derruba o token no PostgREST direto', async () => {
  const token = decodeSessionValue(decodeURIComponent(cookie.split('=')[1])).access_token;
  must((await restAs(token, 'fin_organizations?select=id')).status === 200, 'pré-condição: sessão da API ativa');
  const out = await fetchT(`${APP}/api/auth/logout`, { method: 'POST', headers: { Origin: APP, Cookie: cookie, 'Content-Type': 'application/json' }, body: '{}' });
  must(out.status === 200, `logout da API: HTTP ${out.status}`);
  const api = await fetchT(`${APP}/api/auth/session`, { headers: { Cookie: cookie } });
  const apiState = await api.json();
  const direct = await restAs(token, 'fin_organizations?select=id');
  must(apiState.authenticated === false, 'API ainda autentica o cookie antigo');
  must(direct.status === 401 && direct.code === 'session_revoked', `PostgREST aceitou o token depois do logout: HTTP ${direct.status} ${direct.code}`);
  return 'API: não autenticado; PostgREST: 401 session_revoked';
});
await check('Sessão: service_role e anon não passam pela checagem de sessão', async () => {
  const service = await restAs(SERVICE, 'fin_settings?select=key&limit=1');
  const anon = await fetchT(`${SB}/rest/v1/fin_rfqs?select=id`, { headers: { apikey: ANON } });
  must(service.status === 200, `service_role: HTTP ${service.status}`);
  must(anon.status !== 200 || (await anon.json()).length === 0, 'anon leu fin_rfqs');
  return `service_role 200; anon ${anon.status} como antes`;
});
await check('Auth: conta descartável removida', async () => {
  must(userId, 'sem conta para remover');
  const r = await fetchT(`${SB}/auth/v1/admin/users/${userId}`, { method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` } });
  must(r.ok, `HTTP ${r.status}`);
  must(sql(`select count(*) from auth.users where id = '${userId}'`) === '0', 'conta ainda existe');
  must(sql(`select count(*) from auth.sessions where user_id = '${userId}'`) === '0', 'sessões da conta removida continuam em auth.sessions');
  return 'removida do auth.users';
});

console.log('\nSmoke da integração efêmera (banco, Auth, PostgREST, Storage, API)');
for (const row of results) console.log(`  ${row.ok ? 'PASS' : 'FAIL'}  ${row.name}  — ${row.detail} (${row.ms} ms)`);
const failed = results.filter((row) => !row.ok).length;
console.log(`\n${results.length - failed}/${results.length} verificações PASS.`);
process.exit(failed ? 1 : 0);

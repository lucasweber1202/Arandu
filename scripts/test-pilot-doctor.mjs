// Doctor do piloto: veredito, códigos de saída, somente leitura e nenhum segredo
// na saída. Supabase e app simulados; nada de rede.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runDoctor, formatDoctor, EXPECTED_SCHEMA_VERSION, REQUIRED_TABLES, REQUIRED_RPCS } from '../lib/finance/pilot-doctor.mjs';
import { DOCUMENT_MIME_TYPES } from '../lib/finance/document-storage.mjs';

const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, iss: 'supabase' })).toString('base64url')}.assinatura-${role}-0123456789`;
const jwtRef = (role, ref) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, iss: 'supabase', ref })).toString('base64url')}.assinatura-${role}-${ref}-0123456789`;
const ANON = jwt('anon');
const SERVICE = jwt('service_role');
const CRON = 'c'.repeat(24) + 'segredo-do-cron-0123456789abcdef';
const baseEnv = {
  ARANDU_ENV: 'pilot', ARANDU_SITE_URL: 'https://piloto.example.com', SUPABASE_URL: 'https://proj.supabase.co',
  SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE, CRON_SECRET: CRON
};
const vercelConfig = { crons: [{ path: '/api/jobs/renewals', schedule: '15 9 * * *' }] };
const now = () => new Date('2026-10-02T12:00:00Z');

function fakeSupabase(overrides = {}) {
  const methods = [];
  const state = {
    bucketPublic: false, autoconfirm: false, allowlist: 3, anonLeak: false, schema: EXPECTED_SCHEMA_VERSION, missingRpc: null,
    productsStatus: 200, renewalsStatus: 401, anonRpcs: ['fin_document_mime_allowed', 'fin_jwt_aal'], anonRelations: ['artists'], legacyOpen: false,
    users: [
      { id: 'u-ops', email: 'ops@example.invalid', app_metadata: { arandu_role: 'finance_ops' }, factors: [{ factor_type: 'totp', status: 'verified' }] },
      { id: 'u-buyer', email: 'comprador@example.invalid', app_metadata: {}, factors: [] }
    ],
    ...overrides
  };
  const reply = (body, status = 200, headers = {}) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
  const fetchImpl = async (url, init = {}) => {
    methods.push(init.method || 'GET');
    const u = new URL(url);
    const key = init.headers?.apikey;
    if (u.hostname === 'piloto.example.com') {
      if (u.pathname === '/api/health') return reply({ ok: true, status: 'alive' });
      if (u.pathname === '/api/finance/products') return reply(state.productsStatus === 200 ? { ok: true } : { ok: false, code: 'rate_limit_unavailable' }, state.productsStatus, { 'x-request-id': 'b1c2d3e4-0000-4000-8000-000000000001' });
      if (u.pathname === '/api/forms') return state.legacyOpen ? reply({ ok: false, error: 'Método não permitido.' }, 405) : reply({ ok: false, code: 'legacy_surface_closed' }, 404);
      if (u.pathname === '/api/jobs/renewals') return reply({ ok: false, code: state.renewalsStatus === 401 ? 'cron_unauthorized' : 'x' }, state.renewalsStatus);
    }
    if (u.pathname === '/rest/v1/' && key === ANON) {
      return reply({ definitions: Object.fromEntries(state.anonRelations.map((name) => [name, {}])),
        paths: Object.fromEntries(state.anonRpcs.map((rpc) => [`/rpc/${rpc}`, {}])) });
    }
    if (u.pathname === '/rest/v1/') {
      return reply({ definitions: Object.fromEntries(REQUIRED_TABLES.map((table) => [table, {}])),
        paths: Object.fromEntries(REQUIRED_RPCS.filter((rpc) => rpc !== state.missingRpc).map((rpc) => [`/rpc/${rpc}`, {}])) });
    }
    if (u.pathname.startsWith('/rest/v1/')) {
      const table = u.pathname.slice('/rest/v1/'.length);
      if (key === ANON) return state.anonLeak && table === 'fin_rfqs' ? reply([{ id: 'x' }]) : reply({ code: '42501' }, 401);
      if (init.method === 'HEAD') {
        const total = table === 'fin_pilot_allowlist' ? state.allowlist : table === 'fin_organizations' ? 2 : table === 'fin_approval_policies' ? 1 : 0;
        return reply(null, 200, { 'content-range': `*/${total}` });
      }
      if (table === 'fin_settings') return reply(u.searchParams.get('key') === 'eq.schema_version' ? (state.schema ? [{ value: state.schema }] : []) : [{ value: state.emailEnabled ? 'true' : 'false' }]);
      if (table === 'fin_platform_operators') return reply([{ user_id: 'u-ops' }]);
      if (table === 'fin_job_runs') return reply([{ status: 'succeeded', error_code: null, finished_at: '2026-10-02T09:16:00Z' }]);
      return reply([]);
    }
    if (u.pathname === '/storage/v1/bucket/fin-documents') {
      return reply({ id: 'fin-documents', public: state.bucketPublic, file_size_limit: 10485760, allowed_mime_types: Object.keys(DOCUMENT_MIME_TYPES) });
    }
    if (u.pathname === '/auth/v1/health') return reply({ name: 'GoTrue' });
    if (u.pathname === '/auth/v1/settings') return reply({ external: { email: true }, mailer_autoconfirm: state.autoconfirm });
    // Como o GoTrue real: a listagem não traz fatores; a leitura por usuário traz.
    if (u.pathname === '/auth/v1/admin/users') return reply({ users: state.users.map(({ factors, ...user }) => user) });
    if (u.pathname.startsWith('/auth/v1/admin/users/')) return reply(state.users.find((user) => user.id === decodeURIComponent(u.pathname.split('/').pop())) || {}, 200);
    return reply({}, 404);
  };
  return { fetchImpl, methods };
}

async function doctor(env, overrides) {
  const fake = fakeSupabase(overrides);
  const report = await runDoctor({ env, fetchImpl: fake.fetchImpl, vercelConfig, now, timeoutMs: 1000 });
  const outputs = [JSON.stringify(report), formatDoctor(report)].join('\n');
  // Nunca imprime segredo, chave, JWT nem e-mail, e nunca escreve.
  for (const secret of [ANON, SERVICE, CRON, SERVICE.split('.')[1], 'ops@example.invalid', 'comprador@example.invalid']) {
    assert.ok(!outputs.includes(secret), `saída do doctor contém dado sensível: ${secret.slice(0, 12)}…`);
  }
  assert.deepEqual([...new Set(fake.methods)].filter((method) => !['GET', 'HEAD'].includes(method)), [], 'doctor precisa ser somente leitura');
  return report;
}
const levelOf = (report, name) => report.checks.find((check) => check.name === name)?.level;

// Ambiente completo → GO (exit 0). E-mail desligado sem provedor é aviso, não bloqueio.
const complete = await doctor(baseEnv);
assert.equal(complete.result, 'GO', formatDoctor(complete));
assert.equal(complete.exit_code, 0);
assert.equal(levelOf(complete, 'provedor'), 'WARN');
assert.equal(levelOf(complete, 'finance_ops com MFA'), 'OK', 'fator TOTP lido por usuário');
for (const category of ['ENVIRONMENT', 'SECURITY', 'DATABASE', 'STORAGE', 'AUTH', 'PILOT', 'EMAIL', 'CRON', 'OPERATIONS']) {
  assert.ok(complete.checks.some((check) => check.category === category), `categoria ${category} sem checks`);
}

// Incompleto → NO-GO (exit 1).
const { CRON_SECRET: _cron, SUPABASE_SERVICE_ROLE_KEY: _service, ...partial } = baseEnv;
const incomplete = await doctor(partial);
assert.equal(incomplete.exit_code, 1);
assert.equal(levelOf(incomplete, 'CRON_SECRET'), 'ERROR');
assert.equal((await doctor(baseEnv, { allowlist: 0 })).exit_code, 1, 'allowlist vazia bloqueia');
assert.equal((await doctor(baseEnv, { schema: 'financial-pilot-grade-1' })).exit_code, 1, 'migration antiga bloqueia');
assert.equal((await doctor(baseEnv, { missingRpc: 'consume_rate_limit' })).exit_code, 1, 'limitador ausente bloqueia');
assert.equal((await doctor(baseEnv, { productsStatus: 503 })).exit_code, 1, 'API financeira em 503 bloqueia');
assert.equal((await doctor(baseEnv, { renewalsStatus: 404 })).exit_code, 1, 'rota do cron sem chegar à função bloqueia');
assert.equal((await doctor({ ...baseEnv, ARANDU_ENV: 'staging' })).exit_code, 1, 'ambiente desconhecido');
assert.equal((await doctor({ ...baseEnv, ARANDU_ENV: 'production' })).exit_code, 0, 'produção com banco próprio');
const prodOnPilot = await doctor({ ...baseEnv, ARANDU_ENV: 'production', SUPABASE_URL: 'https://offgpyysgdhfemjlchod.supabase.co' });
assert.equal(prodOnPilot.exit_code, 2, 'produção no banco do piloto');
assert.equal(levelOf(prodOnPilot, 'projeto Supabase do piloto'), 'UNSAFE');
assert.equal((await doctor(baseEnv, { legacyOpen: true })).exit_code, 1, 'rotas legadas de arte abertas no piloto bloqueiam');
assert.equal(levelOf(await doctor({ ...baseEnv, SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: jwtRef('anon', 'proj'), SUPABASE_SERVICE_ROLE_KEY: jwtRef('service_role', 'proj') }), 'chaves do mesmo projeto'), 'OK');
assert.equal(levelOf(complete, 'identificador de requisição'), 'OK');
assert.equal(levelOf(complete, 'RPCs executáveis pela chave pública'), 'OK');
const emailOn = await doctor(baseEnv, { emailEnabled: true });
assert.equal(levelOf(emailOn, 'provedor'), 'ERROR', 'email_enabled=true sem provedor deixa avisos presos na fila');
assert.equal(emailOn.exit_code, 1);

// Configuração insegura → UNSAFE (exit 2), mesmo que falte outra coisa.
const unsafeCases = [
  [{ ...baseEnv, SUPABASE_ANON_KEY: SERVICE }, {}, 'chave pública é anon'],
  [{ ...baseEnv, CRON_SECRET: SERVICE }, {}, 'CRON_SECRET próprio'],
  [{ ...baseEnv, VITE_SUPABASE_SERVICE_ROLE_KEY: SERVICE }, {}, 'segredo fora de variável pública'],
  [{ ...baseEnv, ARANDU_DEMO_MODE: 'true' }, {}, 'modo demonstração desligado'],
  [baseEnv, { bucketPublic: true }, 'bucket privado'],
  [baseEnv, { autoconfirm: true }, 'confirmação de e-mail'],
  [baseEnv, { anonLeak: true }, 'RLS/grants contra a chave pública'],
  [{ ...partial, SUPABASE_ANON_KEY: SERVICE }, {}, 'chave pública é anon'],
  [{ ...baseEnv, SUPABASE_URL: 'https://igacnfjeuqhxcmfyepgj.supabase.co' }, {}, 'projeto Supabase do piloto'],
  [{ ...baseEnv, SUPABASE_ANON_KEY: jwtRef('anon', 'outroprojeto') }, {}, 'chaves do mesmo projeto'],
  [baseEnv, { anonRpcs: ['fin_document_mime_allowed', 'fin_jwt_aal', 'fin_pilot_access_allowed', 'execute_data_retention'] }, 'RPCs executáveis pela chave pública'],
  [baseEnv, { anonRelations: ['artists', 'v_commercial_pipeline'] }, 'tabelas financeiras e views legadas fora da chave pública']
];
for (const [env, overrides, name] of unsafeCases) {
  const report = await doctor(env, overrides);
  assert.equal(report.result, 'UNSAFE', name);
  assert.equal(report.exit_code, 2, name);
  assert.equal(levelOf(report, name), 'UNSAFE', name);
}

// Sem finance_ops com MFA: aviso, não bloqueio; operador legado sinalizado.
const legacyOnly = await doctor(baseEnv, { users: [{ id: 'u-ops', email: 'ops@example.invalid', app_metadata: { arandu_role: 'operator' }, factors: [] }] });
assert.equal(levelOf(legacyOnly, 'finance_ops com MFA'), 'WARN');
assert.equal(levelOf(legacyOnly, 'operador legado'), 'WARN');
assert.match(legacyOnly.checks.find((check) => check.name === 'operadores finance_ops').detail, /1 registro\(s\) sem papel finance_ops/);

// A versão esperada é a que a última migration grava.
const manifest = JSON.parse(fs.readFileSync('docs/supabase-migrations.json', 'utf8'));
const last = manifest.cleanInstall.at(-1);
assert.match(fs.readFileSync(last, 'utf8'), new RegExp(`'schema_version', '${EXPECTED_SCHEMA_VERSION}'`), `${last} não grava ${EXPECTED_SCHEMA_VERSION}`);

console.log(`Pilot doctor: GO/NO-GO/UNSAFE com saídas 0/1/2, ${unsafeCases.length} configurações inseguras detectadas, somente leitura e sem segredo ou e-mail na saída.`);

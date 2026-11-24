// Testes do preflight SOMENTE LEITURA da Demo e da reconciliação de schema.
// Rede SIMULADA (fetch falso): prova decisões e a ausência de escrita, não o
// estado do Supabase hospedado.
import assert from 'node:assert/strict';
import { runHostedPreflight, readOnlyFetch, httpCode } from '../lib/demo/hosted-preflight.mjs';
import { classifySchema, migrationRelations, loadManifest, relationsFromOpenApi } from '../lib/demo/schema-reconcile.mjs';

const REF = 'offgpyysgdhfemjlchod';
const LEGACY = 'igacnfjeuqhxcmfyepgj';
const SHA = 'a'.repeat(40);
const jwt = (payload) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;
const env = (over = {}) => ({ ARANDU_ENV: 'demo', ARANDU_DEMO_CONFIRM: REF, SUPABASE_URL: `https://${REF}.supabase.co`, ARANDU_DEMO_APP_URL: 'https://arandu-demo.vercel.app',
  SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: REF }), SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: REF }),
  ARANDU_DEMO_PASSWORD: 'Demo-Senha-2026', CRON_SECRET: 'c'.repeat(40), ...over });

const plan = migrationRelations(loadManifest());
const allRelations = [...new Set(plan.flatMap((row) => row.relations))];
const openapi = (relations) => ({ paths: Object.fromEntries([...relations.map((name) => [`/${name}`, {}]), ['/rpc/fin_scenario_command', {}], ['/', {}]]) });

/** Supabase + app falsos. Registra qualquer método recebido. */
function fake(over = {}) {
  return fakeWith({ ...over, over });
}
function fakeWith({ over = {}, hidden = ['fin_renewal_operations'], relations = allRelations, release = { environment: 'demo', datasource: 'supabase', commit: SHA }, marker = null, organizations = 0, bucket = { public: false }, status = {} } = {}) {
  const seen = [];
  const impl = async (url, options = {}) => {
    seen.push(options.method || 'GET');
    const u = new URL(url);
    const reply = (body, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });
    for (const [prefix, code] of Object.entries(status)) if (u.pathname.startsWith(prefix)) return reply({}, code);
    if (u.pathname === '/api/health') return reply({ ok: true, release });
    if (u.pathname === '/auth/v1/health') return reply({ name: 'GoTrue' });
    if (u.pathname === '/storage/v1/bucket/fin-documents') return bucket ? reply(bucket) : reply({ error: 'not found' }, 404);
    if (u.pathname === '/rest/v1/') return reply(openapi(relations.filter((name) => !hidden.includes(name))));
    if (u.pathname.startsWith('/rest/v1/fin_') && u.searchParams.get('limit') === '0' && !['/rest/v1/fin_settings', '/rest/v1/fin_organizations', '/rest/v1/fin_demo_workspaces'].includes(u.pathname)) {
      const name = u.pathname.slice('/rest/v1/'.length);
      return hidden.includes(name) && relations.includes(name) ? reply({ code: '42501' }, 403) : relations.includes(name) ? reply([]) : reply({ code: '42P01' }, 404);
    }
    if (u.pathname === '/rest/v1/fin_settings') return reply(u.searchParams.get('key') === 'eq.schema_version' ? [] : marker === null ? [] : [{ value: marker }]);
    if (u.pathname === '/rest/v1/fin_demo_workspaces') return reply(Array.from({ length: over.workspaces ?? 0 }, () => ({ status: 'ready' })));
    if (u.pathname === '/rest/v1/fin_organizations') return reply(Array.from({ length: organizations }, (_, i) => ({ id: i })));
    return reply({}, 404);
  };
  return { impl, seen };
}
let count = 0;
const ok = async (name, fn) => { await fn(); count++; console.log(`ok - ${name}`); };

// ---------------------------------------------------------- schema
await ok('manifesto: Arandu 10 introduz cenários e a view de renovações', () => {
  const row = plan.find((r) => r.file.endsWith('arandu-10.sql'));
  assert.deepEqual(row.relations, ['fin_decision_scenarios', 'fin_renewal_operations']);
  assert(!allRelations.includes('profiles'), 'tabelas de arte removidas pela desativação não são esperadas');
});
await ok('schema completo = compatible', () => assert.equal(classifySchema(plan, allRelations).state, 'compatible'));
await ok('sem Arandu 10 = incremental com pendentes em ordem', () => {
  const r = classifySchema(plan, allRelations.filter((n) => !['fin_decision_scenarios', 'fin_renewal_operations'].includes(n)));
  assert.equal(r.state, 'incremental');
  assert.deepEqual(r.pending.slice(-2), ['docs/supabase-financial-arandu-10.sql', 'docs/supabase-financial-invite-integrity.sql']);
  assert(r.pending.includes('docs/supabase-financial-contract-email-links.sql'), 'migration sem relação própria após a última completa também é pendente');
});
await ok('meia migration = partial', () => assert.equal(classifySchema(plan, allRelations.filter((n) => n !== 'fin_renewal_operations')).state, 'partial'));
await ok('migration antiga ausente com posteriores presentes = divergent', () => {
  const single = plan.find((r) => r.relations.length === 1 && plan.indexOf(r) < plan.length - 5);
  const r = classifySchema(plan, allRelations.filter((n) => n !== single.relations[0]));
  assert.equal(r.state, 'divergent'); assert.equal(r.reason, 'out_of_order');
});
await ok('relação de domínio fora do manifesto = divergent', () => assert.equal(classifySchema(plan, [...allRelations, 'fin_rogue']).reason, 'unexpected_relations'));
await ok('inventário ilegível = indeterminate', () => assert.equal(classifySchema(plan, relationsFromOpenApi(null)).state, 'indeterminate'));
await ok('banco vazio = incremental desde a primeira migration', () => {
  const r = classifySchema(plan, []);
  assert.equal(r.state, 'incremental'); assert.equal(r.pending[0], plan[0].file);
});

// ---------------------------------------------------------- preflight
await ok('somente leitura: POST/PATCH/DELETE/corpo falham antes da rede', async () => {
  let called = 0;
  const guarded = readOnlyFetch(async () => { called++; return new Response('{}'); });
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) await assert.rejects(guarded('https://x.supabase.co/rest/v1/t', { method }), { code: 'WRITE_ATTEMPT' });
  await assert.rejects(guarded('https://x.supabase.co/rest/v1/t', { body: '{}' }), { code: 'WRITE_ATTEMPT' });
  assert.equal(called, 0);
});
await ok('GO: alvo, app canônico no commit, auth, storage privado, schema completo, banco vazio — só GET', async () => {
  const net = fake();
  const r = await runHostedPreflight({ env: env(), expectedSha: SHA, fetchImpl: net.impl, plan });
  assert.equal(r.verdict, 'GO', JSON.stringify(r.checks));
  assert.deepEqual([...new Set(net.seen)], ['GET']);
  assert(r.requests.every((q) => q.method === 'GET' && !/key|token/i.test(q.path)));
});
await ok('NO-GO: estado público atual (sandbox sem ARANDU_ENV, Arandu 10 ausente)', async () => {
  const r = await runHostedPreflight({ env: env(), expectedSha: SHA, plan,
    fetchImpl: fake({ release: { environment: null, mode: 'demo', datasource: 'synthetic-fixtures', commit: 'b'.repeat(40) }, relations: allRelations.filter((n) => !['fin_decision_scenarios', 'fin_renewal_operations'].includes(n)) }).impl });
  assert.equal(r.verdict, 'NO-GO');
  assert(r.codes.includes('APP_NOT_CANONICAL') && r.codes.includes('SCHEMA_PENDING'));
  assert.deepEqual(r.schema.pending.slice(-2), ['docs/supabase-financial-arandu-10.sql', 'docs/supabase-financial-invite-integrity.sql']);
});
await ok('NO-GO: ref legado/produção recusado antes de qualquer requisição ao banco', async () => {
  const net = fake();
  const r = await runHostedPreflight({ env: env({ SUPABASE_URL: `https://${LEGACY}.supabase.co`, ARANDU_DEMO_CONFIRM: LEGACY, SUPABASE_ANON_KEY: jwt({ role: 'anon', ref: LEGACY }), SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: LEGACY }) }), fetchImpl: net.impl, plan });
  assert.equal(r.verdict, 'NO-GO'); assert(r.codes.includes('TARGET_INVALID'));
  assert.equal(net.seen.length, 0);
});
await ok('NO-GO: ref desconhecido e confirmação divergente', async () => {
  const other = 'abcdefghijklmnopqrst';
  const r = await runHostedPreflight({ env: env({ SUPABASE_URL: `https://${other}.supabase.co`, ARANDU_DEMO_CONFIRM: other }), fetchImpl: fake().impl, plan });
  assert(r.codes.includes('TARGET_INVALID'));
  const r2 = await runHostedPreflight({ env: env({ ARANDU_DEMO_CONFIRM: 'outro' }), fetchImpl: fake().impl, plan });
  assert(r2.codes.includes('TARGET_INVALID'));
});
await ok('NO-GO: Environment errado (ARANDU_ENV != demo) e execução dentro de deploy', async () => {
  assert((await runHostedPreflight({ env: env({ ARANDU_ENV: 'production' }), fetchImpl: fake().impl, plan })).codes.includes('TARGET_INVALID'));
  assert((await runHostedPreflight({ env: env({ VERCEL_ENV: 'production' }), fetchImpl: fake().impl, plan })).codes.includes('TARGET_INVALID'));
});
await ok('NO-GO: segredos ausentes listados por nome, sem valores', async () => {
  const r = await runHostedPreflight({ env: env({ CRON_SECRET: '', ARANDU_DEMO_PASSWORD: '' }), fetchImpl: fake().impl, plan });
  const check = r.checks.find((c) => c.id === 'secrets');
  assert.equal(check.code, 'SECRET_MISSING'); assert.equal(check.detail, 'ARANDU_DEMO_PASSWORD, CRON_SECRET');
  assert(!JSON.stringify(r).includes(env().SUPABASE_SERVICE_ROLE_KEY));
});
await ok('NO-GO: segredo presente mas recusado (401) vira SECRET_INVALID', async () => {
  const r = await runHostedPreflight({ env: env(), fetchImpl: fake({ status: { '/rest/v1/': 401 } }).impl, plan });
  assert(r.codes.includes('SECRET_INVALID'));
});
await ok('NO-GO: banco com dados ou marcador de outro ambiente', async () => {
  assert((await runHostedPreflight({ env: env(), fetchImpl: fake({ organizations: 1 }).impl, plan })).codes.includes('MARKER_MISMATCH'));
  assert((await runHostedPreflight({ env: env(), fetchImpl: fake({ marker: 'production' }).impl, plan })).codes.includes('MARKER_MISMATCH'));
  assert((await runHostedPreflight({ env: env(), fetchImpl: fake({ marker: 'demo', organizations: 3 }).impl, plan })).codes.includes('DATA_PRESENT'));
});
await ok('relação revogada do service_role (42501) conta como existente; ausência real (42P01) não', async () => {
  const r = await runHostedPreflight({ env: env(), plan, fetchImpl: fake({ hidden: ['fin_renewal_operations', 'fin_decision_scenarios'] }).impl });
  assert.equal(r.schema.state, 'compatible', JSON.stringify(r.schema));
  const gone = await runHostedPreflight({ env: env(), plan, fetchImpl: fake({ hidden: ['fin_renewal_operations'], relations: allRelations.filter((n) => n !== 'fin_renewal_operations') }).impl });
  assert.equal(gone.schema.state, 'partial');
  assert(gone.requests.every((q) => q.method === 'GET'));
});
await ok('schema_version: marcador desconhecido = divergente; pendente provado pelo marcador', () => {
  assert.equal(classifySchema(plan, allRelations, { schemaVersion: 'financial-unknown-1' }).reason, 'unknown_schema_version');
  const before = classifySchema(plan, allRelations.filter((n) => !['fin_decision_scenarios', 'fin_renewal_operations'].includes(n)), { schemaVersion: 'financial-contract-email-links-1' });
  assert.deepEqual(before.pending, ['docs/supabase-financial-arandu-10.sql', 'docs/supabase-financial-invite-integrity.sql']);
  assert.equal(classifySchema(plan, allRelations, { schemaVersion: 'financial-contract-email-links-1' }).state, 'incremental');
  assert.equal(classifySchema(plan, allRelations, { schemaVersion: 'financial-invite-integrity-1' }).state, 'compatible');
  assert.equal(classifySchema(plan, allRelations.filter((n) => n !== 'fin_decision_scenarios' && n !== 'fin_renewal_operations'), { schemaVersion: 'financial-invite-integrity-1' }).reason, 'schema_version_ahead_of_relations');
});
await ok('NO-GO: schema parcial/divergente e storage público', async () => {
  assert((await runHostedPreflight({ env: env(), fetchImpl: fake({ relations: allRelations.filter((n) => n !== 'fin_renewal_operations') }).impl, plan })).codes.includes('SCHEMA_PARTIAL'));
  assert((await runHostedPreflight({ env: env(), fetchImpl: fake({ relations: [...allRelations, 'fin_rogue'] }).impl, plan })).codes.includes('SCHEMA_DIVERGENT'));
  assert((await runHostedPreflight({ env: env(), fetchImpl: fake({ bucket: { public: true } }).impl, plan })).codes.includes('STORAGE_UNAVAILABLE'));
});
await ok('NO-GO: commit publicado diferente do esperado; quota e rede classificadas', async () => {
  assert((await runHostedPreflight({ env: env(), expectedSha: 'f'.repeat(40), fetchImpl: fake().impl, plan })).codes.includes('APP_COMMIT_MISMATCH'));
  assert((await runHostedPreflight({ env: env(), fetchImpl: fake({ status: { '/auth/': 429 } }).impl, plan })).codes.includes('QUOTA'));
  assert((await runHostedPreflight({ env: env(), fetchImpl: async () => { throw new TypeError('fetch failed'); }, plan })).codes.includes('NETWORK'));
  assert.equal(httpCode(403), 'PERMISSION');
});
await ok('status pós-provisionamento: READY só com dados marcados e 2 workspaces; camadas separadas', async () => {
  const ready = await runHostedPreflight({ env: env(), phase: 'status', plan, fetchImpl: fake({ marker: 'demo', organizations: 4, workspaces: 2 }).impl });
  assert.equal(ready.verdict, 'READY', JSON.stringify(ready.checks));
  assert.equal(ready.layers.demo_data, 'seeded'); assert.equal(ready.layers.journeys, 'not_verified_by_preflight');
  const empty = await runHostedPreflight({ env: env(), phase: 'status', plan, fetchImpl: fake({ workspaces: 2 }).impl });
  assert.equal(empty.verdict, 'NOT_READY'); assert(empty.codes.includes('DATA_MISSING'));
  const few = await runHostedPreflight({ env: env(), phase: 'status', plan, fetchImpl: fake({ marker: 'demo', organizations: 4, workspaces: 1 }).impl });
  assert(few.codes.includes('WORKSPACES_MISSING'));
  const sandbox = await runHostedPreflight({ env: env(), plan, fetchImpl: fake({ release: { environment: null, datasource: 'synthetic-fixtures' } }).impl });
  assert.equal(sandbox.layers.app_compiled, 'present'); assert.equal(sandbox.layers.api, 'unexpected');
  assert.equal(sandbox.layers.canonical_runtime, 'sem ARANDU_ENV+synthetic-fixtures', 'HTTP 200 não vira readiness');
});
// ---------------------------------------------------------- workflow
await ok('workflow: só dispatch na main; preflight sem escrita; provisionamento depende de GO e autorização', async () => {
  const fs = await import('node:fs');
  const yml = fs.readFileSync('.github/workflows/demo-hosted-seed.yml', 'utf8');
  const triggers = yml.slice(yml.indexOf('\non:'), yml.indexOf('\npermissions:'));
  assert(/workflow_dispatch:/.test(triggers) && !/\b(push|pull_request|schedule|workflow_run):/.test(triggers), 'nenhum gatilho automático');
  const preflight = yml.slice(yml.indexOf('\n  preflight:'), yml.indexOf('\n  recover:'));
  const recover = yml.slice(yml.indexOf('\n  recover:'), yml.indexOf('\n  provision:'));
  assert(!/execute|verify-plan/.test(preflight) && /baseline-state\.mjs inspect/.test(preflight), 'preflight só inspeciona a baseline');
  assert(/needs\.preflight\.outputs\.verdict == 'GO'/.test(recover) && /inputs\.mode == 'recover-and-provision'/.test(recover), 'recuperação depende de GO e do modo explícito');
  assert(/AUTHORIZATION_REFERENCE/.test(recover) && /test "\$APPROVED_PLAN" = "\$INSPECTED_PLAN"/.test(recover), 'recuperação exige autorização e o plano aprovado igual ao inspecionado');
  assert(recover.indexOf('Exigir autorização') < recover.indexOf('baseline-state.mjs execute'), 'autorização antes de qualquer escrita');
  assert(/execute --plan-sha256="\$APPROVED_PLAN"/.test(recover) && /verify-after/.test(recover) && /--phase=status/.test(recover));
  const provision = yml.slice(yml.indexOf('\n  provision:'));
  assert(!/demo:seed|demo:workspaces|--reset|release-migrations|psql|supabase db/.test(preflight), 'preflight não chama escrita');
  assert(/hosted-preflight\.mjs/.test(preflight));
  assert(/needs: preflight/.test(provision) && /needs\.preflight\.outputs\.verdict == 'GO'/.test(provision) && /seed-and-provision/.test(provision));
  assert(/authorization_reference/.test(provision) && /AUTHORIZATION_REFERENCE/.test(provision));
  assert(!/release-migrations|--apply|psql/.test(yml), 'migrations hospedadas não são aplicadas por este fluxo');
  assert(!/89b1f0f68e7c2a3cdf3fa138fc683889124098dc|9fxmf7u6k/.test(yml), 'sem SHA/URL de preview fixos');
  assert(/cancel-in-progress: false/.test(yml) && /group: arandu-demo-pool/.test(yml), 'sem execução concorrente no mesmo alvo');
});
await ok('fase recovery: dados da própria Demo não bloqueiam; dados estranhos continuam NO-GO', async () => {
  const marked = await runHostedPreflight({ env: env(), phase: 'recovery', plan, fetchImpl: fake({ marker: 'demo', organizations: 6 }).impl });
  assert.equal(marked.verdict, 'GO', JSON.stringify(marked.checks));
  const before = await runHostedPreflight({ env: env(), plan, fetchImpl: fake({ marker: 'demo', organizations: 6 }).impl });
  assert(before.codes.includes('DATA_PRESENT'), 'before-seed continua exigindo banco vazio');
  const foreign = await runHostedPreflight({ env: env(), phase: 'recovery', plan, fetchImpl: fake({ organizations: 3 }).impl });
  assert(foreign.codes.includes('MARKER_MISMATCH'), 'organizações sem marcador Demo continuam recusadas');
  await assert.rejects(runHostedPreflight({ env: env(), phase: 'apply', plan, fetchImpl: fake().impl }));
});
console.log(`${count} testes do preflight da Demo e da reconciliação de schema OK (rede simulada).`);

// Classificação da baseline da Demo e plano de recuperação (lib/demo/baseline-state.mjs).
// Fatos e rede SIMULADOS: prova as decisões, a ausência de escrita e a recusa de
// alvos proibidos; não prova o estado do Supabase hospedado.
import assert from 'node:assert/strict';
import { classifyBaseline, recoveryPlan, collectBaselineFacts, BASELINE_PERSONAS } from '../lib/demo/baseline-state.mjs';
import { BUYERS, PROVIDERS } from '../lib/finance/demo-personas.mjs';

const REF = 'offgpyysgdhfemjlchod';
const TITLES = ['A', 'B', 'C'];
const emails = Object.keys(BASELINE_PERSONAS);
const users = (list = emails) => list.map((email, i) => ({ id: `u${i}`, email }));
const helena = 'u0';
const baselineOrgs = () => [{ id: 'o0', kind: 'BUYER', legal_name: 'Vitta Foods S.A.', created_by: helena },
  ...Object.values(PROVIDERS).map((p, i) => ({ id: `p${i}`, kind: 'PROVIDER', legal_name: p.org, created_by: `u${4 + i}` }))];
const facts = (over = {}) => ({ ref: REF, readErrors: [], schemaState: 'compatible', marker: 'demo', users: users(), orgs: baselineOrgs(), workspaces: [],
  expectedRfqTitles: TITLES, baselineRfqTitles: [], baselineContracts: 0, ...over });
let n = 0;
const ok = async (name, fn) => { await fn(); n++; console.log(`ok - ${name}`); };

await ok('personas: 4 compradores + 5 instituições, todas .example', () => {
  assert.equal(emails.length, Object.keys(BUYERS).length + Object.keys(PROVIDERS).length);
  assert(emails.every((e) => e.endsWith('.example')));
});
await ok('banco vazio e só marcador', () => {
  assert.equal(classifyBaseline(facts({ marker: null, users: [], orgs: [] })).state, 'empty');
  const marker = classifyBaseline(facts({ users: [], orgs: [] }));
  assert.equal(marker.state, 'marker_only');
  assert.deepEqual(recoveryPlan(marker).operations.map((s) => s.id), ['seed-baseline', 'check-baseline', 'provision-workspaces']);
});
await ok('estado observado em 19/11 (9 contas, 6 organizações, 0 workspaces, história interrompida) = baseline_partial', () => {
  const c = classifyBaseline(facts());
  assert.equal(c.state, 'baseline_partial');
  assert.equal(c.counts.baseline_personas, 9); assert.equal(c.counts.baseline_orgs, 6);
  const plan = recoveryPlan(c, { ref: REF });
  assert.deepEqual(plan.operations.map((s) => s.id), ['reset-baseline', 'check-baseline', 'provision-workspaces'], 'reset já semeia; seed separado falharia ("já semeada")');
  assert.deepEqual(plan.operations[0].affects, { personas: 9, organizations: 6 });
  assert.equal(plan.operations.at(-1).count, 2);
  assert(plan.requires_authorization); assert.match(plan.plan_sha256, /^[0-9a-f]{64}$/);
  assert(!JSON.stringify(plan).includes('@'), 'plano não carrega e-mails');
});
await ok('baseline completa: só checagem e provisionamento do que falta', () => {
  const done = facts({ baselineRfqTitles: TITLES, baselineContracts: 3, workspaces: [{ slug: 'aaaaaaaaaa', status: 'ready' }],
    users: [...users(), { id: 'w1', email: 'helena.duarte+ws-aaaaaaaaaa@vittafoods.example' }], orgs: [...baselineOrgs(), { id: 'wo', kind: 'BUYER', legal_name: 'Vitta Foods S.A.', created_by: 'w1' }] });
  const c = classifyBaseline(done);
  assert.equal(c.state, 'baseline_complete', JSON.stringify(c));
  const plan = recoveryPlan(c);
  assert.deepEqual(plan.operations.map((s) => [s.id, s.count]), [['check-baseline', undefined], ['provision-workspaces', 1]]);
  const two = classifyBaseline({ ...done, workspaces: [{ slug: 'aaaaaaaaaa', status: 'ready' }, { slug: 'bbbbbbbbbb', status: 'ready' }] });
  assert.deepEqual(recoveryPlan(two).operations.map((s) => s.id), ['check-baseline']);
  assert.equal(recoveryPlan(two).requires_authorization, false);
});
await ok('workspace parcial/preso vira limpeza escopada por slug antes do resto', () => {
  const c = classifyBaseline(facts({ workspaces: [{ slug: 'cccccccccc', status: 'provisioning' }],
    users: [...users(), { id: 'w9', email: 'bruno.sato+ws-dddddddddd@orbecapital.example' }] }));
  assert.equal(c.state, 'baseline_partial');
  assert.deepEqual(c.workspace_debris, ['cccccccccc', 'dddddddddd']);
  assert.deepEqual(recoveryPlan(c).operations.slice(0, 2).map((s) => s.slug), ['cccccccccc', 'dddddddddd']);
});
await ok('workspace em uso (claimed) não vira entulho', () => {
  const c = classifyBaseline(facts({ workspaces: [{ slug: 'eeeeeeeeee', status: 'claimed' }], users: [...users(), { id: 'we', email: 'carlos.tavares+ws-eeeeeeeeee@vittafoods.example' }] }));
  assert.deepEqual(c.workspace_debris, []);
});
await ok('dados estranhos, marcador alheio e ambiguidade param sem plano', () => {
  for (const [over, state, reason] of [
    [{ marker: 'production' }, 'foreign', 'MARKER_MISMATCH'],
    [{ users: [...users(), { id: 'x', email: 'cfo@cliente-real.com.br' }] }, 'foreign', 'FOREIGN_ACCOUNTS'],
    [{ orgs: [...baselineOrgs(), { id: 'z', kind: 'BUYER', legal_name: 'Real', created_by: null }] }, 'foreign', 'FOREIGN_ORGANIZATIONS'],
    [{ users: [...users(), { id: 'y', email: 'intruso@vittafoods.example' }] }, 'inconsistent', 'UNKNOWN_DEMO_IDENTITY'],
    [{ orgs: [...baselineOrgs(), { ...baselineOrgs()[1], id: 'dup' }] }, 'inconsistent', 'DUPLICATE_BASELINE_ORGANIZATION'],
    [{ baselineRfqTitles: ['A', 'A'] }, 'inconsistent', 'DUPLICATE_BASELINE_RFQ'],
    [{ marker: null }, 'inconsistent', 'BASELINE_WITHOUT_MARKER'],
    [{ users: [{ id: 'w', email: 'helena.duarte+ws-aaaaaaaaaa@vittafoods.example' }], orgs: [] }, 'inconsistent', 'WORKSPACES_WITHOUT_BASELINE'],
    [{ schemaState: 'incremental' }, 'schema_blocked', 'SCHEMA_INCREMENTAL'],
    [{ readErrors: ['auth-users:HTTP_401'] }, 'indeterminate', 'READ_FAILED:auth-users:HTTP_401']
  ]) {
    const c = classifyBaseline(facts(over));
    assert.equal(c.state, state, JSON.stringify(over)); assert(c.reasons.includes(reason), `${state}: ${c.reasons}`);
    const plan = recoveryPlan(c);
    assert.equal(plan.manual, true); assert.deepEqual(plan.operations, []); assert.equal(plan.requires_authorization, false);
  }
});
await ok('plan_sha256 muda quando o estado muda (aprovação não é reaproveitável)', () => {
  const a = recoveryPlan(classifyBaseline(facts()), { ref: REF }).plan_sha256;
  assert.equal(a, recoveryPlan(classifyBaseline(facts()), { ref: REF }).plan_sha256, 'determinístico');
  assert.notEqual(a, recoveryPlan(classifyBaseline(facts({ baselineContracts: 1 })), { ref: REF }).plan_sha256);
  assert.notEqual(a, recoveryPlan(classifyBaseline(facts({ orgs: baselineOrgs().slice(0, 5) })), { ref: REF }).plan_sha256);
  assert.notEqual(a, recoveryPlan(classifyBaseline(facts()), { ref: 'local' }).plan_sha256);
});
const jwt = (payload) => `x.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.y`;
const env = (ref = REF) => ({ ARANDU_ENV: 'demo', ARANDU_DEMO_CONFIRM: ref, SUPABASE_URL: `https://${ref}.supabase.co`, ARANDU_DEMO_APP_URL: 'https://arandu-demo.vercel.app',
  SUPABASE_ANON_KEY: jwt({ role: 'anon', ref }), SUPABASE_SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref }), ARANDU_DEMO_PASSWORD: 'Demo-Senha-2026', CRON_SECRET: 'c'.repeat(40) });
await ok('coleta: só GET, paginação do Auth, sem escrever e sem e-mail no relatório', async () => {
  const methods = [];
  const fetchImpl = async (url, options = {}) => {
    methods.push(options.method || 'GET');
    const u = new URL(url);
    const reply = (body) => new Response(JSON.stringify(body), { status: 200 });
    if (u.pathname === '/rest/v1/fin_settings') return reply([{ value: 'demo' }]);
    if (u.pathname === '/auth/v1/admin/users') return reply({ users: u.searchParams.get('page') === '1' ? users() : [] });
    if (u.pathname === '/rest/v1/fin_organizations') return reply(baselineOrgs());
    if (u.pathname === '/rest/v1/fin_demo_workspaces') return reply([]);
    if (u.pathname === '/rest/v1/fin_rfqs') { assert.equal(u.searchParams.get('organization_id'), 'eq.o0'); return reply([{ title: 'A' }, { title: 'outro' }]); }
    if (u.pathname === '/rest/v1/fin_contracts') return reply([{ id: 1 }]);
    return new Response('{}', { status: 404 });
  };
  const f = await collectBaselineFacts({ env: env(), fetchImpl, expectedRfqTitles: TITLES, schemaState: 'compatible' });
  assert(methods.every((m) => m === 'GET'));
  assert.deepEqual(f.baselineRfqTitles, ['A']); assert.equal(f.baselineContracts, 1);
  assert.equal(classifyBaseline(f).state, 'baseline_partial');
  assert(!JSON.stringify(f.requests).includes('@'));
});
await ok('coleta: falha de leitura vira indeterminate, nunca empty', async () => {
  const f = await collectBaselineFacts({ env: env(), fetchImpl: async () => new Response('{}', { status: 401 }), expectedRfqTitles: TITLES, schemaState: 'compatible' });
  assert.equal(classifyBaseline(f).state, 'indeterminate');
});
await ok('coleta recusa o projeto legado antes da rede', async () => {
  let called = false;
  await assert.rejects(collectBaselineFacts({ env: env('igacnfjeuqhxcmfyepgj'), fetchImpl: async () => { called = true; } }));
  assert.equal(called, false);
});
console.log(`${n} testes da classificação da baseline da Demo OK (fatos e rede simulados).`);

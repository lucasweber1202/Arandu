import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { classifyChanges, isPureModule, isPureTest, REQUIRED } from './risk-policy.mjs';
import { buildImportGraph, allFinanceSuites, selectSuites, suitesForPath, VIEW_SPECS } from './surfaces.mjs';

const disk = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null);
const plan = (changes, overrides = {}) => classifyChanges(changes, { readSource: (p) => (p in overrides ? overrides[p] : disk(p)) });
const m = (filename) => ({ filename, status: 'modified' });
const classify = (filename, status = 'modified', previous_filename, overrides) => plan([{ filename, status, previous_filename }], overrides).risk;
const graph = buildImportGraph('.');
const all = allFinanceSuites('.');
const suitesOf = (p) => selectSuites(p, { graph, all });
const scenarios = [];
const record = (name, p) => { scenarios.push({ name, risk: p.risk, path: p.path, suites: suitesOf(p).length }); return p; };

// 1. PR #314 real (main e93f7f3^1..e93f7f3): agora B → fast, sem banco nem integração.
const pr314 = record('PR #314 (negociação + sinais)', plan([
  'docs/FINANCIAL_NEGOTIATION_BOARD.md', 'finance/src/views/rfq.js', 'finance/src/views/rfqs.js',
  'lib/finance/central-signals.mjs', 'lib/finance/negotiation-board.mjs', 'scripts/test-finance-central-signals.mjs',
  'scripts/test-finance-negotiation-board.mjs', 'tests/e2e/finance-central.spec.js', 'tests/e2e/finance-negotiation-board.spec.js',
].map(m).concat([{ filename: 'lib/finance/negotiation-next-step.mjs', status: 'added' }])));
assert.equal(pr314.risk, 'B', JSON.stringify(pr314.reasons.filter((r) => r.risk !== 'A' && r.risk !== 'B')));
assert.equal(pr314.path, 'fast');
for (const deep of ['database', 'recovery', 'demo-integration', 'validate']) assert.ok(!pr314.required.includes(deep), deep);
const pr314Suites = suitesOf(pr314);
for (const s of ['procurement', 'external-proposals', 'negotiation-board', 'central', 'crm']) assert.ok(pr314Suites.includes(`tests/e2e/finance-${s}.spec.js`), `#314 deve acionar ${s}`);
assert.ok(pr314Suites.length < all.length, '#314 não deve ampliar para todas as suítes');

// 2. Cenários de aceitação por classe.
const expect = (name, changes, risk, overrides) => { const p = record(name, plan(changes, overrides)); assert.equal(p.risk, risk, `${name}: ${JSON.stringify(p.reasons)}`); return p; };
expect('CSS simples', [m('finance/style.css')], 'A');
expect('Documento de produto', [m('docs/FINANCIAL_CENTRAL_360_SIGNALS.md')], 'A');
expect('View financeira', [m('finance/src/views/fees.js')], 'B');
expect('Módulo puro', [m('lib/finance/negotiation-next-step.mjs')], 'B');
expect('Presenter puro', [m('lib/finance/fee-presenter.mjs')], 'B');
expect('Teste de módulo puro', [m('scripts/test-finance-negotiation-board.mjs')], 'B');
expect('API', [m('api/health.js')], 'C');
expect('Domínio de API', [m('lib/api/domains/finance-crm.mjs')], 'C');
expect('Persistência (módulo de domínio não listado)', [m('lib/finance/crm.mjs')], 'C');
expect('Auth', [m('lib/api/domains/auth.mjs')], 'D');
expect('Sessão', [m('lib/session-cookie.mjs')], 'D');
expect('Permissões', [m('lib/finance/permissions.mjs')], 'D');
expect('RLS (teste de banco)', [m('tests/database/rls-cross-tenant.sql')], 'D');
expect('Migration', [{ filename: 'docs/supabase-financial-new.sql', status: 'added' }], 'D');
expect('Rollback', [m('docs/rollback/supabase-financial-crm.rollback.sql')], 'D');
expect('Recovery', [m('scripts/test-recovery-real.mjs')], 'D');
expect('Workflow de CI', [m('.github/workflows/ci.yml')], 'D');
expect('Política de CI', [m('scripts/ci/risk-policy.mjs')], 'D');
expect('Documento normativo de CI', [m('docs/RISK_BASED_CI.md')], 'D');
expect('Guideline mestra', [m('docs/ARANDU_PRODUCT_ENGINEERING_GUIDELINES.md')], 'D');
expect('Runbook de Production', [m('docs/MIGRATION_RELEASE_RUNBOOK.md')], 'D');
expect('Modelo de segurança', [m('docs/FINANCIAL_SECURITY_MODEL.md')], 'D');
expect('Instruções de agentes', [m('CLAUDE.md')], 'D');
expect('Dependências', [m('package-lock.json')], 'D');
expect('Arquivo desconhecido', [m('unknown')], 'D');
expect('Doc desconhecido', [m('docs/NEW_THING.md')], 'D');
expect('Script de teste com efeitos', [m('scripts/test-finance-api.mjs')], 'D');
expect('Renomeação de view', [{ filename: 'finance/src/views/rfqs2.js', previous_filename: 'finance/src/views/rfqs.js', status: 'renamed' }], 'B');
expect('Renomeação a partir de Auth', [{ filename: 'finance/src/core.js', previous_filename: 'lib/auth.mjs', status: 'renamed' }], 'D');
expect('Remoção de Auth', [{ filename: 'lib/auth.mjs', status: 'removed' }], 'D');
expect('Remoção de módulo puro', [{ filename: 'lib/finance/negotiation-next-step.mjs', status: 'removed' }], 'B');
expect('Compartilhado de UI', [m('finance/src/views/shared.js')], 'B');
expect('Compartilhado puro', [m('lib/finance/format.mjs')], 'B');
expect('Mista B + C', [m('finance/src/views/crm-workspace.js'), m('lib/api/domains/finance-crm.mjs')], 'C');
expect('Mista B + D', [m('finance/src/views/crm-workspace.js'), m('docs/supabase-financial-crm.sql')], 'D');

// 3. Pureza verificada no conteúdo do candidato: módulo listado que passa a
// tocar rede/ambiente/persistência escapa para D, nunca fica em B.
const base = disk('lib/finance/negotiation-next-step.mjs');
for (const injection of [
  "\nexport const x = await fetch('/api');", '\nconst k = process.env.KEY;', "\nimport { createClient } from '@supabase/supabase-js';",
  "\nimport x from '../runtime-mode.mjs';", "\nimport x from 'node:fs';", "\nexport const w = (db) => db.from('rfqs').insert({});",
  '\nexport const l = () => localStorage.getItem("x");', "\nexport const d = () => import('./x.mjs');", "\nimport x from './session.mjs';",
]) {
  assert.equal(classify('lib/finance/negotiation-next-step.mjs', 'modified', undefined, { 'lib/finance/negotiation-next-step.mjs': base + injection }), 'D', injection);
}
assert.equal(classify('lib/finance/negotiation-next-step.mjs', 'modified', undefined, { 'lib/finance/negotiation-next-step.mjs': null }), 'D', 'conteúdo ilegível');
const testBase = disk('scripts/test-finance-negotiation-board.mjs');
for (const injection of ["\nimport { spawnSync } from 'node:child_process';", "\nimport { writeFileSync } from 'node:fs';", '\nconst u = process.env.URL;', "\nimport x from '../lib/auth.mjs';", "\nimport x from './ci/risk-policy.mjs';"]) {
  assert.equal(classify('scripts/test-finance-negotiation-board.mjs', 'modified', undefined, { 'scripts/test-finance-negotiation-board.mjs': testBase + injection }), 'D', injection);
}
assert.ok(!isPureTest("import assert from 'node:assert/strict';\nassert.ok(true);"), 'teste sem módulo testado não é puro');
// Toda a allowlist atual é de fato pura.
for (const p of ['negotiation-next-step', 'negotiation-board', 'central-signals', 'format', 'presentation', 'command-center', 'navigation']) assert.ok(isPureModule(disk(`lib/finance/${p}.mjs`)), p);

// 4. Seleção de suítes pelo grafo real.
const sel = (...files) => suitesOf(plan(files.map(m)));
const has = (list, ...names) => names.every((n) => list.includes(`tests/e2e/finance-${n}.spec.js`));
assert.ok(has(sel('lib/finance/negotiation-next-step.mjs'), 'procurement', 'external-proposals', 'negotiation-board', 'central'), 'negociação + sinais');
assert.ok(has(sel('finance/src/views/crm-workspace.js'), 'crm', 'relationship-center', 'central'), 'CRM');
assert.ok(has(sel('finance/src/views/provider.js'), 'provider-draft', 'external-proposals', 'procurement'), 'Portal');
assert.ok(has(sel('finance/src/views/fees.js'), 'fees', 'ingestion', 'contracts'), 'Tarifas');
assert.deepEqual(sel('finance/src/views/shared.js'), all, 'compartilhado de UI amplia para todas');
assert.deepEqual(sel('finance/src/core.js'), all, 'core amplia para todas');
assert.deepEqual(sel('lib/finance/format.mjs').length > sel('finance/src/views/fees.js').length, true, 'format compartilhado amplia');
assert.deepEqual(sel('tests/e2e/finance-crm.spec.js'), ['tests/e2e/finance-crm.spec.js']);
assert.deepEqual(sel('tests/e2e/layout-evidence.js'), all, 'helper E2E amplia');
assert.deepEqual(suitesOf(plan([{ filename: 'lib/finance/format.mjs', status: 'removed' }])), all, 'remoção amplia');
assert.deepEqual(suitesOf(plan([m('api/health.js')])), all, 'C roda todas as suítes Chromium');
assert.equal(suitesForPath('lib/finance/not-imported.mjs', graph), null);
for (const view of Object.keys(VIEW_SPECS)) assert.ok(existsSync(`finance/src/views/${view}`), `view mapeada inexistente: ${view}`);
for (const s of Object.values(VIEW_SPECS).flat()) assert.ok(all.includes(`tests/e2e/finance-${s}.spec.js`), `suíte inexistente: ${s}`);

// 5. Entradas inválidas.
assert.throws(() => classifyChanges([]));
assert.throws(() => classifyChanges([{ filename: 'x', status: 'unknown' }]));
assert.throws(() => classifyChanges([{ filename: '../x', status: 'modified' }]));
assert.throws(() => classifyChanges([{ filename: '/etc/x', status: 'modified' }]));
assert.deepEqual(REQUIRED.D.includes('demo-integration') && !REQUIRED.C.includes('demo-integration') && REQUIRED.C.includes('database'), true, 'C e D distintos');

// 6. Verificador dos contextos obrigatórios.
const sha = 'a'.repeat(40);
const ok = {
  A: { RISK: 'A', DEEP: 'false', FAST_RESULT: 'success', BACKEND_RESULT: 'skipped', FULL_RESULT: 'skipped', DEMO_RESULT: 'skipped' },
  B: { RISK: 'B', DEEP: 'false', FAST_RESULT: 'success', BACKEND_RESULT: 'skipped', FULL_RESULT: 'skipped', DEMO_RESULT: 'skipped' },
  C: { RISK: 'C', DEEP: 'false', FAST_RESULT: 'success', BACKEND_RESULT: 'success', FULL_RESULT: 'skipped', DEMO_RESULT: 'skipped' },
  D: { RISK: 'D', DEEP: 'true', FAST_RESULT: 'skipped', BACKEND_RESULT: 'skipped', FULL_RESULT: 'success', DEMO_RESULT: 'success' },
};
const run = (env) => spawnSync(process.execPath, ['scripts/ci/check-result.mjs'], { env: { PATH: process.env.PATH, CLASSIFY_RESULT: 'success', ANALYZED_SHA: sha, GITHUB_SHA: sha, ...env }, encoding: 'utf8' }).status;
for (const [risk, env] of Object.entries(ok)) {
  assert.equal(run(env), 0, risk);
  for (const key of ['FAST_RESULT', 'BACKEND_RESULT', 'FULL_RESULT', 'DEMO_RESULT', 'CLASSIFY_RESULT']) {
    for (const state of ['cancelled', 'failure', '', env[key] === 'success' ? 'skipped' : 'success']) {
      if (key === 'CLASSIFY_RESULT' && state === 'success') continue;
      assert.notEqual(run({ ...env, [key]: state }), 0, `${risk} ${key}=${state}`);
    }
  }
  assert.notEqual(run({ ...env, ANALYZED_SHA: 'b'.repeat(40) }), 0);
  assert.notEqual(run({ ...env, DEEP: env.DEEP === 'true' ? 'false' : 'true' }), 0);
}
assert.notEqual(run({ ...ok.B, RISK: '' }), 0);
assert.notEqual(run({ ...ok.C, RISK: 'B' }), 0, 'C rotulado como B não pode pular o backend exigido... nem aceitar backend extra');
assert.notEqual(run({ ...ok.B, RISK: 'C' }), 0, 'C sem backend falha');

if (process.argv.includes('--table')) console.table(scenarios);
console.log(`Risk policy v6.2: ${scenarios.length} scenarios (PR #314 → B/fast, ${pr314Suites.length}/${all.length} Chromium suites), purity, surfaces, renames, removals and gate states PASS`);

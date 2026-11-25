// Plano do controlador do pool da Demo (lib/finance/demo-workspaces.mjs).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planPool, POOL_POLICY } from '../lib/finance/demo-workspaces.mjs';
const now = Date.parse('2026-10-11T12:00:00Z');
const iso = (minutes) => new Date(now + minutes * 60_000).toISOString();
const row = (slug, status, extra = {}) => ({ slug, status, created_at: iso(-30), ...extra });

let plan = planPool([], { now });
assert.equal(plan.provision, POOL_POLICY.targetReady, 'pool vazio repõe até o alvo');
plan = planPool([row('a', 'ready'), row('b', 'provisioning')], { now });
assert.equal(plan.provision, 1, 'montagem em andamento conta para o alvo (sem duplicar)');
plan = planPool([row('a', 'ready'), row('b', 'ready'), row('c', 'ready')], { now });
assert.deepEqual([plan.provision, plan.reason], [0, 'pool no alvo']);
// Reivindicado vencido, falho, limpeza interrompida e montagem parada vão para limpeza.
plan = planPool([row('x', 'claimed', { expires_at: iso(-1), idle_expires_at: iso(-1) }), row('y', 'failed', { created_at: iso(-120) }), row('z', 'cleaning'),
  row('w', 'provisioning', { created_at: iso(-7 * 60) }), row('v', 'claimed', { expires_at: iso(60), idle_expires_at: iso(30) })], { now });
assert.deepEqual(plan.cleanup.sort(), ['w', 'x', 'y', 'z']);
assert.equal(plan.counts.claimed, 1, 'reivindicado válido nunca é limpo');
// Teto absoluto e limite por execução.
const many = Array.from({ length: POOL_POLICY.maxTotal }, (_, i) => row(`c${i}`, 'claimed', { expires_at: iso(60), idle_expires_at: iso(60) }));
assert.deepEqual([planPool(many, { now }).provision, planPool(many, { now }).reason], [0, 'teto de workspaces vivos']);
assert.equal(planPool([], { now, policy: { ...POOL_POLICY, targetReady: 20 } }).provision, POOL_POLICY.maxPerRun);
// Falhas recentes suspendem a reposição, mas não a limpeza.
plan = planPool([row('f1', 'failed'), row('f2', 'failed'), row('f3', 'failed')], { now });
assert.equal(plan.provision, 0); assert.match(plan.reason, /backoff/); assert.equal(plan.cleanup.length, 3);
// OPS-POOL-02: órfão só por heartbeat parado; seed longo e vivo nunca é limpo.
plan = planPool([row('live', 'provisioning', { created_at: iso(-25), heartbeat_at: iso(-1) }),
  row('dead', 'provisioning', { created_at: iso(-25), heartbeat_at: iso(-POOL_POLICY.heartbeatStaleMinutes - 1) }),
  row('old-live', 'provisioning', { created_at: iso(-8 * 60), heartbeat_at: iso(-2) })], { now });
assert.deepEqual(plan.cleanup, ['dead']); assert.deepEqual(plan.orphaned, ['dead']);
assert.equal(plan.counts.provisioning, 2, 'montagem viva conta para o alvo');
// Backoff pela hora da falha persistida, não pela criação do workspace.
plan = planPool([1, 2, 3].map((i) => row(`o${i}`, 'failed', { created_at: iso(-300), failed_at: iso(-5) })), { now });
assert.match(plan.reason, /backoff/);
plan = planPool([1, 2, 3].map((i) => row(`n${i}`, 'failed', { created_at: iso(-5), failed_at: iso(-120) })), { now });
assert.equal(plan.provision, POOL_POLICY.targetReady, 'falha antiga não suspende reposição');
assert.equal(planPool([row('r', 'ready')], { now }).counts.deficit, POOL_POLICY.targetReady - 1);
assert(POOL_POLICY.leaseRenewSeconds * 3 <= POOL_POLICY.leaseSeconds && POOL_POLICY.seedTimeoutMinutes * 60 < POOL_POLICY.leaseSeconds, 'lease cobre um seed inteiro com folga de renovação');
// OPS-POOL-04: agenda só com opt-in explícito; CI verde no SHA exato e dry-run antes de escrever.
const yml = readFileSync('.github/workflows/demo-pool.yml', 'utf8');
assert(/vars\.ARANDU_DEMO_POOL_AUTOMATION_ENABLED == 'true'/.test(yml) && /github\.event_name == 'workflow_dispatch' \|\|/.test(yml), 'agenda desligada sem opt-in');
for (const ctx of ['database', 'deploy-boundaries', 'validate', 'presentation']) assert(yml.includes(`"${ctx}"`), `contexto ${ctx} exigido`);
assert(yml.indexOf('Required CI contexts') < yml.indexOf('Dry-run plan') && yml.indexOf('Dry-run plan') < yml.indexOf('Run pool controller'), 'ordem: CI, dry-run, controlador');
assert(/cancel-in-progress: false/.test(yml) && /group: arandu-demo-pool/.test(yml));
assert(Number(/timeout-minutes: (\d+)/.exec(yml)[1]) * 60 > 2 * POOL_POLICY.seedTimeoutMinutes * 60, 'timeout cobre duas levas');
assert(!/CRON_SECRET/.test(readFileSync('scripts/demo/seed.mjs', 'utf8').slice(readFileSync('scripts/demo/seed.mjs', 'utf8').indexOf('async function runScopedJobs'), readFileSync('scripts/demo/seed.mjs', 'utf8').indexOf('async function finishStory'))), 'workspace não usa o cron global');
// Regressão (auditoria pós-#368): todo step de workflow que executa script
// guardado por assertDemoTarget precisa receber (no job ou no step) TODAS as
// variáveis que a trava lê; senão falha antes de qualquer leitura.
{
  const guard = readFileSync('lib/finance/demo-guard.mjs', 'utf8');
  const body = guard.slice(guard.indexOf('export function assertDemoTarget'), guard.indexOf('export function assertDemoDatabase'));
  const required = [...new Set([...body.matchAll(/read\(env, '([A-Z_]+)'\)/g)].map((m) => m[1]))].filter((n) => n !== 'VERCEL_ENV');
  assert(required.includes('ARANDU_DEMO_PASSWORD') && required.includes('SUPABASE_URL'), 'variáveis exigidas extraídas da trava');
  const guarded = /scripts\/demo\/(workspaces|seed|readiness|baseline-state|hosted-preflight)\.mjs/;
  const envBlock = (lines, i, indent) => { const names = []; for (let j = i + 1; j < lines.length; j++) {
    if (!lines[j].trim() || lines[j].trim().startsWith('#')) continue;
    const m = /^(\s*)([A-Z_][A-Z0-9_]*):/.exec(lines[j]);
    if (!m || m[1].length <= indent) break; names.push(m[2]); } return names; };
  const checked = [];
  for (const file of ['demo-pool.yml', 'demo-hosted-seed.yml', 'demo-release.yml']) {
    const lines = readFileSync(`.github/workflows/${file}`, 'utf8').split('\n');
    let jobEnv = [], stepEnv = [];
    lines.forEach((line, i) => {
      const indent = line.length - line.trimStart().length;
      if (/^  [a-z][\w-]*:\s*$/.test(line)) jobEnv = [];
      if (/^\s*- /.test(line)) stepEnv = [];
      if (/^\s*env:\s*$/.test(line)) { if (indent === 4) jobEnv = envBlock(lines, i, indent); else stepEnv = envBlock(lines, i, indent); }
      if (guarded.test(line) && !line.trim().startsWith('#')) {
        const missing = required.filter((n) => !jobEnv.includes(n) && !stepEnv.includes(n));
        assert.deepEqual(missing, [], `${file}:${i + 1} executa script guardado sem ${missing.join(', ')}`);
        checked.push(`${file}:${i + 1}`);
      }
    });
  }
  assert(checked.some((c) => c.startsWith('demo-pool.yml')) && checked.length >= 4, `steps guardados verificados: ${checked}`);
}
console.log('Demo pool: alvo, montagem em andamento, limpeza só de vencidos/falhos/parados, teto, limite por execução e backoff aprovados.');

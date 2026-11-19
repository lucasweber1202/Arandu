#!/usr/bin/env node
// Estado da baseline da Demo e recuperação controlada (lib/demo/baseline-state.mjs).
//
//   node scripts/demo/baseline-state.mjs inspect      [--out=reports/demo-baseline.json]   # só GET
//   node scripts/demo/baseline-state.mjs verify-plan  --plan-sha256=<64hex>                # só GET
//   node scripts/demo/baseline-state.mjs execute      --plan-sha256=<64hex> --authorization=<ref>
//   node scripts/demo/baseline-state.mjs verify-after [--out=…]                            # só GET
//
// Saída: 0 = ok/nada a fazer · 2 = NO-GO (manual, foreign, inconsistente, schema)
//        3 = plano divergente do aprovado · 1 = erro interno. Nunca imprime segredos ou e-mails.
// `execute` relê o estado, exige o MESMO plan_sha256 aprovado e uma referência de
// autorização, executa só as operações fechadas do plano (scripts já escopados) e
// para na primeira falha. Repetir é seguro: a nova inspeção gera o plano restante.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectBaselineFacts, classifyBaseline, recoveryPlan, OPERATIONS } from '../../lib/demo/baseline-state.mjs';
import { runHostedPreflight } from '../../lib/demo/hosted-preflight.mjs';
import { RFQ_OPEN, RFQ_CREDIT, RFQ_ACQUIRING } from './dataset.mjs';

const [mode = 'inspect', ...rest] = process.argv.slice(2);
const arg = (name) => rest.find((item) => item.startsWith(`--${name}=`))?.split('=').slice(1).join('=') || null;
const out = arg('out') || `reports/demo-baseline-${mode}.json`;
const MODES = ['inspect', 'verify-plan', 'execute', 'verify-after'];
if (!MODES.includes(mode)) { console.error(`modo desconhecido; use ${MODES.join(' | ')}`); process.exit(1); }
const expected = arg('plan-sha256');
if (['verify-plan', 'execute'].includes(mode) && !/^[0-9a-f]{64}$/.test(expected || '')) { console.error('--plan-sha256 precisa ser o hash de 64 caracteres do plano revisado.'); process.exit(1); }
const authorization = arg('authorization');
if (mode === 'execute' && !/^[A-Za-z0-9#/:._-]{6,200}$/.test(authorization || '')) { console.error('execute exige --authorization=<referência verificável>, sem segredos.'); process.exit(1); }

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const COMMANDS = {
  'workspace-cleanup': (step) => ({ argv: ['scripts/demo/seed.mjs', '--cleanup'], env: { ARANDU_DEMO_WORKSPACE: step.slug } }),
  'seed-reset': () => ({ argv: ['scripts/demo/seed.mjs', '--reset'] }),
  seed: () => ({ argv: ['scripts/demo/seed.mjs'] }),
  'seed-check': () => ({ argv: ['scripts/demo/seed.mjs', '--check'] }),
  'workspaces-provision': (step) => ({ argv: ['scripts/demo/workspaces.mjs', 'provision', `--count=${Number(step.count)}`, '--concurrency=1'] })
};

async function inspect() {
  const preflight = await runHostedPreflight({ env: process.env, phase: 'recovery' });
  // A app só é indispensável para escrever (o seed usa a API real); ler o banco não depende dela.
  const blocking = preflight.checks.filter((check) => !check.ok && (mode === 'execute' || check.id !== 'app'));
  const facts = await collectBaselineFacts({ env: process.env, expectedRfqTitles: [RFQ_OPEN.title, RFQ_CREDIT.title, RFQ_ACQUIRING.title], schemaState: preflight.schema?.state || 'indeterminate' });
  if (blocking.length) facts.readErrors.push(...blocking.map((check) => `preflight-${check.id}:${check.code}`));
  const classification = classifyBaseline(facts);
  const plan = recoveryPlan(classification, { ref: facts.ref, schemaVersion: preflight.schema?.schema_version ?? null });
  return { preflight, facts, classification, plan };
}

function write(document) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`);
}

function report({ preflight, facts, classification, plan }) {
  console.log(`Alvo: ${facts.ref} · schema ${preflight.schema?.state || 'indeterminado'} (${preflight.schema?.schema_version || 'sem versão'}) · app ${preflight.layers.canonical_runtime}`);
  console.log(`Estado da baseline: ${classification.state} — ${classification.description}`);
  if (classification.reasons.length) console.log(`Motivos: ${classification.reasons.join(', ')}`);
  if (classification.counts) console.log(`Contagens: ${Object.entries(classification.counts).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(plan.operations.length ? 'Plano (em ordem):' : 'Plano: nenhuma operação automática.');
  for (const [index, step] of plan.operations.entries()) console.log(`  ${index + 1}. ${step.write ? 'ESCRITA' : 'leitura'} ${step.id}${step.slug ? ` ${step.slug}` : ''}${step.count ? ` count=${step.count}` : ''} — ${step.scope}`);
  console.log(`Próximo passo: ${plan.next}`);
  console.log(`Requisições: ${facts.requests.length + preflight.requests.length}, todas GET/HEAD.`);
  console.log(`DEMO_BASELINE_STATE=${classification.state}`);
  console.log(`DEMO_BASELINE_PLAN_SHA256=${plan.plan_sha256}`);
}

const documentOf = (result, extra = {}) => ({
  generated_at: new Date().toISOString(), mode, target_ref: result.facts.ref,
  schema: result.preflight.schema && { state: result.preflight.schema.state, schema_version: result.preflight.schema.schema_version, pending: result.preflight.schema.pending },
  layers: result.preflight.layers, classification: result.classification,
  plan: { ...result.plan, operations: result.plan.operations.map(({ id, write, scope, slug, count, affects }) => ({ id, write, scope, slug, count, affects })) },
  read_requests: result.facts.requests.length + result.preflight.requests.length,
  notice: mode === 'execute' ? 'Execução autorizada de um plano fechado.' : 'Somente leitura: nenhuma escrita foi feita.', ...extra
});

try {
  const result = await inspect();
  report(result);
  if (mode === 'inspect') { write(documentOf(result)); process.exit(result.plan.manual ? 2 : 0); }
  if (mode === 'verify-after') {
    const done = result.classification.state === 'baseline_complete' && result.classification.counts.workspaces_ready >= 2 && !result.classification.workspace_debris.length;
    write(documentOf(result, { verdict: done ? 'BASELINE_AND_WORKSPACES_READY' : 'NOT_READY' }));
    console.log(`DEMO_BASELINE_VERIFY=${done ? 'READY' : 'NOT_READY'}`);
    process.exit(done ? 0 : 2);
  }
  if (result.plan.manual) { write(documentOf(result, { verdict: 'NO-GO' })); process.exit(2); }
  if (result.plan.plan_sha256 !== expected) {
    write(documentOf(result, { verdict: 'PLAN_MISMATCH', approved_plan_sha256: expected }));
    console.error('O estado mudou desde a revisão: o plano atual não é o aprovado. Nada foi escrito. Inspecione e aprove o novo plano.');
    process.exit(3);
  }
  if (mode === 'verify-plan') { write(documentOf(result, { verdict: 'PLAN_MATCHES' })); console.log('Plano confere com o aprovado. Nenhuma escrita foi feita.'); process.exit(0); }

  // execute
  const executed = [];
  for (const step of result.plan.operations) {
    const spec = OPERATIONS[step.id];
    const build = COMMANDS[spec?.command];
    if (!build) throw new Error(`operação fora da lista fechada: ${step.id}`);
    const { argv, env = {} } = build(step);
    console.log(`\n▶ ${step.id}${step.slug ? ` ${step.slug}` : ''} (${spec.write ? 'escrita' : 'leitura'})`);
    const started = Date.now();
    const run = spawnSync(process.execPath, argv, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });
    executed.push({ id: step.id, slug: step.slug, status: run.status, seconds: Math.round((Date.now() - started) / 1000) });
    if (run.status !== 0) {
      write(documentOf(result, { verdict: 'EXECUTION_FAILED', authorization_reference: authorization, executed }));
      console.error(`Falhou em ${step.id}. Parado; nenhuma operação seguinte foi tentada. Rode inspect para o plano restante.`);
      process.exit(1);
    }
  }
  write(documentOf(result, { verdict: 'EXECUTED', authorization_reference: authorization, executed }));
  console.log('Plano executado. Rode verify-after (somente leitura) para comprovar.');
} catch (error) {
  console.error(`Interrompido: ${['WRITE_ATTEMPT', 'TARGET_PRODUCTION', 'TARGET_INVALID'].includes(error?.code) ? error.message : error?.name === 'DemoGuardError' ? `guard da Demo: ${(error.reasons || []).join('; ')}` : 'erro interno (detalhes omitidos).'}`);
  process.exit(1);
}

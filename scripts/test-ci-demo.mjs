#!/usr/bin/env node
// Invariantes da integração efêmera da Demo (.github/workflows/demo-integration.yml
// e scripts/ci-demo/), verificáveis sem Docker: só alvo local, nenhum secret,
// nenhuma falha mascarada, limpeza obrigatória e Chromium com poucos workers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { localViolations } from './ci-demo/assert-local.mjs';
import { assessDemoRehearsal, DEMO_REHEARSAL_REQUIRED_OUTCOMES } from '../lib/demo-rehearsal-result.mjs';
import {assessResources,inspectResources} from './ci-demo/resources.mjs';
import { visitorJourneysPassed } from './ci-demo/assert-visitor-e2e.mjs';
import { rehearsalOrganizationId, rehearsalSqlFailure } from '../lib/demo-rehearsal-context.mjs';

// Sem comentários: as restrições valem para o que executa.
const workflow = fs.readFileSync('.github/workflows/demo-integration.yml', 'utf8').split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
const runner = fs.readFileSync('scripts/ci-demo/run.sh', 'utf8');
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok - ${name}`); };

test('resource preflight measures Docker filesystem and rejects vfs pressure before any pull',()=>{
 const base={driver:'overlay2',memoryMb:8000,workspaceGiB:20,dockerGiB:20};
 assert.equal(assessResources(base).ok,true);
 assert.equal(assessResources({...base,driver:'vfs'}).ok,false);
 assert.equal(assessResources({...base,driver:'vfs',dockerGiB:40}).ok,true);
 for(const change of [{dockerGiB:4},{memoryMb:1000},{workspaceGiB:1},{dockerGiB:NaN},{minDisk:NaN},{driver:''}])assert.equal(assessResources({...base,...change}).ok,false);
 assert.equal(assessResources({...base,driver:'vfs',minDisk:1}).requiredDisk,32,'override cannot bypass the safety floor');
 const calls=[];
 const run=(file,args)=>{
  calls.push([file,...args]);
  if(file==='docker')return JSON.stringify({Driver:'overlay2',DockerRootDir:'/different-docker-disk'});
  return `Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/test 99999999 1 ${args.at(-1)==='/different-docker-disk'?2*1048576:20*1048576} 1% /\n`;
 };
 const result=inspectResources({root:'/workspace',env:{DOCKER_HOST:'unix:///var/run/docker.sock'},run});
 assert.equal(result.dockerGiB,2);assert.equal(result.workspaceGiB,20);assert.equal(result.ok,false);
 assert(calls.some(args=>args.includes('/different-docker-disk')));
 assert.throws(()=>inspectResources({env:{DOCKER_HOST:'tcp://remote:2375'},run}),/remoto/);
 assert.match(runner,/node "\$here\/resources.mjs" \| tee "\$out\/pre-pull-resources.txt"/);
});
test('assert-local aceita só localhost', () => {
  assert.deepEqual(localViolations({ SUPABASE_URL: 'https://localhost:8443', ARANDU_DEMO_APP_URL: 'https://127.0.0.1:4443', PILOT_DB_URL: 'postgresql://postgres:x@localhost:54322/postgres' }), []);
  assert.equal(localViolations({ SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }).length, 1);
  assert.equal(localViolations({ ARANDU_DEMO_APP_URL: 'https://arandu.vercel.app' }).length, 1);
  assert.equal(localViolations({ ARANDU_DEMO_REST_URL: 'https://remote.example' }).length, 1);
  assert.equal(localViolations({ PILOT_DB_URL: 'postgresql://postgres:x@db.abcdefghijklmnopqrst.supabase.co:5432/postgres' }).length, 1);
  assert.equal(localViolations({ SUPABASE_URL: 'não é url' }).length, 1);
  assert.equal(localViolations({ VERCEL_ENV: 'production' }).length, 1);
});
test('workflow: disparo manual, runner padrão 24.04, permissões mínimas', () => {
  assert.match(workflow, /^\s+workflow_dispatch:/m);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /^permissions:\n  contents: read$/m);
  assert.doesNotMatch(workflow, /pull_request_target|self-hosted|write-all/);
});
test('evidência identifica o commit realmente executado, separando o HEAD da PR', () => {
  assert.match(workflow, /id: tested_commit\n/);
  assert.match(workflow, /echo "sha=\$\(git rev-parse HEAD\)" >> "\$GITHUB_OUTPUT"/);
  assert.match(workflow, /TESTED_SHA: \$\{\{ steps\.tested_commit\.outputs\.sha \}\}/);
  const summary = fs.readFileSync('scripts/ci-demo/summary.mjs', 'utf8');
  const result = fs.readFileSync('lib/demo-rehearsal-result.mjs', 'utf8');
  assert.match(summary, /assessDemoRehearsal\(process\.env\)/);
  assert.match(result, /env\.TESTED_SHA/);
  assert.doesNotMatch(summary, /process\.env\.HEAD_SHA/);
});
test('workflow: sem secrets, sem environment hospedado, sem deploy', () => {
  assert.doesNotMatch(workflow, /secrets\.|^\s+environment:|vercel|supabase (db|link)|migrations:release/im);
});
test('workflow: nenhuma falha mascarada', () => {
  assert.doesNotMatch(workflow + runner, /continue-on-error|\|\|\s*true\s*$/m);
  // Fases rodam como `run.sh fase | tee`: sem pipefail o tee mascararia a falha.
  assert.match(workflow, /^defaults:\n  run:\n    shell: bash\n/m, 'shell bash explícito (-eo pipefail) obrigatório');
  assert.doesNotMatch(workflow, /^\s+shell: (sh|bash -e \{0\})/m);
  assert.doesNotMatch(runner, /--retries/);
});
test('workflow: timeout no job e em cada fase; concorrência limitada', () => {
  assert.match(workflow, /timeout-minutes: \d+\n    env:/);
  for (const id of ['preflight', 'images', 'up', 'smoke', 'seed', 'check', 'pool', 'e2e_desktop', 'e2e_mobile', 'journey', 'adversarial', 'recovery']) {
    assert.match(workflow, new RegExp(`id: ${id}\\n        timeout-minutes: \\d+`), `fase ${id} sem timeout`);
  }
  assert.match(workflow, /concurrency:\n  group: arandu-demo-integration\n  cancel-in-progress: false/);
});
test('preflight local falha cedo se Node não for 24 ou faltarem as ferramentas de recovery', () => {
  const preflight = runner.slice(runner.indexOf('  preflight)'), runner.indexOf('  images)'));
  assert.match(preflight, /node_version="\$\(node -p 'process\.versions\.node'\)"/);
  assert(preflight.includes('[ "${node_version%%.*}" = 24 ]'), 'Node 24 precisa ser requisito, não só impresso');
  assert.match(preflight, /command -v age/);
  assert.match(preflight, /command -v age-keygen/);
  assert(runner.indexOf('preflight)') < runner.indexOf('images)'), 'tool preflight deve preceder provisionamento');
  const install = workflow.slice(workflow.indexOf('      - name: Preflight'), workflow.indexOf('      - name: Block hosted'));
  assert.match(install, /command -v age-keygen/);
});
test('workflow: limpeza e evidência sempre executam', () => {
  for (const name of ['Collect sanitized evidence', 'Final Demo rehearsal decision', 'Teardown (containers, volumes, keys)', 'Upload sanitized evidence']) {
    const start = workflow.indexOf(`- name: ${name}`);
    assert(start >= 0, `${name} ausente`);
    const end = workflow.indexOf('\n      - name:', start + 1);
    const step = workflow.slice(start, end < 0 ? undefined : end);
    assert.match(step, /\n        if: always\(\)/, `${name} sem if: always()`);
  }
  const at = (name) => workflow.indexOf(`- name: ${name}`);
  assert(at('Teardown (containers, volumes, keys)') < at('Upload sanitized evidence'));
  assert(at('Upload sanitized evidence') < at('Final Demo rehearsal decision'), 'a decisão final precisa incluir teardown e arquivamento');
  assert.match(workflow, /TEARDOWN: \$\{\{ steps\.teardown\.outcome \}\}/);
  assert.match(workflow, /EVIDENCE_UPLOAD: \$\{\{ steps\.evidence_upload\.outcome \}\}/);
});
test('B exige SHA exato, fases críticas, evidência e cleanup; a hospedagem segue não provada', () => {
  for (const [key] of DEMO_REHEARSAL_REQUIRED_OUTCOMES) {
    assert.match(workflow, new RegExp(`^\\s+${key}: \\$\\{\\{ steps\\.[a-z0-9_]+\\.outcome \\}\\}$`, 'm'), `${key} precisa vir do outcome real do workflow`);
  }
  assert.match(workflow, /TESTED_SHA: \$\{\{ steps\.tested_commit\.outputs\.sha \}\}/);
  assert.match(workflow, /HEAD_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  const outcomes = Object.fromEntries(DEMO_REHEARSAL_REQUIRED_OUTCOMES.map(([key]) => [key, 'success']));
  const ready = assessDemoRehearsal({ ...outcomes, TESTED_SHA: 'a'.repeat(40), HEAD_SHA: 'b'.repeat(40) });
  assert.equal(ready.result, 'B_LOCAL_DEMO_VALIDATED');
  assert.equal(ready.maturity, 'CI_VALIDATED_ONLY');
  assert.equal(ready.hostedStatus, 'NOT_PROVEN');
  assert.equal(ready.pending.length, 0);
  for (const [key, outcome] of [['TEARDOWN', 'failure'], ['TEARDOWN', 'skipped'], ['EVIDENCE_UPLOAD', 'failure'], ['RECOVERY', 'skipped'], ['POOL', 'skipped'], ['POOL', 'failure'], ['E2E_MOBILE', 'failure']]) {
    const rejected = assessDemoRehearsal({ ...outcomes, [key]: outcome, TESTED_SHA: 'a'.repeat(40) });
    assert.equal(rejected.result, 'C_NO_GO', `${key}=${outcome} não pode liberar B`);
    assert(rejected.pending.some((item) => item.key === key));
  }
  for (const testedSha of ['', 'b'.repeat(39), 'z'.repeat(40)]) {
    assert.equal(assessDemoRehearsal({ ...outcomes, TESTED_SHA: testedSha }).result, 'C_NO_GO', 'SHA ausente/inválido não pode liberar B');
  }
  assert.equal(assessDemoRehearsal({ ...outcomes, TESTED_SHA: 'a'.repeat(40) }).result, 'C_NO_GO', 'referência do evento ausente não pode liberar B');
  assert.equal(assessDemoRehearsal({ ...outcomes, TESTED_SHA: 'a'.repeat(40), HEAD_SHA: 'x'.repeat(40) }).result, 'C_NO_GO', 'referência do evento inválida não pode liberar B');
});
test('recovery usa seed verificado antes da jornada que cadastra fatores MFA', () => {
  const phase = (id) => {
    const index = workflow.indexOf(`id: ${id}\n`);
    assert(index >= 0, `fase ${id} ausente`);
    return index;
  };
  assert(phase('seed') < phase('check'));
  assert(phase('check') < phase('recovery'), 'recovery exige dataset semeado e verificado');
  assert(phase('check') < phase('pool') && phase('pool') < phase('recovery'), 'restore inclui também o pool real');
  for (const id of ['journey', 'adversarial']) {
    assert(phase('recovery') < phase(id), `recovery deve preceder fase mutante ${id}`);
  }
});
test('Playwright: só Chromium, um worker, sem trace', () => {
  assert.match(workflow, /npx playwright install --with-deps chromium\n/);
  assert.doesNotMatch(workflow, /firefox|webkit/);
  assert.match(runner, /--workers 1 --trace off/);
});
test('visitantes: seed real, flags existentes e prova de execução sem skips', () => {
  assert.match(runner, /workspaces\.mjs" provision --count=4 --concurrency=2/);
  assert.match(runner, /export ARANDU_DEMO_ENTRY_E2E=1 ARANDU_DEMO_WORKSPACE_E2E=1/);
  assert.match(runner, /assert-visitor-e2e\.mjs" "\$PLAYWRIGHT_JSON_OUTPUT_FILE"/);
  const report = () => ({ errors: [], suites: [{ specs: ['demo-entry-journeys.spec.js', 'demo-workspaces.spec.js'].map(file => ({ file, tests: [{ projectName: 'demo-desktop', status: 'expected', results: [{ status: 'passed' }] }] })) }] });
  assert.equal(visitorJourneysPassed(report()), true);
  assert.equal(visitorJourneysPassed({ errors: [], suites: [] }), false);
  assert.equal(visitorJourneysPassed(null), false);
  for (const status of ['skipped', 'failed', 'timedOut', 'interrupted']) {
    const r = report(); r.suites[0].specs[0].tests[0].results[0].status = status;
    assert.equal(visitorJourneysPassed(r), false, status);
  }
  const retry = report(); retry.suites[0].specs[0].tests[0].results.unshift({ status: 'failed' });
  assert.equal(visitorJourneysPassed(retry), false);
  const missing = report(); missing.suites[0].specs.pop(); assert.equal(visitorJourneysPassed(missing), false);
  const mobile = report(); mobile.suites[0].specs[0].tests[0].projectName = 'demo-mobile'; assert.equal(visitorJourneysPassed(mobile), false);
});
test('imagens fixadas por digest', () => {
  const pinned = runner.match(/\|sha256:[a-f0-9]{64}/g) || [];
  assert.equal(pinned.length, 4);
});
test('contexto adversarial usa organização da sessão e recusa nomes ambíguos', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const row = { id, kind: 'BUYER', legal_name: 'Vitta Foods S.A.' };
  const response = { status: 200, data: { ok: true, environment: 'demo', rows: [row] } };
  const expected = { kind: 'BUYER', legalName: row.legal_name };
  assert.equal(rehearsalOrganizationId(response, expected), id);
  for (const rows of [[], [row, { ...row, id: '00000000-0000-4000-8000-000000000002' }], [{ ...row, id: "injected'" }], [{ ...row, kind: 'PROVIDER' }]]) {
    assert.throws(() => rehearsalOrganizationId({ ...response, data: { ...response.data, rows } }, expected));
  }
  assert.throws(() => rehearsalOrganizationId({ ...response, status: 403 }, expected));
  assert.throws(() => rehearsalOrganizationId({ ...response, data: { ...response.data, environment: 'production' } }, expected));
  const script = fs.readFileSync('scripts/ci-demo/adversarial.mjs', 'utf8');
  assert.match(script, /rehearsalOrganizationId\(await api\(juliana/);
  assert.match(script, /rehearsalOrganizationId\(await api\(eduardo/);
  assert.doesNotMatch(script, /select id from public\.fin_organizations where legal_name/);
  assert.equal(rehearsalSqlFailure('ERROR: 22P02 fixture-secret'), 'SQL probe failed (sqlstate 22P02); verify actor-scoped fixture context');
  assert(!rehearsalSqlFailure('password=fixture-secret').includes('fixture-secret'));
});

// Injeção de falhas sem Docker: o harness precisa RECUSAR, nunca dar PASS.
const closed = { SUPABASE_URL: 'https://127.0.0.1:1', ARANDU_DEMO_APP_URL: 'https://127.0.0.1:2', PILOT_DB_URL: 'postgresql://postgres:x@127.0.0.1:3/postgres',
  SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', CI_DEMO_HEALTH_TIMEOUT_MS: '1500', PATH: process.env.PATH };
test('falha injetada: banco, Auth, PostgREST, Storage e API fora do ar → smoke FAIL em todas, nenhum PASS', () => {
  const started = Date.now();
  const r = spawnSync(process.execPath, ['scripts/ci-demo/smoke.mjs'], { env: closed, encoding: 'utf8', timeout: 60_000 });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /^\s+PASS /m);
  assert.match(r.stdout, /0\/\d+ verificações PASS/);
  assert(Date.now() - started < 45_000, 'esperas sem prazo');
});
test('falha injetada: alvo remoto → smoke recusa antes de qualquer requisição (código 3)', () => {
  const r = spawnSync(process.execPath, ['scripts/ci-demo/smoke.mjs'], { env: { ...closed, SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }, encoding: 'utf8', timeout: 20_000 });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /alvo não local/);
  assert.doesNotMatch(r.stdout, /verificações PASS/);
});
test('falha injetada: variável obrigatória ausente → smoke recusa (código 2)', () => {
  const { SUPABASE_SERVICE_ROLE_KEY: _drop, ...env } = closed;
  const r = spawnSync(process.execPath, ['scripts/ci-demo/smoke.mjs'], { env, encoding: 'utf8', timeout: 20_000 });
  assert.equal(r.status, 2);
});
test('summary não confunde merge commit executado com HEAD da PR nem inventa SHA ausente', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-demo-summary-'));
  try {
    const tested = 'a'.repeat(40), head = 'b'.repeat(40);
    const run = (extra) => spawnSync(process.execPath, ['scripts/ci-demo/summary.mjs'], {
      encoding: 'utf8', env: { PATH: process.env.PATH, CI_DEMO_REPORTS: dir, HEAD_SHA: head, GITHUB_SHA: head, ...extra }
    });
    const result = run({ TESTED_SHA: tested });
    assert.equal(result.error, undefined); assert.equal(result.status, 1, result.stderr);
    assert(result.stdout.includes(`SHA executado (checkout): \`${tested}\``));
    assert(result.stdout.includes(`SHA da PR/evento (referência): \`${head}\``));
    assert(result.stdout.includes('Decisão: **C — NO-GO**'), 'sem outcomes completos, o resumo não pode declarar B');
    assert(result.stdout.includes('### Bloqueadores do ensaio'));
    assert(result.stdout.includes('- Node runtime setup: not_run.'));
    const missing = run({});
    assert.equal(missing.error, undefined); assert.equal(missing.status, 1, missing.stderr);
    assert(missing.stdout.includes('SHA executado (checkout): `NÃO IDENTIFICADO`'));
    assert(!missing.stdout.includes(`SHA executado (checkout): \`${head}\``));
    assert(missing.stdout.includes('Maturidade hospedada: **NOT_PROVEN**'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('sanitização remove JWT, cookie, senha em URL e e-mail real; mantém e-mail sintético', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-demo-san-'));
  const source = path.join(dir, 'app.log');
  const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJyb2xlIjoic2VydmljZV9yb2xlIn0', 'c2lnbmF0dXJlLWRlLXRlc3RlLTEyMzQ'].join('.');
  fs.writeFileSync(source, `token ${jwt}\nCookie: arandu_session=abc.def\npostgresql://postgres:segredo123@localhost:54322/postgres\nquem: pessoa@empresa-real.com.br e juliana.ramos@vittafoods.example\n`);
  const r = spawnSync(process.execPath, ['scripts/ci-demo/sanitize.mjs', path.join(dir, 'out'), source], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const clean = fs.readFileSync(path.join(dir, 'out', 'app.log'), 'utf8');
  for (const leaked of [jwt, 'abc.def', 'segredo123', 'pessoa@empresa-real.com.br']) assert(!clean.includes(leaked), `vazou: ${leaked}`);
  assert(clean.includes('juliana.ramos@vittafoods.example'));
  fs.rmSync(dir, { recursive: true, force: true });
});
test('e-mails com example no meio do domínio também são PII', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-demo-email-'));
  try {
    const source = path.join(dir, 'app.log');
    const real = ['pessoa@tenant.example.com', 'pessoa@tenant.example.com.br', 'pessoa@EXAMPLE.COM'];
    fs.writeFileSync(source, real.join(' ') + ' fixture@vittafoods.example fixture@VITTAFOODS.EXAMPLE');
    const r = spawnSync(process.execPath, ['scripts/ci-demo/sanitize.mjs', path.join(dir, 'out'), source], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const clean = fs.readFileSync(path.join(dir, 'out/app.log'), 'utf8');
    for (const email of real) assert(!clean.includes(email), `vazou: ${email}`);
    assert(clean.includes('fixture@vittafoods.example') && clean.includes('fixture@VITTAFOODS.EXAMPLE'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('teardown recusa falha Docker e recursos residuais; preserva estado para retomar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-demo-down-'));
  try {
    const local = path.join(dir, 'scripts/pilot-local');
    fs.mkdirSync(path.join(local, '.state'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'bin'));
    fs.copyFileSync('scripts/pilot-local/down.sh', path.join(local, 'down.sh'));
    fs.writeFileSync(path.join(local, 'docker-compose.yml'), 'services: {}');
    const marker = path.join(local, '.state/retain');
    fs.writeFileSync(path.join(dir, 'bin/docker'), `#!/bin/bash
printf '%s\\n' "$*" >> "$CAPTURE"
if [ "$FAKE_QUERY_ERROR" = 1 ] && [[ "$*" != *' down '* ]]; then exit 8; fi
case "$*" in
  *' down '*) exit "\${FAKE_COMPOSE_STATUS:-0}" ;;
  'ps '*) [ "$FAKE_RESIDUAL" != container ] || echo residual-container ;;
  'volume ls '*) [ "$FAKE_RESIDUAL" != volume ] || echo residual-volume ;;
  'network ls '*) [ "$FAKE_RESIDUAL" != network ] || echo residual-network ;;
  *) exit 9 ;;
esac
exit 0
`, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'bin/pgrep'), '#!/bin/bash\nexit 1\n', { mode: 0o755 });
    const capture = path.join(dir, 'calls');
    const run = (extra) => spawnSync('bash', [path.join(local, 'down.sh')], { encoding: 'utf8', timeout: 5000, env: { PATH: path.join(dir, 'bin') + path.delimiter + process.env.PATH, CAPTURE: capture, ...extra } });
    for (const extra of [{ FAKE_COMPOSE_STATUS: '7' }, ...['container', 'volume', 'network'].map(FAKE_RESIDUAL => ({ FAKE_RESIDUAL }))]) {
      fs.writeFileSync(marker, 'state');
      const r = run(extra);
      assert.equal(r.error, undefined); assert.equal(r.signal, null);
      assert.equal(r.status, 1, r.stdout + r.stderr);
      assert(fs.existsSync(marker), 'estado apagado apesar de falha');
    }
    fs.writeFileSync(marker, 'state');
    const queryFailure = run({ FAKE_QUERY_ERROR: '1' });
    assert.equal(queryFailure.error, undefined); assert.equal(queryFailure.signal, null);
    assert.equal(queryFailure.status, 8); assert(fs.existsSync(marker));
    const ok = run({});
    assert.equal(ok.status, 0, ok.stderr);
    assert(!fs.existsSync(path.join(local, '.state')));
    for (const line of fs.readFileSync(capture, 'utf8').trim().split('\n')) assert(line.includes('arandu-pilot-local'), `operação não limitada ao projeto: ${line}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('restore drill invalida PASS se cleanup falhar e distingue retenção intencional', () => {
  const script = fs.readFileSync('scripts/pilot-restore-drill.sh', 'utf8');
  const cleanup = script.slice(script.indexOf('cleanup() {'), script.indexOf('source_url='));
  assert(script.indexOf('trap cleanup EXIT') < script.indexOf('tools="$(mktemp'), 'trap deve preceder wrappers e preflight');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-demo-drill-cleanup-'));
  const harness = [
    'set -euo pipefail',
    'report="$FIXTURE/report.json"; work="$FIXTURE/work"; tools="$FIXTURE/tools"',
    'mkdir -p "$work" "$tools"',
    'keep_backup=0; run_id=fixture-run; created_containers=(unique-drill-fixture)',
    'touch "$FIXTURE/container"',
    'if [ "$MODE" = preflight-failed ]; then created_containers=(); fi',
    'rm() { if [ "$MODE" = tools-error ] && [ "$*" = "-rf $tools" ]; then return 9; fi; command rm "$@"; }',
    'docker() {',
    '  case "$*" in',
    '    "ps -aq --filter name=^/unique-drill-fixture$ --filter label=arandu.restore-drill=fixture-run")',
    '      [ "$MODE" != query-error ] || return 8',
    '      if [ "$MODE" != foreign ] && [ -f "$FIXTURE/container" ]; then echo fixture-id; fi ;;',
    '    "rm -f fixture-id")',
    '      [ "$MODE" != remove-error ] || return 7',
    '      if [ "$MODE" != residual ]; then rm -f "$FIXTURE/container"; fi ;;',
    '    *) echo "unexpected Docker command" >&2; return 99 ;;',
    '  esac',
    '}',
    cleanup,
    `printf '%s' '{"result":"pending_cleanup"}' > "$report"`,
    'exit "$BODY_STATUS"'
  ].join('\n');
  try {
    for (const mode of ['remove-error', 'query-error', 'residual', 'success', 'keep', 'body-failed', 'both-failed', 'tools-error', 'foreign', 'preflight-failed']) {
      const fixture = path.join(dir, mode); fs.mkdirSync(fixture);
      const failedBody = ['body-failed', 'both-failed', 'preflight-failed'].includes(mode);
      const failedCleanup = ['remove-error', 'query-error', 'residual', 'both-failed', 'tools-error'].includes(mode);
      const r = spawnSync('bash', ['-c', harness], { encoding: 'utf8', timeout: 5000, env: {
        PATH: process.env.PATH, FIXTURE: fixture, MODE: mode === 'both-failed' ? 'remove-error' : mode,
        BODY_STATUS: failedBody ? '23' : '0', PILOT_DRILL_KEEP: mode === 'keep' ? '1' : '0'
      } });
      assert.equal(r.error, undefined); assert.equal(r.signal, null);
      assert.equal(r.status, failedBody ? 23 : failedCleanup ? 1 : 0, mode + r.stderr);
      const report = path.join(fixture, 'report.json');
      if (failedCleanup) {
        assert(!fs.existsSync(report), mode + ': PASS residual');
        assert(fs.existsSync(path.join(fixture, 'tools')) && fs.existsSync(path.join(fixture, 'work')), mode + ': estado perdido');
      } else {
        if (failedBody) assert(!fs.existsSync(report), 'erro do corpo deixou relatório');
        else {
          const result = JSON.parse(fs.readFileSync(report));
          assert.equal(result.cleanup, mode === 'keep' ? 'retained' : 'removed');
          assert.equal(result.result, 'passed');
        }
        assert.equal(fs.existsSync(path.join(fixture, 'container')), ['keep', 'foreign', 'preflight-failed'].includes(mode));
        assert.equal(fs.existsSync(path.join(fixture, 'work')), mode === 'keep');
      }
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('fase desconhecida do harness é recusada (código 2)', () => {
  const r = spawnSync('bash', ['scripts/ci-demo/run.sh', 'fase-inexistente'], { encoding: 'utf8', env: { ...process.env, CI_DEMO_REPORTS: os.tmpdir() } });
  assert.equal(r.status, 2);
});
test('sondas adversariais: sonda sem pré-condição é SKIPPED e FAIL derruba a fase', () => {
  const source = fs.readFileSync('scripts/ci-demo/adversarial.mjs', 'utf8');
  assert.match(source, /status: error instanceof Skip \? 'SKIPPED' : 'FAIL'/);
  assert.match(source, /process\.exit\(failed\.length \? 1 : 0\)/);
  assert.doesNotMatch(source, /status: 'PASS', evidence: 'n\/a'/);
});
console.log(`${passed} testes da integração efêmera OK`);

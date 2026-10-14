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

// Sem comentários: as restrições valem para o que executa.
const workflow = fs.readFileSync('.github/workflows/demo-integration.yml', 'utf8').split('\n').filter((line) => !/^\s*#/.test(line)).join('\n');
const runner = fs.readFileSync('scripts/ci-demo/run.sh', 'utf8');
let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`ok - ${name}`); };

test('assert-local aceita só localhost', () => {
  assert.deepEqual(localViolations({ SUPABASE_URL: 'https://localhost:8443', ARANDU_DEMO_APP_URL: 'https://127.0.0.1:4443', PILOT_DB_URL: 'postgresql://postgres:x@localhost:54322/postgres' }), []);
  assert.equal(localViolations({ SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }).length, 1);
  assert.equal(localViolations({ ARANDU_DEMO_APP_URL: 'https://arandu.vercel.app' }).length, 1);
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
test('workflow: sem secrets, sem environment hospedado, sem deploy', () => {
  assert.doesNotMatch(workflow, /secrets\.|^\s+environment:|vercel|supabase (db|link)|migrations:release/im);
});
test('workflow: nenhuma falha mascarada', () => {
  assert.doesNotMatch(workflow + runner, /continue-on-error|\|\|\s*true\s*$/m);
  assert.doesNotMatch(runner, /--retries/);
});
test('workflow: timeout no job e em cada fase; concorrência limitada', () => {
  assert.match(workflow, /timeout-minutes: \d+\n    env:/);
  for (const id of ['preflight', 'images', 'up', 'smoke', 'seed', 'check', 'e2e_desktop', 'e2e_mobile', 'journey', 'adversarial']) {
    assert.match(workflow, new RegExp(`id: ${id}\\n        timeout-minutes: \\d+`), `fase ${id} sem timeout`);
  }
  assert.match(workflow, /concurrency:\n  group: arandu-demo-integration\n  cancel-in-progress: false/);
});
test('workflow: limpeza e evidência sempre executam', () => {
  for (const name of ['Collect sanitized evidence', 'Summary', 'Teardown (containers, volumes, keys)', 'Upload sanitized evidence']) {
    assert.match(workflow, new RegExp(`- name: ${name.replace(/[()]/g, '\\$&')}\\n        if: always\\(\\)`), `${name} sem if: always()`);
  }
});
test('Playwright: só Chromium, um worker, sem trace', () => {
  assert.match(workflow, /npx playwright install --with-deps chromium\n/);
  assert.doesNotMatch(workflow, /firefox|webkit/);
  assert.match(runner, /--workers 1 --trace off/);
});
test('imagens fixadas por digest', () => {
  const pinned = runner.match(/\|sha256:[a-f0-9]{64}/g) || [];
  assert.equal(pinned.length, 4);
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

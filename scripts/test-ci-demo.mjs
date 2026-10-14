#!/usr/bin/env node
// Invariantes da integração efêmera da Demo (.github/workflows/demo-integration.yml
// e scripts/ci-demo/), verificáveis sem Docker: só alvo local, nenhum secret,
// nenhuma falha mascarada, limpeza obrigatória e Chromium com poucos workers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
console.log(`${passed} testes da integração efêmera OK`);

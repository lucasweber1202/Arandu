#!/usr/bin/env node
// Fronteira da demonstração interativa: quando ela existe, onde ela nunca
// existe e prova de que o pacote de produção não carrega o motor.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { demoModeEnabled, assertDemoModeIsSafe, REAL_CREDENTIAL_KEYS } from '../lib/demo-mode.mjs';

// Política.
assert.equal(demoModeEnabled({}), false, 'build local sem pedido explícito não publica /demo');
assert.equal(demoModeEnabled({ VERCEL_ENV: 'preview' }), true);
assert.equal(demoModeEnabled({ VERCEL_ENV: 'preview', ARANDU_DEMO_MODE: 'false' }), false);
assert.equal(demoModeEnabled({ ARANDU_DEMO_MODE: 'true' }), true);
// Piloto e produção: nem preview do projeto publica /demo, e pedir falha o build.
for (const environment of ['pilot', 'production']) {
  assert.equal(demoModeEnabled({ ARANDU_ENV: environment, VERCEL_ENV: 'preview' }), false, `preview de ${environment} publicou /demo`);
  assert.equal(assertDemoModeIsSafe({ ARANDU_ENV: environment, VERCEL_ENV: 'preview' }), false);
  for (const request of [{ ARANDU_DEMO_MODE: 'true' }, { ARANDU_PRESENTATION_MODE: 'true' }, { ARANDU_DEPLOYMENT_KIND: 'demo' }]) {
    assert.throws(() => assertDemoModeIsSafe({ ARANDU_ENV: environment, ...request }), /Demonstração pedida/, `${environment} aceitou ${Object.keys(request)[0]}`);
  }
}
assert.equal(demoModeEnabled({ ARANDU_PRESENTATION_MODE: 'true', VERCEL_ENV: 'preview' }), true);
assert.equal(demoModeEnabled({ VERCEL_ENV: 'production' }), false);
assert.equal(demoModeEnabled({ VERCEL_ENV: 'production', ARANDU_PRESENTATION_MODE: 'true' }), false);
assert.throws(() => assertDemoModeIsSafe({ VERCEL_ENV: 'production', ARANDU_DEMO_MODE: 'true' }), /não pode ser ativado na produção financeira/);
assert.equal(assertDemoModeIsSafe({ VERCEL_ENV: 'production' }), false);
// Build independente: pode ser "production" do próprio projeto, sem credencial real.
assert.equal(assertDemoModeIsSafe({ ARANDU_DEPLOYMENT_KIND: 'demo', VERCEL_ENV: 'production' }), true);
for (const key of REAL_CREDENTIAL_KEYS) {
  assert.throws(() => assertDemoModeIsSafe({ ARANDU_DEPLOYMENT_KIND: 'demo', [key]: 'valor-real' }), /credenciais reais/, key);
}

// Código: a decisão é de build, não de URL, e o motor não tem rede.
const vite = readFileSync('vite.config.js', 'utf8');
const app = readFileSync('finance/app.js', 'utf8');
assert.match(vite, /assertDemoModeIsSafe\(\)/);
assert.match(vite, /__ARANDU_DEMO__: JSON\.stringify\(demoMode\)/);
assert.match(vite, /!page\.startsWith\('demo\/'\)/, 'páginas da demo não podem carregar analytics');
assert.match(app, /if \(!demoPage\) return httpTransport;/);
assert.match(app, /if \(!DEMO_BUILD\) return null;/);
assert.doesNotMatch(app, /location\.search[^\n]*demo|searchParams\.get\(['"]demo/, 'a demo nunca é ligada por parâmetro de URL');
for (const file of ['finance/demo/engine.js', 'finance/demo/seed.js', 'finance/demo/landing.js']) {
  const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|service_role|SUPABASE|\/api\//, `${file} não pode falar com servidor`);
}
const seed = readFileSync('finance/demo/seed.js', 'utf8');
for (const match of seed.matchAll(/legal_name: '([^']+)'/g)) assert.match(match[1], /— DEMO$/, `organização sem marca DEMO: ${match[1]}`);
for (const match of seed.matchAll(/email: '([^']+)'/g)) assert.match(match[1], /\.invalid$/, `e-mail fictício precisa ser .invalid: ${match[1]}`);

// Artefato: com `--dist`, prova o conteúdo do build atual.
if (process.argv.includes('--dist')) {
  const expectDemo = process.argv.includes('--expect-demo');
  const files = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else files.push(path); } };
  walk('dist');
  const scripts = files.filter((file) => file.endsWith('.js'));
  const withEngine = scripts.filter((file) => readFileSync(file, 'utf8').includes('arandu_demo_state_v1'));
  if (expectDemo) {
    assert.ok(existsSync('dist/demo/index.html') && existsSync('dist/demo/finance/dashboard.html'), 'build demonstrativo sem /demo');
    assert.ok(withEngine.length, 'build demonstrativo sem motor');
    // Projeto independente: a raiz é a entrada da demo (link único para enviar).
    if (process.env.ARANDU_DEPLOYMENT_KIND === 'demo') {
      const root = readFileSync('dist/index.html', 'utf8');
      assert.match(root, /id="start-demo"/, 'raiz do projeto demonstrativo não abre a entrada da demo');
      assert.match(root, /Ambiente demonstrativo/);
      assert.match(root, /noindex,nofollow/);
      assert.doesNotMatch(root, /speed-insights/, 'raiz da demo carrega analytics');
    }
    for (const file of files.filter((path) => path.startsWith('dist/demo/') && path.endsWith('.html'))) {
      const html = readFileSync(file, 'utf8');
      assert.match(html, /Ambiente demonstrativo/, `${file} sem faixa de demonstração`);
      assert.match(html, /noindex,nofollow/, `${file} indexável`);
      assert.doesNotMatch(html, /speed-insights/, `${file} carrega analytics`);
    }
  } else {
    assert.ok(!existsSync('dist/demo'), 'build sem demonstração publicou /demo');
    // Telas exclusivas do Work OS nunca existem fora da demonstração.
    for (const page of ['intake', 'policies', 'integrations', 'usage']) assert.ok(!existsSync(`dist/finance/${page}.html`), `build oficial publicou /finance/${page}.html`);
    assert.deepEqual(withEngine, [], 'motor da demonstração entrou no pacote sem demonstração');
    assert.doesNotMatch(readFileSync('dist/index.html', 'utf8'), /data-demo-cta/);
    // Camada de experiência da demo (Workspace 2.0): nenhum módulo, CSS, chave
    // de armazenamento ou dado fictício dela no pacote oficial.
    const DEMO_ONLY = ['arandu-demo-workspace', 'arandu-demo-route', 'arandu-demo-proposal-seen', 'decisionInbox', 'installInspector', 'installFilterBar',
      'Calculado pelo Arandu com hipóteses', 'Ver processo completo', 'Onde as propostas mais diferem', 'data-inspector', 'wq-row', 'dinbox', 'Marina Costa', '— DEMO',
      // Work OS (v3): registro local, cache, barramento, presença, conectores simulados, políticas, intake e uso.
      'arandu-demo-os', 'arandu-demo-swr', 'arandu-demo-bus', 'arandu-demo-presence', 'arandu-demo-started', 'arandu-demo-queue-grouped',
      'Pluggy', 'Belvo', 'WorkOS', 'NetSuite', 'PostHog', 'Nenhum banco real', 'Autorizar (simulado)', 'workPolicies', 'workIntegrations', 'workUsage', 'workIntake',
      'Uso da demonstração', 'cthread', 'ncenter-cat', 'int-card', 'policy-version', 'intake-card', 'conflict-dialog', 'help-dialog', 'Dados simulados', 'sync-indicator', 'Simular offline'];
    for (const file of files.filter((path) => /\.(js|css|html)$/.test(path))) {
      const text = readFileSync(file, 'utf8');
      for (const marker of DEMO_ONLY) assert.ok(!text.includes(marker), `${file} contém "${marker}", exclusivo da demonstração`);
    }
  }
  console.log(`Demo boundary (dist): ${expectDemo ? 'demonstração publicada com faixa, noindex e sem analytics' : 'nenhuma página nem código da demonstração no pacote'}.`);
}
console.log('Demo mode: preview/local explícito, produção financeira fail-closed, build independente sem credenciais e motor sem rede validados.');

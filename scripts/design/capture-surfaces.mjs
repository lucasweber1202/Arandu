#!/usr/bin/env node
// Design QA: capturas reproduzíveis das superfícies REAIS do produto, com dados
// da Demo canônica (ARANDU_ENV=demo + scripts/demo/seed.mjs). Não usa mocks.
//
//   npm run demo:setup
//   set -a; . scripts/pilot-local/.state/demo.env; set +a
//   node scripts/design/capture-surfaces.mjs --label=before
//
// Saída: reports/design/<label>/<viewport>/<superfície>.png e um manifest.json
// com SHA do commit, URL, viewport e overflow horizontal medido em cada tela.
// Só leitura: não clica em ações que alterem estado.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
const label = String(args.label || 'current').replace(/[^a-z0-9-]/gi, '');
const base = process.env.ARANDU_DEMO_APP_URL || 'https://localhost:4443';
const password = process.env.ARANDU_DEMO_PASSWORD;
if (!password) { console.error('Defina ARANDU_DEMO_PASSWORD (scripts/pilot-local/.state/demo.env).'); process.exit(2); }

const PEOPLE = { buyer: 'juliana.ramos@vittafoods.example', admin: 'helena.duarte@vittafoods.example', provider: 'eduardo.lima@atlasbank.example' };
const SURFACES = {
  buyer: ['dashboard', 'rfqs', 'approvals', 'proposals', 'contracts', 'portfolio', 'fees', 'value', 'opportunities', 'providers', 'covenants', 'implementations', 'tasks', 'new-rfq'],
  admin: ['settings', 'passport', 'qualifications'],
  provider: ['provider-home', 'provider-rfqs']
};
const VIEWPORTS = { desktop: { viewport: { width: 1440, height: 900 } }, mobile: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } };
const pathFor = (name) => (name.startsWith('provider-') ? `/provider/${name === 'provider-home' ? 'index' : name.replace('provider-', '')}.html` : `/finance/${name}.html`);

const sha = (() => { try { return execSync('git rev-parse HEAD').toString().trim(); } catch { return null; } })();
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const manifest = { label, sha, base, capturedAt: new Date().toISOString(), shots: [] };

async function login(page, email) {
  await page.goto(`${base}/login.html`);
  await page.getByLabel('E-mail corporativo').fill(email);
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/(finance|provider)\//, { timeout: 30000 });
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => null);
  await page.waitForFunction(() => document.querySelector('#view')?.getAttribute('aria-busy') !== 'true', null, { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(400);
}
// Uma tela de erro não é captura válida: o limite de requisições da API real
// (legítimo) é respeitado com espera e uma nova tentativa; persistindo, falha.
const failed = (page) => page.evaluate(() => /Não foi possível carregar|Muitas tentativas/.test(document.querySelector('#view')?.textContent || ''));
async function visit(page, url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(url);
    await settle(page);
    if (!(await failed(page))) return true;
    await page.waitForTimeout(35000);
  }
  return false;
}

// Um login por persona (o login tem limite legítimo por IP e por conta); a
// sessão é reaproveitada nos dois tamanhos de tela.
const sessions = {};
for (const persona of Object.keys(SURFACES)) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'pt-BR' });
  const page = await context.newPage();
  await login(page, PEOPLE[persona]);
  sessions[persona] = await context.storageState();
  await context.close();
}
for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
  for (const [persona, surfaces] of Object.entries(SURFACES)) {
    const context = await browser.newContext({ ...viewport, storageState: sessions[persona], ignoreHTTPSErrors: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const folder = join('reports', 'design', label, viewportName);
    await mkdir(folder, { recursive: true });
    for (const surface of surfaces) {
      const loaded = await visit(page, `${base}${pathFor(surface)}`);
      if (!loaded) errors.push('tela de erro (carregamento falhou)');
      await page.waitForTimeout(1500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const file = join(folder, `${surface}.png`);
      await page.screenshot({ path: file, fullPage: viewportName === 'desktop' });
      manifest.shots.push({ viewport: viewportName, persona, surface, file, overflow, errors: errors.splice(0) });
      console.log(`${viewportName.padEnd(7)} ${persona.padEnd(8)} ${surface.padEnd(16)} overflow=${overflow}`);
    }
    await context.close();
  }
}
// Superfícies públicas, sem login.
const pub = await browser.newContext({ ...VIEWPORTS.desktop, ignoreHTTPSErrors: true, locale: 'pt-BR' });
const pubMobile = await browser.newContext({ ...VIEWPORTS.mobile, ignoreHTTPSErrors: true, locale: 'pt-BR' });
for (const [viewportName, context] of [['desktop', pub], ['mobile', pubMobile]]) {
  const page = await context.newPage();
  const folder = join('reports', 'design', label, viewportName);
  await mkdir(folder, { recursive: true });
  for (const surface of ['index', 'produto', 'login', 'seguranca']) {
    await page.goto(`${base}/${surface}.html`);
    await page.waitForLoadState('networkidle').catch(() => null);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const file = join(folder, `public-${surface}.png`);
    await page.screenshot({ path: file, fullPage: true });
    manifest.shots.push({ viewport: viewportName, persona: 'public', surface, file, overflow, errors: [] });
    console.log(`${viewportName.padEnd(7)} public   ${surface.padEnd(16)} overflow=${overflow}`);
  }
}
await browser.close();
await writeFile(join('reports', 'design', label, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const bad = manifest.shots.filter((shot) => shot.overflow > 1 || shot.errors.length);
if (bad.length) { console.error(`Problemas: ${bad.map((shot) => `${shot.viewport}/${shot.surface} overflow=${shot.overflow} errors=${shot.errors.length}`).join('; ')}`); process.exit(1); }
console.log(`OK — ${manifest.shots.length} capturas em reports/design/${label}`);

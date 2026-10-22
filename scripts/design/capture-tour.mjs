#!/usr/bin/env node
// Capturas da visita pública (demo/visita.html) a partir da Demo canônica
// LOCAL (ARANDU_ENV=demo + scripts/demo/seed.mjs), nunca de mock ou sandbox.
//
//   npm run demo:setup
//   set -a; . scripts/pilot-local/.state/demo.env; set +a
//   npm run build && bash scripts/demo/local.sh app      # app servindo o commit atual
//   node scripts/design/capture-tour.mjs
//   node scripts/generate-public-tour.mjs
//
// Só leitura: navega e fotografa; não clica em ações que gravem. Grava
// demo/visita/<etapa>-<viewport>.jpg e demo/visita/captures.json com SHA do
// commit servido, data, base, rota, persona e dimensões de cada imagem.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { TOUR_STEPS, TOUR_VIEWPORTS } from '../../lib/public-tour.mjs';
import { BUYERS, PROVIDERS } from '../../lib/finance/demo-personas.mjs';
import { navItems } from '../../lib/finance/navigation.mjs';
import * as DATASET from '../demo/dataset.mjs';

const base = process.env.ARANDU_DEMO_APP_URL || 'https://localhost:4443';
const password = process.env.ARANDU_DEMO_PASSWORD;
if (!password) { console.error('Defina ARANDU_DEMO_PASSWORD (scripts/pilot-local/.state/demo.env).'); process.exit(2); }
if (!/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) { console.error('Capturas só contra a Demo canônica local.'); process.exit(2); }

const sha = execSync('git rev-parse HEAD').toString().trim();
if (execSync('git status --porcelain -- finance provider lib scripts/generate-finance-pages.mjs').toString().trim()) {
  console.error('Há mudanças não commitadas na interface: a captura não corresponderia ao SHA registrado.');
  process.exit(2);
}
const email = (key) => BUYERS[key]?.email || PROVIDERS[key]?.person.email;
const labels = Object.fromEntries([...navItems('company'), ...navItems('provider')].map((item) => [item.key, item.label]));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => null);
  await page.waitForFunction(() => document.querySelector('#view')?.getAttribute('aria-busy') !== 'true', null, { timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(500);
}

// Um login por persona (limite legítimo de login); a sessão serve aos dois tamanhos.
const sessions = {};
for (const persona of [...new Set(TOUR_STEPS.map((step) => step.persona))]) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'pt-BR' });
  const page = await context.newPage();
  await page.goto(`${base}/login.html`);
  await page.getByLabel('E-mail corporativo').fill(email(persona));
  await page.getByLabel('Senha').fill(password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/(finance|provider)\//, { timeout: 30000 });
  sessions[persona] = await context.storageState();
  await context.close();
}

const manifest = { sha, base, capturedAt: new Date().toISOString(), dataset: 'scripts/demo/seed.mjs (Vitta Foods, 39/39 checagens)', shots: {} };
const rfqHref = {};
for (const [name, viewport] of Object.entries(TOUR_VIEWPORTS)) {
  for (const step of TOUR_STEPS) {
    const context = await browser.newContext({ viewport, ...(name === 'mobile' ? { isMobile: true, hasTouch: true } : {}), storageState: sessions[step.persona],
      ignoreHTTPSErrors: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', reducedMotion: 'reduce' });
    const page = await context.newPage();
    let route = step.route;
    if (step.rfq) {
      if (!rfqHref[step.rfq]) {
        await page.goto(`${base}/finance/rfqs.html`);
        await settle(page);
        const link = page.locator('#view a[href*="rfq.html?id="]', { hasText: DATASET[step.rfq].title }).first();
        rfqHref[step.rfq] = new URL(await link.getAttribute('href'), base).pathname + new URL(await link.getAttribute('href'), base).search;
      }
      route = `${rfqHref[step.rfq]}${step.anchor ? `#${step.anchor}` : ''}`;
    }
    await page.goto(`${base}${route}`);
    await settle(page);
    if (await page.evaluate(() => /Não foi possível carregar|Muitas tentativas|Muitas requisições/.test(document.querySelector('#view')?.textContent || ''))) {
      throw new Error(`${step.id} (${name}): a tela carregou com erro; captura inválida.`);
    }
    const file = `${step.id}-${name}.jpg`;
    await page.screenshot({ path: `demo/visita/${file}`, type: 'jpeg', quality: 78 });
    const shot = manifest.shots[step.id] ||= { route: step.route + (step.anchor ? `#${step.anchor}` : ''), persona: step.persona,
      alt: `Tela ${labels[step.nav]} do Arandu com os dados fictícios da Vitta Foods, vista por ${(BUYERS[step.persona] || PROVIDERS[step.persona].person).name}.` };
    shot[name] = { file, width: viewport.width, height: viewport.height };
    console.log(`${name.padEnd(8)} ${step.id.padEnd(22)} ${route}`);
    await context.close();
  }
}
await browser.close();
await writeFile('demo/visita/captures.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`OK — ${Object.keys(manifest.shots).length} etapas capturadas no commit ${sha.slice(0, 7)}.`);

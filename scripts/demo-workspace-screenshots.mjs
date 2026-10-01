#!/usr/bin/env node
// Evidência visual da demonstração (Workspace Architecture & Design System 2.0).
//
// Uso:  npm run build:demo && node scripts/demo-workspace-screenshots.mjs <before|after> [--round=v3]
//
// Rodadas: v2 (Workspace 2.0, artifacts/demo-workspace-v2) e v3 (Work OS,
// artifacts/demo-work-os-v3). Na v3, telas que só passam a existir depois
// (políticas, integrações…) são capturadas "antes" na superfície equivalente
// que já existia — cada linha diz qual.
//
// Captura o MESMO roteiro em qualquer versão da demo: mesmas URLs, mesma
// persona (gravada direto no estado fictício do motor), mesmo objeto
// (Capital de giro), mesmos viewports e estado recém-restaurado. Não clica em
// controles da interface, para que a comparação before/after não dependa de
// seletores que a própria rodada muda. Nunca sobrescreve um diretório já
// preenchido, a não ser com --force.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) {
  console.error('Uso: node scripts/demo-workspace-screenshots.mjs <before|after> [--force]');
  process.exit(1);
}
const force = process.argv.includes('--force');
const round = (process.argv.find((arg) => arg.startsWith('--round=')) || '--round=v2').slice(8);
const outDir = path.resolve(round === 'v3' ? 'artifacts/demo-work-os-v3' : 'artifacts/demo-workspace-v2', phase);
if (fs.existsSync(outDir) && fs.readdirSync(outDir).some((name) => name.endsWith('.png')) && !force) {
  console.error(`${outDir} já tem capturas. O baseline nunca é sobrescrito (use --force só para "after").`);
  process.exit(1);
}
if (phase === 'before' && force) {
  console.error('O baseline "before" não pode ser sobrescrito.');
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

const PORT = 4179;
const BASE = `http://127.0.0.1:${PORT}`;
const CAPITAL = 'de000000-0000-4000-8000-000400000001';
const APPROVAL_CAPITAL = 'de000000-0000-4000-8000-000700000001';
const ATLAS_CAPITAL_PROPOSAL = 'de000000-0000-4000-8000-000600000001';

const DESKTOP = { width: 1440, height: 900 };
const NOTEBOOK = { width: 1280, height: 800 };
const MOBILE = { width: 390, height: 844 };
const SMALL = { width: 360, height: 800 };
const TINY = { width: 320, height: 568 };

// [arquivo, persona, caminho, viewport]
const SHOTS = [
  ['01-landing-desktop', 'buyer', '/demo/index.html', DESKTOP],
  ['02-buyer-home-desktop', 'buyer', '/demo/finance/dashboard.html', DESKTOP],
  ['03-rfqs-desktop', 'buyer', '/demo/finance/rfqs.html', DESKTOP],
  ['04-rfq-detail-desktop', 'buyer', `/demo/finance/rfq.html?id=${CAPITAL}`, DESKTOP],
  ['05-comparison-desktop', 'buyer', `/demo/finance/rfq.html?id=${CAPITAL}#comparacao`, DESKTOP],
  ['06-approval-desktop', 'approver', `/demo/finance/approvals.html#request-${APPROVAL_CAPITAL}`, DESKTOP],
  ['07-provider-home-desktop', 'provider', '/demo/provider/index.html', DESKTOP],
  ['08-provider-proposal-desktop', 'provider', `/demo/provider/proposal.html?proposal=${ATLAS_CAPITAL_PROPOSAL}`, DESKTOP],
  ['09-admin-desktop', 'admin', '/demo/finance/dashboard.html', DESKTOP],
  ['10-buyer-home-mobile', 'buyer', '/demo/finance/dashboard.html', MOBILE],
  ['11-comparison-mobile', 'buyer', `/demo/finance/rfq.html?id=${CAPITAL}#comparacao`, MOBILE],
  ['12-provider-mobile', 'provider', '/demo/provider/index.html', MOBILE],
  // Jornadas complementares pedidas pela rodada.
  ['13-new-rfq-desktop', 'buyer', '/demo/finance/new-rfq.html', DESKTOP],
  ['14-contracts-desktop', 'buyer', '/demo/finance/contracts.html', DESKTOP],
  ['15-approver-home-desktop', 'approver', '/demo/finance/dashboard.html', DESKTOP],
  ['16-approvals-inbox-desktop', 'approver', '/demo/finance/approvals.html', DESKTOP],
  ['17-provider-opportunities-desktop', 'provider', '/demo/provider/rfqs.html', DESKTOP],
  ['18-admin-settings-desktop', 'admin', '/demo/finance/settings.html', DESKTOP],
  ['19-buyer-home-notebook', 'buyer', '/demo/finance/dashboard.html', NOTEBOOK],
  ['20-rfqs-notebook', 'buyer', '/demo/finance/rfqs.html', NOTEBOOK],
  ['21-comparison-notebook', 'buyer', `/demo/finance/rfq.html?id=${CAPITAL}#comparacao`, NOTEBOOK],
  ['22-landing-mobile', 'buyer', '/demo/index.html', MOBILE],
  ['23-rfqs-mobile', 'buyer', '/demo/finance/rfqs.html', MOBILE],
  ['24-rfq-detail-mobile', 'buyer', `/demo/finance/rfq.html?id=${CAPITAL}`, MOBILE],
  ['25-approval-mobile', 'approver', `/demo/finance/approvals.html#request-${APPROVAL_CAPITAL}`, MOBILE],
  ['26-provider-proposal-mobile', 'provider', `/demo/provider/proposal.html?proposal=${ATLAS_CAPITAL_PROPOSAL}`, MOBILE],
  ['27-buyer-home-360', 'buyer', '/demo/finance/dashboard.html', SMALL],
  ['28-buyer-home-320', 'buyer', '/demo/finance/dashboard.html', TINY],
  ['29-rfqs-320', 'buyer', '/demo/finance/rfqs.html', TINY]
];

const LAPTOP = { width: 1366, height: 768 };
// v3: [arquivo, persona, caminho, viewport, { before?: caminho antes, action?: 'palette' }]
const SHOTS_V3 = [
  ['01-landing-desktop', 'buyer', '/demo/index.html', DESKTOP],
  ['02-home-desktop', 'buyer', '/demo/finance/dashboard.html', DESKTOP],
  ['03-rfq-list-desktop', 'buyer', '/demo/finance/rfqs.html', DESKTOP],
  ['04-rfq-detail-desktop', 'buyer', `/demo/finance/rfq.html?id=${CAPITAL}`, DESKTOP],
  ['05-comparison-desktop', 'buyer', `/demo/finance/rfq.html?id=${CAPITAL}#comparacao`, DESKTOP],
  ['06-approval-desktop', 'approver', `/demo/finance/approvals.html#request-${APPROVAL_CAPITAL}`, DESKTOP],
  ['07-provider-desktop', 'provider', `/demo/provider/proposal.html?proposal=${ATLAS_CAPITAL_PROPOSAL}`, DESKTOP],
  ['08-contract-desktop', 'buyer', '/demo/finance/contracts.html', DESKTOP],
  ['09-admin-desktop', 'admin', '/demo/finance/settings.html', DESKTOP],
  ['10-workflow-builder-desktop', 'admin', '/demo/finance/policies.html', DESKTOP, { before: '/demo/finance/settings.html#aprovacao' }],
  ['11-integrations-desktop', 'admin', '/demo/finance/integrations.html', DESKTOP, { before: '/demo/finance/settings.html#demonstracao' }],
  ['12-financial-profile-desktop', 'admin', '/demo/finance/settings.html#perfil', DESKTOP],
  ['13-notifications-desktop', 'buyer', '/demo/finance/notifications.html', DESKTOP],
  ['14-command-palette-desktop', 'buyer', '/demo/finance/dashboard.html', DESKTOP, { action: 'palette' }],
  ['15-intake-desktop', 'buyer', '/demo/finance/intake.html', DESKTOP, { before: '/demo/finance/new-rfq.html' }],
  ['16-usage-desktop', 'admin', '/demo/finance/usage.html', DESKTOP, { before: '/demo/finance/ops.html' }],
  ['17-home-1366', 'buyer', '/demo/finance/dashboard.html', LAPTOP],
  ['18-rfq-list-1366', 'buyer', '/demo/finance/rfqs.html', LAPTOP],
  ['19-home-1280', 'buyer', '/demo/finance/dashboard.html', NOTEBOOK],
  ['20-rfq-list-1280', 'buyer', '/demo/finance/rfqs.html', NOTEBOOK],
  ['21-home-mobile', 'buyer', '/demo/finance/dashboard.html', MOBILE],
  ['22-rfq-mobile', 'buyer', `/demo/finance/rfq.html?id=${CAPITAL}`, MOBILE],
  ['23-approval-mobile', 'approver', '/demo/finance/approvals.html', MOBILE],
  ['24-provider-mobile', 'provider', '/demo/provider/index.html', MOBILE],
  ['25-notifications-mobile', 'buyer', '/demo/finance/notifications.html', MOBILE]
];

function startServer() {
  const child = spawn(process.execPath, ['scripts/serve-dist.mjs'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  return child;
}
async function waitForServer() {
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`${BASE}/demo/index.html`)).ok) return; } catch { /* ainda subindo */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Servidor de teste não respondeu.');
}

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  const view = page.locator('#view');
  if (await view.count()) {
    await page.waitForFunction(() => document.querySelector('#view')?.getAttribute('aria-busy') === 'false', null, { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('#view .loading-state'), null, { timeout: 15000 }).catch(() => {});
  }
  await page.waitForTimeout(700);
}

async function main() {
  const server = startServer();
  try {
    await waitForServer();
    // Chromium local do ambiente quando a versão empacotada não estiver instalada.
    const executablePath = process.env.ARANDU_CHROMIUM || undefined;
    const browser = await chromium.launch({ executablePath });
    const list = round === 'v3' ? SHOTS_V3 : SHOTS;
    for (const [name, persona, defaultTarget, viewport, options = {}] of list) {
      const target = (phase === 'before' && options.before) || defaultTarget;
      const mobile = viewport.width < 600;
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce', colorScheme: 'light', locale: 'pt-BR' });
      const page = await context.newPage();
      // Estado recém-restaurado + persona escolhida direto no registro do motor.
      await page.goto(`${BASE}/demo/finance/dashboard.html`);
      await settle(page);
      await page.evaluate((key) => {
        localStorage.clear(); sessionStorage.clear();
        return key;
      }, persona);
      await page.goto(`${BASE}/demo/finance/dashboard.html`);
      await settle(page);
      await page.evaluate((key) => {
        const state = JSON.parse(localStorage.getItem('arandu_demo_state_v1'));
        state.persona = key;
        localStorage.setItem('arandu_demo_state_v1', JSON.stringify(state));
      }, persona);
      await page.goto(`${BASE}${target}`);
      await settle(page);
      if (options.action === 'palette') { await page.keyboard.press('Control+k'); await page.waitForTimeout(400); }
      await page.screenshot({ path: path.join(outDir, `${name}.png`) });
      console.log(`✓ ${phase}/${name}.png`);
      await context.close();
    }
    await browser.close();
  } finally {
    server.kill();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

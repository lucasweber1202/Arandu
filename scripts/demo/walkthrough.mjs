// Percorre as telas principais da demonstração com cada persona, em desktop e
// celular, e registra: estado da página (conteúdo, vazio, erro), erros de
// console, requisições com falha e transbordo horizontal. Saída: tabela e
// capturas de tela em DEMO_WALK_DIR. Uso: depois de npm run demo:setup,
//   node scripts/demo/walkthrough.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const APP = process.env.ARANDU_DEMO_APP_URL || 'https://localhost:4443';
const PASSWORD = process.env.ARANDU_DEMO_PASSWORD;
const OUT = process.env.DEMO_WALK_DIR || 'artifacts/demo-walkthrough';
if (!PASSWORD) { console.error('Defina ARANDU_DEMO_PASSWORD (scripts/pilot-local/.state/demo.env).'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const ROUTES = {
  juliana: ['/finance/dashboard.html', '/finance/rfqs.html', '/finance/approvals.html', '/finance/proposals.html', '/finance/contracts.html', '/finance/providers.html', '/finance/tasks.html', '/finance/notifications.html', '/finance/settings.html', '/finance/new-rfq.html', 'rfq:Adquirência', 'rfq:nova linha', 'rfq:linha vigente', 'rfq:Pagamentos'],
  helena: ['/finance/dashboard.html', '/finance/approvals.html'],
  diego: ['/provider/index.html', '/provider/rfqs.html'],
  eduardo: ['/provider/index.html', '/provider/rfqs.html']
};
const EMAILS = { juliana: 'juliana.ramos@vittafoods.example', helena: 'helena.duarte@vittafoods.example', diego: 'diego.freitas@luminapay.example', eduardo: 'eduardo.lima@atlasbank.example' };
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const rows = [];
for (const [persona, routes] of Object.entries(ROUTES)) {
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const page = await context.newPage();
    const problems = [];
    page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text().slice(0, 160)}`); });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message.slice(0, 160)}`));
    page.on('response', (response) => { if (response.status() >= 400 && response.url().includes('/api/')) problems.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    await page.goto(`${APP}/login.html`);
    await page.fill('input[name=email]', EMAILS[persona]);
    await page.fill('input[name=password]', PASSWORD);
    await page.click('form[data-finance-auth=login] button[type=submit]');
    await page.waitForURL(/\/(finance|provider)\//);
    await page.waitForLoadState('networkidle');
    rows.push({ persona, vp: vpName, route: `login → ${new URL(page.url()).pathname}`, state: '', problems: problems.splice(0).join(' | ') });
    for (const route of routes) {
      if (route.startsWith('rfq:')) {
        await page.goto(`${APP}/finance/rfqs.html`);
        await page.waitForLoadState('networkidle');
        const id = await page.evaluate((needle) => window.__aranduCtx.data.rfqs.find((rfq) => rfq.title.toLowerCase().includes(needle.toLowerCase()))?.id, route.slice(4));
        await page.goto(`${APP}/finance/rfq.html?id=${id}`);
      } else await page.goto(`${APP}${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(400);
      const state = await page.evaluate(() => {
        const view = document.querySelector('#view');
        const empties = [...document.querySelectorAll('.empty-state, .empty')].map((node) => node.textContent.trim().slice(0, 60));
        const error = document.querySelector('.error-state')?.textContent.trim().slice(0, 100);
        const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
        return { text: (view?.innerText || '').length, empties, error, overflow, title: document.querySelector('h1')?.textContent.trim() };
      });
      const name = `${persona}-${vpName}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.png`;
      await page.screenshot({ path: path.join(OUT, name), fullPage: vpName === 'desktop' });
      rows.push({ persona, vp: vpName, route: `${route} (${state.title})`, state: `${state.error ? `ERRO: ${state.error}` : `${state.text} chars`}${state.empties.length ? ` · vazios: ${state.empties.join(' / ')}` : ''}${state.overflow ? ' · OVERFLOW' : ''}`, problems: problems.splice(0).join(' | ') });
    }
    await context.close();
  }
}
await browser.close();
for (const row of rows) console.log(`${row.persona.padEnd(8)} ${row.vp.padEnd(7)} ${row.route.padEnd(60)} ${row.state}${row.problems ? `  !! ${row.problems}` : ''}`);

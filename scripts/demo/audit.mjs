// Auditoria de leitura da Demo canônica LOCAL: percorre as telas reais com cada
// persona e procura o que a Design Constitution proíbe ou o que quebra a jornada.
//
//   set -a; . scripts/pilot-local/.state/demo.env; set +a
//   node scripts/demo/audit.mjs            # todas as personas
//   DEMO_AUDIT_PERSONAS=juliana node scripts/demo/audit.mjs
//
// Só LÊ (nenhum clique que grave). Cada tela é carregada uma vez em 1440 px e
// remedida em 1024, 768, 390, 375 e 320 px sem recarregar: o limite legítimo da
// API (240 req/10 min por pessoa) não aceita uma carga por largura.
// Achados: identificador/ISO/enum/"undefined" no texto visível, rolagem
// horizontal da página, controle fora da tela, erro de console, resposta da API
// com falha e tela de erro. Recusa-se a rodar fora do app local.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const APP = process.env.ARANDU_DEMO_APP_URL || 'https://localhost:4443';
const PASSWORD = process.env.ARANDU_DEMO_PASSWORD;
const OUT = process.env.DEMO_AUDIT_DIR || 'reports/demo-audit';
if (!PASSWORD) { console.error('Defina ARANDU_DEMO_PASSWORD (scripts/pilot-local/.state/demo.env).'); process.exit(2); }
if (!/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP)) { console.error('Só roda contra a Demo local.'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const BUYER = ['/finance/dashboard.html', '/finance/tasks.html', '/finance/approvals.html', '/finance/notifications.html', '/finance/rfqs.html', '/finance/proposals.html',
  '/finance/implementations.html', '/finance/contracts.html', '/finance/portfolio.html', '/finance/covenants.html', '/finance/fees.html', '/finance/spend.html',
  '/finance/value.html', '/finance/opportunities.html', '/finance/providers.html', '/finance/qualifications.html', '/finance/performance.html',
  '/finance/passport.html', '/finance/settings.html', '/finance/extractions.html', '/finance/new-rfq.html'];
const PERSONAS = {
  juliana: { email: 'juliana.ramos@vittafoods.example', routes: [...BUYER, 'rfq:*'] },
  helena: { email: 'helena.duarte@vittafoods.example', routes: ['/finance/dashboard.html', '/finance/approvals.html', '/finance/contracts.html', '/finance/settings.html', '/finance/tasks.html'] },
  rafael: { email: 'rafael.menezes@vittafoods.example', routes: ['/finance/dashboard.html', '/finance/tasks.html', '/finance/rfqs.html', '/finance/covenants.html'] },
  carlos: { email: 'carlos.tavares@vittafoods.example', routes: ['/finance/dashboard.html', '/finance/rfqs.html', '/finance/contracts.html', '/finance/tasks.html', '/finance/new-rfq.html', '/finance/settings.html'] },
  meridian: { email: 'patricia.alves@meridianfinancial.example', routes: ['/provider/index.html', '/provider/rfqs.html', 'proposal:*', '/finance/dashboard.html'] },
  lumina: { email: 'diego.freitas@luminapay.example', routes: ['/provider/index.html', 'proposal:*'] }
};
const WIDTHS = [1440, 1024, 768, 390, 375, 320];
const wanted = String(process.env.DEMO_AUDIT_PERSONAS || '').split(',').filter(Boolean);

const PATTERNS = [
  ['identificador', /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
  ['instante ISO', /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/],
  ['data ISO', /(?<![\w/.-])\d{4}-\d{2}-\d{2}(?![\w/-])/],
  ['valor técnico', /\b(undefined|null|NaN|\[object Object\])\b/],
  ['enum cru', /\b(?:[a-z]+_){1,3}[a-z]+\b/]
];
// snake_case legítimo em texto livre do usuário é raro; ignorar dentro de campos editáveis e código.
const findings = [];
const add = (persona, route, kind, detail, width = null) => findings.push({ persona, route, kind, detail: String(detail).slice(0, 240), width });

async function login(browser, email) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  const page = await context.newPage();
  await page.goto(`${APP}/login.html`);
  await page.getByLabel('E-mail corporativo').fill(email);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/(finance|provider)\//, { timeout: 30000 });
  return { context, page };
}

async function visibleText(page) {
  return page.evaluate(() => {
    const skip = (node) => node.closest('input,textarea,select,code,pre,script,style,[hidden],[aria-hidden="true"],.sr-only');
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const out = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || skip(parent)) continue;
      const box = parent.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      const text = node.textContent.replace(/\s+/g, ' ').trim();
      if (text) out.push(text);
    }
    return out;
  });
}

async function layout(page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const scroll = document.scrollingElement.scrollWidth;
    const clipped = [];
    for (const node of document.querySelectorAll('button, a.btn, [role=button], input, select, textarea')) {
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height || node.closest('[hidden],dialog:not([open]),.sr-only')) continue;
      // Rolagem interna declarada (tabela, carrossel) não conta: só o que sai da página.
      let scroller = node.parentElement;
      let inside = false;
      while (scroller && scroller !== document.body) {
        const style = getComputedStyle(scroller);
        if (/(auto|scroll)/.test(style.overflowX)) { inside = true; break; }
        scroller = scroller.parentElement;
      }
      if (!inside && (box.right > width + 1 || box.left < -1)) clipped.push((node.getAttribute('aria-label') || node.textContent || node.name || node.tagName).trim().slice(0, 60));
    }
    return { overflow: scroll - width, clipped: [...new Set(clipped)].slice(0, 8) };
  });
}

async function audit(persona, page, route, { tabs = [] } = {}) {
  const base = route.replace(APP, '');
  const errors = [];
  const onConsole = (message) => { if (message.type() === 'error') errors.push(message.text()); };
  const onResponse = (response) => { const url = response.url(); if (url.includes('/api/') && response.status() >= 400 && response.status() !== 401) errors.push(`${response.status()} ${new URL(url).pathname}`); };
  page.on('console', onConsole);
  page.on('response', onResponse);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(route.startsWith('http') ? route : `${APP}${route}`);
  await page.waitForLoadState('networkidle').catch(() => null);
  await page.waitForTimeout(900);
  for (const tab of ['', ...tabs]) {
  const label = tab ? `${base}#${tab}` : base;
  if (tab) {
    const control = page.getByRole('tab', { name: new RegExp(`^${tab}`) });
    if (!(await control.count())) continue;
    await control.first().click();
    await page.waitForLoadState('networkidle').catch(() => null);
    await page.waitForTimeout(700);
  }
  for (const text of await visibleText(page)) {
    for (const [kind, pattern] of PATTERNS) {
      const match = text.match(pattern);
      if (match) add(persona, label, kind, `"${match[0]}" em “${text.slice(0, 140)}”`);
    }
  }
  if (await page.locator('.error-state, [data-state="error"]').count()) add(persona, label, 'tela de erro', (await page.locator('.error-state, [data-state="error"]').first().innerText()).slice(0, 200));
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
    await page.waitForTimeout(250);
    const result = await layout(page);
    if (result.overflow > 1) add(persona, label, 'rolagem horizontal', `${result.overflow}px`, width);
    if (result.clipped.length) add(persona, label, 'controle fora da tela', result.clipped.join(' | '), width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${OUT}/${persona}-${label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-390.png`, fullPage: false }).catch(() => null);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: `${OUT}/${persona}-${label.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-1440.png`, fullPage: false }).catch(() => null);
  console.log(`${persona.padEnd(9)} ${label}`);
  }
  page.off('console', onConsole);
  page.off('response', onResponse);
  for (const error of [...new Set(errors)]) add(persona, base, 'erro de execução', error);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [persona, spec] of Object.entries(PERSONAS)) {
  if (wanted.length && !wanted.includes(persona)) continue;
  const { context, page } = await login(browser, spec.email);
  for (const route of spec.routes) {
    if (route === 'rfq:*') {
      await page.goto(`${APP}/finance/rfqs.html`); await page.waitForLoadState('networkidle').catch(() => null);
      const links = [...new Set(await page.locator('a[href*="rfq.html?id="]').evaluateAll((nodes) => nodes.map((node) => node.href)))];
      for (const link of links) await audit(persona, page, link, { tabs: ['Propostas', 'Comparação', 'Aprovações', 'Decisão', 'Atividade'] });
    } else if (route === 'proposal:*') {
      await page.goto(`${APP}/provider/rfqs.html`); await page.waitForLoadState('networkidle').catch(() => null);
      const links = [...new Set(await page.locator('a[href*="proposal.html?proposal="]').evaluateAll((nodes) => nodes.map((node) => node.href)))];
      for (const link of links) await audit(persona, page, link);
    } else await audit(persona, page, route);
  }
  await context.close();
}
await browser.close();
fs.writeFileSync(`${OUT}/findings.json`, `${JSON.stringify(findings, null, 2)}\n`);
const byKind = findings.reduce((acc, row) => ({ ...acc, [row.kind]: (acc[row.kind] || 0) + 1 }), {});
console.log(`\n${findings.length} achado(s):`, byKind);
for (const row of findings) console.log(`- [${row.kind}] ${row.persona} ${row.route}${row.width ? ` @${row.width}` : ''}: ${row.detail}`);

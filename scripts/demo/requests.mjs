// Auditoria de requisições na Demo canônica LOCAL: quantas chamadas cada tela faz
// à API real e quais se repetem. Serve para não esgotar o limite legítimo
// (120 req/10 min por pessoa) durante a apresentação — sem contorná-lo.
//
//   set -a; . scripts/pilot-local/.state/demo.env; set +a
//   node scripts/demo/requests.mjs
//
// Só LÊ (nenhum clique que grave). Mede, por tela: chamadas na carga, chamadas
// repetidas (mesmo método e mesma URL), chamadas disparadas ao trocar de aba,
// ao mudar a largura da janela e em 10 s parada (polling). Recusa URL não local.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const APP = process.env.ARANDU_DEMO_APP_URL || 'https://localhost:4443';
const PASSWORD = process.env.ARANDU_DEMO_PASSWORD;
const OUT = process.env.DEMO_REQUESTS_DIR || 'reports/demo-requests';
if (!PASSWORD) { console.error('Defina ARANDU_DEMO_PASSWORD (scripts/pilot-local/.state/demo.env).'); process.exit(2); }
if (!/^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(APP)) { console.error('Só roda contra a Demo local.'); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

// Telas do roteiro de 29/10, na ordem em que a gestora as abre.
const ROUTES = ['/finance/dashboard.html', '/finance/rfqs.html', 'rfq:Capital de giro — nova linha', '/finance/approvals.html', '/finance/contracts.html',
  '/finance/implementations.html', '/finance/covenants.html', '/finance/providers.html', '/finance/tasks.html', '/finance/proposals.html'];
const IDLE_MS = 10_000;

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
const page = await context.newPage();
let log = [];
page.on('request', (request) => {
  const url = new URL(request.url());
  if (url.pathname.startsWith('/api/')) log.push({ method: request.method(), path: url.pathname.replace('/api/', ''), query: url.search, at: Date.now() });
});
const statuses = [];
page.on('response', (response) => { if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 400) statuses.push(`${response.status()} ${new URL(response.url()).pathname}`); });
const settle = async () => { await page.waitForLoadState('networkidle').catch(() => null); await page.waitForTimeout(500); };
const take = () => { const out = log; log = []; return out; };
const dupes = (calls) => {
  const seen = new Map();
  for (const call of calls) { const key = `${call.method} ${call.path}${call.query}`; seen.set(key, (seen.get(key) || 0) + 1); }
  return [...seen].filter(([, n]) => n > 1).map(([key, n]) => `${key.replace(/organization_id=[^&]+/, 'organization_id=…').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, '…')} ×${n}`);
};

await page.goto(`${APP}/login.html`);
await page.getByLabel('E-mail corporativo').fill('juliana.ramos@vittafoods.example');
await page.getByLabel('Senha').fill(PASSWORD);
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForURL(/\/finance\//, { timeout: 30000 });
await settle();
const rows = [];
rows.push({ screen: 'login → painel', load: take() });

for (const route of ROUTES) {
  if (route.startsWith('rfq:')) {
    await page.goto(`${APP}/finance/rfqs.html`); await settle(); take();
    await page.getByRole('link', { name: new RegExp(route.slice(4)) }).first().click();
  } else await page.goto(`${APP}${route}`);
  await settle();
  const row = { screen: route.replace('rfq:', 'RFQ: '), load: take() };
  // Abas da solicitação: trocar de aba não deveria buscar de novo o que já veio.
  if (route.startsWith('rfq:')) {
    for (const tab of ['Propostas', 'Comparação', 'Aprovações', 'Decisão', 'Atividade', 'Visão geral']) {
      await page.getByRole('tab', { name: new RegExp(`^${tab}`) }).click(); await settle();
    }
    row.tabs = take();
  }
  // Largura: girar para celular e voltar não pode disparar carga.
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(600);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(600);
  row.viewport = take();
  // Parada: nenhuma consulta periódica além do sino (se houver), em 10 s.
  await page.waitForTimeout(IDLE_MS);
  row.idle = take();
  rows.push(row);
}
await browser.close();

const summary = rows.map((row) => ({
  screen: row.screen, load: row.load.length, duplicates_on_load: dupes(row.load), tabs: row.tabs ? row.tabs.length : null,
  tab_calls: row.tabs ? row.tabs.map((c) => `${c.method} ${c.path}`) : null, viewport: row.viewport ? row.viewport.length : 0, idle: row.idle ? row.idle.length : 0,
  calls: row.load.map((c) => `${c.method} ${c.path}`)
}));
const total = rows.reduce((sum, row) => sum + row.load.length + (row.tabs?.length || 0) + (row.viewport?.length || 0) + (row.idle?.length || 0), 0);
fs.writeFileSync(`${OUT}/requests.json`, `${JSON.stringify({ app: APP, total, errors: statuses, screens: summary }, null, 2)}\n`);
for (const row of summary) {
  console.log(`${row.screen.padEnd(36)} carga ${String(row.load).padStart(2)}${row.tabs !== null ? ` · abas ${row.tabs}` : ''} · largura ${row.viewport} · parada ${row.idle}${row.duplicates_on_load.length ? ` · REPETIDAS: ${row.duplicates_on_load.join(', ')}` : ''}`);
}
console.log(`\nTotal no roteiro da gestora: ${total} requisições (limite: 120 em 10 min por pessoa).${statuses.length ? ` Respostas com erro: ${statuses.join(', ')}` : ''}`);

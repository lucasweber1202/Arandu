#!/usr/bin/env node
// Peso REAL de JavaScript por jornada, no navegador (Chromium), a partir de dist/.
// Diferente de scripts/build-size.mjs, que soma bytes PUBLICADOS e o fecho
// estático de imports, aqui medimos o que a pessoa efetivamente baixa e executa,
// incluindo imports dinâmicos disparados pela jornada:
//   - decodedBytes: JS descomprimido que chegou ao navegador (rede ou cache);
//   - transferBytes: bytes na rede (gzip, cabeçalhos); 0 quando veio do cache;
//   - executedBytes: bytes de JS cobertos por execução (cobertura V8 por bloco);
//   - requests, scriptMs (CDP ScriptDuration: parse+compile+execução), taskMs, LCP/CLS.
// Cada jornada roda com navegador limpo (cache frio) e repete no mesmo contexto
// (cache quente). Servidor local imita o cache de produção (vercel.json):
// /assets imutável por 1 ano, HTML revalidado com ETag; texto comprimido com gzip.
// API simulada (scripts/perf/journey-fixtures.mjs): não mede backend nem rede real.
//
// Uso: node scripts/perf/measure-journeys.mjs [--out reports/journey-js.json]
//      node scripts/perf/measure-journeys.mjs --check   (compara com a baseline)
//      node scripts/perf/measure-journeys.mjs --update --reason "por que cresceu"
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { chromium } from 'playwright';
import { JOURNEYS, fixture } from './journey-fixtures.mjs';
import { compareToBaseline, executedBytes, summarizeJourney, BASELINE_PATH, updateBaseline } from './journey-budget.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const root = path.resolve('dist');
if (!fs.existsSync(root)) { console.error('dist ausente: rode npm run build antes.'); process.exit(1); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
function resolveFile(pathname) {
  const candidate = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!candidate.startsWith(root)) return null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  if (!path.extname(candidate) && fs.existsSync(`${candidate}.html`)) return `${candidate}.html`;
  return null;
}
let persona = 'buyer';
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const file = resolveFile(decodeURIComponent(u.pathname));
  if (u.pathname.startsWith('/api/finance/')) {
    // API simulada no próprio servidor: page.route desligaria o cache HTTP do
    // navegador e invalidaria a medição de cache quente.
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(fixture(persona, u.pathname.replace('/api/finance/', ''), u.searchParams)));
  }
  if (!file) { res.writeHead(404); return res.end(); }
  const body = fs.readFileSync(file);
  const etag = `"${crypto.createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
  const ext = path.extname(file);
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: etag,
    'Cache-Control': u.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate' };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
  const text = /^(text|application\/(json|manifest)|image\/svg)/.test(headers['Content-Type']);
  const out = text && /gzip/.test(req.headers['accept-encoding'] || '') ? zlib.gzipSync(body, { level: 6 }) : body;
  if (out !== body) headers['Content-Encoding'] = 'gzip';
  headers['Content-Length'] = out.length;
  res.writeHead(200, headers); res.end(out);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

async function runPass(context, journey) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    const m = { lcp: null, cls: 0 }; Object.defineProperty(window, '__journeyMetrics', { value: m });
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  });
  persona = journey.persona;
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Performance.enable');
  const reqs = new Map();
  cdp.on('Network.responseReceived', (e) => { if (e.type === 'Script') reqs.set(e.requestId, { url: e.response.url, cached: e.response.fromDiskCache || e.response.fromPrefetchCache || false, status: e.response.status, transfer: 0, decoded: 0 }); });
  cdp.on('Network.requestServedFromCache', (e) => { const r = reqs.get(e.requestId); if (r) r.cached = true; else reqs.set(e.requestId, { cached: true, pending: true, transfer: 0, decoded: 0 }); });
  cdp.on('Network.dataReceived', (e) => { const r = reqs.get(e.requestId); if (r) r.decoded += e.dataLength; });
  cdp.on('Network.loadingFinished', (e) => { const r = reqs.get(e.requestId); if (r) r.transfer = r.cached ? 0 : e.encodedDataLength; });
  await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false });
  const metric = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const steps = [];
  // url por passo, para o resumo calcular bytes carregados por tela.
  for (const step of journey.steps) {
    reqs.clear();
    const before = await metric().catch(() => ({ ScriptDuration: 0, TaskDuration: 0 }));
    await page.goto(base + step.url, { waitUntil: 'load' });
    await page.waitForSelector(step.ready, { timeout: 20000 });
    await page.waitForLoadState('networkidle');
    const after = await metric();
    const exp = await page.evaluate(() => ({ ...window.__journeyMetrics, dcl: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? null }));
    const scripts = [...reqs.values()].filter((r) => r.url && r.url.startsWith(base));
    steps.push({ requests: scripts.length, fromCache: scripts.filter((r) => r.cached).length,
      decodedBytes: scripts.reduce((s, r) => s + r.decoded, 0), transferBytes: scripts.reduce((s, r) => s + r.transfer, 0),
      url: step.url, urls: scripts.map((r) => new URL(r.url).pathname).sort(),
      scriptMs: Math.round(((after.ScriptDuration || 0) - (before.ScriptDuration || 0)) * 1000),
      taskMs: Math.round(((after.TaskDuration || 0) - (before.TaskDuration || 0)) * 1000),
      lcpMs: exp.lcp === null ? null : Math.round(exp.lcp), cls: Number((exp.cls || 0).toFixed(4)), dclMs: exp.dcl === null ? null : Math.round(exp.dcl) });
  }
  const coverage = (await page.coverage.stopJSCoverage()).filter((c) => c.url.startsWith(base));
  await page.close();
  return { steps, executedBytes: executedBytes(coverage), coveredScripts: coverage.length };
}

const sizeOf = (pathname) => { const f = resolveFile(pathname); return f ? fs.statSync(f).size : 0; };
// CHROMIUM_PATH permite usar um Chromium já instalado quando a versão do Playwright não traz o seu.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const results = [];
try {
  for (const journey of JOURNEYS) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
    const cold = await runPass(context, journey);
    const warm = await runPass(context, journey);
    await context.close();
    results.push(summarizeJourney(journey, cold, warm, sizeOf));
  }
} finally { await browser.close(); server.close(); }

const report = { generatedAt: new Date().toISOString(), tool: 'scripts/perf/measure-journeys.mjs', browser: 'chromium', api: 'simulated', journeys: results };
const out = opt('--out', 'reports/journey-js.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
for (const j of results) console.log(`${j.id.padEnd(16)} inicial ${j.cold.initial.decodedBytes} B · acumulado ${j.cold.cumulative.decodedBytes} B (${j.cold.cumulative.requests} req, rede ${j.cold.cumulative.transferBytes} B, executado ${j.cold.executedBytes} B) · quente rede ${j.warm.cumulative.transferBytes} B · script ${j.cold.cumulative.scriptMs} ms`);

if (flag('--update')) {
  const reason = opt('--reason', '');
  updateBaseline(report, reason);
  console.log(`baseline atualizada em ${BASELINE_PATH}`);
} else if (flag('--check')) {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const { problems, notes } = compareToBaseline(report, baseline);
  for (const n of notes) console.log(`aviso: ${n}`);
  if (problems.length) { for (const p of problems) console.error(`falha: ${p}`); process.exit(1); }
  console.log('journey-js: dentro da baseline');
}

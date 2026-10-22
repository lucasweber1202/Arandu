#!/usr/bin/env node
// Read-only anonymous proof. HTTP alone never proves rendered navigation.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { validateManifest, validateFlow, verifyResponse, getPublic, publicationFailure, tabToLink } from './publication-proof.mjs';
import { digest } from './publication-manifest.mjs';
import { installLabObservers, readLabMetrics, PERFORMANCE_TARGETS } from './performance-contract.mjs';

const args = Object.fromEntries(process.argv.slice(2).map(arg => { const [k, ...v] = arg.replace(/^--/, '').split('='); return [k, v.join('=') || true]; }));
const report = { checked_at: new Date().toISOString(), url: args.url, expected_sha: args.sha,
  HTTP_ARTIFACT: 'NOT_RUN', BROWSER_DESKTOP: 'NOT_RUN', BROWSER_MOBILE: 'NOT_RUN',
  BROWSER_PROOF: 'BROWSER_NOT_PROVEN',
  PUBLIC_SHAREABLE: 'NOT_PROVEN', LOCAL_STATION_READY: 'NOT_RUN', CANONICAL_HOSTED_M3: 'BLOCKED', checks: [] };
let browser;
let activeCheck = null;
let activeViewport = null;
const started = performance.now();
mkdirSync('reports/public-demo', { recursive: true });
try {
  const base = new URL(String(args.url));
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/' || (base.protocol !== 'https:' && !(args.local && local && base.protocol === 'http:')) || (local && !args.local) || (args.local && !local)) throw new Error('Use a public HTTPS origin; --local is loopback laboratory only');
  report.local = local;
  // Record the effective origin independently of manifest/build validation.
  const request = async (path) => {
    activeCheck = { path, url: new URL(path, base).href, result: 'RUNNING' };
    report.checks.push(activeCheck);
    const r = await getPublic(base, path);
    Object.assign(activeCheck, { http_status: r.response.status, effective_url: r.url, redirects: r.redirects });
    return r;
  };
  const root = await request('/');
  verifyResponse(root.response, root.bytes, '/index.html');
  activeCheck.result = 'PASS';
  report.ROOT_HTTP = 'PASS';
  report.effective_url = root.url;
  const identity = await request('/arandu-build.json');
  verifyResponse(identity.response, identity.bytes, '/arandu-build.json');
  if (!/application\/json/.test(identity.response.headers.get('content-type') || '')) throw new Error('Manifest is not JSON');
  const manifest = JSON.parse(identity.bytes);
  validateManifest(manifest, args.sha);
  activeCheck.result = 'PASS';
  verifyResponse(root.response, root.bytes, '/index.html', manifest.files['/index.html']);
  report.build = { commit: manifest.commit, branch: manifest.branch, modality: manifest.modality, built_at: manifest.built_at };
  // Every emitted byte is checked, including lazy chunks, fonts and images.
  for (const [path, expected] of Object.entries(manifest.files)) {
    const r = await request(path);
    verifyResponse(r.response, r.bytes, path, expected);
    if (path.endsWith('.html')) {
      for (const [tag, href] of r.bytes.toString().matchAll(/<(?:script|link|img|source)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/gi)) {
        if (/^<link/i.test(tag) && !/\brel=["'][^"']*(?:stylesheet|icon|manifest|preload)/i.test(tag)) continue;
        if (/^(?:data:|#)/.test(href)) continue;
        const asset = new URL(href, r.url);
        if (asset.origin !== base.origin || !manifest.files[asset.pathname]) throw new Error(`Unverified HTML asset: ${path}`);
      }
    }
    Object.assign(activeCheck, { result: 'PASS', sha256: expected.sha256 });
  }
  // Retired routes must stay retired; redirects to the public entry are not a
  // retirement proof. These are the existing check:live retirement probes.
  for (const path of ['/comprar-arte.html', '/artistas.html', '/obra.html', '/certificado-autenticidade.html', '/painel.html']) {
    const r = await request(path);
    if (![404, 410].includes(r.response.status) || r.redirects.length) throw new Error(`Retired route promoted or redirected: ${path} (HTTP ${r.response.status})`);
    activeCheck.result = 'PASS';
  }
  const health = await request('/api/health');
  report.liveness_http = health.response.status;
  if (health.response.status === 200) {
    const release = JSON.parse(health.bytes).release;
    if (release?.commit !== manifest.commit || release?.branch !== manifest.branch || release?.datasource !== manifest.datasource || release?.misconfigured !== false) throw new Error('Runtime/build identity divergence');
    report.runtime_release = release;
  } else if (health.response.status !== 404) throw new Error('Unexpected liveness response');
  activeCheck.result = 'PASS';
  report.HTTP_ARTIFACT = 'PASS';
  if (args.performance) report.performance = { kind: 'LAB_NOT_RUM', environment: local ? 'loopback-laboratory' : 'public-static-laboratory',
    dataset: manifest.datasource, volume: { artifact_files: Object.keys(manifest.files).length }, concurrent_users: 1,
    request_pattern: 'one sequential anonymous visitor per viewport; direct reload per stage; cache disabled by request interception',
    executor: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.availableParallelism() },
    throttling: 'none; viewport emulation is not a mobile device or mobile network', baseline: 'NOT_AVAILABLE',
    p50: null, p95: null, p99: null, quantile_status: 'NOT_ESTIMATED_PER_ROUTE_SINGLE_SAMPLE',
    eligible_backend_5xx: 'NOT_MEASURED_API_NOT_EXERCISED',
    targets: PERFORMANCE_TARGETS, target_status: 'HYPOTHESES_NOT_SLA', samples: [] };
  if (args.browser) {
    if (!args.flow) throw new Error('--browser requires --flow=<reviewed JSON>');
    const flowBytes = readFileSync(String(args.flow));
    const flow = JSON.parse(flowBytes);
    validateFlow(flow, args.sha);
    report.flow_sha256 = digest(flowBytes);
    for (const s of flow.steps) {
      const path = new URL(s.path, base).pathname;
      if (!manifest.files[path === '/' ? '/index.html' : path]) throw new Error('Flow route absent from artifact');
    }
    const { chromium } = await import('@playwright/test');
    const proxy = !local && (process.env.HTTPS_PROXY || process.env.https_proxy);
    browser = await chromium.launch({ headless: true, ...(proxy ? { proxy: { server: proxy } } : {}) });
    report.browser = { engine: 'chromium', version: browser.version(),
      playwright: JSON.parse(readFileSync(new URL('../node_modules/@playwright/test/package.json', import.meta.url))).version,
      lock_sha256: digest(readFileSync(new URL('../package-lock.json', import.meta.url))) };
    for (const [name, viewport] of [['DESKTOP', { width: 1440, height: 900 }], ['MOBILE', { width: 390, height: 844 }]]) {
      activeViewport = name;
      report['BROWSER_' + name] = 'RUNNING';
      activeCheck = null;
      const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
      if (args.performance) await context.addInitScript(installLabObservers);
      const errors = [];
      let currentStage = 'initialization', action = 'initialization';
      const browserError = (code, detail, path = null) => errors.push({ code, stage: currentStage, action, path, detail });
      const responses = [];
      await context.route('**/*', route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin !== base.origin || !['GET', 'HEAD'].includes(req.method()) || url.pathname.startsWith('/api/')) {
          browserError('UNEXPECTED_BACKEND', 'Backend, off-origin or mutating browser request', url.pathname); return route.abort();
        }
        return route.continue();
      });
      const page = await context.newPage();
      page.on('pageerror', error => browserError('JS_ERROR', error.message.slice(0, 300), new URL(page.url()).pathname));
      page.on('console', message => { if (message.type() === 'error') browserError('JS_ERROR', 'Browser console error'); });
      page.on('response', response => {
        responses.push((async () => {
          try {
            const path = new URL(response.url()).pathname;
            const artifact = path === '/' ? '/index.html' : path;
            if (!manifest.files[artifact]) throw new Error('Browser loaded unverified artifact');
            verifyResponse({ status: response.status(), headers: new Headers(await response.allHeaders()) }, await response.body(), artifact, manifest.files[artifact]);
          } catch (error) { browserError(publicationFailure(error), error.message); }
        })());
      });
      page.on('requestfailed', request => browserError('ROUTE_FAILURE', 'Resource request failed', new URL(request.url()).pathname));
      for (let i = 0; i < flow.steps.length; i++) {
        const step = flow.steps[i], target = new URL(step.path, base).href;
        activeCheck = { viewport: name, stage: step.stage, path: step.path, url: target, result: 'RUNNING' };
        report.checks.push(activeCheck);
        currentStage = step.stage; action = 'navigation';
        if (!i) await page.goto(target, { waitUntil: 'networkidle' });
        else {
          const link = page.locator(step.selector);
          if (await link.count() !== 1 || new URL(await link.getAttribute('href'), page.url()).href !== target) throw new Error(`Missing actual navigation link: ${step.stage}`);
          await tabToLink(page, link); await page.keyboard.press('Enter'); await page.waitForURL(target); await page.waitForLoadState('networkidle');
        }
        const content = () => step.content ? page.locator(step.content).filter({ hasText: step.text }) : page.getByText(step.text, { exact: false }).first();
        await content().waitFor({ state: 'visible' });
        if (!/dados fictícios|simulação|demonstrativ/i.test(await page.locator('body').innerText())) throw new Error('Demo modality is not visible');
        // Reload proves direct deep links, with the same anonymous browser state.
        action = 'reload'; await page.reload({ waitUntil: 'networkidle' });
        await content().waitFor({ state: 'visible' });
        const layout = await page.evaluate(async () => {
          await document.fonts.ready;
          return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
            images: [...document.images].every(img => img.complete && img.naturalWidth > 0), fonts: [...document.fonts].every(font => font.status === 'loaded') };
        });
        if (layout.overflow || !layout.images || !layout.fonts) throw new Error(`Layout/resource failure: ${step.stage}`);
        if (args.performance) report.performance.samples.push({ viewport: name, stage: step.stage, path: step.path, ...await page.evaluate(readLabMetrics) });
        const evidence = `reports/public-demo/${name.toLowerCase()}-${step.stage}.png`;
        const screenshot = await page.screenshot({ path: evidence, fullPage: true });
        Object.assign(activeCheck, { result: 'PASS', evidence, evidence_sha256: digest(screenshot), effective_url: page.url(), navigation: i ? 'keyboard-tab-enter-and-reload' : 'direct-entry-and-reload' });
      }
      await Promise.all(responses);
      report['BROWSER_' + name] = errors.length ? 'FAIL' : 'PASS';
      if (errors.length) report.checks.push({ viewport: name, result: 'FAIL', errors });
      await context.close();
      activeViewport = null;
    }
    if (report.BROWSER_DESKTOP !== 'PASS' || report.BROWSER_MOBILE !== 'PASS') throw Object.assign(new Error('Browser errors; see viewport evidence'), { code: report.checks.find(c => c.errors)?.errors[0]?.code });
    report.BROWSER_PROOF = 'PASS';
    if (!local) report.PUBLIC_SHAREABLE = 'PASS';
  }
} catch (error) {
  report.error = error.message;
  report.failure_code = error.code || publicationFailure(error);
  const inconclusive = ['UNPROVEN', 'EXECUTOR_TLS_BLOCKED', 'BROWSER_UNAVAILABLE'].includes(report.failure_code);
  report.PUBLIC_SHAREABLE = error.code === 'ACCESS_BLOCKED' ? 'ACCESS_BLOCKED' : inconclusive ? 'NOT_PROVEN' : 'FAIL';
  if (activeCheck?.result === 'RUNNING') Object.assign(activeCheck, { result: report.PUBLIC_SHAREABLE, failure_code: report.failure_code });
  if (activeViewport) report['BROWSER_' + activeViewport] = report.PUBLIC_SHAREABLE;
  if (report.HTTP_ARTIFACT !== 'PASS') report.HTTP_ARTIFACT = report.PUBLIC_SHAREABLE;
} finally {
  await browser?.close();
  report.duration_ms = performance.now() - started;
  mkdirSync('reports/public-demo', { recursive: true });
  writeFileSync('reports/public-demo/proof.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
process.exitCode = report.PUBLIC_SHAREABLE === 'PASS' ? 0 : 1;

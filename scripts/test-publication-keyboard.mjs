// Explicit browser test: run after installing Chromium from package-lock.json.
// Not a replacement for the anonymous proof against the public domain.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import http from 'node:http';
import { digest } from './publication-manifest.mjs';
import { tabToLink, inspectRenderedLayout, relayPublicArtifact } from './publication-proof.mjs';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  await page.setContent('<button>Primeiro</button><a href="#destino">Continuar</a>');
  const link = page.locator('a');
  await tabToLink(page, link);
  assert.equal(await link.evaluate(e => e === document.activeElement), true);
  await page.keyboard.press('Enter');
  assert.equal(new URL(page.url()).hash, '#destino');

  await page.setContent('<button>Primeiro</button><a tabindex="-1" href="#destino">Inacessível</a>');
  await page.locator('a').focus();
  assert.equal(await page.locator('a').evaluate(e => e === document.activeElement), true,
    'baseline programmatic focus accepts the inaccessible link');
  await page.locator('button').focus();
  await assert.rejects(tabToLink(page, page.locator('a')), /unreachable by Tab/);

  await page.setContent('<button>Preso</button><a href="#destino">Continuar</a>');
  await page.evaluate(() => document.addEventListener('keydown', e => {
    if (e.key === 'Tab') { e.preventDefault(); document.querySelector('button').focus(); }
  }));
  await assert.rejects(tabToLink(page, page.locator('a')), /unreachable by Tab/);
  const resources = await browser.newPage();
  await resources.route('http://127.0.0.1/**', route => route.fulfill({
    contentType: 'image/svg+xml', body: route.request().url().endsWith('valid.svg')
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>' : 'invalid image bytes'
  }));
  await resources.setContent('<img style="display:none" loading="lazy" src="http://127.0.0.1/broken.svg"><div style="height:20000px"></div><img loading="lazy" src="http://127.0.0.1/valid.svg">');
  const layout = await inspectRenderedLayout(resources);
  assert.equal(layout.hidden_images, 1);
  assert.equal(layout.images.length, 1);
  assert.equal(layout.images[0].width, 8, 'scroll must load and decode the offscreen lazy image');
  assert.equal(await resources.evaluate(() => [...document.images].every(img => img.complete && img.naturalWidth > 0)), false,
    'old all-images gate incorrectly rejects an unloaded hidden section');
  await resources.locator('img').first().evaluate(e => { e.style.display = 'block'; });
  await assert.rejects(inspectRenderedLayout(resources), e => e.code === 'ASSET_MISMATCH', 'revealed broken image must fail');
  await resources.close();
  // Real disposable HTTP origin: relay must preserve actual bytes, reject
  // tampering, and block mutations before contacting even this local server.
  const html = Buffer.from('<title>Arandu fixture</title><img loading="lazy" src="/valid.svg">');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>');
  let corrupt = false, apiRequests = 0;
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) apiRequests++;
    res.setHeader('content-type', req.url === '/valid.svg' ? 'image/svg+xml' : 'text/html');
    res.end(req.url === '/valid.svg' ? (corrupt ? Buffer.from('tampered image') : svg) : html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const context = await browser.newContext();
  try {
    const base = new URL(`http://127.0.0.1:${server.address().port}`);
    const files = Object.fromEntries([['/index.html', html], ['/valid.svg', svg]].map(([p, bytes]) => [p, { bytes: bytes.length, sha256: digest(bytes) }]));
    const errors = [];
    await context.route('**/*', async route => {
      try { await relayPublicArtifact(route, base, files); }
      catch (error) { errors.push(error); await route.abort(); }
    });
    const live = await context.newPage();
    await live.goto(base.href, { waitUntil: 'networkidle' });
    assert.equal((await inspectRenderedLayout(live)).images[0].width, 8);
    assert.equal(await live.evaluate(async () => {
      try { await fetch('/api/finance/rfqs', { method: 'POST' }); return true; } catch { return false; }
    }), false);
    assert.equal(apiRequests, 0, 'mutation must not reach the origin');
    assert(errors.some(e => /Unexpected backend/.test(e.message)));
    corrupt = true;
    await live.reload({ waitUntil: 'networkidle' });
    assert(errors.some(e => /Artifact mismatch/.test(e.message)), 'origin tampering must block delivery');
    await assert.rejects(inspectRenderedLayout(live), e => e.code === 'ASSET_MISMATCH');
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
  console.log(`Publication keyboard: real Tab/Enter, tabindex=-1 and focus trap passed; Chromium ${browser.version()}.`);
} finally { await browser.close(); }

// Laboratory regression only. Never certifies a public deployment.
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { digest } from './publication-manifest.mjs';
import { STAGES } from './publication-proof.mjs';

const dir = mkdtempSync(join(tmpdir(), 'arandu-browser-proof-'));
const sha = 'a'.repeat(40);
const steps = STAGES.map((stage, i) => ({ stage, path: i === 0 || i === STAGES.length - 1 ? '/' : `/${stage}.html`, text: 'Arandu demonstração', ...(i ? { selector: '#next' } : {}) }));
const pages = Object.fromEntries(steps.slice(0, -1).map((s, i) => [s.path === '/' ? '/index.html' : s.path, Buffer.from(`<html><head><meta charset="utf-8"><title>Arandu</title></head><body><h1>Arandu demonstração</h1><p>Dados fictícios</p><a id="next" href="${steps[i + 1].path}">Avançar</a></body></html>`)]));
pages['/demo/index.html'] = pages['/index.html']; pages['/entry.js'] = Buffer.from('// synthetic laboratory asset');
const files = Object.fromEntries(Object.entries(pages).map(([p, b]) => [p, { sha256: digest(b), bytes: b.length }]));
const manifest = { schema: 1, application: 'arandu', commit: sha, branch: 'main', modality: 'browser-sandbox', datasource: 'synthetic-fixtures', backend_required: false, canonical_hosted_m3: 'BLOCKED', files };
const server = http.createServer((req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url;
  if (p === '/arandu-build.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(manifest)); }
  else if (pages[p]) { res.setHeader('Content-Type', p.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(pages[p]); }
  else { res.statusCode = 404; res.end(); }
});
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const flow = join(dir, 'flow.json'); writeFileSync(flow, JSON.stringify({ approved_sha: sha, steps }));
  await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL('./smoke-public-demo.mjs', import.meta.url)), `--url=http://127.0.0.1:${server.address().port}`, `--sha=${sha}`, '--local', '--browser', '--performance', `--flow=${flow}`], { cwd: dir, env: { ...process.env, HTTPS_PROXY: '', https_proxy: '' } }));
  const result = JSON.parse(readFileSync(join(dir, 'reports/public-demo/proof.json')));
  assert.equal(result.HTTP_ARTIFACT, 'PASS', result.error);
  assert.equal(result.BROWSER_DESKTOP, 'PASS', result.error);
  assert.equal(result.BROWSER_MOBILE, 'PASS', result.error);
  assert.equal(result.PUBLIC_SHAREABLE, 'NOT_PROVEN');
  assert.equal(result.performance.kind, 'LAB_NOT_RUM');
  assert.equal(result.performance.samples.length, 30);
  for (const sample of result.performance.samples) {
    assert.equal(sample.inp, 'NOT_MEASURED');
    assert.equal(sample.p75, 'NOT_ESTIMATED_SINGLE_NAVIGATION');
    assert.ok(sample.navigation && sample.navigation.ttfb_ms >= 0);
  }
  // A navigation failure must name the attempted stage and viewport; NOT_RUN
  // is reserved for the viewport that was never reached.
  steps[1].selector = '#missing';
  writeFileSync(flow, JSON.stringify({ approved_sha: sha, steps }));
  await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL('./smoke-public-demo.mjs', import.meta.url)), `--url=http://127.0.0.1:${server.address().port}`, `--sha=${sha}`, '--local', '--browser', `--flow=${flow}`], { cwd: dir }));
  const failed = JSON.parse(readFileSync(join(dir, 'reports/public-demo/proof.json')));
  assert.equal(failed.HTTP_ARTIFACT, 'PASS');
  assert.equal(failed.BROWSER_DESKTOP, 'FAIL');
  assert.equal(failed.BROWSER_MOBILE, 'NOT_RUN');
  assert.equal(failed.PUBLIC_SHAREABLE, 'FAIL');
  assert(failed.checks.some(c => c.viewport === 'DESKTOP' && c.stage === 'explore' && c.path === '/explore.html' && c.result === 'FAIL'));
  console.log('Local browser regression PASS: 15 stages, desktop/mobile, reloads, verified bytes; PUBLIC_SHAREABLE remains NOT_PROVEN.');
} finally { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); }

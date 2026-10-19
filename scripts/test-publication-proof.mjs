import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { digest, assertPublicBytes, writePublicationManifest } from './publication-manifest.mjs';
import { validateManifest, verifyResponse, getPublic, validateFlow } from './publication-proof.mjs';

const sha = 'a'.repeat(40);
const env = { ARANDU_DEPLOYMENT_KIND: 'demo', VERCEL: '1', VERCEL_GIT_COMMIT_SHA: sha, VERCEL_GIT_COMMIT_REF: 'main' };
function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'arandu-publication-'));
  try {
    mkdirSync(join(dir, 'demo')); mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<title>Arandu</title>');
    writeFileSync(join(dir, 'demo/index.html'), '<title>Arandu Demo</title>');
    writeFileSync(join(dir, 'assets/entry.js'), 'console.log("synthetic")');
    fn(dir);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('build inventory binds actual bytes to full deployment SHA, with no server readiness', () => fixture(dir => {
  const m = writePublicationManifest(dir, env); validateManifest(m, sha);
  assert.equal(m.files['/assets/entry.js'].sha256, digest(Buffer.from('console.log("synthetic")')));
  assert.equal(m.canonical_hosted_m3, 'BLOCKED');
  assert.throws(() => validateManifest({ ...m, commit: 'b'.repeat(40) }, sha));
  assert.throws(() => validateManifest({ ...m, modality: 'ready' }, sha));
  assert.throws(() => validateManifest({ ...m, backend_required: true }, sha));
  assert.throws(() => validateManifest({ ...m, files: {} }, sha));
  assert.throws(() => validateManifest({ status: 'READY' }, sha));
  assert.throws(() => validateManifest({ status: 'alive' }, sha));
}));
test('static build refuses missing hosted identity, real credentials and contradictory modes', () => fixture(dir => {
  for (const extra of [{ VERCEL_GIT_COMMIT_SHA: '' }, { ARANDU_ENV: 'production' }, { ARANDU_ENV: 'demo' }, { SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-secret' }]) assert.throws(() => writePublicationManifest(dir, { ...env, ...extra }));
  assert.equal(writePublicationManifest(dir, { ARANDU_ENV: 'production' }), undefined);
}));
test('private credentials and private artifacts fail closed', () => fixture(dir => {
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  assert.throws(() => assertPublicBytes(Buffer.from(`eyJ0ZXN0IjoxfQ.${payload}.signature`)));
  writeFileSync(join(dir, 'assets/password.js'), 'const leaked="synthetic-demo-password";');
  assert.throws(() => writePublicationManifest(dir, { ...env, ARANDU_DEMO_PASSWORD: 'synthetic-demo-password' }));
  rmSync(join(dir, 'assets/password.js'));
  writeFileSync(join(dir, '.env'), 'synthetic-secret');
  assert.throws(() => writePublicationManifest(dir, env));
}));
test('404, protection HTML, wrong MIME and stale bytes cannot pass', () => {
  const html = Buffer.from('<title>Arandu</title>');
  const response = new Response(html, { headers: { 'Content-Type': 'text/html' } });
  verifyResponse(response, html, '/index.html', { bytes: html.length, sha256: digest(html) });
  for (const status of [404, 500, 401, 403]) assert.throws(() => verifyResponse(new Response(html, { status }), html, '/index.html'));
  assert.throws(() => verifyResponse(response, Buffer.from('<title>Authentication Required</title>'), '/index.html'), /blocked/);
  assert.throws(() => verifyResponse(response, html, '/assets/entry.js'));
  assert.throws(() => verifyResponse(response, html, '/index.html', { bytes: html.length, sha256: '0'.repeat(64) }));
});
test('redirects cannot escape hosting or loop, including protocol-relative Location', async () => {
  const base = new URL('https://arandu-demo.vercel.app');
  for (const location of ['https://example.com', '//vercel.com/login', '/']) {
    await assert.rejects(() => getPublic(base, '/', async () => new Response(null, { status: 302, headers: { Location: location } })), /Off-origin|loop/);
  }
  await assert.rejects(() => getPublic(base, '/', async () => { throw new Error('ECONNREFUSED'); }));
});
test('unreviewed or incomplete UI journeys cannot prove the approved experience', () => {
  assert.throws(() => validateFlow({ approved_sha: sha, steps: [] }, sha));
  assert.throws(() => validateFlow({ approved_sha: 'b'.repeat(40), steps: [] }, sha));
});
test('CLI verifies served bytes and refuses PUBLIC_SHAREABLE for localhost or missing routes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'arandu-public-http-'));
  const html = Buffer.from('<title>Arandu demonstração</title>');
  const js = Buffer.from('console.log("demo")');
  const files = Object.fromEntries(['/index.html', '/demo/index.html', '/entry.js'].map(p => [p, { bytes: p.endsWith('.js') ? js.length : html.length, sha256: digest(p.endsWith('.js') ? js : html) }]));
  let missing = false;
  const server = http.createServer((req, res) => {
    const p = req.url === '/' ? '/index.html' : req.url;
    if (p === '/arandu-build.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ schema: 1, application: 'arandu', commit: sha, branch: 'main', modality: 'browser-sandbox', datasource: 'synthetic-fixtures', backend_required: false, canonical_hosted_m3: 'BLOCKED', files })); }
    else if (!files[p] || (missing && p === '/demo/index.html')) { res.statusCode = 404; res.end(); }
    else { res.setHeader('Content-Type', p.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(p.endsWith('.js') ? js : html); }
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const run = async () => {
      await assert.rejects(promisify(execFile)(process.execPath, [fileURLToPath(new URL('./smoke-public-demo.mjs', import.meta.url)), `--url=http://127.0.0.1:${server.address().port}`, `--sha=${sha}`, '--local'], { cwd: dir }));
      return JSON.parse(readFileSync(join(dir, 'reports/public-demo/proof.json'), 'utf8'));
    };
    const local = await run();
    assert.equal(local.HTTP_ARTIFACT, 'PASS'); assert.equal(local.PUBLIC_SHAREABLE, 'NOT_PROVEN'); assert.equal(local.CANONICAL_HOSTED_M3, 'BLOCKED');
    missing = true;
    const broken = await run(); assert.equal(broken.PUBLIC_SHAREABLE, 'FAIL'); assert.match(broken.error, /404/);
  } finally { await new Promise(resolve => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); }
});

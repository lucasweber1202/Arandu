#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { PAGES } from './generate-finance-pages.mjs';
import { hermeticEnv } from './run-hermetic.mjs';

const routes = ['index.html', 'login.html', ...PAGES.map(page => page.path)];
function inventory(root, prefix = '') {
  return readdirSync(join(root, prefix), { withFileTypes: true }).flatMap(entry => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error('artifact_symlink');
    return entry.isDirectory() ? inventory(root, path) : [path];
  });
}
function snapshot(root) {
  const files = inventory(root);
  return { routes: routes.filter(path => existsSync(join(root, path))), sandbox: files.some(path => path.startsWith('demo/')),
    entrypoints: Object.fromEntries(routes.filter(path => existsSync(join(root, path))).map(path => [path,
      [...readFileSync(join(root, path), 'utf8').matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g)].map(match => match[1]).sort()])),
    assets: Object.fromEntries(files.filter(path => /\.(js|css)$/.test(path)).sort().map(path => [path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex')])) };
}
function verify(demo, production) {
  assert.equal(demo.sandbox || production.sandbox, false, 'canonical_build_contains_sandbox');
  assert.deepEqual(demo.routes, routes, 'demo_route_missing');
  assert.deepEqual(production.routes, routes, 'production_route_missing');
  assert.deepEqual(demo.entrypoints, production.entrypoints, 'canonical_route_entrypoints_diverged');
  assert.ok(Object.keys(demo.assets).length, 'assets_missing');
  assert.deepEqual(demo.assets, production.assets, 'canonical_assets_diverged');
}
function run(args, env) {
  const result = spawnSync(process.execPath, args, { env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`canonical_build_failed:${args[0]}:${result.status}\n${result.stderr || ''}`);
}

// Negative contracts use the exact artifact comparator, without redundant builds.
const fixture = { routes, sandbox: false, entrypoints: { 'login.html': ['/assets/app.js'] }, assets: { 'assets/app.js': 'abc', 'assets/app.css': 'def' } };
verify(fixture, fixture);
for (const broken of [
  { ...fixture, sandbox: true }, { ...fixture, routes: routes.slice(1) },
  { ...fixture, assets: {} }, { ...fixture, assets: { ...fixture.assets, 'assets/app.js': 'changed' } },
  { ...fixture, entrypoints: { 'login.html': ['/assets/other.js'] } }
]) assert.throws(() => verify(broken, fixture));
assert.throws(() => run(['-e', 'process.exit(7)'], hermeticEnv()), /canonical_build_failed/);

const temporary = mkdtempSync(join(tmpdir(), 'arandu-canonical-parity-'));
try {
  const builds = {};
  for (const environment of ['demo', 'production']) {
    const output = join(temporary, environment);
    const env = { ...hermeticEnv(), ARANDU_ENV: environment, ARANDU_SITE_URL: `https://${environment}.example.invalid` };
    run(['node_modules/vite/bin/vite.js', 'build', '--outDir', output, '--emptyOutDir'], env);
    run(['scripts/copy-runtime-assets.mjs', '--output-dir', output], env);
    builds[environment] = snapshot(output);
  }
  verify(builds.demo, builds.production);
  const source = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  assert.equal(source.status, 0, 'source_identity_unavailable');
  assert.match(source.stdout.trim(), /^[a-f0-9]{40}$/);
  console.log(JSON.stringify({ outcome: 'LOCAL_VALIDATED', check: 'canonical_build_parity', routes: routes.length,
    source_sha: source.stdout.trim(), identical_js_css: Object.keys(builds.demo.assets).length, hosted: 'NOT_RUN', note: 'Source/build proof only; no datasource, Auth, Storage or hosted attestation.' }));
} finally {
  // Cleanup failure is a failing check, never a successful rehearsal.
  rmSync(temporary, { recursive: true, force: true });
  assert.equal(existsSync(temporary), false, 'canonical_build_teardown_failed');
}

import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

// A disposable module tree models a future approved assignment. Operational
// topology is never changed, and all dependency requests remain synthetic.
const dir = mkdtempSync(join(tmpdir(), 'arandu-demo-readiness-test-'));
try {
  cpSync(new URL('../lib', import.meta.url), join(dir, 'lib'), { recursive: true });
  const topology = join(dir, 'lib/deployment-topology.mjs');
  const ref = 'abcdefghijklmnopqrst';
  const source = readFileSync(topology, 'utf8');
  assert.ok(source.includes('demo: Object.freeze([])'));
  writeFileSync(topology, source.replace('demo: Object.freeze([])', `demo: Object.freeze(['${ref}'])`));
  const { evaluateReadiness, resetReadinessCache } = await import(pathToFileURL(join(dir, 'lib/readiness.mjs')));
  const { REQUIRED_RPCS, EXPECTED_SCHEMA_VERSION } = await import(pathToFileURL(join(dir, 'lib/finance/pilot-doctor.mjs')));
  const { BASELINE_VERSION } = await import(pathToFileURL(join(dir, 'lib/finance/demo-workspaces.mjs')));
  const { DOCUMENT_MIME_TYPES, DOCUMENT_MAX_BYTES } = await import(pathToFileURL(join(dir, 'lib/finance/document-storage.mjs')));
  const env = { ARANDU_ENV: 'demo', SUPABASE_URL: `https://${ref}.supabase.co`, SUPABASE_ANON_KEY: 'synthetic-anon', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-server',
    CRON_SECRET: 'synthetic-cron', ARANDU_DEMO_PASSWORD: 'SyntheticOnlySecret9', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) };
  let pool = [{ status: 'ready', baseline_version: BASELINE_VERSION }], count = 0;
  const fetchImpl = async (url, options) => {
    count++; assert.equal(options.method, 'GET');
    const u = new URL(url);
    let data = u.pathname.endsWith('/health') ? { name: 'GoTrue' }
      : u.pathname.endsWith('/settings') ? { external: { email: true }, mailer_autoconfirm: false }
      : u.pathname.includes('/bucket/') ? { id: 'fin-documents', public: false, file_size_limit: DOCUMENT_MAX_BYTES, allowed_mime_types: Object.keys(DOCUMENT_MIME_TYPES) }
      : u.pathname.endsWith('/fin_demo_workspaces') ? pool
      : u.searchParams.get('key') === 'eq.schema_version' ? [{ value: EXPECTED_SCHEMA_VERSION }]
      : u.searchParams.get('key') === 'eq.deployment_environment' ? [{ value: 'demo' }]
      : { definitions: {}, paths: Object.fromEntries(REQUIRED_RPCS.map(rpc => [`/rpc/${rpc}`, {}])) };
    if (u.pathname.endsWith('/fin_demo_workspaces')) {
      assert.equal(options.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
      assert.equal(u.searchParams.get('select'), 'status,baseline_version');
      assert.equal(u.searchParams.get('status'), 'eq.ready');
      if (typeof pool === 'number') return new Response(null, { status: pool });
    }
    return new Response(JSON.stringify(data));
  };
  assert.equal((await evaluateReadiness({ env, fetchImpl, now: 1000 })).ready, true);
  assert.equal(count, 7);
  // Secret rotation invalidates a cached GO, even when the env object is reused.
  env.ARANDU_DEMO_PASSWORD = '';
  assert.equal((await evaluateReadiness({ env, fetchImpl, now: 1001 })).ready, false);
  env.ARANDU_DEMO_PASSWORD = 'SyntheticOnlySecret9';
  for (pool of [[], null, [{ status: 'ready', baseline_version: 'obsolete' }], 403, 503]) {
    resetReadinessCache();
    const result = await evaluateReadiness({ env, fetchImpl });
    assert.equal(result.ready, false);
    assert.notEqual(result.checks.find(check => check.name === 'demo_workspaces').outcome, 'PASS');
    assert.doesNotMatch(JSON.stringify(result), /synthetic-server|SyntheticOnlySecret9/);
  }
  console.log('Demo readiness: approved-target fixture, current pool, unavailable capacity, stale baseline, access failure and secret rotation fail closed; no hosted mutation.');
} finally { rmSync(dir, { recursive: true, force: true }); }

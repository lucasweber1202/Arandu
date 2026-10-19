import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { diagnoseHostedInfrastructure, observePublishedReadiness } from './hosted-infrastructure-doctor.mjs';
import { currentCleanInstallDigest } from './current-migration-bundle.mjs';

const commit = 'a'.repeat(40), now = new Date('2026-10-19T17:00:00Z');
const secret = 'PRIVATE-DO-NOT-PRINT-0123456789';
const context = { environment: 'demo', commit, now };
const row = (report, id) => report.checks.find(check => check.id === id);
const report = diagnoseHostedInfrastructure(context);
assert.equal(report.result, 'BLOCKED');
assert.equal(report.executes_mutation, false);
assert.equal(report.release_ready, false);
assert.equal(report.cutover_authorized, false);
assert.equal(report.evidence_origin_authenticated, false);
assert.equal(row(report, 'active_database_assignment').result, 'BLOCKED');
assert.equal(row(report, 'published_readiness').result, 'NOT_RUN');
for (const check of report.checks) {
  for (const key of ['id', 'environment', 'category', 'severity', 'result', 'evidence', 'dependency', 'next_action', 'owner', 'authorization_required', 'automatic_safe']) assert.ok(Object.hasOwn(check, key), key);
  assert.ok(['PASS', 'FAIL', 'BLOCKED', 'NOT_RUN', 'NOT_PROVEN', 'ACCESS_BLOCKED'].includes(check.result));
}
const observation = { environment: 'demo', project: 'arandu-demo', commit, observed_at: now.toISOString(), http_status: 403, password: secret };
const blocked = diagnoseHostedInfrastructure({ ...context, vercelObservation: observation });
assert.equal(row(blocked, 'vercel_inspection').result, 'ACCESS_BLOCKED');
for (const change of [{ commit: 'b'.repeat(40) }, { project: 'arandu' }, { environment: 'production' }, { observed_at: '2026-10-17T17:00:00Z' }, { observed_at: '2026-10-20T17:00:00Z' }]) {
  assert.equal(row(diagnoseHostedInfrastructure({ ...context, vercelObservation: { ...observation, ...change } }), 'vercel_inspection').result, 'NOT_PROVEN');
}
const release = { environment: 'demo', mode: 'demo', datasource: 'supabase', misconfigured: false, branch: 'main', commit };
const ready = { ...observation, http_status: 200, payload: { ok: true, service: 'arandu-api', status: 'ready', release } };
assert.equal(row(diagnoseHostedInfrastructure({ ...context, healthObservation: ready }), 'published_readiness').result, 'PASS');
for (const payload of [
  { ok: true, service: 'arandu-api', status: 'alive', release },
  { ...ready.payload, release: { ...release, datasource: 'synthetic-fixtures' } },
  { ...ready.payload, release: { ...release, commit: 'b'.repeat(40) } },
  { ...ready.payload, password: secret }
]) assert.equal(row(diagnoseHostedInfrastructure({ ...context, healthObservation: { ...ready, payload } }), 'published_readiness').result, 'FAIL');
assert.equal(row(diagnoseHostedInfrastructure({ ...context, healthObservation: { ...ready, observed_at: '2026-10-19T16:54:59Z' } }), 'published_readiness').result, 'NOT_PROVEN');
assert.equal(row(diagnoseHostedInfrastructure({ ...context, healthObservation: { ...ready, http_status: 503 } }), 'published_readiness').result, 'FAIL');
assert.equal(row(diagnoseHostedInfrastructure({ ...context, healthObservation: { ...ready, http_status: 403 } }), 'published_readiness').result, 'ACCESS_BLOCKED');
assert.equal(row(diagnoseHostedInfrastructure({ ...context, healthObservation: { ...ready, http_status: 0 } }), 'published_readiness').result, 'NOT_PROVEN');
assert.equal(row(diagnoseHostedInfrastructure({ ...context, environment: 'production', candidate: {} }), 'hosted_release_candidate').result, 'NOT_PROVEN');
for (const environment of ['pilot', '__proto__', undefined]) assert.equal(row(diagnoseHostedInfrastructure({ ...context, environment }), 'assessment_context').result, 'FAIL');
assert.doesNotMatch(JSON.stringify(blocked), new RegExp(secret));
assert.doesNotMatch(JSON.stringify(diagnoseHostedInfrastructure({ ...context, inventory: { password: secret }, candidate: { token: secret }, healthObservation: { ...ready, payload: { password: secret } } })), new RegExp(secret));

let calls = 0;
const fetchImpl = async (url, options) => {
  calls++;
  assert.equal(url, 'https://arandu-demo.vercel.app/api/health?probe=ready');
  assert.equal(options.method, 'GET');
  assert.equal(options.redirect, 'manual');
  assert.equal(options.headers.Authorization, undefined);
  return new Response(JSON.stringify(ready.payload), { status: 200 });
};
assert.equal((await observePublishedReadiness('https://arandu-demo.vercel.app', { ...context, fetchImpl })).http_status, 200);
for (const site of [`https://u:${secret}@arandu-demo.vercel.app`, `https://arandu-demo.vercel.app/?token=${secret}`, 'http://localhost', 'https://127.0.0.1', 'https://arandu-demo.vercel.app/path']) {
  const result = await observePublishedReadiness(site, { ...context, fetchImpl });
  assert.equal(result.http_status, 0);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
}
assert.equal(calls, 1, 'invalid targets must not cause a request');
assert.equal((await observePublishedReadiness('https://arandu-demo.vercel.app', { ...context, fetchImpl: async () => { throw Error(secret); } })).http_status, 0);
assert.equal((await observePublishedReadiness('https://arandu-demo.vercel.app', { ...context, fetchImpl: async () => new Response('x'.repeat(65537)) })).payload, null);
assert.equal(currentCleanInstallDigest({ run: () => ({ status: 1, stderr: secret }) }), null);
assert.match(currentCleanInstallDigest(), /^[a-f0-9]{64}$/);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arandu-hosted-doctor-'));
try {
  const invalid = path.join(dir, 'secret-file.json');
  fs.writeFileSync(invalid, secret);
  for (const args of [[], ['--environment=demo', `--commit=${commit}`], ['--environment=demo', `--commit=${commit}`, `--evidence=${invalid}`], ['--environment=demo', '--environment=production', `--commit=${commit}`]]) {
    const result = spawnSync(process.execPath, ['scripts/hosted-infrastructure-doctor.mjs', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, SUPABASE_SERVICE_ROLE_KEY: secret } });
    assert.equal(result.status, 1);
    assert.equal(JSON.parse(result.stdout).result, 'BLOCKED');
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(secret));
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log('Hosted doctor: existing contracts, current-bundle binding, SHA/freshness, no liveness/fixture GO, no mutation and redaction verified.');

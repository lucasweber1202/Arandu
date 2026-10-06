import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sourceConnection, assessBackup, runBackupPreflight, PILOT_REF, HOSTED_DRILL_IMAGE } from '../lib/pilot-backup-preflight.mjs';

const secret = 'fixture-secret-never-report';
const direct = `postgresql://postgres:${secret}@db.${PILOT_REF}.supabase.co:5432/postgres`;
const pooler = `postgresql://postgres.${PILOT_REF}:${secret}@aws-1-sa-east-1.pooler.supabase.com:5432/postgres`;
assert.equal(sourceConnection(direct).mode, 'direct');
assert.equal(sourceConnection(pooler).mode, 'session_pooler');
assert.equal(sourceConnection(direct).env.PGOPTIONS, '-c default_transaction_read_only=on -c statement_timeout=10000');
for (const url of [undefined, 'invalid', direct.replace(PILOT_REF, 'legacy'), pooler.replace('5432', '6543'), direct + '?sslmode=disable', direct + '?host=evil', direct.replace('/postgres', '/other'), 'postgresql://postgres:pw@localhost/postgres']) {
  assert.throws(() => sourceConnection(url));
}
assert.equal(sourceConnection('postgresql://postgres:pw@localhost/postgres', { local: true }).mode, 'local');
const state = { server_major: 17, schema_version: 'financial-surface-hardening-1', storage_objects: 0, mfa_factors: 0, auth_policies: 0 };
const env = { PILOT_SOURCE_DATABASE_URL: direct };
let calls = [];
const fake = (overrides = {}, failure = null) => (binary, args, options) => {
  calls.push({ binary, args, options });
  if (binary === failure) return { status: 1, stderr: secret };
  if (args.includes('--version')) return { status: 0, stdout: `${binary} (PostgreSQL) 17.6` };
  if (binary === 'docker') return { status: 0, stdout: '28.0.0' };
  return { status: 0, stdout: JSON.stringify({ ...state, ...overrides }) };
};
for (const schema_version of ['financial-passport-entities-1','financial-graph-1','financial-policy-engine-1','financial-public-api-1','financial-sso-1','financial-operational-resilience-1','financial-data-governance-1','financial-legacy-art-decommission-1','financial-p0-closure-1','financial-value-realization-1','financial-fee-intelligence-1','financial-opportunity-engine-1','financial-document-intelligence-1','financial-provider-qualification-1','financial-implementation-1','financial-covenants-1','financial-provider-performance-1','financial-spend-intelligence-1']) assert.equal(runBackupPreflight({env,run:fake({schema_version})}).result,'ready');
const ready = runBackupPreflight({ env, run: fake() });
assert.equal(ready.result, 'ready');
assert.equal(ready.backup, 'NOT RUN');
assert.equal(ready.restore, 'NOT RUN');
assert.equal(ready.image, HOSTED_DRILL_IMAGE);
const probe = calls.find(c => c.binary === 'psql' && !c.args.includes('--version'));
assert(!probe.args.join(' ').includes(secret));
assert.equal(probe.options.env.PGPASSWORD, secret);
assert(probe.options.env.PGOPTIONS.includes('read_only=on'));
for (const changes of [{ storage_objects: 1 }, { mfa_factors: 1 }, { auth_policies: 1 }, { server_major: 15 }, { schema_version: null }, { schema_version: 'financial-unknown-1' }, { storage_objects: null }, { server_major: '17' }]) {
  assert.equal(runBackupPreflight({ env, run: fake(changes) }).result, 'blocked');
}
for (const binary of ['psql', 'pg_dump', 'pg_restore', 'docker']) {
  calls = [];
  const blocked = runBackupPreflight({ env, run: fake({}, binary) });
  assert.equal(blocked.result, 'blocked');
  assert(!calls.some(c => c.args.includes('-c')), 'No query when dependency fails');
  assert(!JSON.stringify(blocked).includes(secret));
}
const badImage = runBackupPreflight({ env: { ...env, PILOT_DRILL_DB_IMAGE: `image:${secret}` }, run: fake() });
assert.equal(badImage.result, 'blocked');
assert(!JSON.stringify(badImage).includes(secret));
assert(assessBackup({ sourceMajor: 17, dumpMajor: 15, restoreMajor: 15, image: HOSTED_DRILL_IMAGE, storageObjects: 0, mfaFactors: 0, authPolicies: 0 }).some(c => !c.ok));
// Real subprocess: source URI/password stay out of argv and error output.
const dir = mkdtempSync(path.join(tmpdir(), 'arandu-client-test-'));
try {
  const capture = path.join(dir, 'capture.json');
  writeFileSync(path.join(dir, 'psql'), `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(process.env.CAPTURE, JSON.stringify({args:process.argv.slice(2),host:process.env.PGHOST,password:process.env.PGPASSWORD,options:process.env.PGOPTIONS}));\nconsole.error(process.env.PGPASSWORD);process.exit(1);\n`, { mode: 0o700 });
  const result = spawnSync(process.execPath, ['scripts/pilot-db-client.mjs', 'psql', '-c', 'select 1'], { encoding: 'utf8', env: { ...process.env, ...env, PATH: dir + path.delimiter + process.env.PATH, CAPTURE: capture } });
  assert.equal(result.status, 1);
  assert(!result.stderr.includes(secret));
  const captured = JSON.parse(readFileSync(capture));
  assert.deepEqual(captured.args, ['-c', 'select 1']);
  assert.equal(captured.password, secret);
  assert.equal(captured.host, `db.${PILOT_REF}.supabase.co`);
  const drillRoot = path.join(dir, 'isolated-drill');
  for (const folder of ['scripts', 'lib', 'reports']) mkdirSync(path.join(drillRoot, folder), { recursive: true });
  for (const file of ['scripts/pilot-restore-drill.sh', 'scripts/pilot-backup-preflight.mjs', 'lib/pilot-backup-preflight.mjs']) copyFileSync(file, path.join(drillRoot, file));
  writeFileSync(path.join(drillRoot, 'reports/pilot-restore-drill.json'), '{"result":"passed"}');
  const refusal = spawnSync('bash', [path.join(drillRoot, 'scripts/pilot-restore-drill.sh')], { encoding: 'utf8', env: { ...process.env, PILOT_SOURCE_DATABASE_URL: 'postgresql://postgres:pw@legacy.supabase.co/postgres' } });
  assert.equal(refusal.status, 1);
  assert(refusal.stdout.includes('source_identity'));
  assert(!refusal.stdout.includes('legacy.supabase.co'));
  assert(!existsSync(path.join(drillRoot, 'reports/pilot-restore-drill.json')), 'A stale PASS must not survive a blocked attempt');
} finally { rmSync(dir, { recursive: true, force: true }); }
console.log('Pilot backup preflight: identity, TLS, scope, major versions, fail-closed execution and credential redaction passed.');

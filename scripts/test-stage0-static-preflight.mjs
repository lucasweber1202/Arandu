import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { inspectStaticStage0 } from './stage0-static-preflight.mjs';

const current = inspectStaticStage0();
assert.equal(current.schema_version, 1);
assert.equal(current.scope, 'repository-topology-only');
assert.equal(current.release_ready, false);
assert.deepEqual(current.environments.map(x => x.environment), ['demo', 'production']);
assert.ok(current.environments.every(x => x.static_status === 'BLOCKED'));
assert.ok(current.environments.every(x => x.reason_codes.includes('NO_APPROVED_DATABASE')));
assert.ok(current.environments.every(x => x.reason_codes.includes('PLANNED_SOURCE_STILL_ASSIGNED_TO_OLD_ROLE')));

const isolated = inspectStaticStage0({
  assignments: { demo: ['demo-isolated'], production: ['prod-isolated'], pilot: [], legacy: [] },
  targets: { demo: { sourceRef: 'oldpilot', sourceKind: 'pilot' }, production: { sourceRef: 'oldlegacy', sourceKind: 'legacy' } }
});
assert.ok(isolated.environments.every(x => x.static_status === 'ASSIGNMENT_REGISTERED'));
assert.equal(isolated.release_ready, false, 'Registered assignment does not prove release readiness');

const shared = inspectStaticStage0({
  assignments: { demo: ['same'], production: ['same'], pilot: [], legacy: [] }, targets: {}
});
assert.ok(shared.environments.every(x => x.reason_codes.includes('SHARED_DATABASE_ASSIGNMENT')));

const ambiguous = inspectStaticStage0({
  assignments: { demo: ['d1', 'd2'], production: ['p1'], pilot: [], legacy: [] }, targets: {}
});
assert.ok(ambiguous.environments[0].reason_codes.includes('AMBIGUOUS_DATABASE_ASSIGNMENT'));

const token = 'top-secret-never-print-0112233445566778899';
const result = spawnSync(process.execPath, ['scripts/stage0-static-preflight.mjs', '--json', '--strict'], {
  encoding: 'utf8',
  env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: token, CRON_SECRET: token }
});
assert.equal(result.status, 1, 'Strict mode must report the existing Stage 0 block');
const parsed = JSON.parse(result.stdout);
assert.equal(parsed.release_ready, false);
assert.ok(!result.stdout.includes(token));
assert.ok(!result.stderr.includes(token));
console.log('Stage 0 static preflight: topology, safe output, strict mode and non-bypass tested.');

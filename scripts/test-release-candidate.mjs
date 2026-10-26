import { assessDecommission } from '../lib/consolidation-readiness.mjs';
import assert from 'node:assert/strict';
import { assessReleaseCandidate, PILOT_JOURNEY_STEPS, PILOT_CANARY_PROBES, PILOT_CI_GATES, HOSTED_READINESS_CHECKS } from '../lib/finance/pilot-release.mjs';
import { EXPECTED_SCHEMA_VERSION } from '../lib/finance/pilot-doctor.mjs';
const commit = 'a'.repeat(40);
const now = new Date('2026-10-04T18:00:00Z');
const base = { environment: 'demo', project_ref: 'offgpyysgdhfemjlchod', commit, evidence_level: 'hosted', reference: 'fixture:proof', observed_at: '2026-10-04T17:00:00Z', schema_version: EXPECTED_SCHEMA_VERSION };
const e = {
  format_version: 3, environment: 'demo', project_ref: base.project_ref, database_hostname: `db.${base.project_ref}.supabase.co`, vercel_project: 'arandu-demo', commit,
  ci: { commit, evidence_level: 'ci', reference: 'fixture:ci-run', observed_at: base.observed_at, gates: Object.fromEntries(PILOT_CI_GATES.map(name => [name, 'success'])) },
  schema_before: 'financial-surface-hardening-1', schema_after: EXPECTED_SCHEMA_VERSION,
  deployment: { ...base, project: 'arandu-demo', branch: 'main', target: 'production', state: 'READY' },
  backup: { ...base, result: 'PASS', sha256: 'b'.repeat(64), schema_version: 'financial-surface-hardening-1', observed_at: '2026-10-04T15:00:00Z' },
  restore: { ...base, result: 'PASS', target_kind: 'disposable', schema_version: 'financial-surface-hardening-1', backup_sha256: 'b'.repeat(64), post_restore_probes: 'PASS', row_comparison: 'PASS', duration_ms: 1500, observed_at: '2026-10-04T16:00:00Z' },
  migration: { ...base, result: 'PASS', schema_before: 'financial-surface-hardening-1', schema_after: EXPECTED_SCHEMA_VERSION, bundle_sha256: 'c'.repeat(64), started_at: '2026-10-04T16:15:00Z', observed_at: '2026-10-04T16:30:00Z' },
  legacy_art_decommission: { environment: 'demo', project_ref: base.project_ref, export_verified: true, inventory_rows: 0, ack: 'export-verified:fixture:export', export_reference: 'fixture:export', owner_decision_reference: 'fixture:owner-decision', acknowledged_at: '2026-10-04T16:10:00Z' },
  doctor: { ...base, result: 'GO', errors: 0, unsafe: 0 },
  hosted_readiness: { ...base, result: 'PASS', ready: true, http_status: 200, datasource: 'supabase', checks: Object.fromEntries(HOSTED_READINESS_CHECKS.map(name => [name, 'PASS'])) },
  canary: { ...base, result: 'PASS', probes: Object.fromEntries(PILOT_CANARY_PROBES.map(name => [name, 'PASS'])) },
  authenticated_journey: { ...base, result: 'PASS', transport: 'real', steps: Object.fromEntries(PILOT_JOURNEY_STEPS.map(name => [name, 'PASS'])) },
  observability: { ...base, result: 'PASS', request_correlation: 'PASS', job_failure_detection: 'PASS', queue_backlog_detection: 'PASS' },
  operational_exercise: { ...base, result: 'PASS', owner_role: 'platform-operator', runbook_reference: 'fixture:runbook', incident_triage: 'PASS', support_handoff: 'PASS', rollback_forward_fix: 'PASS' },
  p0_blockers: []
};
e.stage = 'release_candidate'; e.deployment_environment = 'demo';
e.deployment.runtime = 'demo'; e.deployment.datasource = 'supabase';
e.demo_seed = { ...base, result: 'PASS', verification: 'PASS', reset: 'PASS', synthetic_only: true };
const assess = e => assessReleaseCandidate(e, { commit, now });
e.backup.schema_fingerprint_version = 1;
e.backup.snapshot_schema_sha256 = 'e'.repeat(64);
Object.assign(e.restore, { schema_fingerprint_version: 1, schema_reconciliation: 'MATCH', source_schema_sha256: 'e'.repeat(64), target_schema_sha256: 'e'.repeat(64) });
assert.equal(assess(e).result, 'RELEASE CANDIDATE GO');
const deny = change => { const next = structuredClone(e); change(next); assert.equal(assess(next).result, 'RELEASE CANDIDATE NO-GO'); };
for (const key of ['schema_fingerprint_version', 'snapshot_schema_sha256']) deny(e => { delete e.backup[key]; });
for (const key of ['schema_fingerprint_version', 'schema_reconciliation', 'source_schema_sha256', 'target_schema_sha256']) deny(e => { delete e.restore[key]; });
deny(e => { e.restore.target_schema_sha256 = 'f'.repeat(64); });
deny(e => { e.restore.source_schema_sha256 = e.restore.target_schema_sha256 = 'f'.repeat(64); });
for (const state of ['MISMATCH', 'NOT_RUN', 'ACCESS_BLOCKED', 'INCONCLUSIVE', 'PASS']) deny(e => { e.restore.schema_reconciliation = state; });
deny(e => { e.backup.schema_fingerprint_version = 2; });
deny(e => { e.restore.schema_fingerprint_version = '1'; });
for (const key of ['ci','deployment','backup','restore','migration','doctor','canary','authenticated_journey','observability','operational_exercise','demo_seed','hosted_readiness']) deny(e => { delete e[key]; });
for (const name of HOSTED_READINESS_CHECKS) for (const state of ['FAIL','BLOCKED','NOT_RUN','INCONCLUSIVE','ACCESS_BLOCKED', undefined]) deny(e => { e.hosted_readiness.checks[name] = state; });
for (const change of [{ ready: false }, { http_status: 503 }, { schema_version: 'financial-surface-hardening-1' },
  { commit: 'b'.repeat(40) }, { evidence_level: 'ci' }, { observed_at: '2026-10-04T16:20:00Z' }, { datasource: 'synthetic-fixtures' }]) deny(e => { Object.assign(e.hosted_readiness, change); });
deny(e => { e.hosted_readiness.checks.unexpected_component = 'FAIL'; });
for (const name of PILOT_CI_GATES) for (const state of ['failure','queued','pending','skipped','cancelled']) deny(e => { e.ci.gates[name] = state; });
for (const name of PILOT_JOURNEY_STEPS) deny(e => { delete e.authenticated_journey.steps[name]; });
for (const name of PILOT_CANARY_PROBES) deny(e => { e.canary.probes[name] = 'SKIPPED'; });
deny(e => { e.environment = 'pilot'; }); deny(e => { e.vercel_project = 'arandu-pilot'; });
deny(e => { e.project_ref = 'igacnfjeuqhxcmfyepgj'; });
deny(e => { e.format_version = 2; }); deny(e => { delete e.stage; });
deny(e => { e.deployment_environment = 'production'; });
deny(e => { e.deployment.datasource = 'synthetic-fixtures'; });
deny(e => { e.deployment.branch = 'pilot'; });
deny(e => { e.deployment.commit = 'd'.repeat(40); });
deny(e => { e.demo_seed.synthetic_only = false; });
deny(e => { e.demo_seed.reset = 'NOT RUN'; });
deny(e => { e.demo_seed.observed_at = '2026-10-04T16:20:00Z'; });
assert.equal(assessReleaseCandidate({}, { commit }).result, 'RELEASE CANDIDATE NO-GO');
console.log('Release candidate: full recovery, isolation, CI, real Demo seed/reset and operation proofs without permanent Pilot.');

const retirement = { release_candidate: e, dependencies: { complete: true, observed_at: base.observed_at, automations: [], official_aliases: [], scripts: [], deployments: [] }, rollback: { verified: true, reference: 'fixture:rollback' }, vercel_project: 'arandu-pilot', branch: 'pilot' };
const retire = input => assessDecommission(input, { commit, now });
assert.equal(retire(retirement).result, 'PREPARED');
for (const key of ['automations', 'official_aliases', 'scripts', 'deployments']) {
 const next = structuredClone(retirement); next.dependencies[key].push('pilot'); assert.equal(retire(next).result, 'BLOCKED');
 delete next.dependencies[key]; assert.equal(retire(next).result, 'BLOCKED');
}
const bad = structuredClone(retirement); bad.release_candidate.ci.gates.database = 'failure'; assert.equal(retire(bad).result, 'BLOCKED');
assert.equal(retire({}).executes_mutation, false);

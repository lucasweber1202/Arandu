import assert from 'node:assert/strict';
import { assessPilotRelease, PILOT_JOURNEY_STEPS, PILOT_CANARY_PROBES } from '../lib/finance/pilot-release.mjs';
import { EXPECTED_SCHEMA_VERSION } from '../lib/finance/pilot-doctor.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const commit = 'a'.repeat(40);
const now = new Date('2026-10-04T18:00:00Z');
const base = { environment: 'pilot', project_ref: 'offgpyysgdhfemjlchod', commit, evidence_level: 'hosted', reference: 'fixture:proof', observed_at: '2026-10-04T17:00:00Z', schema_version: EXPECTED_SCHEMA_VERSION };
const e = {
  format_version: 1, environment: 'pilot', project_ref: base.project_ref, database_hostname: `db.${base.project_ref}.supabase.co`, vercel_project: 'arandu-pilot', commit,
  schema_before: 'financial-surface-hardening-1', schema_after: EXPECTED_SCHEMA_VERSION,
  deployment: { ...base, project: 'arandu-pilot', branch: 'pilot', target: 'production', state: 'READY' },
  backup: { ...base, result: 'PASS', sha256: 'b'.repeat(64), schema_version: 'financial-surface-hardening-1', observed_at: '2026-10-04T15:00:00Z' },
  restore: { ...base, result: 'PASS', target_kind: 'disposable', schema_version: 'financial-surface-hardening-1', backup_sha256: 'b'.repeat(64), post_restore_probes: 'PASS', row_comparison: 'PASS', duration_ms: 1500, observed_at: '2026-10-04T16:00:00Z' },
  migration: { ...base, result: 'PASS', schema_before: 'financial-surface-hardening-1', schema_after: EXPECTED_SCHEMA_VERSION, bundle_sha256: 'c'.repeat(64), started_at: '2026-10-04T16:15:00Z', observed_at: '2026-10-04T16:30:00Z' },
  legacy_art_decommission: { environment: 'pilot', project_ref: base.project_ref, export_verified: true, inventory_rows: 0, ack: 'export-verified:fixture:export', export_reference: 'fixture:export', owner_decision_reference: 'fixture:owner-decision', acknowledged_at: '2026-10-04T16:10:00Z' },
  doctor: { ...base, result: 'GO', errors: 0, unsafe: 0 },
  canary: { ...base, result: 'PASS', probes: Object.fromEntries(PILOT_CANARY_PROBES.map(name => [name, 'PASS'])) },
  authenticated_journey: { ...base, result: 'PASS', transport: 'real', steps: Object.fromEntries(PILOT_JOURNEY_STEPS.map(name => [name, 'PASS'])) },
  p0_blockers: []
};
const assess = input => assessPilotRelease(input, { commit, now });
assert.equal(assess(e).result, 'PILOT GO'); // synthetic evidence tests only
assert.equal(assess({}).result, 'PILOT NO-GO');
const denied = change => { const next = structuredClone(e); change(next); assert.equal(assess(next).result, 'PILOT NO-GO'); };
for (const key of ['deployment', 'backup', 'restore', 'migration', 'doctor', 'canary', 'authenticated_journey']) {
  denied(x => { delete x[key]; });
  denied(x => { x[key].evidence_level = 'local'; });
  denied(x => { x[key].project_ref = 'igacnfjeuqhxcmfyepgj'; });
  denied(x => { x[key].commit = 'c'.repeat(40); });
  denied(x => { x[key].observed_at = '2026-10-05T17:00:00Z'; });
  denied(x => { x[key].observed_at = '2026-10-02T17:00:00Z'; });
  denied(x => { x[key].reference = 'postgresql://user:password@host'; });
}
for (const name of PILOT_JOURNEY_STEPS) denied(x => { delete x.authenticated_journey.steps[name]; });
for (const name of PILOT_CANARY_PROBES) denied(x => { x.canary.probes[name] = 'SKIPPED'; });
denied(x => { x.project_ref = 'igacnfjeuqhxcmfyepgj'; });
denied(x => { x.environment = 'production'; });
denied(x => { x.schema_after = 'financial-data-governance-1'; });
denied(x => { x.deployment.target = 'preview'; });
denied(x => { x.authenticated_journey.transport = 'demo'; });
denied(x => { x.restore.backup_sha256 = 'c'.repeat(64); });
denied(x => { x.restore.duration_ms = Infinity; });
denied(x => { x.restore.post_restore_probes = 'NOT RUN'; });
denied(x => { x.restore.row_comparison = 'NOT RUN'; });
denied(x => { x.restore.target_kind = 'pilot'; });
denied(x => { x.migration.started_at = '2026-10-04T15:00:00Z'; });
denied(x => { x.migration.bundle_sha256 = ''; });
denied(x => { x.migration.schema_after = 'financial-data-governance-1'; });
denied(x => { delete x.legacy_art_decommission; });
denied(x => { x.legacy_art_decommission.export_verified = false; });
denied(x => { x.legacy_art_decommission.inventory_rows = -1; });
denied(x => { x.legacy_art_decommission.ack = 'invented'; });
denied(x => { x.legacy_art_decommission.acknowledged_at = '2026-10-04T16:40:00Z'; });
denied(x => { x.doctor.observed_at = '2026-10-04T15:30:00Z'; });
denied(x => { x.p0_blockers.push('restore unavailable'); });
assert.equal(assessPilotRelease(e, { commit, now, maxAgeHours: 48 }).result, 'PILOT NO-GO');
const report = assess({ ...e, commit: 'postgresql://secret', p0_blockers: ['sb_secret_PRIVATE'] });
assert.doesNotMatch(JSON.stringify(report), /postgresql|sb_secret|PRIVATE/);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'arandu-pilot-release-'));
try {
  fs.mkdirSync(path.join(temp, 'reports'));
  const output = path.join(temp, 'reports/pilot-release.json');
  fs.writeFileSync(output, '{"result":"PILOT GO"}');
  fs.writeFileSync(path.join(temp, 'invalid.json'), '{"sb_secret_PRIVATE":');
  const cli = spawnSync(process.execPath, [path.resolve('scripts/check-pilot-release.mjs'), '--evidence=invalid.json', `--commit=${commit}`], { cwd: temp, encoding: 'utf8' });
  assert.equal(cli.status, 1);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).result, 'PILOT NO-GO');
  assert.doesNotMatch(cli.stdout + cli.stderr + fs.readFileSync(output, 'utf8'), /sb_secret|PRIVATE/);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
console.log('Pilot release gate: hosted identity, exact commit, freshness, restore, full journey and fail-closed redaction passed (fixtures only).');

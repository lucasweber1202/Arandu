import assert from 'node:assert/strict';
import { assessConversion, inventoryDigest } from '../lib/consolidation-readiness.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { currentCleanInstallDigest } from './current-migration-bundle.mjs';
const now = new Date('2026-10-07T16:00:00Z');
const input = { project_ref: 'offgpyysgdhfemjlchod', database_hostname: 'db.offgpyysgdhfemjlchod.supabase.co', destination: 'demo',
 inventory: { observed_at: '2026-10-07T13:00:00Z', complete: true, count_method: 'exact', sha256: 'a'.repeat(64), public_rows: 13, table_counts: [{ table_name: 'fin_settings', rows: 13 }], customer_rows: 0, personal_data_rows: 0, auth_users: 0, mfa_factors: 0, storage_objects: 0 },
 backup: { project_ref: 'offgpyysgdhfemjlchod', result: 'PASS', observed_at: '2026-10-07T14:00:00Z', sha256: 'b'.repeat(64), inventory_sha256: 'a'.repeat(64), reference: 'fixture:export', auth_storage_included: true },
 restore: { project_ref: 'offgpyysgdhfemjlchod', result: 'PASS', target_kind: 'disposable', observed_at: '2026-10-07T15:00:00Z', backup_sha256: 'b'.repeat(64), row_comparison: 'PASS', post_restore_probes: 'PASS' },
 plan: { clean_install: true, bundle_sha256: 'c'.repeat(64), legacy_preserved: true, rollback_reference: 'fixture:rollback' } };
input.inventory.sha256 = inventoryDigest(input.project_ref, input.inventory);
input.backup.inventory_sha256 = input.inventory.sha256;
const assess = e => assessConversion(e, { environment: 'demo', now, currentBundleSha256: 'c'.repeat(64) });
input.backup.schema_fingerprint_version = 1;
input.backup.snapshot_schema_sha256 = 'e'.repeat(64);
Object.assign(input.restore, { schema_fingerprint_version: 1, schema_reconciliation: 'MATCH', source_schema_sha256: 'e'.repeat(64), target_schema_sha256: 'e'.repeat(64) });
assert.equal(assess(input).result, 'PREPARED');
assert.equal(assessConversion(input, { environment: 'demo', now }).result, 'BLOCKED', 'missing current tree digest cannot prove a migration plan');
assert.equal(assessConversion(input, { environment: 'demo', now, currentBundleSha256: 'd'.repeat(64) }).result, 'BLOCKED', 'old bundle must not pass against the current tree');
const deny = change => { const e = structuredClone(input); change(e); assert.equal(assess(e).result, 'BLOCKED'); };
for (const key of ['schema_fingerprint_version', 'snapshot_schema_sha256']) deny(e => { delete e.backup[key]; });
for (const key of ['schema_fingerprint_version', 'schema_reconciliation', 'source_schema_sha256', 'target_schema_sha256']) deny(e => { delete e.restore[key]; });
deny(e => { e.restore.target_schema_sha256 = 'f'.repeat(64); });
deny(e => { e.restore.source_schema_sha256 = e.restore.target_schema_sha256 = 'f'.repeat(64); });
for (const state of ['MISMATCH', 'NOT_RUN', 'ACCESS_BLOCKED', 'INCONCLUSIVE', 'PASS']) deny(e => { e.restore.schema_reconciliation = state; });
for (const version of [0, 2, '1', null]) {
 deny(e => { e.backup.schema_fingerprint_version = version; });
 deny(e => { e.restore.schema_fingerprint_version = version; });
}
for (const placeholder of ['pending:verified-recovery', 'TODO:export', 'tbd', 'placeholder:rollback', 'NOT_RUN']) {
 deny(e => { e.backup.reference = placeholder; });
 deny(e => { e.plan.rollback_reference = placeholder; });
}
for (const key of ['inventory','backup','restore','plan']) deny(e => { delete e[key]; });
for (const key of ['customer_rows','personal_data_rows','auth_users','mfa_factors','storage_objects']) {
 deny(e => { e.inventory[key] = 1; }); deny(e => { delete e.inventory[key]; });
}
deny(e => { e.project_ref = 'igacnfjeuqhxcmfyepgj'; });
deny(e => { e.inventory.count_method = 'estimated'; });
deny(e => { e.inventory.observed_at = '2026-10-06T12:00:00Z'; });
deny(e => { e.backup.inventory_sha256 = 'd'.repeat(64); });
// A matching inventory hash cannot make an earlier export cover later data.
deny(e => { e.backup.observed_at = '2026-10-07T12:59:59Z'; });
const simultaneousExport = structuredClone(input);
simultaneousExport.backup.observed_at = simultaneousExport.inventory.observed_at;
assert.equal(assess(simultaneousExport).result, 'PREPARED', 'same snapshot time is valid');
deny(e => { e.restore.backup_sha256 = 'd'.repeat(64); });
deny(e => { e.restore.observed_at = '2026-10-07T13:30:00Z'; });
deny(e => { e.restore.target_kind = 'production'; });
for (const environment of ['pilot','constructor','__proto__',undefined]) assert.equal(assessConversion(input, { environment, now }).result, 'BLOCKED');
assert.equal(assess({ password: 'PRIVATE', project_ref: 'PRIVATE' }).executes_mutation, false);
assert.doesNotMatch(JSON.stringify(assess({ password: 'PRIVATE' })), /PRIVATE/);
console.log('Consolidation: exact identity, inventory, PII, export, restore and controlled reconstruction fail closed; no mutation.');

deny(e => { e.inventory.public_rows = 0; });
deny(e => { e.inventory.table_counts.push({ table_name: 'fin_settings', rows: 0 }); });
deny(e => { e.inventory.table_counts = []; });

// Exercise the real CLI: caller-controlled hashes cannot replace the current
// generator output. These are synthetic evidence claims, never hosted proof.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arandu-consolidation-context-'));
try {
 const e = structuredClone(input);
 const time = Date.now();
 e.inventory.observed_at = new Date(time - 3000).toISOString();
 e.backup.observed_at = new Date(time - 2000).toISOString();
 e.restore.observed_at = new Date(time - 1000).toISOString();
 e.inventory.sha256 = inventoryDigest(e.project_ref, e.inventory);
 e.backup.inventory_sha256 = e.inventory.sha256;
 e.plan.bundle_sha256 = currentCleanInstallDigest();
 const file = path.join(dir, 'synthetic.json');
 const check = () => {
  fs.writeFileSync(file, JSON.stringify(e));
  return spawnSync(process.execPath, ['scripts/check-consolidation.mjs', '--environment=demo', `--evidence=${file}`], { encoding: 'utf8', env: { PATH: process.env.PATH } });
 };
 assert.equal(check().status, 0, 'current synthetic plan should satisfy the assessment contract');
 e.restore.target_schema_sha256 = 'f'.repeat(64);
 const schemaMismatch = check();
 assert.equal(schemaMismatch.status, 1, 'matching row counts cannot mask restored DDL or grants drift');
 assert.equal(JSON.parse(schemaMismatch.stdout).checks.find(c => c.name === 'restore_schema_reconciliation').ok, false);
 e.restore.target_schema_sha256 = e.backup.snapshot_schema_sha256;
 e.plan.bundle_sha256 = 'f'.repeat(64);
 const stale = check();
 assert.equal(stale.status, 1);
 assert.equal(JSON.parse(stale.stdout).checks.find(c => c.name === 'current_migration_bundle').ok, false);
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

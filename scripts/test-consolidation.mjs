import assert from 'node:assert/strict';
import { assessConversion, inventoryDigest } from '../lib/consolidation-readiness.mjs';
const now = new Date('2026-10-07T16:00:00Z');
const input = { project_ref: 'offgpyysgdhfemjlchod', database_hostname: 'db.offgpyysgdhfemjlchod.supabase.co', destination: 'demo',
 inventory: { observed_at: '2026-10-07T13:00:00Z', complete: true, count_method: 'exact', sha256: 'a'.repeat(64), public_rows: 13, table_counts: [{ table_name: 'fin_settings', rows: 13 }], customer_rows: 0, personal_data_rows: 0, auth_users: 0, mfa_factors: 0, storage_objects: 0 },
 backup: { project_ref: 'offgpyysgdhfemjlchod', result: 'PASS', observed_at: '2026-10-07T14:00:00Z', sha256: 'b'.repeat(64), inventory_sha256: 'a'.repeat(64), reference: 'fixture:export', auth_storage_included: true },
 restore: { project_ref: 'offgpyysgdhfemjlchod', result: 'PASS', target_kind: 'disposable', observed_at: '2026-10-07T15:00:00Z', backup_sha256: 'b'.repeat(64), row_comparison: 'PASS', post_restore_probes: 'PASS' },
 plan: { clean_install: true, bundle_sha256: 'c'.repeat(64), legacy_preserved: true, rollback_reference: 'fixture:rollback' } };
input.inventory.sha256 = inventoryDigest(input.project_ref, input.inventory);
input.backup.inventory_sha256 = input.inventory.sha256;
const assess = e => assessConversion(e, { environment: 'demo', now });
assert.equal(assess(input).result, 'PREPARED');
const deny = change => { const e = structuredClone(input); change(e); assert.equal(assess(e).result, 'BLOCKED'); };
for (const key of ['inventory','backup','restore','plan']) deny(e => { delete e[key]; });
for (const key of ['customer_rows','personal_data_rows','auth_users','mfa_factors','storage_objects']) {
 deny(e => { e.inventory[key] = 1; }); deny(e => { delete e.inventory[key]; });
}
deny(e => { e.project_ref = 'igacnfjeuqhxcmfyepgj'; });
deny(e => { e.inventory.count_method = 'estimated'; });
deny(e => { e.inventory.observed_at = '2026-10-06T12:00:00Z'; });
deny(e => { e.backup.inventory_sha256 = 'd'.repeat(64); });
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

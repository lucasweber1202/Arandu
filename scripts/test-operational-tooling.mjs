import assert from 'node:assert/strict';
import { inspectStagingEnvironment, projectRefFromDatabaseUrl } from '../lib/staging-safety.mjs';
import { inspectBackupArtifact, inspectRestoreEvidence, schemaFingerprint, validOperationalReference } from '../lib/backup-evidence.mjs';

const valid = inspectStagingEnvironment({
  ARANDU_STAGING_SITE_URL: 'https://staging.arandu-procurement.com.br',
  ARANDU_PRODUCTION_SITE_URL: 'https://arandu-procurement.com.br',
  ARANDU_STAGING_PROJECT_REF: 'abcdefghijk',
  ARANDU_PRODUCTION_PROJECT_REF: 'zyxwvutsrqp',
  SUPABASE_URL: 'https://abcdefghijk.supabase.co',
  ARANDU_STAGING_DATABASE_URL: 'postgresql://redacted@db.abcdefghijk.supabase.co:5432/postgres',
  ARANDU_WRITE_TEST_URL: 'https://staging.arandu-procurement.com.br/api/write-canary'
});
assert.equal(valid.ok, true);
assert.equal(projectRefFromDatabaseUrl('postgresql://postgres.abcdefghijk:redacted@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'), 'abcdefghijk');
assert.equal(projectRefFromDatabaseUrl('postgresql://redacted@db.abcdefghijk.supabase.co:5432/postgres'), 'abcdefghijk');
assert.equal(projectRefFromDatabaseUrl('postgresql://redacted@db.abcdefghijk.supabase.co.evil.test/postgres'), null);
assert.equal(inspectStagingEnvironment({ ...process.env, ARANDU_STAGING_SITE_URL: 'https://arandu.example.com' }).ok, false);
assert.equal(inspectStagingEnvironment({
  ARANDU_STAGING_SITE_URL: 'https://staging.arandu-procurement.com.br', ARANDU_STAGING_PROJECT_REF: 'abcdefghijk',
  ARANDU_PRODUCTION_SITE_URL: 'https://arandu-procurement.com.br',
  ARANDU_PRODUCTION_PROJECT_REF: 'abcdefghijk', SUPABASE_URL: 'https://abcdefghijk.supabase.co',
  ARANDU_STAGING_DATABASE_URL: 'postgresql://x@db.abcdefghijk.supabase.co/postgres', ARANDU_WRITE_TEST_URL: 'https://staging.arandu-procurement.com.br/api/x'
}).ok, false);
assert.equal(validOperationalReference('CHANGE-12345'), true);
assert.equal(validOperationalReference('ok'), false);
const recent = inspectBackupArtifact({ stat: { isFile: () => true, size: 4096, mtimeMs: Date.now() - 1000 }, reference: 'BACKUP-12345' });
assert.equal(recent.ok, true);
const stale = inspectBackupArtifact({ stat: { isFile: () => true, size: 4096, mtimeMs: Date.now() - 72 * 3600000 }, reference: 'BACKUP-12345' });
assert.equal(stale.ok, false);
const restoreReport = {
  classification: 'restore_verification', environment: 'disposable_restore', result: 'passed',
  backupScope: 'public_schema',
  generatedAt: new Date().toISOString(), backupReference: 'BACKUP-12345', restoreReference: 'RESTORE-12345',
  backupSha256: 'a'.repeat(64), checks: ['backup-artifact', 'backup-readable', 'restore-executed', 'schema-fingerprint', 'post-restore-probes'].map((name) => ({ name, ok: true }))
};
assert.equal(inspectRestoreEvidence({ report: restoreReport, backupReference: 'BACKUP-12345', restoreReference: 'RESTORE-12345', backupSha256: 'a'.repeat(64) }).ok, true);
assert.equal(inspectRestoreEvidence({ report: restoreReport, backupReference: 'BACKUP-OTHER', restoreReference: 'RESTORE-12345', backupSha256: 'a'.repeat(64) }).ok, false);
assert.equal(inspectRestoreEvidence({ report: restoreReport, backupReference: 'BACKUP-12345', restoreReference: 'RESTORE-12345', backupSha256: 'b'.repeat(64) }).ok, false);
assert.equal(inspectRestoreEvidence({ report: { ...restoreReport, generatedAt: new Date(Date.now() - 7 * 3600000).toISOString() }, backupReference: 'BACKUP-12345', restoreReference: 'RESTORE-12345', backupSha256: 'a'.repeat(64) }).ok, false);
const observedNow = Date.parse('2026-10-08T12:00:00Z');
const artifactOptions = { stat: { isFile: () => true, size: 4096, mtimeMs: observedNow - 1000 }, reference: 'BACKUP-12345', now: observedNow };
const restoreOptions = { report: { ...restoreReport, generatedAt: new Date(observedNow - 1000).toISOString() }, backupReference: 'BACKUP-12345', restoreReference: 'RESTORE-12345', backupSha256: 'a'.repeat(64), now: observedNow };
for (const maxAgeHours of [NaN, Infinity, -Infinity, 0, -1, null, '48', Number.MAX_VALUE]) {
  assert.equal(inspectBackupArtifact({ ...artifactOptions, maxAgeHours }).ok, false, 'Invalid backup age window must block');
  assert.equal(inspectRestoreEvidence({ ...restoreOptions, maxAgeHours }).ok, false, 'Invalid restore age window must block');
}
for (const now of [NaN, Infinity, null, '1780000000000', -1]) {
  assert.equal(inspectBackupArtifact({ ...artifactOptions, now }).ok, false, 'Invalid observation clock must block backup evidence');
  assert.equal(inspectRestoreEvidence({ ...restoreOptions, now }).ok, false, 'Invalid observation clock must block restore evidence');
}
for (const invalidStat of [{ size: NaN }, { size: Infinity }, { size: '4096' }, { mtimeMs: String(observedNow - 1000) }, { mtimeMs: -1 }]) {
  assert.equal(inspectBackupArtifact({ ...artifactOptions, stat: { ...artifactOptions.stat, ...invalidStat } }).ok, false);
}
for (const name of restoreReport.checks.map(check => check.name)) {
  for (const ok of [false, null, 'true', true]) {
    for (const first of [true, false]) {
      const duplicate = { name, ok };
      const checks = first ? [duplicate, ...restoreReport.checks] : [...restoreReport.checks, duplicate];
      assert.equal(inspectRestoreEvidence({ ...restoreOptions, report: { ...restoreOptions.report, checks } }).ok, false, 'Duplicate checks must block regardless of order or final value');
    }
  }
}
for (const extra of [{ name: 'blocked', ok: false }, { name: 'source-schema-fingerprint', ok: null }, null, { name: '', ok: true }]) {
  assert.equal(inspectRestoreEvidence({ ...restoreOptions, report: { ...restoreOptions.report, checks: [...restoreReport.checks, extra] } }).ok, false, 'Passed report must not conceal failed or malformed checks');
}
assert.equal(inspectRestoreEvidence({ ...restoreOptions, report: { ...restoreOptions.report, checks: [...restoreReport.checks, { name: 'source-schema-fingerprint', ok: true }] } }).ok, true);
// Preserve the documented inclusive boundary; a millisecond older is stale.
for (const beyond of [0, 1]) {
  assert.equal(inspectBackupArtifact({ ...artifactOptions, maxAgeHours: 6, stat: { ...artifactOptions.stat, mtimeMs: observedNow - 6 * 3600000 - beyond } }).ok, beyond === 0);
  assert.equal(inspectRestoreEvidence({ ...restoreOptions, maxAgeHours: 6, report: { ...restoreOptions.report, generatedAt: new Date(observedNow - 6 * 3600000 - beyond).toISOString() } }).ok, beyond === 0);
}
assert.equal(schemaFingerprint('-- dump\n\\restrict AAA\ncreate table x(id int);\n\\unrestrict AAA'), schemaFingerprint('-- other dump\n\\restrict BBB\ncreate table x(id int);\n\\unrestrict BBB'));
assert.notEqual(schemaFingerprint('create table x(id int);'), schemaFingerprint('create table x(id text);'));
console.log('Operational tooling tests approved.');

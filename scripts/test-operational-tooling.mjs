import assert from 'node:assert/strict';
import { inspectStagingEnvironment, projectRefFromDatabaseUrl } from '../lib/staging-safety.mjs';
import { inspectBackupArtifact, inspectRestoreEvidence, schemaFingerprint, validOperationalReference } from '../lib/backup-evidence.mjs';

const valid = inspectStagingEnvironment({
  ARANDU_STAGING_SITE_URL: 'https://staging.arandu.art',
  ARANDU_PRODUCTION_SITE_URL: 'https://arandu.art',
  ARANDU_STAGING_PROJECT_REF: 'abcdefghijk',
  ARANDU_PRODUCTION_PROJECT_REF: 'zyxwvutsrqp',
  SUPABASE_URL: 'https://abcdefghijk.supabase.co',
  ARANDU_STAGING_DATABASE_URL: 'postgresql://redacted@db.abcdefghijk.supabase.co:5432/postgres',
  ARANDU_WRITE_TEST_URL: 'https://staging.arandu.art/api/write-canary'
});
assert.equal(valid.ok, true);
assert.equal(projectRefFromDatabaseUrl('postgresql://postgres.abcdefghijk:redacted@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'), 'abcdefghijk');
assert.equal(projectRefFromDatabaseUrl('postgresql://redacted@db.abcdefghijk.supabase.co:5432/postgres'), 'abcdefghijk');
assert.equal(projectRefFromDatabaseUrl('postgresql://redacted@db.abcdefghijk.supabase.co.evil.test/postgres'), null);
assert.equal(inspectStagingEnvironment({ ...process.env, ARANDU_STAGING_SITE_URL: 'https://arandu.example.com' }).ok, false);
assert.equal(inspectStagingEnvironment({
  ARANDU_STAGING_SITE_URL: 'https://staging.arandu.art', ARANDU_STAGING_PROJECT_REF: 'abcdefghijk',
  ARANDU_PRODUCTION_SITE_URL: 'https://arandu.art',
  ARANDU_PRODUCTION_PROJECT_REF: 'abcdefghijk', SUPABASE_URL: 'https://abcdefghijk.supabase.co',
  ARANDU_STAGING_DATABASE_URL: 'postgresql://x@db.abcdefghijk.supabase.co/postgres', ARANDU_WRITE_TEST_URL: 'https://staging.arandu.art/api/x'
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
assert.equal(schemaFingerprint('-- dump\n\\restrict AAA\ncreate table x(id int);\n\\unrestrict AAA'), schemaFingerprint('-- other dump\n\\restrict BBB\ncreate table x(id int);\n\\unrestrict BBB'));
assert.notEqual(schemaFingerprint('create table x(id int);'), schemaFingerprint('create table x(id text);'));
console.log('Operational tooling tests approved.');

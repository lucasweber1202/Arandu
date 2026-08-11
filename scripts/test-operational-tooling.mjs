import assert from 'node:assert/strict';
import { inspectStagingEnvironment } from '../lib/staging-safety.mjs';
import { inspectBackupArtifact, validOperationalReference } from '../lib/backup-evidence.mjs';

const valid = inspectStagingEnvironment({
  ARANDU_STAGING_SITE_URL: 'https://staging.arandu.art',
  ARANDU_STAGING_PROJECT_REF: 'abcdefghijk',
  ARANDU_PRODUCTION_PROJECT_REF: 'zyxwvutsrqp',
  SUPABASE_URL: 'https://abcdefghijk.supabase.co',
  ARANDU_STAGING_DATABASE_URL: 'postgresql://redacted@db.abcdefghijk.supabase.co:5432/postgres',
  ARANDU_WRITE_TEST_URL: 'https://staging.arandu.art/api/write-canary'
});
assert.equal(valid.ok, true);
assert.equal(inspectStagingEnvironment({ ...process.env, ARANDU_STAGING_SITE_URL: 'https://arandu.example.com' }).ok, false);
assert.equal(inspectStagingEnvironment({
  ARANDU_STAGING_SITE_URL: 'https://staging.arandu.art', ARANDU_STAGING_PROJECT_REF: 'abcdefghijk',
  ARANDU_PRODUCTION_PROJECT_REF: 'abcdefghijk', SUPABASE_URL: 'https://abcdefghijk.supabase.co',
  ARANDU_STAGING_DATABASE_URL: 'postgresql://x@db.abcdefghijk.supabase.co/postgres', ARANDU_WRITE_TEST_URL: 'https://staging.arandu.art/api/x'
}).ok, false);
assert.equal(validOperationalReference('CHANGE-12345'), true);
assert.equal(validOperationalReference('ok'), false);
const recent = inspectBackupArtifact({ stat: { isFile: () => true, size: 4096, mtimeMs: Date.now() - 1000 }, reference: 'BACKUP-12345' });
assert.equal(recent.ok, true);
const stale = inspectBackupArtifact({ stat: { isFile: () => true, size: 4096, mtimeMs: Date.now() - 72 * 3600000 }, reference: 'BACKUP-12345' });
assert.equal(stale.ok, false);
console.log('Operational tooling tests approved.');

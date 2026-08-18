import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('.github/workflows/staging-release.yml', 'utf8');
const migrationSource = fs.readFileSync('scripts/release-migrations.mjs', 'utf8');
const restoreSource = fs.readFileSync('scripts/verify-backup-restore.mjs', 'utf8');
assert.match(source, /options:\s*\n\s*- existingDatabase\s*\n\s*- cleanInstall/);
assert.match(source, /jobs:[\s\S]*?env:[\s\S]*?ARANDU_MIGRATION_FLOW:\s*\$\{\{\s*inputs\.migration_flow\s*\}\}/);
assert.match(source, /npm run migrations:bundle -- --flow="\$ARANDU_MIGRATION_FLOW"/);
assert.match(source, /--flow="\$ARANDU_MIGRATION_FLOW"/);
assert.match(source, /services:[\s\S]*?image:\s*postgres:16/);
assert.match(source, /ARANDU_BACKUP_PATH:\s*\/tmp\/arandu-staging-pre-migration\.dump/);
assert.match(source, /npm run backup:restore:verify --/);
assert.match(source, /--compare-source-schema/);
assert.match(source, /--restore-backup/);
assert.match(source, /--schema=public/);
assert.match(source, /--scope=public_schema/);
assert.match(source, /tests\/database\/bootstrap\.sql/);
assert.match(source, /--restore-evidence=reports\/backup-restore-verification\.json/);
assert.match(source, /if-no-files-found:\s*error/);

const backupIndex = source.indexOf('Create pre-migration backup outside the checkout');
const restoreIndex = source.indexOf('Restore backup and verify schema in disposable database');
const migrationIndex = source.indexOf('Execute protected staging migration');
assert.ok(backupIndex > 0 && restoreIndex > backupIndex && migrationIndex > restoreIndex, 'backup e restore precisam anteceder a migration');
assert.match(restoreSource, /--restore-backup/);
assert.match(restoreSource, /'restore-executed', ok: true/);
assert.match(restoreSource, /post-restore-probes\.sql/);
assert.match(migrationSource, /inspectRestoreEvidence/);
assert.match(migrationSource, /Aplicação exige ARANDU_BACKUP_PATH absoluto/);
assert.doesNotMatch(migrationSource, /mode: 'external-evidence'/);

const lines = source.split(/\r?\n/);
let runIndent = null;
for (const line of lines) {
  const indent = line.match(/^\s*/)[0].length;
  if (runIndent !== null && line.trim() && indent <= runIndent) runIndent = null;
  if (/^\s*run:\s*(?:[|>-]|$)/.test(line)) runIndent = indent;
  if (runIndent !== null) {
    assert.doesNotMatch(line, /\$\{\{\s*inputs\./, 'workflow_dispatch input interpolated directly in shell');
  }
}

for (const name of ['ARANDU_RELEASE_OPERATOR', 'ARANDU_BACKUP_REFERENCE', 'ARANDU_RESTORE_REFERENCE', 'ARANDU_RELEASE_CONFIRMATION']) {
  assert.match(source, new RegExp(`\\n\\s+${name}: \\$\\{\\{ inputs\\.`));
}

console.log('Staging workflow tests approved for existingDatabase and cleanInstall.');

import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('.github/workflows/staging-release.yml', 'utf8');
assert.match(source, /options:\s*\n\s*- existingDatabase\s*\n\s*- cleanInstall/);
assert.match(source, /jobs:[\s\S]*?env:[\s\S]*?ARANDU_MIGRATION_FLOW:\s*\$\{\{\s*inputs\.migration_flow\s*\}\}/);
assert.match(source, /npm run migrations:bundle -- --flow="\$ARANDU_MIGRATION_FLOW"/);
assert.match(source, /--flow="\$ARANDU_MIGRATION_FLOW"/);

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

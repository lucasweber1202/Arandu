import fs from 'node:fs';
import { CHECK_CONSTRAINTS_SQL, restoreSchemaFingerprint } from '../lib/restore-schema-fingerprint.mjs';

if (process.argv[2] === '--checks-sql' && process.argv.length === 3) {
  process.stdout.write(CHECK_CONSTRAINTS_SQL);
} else if (process.argv.length === 3) {
  try {
    console.log(restoreSchemaFingerprint(fs.readFileSync(0, 'utf8'), JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))));
  } catch {
    console.error('Schema fingerprint failed; private inputs omitted.');
    process.exitCode = 1;
  }
} else {
  console.error('Expected private CHECK projection file or --checks-sql.');
  process.exitCode = 1;
}

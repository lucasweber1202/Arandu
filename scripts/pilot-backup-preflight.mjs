import fs from 'node:fs';
import { runBackupPreflight } from '../lib/pilot-backup-preflight.mjs';

const report = runBackupPreflight();
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/pilot-backup-preflight.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(report.result === 'ready' ? 0 : 1);

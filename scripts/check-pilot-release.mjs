import fs from 'node:fs';
import { assessPilotRelease } from '../lib/finance/pilot-release.mjs';

const args = process.argv.slice(2);
const value = key => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
let evidence;
// Invalidate the previous result before parsing new evidence. A malformed input
// must never leave yesterday's GO available to operators or automation.
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/pilot-release.json', JSON.stringify(assessPilotRelease({}, { commit: value('commit') }), null, 2) + '\n');
try {
  const file = value('evidence');
  if (!file || fs.statSync(file).size > 128000) throw new Error();
  evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch {
  // Never echo a malformed document or its path: either can contain secrets.
  console.error('PILOT NO-GO: evidência JSON ausente, inválida ou maior que 128 KB.');
  process.exit(1);
}
const report = assessPilotRelease(evidence, { commit: value('commit') });
fs.writeFileSync('reports/pilot-release.json', JSON.stringify(report, null, 2) + '\n');
console.log(report.result);
for (const check of report.checks) console.log(`${check.ok ? 'PASS' : 'BLOCKED'} ${check.name}${check.reason ? ': ' + check.reason : ''}`);
process.exit(report.result === 'PILOT GO' ? 0 : 1);

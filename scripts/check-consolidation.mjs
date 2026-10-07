import fs from 'node:fs';
import { assessConversion, assessDecommission } from '../lib/consolidation-readiness.mjs';
const args = process.argv.slice(2);
const value = key => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const environment = value('environment');
const assess = evidence => environment === 'decommission' ? assessDecommission(evidence, { commit: value('commit') }) : assessConversion(evidence, { environment });
fs.mkdirSync('reports', { recursive: true });
const output = 'reports/consolidation-readiness.json';
fs.writeFileSync(output, JSON.stringify(assess({}), null, 2));
let evidence;
try {
  const file = value('evidence');
  if (!file || fs.statSync(file).size > 128000) throw Error();
  evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
} catch { console.error('BLOCKED: evidência ausente ou inválida.'); process.exit(1); }
const report = assess(evidence);
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.result === 'PREPARED' ? 0 : 1);

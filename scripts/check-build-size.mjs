import fs from 'node:fs';
import path from 'node:path';
import { assessBuildSize } from './build-size.mjs';

const dir = 'dist';
if (!fs.existsSync(dir)) {
  console.error('dist ausente');
  process.exit(1);
}

const files = [];
function walk(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) walk(full);
    else files.push({ name: path.relative(dir, full).split(path.sep).join('/'), size: fs.statSync(full).size });
  }
}
walk(dir);

let profile = null;
try { profile = JSON.parse(fs.readFileSync('reports/bundle-profile.json', 'utf8')); } catch { profile = null; }
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
const result = assessBuildSize({ files, profile, growthLog: readJson('docs/perf/bundle-growth-log.json'), journeyBaseline: readJson('docs/perf/journey-js-baseline.json') });

console.log('Arandu Build Size Check');
for (const key of Object.keys(result.limits)) console.log(`${key}: ${result.metrics[key]} / ${result.limits[key]} bytes (hard limit)`);
for (const key of Object.keys(result.capacity)) console.log(`${key}: ${result.metrics[key]} / ${result.capacity[key]} bytes (indicador de capacidade${result.accepted ? `; aceito até ${result.accepted}` : ''})`);
console.log(`largest route: ${result.largestRoute}`);
for (const warning of result.warnings) console.log(`AVISO: ${warning}`);
for (const problem of result.problems) console.error(`FALHA: ${problem}`);
if (!result.ok) process.exit(1);

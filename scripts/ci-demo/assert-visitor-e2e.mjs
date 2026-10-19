import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function visitorJourneysPassed(report) {
  if (!report || !Array.isArray(report.suites) || !Array.isArray(report.errors) || report.errors.length) return false;
  const specs = [];
  const visit = suites => { for (const suite of suites) { specs.push(...(suite.specs || [])); visit(suite.suites || []); } };
  visit(report.suites);
  return ['demo-entry-journeys.spec.js', 'demo-workspaces.spec.js'].every(file => {
    const matches = specs.filter(spec => String(spec.file || '').replaceAll('\\', '/').split('/').at(-1) === file);
    return matches.length === 1 && matches[0].tests?.length === 1 && matches[0].tests.every(test =>
      test.projectName === 'demo-desktop' && test.status === 'expected' && test.results?.length === 1 && test.results[0].status === 'passed');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let passed = false;
  try { passed = visitorJourneysPassed(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))); } catch {}
  console.log(passed ? 'VISITOR_E2E_VALIDATED tests=2; public entry and concurrent visitor isolation executed' : 'VISITOR_E2E_FAILED: both existing desktop visitor suites must execute and pass, without skips or retries');
  if (!passed) process.exitCode = 1;
}

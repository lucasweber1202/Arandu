import { parseChanges } from './changes.mjs';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { classifyChanges, PATHS, REQUIRED } from './risk-policy.mjs';
import { buildImportGraph, allFinanceSuites, selectSuites } from './surfaces.mjs';

const started = Date.now();
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH));
const sha = git('rev-parse', 'HEAD');
if (sha !== process.env.GITHUB_SHA) throw Error('Checkout SHA mismatch');

let plan = { risk: 'D', path: PATHS.D, required: REQUIRED.D, reasons: [{ path: '*', risk: 'D', why: 'Main, scheduled or manual full validation' }] };
if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
  const { base, head } = event.pull_request;
  const parents = git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ').slice(1);
  if (!parents.includes(base.sha) || !parents.includes(head.sha)) throw Error('Merge candidate does not match base/head');
  // Strict branch freshness: the candidate must already contain the current base.
  git('merge-base', '--is-ancestor', base.sha, head.sha);
  const changes = parseChanges(execFileSync('git', ['diff', '--name-status', '-z', '--find-renames', `${base.sha}...${head.sha}`], { encoding: 'utf8' }));
  // Purity is verified on the analysed candidate checkout (merge result).
  plan = classifyChanges(changes, { readSource: (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null) });
}

const all = allFinanceSuites();
const suites = selectSuites(plan, { graph: buildImportGraph('.'), all });
if (!suites.length) throw Error('No browser suites selected');
const out = {
  risk: plan.risk,
  path: plan.path,
  deep: String(plan.risk === 'D'),
  sha,
  suites: JSON.stringify(suites),
};
appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(out).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
const rows = plan.reasons.map((r) => `| \`${r.path}\` | ${r.status || ''} | ${r.risk} | ${r.why || ''} |`).join('\n');
appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Risk policy v6.2\nAnalyzed checkout: \`${sha}\`\n\n**Class ${plan.risk} → ${plan.path} path** · required: ${plan.required.join(', ')}\n\nChromium suites (${suites.length}/${all.length}): ${suites.map((s) => `\`${s.replace('tests/e2e/', '')}\``).join(', ')}\n\n| Path | Status | Class | Reason |\n|---|---|---|---|\n${rows}\n\nClassification time: ${Date.now() - started} ms\n`);
console.log(`Class ${plan.risk} (${plan.path}); ${suites.length} Chromium suites; ${Date.now() - started} ms`);

console.log('ARANDU_RISK_RECEIPT '+JSON.stringify({sha,risk:plan.risk,reasons:plan.reasons,required:plan.required,suites}));

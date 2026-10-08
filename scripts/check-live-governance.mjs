#!/usr/bin/env node
import fs from 'node:fs';
import { assessLiveGovernance } from '../lib/live-governance.mjs';

const repository = process.argv[2] || process.env.GITHUB_REPOSITORY || 'lucasweber1202/Arandu';
const output = 'reports/live-governance.json';
fs.mkdirSync('reports', { recursive: true });
// Invalidate previous success even for invalid arguments.
fs.writeFileSync(output, JSON.stringify(assessLiveGovernance(), null, 2));
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  console.error('Uso: npm run governance:live -- [owner/repo]');
  process.exit(2);
}
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? { Authorization: `Bearer ${token}` } : {}) };
const reads = [];
async function get(resource) {
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/${resource}`, {
      headers, redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    reads.push({ resource, status: response.status });
    return response.ok ? await response.json() : null;
  } catch {
    reads.push({ resource, status: 'unavailable' });
    return null;
  }
}
const [branch, protection, effectiveRules] = await Promise.all([
  get('branches/main'), get('branches/main/protection'), get('rules/branches/main')
]);
const ids = [...new Set((Array.isArray(effectiveRules) ? effectiveRules : []).map(rule => rule.ruleset_id))];
// Bound requests and fail closed on incomplete/malformed inventories.
const validIds = ids.length <= 100 && ids.every(id => Number.isSafeInteger(id) && id > 0);
const rulesets = validIds ? await Promise.all(ids.map(id => get(`rulesets/${id}`))) : [];
const report = { ...assessLiveGovernance({ branch, protection, effectiveRules, rulesets: rulesets.filter(Boolean) }),
  repository, observed_at: new Date().toISOString(), reads };
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(report.result === 'PROTECTED' ? 0 : 1);

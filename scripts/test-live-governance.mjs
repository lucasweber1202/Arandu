import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assessLiveGovernance } from '../lib/live-governance.mjs';
const branch = { name: 'main', protected: true, commit: { sha: 'a'.repeat(40) } };
const ruleset = { ...JSON.parse(fs.readFileSync('.github/rulesets/main.json', 'utf8')), id: 42 };
const effectiveRules = ruleset.rules.map(rule => ({ ...rule, ruleset_id: 42 }));
const good = () => structuredClone({ branch, rulesets: [ruleset], effectiveRules });
const passed = evidence => assessLiveGovernance(evidence).result === 'PROTECTED';
assert.equal(passed(good()), true);
assert.equal(passed(), false);
assert.equal(passed({ branch, rulesets: [ruleset] }), false, 'template cannot prove enforcement');
for (const change of [
  e => { e.branch.protected = false; },
  e => { e.branch.name = 'pilot'; },
  e => { e.branch.commit.sha = 'main'; },
  e => { e.rulesets[0].enforcement = 'evaluate'; },
  e => { e.rulesets[0].bypass_actors = [{ actor_type: 'RepositoryRole', actor_id: 5 }]; },
  e => { delete e.rulesets[0].bypass_actors; },
  e => { e.effectiveRules.forEach(rule => { rule.ruleset_id = 99; }); },
  e => { e.effectiveRules = e.effectiveRules.filter(rule => rule.type !== 'pull_request'); },
  e => { e.effectiveRules = e.effectiveRules.filter(rule => rule.type !== 'deletion'); },
  e => { e.effectiveRules = e.effectiveRules.filter(rule => rule.type !== 'non_fast_forward'); },
  e => { e.effectiveRules.find(rule => rule.type === 'required_status_checks').parameters.strict_required_status_checks_policy = false; },
  e => { e.effectiveRules.find(rule => rule.type === 'required_status_checks').parameters.do_not_enforce_on_create = true; },
  e => { e.effectiveRules.find(rule => rule.type === 'required_status_checks').parameters.required_status_checks.pop(); },
  e => { e.effectiveRules.find(rule => rule.type === 'required_status_checks').parameters.required_status_checks[0].integration_id = null; }
]) {
  const evidence = good(); change(evidence); assert.equal(passed(evidence), false);
}
const protection = {
  enforce_admins: { enabled: true }, allow_force_pushes: { enabled: false }, allow_deletions: { enabled: false },
  required_conversation_resolution: { enabled: true },
  required_pull_request_reviews: { dismiss_stale_reviews: true, bypass_pull_request_allowances: { users: [], teams: [], apps: [] } },
  required_status_checks: { strict: true, checks: ruleset.rules.find(rule => rule.type === 'required_status_checks').parameters.required_status_checks.map(check => ({ context: check.context, app_id: check.integration_id })) }
};
assert.equal(passed({ branch, protection }), true);
assert.equal(passed({ branch, protection: { ...protection, enforce_admins: { enabled: false } } }), false);
assert.equal(passed({ branch, protection: { ...protection, required_pull_request_reviews: { dismiss_stale_reviews: true } } }), false);
// One complete policy without bypass can enforce restrictions despite another
// weaker policy. Two incomplete policies cannot establish this guarantee.
assert.equal(passed({ ...good(), protection }), true);
assert.equal(passed({ branch, rulesets: null, effectiveRules: { error: '403' } }), false);
const report = assessLiveGovernance({ branch, protection: { error: 'secret-value' } });
assert.ok(!JSON.stringify(report).includes('secret-value'));
// CLI regression: invalid input must replace a previous PROTECTED report.
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'arandu-governance-'));
try {
  fs.mkdirSync(path.join(temporary, 'reports'));
  fs.writeFileSync(path.join(temporary, 'reports/live-governance.json'), JSON.stringify({ result: 'PROTECTED' }));
  const child = spawnSync(process.execPath, [path.resolve('scripts/check-live-governance.mjs'), 'invalid'], { cwd: temporary });
  assert.equal(child.status, 2);
  assert.equal(JSON.parse(fs.readFileSync(path.join(temporary, 'reports/live-governance.json'))).result, 'BLOCKED');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
console.log('Live governance: templates, missing reads, wrong SHA/branch, bypass, stale policy and unbound checks fail closed.');

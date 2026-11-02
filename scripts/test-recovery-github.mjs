import assert from 'node:assert/strict';
import { assessRecoveryGithub, RECOVERY_GITHUB_SECRETS } from '../lib/recovery-github.mjs';
const ok = data => ({ status: 200, data });
const source = {
  environment: ok({ name: 'database-recovery', can_admins_bypass: false,
    protection_rules: [{ type: 'required_reviewers', prevent_self_review: true, reviewers: [{}] }],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } }),
  branches: ok({ total_count: 1, branch_policies: [{ name: 'main', type: 'branch' }] }),
  secrets: ok({ total_count: 4, secrets: RECOVERY_GITHUB_SECRETS.map(name => ({ name, value: 'NEVER_OUTPUT' })) })
};
const prepared = assessRecoveryGithub(source);
assert.equal(prepared.result, 'METADATA_PREPARED');
assert.equal(prepared.export_authorized, false);assert.equal(prepared.secret_validity, 'NOT_PROVEN');
assert(!JSON.stringify(prepared).includes('NEVER_OUTPUT'));
for (const status of [401, 403, 404, 0]) {
  const r = assessRecoveryGithub({ ...source, secrets: { status } });
  assert.equal(r.result, 'BLOCKED');
  assert(r.checks.filter(c => c.name.startsWith('secret_name:')).every(c => c.result === ([401,403].includes(status) ? 'ACCESS_BLOCKED' : 'NOT_PROVEN')));
}
for (const change of [
  { can_admins_bypass: true }, { protection_rules: [] },
  { protection_rules: [{ type: 'required_reviewers', prevent_self_review: false, reviewers: [{}] }] },
  { deployment_branch_policy: { protected_branches: true, custom_branch_policies: false } }
]) assert.equal(assessRecoveryGithub({ ...source, environment: ok({ ...source.environment.data, ...change }) }).result, 'BLOCKED');
for (const branches of [[], [{ name: '*', type: 'branch' }], [{ name: 'main', type: 'tag' }], [{ name: 'main', type: 'branch' }, { name: 'pilot', type: 'branch' }]]) {
  assert.equal(assessRecoveryGithub({ ...source, branches: ok({ total_count: branches.length, branch_policies: branches }) }).result, 'BLOCKED');
}
assert.equal(assessRecoveryGithub({ ...source, secrets: ok({ total_count: 5, secrets: source.secrets.data.secrets }) }).result, 'BLOCKED');
assert.equal(assessRecoveryGithub({ ...source, secrets: ok({ total_count: 0, secrets: [] }) }).result, 'BLOCKED');
assert.equal(assessRecoveryGithub().result, 'BLOCKED');
for (const data of [null, 'invalid', [], {}, { protection_rules: {} }, { total_count: 4, secrets: 'fake' }, { total_count: 1, branch_policies: [null] }]) {
  for (const field of ['environment','branches','secrets']) assert.equal(assessRecoveryGithub({ ...source, [field]: ok(data) }).result, 'BLOCKED');
}
console.log('Recovery GitHub metadata: restricted access stays unknown, names never prove values, main-only/reviewer/self-review/bypass guards PASS.');

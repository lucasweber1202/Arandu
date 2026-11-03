// Metadata only. A listed secret proves its name exists, never its value or validity.
export const RECOVERY_GITHUB_SECRETS = Object.freeze([
  'ARANDU_PILOT_RECOVERY_DATABASE_URL', 'ARANDU_LEGACY_RECOVERY_DATABASE_URL',
  'ARANDU_RECOVERY_RECIPIENT', 'ARANDU_RECOVERY_DIRECTORY'
]);

export function assessRecoveryGithub({ environment, branches, secrets } = {}) {
  const checks = [];
  const add = (name, result) => checks.push({ name, result });
  const assess = (observation, fn) => observation?.status === 403 || observation?.status === 401
    ? 'ACCESS_BLOCKED' : observation?.status !== 200 ? 'NOT_PROVEN' : fn(observation.data) ? 'PASS' : 'FAIL';
  add('environment_exists', assess(environment, e => e?.name === 'database-recovery'));
  const reviewerRule = e => Array.isArray(e?.protection_rules) && e.protection_rules.find(r => r?.type === 'required_reviewers');
  add('required_reviewer', assess(environment, e => Array.isArray(reviewerRule(e)?.reviewers) && reviewerRule(e).reviewers.length > 0));
  add('prevent_self_review', assess(environment, e => reviewerRule(e)?.prevent_self_review === true));
  add('administrator_bypass_disabled', assess(environment, e => e?.can_admins_bypass === false));
  add('main_only', assess(environment, e => e?.deployment_branch_policy?.protected_branches === false && e?.deployment_branch_policy?.custom_branch_policies === true) === 'PASS'
    ? assess(branches, b => b?.total_count === 1 && Array.isArray(b.branch_policies) && b.branch_policies.length === 1 && b.branch_policies[0]?.name === 'main' && b.branch_policies[0]?.type === 'branch')
    : assess(environment, () => false));
  for (const name of RECOVERY_GITHUB_SECRETS) add(`secret_name:${name}`, assess(secrets, s => Number.isSafeInteger(s?.total_count) && Array.isArray(s.secrets) && s.total_count === s.secrets.length && s.secrets.some(v => v?.name === name)));
  return {
    classification: 'github_recovery_metadata', environment: 'database-recovery',
    strategy: 'private-store', result: checks.every(c => c.result === 'PASS') ? 'METADATA_PREPARED' : 'BLOCKED',
    checks, secret_values: 'NOT_READ', secret_validity: 'NOT_PROVEN',
    private_runner: 'NOT_PROVEN', durable_store: 'NOT_PROVEN',
    export_authorized: false, conversion_authorized: false,
    operator_local: 'GitHub environment is not required for operator-local recovery; use recovery:doctor on the trusted machine.'
  };
}

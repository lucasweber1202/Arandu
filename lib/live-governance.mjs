import { REQUIRED_CHECKS } from './merge-gates.mjs';

// Evaluate only responses from GitHub, never a versioned ruleset template.
// A single complete, non-bypassable policy is sufficient. Partial policies
// are deliberately not combined: different bypass lists can weaken the union.
export function assessLiveGovernance({ branch, protection, effectiveRules, rulesets = [] } = {}) {
  const policies = [];
  const requiredChecks = checks => REQUIRED_CHECKS.every(name =>
    checks?.some(check => check.context === name && (check.integration_id ?? check.app_id) === 15368));
  const classic = protection?.required_pull_request_reviews;
  if (classic) {
    policies.push({
      source: 'branch_protection',
      complete: protection.enforce_admins?.enabled === true
        && protection.required_status_checks?.strict === true
        && requiredChecks(protection.required_status_checks?.checks)
        && classic.dismiss_stale_reviews === true
        && Array.isArray(classic.bypass_pull_request_allowances?.users)
        && Array.isArray(classic.bypass_pull_request_allowances?.teams)
        && Array.isArray(classic.bypass_pull_request_allowances?.apps)
        && Object.values(classic.bypass_pull_request_allowances).every(list => Array.isArray(list) && list.length === 0)
        && protection.required_conversation_resolution?.enabled === true
        && protection.allow_force_pushes?.enabled === false
        && protection.allow_deletions?.enabled === false
    });
  }
  for (const ruleset of Array.isArray(rulesets) ? rulesets : []) {
    if (!Number.isSafeInteger(ruleset?.id) || ruleset.enforcement !== 'active' || ruleset.target !== 'branch') continue;
    // /rules/branches/<branch> proves applicability, including inherited rules.
    const rules = Array.isArray(effectiveRules) ? effectiveRules.filter(rule => rule.ruleset_id === ruleset.id) : [];
    const pr = rules.find(rule => rule.type === 'pull_request')?.parameters;
    const checks = rules.find(rule => rule.type === 'required_status_checks')?.parameters;
    policies.push({ source: `ruleset:${ruleset.id}`, complete:
      Array.isArray(ruleset.bypass_actors) && ruleset.bypass_actors.length === 0
      && pr?.dismiss_stale_reviews_on_push === true
      && pr.required_review_thread_resolution === true
      && checks?.strict_required_status_checks_policy === true
      && checks.do_not_enforce_on_create === false
      && requiredChecks(checks.required_status_checks)
      && rules.some(rule => rule.type === 'deletion')
      && rules.some(rule => rule.type === 'non_fast_forward')
    });
  }
  const checks = [
    { name: 'main_identity', ok: branch?.name === 'main' && /^[a-f0-9]{40}$/.test(branch?.commit?.sha || '') },
    { name: 'github_reports_protected', ok: branch?.protected === true },
    { name: 'complete_non_bypassable_policy', ok: policies.some(policy => policy.complete) }
  ];
  return { tool: 'arandu-live-governance', result: checks.every(check => check.ok) ? 'PROTECTED' : 'BLOCKED',
    commit: /^[a-f0-9]{40}$/.test(branch?.commit?.sha || '') ? branch.commit.sha : null,
    executes_mutation: false, checks, policies };
}

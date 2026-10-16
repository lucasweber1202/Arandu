const REQUIRED_OUTCOMES = Object.freeze([
  ['NODE', 'Node runtime setup'],
  ['TESTED_COMMIT', 'Executed commit identity'],
  ['PREFLIGHT', 'Disposable runner preflight'],
  ['BLOCK_HOSTED', 'Hosted Supabase network block'],
  ['INSTALL', 'Locked dependency install'],
  ['BUILD', 'Application build'],
  ['IMAGES', 'Pinned service images'],
  ['UP', 'Supabase stack, migrations, and Demo app'],
  ['SMOKE', 'Database, Auth, PostgREST, Storage, API, and RLS smoke'],
  ['SEED', 'Canonical synthetic seed'],
  ['CHECK', 'Seed read-back verification'],
  ['PLAYWRIGHT_VERSION', 'Playwright version check'],
  ['INSTALL_CHROMIUM', 'Chromium installation'],
  ['E2E_DESKTOP', 'Demo desktop journey'],
  ['E2E_MOBILE', 'Demo mobile journey'],
  ['JOURNEY', 'Authenticated operational journey'],
  ['ADVERSARIAL', 'Adversarial isolation and concurrency probes'],
  ['RECOVERY', 'Database and Storage recovery drill'],
  ['EVIDENCE', 'Sanitized evidence collection'],
  ['TEARDOWN', 'Disposable resource cleanup'],
  ['EVIDENCE_UPLOAD', 'Evidence artifact archival']
]);

const FULL_SHA = /^[a-f0-9]{40}$/;

export function assessDemoRehearsal(env = {}) {
  const testedSha = String(env.TESTED_SHA || '').trim();
  const eventHeadSha = String(env.HEAD_SHA || '').trim();
  const identityValid = FULL_SHA.test(testedSha);
  const eventIdentityValid = FULL_SHA.test(eventHeadSha);
  const pending = REQUIRED_OUTCOMES
    .filter(([key]) => env[key] !== 'success')
    .map(([key, label]) => ({ key, label, outcome: env[key] || 'not_run' }));
  if (!identityValid) pending.unshift({ key: 'TESTED_SHA', label: 'Exact executed commit identity', outcome: 'not_identified' });
  if (!eventIdentityValid) pending.unshift({ key: 'HEAD_SHA', label: 'Exact event/PR reference identity', outcome: 'not_identified' });
  const localValidated = identityValid && eventIdentityValid && pending.length === 0;
  return {
    result: localValidated ? 'B_LOCAL_DEMO_VALIDATED' : 'C_NO_GO',
    maturity: 'CI_VALIDATED_ONLY',
    hostedStatus: 'NOT_PROVEN',
    testedSha: identityValid ? testedSha : null,
    eventHeadSha: eventIdentityValid ? eventHeadSha : null,
    pending
  };
}

export const DEMO_REHEARSAL_REQUIRED_OUTCOMES = REQUIRED_OUTCOMES;

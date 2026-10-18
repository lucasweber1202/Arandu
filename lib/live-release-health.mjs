// Public projection only. Allow release identity without allowing arbitrary
// configuration/upstream payloads. This validates claims, not their origin.
export function assessPublicHealth(payload, { environment, commit, readiness = false } = {}) {
  const identity = payload?.release;
  const only = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
  const safe = only(payload, ['ok', 'service', 'status', 'release']) && only(identity, ['environment', 'mode', 'datasource', 'misconfigured', 'branch', 'commit']);
  const expectedMode = { demo: 'demo', pilot: 'staging', production: 'official' }[environment];
  const exact = /^[a-f0-9]{40}$/.test(commit || '') && identity?.commit === commit;
  const ready = safe && payload.ok === true && payload.service === 'arandu-api' && payload.status === (readiness ? 'ready' : 'alive')
    && expectedMode && identity?.environment === environment && identity.mode === expectedMode && identity.datasource === 'supabase'
    && identity.misconfigured === false && identity.branch === 'main' && exact;
  return { outcome: ready ? 'PASS' : 'FAIL', code: ready ? 'HEALTH_IDENTITY_VERIFIED' : !safe ? 'HEALTH_UNEXPECTED_FIELDS' : !exact ? 'HEALTH_COMMIT_UNPROVEN' : 'HEALTH_NOT_READY_OR_WRONG_ENVIRONMENT' };
}

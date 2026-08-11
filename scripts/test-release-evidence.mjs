import assert from 'node:assert/strict';
import { validateGateEvidence } from '../lib/release-evidence.mjs';
const base = { owner: 'release-operator', timestamp: new Date(Date.now() - 1000).toISOString(), reference: 'RUN-12345678', result: 'passed', notes: null };
assert.equal(validateGateEvidence('migration_ci', { ...base, state: 'ci_validated', environment: 'ci', origin: 'github_actions' }).problems.length, 0);
assert.equal(validateGateEvidence('migration_staging', { ...base, state: 'staging_validated', environment: 'local', origin: 'local' }).problems.length > 0, true);
assert.equal(validateGateEvidence('catalog_real', { ...base, state: 'externally_verified', environment: 'ci', origin: 'github_actions' }).problems.length > 0, true);
assert.equal(validateGateEvidence('pilot_closed', { ...base, state: 'failed', environment: 'pilot', origin: 'operational_tool', result: 'passed' }).problems.length > 0, true);
console.log('Release evidence state tests approved.');

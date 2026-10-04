import assert from 'node:assert/strict';
import { evaluateMergeGates, REQUIRED_CHECKS } from '../lib/merge-gates.mjs';

const HEAD = 'f4b78a2f19a3a5741a9646e531cdf80a847b102b';
const OLD = 'e077516400000000000000000000000000000000';
const green = (name, sha = HEAD, extra = {}) => ({ id: 1, name, head_sha: sha, status: 'completed', conclusion: 'success', started_at: '2026-10-04T14:48:00Z', ...extra });
const all = () => REQUIRED_CHECKS.map((name) => green(name));

assert.deepEqual(REQUIRED_CHECKS, ['database', 'deploy-boundaries', 'validate', 'presentation']);
assert.equal(evaluateMergeGates({ headSha: HEAD, checkRuns: all() }).ok, true);

// O incidente da #118: dois verdes e dois em andamento no HEAD final.
const incident = evaluateMergeGates({ headSha: HEAD, checkRuns: [green('database'), green('deploy-boundaries'), green('validate', HEAD, { status: 'in_progress', conclusion: null }), green('presentation', HEAD, { status: 'in_progress', conclusion: null })] });
assert.equal(incident.ok, false);
assert.equal(incident.problems.length, 2);
assert.match(incident.problems.join(' '), /validate: in_progress/);

for (const state of ['queued', 'pending', 'waiting']) assert.equal(evaluateMergeGates({ headSha: HEAD, checkRuns: [...all().slice(1), green('database', HEAD, { status: state, conclusion: null })] }).ok, false, state);
for (const conclusion of ['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', 'action_required', 'stale']) {
  assert.equal(evaluateMergeGates({ headSha: HEAD, checkRuns: [...all().slice(0, 3), green('presentation', HEAD, { conclusion })] }).ok, false, conclusion);
}
// Verde de commit anterior não atesta o HEAD.
const stale = evaluateMergeGates({ headSha: HEAD, checkRuns: [...all().slice(0, 3), green('presentation', OLD)] });
assert.equal(stale.ok, false);
assert.match(stale.problems[0], /stale/);
// Ausência bloqueia.
assert.equal(evaluateMergeGates({ headSha: HEAD, checkRuns: all().slice(0, 3) }).ok, false);
// Re-run mais recente decide, nos dois sentidos.
assert.equal(evaluateMergeGates({ headSha: HEAD, checkRuns: [...all().slice(0, 3), green('presentation', HEAD, { id: 1, conclusion: 'failure', started_at: '2026-10-04T14:00:00Z' }), green('presentation', HEAD, { id: 2, started_at: '2026-10-04T15:00:00Z' })] }).ok, true);
assert.equal(evaluateMergeGates({ headSha: HEAD, checkRuns: [...all().slice(0, 3), green('presentation', HEAD, { id: 2, started_at: '2026-10-04T14:00:00Z' }), green('presentation', HEAD, { id: 3, conclusion: 'failure', started_at: '2026-10-04T15:00:00Z' })] }).ok, false);
// SHA inválido nunca passa.
assert.equal(evaluateMergeGates({ headSha: 'main', checkRuns: all() }).ok, false);
console.log('Merge gates: exato HEAD, quatro jobs, pending/falha/stale/ausência bloqueiam.');

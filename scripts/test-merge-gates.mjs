import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateMergeGates, evaluateBaseFreshness, auditMerge, REQUIRED_CHECKS } from '../lib/merge-gates.mjs';

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

// Base precisa estar contida no HEAD testado (exige branch atualizada).
assert.equal(evaluateBaseFreshness({ compareStatus: 'ahead' }).ok, true);
assert.equal(evaluateBaseFreshness({ compareStatus: 'identical' }).ok, true);
for (const status of ['behind', 'diverged', undefined, null, 'weird']) assert.equal(evaluateBaseFreshness({ compareStatus: status, baseRef: 'pilot' }).ok, false, String(status));
assert.match(evaluateBaseFreshness({ compareStatus: 'diverged', baseRef: 'pilot', behindBy: 3 }).problems[0], /pilot avançou 3/);

// Auditoria pós-merge: o merge real da #124 em pilot@556258c (presentation
// vermelho no HEAD 8701d82, base antiga 7a0a839 enquanto pilot já tinha a #123).
const H124 = '8701d8225f71d33c86d2629f14c6f2bce0ce3fdc';
const pr124 = { number: 124, head: { sha: H124 }, base: { ref: 'pilot' } };
const runs124 = [green('database', H124), green('deploy-boundaries', H124), green('validate', H124), green('presentation', H124, { conclusion: 'failure' })];
const audit124 = auditMerge({ pr: pr124, checkRuns: runs124, compareStatus: 'diverged', behindBy: 2 });
assert.equal(audit124.ok, false);
assert.equal(audit124.problems.length, 2);
assert.match(audit124.problems.join(' '), /presentation: failure/);
assert.match(audit124.problems.join(' '), /desatualizada/);
// Mesmo com gates verdes, base desatualizada falha; e push sem PR falha.
assert.equal(auditMerge({ pr: pr124, checkRuns: REQUIRED_CHECKS.map((name) => green(name, H124)), compareStatus: 'diverged' }).ok, false);
assert.equal(auditMerge({ pr: pr124, checkRuns: REQUIRED_CHECKS.map((name) => green(name, H124)), compareStatus: 'ahead' }).ok, true);
assert.equal(auditMerge({ pr: null }).ok, false);

// Rulesets versionados (importáveis em Settings → Rules → Rulesets) coerentes com o CI real.
const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
for (const branch of ['pilot', 'main']) {
  const ruleset = JSON.parse(fs.readFileSync(`.github/rulesets/${branch}.json`, 'utf8'));
  assert.equal(ruleset.target, 'branch');
  assert.equal(ruleset.enforcement, 'active', `${branch}: ruleset precisa nascer ativa`);
  assert.deepEqual(ruleset.conditions.ref_name.include, [`refs/heads/${branch}`]);
  assert.deepEqual(ruleset.bypass_actors, [], `${branch}: sem bypass`);
  const types = ruleset.rules.map((rule) => rule.type);
  for (const type of ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks']) assert.ok(types.includes(type), `${branch}: regra ${type} ausente`);
  const checks = ruleset.rules.find((rule) => rule.type === 'required_status_checks').parameters;
  assert.equal(checks.strict_required_status_checks_policy, true, `${branch}: exige branch atualizada`);
  assert.deepEqual(checks.required_status_checks.map((check) => check.context), REQUIRED_CHECKS);
  // 15368 = GitHub Actions: um status manual com o mesmo nome não satisfaz o gate.
  for (const check of checks.required_status_checks) assert.equal(check.integration_id, 15368);
  for (const name of REQUIRED_CHECKS) assert.match(ci, new RegExp(`^  ${name}:`, 'm'), `ci.yml: job ${name} ausente`);
}
const audit = fs.readFileSync('.github/workflows/merge-audit.yml', 'utf8');
assert.match(audit, /branches: \[pilot, main\]/);
assert.match(audit, /scripts\/audit-merge\.mjs/);
assert.doesNotMatch(audit, /\|\|\s*true/);
assert.match(audit, /contents: read/);
console.log('Merge gates: exato HEAD, quatro jobs, pending/falha/stale/ausência e base desatualizada bloqueiam; rulesets coerentes com o CI.');

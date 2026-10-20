import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { buildComparison, NEUTRAL_RANKING_NOTICE } from '../lib/finance/comparison.mjs';
import { distribution, PERFORMANCE_TARGETS, CAPACITY_PROFILES } from './performance-contract.mjs';

// Isolates the changed in-memory join, not API/network/database latency.
const active = Array.from({ length: 500 }, (_, id) => ({ id, current_version: 2 }));
const versions = active.flatMap(({ id }) => [4, 3, 2, 1].map((version) => ({ proposal_id: id, version })));
function before() {
  const current = new Map();
  for (const version of versions) {
    const proposal = active.find((row) => row.id === version.proposal_id);
    if (proposal && version.version === proposal.current_version) current.set(proposal.id, version);
  }
  return active.map((row) => ({ current: current.get(row.id), count: versions.filter((v) => v.proposal_id === row.id).length }));
}
function after() {
  const proposals = new Map(active.map((row) => [row.id, row]));
  const counts = new Map();
  const current = new Map();
  for (const version of versions) {
    const proposal = proposals.get(version.proposal_id);
    counts.set(version.proposal_id, (counts.get(version.proposal_id) || 0) + 1);
    if (proposal && version.version === proposal.current_version) current.set(proposal.id, version);
  }
  return active.map((row) => ({ current: current.get(row.id), count: counts.get(row.id) || 0 }));
}
assert.deepEqual(after(), before());
for (let i = 0; i < 50; i++) { before(); after(); }
function measure(fn) {
  const samples = [];
  for (let batch = 0; batch < 21; batch++) {
    const start = performance.now();
    for (let i = 0; i < 25; i++) fn();
    samples.push((performance.now() - start) / 25);
  }
  return samples.sort((a, b) => a - b)[10];
}
const beforeMs = measure(before), afterMs = measure(after);
console.log(JSON.stringify({ scope: 'synthetic in-memory join only', node: process.version, proposals: active.length,
  versions: versions.length, medianBeforeMs: beforeMs, medianAfterMs: afterMs, ratio: beforeMs / afterMs,
  equivalentResults: true }, null, 2));

// Extend the existing benchmark with the actual domain implementation, not an API imitation.
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
const proposals = Array.from({ length: 10 }, (_, i) => ({ id: `synthetic-${i}`, provider_name: `Instituição ${i} DEMO`, version: 1,
  terms: { institution: `Instituição ${i} DEMO`, index: 'pre', amortization: 'PRICE', offered_amount: 500000,
    interest_rate_month: 1.5 + i / 20, term_months: 24, grace_months: 0, fees_amount: 0 } }));
const saved = JSON.stringify(proposals);
const compare = () => buildComparison('credit', proposals, { amount: 500000 }, { asOf: '2026-10-20' });
const first = compare();
assert.equal(first.columns.length, 10); assert.equal(first.notice, NEUTRAL_RANKING_NOTICE);
assert.equal('ranking' in first || 'recommended' in first || 'best' in first, false);
const runStart = performance.now(), coldStart = performance.now(); compare(); const coldMs = performance.now() - coldStart;
for (let i = 0; i < 25; i++) compare();
const timings = [];
for (let i = 0; i < 200; i++) { const start = performance.now(); compare(); timings.push(performance.now() - start); }
assert.equal(JSON.stringify(proposals), saved, 'benchmark may not mutate proposal inputs');
assert.deepEqual(compare(), first, 'benchmark must preserve deterministic financial output');
const report = { schema: 1, sha: git(['rev-parse', 'HEAD']), branch: git(['branch', '--show-current']),
  worktree_dirty: Boolean(git(['status', '--porcelain', '--untracked-files=no'])), measured_at: new Date().toISOString(),
  environment: 'local-domain-cpu', region: 'not_applicable', dataset: 'synthetic-credit-10-v1',
  volume: { proposals: 10, contracts: 0, observations: 0 }, concurrent_users: 0, request_pattern: 'sequential domain calls; no HTTP',
  duration_ms: performance.now() - runStart, warmup_calls: 25, first_measured_call_after_correctness_check_ms: coldMs,
  measurement: distribution(timings), eligible_http_5xx: { result: 'NOT_MEASURED', denominator: 0 },
  executor: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.availableParallelism(), memory_bytes: os.totalmem(), peak_rss_bytes: process.resourceUsage().maxRSS * 1024 },
  baseline_comparison: { scope: 'legacy synthetic join only', median_before_ms: beforeMs, median_after_ms: afterMs },
  proposed_targets: PERFORMANCE_TARGETS, capacity_profiles: CAPACITY_PROFILES.map(p => ({ ...p, result: 'NOT_RUN' })),
  backend_api_latency: 'NOT_MEASURED', backend_capacity: 'NOT_PROVEN',
  limitation: 'Warm CPU microbenchmark on ephemeral executor; excludes API, JWT, RLS, DB, Storage and network. Not an end-to-end p95 or production capacity claim.' };
mkdirSync('reports/performance', { recursive: true });
writeFileSync('reports/performance/local-domain.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

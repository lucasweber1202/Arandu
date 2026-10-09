import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

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

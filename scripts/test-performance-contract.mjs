import assert from 'node:assert/strict';
import { distribution, eligibleErrorRate, PERFORMANCE_TARGETS, CAPACITY_PROFILES, installLabObservers, readLabMetrics } from './performance-contract.mjs';
import { publicationFailure, validateManifest, validateFlow, STAGES } from './publication-proof.mjs';
const samples = Array.from({ length: 100 }, (_, i) => i + 1).reverse();
assert.deepEqual(distribution(samples), { samples: 100, method: 'nearest-rank', p50_ms: 50, p95_ms: 95, p99_ms: 99 });
assert.equal(samples[0], 100, 'measurement must not reorder caller data');
for (const bad of [[], [NaN], [Infinity], [-1], ['1']]) assert.throws(() => distribution(bad));
assert.equal(eligibleErrorRate({ eligible: 0, server_errors: 0 }).result, 'NOT_MEASURED');
assert.equal(eligibleErrorRate({ eligible: 200, server_errors: 1 }).result, 'OUTSIDE_HYPOTHESIS');
assert.equal(eligibleErrorRate({ eligible: 201, server_errors: 1 }).result, 'WITHIN_HYPOTHESIS');
for (const bad of [{ eligible: 1, server_errors: 2 }, { eligible: -1, server_errors: 0 }, { eligible: 2.5, server_errors: 1 }]) assert.throws(() => eligibleErrorRate(bad));
assert.equal(PERFORMANCE_TARGETS.comparison_10_p95_ms, 2000);
const flow = { approved_sha: 'a'.repeat(40), steps: STAGES.map((stage, i) => ({ stage, path: i === 0 || i === STAGES.length - 1 ? '/' : '/demo/visita.html', text: 'Demo', ...(i ? { selector: '#next' } : {}) })) };
validateFlow(flow, flow.approved_sha);
flow.steps.splice(2, 0, { stage: 'context', path: '/demo/visita.html#contexto', text: 'Contexto', selector: '#contexto' });
validateFlow(flow, flow.approved_sha);
flow.steps.splice(3, 0, { ...flow.steps[2] });
assert.throws(() => validateFlow(flow, flow.approved_sha), /duplicated/);
assert.deepEqual(CAPACITY_PROFILES.slice(0, 2).map(p => p.concurrent_users), [30, 100]);
assert.throws(() => validateManifest({ commit: 'b'.repeat(40) }, 'a'.repeat(40)), { code: 'OUTDATED_SHA' });
for (const [message, expected] of [['HTTP 404: /demo/visita.html', 'ROUTE_FAILURE'], ['Artifact mismatch: /entry.js', 'ASSET_MISMATCH'], ['fetch failed', 'UNPROVEN']]) assert.equal(publicationFailure(new Error(message)), expected);
const savedWindow = globalThis.window, savedObserver = globalThis.PerformanceObserver;
try {
  const callbacks = {};
  globalThis.window = {};
  globalThis.PerformanceObserver = class {
    static supportedEntryTypes = ['largest-contentful-paint', 'layout-shift'];
    constructor(callback) { this.callback = callback; }
    observe({ type }) { callbacks[type] = this.callback; }
  };
  installLabObservers();
  callbacks['largest-contentful-paint']({ getEntries: () => [{ startTime: 120 }, { startTime: 250 }] });
  callbacks['layout-shift']({ getEntries: () => [500, 1400, 2300, 3200, 4100, 5000, 5900].map(startTime => ({ startTime, value: .1, hadRecentInput: false })).concat([{ startTime: 6000, value: .9, hadRecentInput: true }]) });
  const metrics = readLabMetrics();
  assert.equal(metrics.lcp_candidate_ms, 250);
  assert.ok(Math.abs(metrics.cls_observed - .6) < 1e-9, 'CLS uses five-second session windows starting at the first shift');
  assert.equal(metrics.inp, 'NOT_MEASURED');
} finally {
  if (savedWindow === undefined) delete globalThis.window; else globalThis.window = savedWindow;
  if (savedObserver === undefined) delete globalThis.PerformanceObserver; else globalThis.PerformanceObserver = savedObserver;
}
console.log('Performance evidence: quantiles, invalid samples, eligible denominator, strict target boundaries and publication failure taxonomy PASS.');

// v3.6 measurement contract. Targets are hypotheses, never a production SLA.
export const PERFORMANCE_TARGETS = Object.freeze({ lcp_p75_ms: 2500, inp_p75_ms: 200, cls_p75: 0.1,
  read_p95_ms: 500, write_p95_ms: 1000, comparison_10_p95_ms: 2000, eligible_5xx_ratio: 0.005 });
export const CAPACITY_PROFILES = Object.freeze([
  { id: 'pilot-30', organizations: 10, concurrent_users: 30 },
  { id: 'pilot-100', organizations: 50, concurrent_users: 100 },
  { id: 'lifecycle-volume', contracts: 10000, observations: 100000 }
]);
export function distribution(samples) {
  if (!Array.isArray(samples) || !samples.length || samples.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Finite nonnegative samples required');
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = p => sorted[Math.ceil(p * sorted.length) - 1];
  return { samples: sorted.length, method: 'nearest-rank', p50_ms: percentile(.5), p95_ms: percentile(.95), p99_ms: percentile(.99) };
}
export function eligibleErrorRate({ eligible, server_errors }) {
  if (!Number.isSafeInteger(eligible) || !Number.isSafeInteger(server_errors) || eligible < 0 || server_errors < 0 || server_errors > eligible) throw new Error('Invalid eligible error denominator');
  return { eligible, server_errors, ratio: eligible ? server_errors / eligible : null, result: eligible ? (server_errors / eligible < PERFORMANCE_TARGETS.eligible_5xx_ratio ? 'WITHIN_HYPOTHESIS' : 'OUTSIDE_HYPOTHESIS') : 'NOT_MEASURED' };
}
// Installed before application code. No analytics beacon, persistence or PII.
export function installLabObservers() {
  const state = { lcp_ms: null, cls: 0, cls_window: 0, window_start: null, last_shift: 0, supported: [] };
  Object.defineProperty(window, '__aranduLabMetrics', { value: state });
  for (const type of ['largest-contentful-paint', 'layout-shift']) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
    state.supported.push(type);
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (type === 'largest-contentful-paint') state.lcp_ms = entry.startTime;
        else if (!entry.hadRecentInput) {
          if (state.window_start === null || entry.startTime - state.last_shift >= 1000 || entry.startTime - state.window_start >= 5000) { state.cls_window = 0; state.window_start = entry.startTime; }
          state.cls_window += entry.value; state.last_shift = entry.startTime; state.cls = Math.max(state.cls, state.cls_window);
        }
      }
    }).observe({ type, buffered: true });
  }
}
export function readLabMetrics() {
  const state = window.__aranduLabMetrics;
  const nav = performance.getEntriesByType('navigation')[0];
  return { measurement: 'laboratory_navigation', population: 'single_navigation_not_RUM',
    lcp_candidate_ms: state?.lcp_ms ?? null, cls_observed: state?.supported.includes('layout-shift') ? state.cls : null,
    inp: 'NOT_MEASURED', p75: 'NOT_ESTIMATED_SINGLE_NAVIGATION',
    navigation: nav ? { ttfb_ms: nav.responseStart - nav.requestStart, dom_content_loaded_ms: nav.domContentLoadedEventEnd, load_ms: nav.loadEventEnd } : null };
}

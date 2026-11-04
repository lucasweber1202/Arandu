import assert from 'node:assert/strict';
import { profileBrowserLog } from './ci-browser-log-profile.mjs';
const secret='DO_NOT_LOG_PRIVATE_DATA';
const r=profileBrowserLog(`2026-01-01T00:00:00Z Running 3 tests using 2 workers\n2026-01-01T00:00:00Z   ✓ 1 [chromium-desktop] › tests/e2e/finance-contracts.spec.js:10:1 › ${secret} (2.5s)\n2026-01-01T00:00:00Z   ✘ 2 [firefox-desktop] › tests/e2e/finance-contracts.spec.js:10:1 › ${secret} (retry #1) (12ms)\n2026-01-01T00:00:00Z   - 3 [mobile-safari] › tests/e2e/finance-contracts.spec.js:10:1 › ${secret}\n2026-01-01T00:00:00Z   1) [chromium-desktop] › tests/e2e/finance-contracts.spec.js:10:1 › ${secret} (2.5s)`);
assert.equal(r.planned,3);assert.equal(r.workers,2);assert.equal(r.observed_attempts,2);assert.equal(r.observed_skips,1);assert.equal(r.specs[0].total_worker_ms,2500);assert.equal(r.specs[1].retry_attempts,1);assert(!JSON.stringify(r).includes(secret));
console.log('Historical browser profile: duration units, worker time, explicit skips, retries, no duplicate error heading or private title PASS.');

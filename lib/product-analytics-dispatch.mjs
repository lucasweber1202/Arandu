import { waitUntil } from '@vercel/functions';
import { createProductAnalytics } from './product-analytics.mjs';

// A singleton bounds traffic across concurrent invocations in the warm process.
const analytics = createProductAnalytics();
export function dispatchProductAnalytics(input, { env = process.env, client = null, defer = waitUntil } = {}) {
  try {
    const selected = client || (env === process.env ? analytics : createProductAnalytics({ env }));
    const work = selected.capture(input);
    // Vercel keeps the request alive without delaying the financial response.
    defer(Promise.resolve(work).catch(() => {}));
  } catch { /* analytics and lifecycle errors never propagate into transactions */ }
}

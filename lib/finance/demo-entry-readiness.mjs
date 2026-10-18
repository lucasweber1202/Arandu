import { BASELINE_VERSION } from './demo-workspaces.mjs';

// Same server-side secret policy as persona login; never return its value.
export function demoPersonaSecretReady(value) {
  return typeof value === 'string' && value.length >= 12 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
}

// Only unclaimed capacity is probed. A stale ready workspace must block entry:
// the claim RPC selects the oldest ready row, irrespective of baseline version.
export function demoPoolStatus(rows) {
  if (!Array.isArray(rows)) return 'inconclusive';
  if (!rows.length) return 'capacity_unavailable';
  if (rows.some(row => row?.status !== 'ready' || row?.baseline_version !== BASELINE_VERSION)) return 'incompatible';
  return 'ok';
}

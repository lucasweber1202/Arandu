import { BASELINE_VERSION, WORKSPACE_LIMITS, POOL_POLICY, personaEmailIn, isSlug } from './demo-workspaces.mjs';
import { BUYERS, PROVIDERS } from './demo-personas.mjs';

// Read only live claims and ready capacity. PostgreSQL evaluates "now" for
// expiry; bounded overflow is inconclusive, never a truncated positive proof.
export const DEMO_POOL_READINESS_PATH = `fin_demo_workspaces?select=slug,status,baseline_version,personas,user_ids,buyer_organization_id,provider_organization_ids,expires_at,idle_expires_at&or=(status.eq.ready,and(status.eq.claimed,expires_at.gt.now,idle_expires_at.gt.now))&order=ready_at.asc,id.asc&limit=${POOL_POLICY.maxTotal + 1}`;
export function demoPoolTotal(value) {
  const match = /^(?:\*|\d+-\d+)\/(\d+)$/.exec(String(value || ''));
  const total = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(total) && total >= 0 ? total : null;
}
const personaKeys = [...Object.keys(BUYERS), ...Object.keys(PROVIDERS)];
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const uniqueIds = (values, length) => Array.isArray(values) && values.length === length && values.every(uuid) && new Set(values).size === length;

export function demoWorkspaceIdentityReady(row) {
  return Boolean(typeof row?.slug === 'string' && isSlug(row.slug) && row.baseline_version === BASELINE_VERSION && uuid(row.buyer_organization_id)
    && uniqueIds(row.user_ids, personaKeys.length) && uniqueIds(row.provider_organization_ids, Object.keys(PROVIDERS).length)
    && !row.provider_organization_ids.includes(row.buyer_organization_id)
    && row.personas && Object.keys(row.personas).length === personaKeys.length
    && personaKeys.every(key => personaEmailIn(row, key)));
}

// Same server-side secret policy as persona login; never return its value.
export function demoPersonaSecretReady(value) {
  return typeof value === 'string' && value.length >= 12 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value);
}

// Readiness is not a reservation. Admission still belongs to the atomic RPC.
export function demoPoolStatus(rows, { now = Date.now(), total } = {}) {
  if (!Array.isArray(rows)) return 'inconclusive';
  if (!Number.isSafeInteger(total) || total !== rows.length) return 'inconclusive';
  if (!Number.isFinite(now) || rows.length > POOL_POLICY.maxTotal) return 'inconclusive';
  if (!rows.length) return 'capacity_unavailable';
  let ready = 0, claimed = 0;
  const slugs = new Set(), users = new Set(), organizations = new Set();
  for (const row of rows) {
    if (!row || !['ready', 'claimed'].includes(row.status)) return 'incompatible';
    if (row.status === 'claimed') {
      const absolute = Date.parse(row.expires_at), idle = Date.parse(row.idle_expires_at);
      if (!Number.isFinite(absolute) || !Number.isFinite(idle)) return 'inconclusive';
      // Expiry is filtered by PostgreSQL in the query. If the received snapshot
      // already expired, never drop claims using the application clock and
      // accidentally turn an occupied pool into a positive capacity proof.
      if (absolute <= now || idle <= now) return 'inconclusive';
      if (idle > absolute) return 'incompatible';
    }
    if (!demoWorkspaceIdentityReady(row) || slugs.has(row.slug)) return 'incompatible';
    slugs.add(row.slug);
    for (const id of row.user_ids) { if (users.has(id)) return 'incompatible'; users.add(id); }
    for (const id of [row.buyer_organization_id, ...row.provider_organization_ids]) { if (organizations.has(id)) return 'incompatible'; organizations.add(id); }
    if (row.status === 'ready') ready++; else claimed++;
  }
  return ready && claimed < WORKSPACE_LIMITS.maxActive ? 'ok' : 'capacity_unavailable';
}

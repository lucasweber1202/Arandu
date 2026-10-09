import { createHmac } from 'node:crypto';
import { resolveRuntime } from './runtime-mode.mjs';

// Deliberately not an audit log. No browser SDK, autocapture, replay, person
// profiles, arbitrary API payloads or automatic financial recommendations.
export const ANALYTICS_EVENTS = Object.freeze({
  organization_created: Object.freeze({ organization_kind: Object.freeze(['BUYER', 'PROVIDER']) }),
  rfq_created: Object.freeze({ product: Object.freeze(['credit', 'acquiring']) }),
  proposal_submitted: Object.freeze({ product: Object.freeze(['credit', 'acquiring']) }),
  proposal_comparison_generated: Object.freeze({ product: Object.freeze(['credit', 'acquiring']) }),
  decision_recorded: Object.freeze({ product: Object.freeze(['credit', 'acquiring']) })
});
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const HOSTS = new Set(['https://us.i.posthog.com', 'https://eu.i.posthog.com']);
const MAX_BYTES = 2048;
const MAX_PENDING = 16;
const MAX_RECENT = 512;
const WINDOW_MS = 60000;

export function analyticsConfig(env = process.env) {
  if (!resolveRuntime(env).canCollectProductAnalytics || env.ARANDU_ANALYTICS_ENABLED !== 'true') return null;
  // A reviewed, documented gate is required in addition to a project token.
  if (env.ARANDU_ANALYTICS_PROJECT_ENV !== 'production'
    || !/^privacy-review:[a-z0-9-]{3,80}$/.test(env.ARANDU_ANALYTICS_PRIVACY_REVIEW || '')
    || !HOSTS.has(env.POSTHOG_HOST)
    || !/^phc_[A-Za-z0-9_-]{20,200}$/.test(env.POSTHOG_PROJECT_TOKEN || '')
    || !/^[a-f0-9]{64,128}$/i.test(env.ARANDU_ANALYTICS_HMAC_KEY || '')
    || !/^[1-9][0-9]{0,3}$/.test(env.ARANDU_ANALYTICS_KEY_VERSION || '')) return null;
  return Object.freeze({ host: env.POSTHOG_HOST, token: env.POSTHOG_PROJECT_TOKEN,
    key: env.ARANDU_ANALYTICS_HMAC_KEY, version: env.ARANDU_ANALYTICS_KEY_VERSION,
    release: /^[a-f0-9]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA || '') ? env.VERCEL_GIT_COMMIT_SHA : null });
}

const digest = (config, value) => createHmac('sha256', Buffer.from(config.key, 'hex')).update(value).digest('hex');

/** Only server-verified IDs may reach this function. Properties are strict enums. */
export function buildAnalyticsEvent(config, { event, actorId, organizationId, operationId, operationVersion = 1, properties = {} } = {}) {
  if (!config || !Object.hasOwn(ANALYTICS_EVENTS, event)
    || !UUID.test(actorId || '') || !UUID.test(organizationId || '') || !UUID.test(operationId || '')
    || !Number.isSafeInteger(operationVersion) || operationVersion < 1
    || !properties || typeof properties !== 'object' || Array.isArray(properties)) return null;
  const schema = ANALYTICS_EVENTS[event];
  if (Object.keys(properties).some((key) => !Object.hasOwn(schema, key))) return null;
  if (Object.entries(schema).some(([key, values]) => !values.includes(properties[key]))) return null;
  const prefix = `arandu:production:v${config.version}`;
  // The same person in two tenants has two unrelated analytics identities.
  const distinctId = digest(config, `${prefix}:actor:${organizationId}:${actorId}`);
  const org = digest(config, `${prefix}:organization:${organizationId}`);
  const eventId = digest(config, `${prefix}:event:${organizationId}:${actorId}:${event}:${operationId}:${operationVersion}`);
  const payload = { api_key: config.token, event: `arandu.${event}.v1`, distinct_id: distinctId,
    properties: { ...properties, environment: 'production', schema_version: 1,
      identity_key_version: config.version, organization_key: org, event_key: eventId,
      ...(config.release ? { release: config.release } : {}),
      $process_person_profile: false, $geoip_disable: true } };
  return Buffer.byteLength(JSON.stringify(payload)) <= MAX_BYTES ? payload : null;
}

/** Bounded, best-effort delivery. Never used as evidence of financial persistence. */
export function createProductAnalytics({ env = process.env, fetchImpl = (...args) => fetch(...args), now = Date.now,
  timeoutMs = 800, report = () => {} } = {}) {
  const recent = new Map();
  let pending = 0;
  const timeout = Number.isInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 2000 ? timeoutMs : 800;
  async function capture(input) {
    let controller;
    let timer;
    try {
      const config = analyticsConfig(env);
      if (!config) return { status: 'disabled' };
      const payload = buildAnalyticsEvent(config, input);
      if (!payload) return { status: 'invalid' };
      const time = now();
      for (const [key, expires] of recent) if (expires <= time) recent.delete(key);
      const key = payload.properties.event_key;
      if (recent.has(key)) return { status: 'duplicate' };
      // Bounds both concurrency and traffic per process/window. No unbounded queue.
      if (pending >= MAX_PENDING || recent.size >= MAX_RECENT) return { status: 'limited' };
      recent.set(key, time + WINDOW_MS);
      pending++;
      controller = new AbortController();
      const timeoutResult = new Promise((resolve) => {
        timer = setTimeout(() => { controller.abort(); resolve({ status: 'timeout' }); }, timeout);
      });
      const delivery = Promise.resolve().then(() => fetchImpl(`${config.host}/i/v0/e/`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), redirect: 'error', signal: controller.signal
      })).then(async (response) => {
        // No upstream response body or error message is logged or retained.
        await response.body?.cancel?.();
        return { status: response.ok ? 'sent' : 'failed' };
      }).catch(() => ({ status: controller.signal.aborted ? 'timeout' : 'failed' }));
      const result = await Promise.race([delivery, timeoutResult]);
      try { report(result.status); } catch { /* diagnostics cannot break business work */ }
      return result;
    } catch {
      return { status: 'failed' };
    } finally {
      if (timer) clearTimeout(timer);
      if (controller) pending--;
    }
  }
  return Object.freeze({ capture });
}

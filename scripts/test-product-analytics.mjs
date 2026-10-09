import assert from 'node:assert/strict';
import { createProductAnalytics, analyticsConfig, buildAnalyticsEvent, ANALYTICS_EVENTS } from '../lib/product-analytics.mjs';
import { dispatchProductAnalytics } from '../lib/product-analytics-dispatch.mjs';
import { sanitizeSpeedInsight } from '../lib/speed-insights-privacy.mjs';
import { hermeticEnv } from './run-hermetic.mjs';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const ORG = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const OP = '00000000-0000-4000-8000-000000000004';
const env = { ARANDU_ENV: 'production', VERCEL_ENV: 'production', ARANDU_ANALYTICS_ENABLED: 'true',
  ARANDU_ANALYTICS_PROJECT_ENV: 'production', ARANDU_ANALYTICS_PRIVACY_REVIEW: 'privacy-review:offline-test',
  POSTHOG_HOST: 'https://us.i.posthog.com', POSTHOG_PROJECT_TOKEN: `phc_${'x'.repeat(30)}`,
  ARANDU_ANALYTICS_HMAC_KEY: 'ab'.repeat(32), ARANDU_ANALYTICS_KEY_VERSION: '1', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) };
const input = { event: 'rfq_created', actorId: ACTOR, organizationId: ORG, operationId: OP, properties: { product: 'credit' } };
let calls = [];
const fetchImpl = async (url, options) => { calls.push({ url, options }); return new Response('', { status: 200 }); };
const make = (extra = {}) => createProductAnalytics({ env, fetchImpl, ...extra });

for (const change of [{}, { VERCEL_ENV: 'preview' }, { VERCEL_ENV: 'development' }, { VERCEL_ENV: '' },
  { ARANDU_ENV: 'demo' }, { ARANDU_ENV: 'pilot' }, { ARANDU_ENV: '' },
  { ARANDU_ENV: 'invalid' }, { ARANDU_DEPLOYMENT_KIND: 'demo' }, { ARANDU_ANALYTICS_ENABLED: 'false' },
  { ARANDU_ANALYTICS_PROJECT_ENV: 'demo' }, { ARANDU_ANALYTICS_PRIVACY_REVIEW: '' },
  { POSTHOG_HOST: 'https://127.0.0.1' }, { POSTHOG_HOST: 'https://us.i.posthog.com@evil.invalid' },
  { POSTHOG_HOST: 'https://us.i.posthog.com/path' }, { POSTHOG_PROJECT_TOKEN: '' },
  { ARANDU_ANALYTICS_HMAC_KEY: '' }, { ARANDU_ANALYTICS_KEY_VERSION: 'email@example.com' }]) {
  const configured = Object.keys(change).length ? { ...env, ...change } : {};
  assert.equal(analyticsConfig(configured), null);
  assert.equal((await make({ env: configured }).capture(input)).status, 'disabled');
}
assert.equal(calls.length, 0, 'disabled environments never contact PostHog');
const config = analyticsConfig(env);
const payload = buildAnalyticsEvent(config, input);
assert.equal(payload.event, 'arandu.rfq_created.v1');
assert.equal(payload.properties.$process_person_profile, false);
assert.equal(payload.properties.$geoip_disable, true);
const serialized = JSON.stringify(payload);
for (const value of [ACTOR, ORG, OP, env.ARANDU_ANALYTICS_HMAC_KEY]) assert.ok(!serialized.includes(value));
assert.equal(payload.distinct_id.length, 64);
const other = buildAnalyticsEvent(config, { ...input, organizationId: OTHER });
assert.notEqual(payload.distinct_id, other.distinct_id);
assert.notEqual(payload.properties.organization_key, other.properties.organization_key);
assert.notEqual(payload.properties.event_key, other.properties.event_key);
assert.notEqual(payload.distinct_id, buildAnalyticsEvent(analyticsConfig({ ...env, ARANDU_ANALYTICS_KEY_VERSION: '2' }), input).distinct_id);
for (const key of ['email', 'phone', 'cpf', 'cnpj', 'amount', 'terms', 'token', 'cookie', 'url', 'stack', 'comment', 'organization_id', '__proto__']) {
  const props = Object.create(null); props.product = 'credit'; props[key] = 'SENSITIVE';
  assert.equal(buildAnalyticsEvent(config, { ...input, properties: props }), null, key);
}
for (const properties of [null, [], 'credit', {}, { product: 'secret' }, { product: { email: 'private' } }, { product: 'x'.repeat(10000) }]) {
  assert.equal(buildAnalyticsEvent(config, { ...input, properties }), null);
}
for (const extra of [{ actorId: 'email@example.com' }, { organizationId: 'not-authorized' }, { operationId: 'token' },
  { event: 'arbitrary' }, { operationVersion: -1 }, { operationVersion: Infinity }]) {
  assert.equal(buildAnalyticsEvent(config, { ...input, ...extra }), null);
}
for (const [event, fields] of Object.entries(ANALYTICS_EVENTS)) {
  const properties = Object.fromEntries(Object.entries(fields).map(([key, values]) => [key, values[0]]));
  assert.ok(buildAnalyticsEvent(config, { ...input, event, properties }));
}
const client = make();
assert.equal((await client.capture(input)).status, 'sent');
assert.equal((await client.capture(input)).status, 'duplicate');
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'https://us.i.posthog.com/i/v0/e/');
assert.equal(calls[0].options.redirect, 'error');
assert.deepEqual(Object.keys(calls[0].options.headers), ['Content-Type']);
assert.equal((await client.capture({ ...input, operationVersion: 2 })).status, 'sent', 'new proposal version is a new event');
assert.equal((await make({ fetchImpl: async () => { throw new Error('secret token'); } }).capture(input)).status, 'failed');
assert.equal((await make({ fetchImpl: async () => new Response('', { status: 429 }) }).capture(input)).status, 'failed');
assert.equal((await make({ report: () => { throw new Error('logger unavailable'); } }).capture(input)).status, 'sent');
let timeoutSignal;
assert.equal((await make({ timeoutMs: 5, fetchImpl: (_url, opts) => { timeoutSignal = opts.signal; return new Promise(() => {}); } }).capture(input)).status, 'timeout');
assert.ok(timeoutSignal.aborted);
let clock = 0;
const expiring = make({ now: () => clock });
assert.equal((await expiring.capture(input)).status, 'sent'); clock = 60001;
assert.equal((await expiring.capture(input)).status, 'sent');
const slow = make({ timeoutMs: 10, fetchImpl: () => new Promise(() => {}) });
const pending = Array.from({ length: 16 }, (_, i) => slow.capture({ ...input, operationVersion: i + 1 }));
assert.equal((await slow.capture({ ...input, operationVersion: 17 })).status, 'limited');
await Promise.all(pending);
const bounded = make({ now: () => 1 });
for (let i = 1; i <= 512; i++) assert.equal((await bounded.capture({ ...input, operationVersion: i })).status, 'sent');
assert.equal((await bounded.capture({ ...input, operationVersion: 513 })).status, 'limited');
let held;
dispatchProductAnalytics(input, { client: { capture: () => new Promise((resolve) => { held = resolve; }) }, defer: (promise) => { assert.ok(promise instanceof Promise); } });
assert.ok(held, 'dispatch returns without waiting for transport'); held({ status: 'sent' });
dispatchProductAnalytics(input, { client: { capture: () => { throw new Error('adapter down'); } } });
let deferred;
dispatchProductAnalytics(input, { client: { capture: () => Promise.reject(new Error('network')) }, defer: (p) => { deferred = p; } });
await deferred;
assert.deepEqual(hermeticEnv({ POSTHOG_PROJECT_TOKEN: 'private', POSTHOG_HOST: 'host', ARANDU_ANALYTICS_HMAC_KEY: 'key', PATH: '/bin' }), { PATH: '/bin' });
const vital = sanitizeSpeedInsight({ type: 'vital', url: 'https://app.example.com/finance/rfq.html?token=SECRET&organization_id=PRIVATE#auth', route: '/SECRET', arbitrary: 'SECRET' });
assert.deepEqual(vital, { type: 'vital', url: 'https://app.example.com/finance/rfq.html', route: '/finance/rfq.html' });
for (const url of ['https://app.example.com/provider/invite.html?token=x', 'https://app.example.com/login.html#access_token=x',
  'https://app.example.com/cadastro.html', 'https://app.example.com/demo/index.html', 'https://app.example.com/finance/rfq/PRIVATE', 'javascript:alert(1)', 'invalid']) {
  assert.equal(sanitizeSpeedInsight({ type: 'vital', url }), null);
}
console.log('Product analytics: privacy, runtime isolation, schemas, dedup, bounded delivery, timeout, failure and Web Vitals URLs passed.');

assert.equal(sanitizeSpeedInsight({ type: 'vital', url: 'https://app.example.com/finance/private-name.html' }), null);

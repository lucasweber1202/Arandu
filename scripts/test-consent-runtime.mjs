import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync('js/platform-runtime.js', 'utf8');

async function runtime({ consent, dnt = '0', initialConsent = null }) {
  const values = new Map();
  if (initialConsent) values.set('arandu.privacy.consent.v1', JSON.stringify(initialConsent));
  const requests = [];
  const banners = [];
  const document = {
    readyState: 'complete',
    body: { appendChild(node) { banners.push(node); }, prepend() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() {
      return {
        className: '',
        dataset: {},
        innerHTML: '',
        setAttribute() {},
        remove() {}
      };
    },
    addEventListener() {}
  };
  const context = {
    document,
    window: { dispatchEvent() {} },
    navigator: { doNotTrack: dnt },
    location: { pathname: '/', search: '' },
    localStorage: {
      getItem(key) { return values.get(key) || null; },
      setItem(key, value) { values.set(key, String(value)); }
    },
    crypto: webcrypto,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
    URLSearchParams,
    fetch: async (url, options = {}) => {
      requests.push({ url, options });
      if (url === '/api/public-config') {
        return { ok: true, json: async () => ({ consent }) };
      }
      if (url === '/api/conversion-events') return { ok: true, json: async () => ({ ok: true }) };
      throw new Error(`Unexpected URL: ${url}`);
    },
    console
  };
  vm.runInNewContext(source, context, { filename: 'js/platform-runtime.js' });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return { api: context.window.ARANDU_PRIVACY, requests, banners, values };
}

const canonical = '2026-08-14';
const configured = await runtime({
  consent: { configured: true, version: canonical },
  initialConsent: { version: '2026-07-17', essential: true, analytics: true }
});
assert.equal(configured.api.readConsent(), null, 'old consent must be rejected');
const accepted = configured.api.saveConsent(true);
assert.equal(accepted.version, canonical);
assert.equal(accepted.analytics, true);
assert.equal(await configured.api.track('catalog_view'), true);
const conversion = configured.requests.find((item) => item.url === '/api/conversion-events');
assert.equal(JSON.parse(conversion.options.body).consentVersion, canonical);

const refused = await runtime({ consent: { configured: true, version: canonical } });
assert.equal(refused.api.saveConsent(false).analytics, false);
assert.equal(await refused.api.track('catalog_view'), false);

const dnt = await runtime({ consent: { configured: true, version: canonical }, dnt: '1' });
dnt.api.saveConsent(true);
assert.equal(await dnt.api.track('catalog_view'), false);
assert.equal(dnt.requests.some((item) => item.url === '/api/conversion-events'), false);

const missing = await runtime({ consent: { configured: false, version: null } });
assert.equal(missing.api.saveConsent(true).analytics, false);
assert.equal(missing.banners[0].innerHTML.includes('data-consent-analytics'), false);
assert.equal(await missing.api.track('catalog_view'), false);

assert.doesNotMatch(source, /const CONSENT_VERSION\s*=\s*['"]/);
console.log('Consent runtime uses canonical public config, rejects old versions and preserves Do Not Track.');

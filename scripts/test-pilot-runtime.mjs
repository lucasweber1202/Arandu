import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync('js/pilot.js', 'utf8');

async function runPilot({ meta, publicConfig }) {
  let gates = 0;
  const classList = { add() {} };
  const form = { addEventListener() {} };
  const document = {
    readyState: 'complete',
    documentElement: { classList },
    body: { appendChild() { gates += 1; } },
    querySelector(selector) {
      if (selector === 'meta[name="arandu-pilot-enabled"]') return meta === null ? null : { content: meta };
      return null;
    },
    querySelectorAll() { return []; },
    createElement() {
      return { className: '', dataset: {}, innerHTML: '', querySelector() { return form; }, remove() {} };
    },
    addEventListener() {}
  };
  const storage = new Map();
  const context = {
    document,
    window: {},
    navigator: { doNotTrack: '0' },
    location: { pathname: '/' },
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, String(value)); }
    },
    crypto: webcrypto,
    FormData: class {},
    fetch: async (url) => {
      if (url === '/api/public-config') {
        if (publicConfig instanceof Error) throw publicConfig;
        return { ok: true, json: async () => publicConfig };
      }
      throw new Error(`Unexpected URL: ${url}`);
    },
    console
  };
  vm.runInNewContext(source, context, { filename: 'js/pilot.js' });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  return gates;
}

assert.equal(await runPilot({ meta: 'false', publicConfig: new Error('offline') }), 0);
assert.equal(await runPilot({ meta: null, publicConfig: new Error('offline') }), 0);
assert.equal(await runPilot({ meta: 'true', publicConfig: new Error('offline') }), 1);
assert.equal(await runPilot({ meta: 'false', publicConfig: { pilot: { enabled: false } } }), 0);

assert.doesNotMatch(source, /window\.ARANDU_PILOT_ENABLED/);
assert.match(source, /meta\[name="arandu-pilot-enabled"\]/);
console.log('Pilot runtime fallback is CSP-safe and preview-safe.');

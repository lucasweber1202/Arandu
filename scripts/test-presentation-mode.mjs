import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertPresentationModeIsSafe, presentationModeEnabled } from '../lib/presentation-mode.mjs';

assert.equal(presentationModeEnabled({ ARANDU_PRESENTATION_MODE: 'true', VERCEL_ENV: 'preview' }), true);
assert.equal(presentationModeEnabled({ ARANDU_PRESENTATION_MODE: 'true', VERCEL_ENV: 'production' }), false);
assert.equal(presentationModeEnabled({ ARANDU_PRESENTATION_MODE: 'false', VERCEL_ENV: 'preview' }), false);
assert.throws(() => assertPresentationModeIsSafe({
  ARANDU_PRESENTATION_MODE: 'true', VERCEL_ENV: 'production'
}), /não pode ser ativado em produção/);

const vite = readFileSync('vite.config.js', 'utf8');
const copy = readFileSync('scripts/copy-runtime-assets.mjs', 'utf8');
assert.match(vite, /assertPresentationModeIsSafe\(\)/);
assert.match(vite, /presentationMode && \/\^\(finance\|provider\)/);
assert.match(copy, /if \(assertPresentationModeIsSafe\(\)\)/);
assert.match(copy, /data\/finance\/demo\.json/);
assert.doesNotMatch(copy, /artworks\.json|artists\.json|certificates\.json/);
console.log('Finance demo mode: explicit preview fixture and production fail-closed validated.');

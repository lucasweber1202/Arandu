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
assert.match(copy, /assertPresentationModeIsSafe\(\)/);
// O portal real não tem mais conjunto de dados de demonstração embutido: o
// dado fictício vive apenas no motor da demonstração, em /demo.
assert.doesNotMatch(copy, /data\/finance\/demo\.json/);
assert.doesNotMatch(readFileSync('finance/app.js', 'utf8'), /demo\.json|arandu-presentation-mode/);
assert.doesNotMatch(copy, /artworks\.json|artists\.json|certificates\.json/);
console.log('Presentation mode: preview-only flag, production fail-closed and no fixture inside the real portal validated.');

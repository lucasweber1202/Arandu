import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertPresentationModeIsSafe, presentationModeEnabled } from '../lib/presentation-mode.mjs';

assert.equal(presentationModeEnabled({ ARANDU_PRESENTATION_MODE: 'true', VERCEL_ENV: 'preview' }), true);
assert.equal(presentationModeEnabled({ ARANDU_PRESENTATION_MODE: 'true', VERCEL_ENV: 'production' }), false);
assert.equal(presentationModeEnabled({ ARANDU_PRESENTATION_MODE: 'false', VERCEL_ENV: 'preview' }), false);
assert.throws(() => assertPresentationModeIsSafe({ ARANDU_PRESENTATION_MODE: 'true', VERCEL_ENV: 'production' }), /não pode ser ativado em produção/);

const catalog = fs.readFileSync('js/catalog-source.js', 'utf8');
const reservations = fs.readFileSync('js/catalog-page.js', 'utf8');
const internal = fs.readFileSync('api/internal-page.js', 'utf8');
const copy = fs.readFileSync('scripts/copy-runtime-assets.mjs', 'utf8');
const release = JSON.parse(fs.readFileSync('data/catalog-release.json', 'utf8'));
assert.match(catalog, /dataset_kind: 'demonstration'/);
assert.match(reservations, /Nenhuma reserva, contato ou transação foi enviada/);
assert.match(internal, /PRESENTATION_PAGES = new Set\(\['demo\.html', 'admin-preview\.html'\]\)/);
assert.match(copy, /existsSync\(demoCertificates\) && !presentationMode/);
assert.notEqual(release.datasetKind, 'real');
assert.notEqual(release.verifiedReady, true);
// A cópia estática de demo.html/admin-preview.html vence o rewrite do Vercel.
// Se ela sair sem a marcação, a demonstração perde o banner que a identifica —
// por isso as duas rotas precisam usar a mesma injeção.
const { withPresentationAssets } = await import('../lib/presentation-mode.mjs');
const marked = withPresentationAssets('<html><head></head><body><main>x</main></body></html>');
assert.match(marked, /name="arandu-presentation-mode" content="true"/);
assert.match(marked, /presentation-runtime\.js/);
assert.equal(withPresentationAssets(marked), marked, 'a marcação não pode ser duplicada');
assert.match(internal, /withPresentationAssets/);
assert.match(copy, /withPresentationAssets/);

console.log('Presentation mode: separação, fail-closed e rotulagem demonstrativa validadas.');

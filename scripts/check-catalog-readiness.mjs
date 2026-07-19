import fs from 'node:fs';
import path from 'node:path';
import { evaluateCatalogRelease } from './lib/catalog-readiness.mjs';

const root = process.cwd();
const strict = process.argv.includes('--require-verified') || process.env.ARANDU_REQUIRE_VERIFIED_CATALOG === '1';
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const result = evaluateCatalogRelease({
  artists: read('data/artists.json'),
  artworks: read('data/artworks.json'),
  release: read('data/catalog-release.json')
});

console.log('Arandu Catalog Readiness');
console.log(`Registros: ${result.counts.artists} artistas e ${result.counts.artworks} obras.`);
console.log(`Verificados: ${result.counts.verifiedArtists}/${result.minimums.artists} artistas e ${result.counts.verifiedArtworks}/${result.minimums.artworks} obras.`);
console.log(`verifiedReady: ${result.verifiedReady}`);

if (result.issues.length) {
  console.warn('\nPendências de catálogo real:');
  result.issues.forEach((issue) => console.warn(`- ${issue}`));
}

if (strict && !result.verifiedReady) {
  console.error('\nPublicação bloqueada: o catálogo ainda não foi comprovado como real e autorizado.');
  process.exit(1);
}

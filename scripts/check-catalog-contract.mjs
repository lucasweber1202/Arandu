import fs from 'node:fs';

const issues = [];
const read = (file) => fs.readFileSync(file, 'utf8');
const api = read('api/[...path].js');
const collectionsApi = read('api/collections.js');
const health = read('api/health.js');
const migration = read('docs/supabase-sprint2-catalog-readiness.sql');
const collectionsMigration = read('docs/arandu-mvp-collections.sql');
const searchIndex = JSON.parse(read('data/search-index.json'));
const publicLoaders = [
  'js/catalog-page.js',
  'js/artists-page.js',
  'js/artwork_page.js',
  'js/autor.js',
  'js/collection-detail.js',
  'js/catalog-filters.js',
  'js/arandu-recommendations.js',
  'js/arandu-guided-curation.js',
  'js/quiz-curatorial.js',
  'js/public-proposal.js',
  'js/static-search.js'
];

function requireTerm(file, source, term, message) {
  if (!source.includes(term)) issues.push(`${file}: ${message}`);
}

requireTerm('api/[...path].js', api, 'async function catalogReadiness', 'não exige o gate de catálogo.');
requireTerm('api/[...path].js', api, "'catalog_not_verified'", 'não sinaliza catálogo ainda não verificado.');
requireTerm('api/[...path].js', api, 'verifiedReady: true', 'não confirma prontidão na resposta pública.');
requireTerm('api/health.js', health, 'v_catalog_readiness', 'não verifica o release de catálogo.');
requireTerm('api/health.js', health, 'v_public_collections', 'não verifica a view pública de coleções.');
requireTerm('api/collections.js', collectionsApi, 'v_catalog_readiness', 'não exige o gate de catálogo.');
requireTerm('api/collections.js', collectionsApi, 'v_public_collections', 'não consulta a view pública segura.');
requireTerm('api/collections.js', collectionsApi, 'verifiedReady: true', 'não confirma prontidão na resposta pública.');
requireTerm('docs/supabase-sprint2-catalog-readiness.sql', migration, 'write_verified_at', 'não exige teste real de escrita.');
requireTerm('docs/supabase-sprint2-catalog-readiness.sql', migration, 'verified_artwork_count >= 20', 'não exige 20 obras verificadas.');
requireTerm('docs/supabase-sprint2-catalog-readiness.sql', migration, 'verified_artist_count >= 5', 'não exige 5 artistas verificados.');
requireTerm('docs/supabase-sprint2-catalog-readiness.sql', migration, 'create view public.v_public_artists', 'não cria view segura de artistas.');
requireTerm('docs/supabase-sprint2-catalog-readiness.sql', migration, 'revoke select on public.artists', 'não bloqueia leitura direta dos campos internos de artistas.');
requireTerm('docs/supabase-sprint2-catalog-readiness.sql', migration, 'revoke select on public.artworks', 'não bloqueia leitura direta dos campos internos de obras.');
requireTerm('docs/arandu-mvp-collections.sql', collectionsMigration, 'join v_public_catalog', 'coleções não dependem do catálogo público seguro.');
requireTerm('docs/arandu-mvp-collections.sql', collectionsMigration, 'revoke select on curated_collections', 'não bloqueia leitura direta das coleções internas.');
if (/create view public\.v_public_catalog as\s+select\s+[^;]*\.\*/s.test(migration)) {
  issues.push('docs/supabase-sprint2-catalog-readiness.sql: view pública ainda usa * em vez de uma lista segura de colunas.');
}

for (const file of publicLoaders) {
  const source = read(file);
  if (/fetch\(['"]data\/(artworks|artists)\.json/.test(source)) {
    issues.push(`${file}: ainda publica fixture local quando a API falha.`);
  }
}

if (/handleCatalog[^\n]+mode:\s*['"]demo/.test(api) || /handleArtists[^\n]+mode:\s*['"]demo/.test(api)) {
  issues.push('api/[...path].js: catálogo público ainda responde como demonstração.');
}

if (/FALLBACK_COLLECTIONS|mode:\s*['"](?:demo|fallback)['"]/.test(collectionsApi)) {
  issues.push('api/collections.js: coleções públicas ainda possuem fallback demonstrativo.');
}

if (!Array.isArray(searchIndex) || searchIndex.some((item) => ['Obra', 'Artista'].includes(item?.type))) {
  issues.push('data/search-index.json: índice estático não pode publicar obras ou artistas não verificados.');
}

console.log('Arandu Catalog Contract Check');
console.log(`Erros: ${issues.length}`);
issues.forEach((issue) => console.error(`- ${issue}`));
if (issues.length) process.exit(1);

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const issues = [];
const warnings = [];

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function assert(condition, message) {
  if (!condition) issues.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

const artists = readJson('data/artists.json');
const artworks = readJson('data/artworks.json');
const certificates = readJson('data/certificates.json');

const artistIds = new Set(artists.map((artist) => artist.id));
const artworkIds = new Set(artworks.map((artwork) => artwork.id));
const certificateCodes = new Set();

assert(Array.isArray(artists), 'data/artists.json precisa ser uma lista.');
assert(Array.isArray(artworks), 'data/artworks.json precisa ser uma lista.');
assert(Array.isArray(certificates), 'data/certificates.json precisa ser uma lista.');

warn(artists.length >= 12, `Base curatorial curta: ${artists.length} artistas cadastrados; recomendado mínimo 12 antes de produção.`);
warn(artworks.length >= 20, `Acervo curto: ${artworks.length} obras cadastradas; recomendado mínimo 20 antes de produção.`);

artists.forEach((artist) => {
  assert(artist.id, 'Artista sem id.');
  assert(artist.name, `${artist.id}: artista sem name.`);
  assert(artist.city, `${artist.id}: artista sem city.`);
  warn(Array.isArray(artist.languages) && artist.languages.length >= 2, `${artist.id}: informar pelo menos duas linguagens/eixos.`);
  warn(artist.profile && artist.trajectory, `${artist.id}: perfil e trajetória devem estar preenchidos.`);
  warn(artist.statement, `${artist.id}: statement curatorial ausente.`);
});

artworks.forEach((artwork) => {
  assert(artwork.id, 'Obra sem id.');
  assert(artwork.title, `${artwork.id}: obra sem title.`);
  assert(artwork.artistId, `${artwork.id}: obra sem artistId.`);
  assert(artistIds.has(artwork.artistId), `${artwork.id}: artistId inexistente (${artwork.artistId}).`);
  assert(artwork.url === `obra.html?id=${artwork.id}`, `${artwork.id}: URL deve ser canônica obra.html?id=${artwork.id}.`);
  assert(artwork.type && artwork.technique && artwork.dimensions, `${artwork.id}: ficha técnica incompleta.`);
  assert(artwork.status, `${artwork.id}: status ausente.`);
  warn(Array.isArray(artwork.tags) && artwork.tags.length >= 3, `${artwork.id}: informar pelo menos três tags.`);
  warn(Array.isArray(artwork.spaces) && artwork.spaces.length >= 1, `${artwork.id}: informar ambientes recomendados.`);
  warn(artwork.summary && artwork.curatorialReading, `${artwork.id}: resumo e leitura curatorial devem estar preenchidos.`);
});

certificates.forEach((certificate) => {
  assert(certificate.code, 'Certificado sem code.');
  assert(!certificateCodes.has(certificate.code), `${certificate.code}: certificado duplicado.`);
  certificateCodes.add(certificate.code);
  assert(certificate.artwork_id, `${certificate.code}: certificado sem artwork_id.`);
  assert(artworkIds.has(certificate.artwork_id), `${certificate.code}: artwork_id inexistente (${certificate.artwork_id}).`);
  warn(certificate.verification_status, `${certificate.code}: status de verificação ausente.`);
});

console.log('Arandu Data Check');
console.log(`Artistas: ${artists.length}`);
console.log(`Obras: ${artworks.length}`);
console.log(`Certificados: ${certificates.length}`);
console.log(`Erros: ${issues.length}`);
console.log(`Alertas: ${warnings.length}`);

if (issues.length) {
  console.error('\nErros:');
  issues.forEach((issue) => console.error(`- ${issue}`));
}

if (warnings.length) {
  console.warn('\nAlertas:');
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (issues.length) process.exit(1);

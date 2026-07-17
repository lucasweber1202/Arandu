import fs from 'node:fs';
import path from 'node:path';
import { evaluateCatalogRelease } from './lib/catalog-readiness.mjs';

const root = process.cwd();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
const DRY_RUN = process.argv.includes('--dry-run') || process.env.ARANDU_SEED_DRY_RUN === '1';
const RESET = process.argv.includes('--reset') || process.env.ARANDU_SEED_RESET === '1';

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
}

function requiredEnv() {
  if (DRY_RUN) return;
  const missing = [];
  if (!SUPABASE_URL) missing.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) {
    console.error(`Variáveis ausentes: ${missing.join(', ')}`);
    console.error('Use npm run seed:supabase -- --dry-run para validar sem enviar ao banco.');
    process.exit(1);
  }
}

async function supabase(resource, options = {}) {
  if (DRY_RUN) return [];
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${resource}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation,resolution=merge-duplicates',
      ...(options.headers || {})
    },
    body: options.body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${resource}: ${data?.message || data?.error || response.status}`);
  return data;
}

function artistRows(artists) {
  return artists.map((artist) => ({
    id: artist.id,
    name: artist.name,
    legal_name: artist.legalName || artist.legal_name || null,
    slug: artist.id,
    city: artist.city || null,
    state: artist.state || null,
    region: artist.region || null,
    languages: artist.languages || [],
    curatorial_axes: artist.curatorialAxes || artist.curatorial_axes || [],
    profile: artist.profile || null,
    trajectory: artist.trajectory || null,
    statement: artist.statement || null,
    portfolio_url: artist.portfolioUrl || artist.portfolio_url || null,
    instagram: artist.instagram || null,
    status: artist.status || 'published',
    artist_level: artist.artistLevel || artist.artist_level || 'emerging',
    image_url: artist.imageUrl || artist.image_url || null,
    studio_image_url: artist.studioImageUrl || artist.studio_image_url || null,
    identity_verified: artist.identityVerified === true || artist.identity_verified === true,
    publishing_consent_at: artist.publishingConsentAt || artist.publishing_consent_at || null,
    verified_at: artist.verifiedAt || artist.verified_at || null,
    source_reference: artist.sourceReference || artist.source_reference || null,
    payload: artist
  }));
}

function artworkRows(artworks) {
  return artworks.map((artwork) => ({
    id: artwork.id,
    slug: artwork.id,
    title: artwork.title,
    artist_id: artwork.artistId,
    language: artwork.type || null,
    type: artwork.type || null,
    technique: artwork.technique || null,
    support: artwork.support || null,
    year: artwork.year || null,
    dimensions: artwork.dimensions || null,
    price: Number(artwork.price || 0) || null,
    price_label: artwork.priceLabel || null,
    status: normalizeArtworkStatus(artwork.status),
    edition: artwork.edition || null,
    certificate: Boolean(artwork.certificate),
    thumb: artwork.thumb || null,
    main_image_url: artwork.mainImageUrl || artwork.main_image_url || null,
    detail_image_url: artwork.detailImageUrl || artwork.detail_image_url || null,
    room_image_url: artwork.roomImageUrl || artwork.room_image_url || null,
    image_authorized_at: artwork.imageAuthorizedAt || artwork.image_authorized_at || null,
    price_verified_at: artwork.priceVerifiedAt || artwork.price_verified_at || null,
    availability_verified_at: artwork.availabilityVerifiedAt || artwork.availability_verified_at || null,
    catalog_verified_at: artwork.catalogVerifiedAt || artwork.catalog_verified_at || null,
    source_reference: artwork.sourceReference || artwork.source_reference || null,
    recommended_for: artwork.recommendedFor || [],
    tags: artwork.tags || [],
    moods: artwork.moods || [],
    spaces: artwork.spaces || [],
    search: artwork.search || `${artwork.title} ${artwork.artist} ${(artwork.tags || []).join(' ')}`,
    summary: artwork.summary || null,
    curatorial_reading: artwork.curatorialReading || artwork.curatorial_reading || null,
    first_artwork: Boolean(artwork.firstArtwork),
    payload: artwork,
    published: artwork.published !== false
  }));
}

function normalizeArtworkStatus(status) {
  const value = String(status || '').toLowerCase();
  if (value.includes('reserv')) return 'reserved';
  if (value.includes('vend')) return 'sold';
  if (value.includes('conversa')) return 'in_conversation';
  if (value.includes('indis') || value.includes('não') || value.includes('nao')) return 'not_published';
  return 'available';
}

function certificateRows(certificates) {
  return certificates.map((certificate) => ({
    code: certificate.code,
    verification_status: certificate.verification_status || 'draft',
    artwork_id: certificate.artwork_id,
    artist_id: certificate.artist_id || null,
    issued_to: certificate.issued_to || null,
    issued_email: certificate.issued_email || null,
    issued_at: certificate.issued_at || null,
    certificate_hash: certificate.certificate_hash || null,
    certificate_notes: certificate.certificate_notes || certificate.payload?.certificate_notes || null,
    payload: certificate.payload || certificate
  }));
}

async function upsert(table, rows, conflictKey) {
  if (!rows.length) return;
  console.log(`${DRY_RUN ? '[dry-run] ' : ''}Upsert ${rows.length} registros em ${table}.`);
  if (DRY_RUN) return;
  await supabase(`${table}?on_conflict=${conflictKey}`, { method: 'POST', body: JSON.stringify(rows) });
}

async function resetTables() {
  if (!RESET) return;
  console.log('Limpando tabelas operacionais antes do seed.');
  if (DRY_RUN) return;
  for (const table of ['proposal_items', 'certificates', 'artworks', 'artists']) {
    await supabase(`${table}?id=not.is.null`, { method: 'DELETE', prefer: 'return=minimal' }).catch(async () => {
      if (table === 'certificates') await supabase(`${table}?code=not.is.null`, { method: 'DELETE', prefer: 'return=minimal' });
    });
  }
}

async function main() {
  requiredEnv();
  const artists = readJson('data/artists.json');
  const artworks = readJson('data/artworks.json');
  const certificates = readJson('data/certificates.json');
  const release = readJson('data/catalog-release.json');
  const readiness = evaluateCatalogRelease({ artists, artworks, release });

  console.log('Arandu Supabase Seed');
  console.log(`Artistas: ${artists.length}`);
  console.log(`Obras: ${artworks.length}`);
  console.log(`Certificados: ${certificates.length}`);
  console.log(`Catálogo verificado: ${readiness.verifiedReady}`);

  if (!DRY_RUN && !readiness.verifiedReady) {
    throw new Error(`Seed de produção bloqueado. ${readiness.issues.join(' ')}`);
  }

  await resetTables();
  await upsert('artists', artistRows(artists), 'id');
  await upsert('artworks', artworkRows(artworks), 'id');
  await upsert('certificates', certificateRows(certificates), 'code');
  await upsert('catalog_releases', [{
    id: release.releaseId || 'production',
    dataset_version: release.datasetVersion || 'unconfigured',
    dataset_kind: release.datasetKind || 'demonstration',
    verified_ready: readiness.verifiedReady,
    verified_by: release.verifiedBy || null,
    verified_at: readiness.verifiedReady ? (release.verifiedAt || new Date().toISOString()) : null,
    notes: release.notes || null
  }], 'id');

  console.log(DRY_RUN ? 'Dry-run concluído. Nenhum dado foi enviado.' : 'Seed concluído.');
}

main().catch((error) => {
  console.error('Falha no seed Supabase:');
  console.error(error.message || error);
  process.exit(1);
});

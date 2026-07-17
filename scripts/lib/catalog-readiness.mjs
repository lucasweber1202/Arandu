export const CATALOG_MINIMUMS = Object.freeze({ artists: 5, artworks: 20 });

function value(record, camel, snake) {
  return record?.[camel] ?? record?.[snake];
}

function hasDate(record, camel, snake) {
  const candidate = value(record, camel, snake);
  return Boolean(candidate && !Number.isNaN(Date.parse(candidate)));
}

function hasImage(artwork) {
  return Boolean(
    value(artwork, 'mainImageUrl', 'main_image_url') ||
    artwork?.imageUrl ||
    artwork?.image_url ||
    artwork?.image
  );
}

export function artistIsVerified(artist) {
  return Boolean(
    artist?.status === 'published' &&
    value(artist, 'identityVerified', 'identity_verified') === true &&
    hasDate(artist, 'publishingConsentAt', 'publishing_consent_at') &&
    hasDate(artist, 'verifiedAt', 'verified_at') &&
    String(value(artist, 'sourceReference', 'source_reference') || '').trim()
  );
}

export function artworkIsVerified(artwork, verifiedArtistIds) {
  const status = String(artwork?.status || '').toLowerCase();
  const published = artwork?.published !== false;
  const artistId = value(artwork, 'artistId', 'artist_id');
  return Boolean(
    published &&
    ['disponível', 'disponivel', 'available', 'in_conversation', 'reserved', 'reservada'].includes(status) &&
    verifiedArtistIds.has(artistId) &&
    Number(artwork?.price || 0) > 0 &&
    hasImage(artwork) &&
    hasDate(artwork, 'imageAuthorizedAt', 'image_authorized_at') &&
    hasDate(artwork, 'priceVerifiedAt', 'price_verified_at') &&
    hasDate(artwork, 'availabilityVerifiedAt', 'availability_verified_at') &&
    hasDate(artwork, 'catalogVerifiedAt', 'catalog_verified_at') &&
    String(value(artwork, 'sourceReference', 'source_reference') || '').trim()
  );
}

export function evaluateCatalogRelease({ artists, artworks, release }) {
  const verifiedArtists = artists.filter(artistIsVerified);
  const verifiedArtistIds = new Set(verifiedArtists.map((artist) => artist.id));
  const verifiedArtworks = artworks.filter((artwork) => artworkIsVerified(artwork, verifiedArtistIds));
  const declaredReal = release?.datasetKind === 'real';
  const approved = release?.verifiedReady === true;
  const minimums = {
    artists: Number(release?.minimums?.artists || CATALOG_MINIMUMS.artists),
    artworks: Number(release?.minimums?.artworks || CATALOG_MINIMUMS.artworks)
  };
  const issues = [];

  if (!declaredReal) issues.push('catalog-release: datasetKind precisa ser real.');
  if (!approved) issues.push('catalog-release: verifiedReady precisa ser true.');
  if (verifiedArtists.length < minimums.artists) issues.push(`Catálogo tem ${verifiedArtists.length}/${minimums.artists} artistas verificados.`);
  if (verifiedArtworks.length < minimums.artworks) issues.push(`Catálogo tem ${verifiedArtworks.length}/${minimums.artworks} obras verificadas.`);

  return {
    verifiedReady: Boolean(declaredReal && approved && verifiedArtists.length >= minimums.artists && verifiedArtworks.length >= minimums.artworks),
    declaredReal,
    approved,
    minimums,
    counts: {
      artists: artists.length,
      artworks: artworks.length,
      verifiedArtists: verifiedArtists.length,
      verifiedArtworks: verifiedArtworks.length
    },
    issues
  };
}

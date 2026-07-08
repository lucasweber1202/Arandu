function escapeArtworkHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, function (char) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[char];
  });
}

function first(list, total) {
  return Array.isArray(list) ? list.slice(0, total) : [];
}

function asText(value, fallback) {
  return value === undefined || value === null || value === '' ? fallback : value;
}

function mapApiArtwork(item) {
  return {
    ...item,
    id: item.id,
    title: item.title,
    artist: item.artist || item.artist_name || item.artists?.name || 'Artista Arandu',
    artistId: item.artistId || item.artist_id,
    type: item.type || item.language || 'Obra',
    technique: item.technique,
    dimensions: item.dimensions,
    year: item.year,
    price: item.price,
    priceLabel: item.priceLabel || item.price_label,
    status: item.status,
    edition: item.edition,
    certificate: item.certificate,
    certificateId: item.certificateId || item.certificate_id || item.registry || item.registry_code,
    provenance: item.provenance,
    condition: item.condition,
    thumb: item.thumb,
    recommendedFor: item.recommendedFor || item.recommended_for || [],
    tags: item.tags || [],
    moods: item.moods || [],
    spaces: item.spaces || [],
    search: item.search,
    summary: item.summary,
    curatorialReading: item.curatorialReading || item.curatorial_reading,
    story: item.story || item.context || item.narrative,
    firstArtwork: item.firstArtwork || item.first_artwork
  };
}

async function loadArtworkList() {
  try {
    var api = await fetch('/api/catalog', { cache: 'no-store' });
    var apiData = await api.json().catch(function () { return {}; });
    if (api.ok && Array.isArray(apiData.items) && apiData.items.length) {
      return apiData.items.map(mapApiArtwork);
    }
  } catch (error) {}

  var response = await fetch('data/artworks.json', { cache: 'no-store' });
  var list = await response.json();
  return Array.isArray(list) ? list.map(mapApiArtwork) : [];
}

function fact(label, value) {
  return '<p><strong>' + escapeArtworkHtml(label) + '</strong>' + escapeArtworkHtml(value) + '</p>';
}

function trustCard(title, text) {
  return '<article class="trust-card"><strong>' + escapeArtworkHtml(title) + '</strong><span>' + escapeArtworkHtml(text) + '</span></article>';
}

function typeTag(artwork) {
  var text = String((artwork.type || '') + ' ' + (artwork.technique || '')).toLowerCase();
  if (/foto|fotografia/.test(text)) return 'Fotografia';
  if (/escultura|cerâmica|ceramica|objeto|bronze|madeira/.test(text)) return 'Escultura';
  return 'Pintura';
}

async function runArtworkPage() {
  var box = document.querySelector('[data-artwork-page]');
  if (!box) return;

  var id = new URLSearchParams(location.search).get('id');

  try {
    var list = await loadArtworkList();
    var artwork = list.find(function (item) { return item.id === id; }) || list[0];
    if (!artwork) throw new Error('not found');

    var related = list.filter(function (item) { return item.id !== artwork.id; }).slice(0, 3);
    var certificateStatus = artwork.certificate ? 'Certificado Arandu' : 'Certificado em validação';
    var registry = artwork.certificateId || ('ARANDU-' + String(artwork.id || 'obra').toUpperCase().replace(/[^A-Z0-9]+/g, '-'));
    var status = asText(artwork.status, 'disponível');
    var edition = asText(artwork.edition, artwork.type === 'Fotografia' ? 'Tiragem a confirmar' : 'Obra única');
    var priceLabel = asText(artwork.priceLabel, 'sob consulta');
    var curatorialReading = asText(artwork.curatorialReading, artwork.summary);
    var chips = [typeTag(artwork), edition, certificateStatus].concat(first(artwork.tags, 2)).slice(0, 5);

    document.title = artwork.title + ' — Arandu';

    box.innerHTML = '<div class="artwork-visit artwork-premium-detail">'
      + '<a class="back-link" href="comprar-arte.html">← Voltar para comprar</a>'
      + '<div class="artwork-page">'
      + '<div class="artwork-visual">'
      + '<div class="thumb artwork-image ' + escapeArtworkHtml(artwork.thumb || 'thumb-terra') + '"></div>'
      + '<div class="artwork-caption"><span>' + escapeArtworkHtml(typeTag(artwork)) + '</span><span>' + escapeArtworkHtml(status) + '</span></div>'
      + '</div>'
      + '<aside class="artwork-buybox premium-buybox">'
      + '<p class="eyebrow">' + escapeArtworkHtml(artwork.artist) + '</p>'
      + '<h1 class="title">' + escapeArtworkHtml(artwork.title) + '</h1>'
      + '<p class="lead">' + escapeArtworkHtml(artwork.summary) + '</p>'
      + '<div class="reading-tags">' + chips.map(function (tag) { return '<span>' + escapeArtworkHtml(tag) + '</span>'; }).join('') + '</div>'
      + '<div class="price-line"><span>' + escapeArtworkHtml(priceLabel) + '</span><small>valor indicativo do acervo</small></div>'
      + '<div class="page-actions"><button class="cta" data-save-artwork="' + escapeArtworkHtml(artwork.id) + '" data-artwork-title="' + escapeArtworkHtml(artwork.title) + '" data-artwork-artist="' + escapeArtworkHtml(artwork.artist) + '" data-artwork-context="' + escapeArtworkHtml(first(artwork.tags, 3).join(' · ')) + '" data-artwork-url="obra.html?id=' + escapeArtworkHtml(artwork.id) + '" data-artwork-price="' + escapeArtworkHtml(artwork.price) + '" data-artwork-price-label="' + escapeArtworkHtml(priceLabel) + '" data-artwork-technique="' + escapeArtworkHtml(artwork.technique) + '" data-artwork-dimensions="' + escapeArtworkHtml(artwork.dimensions) + '" data-artwork-status="' + escapeArtworkHtml(status) + '" data-artwork-thumb="' + escapeArtworkHtml(artwork.thumb || 'thumb-terra') + '">Adicionar à seleção</button><button class="cta secondary" data-reserve-artwork="' + escapeArtworkHtml(artwork.id) + '" data-reserve-title="' + escapeArtworkHtml(artwork.title) + '" data-reserve-artist="' + escapeArtworkHtml(artwork.artist) + '" data-reserve-url="obra.html?id=' + escapeArtworkHtml(artwork.id) + '">Reservar com curadoria</button></div>'
      + '<p class="trust-note">A reserva abre conversa com a curadoria. Não confirma compra automática.</p>'
      + '<div class="artwork-facts enhanced-facts">'
      + fact('Técnica', asText(artwork.technique, 'a confirmar'))
      + fact('Dimensões', asText(artwork.dimensions, 'a confirmar'))
      + fact('Ano', asText(artwork.year, 'a confirmar'))
      + fact('Edição / tiragem', edition)
      + fact('Certificado', certificateStatus)
      + '</div>'
      + '<a class="artist-link" href="artista.html?id=' + escapeArtworkHtml(artwork.artistId) + '">Conhecer trajetória do artista →</a>'
      + '</aside>'
      + '</div>'
      + '<section class="artwork-reading premium-reading">'
      + '<div><p class="eyebrow">Leitura curatorial</p><h2>' + escapeArtworkHtml(artwork.title) + '</h2><p>' + escapeArtworkHtml(curatorialReading) + '</p></div>'
      + '</section>'
      + '<section class="trust-strip">'
      + trustCard('Autenticidade', 'Ficha técnica, autoria e registro acompanham a obra.')
      + trustCard('Entrega', 'Envio, embalagem e prazo são combinados antes do fechamento.')
      + trustCard('Compra segura', 'A disponibilidade é confirmada antes de qualquer pagamento.')
      + '</section>'
      + '<section class="related-works">'
      + '<div class="section-head"><div><p class="eyebrow">Continue olhando</p><h2 class="section-title">Obras relacionadas.</h2></div><a class="cta secondary" href="comprar-arte.html">Ver todas</a></div>'
      + '<div class="related-grid">' + related.map(function (item) { return '<a class="showcase-card" href="obra.html?id=' + escapeArtworkHtml(item.id) + '"><div class="' + escapeArtworkHtml(item.thumb || 'thumb-terra') + '"></div><strong>' + escapeArtworkHtml(item.title) + '</strong><span>' + escapeArtworkHtml(item.artist) + ' · ' + escapeArtworkHtml(item.priceLabel || 'sob consulta') + '</span></a>'; }).join('') + '</div>'
      + '</section>'
      + '</div>';
  } catch (error) {
    box.innerHTML = '<h1 class="title">Obra não encontrada</h1><a class="cta secondary" href="comprar-arte.html">Abrir obras</a>';
  }
}

document.addEventListener('DOMContentLoaded', runArtworkPage);

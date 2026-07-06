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

function relatedCard(item) {
  return '<a class="related-mini-card" href="obra.html?id=' + escapeArtworkHtml(item.id) + '">'
    + '<div class="thumb ' + escapeArtworkHtml(item.thumb || 'thumb-terra') + '"></div>'
    + '<div><strong>' + escapeArtworkHtml(item.title) + '</strong><span>' + escapeArtworkHtml(item.artist) + ' · ' + escapeArtworkHtml(item.priceLabel || 'sob consulta') + '</span></div>'
    + '</a>';
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
    var certificateStatus = artwork.certificate ? 'Certificado Arandu emitido' : 'Certificado em validação';
    var registry = artwork.certificateId || ('ARANDU-' + String(artwork.id || 'obra').toUpperCase().replace(/[^A-Z0-9]+/g, '-'));
    var status = asText(artwork.status, 'disponível');
    var edition = asText(artwork.edition, artwork.type === 'Fotografia' ? 'Tiragem a confirmar' : 'Obra única');
    var priceLabel = asText(artwork.priceLabel, 'sob consulta');
    var curatorialReading = asText(artwork.curatorialReading, artwork.summary);
    var story = asText(artwork.story, 'A obra é apresentada pela Arandu a partir de sua ficha técnica, leitura curatorial e relação com a trajetória do artista. A compra deve preservar contexto, autoria e documentação.');

    document.title = artwork.title + ' — Arandu';

    box.innerHTML = '<div class="artwork-visit artwork-premium-detail">'
      + '<a class="back-link" href="obras.html">← Voltar ao acervo</a>'
      + '<div class="artwork-page">'
      + '<div class="artwork-visual">'
      + '<div class="thumb artwork-image ' + escapeArtworkHtml(artwork.thumb || 'thumb-terra') + '"></div>'
      + '<div class="artwork-caption"><span>' + escapeArtworkHtml(artwork.type || 'Obra') + '</span><span>' + escapeArtworkHtml(status) + '</span><span>' + escapeArtworkHtml(registry) + '</span></div>'
      + '</div>'
      + '<aside class="artwork-buybox premium-buybox">'
      + '<p class="eyebrow">' + escapeArtworkHtml(artwork.type || 'Obra') + ' · ' + escapeArtworkHtml(status) + '</p>'
      + '<h1 class="title">' + escapeArtworkHtml(artwork.title) + '</h1>'
      + '<p class="lead">' + escapeArtworkHtml(artwork.summary) + '</p>'
      + '<div class="price-line"><span>' + escapeArtworkHtml(priceLabel) + '</span><small>valor indicativo do acervo</small></div>'
      + '<div class="page-actions"><button class="cta" data-save-artwork="' + escapeArtworkHtml(artwork.id) + '" data-artwork-title="' + escapeArtworkHtml(artwork.title) + '" data-artwork-artist="' + escapeArtworkHtml(artwork.artist) + '" data-artwork-context="' + escapeArtworkHtml(first(artwork.tags, 3).join(' · ')) + '" data-artwork-url="obra.html?id=' + escapeArtworkHtml(artwork.id) + '" data-artwork-price="' + escapeArtworkHtml(artwork.price) + '" data-artwork-price-label="' + escapeArtworkHtml(priceLabel) + '" data-artwork-technique="' + escapeArtworkHtml(artwork.technique) + '" data-artwork-dimensions="' + escapeArtworkHtml(artwork.dimensions) + '" data-artwork-status="' + escapeArtworkHtml(status) + '" data-artwork-thumb="' + escapeArtworkHtml(artwork.thumb || 'thumb-terra') + '">Adicionar à seleção</button><button class="cta secondary" data-reserve-artwork="' + escapeArtworkHtml(artwork.id) + '" data-reserve-title="' + escapeArtworkHtml(artwork.title) + '" data-reserve-artist="' + escapeArtworkHtml(artwork.artist) + '" data-reserve-url="obra.html?id=' + escapeArtworkHtml(artwork.id) + '">Reservar com curadoria</button></div>'
      + '<p class="trust-note">A reserva não confirma compra automática. A curadoria valida disponibilidade, envio e documentação antes da finalização.</p>'
      + '<div class="artwork-facts enhanced-facts">'
      + fact('Artista', artwork.artist)
      + fact('Técnica', asText(artwork.technique, 'a confirmar'))
      + fact('Dimensões', asText(artwork.dimensions, 'a confirmar'))
      + fact('Ano', asText(artwork.year, 'a confirmar'))
      + fact('Edição / tiragem', edition)
      + fact('Certificado', certificateStatus)
      + fact('Registro', registry)
      + fact('Conservação', asText(artwork.condition, 'verificação visual antes do envio'))
      + '</div>'
      + '<a class="artist-link" href="artista.html?id=' + escapeArtworkHtml(artwork.artistId) + '">Conhecer trajetória do artista →</a>'
      + '</aside>'
      + '</div>'
      + '<section class="artwork-reading premium-reading">'
      + '<div><p class="eyebrow">Leitura curatorial</p><h2>' + escapeArtworkHtml(artwork.title) + ' no espaço</h2><p>' + escapeArtworkHtml(curatorialReading) + '</p></div>'
      + '<div><p class="eyebrow">História e contexto</p><p>' + escapeArtworkHtml(story) + '</p></div>'
      + '<div class="reading-tags">' + first((artwork.recommendedFor || artwork.spaces || artwork.tags), 7).map(function (tag) { return '<span>' + escapeArtworkHtml(tag) + '</span>'; }).join('') + '</div>'
      + '</section>'
      + '<section class="trust-strip">'
      + trustCard('Autenticidade', 'Ficha técnica, autoria, edição e registro interno acompanham a obra.')
      + trustCard('Entrega segura', 'Envio combinado com embalagem adequada, prazo informado e acompanhamento da curadoria.')
      + trustCard('Compra protegida', 'Reserva e pagamento só avançam após confirmação de disponibilidade e condições comerciais.')
      + trustCard('Conservação', 'Orientações básicas de manuseio, luz, umidade e instalação são enviadas ao comprador.')
      + '</section>'
      + '<section class="collector-guidance">'
      + '<div><p class="eyebrow">Como comprar</p><h2 class="section-title">Do interesse à documentação.</h2></div>'
      + '<ol class="process-steps"><li>Reserve ou adicione à seleção.</li><li>A curadoria confirma disponibilidade, condição e prazo.</li><li>Você recebe orientação de pagamento e envio.</li><li>A obra segue com certificado, ficha técnica e registro.</li></ol>'
      + '</section>'
      + '<section class="related-works">'
      + '<div class="section-head"><div><p class="eyebrow">Continue olhando</p><h2 class="section-title">Obras que conversam com esta escolha.</h2></div><a class="cta secondary" href="obras.html">Ver acervo</a></div>'
      + '<div class="related-grid">' + related.map(relatedCard).join('') + '</div>'
      + '</section>'
      + '</div>';
  } catch (error) {
    box.innerHTML = '<h1 class="title">Obra não encontrada</h1><a class="cta secondary" href="obras.html">Abrir acervo</a>';
  }
}

document.addEventListener('DOMContentLoaded', runArtworkPage);
function escapeArtistHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char];
  });
}
function tagList(items) { return (items || []).slice(0, 8).map(function (item) { return '<span class="tag">' + escapeArtistHtml(item) + '</span>'; }).join(''); }
function artistFact(label, value) { return '<p><strong>' + escapeArtistHtml(label) + '</strong>' + escapeArtistHtml(value || 'a confirmar') + '</p>'; }
function imageUrl(item) { return item.image_url || item.photo_url || item.studio_image_url || item.avatar_url || item.main_image_url || item.image || ''; }
function normalizeArtist(item) {
  return { ...item, id: item.id, name: item.name || item.artist || 'Artista Arandu', city: item.city || item.location || item.origin || 'Brasil', state: item.state || '', region: item.region || '', languages: item.languages || item.language_tags || [], curatorialAxes: item.curatorialAxes || item.curatorial_axes || [], profile: item.profile || item.bio || item.summary || 'Trajetória em acompanhamento curatorial.', trajectory: item.trajectory || item.career_note || '', statement: item.statement || item.artist_statement || '', artistLevel: item.artistLevel || item.artist_level || 'developing', image: imageUrl(item) };
}
function normalizeWork(work) {
  return { ...work, id: work.id, title: work.title || 'Obra sem título', artistId: work.artistId || work.artist_id, artist: work.artist || work.artist_name || work.artists?.name || '', type: work.type || work.language || work.technique || 'Obra', status: work.status || 'disponível', technique: work.technique || '', priceLabel: work.priceLabel || work.price_label || 'sob consulta', thumb: work.thumb || work.image_class || 'thumb-terra', image: imageUrl(work) };
}
function workCard(work) {
  var media = work.image ? '<div class="op-card-media"><img src="' + escapeArtistHtml(work.image) + '" alt="' + escapeArtistHtml(work.title) + '"></div>' : '<div class="op-card-media ' + escapeArtistHtml(work.thumb || 'thumb-terra') + '"></div>';
  return '<a class="ux-work-card" href="obra.html?id=' + escapeArtistHtml(work.id) + '">' + media
    + '<strong>' + escapeArtistHtml(work.title) + '</strong>'
    + '<span class="artist">' + escapeArtistHtml(work.type || 'Obra') + ' · ' + escapeArtistHtml(work.status || 'disponível') + '</span>'
    + '<div class="op-work-foot"><span class="op-price">' + escapeArtistHtml(work.priceLabel || 'sob consulta') + '</span><span class="op-mini-link">Ver obra →</span></div>'
    + '</a>';
}
async function loadArtists() {
  try { var api = await fetch('/api/artists', { cache: 'no-store' }); var data = await api.json().catch(function () { return {}; }); if (api.ok && Array.isArray(data.items) && data.items.length) return data.items.map(normalizeArtist); } catch (error) {}
  var artists = await (await fetch('data/artists.json', { cache: 'no-store' })).json(); return Array.isArray(artists) ? artists.map(normalizeArtist) : [];
}
async function loadWorks() {
  try { var api = await fetch('/api/catalog', { cache: 'no-store' }); var data = await api.json().catch(function () { return {}; }); if (api.ok && Array.isArray(data.items) && data.items.length) return data.items.map(normalizeWork); } catch (error) {}
  var works = await (await fetch('data/artworks.json', { cache: 'no-store' })).json(); return Array.isArray(works) ? works.map(normalizeWork) : [];
}
function artistPhoto(artist) {
  if (artist.image) return '<div class="op-card-media artist-portrait-large"><img src="' + escapeArtistHtml(artist.image) + '" alt="' + escapeArtistHtml(artist.name) + '"></div>';
  return '<div class="op-card-media artist-portrait-large artist-face large"></div>';
}
async function autor() {
  var box = document.querySelector('[data-artist-page]'); if (!box) return;
  var id = new URLSearchParams(location.search).get('id');
  try {
    var results = await Promise.all([loadArtists(), loadWorks()]);
    var artists = results[0]; var works = results[1];
    var artist = artists.find(function (item) { return item.id === id; }) || artists[0]; if (!artist) throw new Error('not found');
    var artistWorks = works.filter(function (work) { return work.artistId === artist.id || work.artist === artist.name; });
    var availableWorks = artistWorks.filter(function (work) { return !/vendida|sold|indisponível|indisponivel/i.test(String(work.status || '')); });
    var soldWorks = artistWorks.filter(function (work) { return /vendida|sold/i.test(String(work.status || '')); });
    var levelLabel = artist.artistLevel === 'emerging' ? 'artista emergente' : 'artista em desenvolvimento';
    document.title = artist.name + ' — Arandu';
    box.innerHTML = '<article class="artist-premium-page">'
      + '<section class="artist-hero-detail"><div>' + artistPhoto(artist) + '</div><div><p class="eyebrow">Artista Arandu · ' + escapeArtistHtml(levelLabel) + '</p><h1 class="title">' + escapeArtistHtml(artist.name) + '</h1><p class="lead">' + escapeArtistHtml(artist.profile) + '</p><div class="artist-facts enhanced-facts">'
      + artistFact('Cidade', [artist.city, artist.state].filter(Boolean).join(' · ')) + artistFact('Região', artist.region) + artistFact('Linguagens', (artist.languages || []).join(', ')) + artistFact('Eixos curatoriais', (artist.curatorialAxes || []).join(', ')) + '</div><div class="tags">' + tagList(artist.languages) + tagList(artist.curatorialAxes) + '</div></div></section>'
      + '<section class="premium-reading artist-statement-block"><div><p class="eyebrow">Declaração</p><h2>O que move a pesquisa.</h2><p>' + escapeArtistHtml(artist.statement || artist.profile) + '</p></div><div><p class="eyebrow">Trajetória</p><p>' + escapeArtistHtml(artist.trajectory || 'Trajetória em organização para acompanhamento curatorial.') + '</p></div></section>'
      + '<section class="trust-strip artist-trust-strip"><article class="trust-card"><strong>' + escapeArtistHtml(availableWorks.length) + '</strong><span>obras disponíveis ou em conversa.</span></article><article class="trust-card"><strong>' + escapeArtistHtml(soldWorks.length) + '</strong><span>obras vendidas ou registradas.</span></article><article class="trust-card"><strong>Perfil</strong><span>Bio, linguagem, território e leitura de processo.</span></article><article class="trust-card"><strong>Procedência</strong><span>Ficha técnica, autoria e certificado por obra.</span></article></section>'
      + '<section class="artist-works-section"><div class="section-head"><div><p class="eyebrow">Obras no acervo</p><h2 class="section-title">Disponíveis, reservadas e vendidas.</h2></div><a class="cta secondary" href="artistas.html">Ver todos os artistas</a></div><div class="ux-work-grid">' + (artistWorks.length ? artistWorks.map(workCard).join('') : '<div class="op-empty"><strong>Nenhuma obra carregada</strong><span>Este artista ainda não possui obras vinculadas ao catálogo público.</span></div>') + '</div></section>'
      + '<section class="collector-guidance"><div><p class="eyebrow">Leitura de carreira</p><h2 class="section-title">Como acompanhar este artista.</h2></div><ol class="process-steps"><li>Observe recorrências de linguagem, técnica e território.</li><li>Compare obras disponíveis com obras vendidas ou reservadas.</li><li>Considere escala, série, documentação e momento da trajetória.</li><li>Fale com a curadoria para entender evolução de preço e novas séries.</li></ol></section>'
      + '</article>';
  } catch (error) { box.innerHTML = '<h1 class="title">Artista não encontrado</h1><a class="cta secondary" href="artistas.html">Ver artistas</a>'; }
}
document.addEventListener('DOMContentLoaded', autor);

function escapeArtistHtml(value) {
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

function tagList(items) {
  return (items || []).map(function (item) {
    return '<span class="tag">' + escapeArtistHtml(item) + '</span>';
  }).join('');
}

function artistFact(label, value) {
  return '<p><strong>' + escapeArtistHtml(label) + '</strong>' + escapeArtistHtml(value || 'a confirmar') + '</p>';
}

function workCard(work) {
  return '<article class="card artist-work-detail-card">'
    + '<div class="thumb ' + escapeArtistHtml(work.thumb || 'thumb-terra') + '"></div>'
    + '<p class="eyebrow">' + escapeArtistHtml(work.type || 'Obra') + ' · ' + escapeArtistHtml(work.status || 'disponível') + '</p>'
    + '<h3>' + escapeArtistHtml(work.title) + '</h3>'
    + '<p>' + escapeArtistHtml(work.technique || '') + '</p>'
    + '<p><strong>' + escapeArtistHtml(work.priceLabel || 'sob consulta') + '</strong></p>'
    + '<a class="tag" href="obra.html?id=' + escapeArtistHtml(work.id) + '">Ver obra</a>'
    + '</article>';
}

async function autor() {
  var box = document.querySelector('[data-artist-page]');
  if (!box) return;

  var id = new URLSearchParams(location.search).get('id');

  try {
    var artists = await (await fetch('data/artists.json', { cache: 'no-store' })).json();
    var works = await (await fetch('data/artworks.json', { cache: 'no-store' })).json();
    var artist = artists.find(function (item) { return item.id === id; }) || artists[0];
    if (!artist) throw new Error('not found');

    var artistWorks = works.filter(function (work) { return work.artistId === artist.id; });
    var availableWorks = artistWorks.filter(function (work) { return String(work.status || '').toLowerCase() !== 'vendida'; });
    var soldWorks = artistWorks.filter(function (work) { return String(work.status || '').toLowerCase() === 'vendida'; });
    var levelLabel = artist.artistLevel === 'emerging' ? 'artista emergente' : 'artista em desenvolvimento';

    document.title = artist.name + ' — Arandu';

    box.innerHTML = '<article class="artist-premium-page">'
      + '<section class="artist-hero-detail">'
      + '<div class="artist-face large"></div>'
      + '<div><p class="eyebrow">Artista Arandu · ' + escapeArtistHtml(levelLabel) + '</p><h1 class="title">' + escapeArtistHtml(artist.name) + '</h1><p class="lead">' + escapeArtistHtml(artist.profile) + '</p><div class="artist-facts enhanced-facts">'
      + artistFact('Cidade', artist.city)
      + artistFact('Região', artist.region)
      + artistFact('Linguagens', (artist.languages || []).join(', '))
      + artistFact('Eixos curatoriais', (artist.curatorialAxes || []).join(', '))
      + '</div><div class="tags">' + tagList(artist.languages) + tagList(artist.curatorialAxes) + '</div></div>'
      + '</section>'
      + '<section class="premium-reading artist-statement-block">'
      + '<div><p class="eyebrow">Declaração</p><h2>O que move a pesquisa.</h2><p>' + escapeArtistHtml(artist.statement || artist.profile) + '</p></div>'
      + '<div><p class="eyebrow">Trajetória</p><p>' + escapeArtistHtml(artist.trajectory) + '</p></div>'
      + '</section>'
      + '<section class="trust-strip artist-trust-strip">'
      + '<article class="trust-card"><strong>Perfil editorial</strong><span>Bio, linguagem, território, séries e leitura de processo.</span></article>'
      + '<article class="trust-card"><strong>Evolução</strong><span>Registro de novas obras, vendas, mudanças de preço e amadurecimento.</span></article>'
      + '<article class="trust-card"><strong>Procedência</strong><span>Ficha técnica, autoria, disponibilidade e certificado por obra.</span></article>'
      + '<article class="trust-card"><strong>Contexto</strong><span>O artista aparece como trajetória, não apenas como fornecedor de produto.</span></article>'
      + '</section>'
      + '<section class="artist-works-section"><div class="section-head"><div><p class="eyebrow">Obras no acervo</p><h2 class="section-title">Disponíveis, reservadas e vendidas.</h2></div><a class="cta secondary" href="artistas.html">Ver todos os artistas</a></div><div class="grid grid-3">'
      + artistWorks.map(workCard).join('')
      + '</div></section>'
      + '<section class="collector-guidance"><div><p class="eyebrow">Leitura de carreira</p><h2 class="section-title">Como acompanhar este artista.</h2></div><ol class="process-steps"><li>Observe recorrências de linguagem, técnica e território.</li><li>Compare obras disponíveis com obras vendidas ou reservadas.</li><li>Considere escala, série, documentação e momento da trajetória.</li><li>Fale com a curadoria para entender evolução de preço e novas séries.</li></ol></section>'
      + '<section class="artist-status-note"><p><strong>' + escapeArtistHtml(availableWorks.length) + ' obra(s) em circulação</strong> e <strong>' + escapeArtistHtml(soldWorks.length) + ' obra(s) vendida(s)</strong> no acervo atual.</p></section>'
      + '</article>';
  } catch (error) {
    box.innerHTML = '<h1 class="title">Artista não encontrado</h1><a class="cta secondary" href="artistas.html">Ver artistas</a>';
  }
}

document.addEventListener('DOMContentLoaded', autor);

const STATIC_SEARCH_KEY = 'arandu.search.recent.v1';
const FALLBACK_STATIC_INDEX = [
  { title: 'Comprar arte', url: 'comprar-arte.html', type: 'Compra', text: 'obras disponíveis preço técnica artista reserva curadoria' },
  { title: 'Artistas', url: 'artistas.html', type: 'Artistas', text: 'trajetória linguagem território perfil obras disponíveis' },
  { title: 'Coleções', url: 'colecoes.html', type: 'Coleções', text: 'primeira aquisição casa empresa fotografia território intenção curatorial' },
  { title: 'Empresas e arquitetos', url: 'empresas-e-arquitetos.html', type: 'Empresas', text: 'corporativo clínica escritório recepção hotel restaurante' },
  { title: 'Confiança', url: 'confianca.html', type: 'Confiança', text: 'certificado autenticidade procedência critérios' },
  { title: 'Narrativa', url: 'narrativa.html', type: 'Editorial', text: 'histórias artistas bastidores textos arte brasileira contemporânea' },
  { title: 'Contato', url: 'contato.html', type: 'Contato', text: 'falar com curadoria dúvidas compra empresas artistas' }
];

const STATIC_SEARCH_SYNONYMS = {
  decoracao: 'casa ambiente interiores parede apartamento sala',
  decoração: 'casa ambiente interiores parede apartamento sala',
  quadro: 'pintura tela obra parede',
  pintura: 'tela matéria gesto obra artista',
  fotografia: 'fine art imagem edição limitada primeira aquisição',
  escultura: 'objeto volume bronze cerâmica aparador presença',
  escritorio: 'empresa corporativo recepção arquitetura sala reunião',
  escritório: 'empresa corporativo recepção arquitetura sala reunião',
  arquiteto: 'empresas arquitetura interiores briefing projeto',
  hotel: 'hotelaria empresas hospitalidade permanência',
  restaurante: 'hospitalidade atmosfera permanência experiência',
  certificado: 'autenticidade procedência ficha técnica confiança',
  autenticidade: 'certificado autoria procedência confiança',
  artista: 'trajetória pesquisa linguagem portfólio curadoria'
};

function normalizeSearch(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeSearchHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function readRecentSearches() {
  try { return JSON.parse(localStorage.getItem(STATIC_SEARCH_KEY) || '[]'); } catch { return []; }
}

function writeRecentSearch(query) {
  const q = String(query || '').trim();
  if (!q) return;
  const next = [q, ...readRecentSearches().filter((item) => normalizeSearch(item) !== normalizeSearch(q))].slice(0, 6);
  localStorage.setItem(STATIC_SEARCH_KEY, JSON.stringify(next));
}

async function loadSearchIndex() {
  let base = FALLBACK_STATIC_INDEX;
  try {
    const response = await fetch('data/search-index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('index');
    const data = await response.json();
    if (Array.isArray(data) && data.length) base = data;
  } catch {}

  if (!window.AranduCatalogSource) return base;
  try {
    const [artworks, artists] = await Promise.all([
      window.AranduCatalogSource.catalog(),
      window.AranduCatalogSource.artists()
    ]);
    const catalogItems = artworks.map((item) => ({
      title: item.title || 'Obra',
      url: `obra.html?id=${encodeURIComponent(item.id)}`,
      type: 'Obra',
      text: [item.artist_name, item.type, item.technique, item.dimensions, item.price_label, item.summary, ...(item.tags || [])].filter(Boolean).join(' ')
    }));
    const artistItems = artists.map((item) => ({
      title: item.name || 'Artista',
      url: `artista.html?id=${encodeURIComponent(item.id)}`,
      type: 'Artista',
      text: [item.city, item.state, item.region, item.profile, item.trajectory, ...(item.languages || []), ...(item.curatorial_axes || [])].filter(Boolean).join(' ')
    }));
    return [...base, ...catalogItems, ...artistItems];
  } catch {
    return base;
  }
}

function expandQuery(query) {
  const q = normalizeSearch(query);
  const synonyms = q.split(/\s+/).map((term) => STATIC_SEARCH_SYNONYMS[term] || '').join(' ');
  return normalizeSearch(`${q} ${synonyms}`).split(/\s+/).filter(Boolean);
}

function scoreItem(item, query) {
  const rawQuery = normalizeSearch(query);
  const title = normalizeSearch(item.title);
  const type = normalizeSearch(item.type);
  const text = normalizeSearch(item.text);
  const full = `${title} ${type} ${text}`;
  if (!rawQuery) return 1;

  let score = full.includes(rawQuery) ? 20 : 0;
  expandQuery(query).forEach((term) => {
    if (title.includes(term)) score += 7;
    if (type.includes(term)) score += 4;
    if (text.includes(term)) score += 2;
  });
  return score;
}

function renderResults(index, query) {
  const target = document.querySelector('[data-static-search-results]');
  if (!target) return;
  const scored = index
    .map((item) => ({ ...item, score: scoreItem(item, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 18);

  if (!scored.length) {
    target.innerHTML = '<article class="card"><h3>Nenhum resultado encontrado</h3><p>Tente buscar por obra, artista, fotografia, empresa, certificado, coleção ou contato.</p><div class="page-actions"><a class="cta secondary" href="comprar-arte.html">Explorar obras</a><a class="cta secondary" href="contato.html">Falar com a curadoria</a></div></article>';
    return;
  }

  target.innerHTML = scored.map((item) => `
    <a class="card search-page-result art-mark" href="${escapeSearchHtml(item.url)}">
      <span class="tag">${escapeSearchHtml(item.type)}</span>
      <h3>${escapeSearchHtml(item.title)}</h3>
      <p>${escapeSearchHtml(item.text)}</p>
    </a>`).join('');
}

function renderRecent() {
  const target = document.querySelector('[data-static-search-recent]');
  if (!target) return;
  const recent = readRecentSearches();
  target.innerHTML = recent.length
    ? recent.map((item) => `<button class="tag" type="button" data-recent-search="${escapeSearchHtml(item)}">${escapeSearchHtml(item)}</button>`).join('')
    : '<span class="tag">pintura</span><span class="tag">fotografia</span><span class="tag">empresa</span><span class="tag">certificado</span>';
}

async function setupStaticSearchPage() {
  const input = document.querySelector('[data-static-search-input]');
  if (!input) return;
  const index = await loadSearchIndex();
  const params = new URLSearchParams(window.location.search);
  const initial = params.get('q') || '';
  input.value = initial;
  if (initial) writeRecentSearch(initial);
  renderRecent();
  renderResults(index, initial);

  input.addEventListener('input', () => renderResults(index, input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      writeRecentSearch(input.value);
      renderRecent();
      renderResults(index, input.value);
    }
  });

  document.addEventListener('click', (event) => {
    const recent = event.target.closest('[data-recent-search]');
    if (recent) {
      input.value = recent.dataset.recentSearch;
      renderResults(index, input.value);
      input.focus();
    }
    const suggestion = event.target.closest('[data-static-search-suggestion]');
    if (suggestion) {
      input.value = suggestion.dataset.staticSearchSuggestion;
      renderResults(index, input.value);
      writeRecentSearch(input.value);
      renderRecent();
    }
  });
}

document.addEventListener('DOMContentLoaded', setupStaticSearchPage);

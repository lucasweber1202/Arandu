const STATIC_SEARCH_KEY = 'arandu.search.recent.v1';
const FALLBACK_STATIC_INDEX = [
  { title: 'Encontrar arte', url: 'encontrar-arte.html', type: 'Curadoria', text: 'quiz ambiente orcamento linguagem' },
  { title: 'Obras', url: 'obras.html', type: 'Acervo', text: 'pintura fotografia escultura' },
  { title: 'Empresas e arquitetos', url: 'empresas-e-arquitetos.html', type: 'Empresas', text: 'corporativo hotelaria escritorio recepcao' },
  { title: 'Minha selecao', url: 'minha-selecao.html', type: 'Selecao', text: 'obras salvas comparar' },
  { title: 'Contato', url: 'contato.html', type: 'Contato', text: 'falar com curadoria' }
];

function normalizeSearch(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function readRecentSearches() {
  try { return JSON.parse(localStorage.getItem(STATIC_SEARCH_KEY) || '[]'); } catch { return []; }
}

function writeRecentSearch(query) {
  const q = String(query || '').trim();
  if (!q) return;
  const next = [q, ...readRecentSearches().filter((item) => item !== q)].slice(0, 6);
  localStorage.setItem(STATIC_SEARCH_KEY, JSON.stringify(next));
}

async function loadSearchIndex() {
  try {
    const response = await fetch('/data/search-index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('index');
    return await response.json();
  } catch {
    return FALLBACK_STATIC_INDEX;
  }
}

function scoreItem(item, query) {
  const q = normalizeSearch(query);
  const full = normalizeSearch(`${item.title} ${item.type} ${item.text}`);
  if (!q) return 1;
  let score = full.includes(q) ? 10 : 0;
  q.split(' ').filter(Boolean).forEach((term) => { if (full.includes(term)) score += 2; });
  return score;
}

function renderResults(index, query) {
  const target = document.querySelector('[data-static-search-results]');
  if (!target) return;
  const scored = index.map((item) => ({ ...item, score: scoreItem(item, query) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 18);
  if (!scored.length) {
    target.innerHTML = '<article class="card"><h3>Nenhum resultado encontrado</h3><p>Tente buscar por obra, artista, fotografia, empresa, certificado, orcamento ou primeira obra.</p></article>';
    return;
  }
  target.innerHTML = scored.map((item) => `<a class="card search-page-result art-mark" href="${item.url}"><span class="tag">${item.type}</span><h3>${item.title}</h3><p>${item.text}</p></a>`).join('');
}

function renderRecent() {
  const target = document.querySelector('[data-static-search-recent]');
  if (!target) return;
  const recent = readRecentSearches();
  target.innerHTML = recent.length ? recent.map((item) => `<button class="tag" type="button" data-recent-search="${item}">${item}</button>`).join('') : '<span class="tag">primeira obra</span><span class="tag">fotografia</span><span class="tag">empresa</span><span class="tag">certificado</span>';
}

async function setupStaticSearchPage() {
  const input = document.querySelector('[data-static-search-input]');
  if (!input) return;
  const index = await loadSearchIndex();
  const params = new URLSearchParams(window.location.search);
  const initial = params.get('q') || '';
  input.value = initial;
  renderRecent();
  renderResults(index, initial);
  input.addEventListener('input', () => renderResults(index, input.value));
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { writeRecentSearch(input.value); renderRecent(); } });
  document.addEventListener('click', (event) => {
    const recent = event.target.closest('[data-recent-search]');
    if (recent) { input.value = recent.dataset.recentSearch; renderResults(index, input.value); input.focus(); }
    const suggestion = event.target.closest('[data-static-search-suggestion]');
    if (suggestion) { input.value = suggestion.dataset.staticSearchSuggestion; renderResults(index, input.value); writeRecentSearch(input.value); }
  });
}

document.addEventListener('DOMContentLoaded', setupStaticSearchPage);

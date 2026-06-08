const STATIC_SEARCH_KEY = 'arandu.search.recent.v1';
const FALLBACK_STATIC_INDEX = [
  { title: 'Encontrar arte', url: 'encontrar-arte.html', type: 'Curadoria', text: 'quiz ambiente orçamento linguagem' },
  { title: 'Obras', url: 'obras.html', type: 'Acervo', text: 'pintura fotografia escultura' },
  { title: 'Empresas e arquitetos', url: 'empresas-e-arquitetos.html', type: 'Empresas', text: 'corporativo hotelaria escritório recepção' },
  { title: 'Minha seleção', url: 'minha-selecao.html', type: 'Seleção', text: 'obras salvas comparar' },
  { title: 'Contato', url: 'contato.html', type: 'Contato', text: 'falar com curadoria' }
];

const STATIC_SEARCH_SYNONYMS = {
  decoracao: 'casa ambiente interiores parede apartamento sala',
  decoração: 'casa ambiente interiores parede apartamento sala',
  quadro: 'pintura tela obra parede',
  barato: 'acessível orçamento até 3000 primeira obra',
  acessivel: 'acessível orçamento até 3000 primeira obra',
  escritório: 'empresa corporativo recepção arquitetura',
  escritorio: 'empresa corporativo recepção arquitetura',
  arquiteto: 'empresas arquitetos interiores briefing',
  hotel: 'hotelaria empresas hospitalidade',
  restaurante: 'hospitalidade atmosfera permanência',
  certificado: 'autenticidade procedência ficha técnica confiança',
  iniciante: 'primeira obra guia comprar segurança orçamento'
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
  try {
    const response = await fetch('data/search-index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('index');
    const data = await response.json();
    return Array.isArray(data) && data.length ? data : FALLBACK_STATIC_INDEX;
  } catch {
    return FALLBACK_STATIC_INDEX;
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
    target.innerHTML = '<article class="card"><h3>Nenhum resultado encontrado</h3><p>Tente buscar por obra, artista, fotografia, empresa, certificado, orçamento ou primeira obra.</p><div class="page-actions"><a class="cta secondary" href="encontrar-arte.html">Responder ao quiz curatorial</a><a class="cta secondary" href="contato.html">Falar com a curadoria</a></div></article>';
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
    : '<span class="tag">primeira obra</span><span class="tag">fotografia</span><span class="tag">empresa</span><span class="tag">certificado</span>';
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

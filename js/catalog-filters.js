/*
  ARANDU — filtros, busca e ordenação do catálogo

  Funciona sem backend:
  - Busca por título, artista, técnica e contexto.
  - Filtros por categoria, orçamento, ambiente e intenção.
  - Ordenação por preço estimado.
  - Contador de resultados.
  - Botão limpar filtros.
*/

function normalize(value) {
  return (value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getActiveFilter() {
  return document.querySelector('[data-filter].is-active')?.dataset.filter || 'todos';
}

function parsePrice(card) {
  const raw = card.dataset.price || '0';
  return Number(raw.replace(/[^0-9]/g, '')) || 0;
}

function sortCatalog() {
  const select = document.querySelector('[data-catalog-sort]');
  const grid = document.querySelector('[data-catalog-grid]');
  if (!select || !grid) return;

  const cards = Array.from(grid.querySelectorAll('[data-catalog-card]'));
  const mode = select.value;

  cards.sort((a, b) => {
    if (mode === 'preco-menor') return parsePrice(a) - parsePrice(b);
    if (mode === 'preco-maior') return parsePrice(b) - parsePrice(a);
    return Number(a.dataset.order || 0) - Number(b.dataset.order || 0);
  });

  cards.forEach((card) => grid.appendChild(card));
}

function updateResultCount() {
  const count = Array.from(document.querySelectorAll('[data-catalog-card]')).filter((card) => !card.hidden).length;
  document.querySelectorAll('[data-result-count]').forEach((node) => {
    node.textContent = `${count} obra${count === 1 ? '' : 's'} encontrada${count === 1 ? '' : 's'}`;
  });
}

function applyCatalogFilters() {
  const query = normalize(document.querySelector('[data-catalog-search]')?.value || '');
  const activeFilter = normalize(getActiveFilter());

  document.querySelectorAll('[data-catalog-card]').forEach((card) => {
    const text = normalize(`${card.dataset.search || ''} ${card.textContent || ''}`);
    const tags = normalize(card.dataset.tags || '');
    const matchesQuery = !query || text.includes(query);
    const matchesFilter = activeFilter === 'todos' || tags.includes(activeFilter) || text.includes(activeFilter);
    card.hidden = !(matchesQuery && matchesFilter);
  });

  sortCatalog();
  updateResultCount();
}

function clearFilters() {
  const search = document.querySelector('[data-catalog-search]');
  const sort = document.querySelector('[data-catalog-sort]');
  if (search) search.value = '';
  if (sort) sort.value = 'curadoria';
  document.querySelectorAll('[data-filter]').forEach((button) => button.classList.remove('is-active'));
  document.querySelector('[data-filter="todos"]')?.classList.add('is-active');
  applyCatalogFilters();
}

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-catalog-search]')) applyCatalogFilters();
});

document.addEventListener('change', (event) => {
  if (event.target.matches('[data-catalog-sort]')) applyCatalogFilters();
});

document.addEventListener('click', (event) => {
  const clear = event.target.closest('[data-clear-catalog]');
  if (clear) {
    event.preventDefault();
    clearFilters();
    return;
  }

  const filter = event.target.closest('[data-filter]');
  if (!filter) return;

  event.preventDefault();
  document.querySelectorAll('[data-filter]').forEach((button) => button.classList.remove('is-active'));
  filter.classList.add('is-active');
  applyCatalogFilters();
});

document.addEventListener('DOMContentLoaded', applyCatalogFilters);

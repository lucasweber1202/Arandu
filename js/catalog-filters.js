/*
  ARANDU — filtros e busca do catálogo

  Funciona sem backend:
  - Busca por título, artista, técnica e contexto.
  - Filtros por categoria, orçamento, ambiente e intenção.
  - Usa atributos data-search e data-tags nos cards.
*/

function normalize(value) {
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getActiveFilter() {
  return document.querySelector('[data-filter].is-active')?.dataset.filter || 'todos';
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
}

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-catalog-search]')) applyCatalogFilters();
});

document.addEventListener('click', (event) => {
  const filter = event.target.closest('[data-filter]');
  if (!filter) return;

  event.preventDefault();
  document.querySelectorAll('[data-filter]').forEach((button) => button.classList.remove('is-active'));
  filter.classList.add('is-active');
  applyCatalogFilters();
});

document.addEventListener('DOMContentLoaded', applyCatalogFilters);

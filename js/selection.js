/*
  ARANDU — Minha Seleção
  Parte 8 — primeira versão funcional sem backend.

  O que este arquivo faz:
  1. Captura cliques em botões/links com data-save-artwork.
  2. Salva a obra no localStorage do navegador.
  3. Renderiza a lista salva em páginas que tenham [data-selection-list].
  4. Permite limpar a seleção.

  Esta solução é propositalmente simples: funciona em hospedagem estática
  e depois pode ser substituída por Supabase/PostgreSQL sem mudar a jornada.
*/

const ARANDU_SELECTION_KEY = 'arandu.selection.v1';

function readSelection() {
  try {
    return JSON.parse(localStorage.getItem(ARANDU_SELECTION_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeSelection(items) {
  localStorage.setItem(ARANDU_SELECTION_KEY, JSON.stringify(items));
}

function saveArtworkFromElement(element) {
  const artwork = {
    id: element.dataset.artworkId || element.dataset.saveArtwork,
    title: element.dataset.artworkTitle || 'Obra Arandu',
    artist: element.dataset.artworkArtist || 'Artista Arandu',
    context: element.dataset.artworkContext || 'Seleção curatorial',
    url: element.dataset.artworkUrl || window.location.pathname
  };

  const current = readSelection();
  const exists = current.some((item) => item.id === artwork.id);
  const next = exists ? current : [...current, artwork];
  writeSelection(next);
  renderSelection();

  element.textContent = exists ? 'Já está na sua seleção' : 'Salvo na minha seleção';
}

function renderSelection() {
  const target = document.querySelector('[data-selection-list]');
  if (!target) return;

  const items = readSelection();
  if (!items.length) {
    target.innerHTML = '<p>Sua seleção ainda está vazia. Salve obras no catálogo para pedir orientação à curadoria.</p>';
    return;
  }

  target.innerHTML = items.map((item) => `
    <article class="selection-item">
      <h3>${item.title}</h3>
      <p>${item.artist}</p>
      <p>${item.context}</p>
      <a href="${item.url}">Ver obra</a>
    </article>
  `).join('');
}

function clearSelection() {
  localStorage.removeItem(ARANDU_SELECTION_KEY);
  renderSelection();
}

document.addEventListener('click', (event) => {
  const saveButton = event.target.closest('[data-save-artwork]');
  if (saveButton) {
    event.preventDefault();
    saveArtworkFromElement(saveButton);
  }

  const clearButton = event.target.closest('[data-clear-selection]');
  if (clearButton) {
    event.preventDefault();
    clearSelection();
  }
});

document.addEventListener('DOMContentLoaded', renderSelection);

/*
  ARANDU — Minha Seleção

  Implementação estática com localStorage.

  Melhorias desta versão:
  - Salva obras no navegador.
  - Renderiza a seleção em páginas compatíveis.
  - Atualiza contador em elementos [data-selection-count].
  - Permite remover obra individualmente.
  - Permite limpar toda a seleção.
  - Mantém a jornada consultiva: seleção antes de carrinho.
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
  updateSelectionCount();
}

function updateSelectionCount() {
  const count = readSelection().length;
  document.querySelectorAll('[data-selection-count]').forEach((node) => {
    node.textContent = String(count);
  });
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
  element.setAttribute('aria-live', 'polite');
}

function removeArtwork(id) {
  const next = readSelection().filter((item) => item.id !== id);
  writeSelection(next);
  renderSelection();
}

function renderSelection() {
  updateSelectionCount();

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
      <div class="tags">
        <a class="tag" href="${item.url}">Ver obra</a>
        <button class="tag" type="button" data-remove-artwork="${item.id}">Remover</button>
      </div>
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

  const removeButton = event.target.closest('[data-remove-artwork]');
  if (removeButton) {
    event.preventDefault();
    removeArtwork(removeButton.dataset.removeArtwork);
  }

  const clearButton = event.target.closest('[data-clear-selection]');
  if (clearButton) {
    event.preventDefault();
    clearSelection();
  }
});

document.addEventListener('DOMContentLoaded', renderSelection);

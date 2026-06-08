/*
  ARANDU — Minha Seleção

  Implementação estática com localStorage.
  Salva obras, renderiza a seleção, atualiza contador, remove itens,
  permite observação por obra, copia resumo e prepara envio por WhatsApp.
*/

const ARANDU_SELECTION_KEY = 'arandu.selection.v1';

function readSelection() {
  try { return JSON.parse(localStorage.getItem(ARANDU_SELECTION_KEY) || '[]'); } catch { return []; }
}

function writeSelection(items) {
  localStorage.setItem(ARANDU_SELECTION_KEY, JSON.stringify(items));
  updateSelectionCount();
}

function updateSelectionCount() {
  const count = readSelection().length;
  document.querySelectorAll('[data-selection-count]').forEach((node) => { node.textContent = String(count); });
}

function saveArtworkFromElement(element) {
  const artwork = {
    id: element.dataset.artworkId || element.dataset.saveArtwork,
    title: element.dataset.artworkTitle || 'Obra Arandu',
    artist: element.dataset.artworkArtist || 'Artista Arandu',
    context: element.dataset.artworkContext || 'Seleção curatorial',
    url: element.dataset.artworkUrl || window.location.pathname,
    note: ''
  };
  const current = readSelection();
  const exists = current.some((item) => item.id === artwork.id);
  writeSelection(exists ? current : [...current, artwork]);
  renderSelection();
  element.textContent = exists ? 'Já está na sua seleção' : 'Salvo na minha seleção';
  element.setAttribute('aria-live', 'polite');
}

function removeArtwork(id) {
  writeSelection(readSelection().filter((item) => item.id !== id));
  renderSelection();
}

function updateArtworkNote(id, note) {
  writeSelection(readSelection().map((item) => item.id === id ? { ...item, note } : item));
}

function buildSelectionSummary() {
  const items = readSelection();
  if (!items.length) return 'Minha seleção Arandu está vazia.';
  return items.map((item, index) => {
    const note = item.note ? `\n   Observação: ${item.note}` : '';
    return `${index + 1}. ${item.title} — ${item.artist}\n   Contexto: ${item.context}\n   Link: ${item.url}${note}`;
  }).join('\n\n');
}

async function copySelectionSummary() {
  const summary = buildSelectionSummary();
  try {
    await navigator.clipboard.writeText(summary);
    document.querySelectorAll('[data-copy-selection]').forEach((button) => { button.textContent = 'Seleção copiada'; });
  } catch {
    alert(summary);
  }
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
      <label>Observação para a curadoria
        <textarea data-selection-note="${item.id}" placeholder="Ex.: esta obra seria para minha sala, parede de 2,40 m...">${item.note || ''}</textarea>
      </label>
      <div class="tags">
        <a class="tag" href="${item.url}">Ver obra</a>
        <button class="tag" type="button" data-remove-artwork="${item.id}">Remover</button>
      </div>
    </article>`).join('');
}

function clearSelection() {
  localStorage.removeItem(ARANDU_SELECTION_KEY);
  renderSelection();
}

document.addEventListener('click', (event) => {
  const saveButton = event.target.closest('[data-save-artwork]');
  if (saveButton) { event.preventDefault(); saveArtworkFromElement(saveButton); }
  const removeButton = event.target.closest('[data-remove-artwork]');
  if (removeButton) { event.preventDefault(); removeArtwork(removeButton.dataset.removeArtwork); }
  const clearButton = event.target.closest('[data-clear-selection]');
  if (clearButton) { event.preventDefault(); clearSelection(); }
  const copyButton = event.target.closest('[data-copy-selection]');
  if (copyButton) { event.preventDefault(); copySelectionSummary(); }
});

document.addEventListener('input', (event) => {
  const note = event.target.closest('[data-selection-note]');
  if (note) updateArtworkNote(note.dataset.selectionNote, note.value);
});

document.addEventListener('DOMContentLoaded', renderSelection);

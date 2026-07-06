/* ARANDU — Minha Seleção estática enriquecida */
const ARANDU_SELECTION_KEY = 'arandu.selection.v1';

function escapeSelectionHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function normalizeSelectionUrl(value) {
  const url = String(value || '').trim();
  if (!url) return 'obras.html';
  if (/^(https?:)?\/\//i.test(url)) return 'obras.html';
  return url.replace(/^\/+/, '');
}

function readSelection() {
  try { const parsed = JSON.parse(localStorage.getItem(ARANDU_SELECTION_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function writeSelection(items) {
  localStorage.setItem(ARANDU_SELECTION_KEY, JSON.stringify(items));
  updateSelectionCount();
  document.dispatchEvent(new CustomEvent('arandu:selection-updated', { detail: { items } }));
}

function updateSelectionCount() {
  const count = readSelection().length;
  document.querySelectorAll('[data-selection-count]').forEach((node) => { node.textContent = String(count); });
}

function normalizeArtworkFromElement(element) {
  return {
    id: element.dataset.artworkId || element.dataset.saveArtwork || `artwork_${Date.now()}`,
    title: element.dataset.artworkTitle || 'Obra Arandu',
    artist: element.dataset.artworkArtist || 'Artista Arandu',
    context: element.dataset.artworkContext || 'Seleção curatorial',
    url: normalizeSelectionUrl(element.dataset.artworkUrl || window.location.pathname),
    price: element.dataset.artworkPrice || '',
    priceLabel: element.dataset.artworkPriceLabel || element.dataset.artworkPrice || '',
    technique: element.dataset.artworkTechnique || '',
    dimensions: element.dataset.artworkDimensions || '',
    status: element.dataset.artworkStatus || '',
    thumb: element.dataset.artworkThumb || '',
    note: ''
  };
}

function saveArtworkObject(artwork) {
  const clean = { ...artwork, url: normalizeSelectionUrl(artwork.url) };
  const current = readSelection();
  const exists = current.some((item) => item.id === clean.id);
  writeSelection(exists ? current.map((item) => item.id === clean.id ? { ...item, ...clean, note: item.note || clean.note || '' } : item) : [...current, clean]);
  renderSelection();
  return !exists;
}

function saveArtworkFromElement(element) {
  const added = saveArtworkObject(normalizeArtworkFromElement(element));
  element.textContent = added ? 'Salvo na seleção' : 'Atualizado na seleção';
  element.setAttribute('aria-live', 'polite');
}

function removeArtwork(id) { writeSelection(readSelection().filter((item) => item.id !== id)); renderSelection(); }
function updateArtworkNote(id, note) { writeSelection(readSelection().map((item) => item.id === id ? { ...item, note } : item)); }
function clearSelection() { localStorage.removeItem(ARANDU_SELECTION_KEY); renderSelection(); }

function buildSelectionSummary() {
  const items = readSelection();
  if (!items.length) return 'Minha seleção Arandu está vazia.';
  return items.map((item, index) => {
    const note = item.note ? `\n   Observação: ${item.note}` : '';
    const price = item.priceLabel ? `\n   Valor: ${item.priceLabel}` : '';
    const tech = item.technique ? `\n   Técnica: ${item.technique}` : '';
    const dims = item.dimensions ? `\n   Dimensões: ${item.dimensions}` : '';
    return `${index + 1}. ${item.title} — ${item.artist}${price}${tech}${dims}\n   Contexto: ${item.context}\n   Link: ${normalizeSelectionUrl(item.url)}${note}`;
  }).join('\n\n');
}

async function copySelectionSummary() {
  const summary = buildSelectionSummary();
  try { await navigator.clipboard.writeText(summary); document.querySelectorAll('[data-copy-selection]').forEach((button) => { button.textContent = 'Seleção copiada'; }); }
  catch { alert(summary); }
}

function renderSelection() {
  updateSelectionCount();
  const target = document.querySelector('[data-selection-list]');
  if (!target) return;
  const items = readSelection();
  if (!items.length) { target.innerHTML = '<p>Sua seleção ainda está vazia. Salve obras no acervo para pedir orientação à curadoria.</p>'; return; }
  target.innerHTML = items.map((item) => {
    const id = escapeSelectionHtml(item.id);
    const url = escapeSelectionHtml(normalizeSelectionUrl(item.url));
    return `
      <article class="selection-item">
        <h3>${escapeSelectionHtml(item.title)}</h3>
        <p>${escapeSelectionHtml(item.artist)}</p>
        <p>${escapeSelectionHtml([item.technique, item.dimensions, item.priceLabel || item.price].filter(Boolean).join(' · '))}</p>
        <p>${escapeSelectionHtml(item.context)}</p>
        <label>Observação para a curadoria
          <textarea data-selection-note="${id}" placeholder="Ex.: esta obra seria para minha sala, recepção ou consultório...">${escapeSelectionHtml(item.note || '')}</textarea>
        </label>
        <div class="tags">
          <a class="tag" href="${url}">Ver obra</a>
          <button class="tag" type="button" data-reserve-artwork="${id}" data-reserve-title="${escapeSelectionHtml(item.title)}" data-reserve-artist="${escapeSelectionHtml(item.artist)}" data-reserve-url="${url}">Reservar com curadoria</button>
          <button class="tag" type="button" data-remove-artwork="${id}">Remover</button>
        </div>
      </article>`;
  }).join('');
}

window.ARANDU_SELECTION = { read: readSelection, write: writeSelection, save: saveArtworkObject, summary: buildSelectionSummary, clear: clearSelection };

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

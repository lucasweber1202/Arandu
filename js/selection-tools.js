function getStoredSelection() {
  try { return JSON.parse(localStorage.getItem('arandu.selection.v1') || '[]'); } catch { return []; }
}

function buildSelectionDocument() {
  const items = getStoredSelection();
  const rows = items.length ? items.map((item, index) => `
    <tr><td>${index + 1}</td><td>${item.title}</td><td>${item.artist}</td><td>${item.context}</td><td>${item.note || ''}</td></tr>`).join('') : '<tr><td colspan="5">Nenhuma obra salva.</td></tr>';
  return `<!doctype html><html><head><meta charset="UTF-8"><title>Seleção Arandu</title><style>body{font-family:Arial,sans-serif;background:#f4c7a8;color:#241611;padding:40px}h1{font-family:Georgia,serif;color:#6f221b}table{width:100%;border-collapse:collapse;background:#ffe0c7}td,th{border:1px solid #b88452;padding:12px;text-align:left}</style></head><body><h1>Minha seleção Arandu</h1><p>Seleção criada para conversa com a curadoria.</p><table><tr><th>#</th><th>Obra</th><th>Artista</th><th>Contexto</th><th>Observação</th></tr>${rows}</table></body></html>`;
}

function downloadSelectionHtml() {
  const blob = new Blob([buildSelectionDocument()], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'selecao-arandu.html';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderSelectionComparison() {
  const target = document.querySelector('[data-selection-comparison]');
  if (!target) return;
  const items = getStoredSelection();
  if (!items.length) {
    target.innerHTML = '<p>Salve obras para comparar sua seleção.</p>';
    return;
  }
  target.innerHTML = `<div class="grid grid-3">${items.map((item) => `
    <article class="card"><h3>${item.title}</h3><p>${item.artist}</p><p>${item.context}</p><p>${item.note || 'Adicione uma observação para orientar a curadoria.'}</p></article>`).join('')}</div>`;
}

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-download-selection]')) {
    event.preventDefault();
    downloadSelectionHtml();
  }
  if (event.target.closest('[data-show-selection-comparison]')) {
    event.preventDefault();
    renderSelectionComparison();
  }
});

document.addEventListener('DOMContentLoaded', renderSelectionComparison);

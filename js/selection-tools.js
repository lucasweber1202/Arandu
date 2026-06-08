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

function getSelectionTerms(items) {
  const text = items.map((item) => `${item.title} ${item.artist} ${item.context} ${item.note || ''}`).join(' ').toLowerCase();
  const map = [
    ['matéria', ['terra', 'solo', 'matéria', 'pintura', 'óleo']],
    ['memória', ['memória', 'sertão', 'botânica', 'silêncio']],
    ['movimento', ['movimento', 'urbana', 'ritmo', 'cidade']],
    ['fotografia', ['fotografia', 'fine art', 'imagem']],
    ['escultura', ['escultura', 'bronze', 'objeto', 'volume']],
    ['tons terrosos', ['solo', 'terra', 'outono', 'argila']]
  ];
  return map.filter(([, words]) => words.some((word) => text.includes(word))).map(([label]) => label);
}

function renderCuratorialReading() {
  const target = document.querySelector('[data-curatorial-reading]');
  if (!target) return;
  const items = getStoredSelection();
  if (!items.length) {
    target.innerHTML = '<article class="curatorial-reading"><h3>Leitura curatorial automática</h3><p>Salve duas ou três obras para receber uma leitura inicial sobre o seu perfil de interesse.</p></article>';
    return;
  }
  const terms = getSelectionTerms(items);
  const safeTerms = terms.length ? terms : ['interesse inicial', 'curiosidade visual', 'seleção em formação'];
  target.innerHTML = `<article class="curatorial-reading"><p class="eyebrow">Leitura curatorial automática</p><h3>Sua seleção indica interesse por:</h3><div class="reading-list">${safeTerms.map((term) => `<span>${term}</span>`).join('')}</div><p><strong>Caminho recomendado:</strong> compare linguagem, escala e faixa de preço antes de decidir. Depois, peça uma leitura da curadoria para entender qual obra conversa melhor com seu momento.</p><div class="page-actions"><a class="cta" href="comparar-obras.html">Comparar caminhos</a><a class="cta secondary" href="contato.html">Pedir leitura da curadoria</a></div></article>`;
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
    renderCuratorialReading();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  renderSelectionComparison();
  renderCuratorialReading();
});

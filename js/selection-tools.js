function getStoredSelection() {
  try { return JSON.parse(localStorage.getItem('arandu.selection.v1') || '[]'); } catch { return []; }
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function buildSelectionDocument() {
  const items = getStoredSelection();
  const rows = items.length ? items.map((item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.artist)}</td><td>${escapeHtml(item.context)}</td><td>${escapeHtml(item.note || '')}</td></tr>`).join('') : '<tr><td colspan="5">Nenhuma obra salva.</td></tr>';
  return `<!doctype html><html><head><meta charset="UTF-8"><title>Seleção Arandu</title><style>body{font-family:Arial,sans-serif;background:#efe3d1;color:#211713;padding:42px}h1,h2{font-family:Georgia,serif;color:#5a1f1a}p{line-height:1.6}table{width:100%;border-collapse:collapse;background:#f7ead9;border-radius:18px;overflow:hidden}td,th{border:1px solid #ad8a62;padding:12px;text-align:left}.note{background:#173f31;color:#f7ead9;padding:22px;border-radius:18px;margin:22px 0}</style></head><body><h1>Minha seleção Arandu</h1><div class="note"><p>Seleção criada para conversa com a curadoria. Compare presença, linguagem, escala, orçamento e intenção antes de decidir.</p></div><table><tr><th>#</th><th>Obra</th><th>Artista</th><th>Contexto</th><th>Observação</th></tr>${rows}</table></body></html>`;
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
    ['matéria e terra', ['terra', 'solo', 'matéria', 'pintura', 'óleo', 'argila']],
    ['memória e território', ['memória', 'sertão', 'botânica', 'silêncio', 'território']],
    ['movimento urbano', ['movimento', 'urbana', 'ritmo', 'cidade']],
    ['fotografia de entrada', ['fotografia', 'fine art', 'imagem']],
    ['escultura e volume', ['escultura', 'bronze', 'objeto', 'volume']],
    ['tons terrosos', ['solo', 'terra', 'outono', 'ocre', 'barro']]
  ];
  return map.filter(([, words]) => words.some((word) => text.includes(word))).map(([label]) => label);
}

function inferNextStep(items, terms) {
  if (items.length < 2) return 'salve ao menos mais uma obra para comparar linguagem e presença.';
  if (terms.includes('fotografia de entrada')) return 'compare fotografia com pintura pequena para decidir entre narrativa e matéria.';
  if (terms.includes('escultura e volume')) return 'confira escala, base de apoio e circulação do ambiente antes de reservar.';
  if (terms.includes('matéria e terra')) return 'observe como tons, textura e dimensão conversam com a luz do espaço.';
  return 'compare linguagem, escala e faixa de preço antes de decidir.';
}

function renderCuratorialReading() {
  const target = document.querySelector('[data-curatorial-reading]');
  if (!target) return;
  const items = getStoredSelection();
  if (!items.length) {
    target.innerHTML = '<article class="selection-reading-card"><p class="eyebrow">Leitura curatorial automática</p><h3>Salve obras para formar uma leitura.</h3><p>Com duas ou três obras, a seleção começa a revelar preferências de linguagem, presença, matéria e orçamento.</p><div class="page-actions"><a class="cta secondary" href="obras.html">Ver acervo</a><a class="cta secondary" href="pesquisa.html">Pesquisar</a></div></article>';
    return;
  }
  const terms = getSelectionTerms(items);
  const safeTerms = terms.length ? terms : ['interesse inicial', 'curiosidade visual', 'seleção em formação'];
  const nextStep = inferNextStep(items, safeTerms);
  target.innerHTML = `<article class="selection-reading-card"><p class="eyebrow">Leitura curatorial automática</p><h3>Sua seleção indica interesse por:</h3><div class="reading-list">${safeTerms.map((term) => `<span>${escapeHtml(term)}</span>`).join('')}</div><p><strong>Caminho recomendado:</strong> ${escapeHtml(nextStep)}</p><p>Use esta leitura como ponto de partida. A decisão final deve considerar ambiente, luz, escala, trajetória do artista e o tipo de presença desejada.</p><div class="page-actions"><a class="cta secondary" href="comparar-obras.html">Comparar caminhos</a><a class="cta secondary" href="contato.html">Pedir leitura da curadoria</a><a class="cta secondary" href="pesquisa.html">Pesquisar semelhantes</a></div></article>`;
}

function renderSelectionComparison() {
  const target = document.querySelector('[data-selection-comparison]');
  if (!target) return;
  const items = getStoredSelection();
  if (!items.length) {
    target.innerHTML = '<p>Salve obras para comparar sua seleção.</p>';
    return;
  }
  target.innerHTML = `<div class="grid grid-3">${items.map((item) => `<article class="card"><span class="tag">Selecionada</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.artist)}</p><p>${escapeHtml(item.context)}</p><p>${escapeHtml(item.note || 'Adicione uma observação para orientar a curadoria.')}</p><div class="page-actions"><a class="cta secondary" href="${escapeHtml(item.url || 'obras.html')}">Ver obra</a></div></article>`).join('')}</div>`;
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

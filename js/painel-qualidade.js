const QUALITY_TOKEN_KEY = 'arandu.admin.token';

function qualityToken() {
  return localStorage.getItem(QUALITY_TOKEN_KEY) || '';
}

function setQualityToken(value) {
  localStorage.setItem(QUALITY_TOKEN_KEY, value.trim());
}

async function qualityFetch() {
  const response = await fetch('/api/admin/quality', {
    headers: { 'x-arandu-admin-token': qualityToken() }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Falha ao carregar auditoria.');
  return data;
}

function renderQuality(data) {
  const target = document.querySelector('[data-quality-panel]');
  if (!target) return;
  const metrics = data.metrics || {};
  const issues = data.issues || [];
  const rows = issues.map((issue) => `<tr><td>${issue.issue_type}</td><td>${issue.label || issue.entity_id}</td><td>${issue.description}</td></tr>`).join('');
  target.innerHTML = `
    <div class="grid grid-4">
      <article class="card"><h3>${data.score ?? '—'}</h3><p>Índice operacional</p></article>
      <article class="card"><h3>${issues.length}</h3><p>Alertas</p></article>
      <article class="card"><h3>${metrics.openTasks ?? 0}</h3><p>Tarefas abertas</p></article>
      <article class="card"><h3>${metrics.overdueTasks ?? 0}</h3><p>Tarefas vencidas</p></article>
    </div>
    <div class="card"><h3>Verificações</h3>${issues.length ? `<div style="overflow:auto"><table class="compare-table"><thead><tr><th>Tipo</th><th>Registro</th><th>Descrição</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p>Nenhum alerta crítico identificado.</p>'}</div>`;
}

async function loadQuality() {
  const status = document.querySelector('[data-quality-status]');
  if (!qualityToken()) {
    if (status) status.textContent = 'Informe a chave administrativa.';
    return;
  }
  try {
    if (status) status.textContent = 'Carregando verificações...';
    const data = await qualityFetch();
    renderQuality(data);
    if (status) status.textContent = data.mode === 'demo' ? 'Modo demonstração.' : 'Verificação concluída.';
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-admin-token]')) setQualityToken(event.target.value);
});

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-quality-refresh]')) loadQuality();
});

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-admin-token]').forEach((input) => { input.value = qualityToken(); });
  const status = document.querySelector('[data-quality-status]');
  if (status && !document.querySelector('[data-catalog-review-link]')) {
    const link = document.createElement('a');
    link.href = 'revisao-catalogo.html';
    link.className = 'btn btn-secondary';
    link.dataset.catalogReviewLink = '';
    link.textContent = 'Abrir revisão editorial';
    status.insertAdjacentElement('afterend', link);
  }
  loadQuality();
});

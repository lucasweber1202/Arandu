/* ARANDU — auditoria operacional do acervo */
(() => {
  const statusNode = () => document.querySelector('[data-quality-status]');
  const panel = () => document.querySelector('[data-quality-panel]');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function setStatus(text) {
    const node = statusNode();
    if (!node) return;
    node.setAttribute('role', 'status');
    node.setAttribute('aria-live', 'polite');
    node.textContent = text;
  }

  function formatTime(value) {
    if (!value) return '';
    try { return new Date(value).toLocaleString('pt-BR'); } catch { return ''; }
  }

  function renderEmpty(target) {
    target.innerHTML = '<div class="card"><h2>Nenhuma pendência encontrada</h2>'
      + '<p>Todas as verificações rodaram e nenhuma obra, artista, certificado, submissão ou lead está travado.</p></div>';
  }

  function render(data) {
    const target = panel();
    if (!target) return;
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const metrics = data.metrics || {};
    const checks = data.checks || {};

    const failedNote = Array.isArray(checks.failed) && checks.failed.length
      ? `<div class="card"><h3>Verificações que não rodaram</h3><p>Estas não puderam ser consultadas agora, então esta tela <strong>não</strong> afirma que estão em ordem:</p><ul>${checks.failed.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`
      : '';

    const grouped = new Map();
    issues.forEach((issue) => {
      const list = grouped.get(issue.issue_type) || [];
      list.push(issue);
      grouped.set(issue.issue_type, list);
    });

    const tables = [...grouped.entries()].map(([type, list]) => `<section class="card">
      <h3>${escapeHtml(list[0].description || type)} <span class="tag">${list.length}</span></h3>
      <div class="portal-table-wrap"><table class="compare-table">
        <thead><tr><th>Registro</th><th>ID</th></tr></thead>
        <tbody>${list.map((issue) => `<tr><td>${escapeHtml(issue.label || '—')}</td><td><code>${escapeHtml(issue.entity_id || '')}</code></td></tr>`).join('')}</tbody>
      </table></div>
    </section>`).join('');

    target.innerHTML = `<div class="grid grid-4">
        <article class="card"><h3>${escapeHtml(String(data.score ?? '—'))}</h3><p>Índice operacional</p></article>
        <article class="card"><h3>${issues.length}</h3><p>Pendências</p></article>
        <article class="card"><h3>${Number(metrics.openTasks || 0)}</h3><p>Tarefas abertas</p></article>
        <article class="card"><h3>${Number(metrics.overdueTasks || 0)}</h3><p>Tarefas vencidas</p></article>
      </div>
      ${failedNote}${tables}`;
    if (!issues.length && !failedNote) renderEmpty(target);
  }

  async function loadQuality() {
    setStatus('Rodando verificação...');
    let response;
    try {
      response = await fetch('/api/admin/quality', { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
    } catch {
      setStatus('Sem conexão com o servidor. Nada foi verificado.');
      return;
    }
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      setStatus('Sessão administrativa necessária. Entre novamente para rodar a auditoria.');
      return;
    }
    if (!response.ok || data.ok === false) {
      setStatus(data.error || 'Não foi possível rodar a verificação agora.');
      const target = panel();
      if (target) target.innerHTML = `<div class="card"><h2>Auditoria indisponível</h2><p>${escapeHtml(data.error || 'Tente novamente em instantes.')}</p></div>`;
      return;
    }
    render(data);
    const when = formatTime(data.checkedAt);
    const ran = data.checks?.ran ?? 0;
    const total = data.checks?.total ?? 0;
    setStatus(`${ran} de ${total} verificações rodaram${when ? ` às ${when}` : ''}.`);
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-quality-refresh]')) loadQuality();
  });

  document.addEventListener('DOMContentLoaded', () => {
    // A auditoria não pede mais chave: a sessão administrativa é HttpOnly e o
    // servidor decide. O painel antes travava em "Informe a chave
    // administrativa" e nunca carregava nada.
    const status = statusNode();
    if (status && !document.querySelector('[data-catalog-review-link]')) {
      const link = document.createElement('a');
      link.href = 'revisao-catalogo.html';
      link.className = 'cta secondary';
      link.dataset.catalogReviewLink = '';
      link.textContent = 'Abrir revisão editorial';
      status.insertAdjacentElement('afterend', link);
    }
    loadQuality();
  });
})();

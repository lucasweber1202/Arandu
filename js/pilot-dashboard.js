/* ARANDU — métricas do piloto fechado */
(() => {
  const root = document.querySelector('[data-pilot-dashboard]');
  const status = document.querySelector('[data-pilot-dashboard-status]');
  if (!root) return;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function setStatus(text) {
    if (!status) return;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = text;
  }

  function label(key) {
    return String(key).replace(/_/g, ' ');
  }

  async function load() {
    setStatus('Carregando métricas...');
    let response;
    try {
      response = await fetch('/api/pilot/metrics', { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } });
    } catch {
      setStatus('Sem conexão com o servidor. Nada foi carregado.');
      return;
    }
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      setStatus('Sessão administrativa necessária. Entre novamente pelo console.');
      return;
    }
    if (!response.ok || payload?.ok === false) {
      setStatus(payload?.error || 'Não foi possível carregar as métricas agora.');
      return;
    }
    const metrics = Object.entries(payload.metrics || {});
    if (!metrics.length) {
      root.innerHTML = '<article class="card"><h2>Nenhuma métrica ainda</h2><p>O piloto fechado não registrou eventos. Enquanto ninguém entrar por um convite, não há o que medir — e este painel não inventa número.</p></article>';
      setStatus('Consulta concluída.');
      return;
    }
    root.innerHTML = metrics
      .map(([key, count]) => `<article class="card"><strong>${Number(count || 0)}</strong><span>${escapeHtml(label(key))}</span></article>`)
      .join('');
    setStatus('Métricas atualizadas.');
  }

  // O painel carrega ao abrir, como os demais do console. Antes ele exigia
  // digitar uma chave de sessão que deixou de existir quando a autenticação
  // virou cookie HttpOnly: quem abria a tela via um botão e mais nada.
  document.querySelector('[data-pilot-dashboard-load]')?.addEventListener('click', load);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();

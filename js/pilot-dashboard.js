(function () {
  const root = document.querySelector('[data-pilot-dashboard]');
  const token = document.querySelector('[data-pilot-admin-session-hint]');
  const status = document.querySelector('[data-pilot-dashboard-status]');
  if (!root || !token) return;
  async function load() {
    const value = token.value.trim();
    if (!value) { status.textContent = 'Sessão administrativa não reconhecida. Entre de novo pelo console.'; return; }
    status.textContent = 'Carregando métricas...';
    try {
      const response = await fetch('/api/pilot/metrics', { cache: 'no-store', headers: { } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'Falha ao carregar.');
      const metrics = payload.metrics || {};
      root.innerHTML = Object.entries(metrics).map(([key, count]) => `<article class="card"><strong>${Number(count || 0)}</strong><span>${key.replaceAll('_',' ')}</span></article>`).join('');
      status.textContent = 'Métricas atualizadas.';
      sessionStorage.setItem('arandu.admin.sessionHint', value);
    } catch (error) { status.textContent = error.message; }
  }
  token.value = sessionStorage.getItem('arandu.admin.sessionHint') || '';
  document.querySelector('[data-pilot-dashboard-load]')?.addEventListener('click', load);
})();

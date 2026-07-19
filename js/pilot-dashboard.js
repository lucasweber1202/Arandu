(function () {
  const root = document.querySelector('[data-pilot-dashboard]');
  const token = document.querySelector('[data-pilot-admin-token]');
  const status = document.querySelector('[data-pilot-dashboard-status]');
  if (!root || !token) return;
  async function load() {
    const value = token.value.trim();
    if (!value) { status.textContent = 'Informe o token administrativo.'; return; }
    status.textContent = 'Carregando métricas...';
    try {
      const response = await fetch('/api/pilot/metrics', { cache: 'no-store', headers: { 'x-arandu-admin-token': value } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'Falha ao carregar.');
      const metrics = payload.metrics || {};
      root.innerHTML = Object.entries(metrics).map(([key, count]) => `<article class="card"><strong>${Number(count || 0)}</strong><span>${key.replaceAll('_',' ')}</span></article>`).join('');
      status.textContent = 'Métricas atualizadas.';
      sessionStorage.setItem('arandu.admin.token', value);
    } catch (error) { status.textContent = error.message; }
  }
  token.value = sessionStorage.getItem('arandu.admin.token') || '';
  document.querySelector('[data-pilot-dashboard-load]')?.addEventListener('click', load);
})();

(() => {
  const root = document.querySelector('[data-api-status]');
  if (!root) return;

  const label = (value) => value ? 'Configurado' : 'Pendente';
  const className = (value) => value ? 'status-ok' : 'status-warn';

  const render = (payload) => {
    const checks = payload.checks || {};
    const rows = [
      ['API', checks.api],
      ['Roteador principal', checks.mainRouter],
      ['SUPABASE_URL', checks.supabaseUrl],
      ['SUPABASE_ANON_KEY', checks.supabaseAnonKey],
      ['SUPABASE_SERVICE_ROLE_KEY', checks.supabaseServiceRoleKey],
      ['ARANDU_ADMIN_TOKEN', checks.adminToken]
    ];

    root.innerHTML = `
      <div class="certificate-preview">
        <p class="eyebrow">Status da API</p>
        <h2>${payload.productionReady ? 'Produção quase pronta' : 'Pré-produção'}</h2>
        <p>Ambiente: ${payload.environment || 'local'}${payload.commit ? ` · Commit: ${payload.commit.slice(0, 7)}` : ''}</p>
      </div>
      <div class="operational-board">
        ${rows.map(([name, value]) => `
          <article class="mini-kpi ${className(value)}">
            <strong>${value ? 'OK' : '!'}</strong>
            <h3>${name}</h3>
            <p>${label(value)}</p>
          </article>
        `).join('')}
      </div>
      <div class="collector-guidance">
        <div>
          <p class="eyebrow">Rotas principais</p>
          <h2 class="section-title">A API pública mantém estes caminhos.</h2>
        </div>
        <ol class="process-steps">${(payload.routes || []).slice(0, 12).map((route) => `<li>${route}</li>`).join('')}</ol>
      </div>
    `;
  };

  fetch('/api/health')
    .then((response) => response.json())
    .then(render)
    .catch((error) => {
      root.innerHTML = `
        <div class="certificate-preview">
          <p class="eyebrow">Status da API</p>
          <h2>Não foi possível consultar /api/health</h2>
          <p>${error.message || 'Erro inesperado.'}</p>
        </div>
      `;
    });
})();

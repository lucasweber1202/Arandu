(() => {
  const root = document.querySelector('[data-api-status]');
  if (!root) return;

  const label = (value) => value ? 'Configurado' : 'Pendente';
  const className = (value) => value ? 'status-ok' : 'status-warn';

  const el = (tag, classNames, text) => {
    const node = document.createElement(tag);
    if (classNames) node.className = classNames;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const clear = () => {
    while (root.firstChild) root.removeChild(root.firstChild);
  };

  const appendIntro = (payload) => {
    const box = el('div', 'certificate-preview');
    box.appendChild(el('p', 'eyebrow', 'Status da API'));
    box.appendChild(el('h2', '', payload.productionReady ? 'Produção tecnicamente pronta' : 'Pré-produção'));
    const commit = payload.commit ? ` · Commit: ${String(payload.commit).slice(0, 7)}` : '';
    box.appendChild(el('p', '', `Ambiente: ${payload.environment || 'local'}${commit}`));
    if (payload.launchReadiness?.nextCriticalActions?.length) {
      const list = el('div', 'readiness-list');
      payload.launchReadiness.nextCriticalActions.forEach((action) => list.appendChild(el('p', '', action)));
      box.appendChild(list);
    }
    root.appendChild(box);
  };

  const appendCards = (rows) => {
    const board = el('div', 'operational-board');
    rows.forEach(([name, value]) => {
      const card = el('article', `mini-kpi ${className(value)}`);
      card.appendChild(el('strong', '', value ? 'OK' : '!'));
      card.appendChild(el('h3', '', name));
      card.appendChild(el('p', '', label(value)));
      board.appendChild(card);
    });
    root.appendChild(board);
  };

  const appendLaunch = (payload) => {
    const readiness = payload.launchReadiness || {};
    const wrap = el('div', 'collector-guidance');
    const head = el('div');
    head.appendChild(el('p', 'eyebrow', 'Leitura de lançamento'));
    head.appendChild(el('h2', 'section-title', payload.productionReady ? 'Falta validar catálogo, marca e operação comercial.' : 'Ainda há pendências técnicas antes da divulgação pública.'));
    wrap.appendChild(head);
    const grid = el('div', 'launch-matrix');
    [
      ['Técnico', readiness.technical, 'Supabase, chaves e token administrativo.'],
      ['Contato', readiness.contact, 'WhatsApp ou e-mail real para atendimento.'],
      ['Domínio', readiness.domain, 'URL oficial configurada no ambiente.'],
      ['API', payload.ok, 'Roteador e health check respondendo.']
    ].forEach(([name, ok, text]) => {
      const card = el('article', ok ? 'is-ready' : 'is-critical');
      card.appendChild(el('strong', '', ok ? 'OK' : '!'));
      card.appendChild(el('span', '', `${name} — ${text}`));
      grid.appendChild(card);
    });
    wrap.appendChild(grid);
    root.appendChild(wrap);
  };

  const appendRoutes = (routes) => {
    const wrap = el('div', 'collector-guidance');
    const head = el('div');
    head.appendChild(el('p', 'eyebrow', 'Rotas principais'));
    head.appendChild(el('h2', 'section-title', 'A API pública mantém estes caminhos.'));
    wrap.appendChild(head);
    const list = el('ol', 'process-steps');
    (routes || []).slice(0, 16).forEach((route) => list.appendChild(el('li', '', route)));
    wrap.appendChild(list);
    root.appendChild(wrap);
  };

  const render = (payload) => {
    const checks = payload.checks || {};
    const rows = [
      ['API', checks.api],
      ['Roteador principal', checks.mainRouter],
      ['SUPABASE_URL', checks.supabaseUrl],
      ['SUPABASE_ANON_KEY', checks.supabaseAnonKey],
      ['SUPABASE_SERVICE_ROLE_KEY', checks.supabaseServiceRoleKey],
      ['ARANDU_ADMIN_TOKEN', checks.adminToken],
      ['ARANDU_SITE_URL', checks.siteUrl],
      ['WhatsApp', checks.whatsappNumber],
      ['E-mail de contato', checks.contactEmail],
      ['Canal de atendimento', checks.contactChannel]
    ];

    clear();
    appendIntro(payload);
    appendCards(rows);
    appendLaunch(payload);
    appendRoutes(payload.routes || []);
  };

  const renderError = (error) => {
    clear();
    const box = el('div', 'certificate-preview');
    box.appendChild(el('p', 'eyebrow', 'Status da API'));
    box.appendChild(el('h2', '', 'Não foi possível consultar /api/health'));
    box.appendChild(el('p', '', error.message || 'Erro inesperado.'));
    root.appendChild(box);
  };

  fetch('/api/health')
    .then((response) => response.json())
    .then(render)
    .catch(renderError);
})();

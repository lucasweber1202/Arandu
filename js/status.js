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
    box.appendChild(el('h2', '', payload.verifiedReady ? 'Lançamento conectado e verificado' : payload.productionReady ? 'Configuração concluída, validar banco e catálogo' : 'Pré-produção'));
    const commit = payload.commit ? ` · Commit: ${String(payload.commit).slice(0, 7)}` : '';
    box.appendChild(el('p', '', `Ambiente: ${payload.environment || 'local'} · Modo: ${payload.mode || 'indefinido'}${commit}`));

    if (Array.isArray(payload.missing) && payload.missing.length) {
      const missing = el('div', 'readiness-list');
      payload.missing.forEach((item) => missing.appendChild(el('p', '', `Pendente: ${item}`)));
      box.appendChild(missing);
    }

    if (payload.launchReadiness?.nextCriticalActions?.length) {
      const list = el('div', 'readiness-list');
      payload.launchReadiness.nextCriticalActions.forEach((action) => list.appendChild(el('p', '', action)));
      box.appendChild(list);
    }
    root.appendChild(box);
  };

  const appendCards = (rows) => {
    const board = el('div', 'operational-board');
    rows.forEach(([name, value, detail]) => {
      const card = el('article', `mini-kpi ${className(value)}`);
      card.appendChild(el('strong', '', value ? 'OK' : '!'));
      card.appendChild(el('h3', '', name));
      card.appendChild(el('p', '', detail || label(value)));
      board.appendChild(card);
    });
    root.appendChild(board);
  };

  const appendLaunch = (payload) => {
    const readiness = payload.launchReadiness || {};
    const wrap = el('div', 'collector-guidance');
    const head = el('div');
    head.appendChild(el('p', 'eyebrow', 'Leitura de lançamento'));
    head.appendChild(el('h2', 'section-title', payload.verifiedReady ? 'Os gates técnicos, editoriais e comerciais foram confirmados.' : payload.productionReady ? 'Configuração aprovada. Falta confirmar banco e catálogo real.' : 'Ainda há gates pendentes antes da divulgação pública.'));
    wrap.appendChild(head);
    const grid = el('div', 'launch-matrix');
    [
      ['Técnico', readiness.technical, 'Supabase, chaves e token administrativo.'],
      ['Banco', readiness.database, 'Tabelas e views respondendo via probe.'],
      ['Contato', readiness.contact, 'WhatsApp ou e-mail real para atendimento.'],
      ['Domínio', readiness.domain, 'URL oficial configurada no ambiente.'],
      ['Catálogo', readiness.catalog, 'Dados reais, autorizações, volume mínimo e escrita verificada.'],
      ['Marca', readiness.brand, 'Identidade final aprovada.'],
      ['Comercial', readiness.commercial, 'Política, prazos e responsabilidades aprovados.'],
      ['LGPD', readiness.privacy, 'Contato responsável e fluxos de direitos configurados.'],
      ['Antiabuso', readiness.abuseProtection, 'Rate limit compartilhado entre instâncias.'],
      ['Monitoramento', readiness.monitoring, 'Erros e indisponibilidade geram alertas externos.'],
      ['Backup', readiness.backup, 'Restauração testada nos últimos 30 dias.'],
      ['Piloto', readiness.pilot, 'Ciclo fechado concluído e bloqueadores resolvidos.'],
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

  const appendProbes = (payload) => {
    const probe = payload.probes?.supabase;
    const wrap = el('div', 'collector-guidance');
    const head = el('div');
    head.appendChild(el('p', 'eyebrow', 'Supabase real'));
    head.appendChild(el('h2', 'section-title', probe?.ok ? 'Banco respondeu às consultas principais.' : 'Banco ainda precisa de conferência.'));
    wrap.appendChild(head);

    if (probe?.skipped) {
      wrap.appendChild(el('p', '', probe.reason || 'Probe não executado.'));
      root.appendChild(wrap);
      return;
    }

    if (!probe?.configured) {
      wrap.appendChild(el('p', '', probe?.reason || 'Supabase não configurado.'));
      root.appendChild(wrap);
      return;
    }

    const grid = el('div', 'operational-board');
    (probe.resources || []).forEach((item) => {
      const card = el('article', `mini-kpi ${className(item.ok)}`);
      card.appendChild(el('strong', '', item.ok ? 'OK' : '!'));
      card.appendChild(el('h3', '', item.label));
      const detail = item.ok ? `HTTP ${item.status} · ${item.ms}ms` : `HTTP ${item.status} · ${item.error || 'Falha'}`;
      card.appendChild(el('p', '', detail));
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
    (routes || []).slice(0, 18).forEach((route) => list.appendChild(el('li', '', route)));
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
      ['Canal de atendimento', checks.contactChannel],
      ['Marca aprovada', checks.brandReady],
      ['Política comercial aprovada', checks.commercialReady],
      ['Rate limit distribuído', checks.distributedRateLimit],
      ['Contato LGPD', checks.privacyContact],
      ['Monitoramento de erros', checks.errorMonitoring],
      ['Backup restaurado recentemente', checks.backupVerified],
      ['Piloto concluído', checks.pilotApproved],
      ...(checks.pilotEnabled ? [
        ['Piloto habilitado', true, 'Cohort fechado ativo.'],
        ['Código do piloto', checks.pilotAccessCode],
        ['Segredo do piloto', checks.pilotSecret]
      ] : [])
    ];

    clear();
    appendIntro(payload);
    appendCards(rows);
    appendLaunch(payload);
    appendProbes(payload);
    appendRoutes(payload.routes || []);
  };

  const renderError = (error) => {
    clear();
    const box = el('div', 'certificate-preview');
    box.appendChild(el('p', 'eyebrow', 'Status da API'));
    box.appendChild(el('h2', '', 'Não foi possível consultar /api/health?probe=1'));
    box.appendChild(el('p', '', error.message || 'Erro inesperado.'));
    root.appendChild(box);
  };

  fetch('/api/health?probe=1')
    .then((response) => response.json())
    .then(render)
    .catch(renderError);
})();

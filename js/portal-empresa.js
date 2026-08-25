(() => {
  const root = document.querySelector('[data-company-portal]');
  if (!root) return;

  const statusZone = root.querySelector('[data-portal-status]');
  const contentZone = root.querySelector('[data-portal-content]');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
  }

  function formatDate(value) {
    if (!value) return '—';
    try { return new Date(value).toLocaleDateString('pt-BR'); } catch { return '—'; }
  }

  // Os mesmos estados da máquina operacional de `company_briefs`.
  const briefStatus = {
    received: 'Recebido',
    qualified: 'Qualificado',
    proposal: 'Em proposta',
    negotiation: 'Em negociação',
    won: 'Fechado',
    lost: 'Encerrado',
    archived: 'Arquivado'
  };

  function message(title, detail, actionHtml = '') {
    // O h1 servido no HTML vive nesta zona: trocá-lo por h2 deixaria a página
    // sem título de primeiro nível.
    statusZone.innerHTML = `<div class="portal-card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>${actionHtml}</div>`;
    contentZone.innerHTML = '';
  }

  function render(data) {
    const briefs = Array.isArray(data.briefs) ? data.briefs : [];

    statusZone.innerHTML = `<div class="portal-card">
      <p class="eyebrow">Portal de empresas e arquitetos</p>
      <h1>Seus briefings</h1>
      <p>Briefings enviados: <strong>${briefs.length}</strong></p>
    </div>`;

    const rows = briefs.length
      ? briefs.map((brief) => `<tr>
          <td>${escapeHtml(brief.project_type || 'Projeto sem tipo informado')}</td>
          <td>${escapeHtml(briefStatus[brief.status] || brief.status || '—')}</td>
          <td>${escapeHtml(brief.environment || '—')}</td>
          <td>${escapeHtml(brief.deadline || '—')}</td>
          <td>${escapeHtml(formatDate(brief.created_at))}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">Nenhum briefing registrado nesta conta ainda.</td></tr>';

    contentZone.innerHTML = `<section class="portal-card">
        <h2>Situação de cada projeto</h2>
        <div class="portal-table-wrap">
          <table class="portal-table">
            <thead><tr><th>Projeto</th><th>Situação</th><th>Ambiente</th><th>Prazo</th><th>Enviado em</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <p class="portal-note">Valores, comissões e notas internas da curadoria não aparecem aqui — o portal mostra só o que é seu. Dúvida sobre um projeto? <a href="contato.html">Fale com a curadoria</a>.</p>
      </section>`;
  }

  async function load() {
    message('Carregando', 'Buscando seus briefings na curadoria.');
    let response;
    try {
      response = await fetch('/api/portal/company', { headers: { Accept: 'application/json' } });
    } catch {
      message(
        'Sem conexão',
        'Não foi possível falar com o servidor agora. Tente novamente em instantes.',
        '<div class="page-actions"><a class="cta secondary" href="contato.html">Falar com a curadoria</a></div>'
      );
      return;
    }
    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      message(
        'Entre na sua conta',
        'O portal de empresas exige login. Use o mesmo e-mail com que você enviou o briefing.',
        '<div class="page-actions"><a class="cta" href="login.html">Entrar</a><a class="cta secondary" href="cadastro.html">Criar conta</a></div>'
      );
      return;
    }
    if (response.status === 403) {
      message(
        'Nenhum briefing ligado a esta conta',
        'O portal abre a partir do primeiro briefing enviado com a conta aberta. Se você já enviou um sem estar logado, ele chegou à curadoria do mesmo jeito — o retorno vem pelo contato informado.',
        '<div class="page-actions"><a class="cta" href="empresas-e-arquitetos.html#briefing">Enviar um briefing</a><a class="cta secondary" href="contato.html">Falar com a curadoria</a></div>'
      );
      return;
    }
    if (!response.ok || data.ok === false) {
      message(
        'Não foi possível carregar',
        data.error || 'Tente novamente em instantes.',
        '<div class="page-actions"><a class="cta secondary" href="contato.html">Falar com a curadoria</a></div>'
      );
      return;
    }
    render(data);
  }

  load();
})();

(() => {
  const root = document.querySelector('[data-artist-portal]');
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

  const artworkStatus = {
    available: 'Disponível',
    in_conversation: 'Em conversa',
    reserved: 'Reservada',
    sold: 'Vendida',
    not_published: 'Fora da vitrine',
    archived: 'Arquivada'
  };

  const artistStatus = {
    prospected: 'Prospectado',
    in_review: 'Em análise',
    approved: 'Aprovado',
    published: 'Publicado',
    paused: 'Pausado',
    archived: 'Arquivado'
  };

  function message(title, detail, actionHtml = '') {
    // O h1 servido no HTML vive dentro desta zona: trocá-lo por h2 deixava a
    // página do portal sem título de primeiro nível para leitores de tela e
    // para indexação.
    statusZone.innerHTML = `<div class="portal-card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>${actionHtml}</div>`;
    contentZone.innerHTML = '';
  }

  function render(data) {
    const artist = data.artist || {};
    const artworks = Array.isArray(data.artworks) ? data.artworks : [];
    const trail = Array.isArray(data.statusTrail) ? data.statusTrail : [];

    statusZone.innerHTML = `<div class="portal-card">
      <p class="eyebrow">Portal do artista</p>
      <h1>${escapeHtml(artist.name || 'Seu perfil')}</h1>
      <p>Situação na curadoria: <strong>${escapeHtml(artistStatus[artist.status] || artist.status || '—')}</strong></p>
      <p>Obras registradas: <strong>${artworks.length}</strong> · Disponíveis: <strong>${data.metrics?.published ?? 0}</strong></p>
    </div>`;

    const artworkRows = artworks.length
      ? artworks.map((artwork) => `<tr>
          <td>${escapeHtml(artwork.title || artwork.id)}</td>
          <td>${escapeHtml(artworkStatus[artwork.status] || artwork.status || '—')}</td>
          <td>${escapeHtml(artwork.technique || '—')}</td>
          <td>${escapeHtml(artwork.dimensions || '—')}</td>
          <td>${escapeHtml(formatDate(artwork.updated_at))}</td>
        </tr>`).join('')
      : '<tr><td colspan="5">Nenhuma obra registrada ainda.</td></tr>';

    const trailRows = trail.length
      ? trail.map((item) => `<li>${escapeHtml(formatDate(item.created_at))} — ${escapeHtml(artistStatus[item.from_status] || item.from_status || 'sem status')} → ${escapeHtml(artistStatus[item.to_status] || item.to_status)}</li>`).join('')
      : '<li>Nenhuma transição registrada ainda.</li>';

    contentZone.innerHTML = `<section class="portal-card">
        <h2>Suas obras</h2>
        <div class="portal-table-wrap">
          <table class="portal-table">
            <thead><tr><th>Obra</th><th>Situação</th><th>Técnica</th><th>Dimensões</th><th>Atualizada</th></tr></thead>
            <tbody>${artworkRows}</tbody>
          </table>
        </div>
        <p class="portal-note">Preços e publicação são definidos junto com a curadoria. Para propor revisão, use o formulário abaixo.</p>
      </section>
      <section class="portal-card">
        <h2>Histórico do seu perfil</h2>
        <ul class="portal-trail">${trailRows}</ul>
        <p class="portal-note">Cada mudança de situação registrada pela curadoria aparece aqui. Dúvida sobre uma transição? <a href="contato.html">Fale com a curadoria</a>.</p>
      </section>`;
  }

  async function load() {
    message('Carregando', 'Buscando seus dados na curadoria.');
    let response;
    try {
      response = await fetch('/api/portal/artist', { headers: { Accept: 'application/json' } });
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
        'O portal do artista exige login. Use o mesmo e-mail que você informou na submissão do portfólio.',
        '<div class="page-actions"><a class="cta" href="login.html">Entrar</a><a class="cta secondary" href="cadastro.html">Criar conta</a></div>'
      );
      return;
    }
    if (response.status === 403) {
      message(
        'Conta ainda não vinculada',
        'Sua conta existe, mas ainda não está ligada a um perfil de artista aprovado. O vínculo é feito pela curadoria depois da análise do portfólio — não há prazo automático, e o retorno vem pelo contato que você informou.',
        '<div class="page-actions"><a class="cta" href="para-artistas.html#submissao">Enviar portfólio</a><a class="cta secondary" href="contato.html">Falar com a curadoria</a></div>'
      );
      return;
    }
    if (!response.ok || data.ok === false) {
      // O texto de `data.error` fala com a operação, não com o artista: cita
      // migration, configuração de banco e nomes de serviço. Quem espera ver as
      // próprias obras precisa de uma frase que diga o que aconteceu e o que
      // fazer agora.
      message(
        'Não foi possível carregar seu portal',
        'A falha é nossa, não do seu cadastro: seus dados continuam registrados. Recarregue a página em instantes; se continuar assim, fale com a curadoria.',
        '<div class="page-actions"><a class="cta secondary" href="contato.html">Falar com a curadoria</a></div>'
      );
      return;
    }
    render(data);
  }

  load();
})();

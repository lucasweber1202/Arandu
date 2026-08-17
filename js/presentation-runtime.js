(function () {
  const enabled = document.querySelector('meta[name="arandu-presentation-mode"]')?.content === 'true';
  const storageKey = 'arandu.presentation.reservations.v1';
  const safeRead = () => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) || '[]');
      return Array.isArray(value) ? value.slice(0, 20) : [];
    } catch { return []; }
  };
  const recordReservation = ({ artworkId, title, artist }) => {
    if (!enabled) return null;
    const record = {
      id: `demo-${crypto.randomUUID()}`,
      artworkId: String(artworkId || '').slice(0, 160),
      title: String(title || 'Obra demonstrativa').slice(0, 160),
      artist: String(artist || 'Artista Arandu').slice(0, 160),
      status: 'simulated',
      createdAt: new Date().toISOString()
    };
    sessionStorage.setItem(storageKey, JSON.stringify([record, ...safeRead()].slice(0, 20)));
    return record;
  };

  window.AranduPresentation = Object.freeze({
    enabled,
    datasetKind: enabled ? 'demonstration' : null,
    reservations: safeRead,
    recordReservation
  });

  if (!enabled) return;
  document.documentElement.dataset.presentationMode = 'true';
  const banner = document.createElement('aside');
  banner.className = 'presentation-banner';
  banner.setAttribute('role', 'status');
  banner.innerHTML = '<strong>Ambiente de apresentação</strong><span>Acervo e operações demonstrativos · nenhum pedido, pagamento ou certificado real é criado.</span>';
  document.body.prepend(banner);
})();

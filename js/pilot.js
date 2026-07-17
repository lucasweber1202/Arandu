/* Gate de coorte e telemetria minimizada para o piloto fechado. */
(function () {
  const SESSION_KEY = 'arandu.pilot.session.v1';
  let config = null;
  let authenticated = false;

  function sessionId() {
    let value = localStorage.getItem(SESSION_KEY);
    if (!/^[0-9a-f-]{36}$/i.test(value || '')) {
      value = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, value);
    }
    return value;
  }

  async function json(url, options = {}) {
    const response = await fetch(url, { credentials: 'include', cache: 'no-store', ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || 'Não foi possível continuar.');
    return payload;
  }

  async function track(eventType, payload = {}) {
    if (!config?.pilot?.enabled || !authenticated || navigator.doNotTrack === '1') return;
    const body = { sessionId: sessionId(), eventType, path: location.pathname, payload };
    try {
      await fetch('/api/events', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true });
    } catch {}
  }

  function gate() {
    if (document.querySelector('[data-pilot-gate]')) return;
    const overlay = document.createElement('div');
    overlay.className = 'pilot-gate';
    overlay.dataset.pilotGate = 'true';
    overlay.innerHTML = '<form class="pilot-gate-card" data-pilot-access><p class="eyebrow">Piloto fechado</p><h1>Entre com o código do convite.</h1><p>Esta versão está em validação com um grupo pequeno. O código não libera áreas administrativas.</p><input name="code" type="password" minlength="10" autocomplete="one-time-code" placeholder="Código de acesso" required><input name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button type="submit">Entrar no piloto</button><p data-pilot-status></p></form>';
    document.body.appendChild(overlay);
    overlay.querySelector('form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const status = form.querySelector('[data-pilot-status]');
      status.textContent = 'Validando convite...';
      try {
        await json('/api/pilot/access', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(form))) });
        authenticated = true;
        overlay.remove();
        document.documentElement.classList.add('pilot-authenticated');
        await track('page_view');
      } catch (error) { status.textContent = error.message; }
    });
  }

  async function boot() {
    try {
      config = await json('/api/public-config');
      if (!config?.pilot?.enabled) return;
      document.documentElement.classList.add('pilot-enabled');
      const session = await json('/api/pilot/session');
      authenticated = session.authenticated === true;
      if (!authenticated) gate();
      else { document.documentElement.classList.add('pilot-authenticated'); await track('page_view'); }
    } catch { if (window.ARANDU_PILOT_ENABLED === true) gate(); }
  }

  document.addEventListener('click', (event) => {
    const save = event.target.closest('[data-save-artwork]');
    if (save) track('selection_add', { artworkId: save.dataset.artworkId || save.dataset.saveArtwork || '' });
    const reserve = event.target.closest('[data-reserve-artwork]');
    if (reserve) track('reservation_start', { artworkId: reserve.dataset.reserveArtwork || '' });
  });
  document.addEventListener('submit', (event) => {
    if (event.target.matches('[data-pilot-access],[data-pilot-feedback]')) return;
    track('form_submit', { formType: event.target.dataset.formType || event.target.dataset.apiForm || 'public' });
  });
  window.ARANDU_PILOT = Object.freeze({ track, sessionId });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

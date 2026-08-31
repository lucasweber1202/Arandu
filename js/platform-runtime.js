/* Acessibilidade, desempenho, consentimento e métricas mínimas da plataforma. */
(function () {
  const CONSENT_KEY = 'arandu.privacy.consent.v1';
  const ANONYMOUS_KEY = 'arandu.analytics.anonymous.v1';
  const ATTRIBUTION_KEY = 'arandu.attribution.v1';
  const UTM_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  let consentVersion = null;
  let consentConfigured = false;

  function safeTag(value) {
    // Rótulo de campanha, não texto livre: sem isso um utm_source manipulado
    // entra inteiro no lead e no evento de conversão.
    return String(value || '').trim().slice(0, 80).replace(/[^\w .\-|/]+/g, '');
  }

  // Atribuição de primeiro toque, no escopo da aba. Quem chega pelo TikTok em
  // index.html e só envia o portfólio duas páginas depois perdia a origem,
  // porque a leitura acontecia no momento do envio, na URL daquela página.
  // Guarda apenas rótulos de campanha e o host do referrer — nunca a URL
  // completa, que costuma carregar identificadores de perfil.
  function captureAttribution() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || 'null');
      if (stored && typeof stored === 'object') return stored;
    } catch {}
    const params = new URLSearchParams(location.search);
    const value = { landing_page: String(location.pathname).slice(0, 240) };
    UTM_FIELDS.forEach((field) => {
      const tag = safeTag(params.get(field));
      if (tag) value[field] = tag;
    });
    let referrerHost = '';
    try {
      const referrer = new URL(document.referrer);
      if (referrer.hostname !== location.hostname) referrerHost = safeTag(referrer.hostname);
    } catch {}
    if (referrerHost) value.referrer_host = referrerHost;
    try { sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value)); } catch {}
    return value;
  }

  function attribution() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(ATTRIBUTION_KEY) || 'null');
      if (stored && typeof stored === 'object') return stored;
    } catch {}
    return captureAttribution();
  }

  function validConsentVersion(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(String(value || ''));
  }


  /**
   * Uma requisição de `/api/public-config` por carga de página.
   *
   * Três scripts pediam a mesma configuração na mesma página: `pilot.js`,
   * `platform-runtime.js` e o caminho de contato. Em obra.html isso ajudava a
   * estourar o teto de requisições da suíte de performance, e em toda página
   * era o mesmo dado buscado de novo. A promessa fica no `window` para que
   * qualquer ordem de carregamento reaproveite a primeira chamada.
   */
  function configuracaoPublicaCompartilhada(fetchImpl) {
    var buscar = fetchImpl || window.fetch;
    if (fetchImpl && fetchImpl !== window.fetch) {
      // Chamada com fetch próprio (teste) não entra no cache compartilhado.
      return buscar('/api/public-config', { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (resposta) { return resposta.json().catch(function () { return {}; }).then(function (dados) { return { ok: resposta.ok, dados: dados }; }); });
    }
    if (!window.__aranduConfigPublica) {
      window.__aranduConfigPublica = buscar('/api/public-config', { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (resposta) { return resposta.json().catch(function () { return {}; }).then(function (dados) { return { ok: resposta.ok, dados: dados }; }); })
        .catch(function () { return { ok: false, dados: {} }; });
    }
    return window.__aranduConfigPublica;
  }

  async function loadPublicConfig(fetchImpl = fetch) {
    try {
      const { ok, dados: payload } = await configuracaoPublicaCompartilhada(fetchImpl);
      const candidate = payload?.consent?.version;
      consentConfigured = ok && payload?.consent?.configured === true && validConsentVersion(candidate);
      consentVersion = consentConfigured ? candidate : null;
    } catch {
      consentConfigured = false;
      consentVersion = null;
    }
    return { configured: consentConfigured, version: consentVersion };
  }

  function readConsent() {
    if (!consentConfigured || !consentVersion) return null;
    try {
      const value = JSON.parse(localStorage.getItem(CONSENT_KEY) || 'null');
      return value?.version === consentVersion ? value : null;
    } catch {
      return null;
    }
  }

  function saveConsent(analytics) {
    const metricsAllowed = analytics === true && consentConfigured && Boolean(consentVersion);
    const value = {
      version: consentVersion || 'essential-only',
      essential: true,
      analytics: metricsAllowed,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(CONSENT_KEY, JSON.stringify(value));
    document.querySelector('[data-privacy-banner]')?.remove();
    document.body.classList.remove('arandu-consent-pending');
    window.dispatchEvent(new CustomEvent('arandu:consent', { detail: value }));
    return value;
  }

  function anonymousId() {
    let value = localStorage.getItem(ANONYMOUS_KEY);
    if (!/^[0-9a-f-]{36}$/i.test(value || '')) {
      value = crypto.randomUUID();
      localStorage.setItem(ANONYMOUS_KEY, value);
    }
    return value;
  }

  async function track(eventType, payload = {}) {
    const consent = readConsent();
    if (!consentConfigured || !consent?.analytics || navigator.doNotTrack === '1') return false;
    try {
      const response = await fetch('/api/conversion-events', {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anonymousId: anonymousId(),
          eventType,
          path: location.pathname,
          payload: { ...attribution(), ...payload },
          consentVersion
        })
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  function consentBanner() {
    if (readConsent() || document.querySelector('[data-privacy-banner]')) return;
    const banner = document.createElement('section');
    banner.className = 'privacy-banner';
    banner.dataset.privacyBanner = 'true';
    banner.setAttribute('aria-label', 'Preferências de privacidade');
    const analyticsAction = consentConfigured
      ? '<button type="button" class="cta" data-consent-analytics>Aceitar métricas</button>'
      : '';
    const analyticsText = consentConfigured
      ? 'Métricas anônimas são opcionais e não recebem texto livre.'
      : 'Métricas opcionais estão indisponíveis até a configuração da versão de consentimento.';
    banner.innerHTML = `<div><strong>Privacidade sob seu controle</strong><p>Usamos armazenamento essencial para conta e seleção. ${analyticsText}</p></div><div class="privacy-banner-actions"><button type="button" class="cta secondary" data-consent-essential>Somente essencial</button>${analyticsAction}<a href="politica-de-privacidade.html">Ler política</a></div>`;
    document.body.appendChild(banner);
    // O botão flutuante do assistente é `position: fixed` no mesmo canto e com
    // z-index maior: sem esta marcação ele cobre "Somente essencial" no celular
    // e a escolha de privacidade fica intocável.
    document.body.classList.add('arandu-consent-pending');
  }

  function accessibility() {
    document.querySelectorAll('a[target="_blank"]').forEach((link) => link.setAttribute('rel', 'noopener noreferrer'));
    document.querySelectorAll('img').forEach((image, index) => {
      if (!image.hasAttribute('decoding')) image.decoding = 'async';
      if (!image.hasAttribute('loading') && index > 0 && !image.closest('.hero,.rect-hero')) image.loading = 'lazy';
      if (!image.hasAttribute('alt')) image.alt = '';
    });
  }

  function automaticJourneyEvents() {
    const path = location.pathname;
    if (/comprar-arte|colecoes/.test(path)) track('catalog_view');
    if (/obra\.html/.test(path)) track('artwork_view', { artworkId: new URLSearchParams(location.search).get('id') || '' });
    document.addEventListener('click', (event) => {
      const save = event.target.closest('[data-save-artwork]');
      if (save) track('selection_add', { artworkId: save.dataset.artworkId || save.dataset.saveArtwork || '' });
      const contactLink = event.target.closest('a[href*="contato"],a[href^="mailto:"],a[href^="https://wa.me"]');
      if (contactLink) {
        const href = contactLink.getAttribute('href') || '';
        const target = href.startsWith('https://wa.me') ? 'whatsapp' : href.startsWith('mailto:') ? 'email' : 'contact';
        track('contact_start', { target });
      }
      const reserve = event.target.closest('[data-reserve-artwork]');
      if (reserve) track('reservation_start', { artworkId: reserve.dataset.reserveArtwork || '' });
      const result = event.target.closest('[data-static-search-results] a');
      if (result) track('search', { target: result.getAttribute('href') || '' });
    });
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-consent-essential]')) saveConsent(false);
    if (event.target.closest('[data-consent-analytics]')) saveConsent(true);
  });

  async function boot() {
    captureAttribution();
    await loadPublicConfig();
    accessibility();
    consentBanner();
    automaticJourneyEvents();
  }

  window.ARANDU_PRIVACY = Object.freeze({
    readConsent,
    saveConsent,
    track,
    attribution,
    loadPublicConfig,
    getConsentVersion: () => consentVersion,
    consentConfigured: () => consentConfigured
  });
  // Antes do boot: o primeiro toque precisa ser gravado ainda na página de
  // entrada, mesmo que a pessoa saia antes de qualquer interação.
  captureAttribution();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* Acessibilidade, desempenho, consentimento e métricas mínimas da plataforma. */
(function () {
  const CONSENT_KEY = 'arandu.privacy.consent.v1';
  const ANONYMOUS_KEY = 'arandu.analytics.anonymous.v1';
  let consentVersion = null;
  let consentConfigured = false;

  function validConsentVersion(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(String(value || ''));
  }

  async function loadPublicConfig(fetchImpl = fetch) {
    try {
      const response = await fetchImpl('/api/public-config', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const payload = await response.json().catch(() => ({}));
      const candidate = payload?.consent?.version;
      consentConfigured = response.ok && payload?.consent?.configured === true && validConsentVersion(candidate);
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
          payload,
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

  /**
   * Rótulos dos campos de formulário.
   *
   * O site tem 154 páginas estáticas que compartilham este runtime e cujos
   * formulários nasceram só com `placeholder`. Placeholder não é rótulo: some
   * ao digitar, não é exposto de forma confiável como nome acessível e deixa a
   * pessoa sem referência ao revisar o que preencheu. Como o vocabulário de
   * campos é fechado (o mesmo `name` se repete página a página), o rótulo vem
   * de um dicionário canônico e o placeholder permanece como exemplo.
   */
  const FIELD_LABELS = {
    ambiente: 'Ambiente',
    cidade: 'Cidade',
    code: 'Código de verificação',
    dimensao: 'Dimensão da parede',
    email: 'E-mail',
    empresa: 'Empresa',
    escritorio: 'Escritório',
    espaco: 'Tipo de espaço',
    estado: 'Estado',
    faixa_preco: 'Faixa de preço',
    interesse: 'Interesse',
    medidas: 'Medidas da parede',
    mensagem: 'Mensagem',
    message: 'Mensagem',
    motivo: 'Motivo do contato',
    nome: 'Nome',
    obra: 'Obra ou série',
    observacoes: 'Observações',
    orcamento: 'Orçamento',
    password: 'Senha',
    perfil: 'Perfil',
    prazo: 'Prazo',
    preco: 'Preço sugerido',
    sensacao: 'Sensação desejada',
    tecnicas: 'Técnicas de interesse',
    tipo_espaco: 'Tipo de espaço',
    tipo_projeto: 'Tipo de projeto',
    whatsapp: 'WhatsApp'
  };

  function accessibleName(field) {
    if (field.id) {
      const associated = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
      if (associated?.textContent.trim()) return associated.textContent.trim();
    }
    if (field.closest('label')?.textContent.trim()) return field.closest('label').textContent.trim();
    return String(field.getAttribute('aria-label') || '').trim();
  }

  function labelText(field) {
    const byName = FIELD_LABELS[String(field.name || '').trim().toLowerCase()];
    if (byName) return byName;
    const placeholder = String(field.getAttribute('placeholder') || '').trim();
    // Placeholders longos são exemplos, não nomes: corta na primeira pausa.
    const head = placeholder.split(/[:.…]|,\s/)[0].trim();
    if (head && head.length <= 40) return head.charAt(0).toUpperCase() + head.slice(1);
    return '';
  }

  let labelSequence = 0;
  function labelFormFields(scope = document) {
    scope.querySelectorAll('input, select, textarea').forEach((field) => {
      const type = String(field.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;
      if (field.getAttribute('aria-hidden') === 'true') return;
      if (accessibleName(field)) return;

      const text = labelText(field);
      if (!text) return;
      if (!field.id) {
        labelSequence += 1;
        field.id = `arandu-field-${labelSequence}`;
      }
      const label = document.createElement('label');
      label.className = 'arandu-field-label';
      label.setAttribute('for', field.id);
      label.textContent = text;
      field.parentNode?.insertBefore(label, field);
      // Placeholder que apenas repete o rótulo vira ruído depois que o rótulo
      // existe; o que traz exemplo ou instrução permanece.
      const placeholder = String(field.getAttribute('placeholder') || '').trim();
      if (placeholder && placeholder.localeCompare(text, 'pt-BR', { sensitivity: 'base' }) === 0) {
        field.removeAttribute('placeholder');
      }
    });
  }

  function accessibility() {
    const main = document.querySelector('main');
    if (main && !main.id) main.id = 'conteudo-principal';
    if (main && !document.querySelector('.skip-link')) {
      const link = document.createElement('a');
      link.className = 'skip-link';
      link.href = `#${main.id}`;
      link.textContent = 'Pular para o conteúdo';
      document.body.prepend(link);
    }
    document.querySelectorAll('a[target="_blank"]').forEach((link) => link.setAttribute('rel', 'noopener noreferrer'));
    document.querySelectorAll('img').forEach((image, index) => {
      if (!image.hasAttribute('decoding')) image.decoding = 'async';
      if (!image.hasAttribute('loading') && index > 0 && !image.closest('.hero,.rect-hero')) image.loading = 'lazy';
      if (!image.hasAttribute('alt')) image.alt = '';
    });
    labelFormFields();
  }

  function automaticJourneyEvents() {
    const path = location.pathname;
    if (/comprar-arte|colecoes/.test(path)) track('catalog_view');
    if (/obra\.html/.test(path)) track('artwork_view', { artworkId: new URLSearchParams(location.search).get('id') || '' });
    document.addEventListener('click', (event) => {
      const save = event.target.closest('[data-save-artwork]');
      if (save) track('selection_add', { artworkId: save.dataset.artworkId || save.dataset.saveArtwork || '' });
      if (event.target.closest('a[href*="contato"],a[href^="mailto:"],a[href^="https://wa.me"]')) track('contact_start', { target: 'contact' });
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
    await loadPublicConfig();
    accessibility();
    consentBanner();
    automaticJourneyEvents();
  }

  window.ARANDU_PRIVACY = Object.freeze({
    readConsent,
    saveConsent,
    track,
    loadPublicConfig,
    getConsentVersion: () => consentVersion,
    consentConfigured: () => consentConfigured
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

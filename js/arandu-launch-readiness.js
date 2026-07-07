/* Arandu — ajustes finais de prontidão pública e clareza comercial */
(() => {
  const INTERNAL_PAGE_PATTERNS = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if (INTERNAL_PAGE_PATTERNS.test(page) || document.body.dataset.launchReadiness === 'true') return;
  document.body.dataset.launchReadiness = 'true';

  const publicPages = new Set(['index.html','comprar-arte.html','acervo.html','obras.html','obra.html','artistas.html','artista.html','empresas.html','confianca.html','para-artistas.html','minha-selecao.html']);
  const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

  function track(name, detail = {}) {
    try {
      const list = JSON.parse(localStorage.getItem('arandu-launch-events') || '[]').slice(-90);
      list.push({ name, detail, page, at: new Date().toISOString() });
      localStorage.setItem('arandu-launch-events', JSON.stringify(list));
    } catch (_) {}
  }

  function createTrustBand() {
    if (!publicPages.has(page) || document.querySelector('.launch-trust-band')) return;
    const footer = document.querySelector('.site-footer');
    if (!footer) return;
    const section = document.createElement('section');
    section.className = 'launch-trust-band clean-section';
    section.innerHTML = `
      <div class="container launch-trust-inner">
        <div>
          <p class="eyebrow">Compra acompanhada</p>
          <h2>Reserva com curadoria antes de pagamento.</h2>
          <p>A Arandu confirma disponibilidade, ficha técnica, documentação, prazo de envio e condição da obra antes de qualquer finalização comercial.</p>
        </div>
        <div class="launch-trust-steps" aria-label="Etapas de confiança Arandu">
          <article><strong>01</strong><span>Você salva ou solicita reserva.</span></article>
          <article><strong>02</strong><span>A curadoria valida obra, artista e documentação.</span></article>
          <article><strong>03</strong><span>Pagamento, envio e certificado seguem combinados.</span></article>
        </div>
      </div>`;
    footer.parentNode.insertBefore(section, footer);
  }

  function enhanceArtworkPage() {
    if (page !== 'obra.html') return;
    const buybox = document.querySelector('.artwork-buybox,.premium-buybox,.artwork-shell');
    if (!buybox || buybox.querySelector('.launch-buy-checklist')) return;
    const block = document.createElement('aside');
    block.className = 'launch-buy-checklist';
    block.innerHTML = `
      <strong>Antes da compra, a curadoria confirma</strong>
      <ul>
        <li>disponibilidade real e prazo de reserva;</li>
        <li>estado da obra, ficha técnica e imagens;</li>
        <li>certificado, autoria e procedência;</li>
        <li>frete, embalagem, seguro e cidade de destino.</li>
      </ul>
      <a href="compra-reserva-reembolso.html">Ver política de reserva</a>`;
    buybox.appendChild(block);
  }

  function enhanceArtistsPage() {
    if (page !== 'para-artistas.html') return;
    const target = document.querySelector('.artist-submission-grid,.clean-section .container,.site-footer');
    if (!target || document.querySelector('.launch-artist-readiness')) return;
    const card = document.createElement('article');
    card.className = 'launch-artist-readiness';
    card.innerHTML = `
      <p class="eyebrow">Para acelerar análise</p>
      <h3>Envie portfólio como se fosse entrar em acervo real.</h3>
      <p>O primeiro contato precisa permitir entender linguagem, preço, disponibilidade, documentação e coerência da trajetória.</p>
      <div>
        <span>5 a 12 obras selecionadas</span>
        <span>ficha técnica completa</span>
        <span>faixa de preço</span>
        <span>imagens autorizadas</span>
      </div>`;
    target.appendChild(card);
  }

  function improveReserveButtons() {
    document.querySelectorAll('[data-reserve-artwork]').forEach((button) => {
      if (!button.dataset.launchReserveReady) {
        button.dataset.launchReserveReady = 'true';
        button.setAttribute('aria-label', 'Solicitar reserva com acompanhamento da curadoria');
        if (/reservar/i.test(button.textContent || '')) button.textContent = 'Reservar com curadoria';
      }
    });
  }

  function addContactContext() {
    document.querySelectorAll('a[href="contato.html"],a[href^="contato.html?"]').forEach((link) => {
      if (link.dataset.launchContext) return;
      link.dataset.launchContext = 'true';
      link.addEventListener('click', () => track('contact_cta_click', { text: link.textContent.trim() }));
    });
  }

  function init() {
    createTrustBand();
    enhanceArtworkPage();
    enhanceArtistsPage();
    improveReserveButtons();
    addContactContext();
    track('launch_readiness_loaded');
  }

  document.addEventListener('DOMContentLoaded', init);
  setTimeout(init, 900);
})();

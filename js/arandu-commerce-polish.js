(() => {
  const page = window.location.pathname.split('/').pop() || 'index.html';

  function injectCssOnce(id, href) {
    if (document.getElementById(id)) return;
    if (document.querySelector(`link[href*="${href.split('?')[0]}"]`)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function injectGalleryCommerceCss() {
    injectCssOnce('arandu-gallery-commerce-css', 'css/arandu-gallery-commerce.css?v=20260706-gallery-commerce-1');
    injectCssOnce('arandu-gallery-commerce-pro-css', 'css/arandu-gallery-commerce-pro.css?v=20260706-gallery-commerce-pro-1');
    injectCssOnce('arandu-gallery-commerce-intimate-css', 'css/arandu-gallery-commerce-intimate.css?v=20260706-gallery-intimate-1');
  }

  function addTrustNote(targetSelector, text) {
    const target = document.querySelector(targetSelector);
    if (!target) return;
    if (target.querySelector('.trust-note')) return;
    const note = document.createElement('p');
    note.className = 'trust-note';
    note.textContent = text;
    target.appendChild(note);
  }

  function improveCards() {
    document.querySelectorAll('.artwork-card, .showcase-card, .journey-card, .artist-work-card, .macro-card, .card, .mini-kpi').forEach((card) => {
      if (card.closest('.arandu-editorial-works')) return;
      card.setAttribute('data-commerce-polish', 'true');
      if (!card.querySelector('.status-pill')) {
        const status = card.dataset.artworkStatus || card.textContent.match(/(disponível|reservada|vendida|em análise)/i)?.[0];
        if (status) {
          const pill = document.createElement('span');
          pill.className = 'status-pill';
          pill.textContent = status.charAt(0).toUpperCase() + status.slice(1);
          card.appendChild(pill);
        }
      }
    });
  }

  function relabelReserveButtons() {
    document.querySelectorAll('[data-reserve-artwork], [data-reserve-artwork]').forEach((button) => {
      if (!button.dataset.reserveLabel) {
        button.textContent = 'Reservar com curadoria';
        button.dataset.reserveLabel = 'true';
      }
    });

    document.querySelectorAll('.tag[data-reserve-artwork]').forEach((button) => {
      button.textContent = 'Reservar com curadoria';
    });
  }

  function enhanceHomeJourney() {
    if (page !== 'index.html') return;
    const journeyRail = document.querySelector('.journey-rail');
    if (journeyRail && !journeyRail.querySelector('.journey-step-4')) {
      const steps = journeyRail.querySelectorAll('article');
      if (steps.length >= 4) {
        steps[0].innerHTML = '<strong>Escolher</strong><span>Encontre uma obra que converse com o ambiente e o seu gosto.</span>';
        steps[1].innerHTML = '<strong>Salvar ou reservar</strong><span>Guarde na seleção ou peça uma reserva com curadoria.</span>';
        steps[2].innerHTML = '<strong>Curadoria valida</strong><span>Confirmamos disponibilidade, condição e documentação antes de avançar.</span>';
        steps[3].innerHTML = '<strong>Envio e certificado</strong><span>Você recebe a obra com ficha técnica e certificado de autenticidade.</span>';
      }
    }
  }

  function insertAfter(selector, html, id) {
    if (document.getElementById(id)) return;
    const anchor = document.querySelector(selector);
    if (!anchor) return;
    anchor.insertAdjacentHTML('afterend', html);
  }

  function installQuickShop() {
    if (page !== 'index.html') return;
    insertAfter('.gallery-commerce-hero', `
      <section class="intimate-quick-shop" id="comprar-por-intencao">
        <div class="container">
          <p class="intimate-section-kicker">Comprar por intenção</p>
          <h2 class="intimate-section-title">A obra certa começa pelo espaço, pelo valor e pelo que você quer sentir.</h2>
          <p class="intimate-section-copy">Como em uma boa galeria, a navegação não precisa começar por filtro técnico. Ela pode começar por sala, silêncio, cor, primeira coleção, presente ou projeto de interiores.</p>
          <div class="intimate-link-grid">
            <a class="intimate-link-card" href="obras.html?busca=primeira-obra"><strong>Primeira obra</strong><span>Uma entrada segura para começar a colecionar.</span></a>
            <a class="intimate-link-card warm" href="obras.html?busca=ate-3000"><strong>Até R$ 3 mil</strong><span>Peças acessíveis com leitura curatorial.</span></a>
            <a class="intimate-link-card dark" href="obras.html?busca=sala"><strong>Para sala</strong><span>Presença para receber, conversar e permanecer.</span></a>
            <a class="intimate-link-card" href="obras.html?busca=coloridas"><strong>Muita cor</strong><span>Obras mais vivas, quentes e brasileiras.</span></a>
            <a class="intimate-link-card" href="obras.html?busca=minimalista"><strong>Silêncio visual</strong><span>Para quarto, clínica, escritório e pausa.</span></a>
            <a class="intimate-link-card warm" href="obras.html?busca=presente"><strong>Presente</strong><span>Escolhas com história, cuidado e procedência.</span></a>
          </div>
        </div>
      </section>`, 'comprar-por-intencao');
  }

  function installCuratorNote() {
    if (page !== 'index.html') return;
    insertAfter('.arandu-editorial-works', `
      <section class="intimate-curator-note" id="curadoria-intima">
        <div class="container">
          <div class="intimate-curator-card">
            <div class="intimate-curator-copy">
              <p class="intimate-section-kicker">Atendimento de galeria</p>
              <blockquote>Você não precisa decidir sozinho olhando uma vitrine fria.</blockquote>
              <p>A curadoria pode ajudar a pensar escala, parede, iluminação, orçamento, documentação e relação da obra com o ambiente. A compra fica mais íntima: menos impulso, mais conversa.</p>
              <div class="page-actions"><a class="cta" href="contato.html">Pedir uma seleção</a><a class="cta secondary" href="obras.html">Ver acervo</a></div>
            </div>
            <div class="intimate-curator-steps">
              <article class="intimate-curator-step"><strong>01</strong><span>Você diz ambiente, faixa de preço e sensação desejada.</span></article>
              <article class="intimate-curator-step"><strong>02</strong><span>A curadoria sugere obras e explica presença, técnica e contexto.</span></article>
              <article class="intimate-curator-step"><strong>03</strong><span>A disponibilidade, certificado, envio e condição são conferidos antes da compra.</span></article>
            </div>
          </div>
        </div>
      </section>`, 'curadoria-intima');
  }

  function installArtistShelf() {
    if (page !== 'index.html') return;
    insertAfter('.commerce-room-section', `
      <section class="intimate-artist-row" id="artistas-colecionaveis">
        <div class="container">
          <p class="intimate-section-kicker">Artistas e trajetórias</p>
          <h2 class="intimate-section-title">Comprar arte também é acompanhar uma trajetória.</h2>
          <p class="intimate-section-copy">A Arandu deve mostrar artistas como presença viva, não só como assinatura abaixo de um produto.</p>
          <div class="intimate-artist-shelf">
            <a class="intimate-artist-card" href="artista.html?id=marina-silveira"><small>Pintura</small><strong>Marina Silveira</strong><span>Matéria, território e gesto pictórico.</span></a>
            <a class="intimate-artist-card" href="artista.html?id=camila-reboucas"><small>Fotografia</small><strong>Camila Rebouças</strong><span>Memória, paisagem e silêncio visual.</span></a>
            <a class="intimate-artist-card" href="artista.html?id=arthur-davila"><small>Escultura</small><strong>Arthur D'Avila</strong><span>Volume, equilíbrio e presença urbana.</span></a>
            <a class="intimate-artist-card" href="artistas.html"><small>Curadoria</small><strong>Novas entradas</strong><span>Artistas convidados para a primeira fase Arandu.</span></a>
          </div>
        </div>
      </section>`, 'artistas-colecionaveis');
  }

  function installBuyEnhancements() {
    if (page !== 'comprar-arte.html') return;
    insertAfter('.commerce-buy-hero', `
      <section class="intimate-price-board" id="comprar-por-valor">
        <div class="container">
          <p class="intimate-section-kicker">Comprar por valor</p>
          <h2 class="intimate-section-title">Faixas claras para olhar sem constrangimento.</h2>
          <p class="intimate-section-copy">A compra fica mais confortável quando o visitante entende onde pode começar, onde pode investir mais e quando vale pedir uma seleção personalizada.</p>
          <div class="intimate-price-panel">
            <div class="intimate-price-story"><h3>Comece com uma obra que caiba no espaço e no momento.</h3><p>Preço visível, reserva assistida e validação documental antes da finalização.</p></div>
            <div class="intimate-price-list">
              <a class="intimate-price-option" href="obras.html?busca=ate-3000"><div><small>Entrada</small><strong>Até R$ 3 mil</strong></div><span>Para primeira obra, fotografia e escolhas mais acessíveis.</span></a>
              <a class="intimate-price-option" href="obras.html?busca=3000-6000"><div><small>Intermediário</small><strong>R$ 3 mil a R$ 6 mil</strong></div><span>Peças com mais presença para sala, escritório e coleção.</span></a>
              <a class="intimate-price-option" href="obras.html?busca=acima-6000"><div><small>Presença</small><strong>Acima de R$ 6 mil</strong></div><span>Obras de impacto, escultura e projetos de maior escala.</span></a>
              <a class="intimate-price-option" href="contato.html"><div><small>Curadoria</small><strong>Sob medida</strong></div><span>Seleção por ambiente, orçamento, parede e intenção.</span></a>
            </div>
          </div>
        </div>
      </section>`, 'comprar-por-valor');
  }

  function installCatalogIntro() {
    if (page !== 'obras.html') return;
    insertAfter('.gallery-commerce-hero', `
      <section class="intimate-catalog-intro" id="atalhos-do-acervo">
        <div class="container">
          <p class="intimate-section-kicker">Atalhos do acervo</p>
          <h2 class="intimate-section-title">Navegue como quem entra em uma galeria.</h2>
          <p class="intimate-section-copy">Use atalhos rápidos para olhar por inspiração, formato, ambiente e momento de compra.</p>
          <div class="intimate-catalog-strip">
            <a href="obras.html?busca=pintura">Pinturas</a>
            <a href="obras.html?busca=fotografia">Fotografias</a>
            <a href="obras.html?busca=escultura">Esculturas</a>
            <a href="obras.html?busca=coloridas">Obras com cor</a>
            <a href="obras.html?busca=preto-branco">Preto & branco</a>
            <a href="obras.html?busca=brasilidade">Brasilidade</a>
            <a href="obras.html?busca=minimalista">Minimalista</a>
            <a href="obras.html?busca=primeira-obra">Primeira obra</a>
          </div>
        </div>
      </section>`, 'atalhos-do-acervo');
  }

  function installArtworkService() {
    if (page !== 'obra.html') return;
    setTimeout(() => {
      const buybox = document.querySelector('.premium-buybox, .artwork-buybox');
      if (!buybox || buybox.querySelector('.intimate-artwork-service-card')) return;
      buybox.insertAdjacentHTML('beforeend', `
        <div class="intimate-artwork-service-card">
          <strong>Quer imaginar essa obra no seu espaço?</strong>
          <p>A curadoria pode ajudar com escala, parede, combinação com outras peças e próximos passos de reserva.</p>
          <div class="intimate-mini-actions"><a href="contato.html">Pedir leitura</a><a href="obras.html">Ver semelhantes</a></div>
        </div>`);
    }, 600);
  }

  function enhanceArtworkPage() {
    if (page !== 'obra.html') return;
    addTrustNote('.artwork-buybox, .premium-buybox, .artwork-shell', 'A reserva não confirma compra automática. A curadoria valida disponibilidade, envio e documentação antes da finalização.');
    installArtworkService();
  }

  function enhanceArtistPage() {
    if (page !== 'para-artistas.html') return;
    const container = document.querySelector('.artist-submission-grid');
    if (container && !container.querySelector('.submission-essentials')) {
      const block = document.createElement('article');
      block.className = 'card submission-essentials';
      block.innerHTML = '<h3>O que enviar</h3><ul><li>Obras selecionadas, imagens, dimensões e técnica.</li><li>Mini bio, cidade, links públicos e faixa de preço.</li><li>Disponibilidade real das obras para análise.</li></ul>';
      container.appendChild(block);
    }
  }

  function installIntimateModules() {
    installQuickShop();
    installCuratorNote();
    installArtistShelf();
    installBuyEnhancements();
    installCatalogIntro();
  }

  injectGalleryCommerceCss();
  document.addEventListener('DOMContentLoaded', () => {
    injectGalleryCommerceCss();
    improveCards();
    relabelReserveButtons();
    enhanceHomeJourney();
    installIntimateModules();
    enhanceArtworkPage();
    enhanceArtistPage();
  });
})();
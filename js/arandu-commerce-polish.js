(() => {
  const page = window.location.pathname.split('/').pop() || 'index.html';

  function injectGalleryCommerceCss() {
    if (document.getElementById('arandu-gallery-commerce-css')) return;
    if (document.querySelector('link[href*="css/arandu-gallery-commerce.css"]')) return;
    const link = document.createElement('link');
    link.id = 'arandu-gallery-commerce-css';
    link.rel = 'stylesheet';
    link.href = 'css/arandu-gallery-commerce.css?v=20260706-gallery-commerce-1';
    document.head.appendChild(link);
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

  function enhanceArtworkPage() {
    if (page !== 'obra.html') return;
    addTrustNote('.artwork-buybox, .premium-buybox, .artwork-shell', 'A reserva não confirma compra automática. A curadoria valida disponibilidade, envio e documentação antes da finalização.');
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

  injectGalleryCommerceCss();
  document.addEventListener('DOMContentLoaded', () => {
    injectGalleryCommerceCss();
    improveCards();
    relabelReserveButtons();
    enhanceHomeJourney();
    enhanceArtworkPage();
    enhanceArtistPage();
  });
})();
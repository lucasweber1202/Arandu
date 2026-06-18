/* Arandu — navegação mobile pública */
(function () {
  const INTERNAL_PAGE_PATTERNS = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const currentPage = () => window.location.pathname.split('/').pop() || 'index.html';
  if (INTERNAL_PAGE_PATTERNS.test(currentPage()) || document.querySelector('[data-arandu-mobile-dock]')) return;

  const dock = document.createElement('nav');
  dock.className = 'arandu-mobile-dock';
  dock.dataset.aranduMobileDock = 'true';
  dock.setAttribute('aria-label', 'Ações rápidas Arandu');
  dock.innerHTML = `
    <a href="index.html" data-dock-link="index.html"><small>⌂</small><span>Início</span></a>
    <a href="comprar-arte.html" data-dock-link="comprar-arte.html"><small>◆</small><span>Acervo</span></a>
    <a href="minha-selecao.html" data-dock-link="minha-selecao.html"><small>◒</small><span>Seleção</span></a>
    <button type="button" data-assistant-open><small>✦</small><span>Ajuda</span></button>
  `;
  document.body.appendChild(dock);

  const page = currentPage();
  dock.querySelectorAll('[data-dock-link]').forEach((link) => {
    const target = link.getAttribute('data-dock-link');
    if (target === page || (page === '' && target === 'index.html')) link.classList.add('is-active');
  });

  let lastScroll = window.scrollY;
  let ticking = false;
  function updateDockVisibility() {
    const current = window.scrollY;
    const goingDown = current > lastScroll && current > 120;
    dock.style.transform = goingDown ? 'translateY(86px)' : 'translateY(0)';
    lastScroll = current;
    ticking = false;
  }

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(updateDockVisibility);
      ticking = true;
    }
  }, { passive: true });
})();

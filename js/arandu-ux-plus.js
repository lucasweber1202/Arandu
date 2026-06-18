/* Arandu — camada de usabilidade e feedback */
(function () {
  const INTERNAL_PAGE_PATTERNS = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const currentPage = () => window.location.pathname.split('/').pop() || 'index.html';
  if (INTERNAL_PAGE_PATTERNS.test(currentPage()) || document.body.dataset.uxPlus === 'true') return;
  document.body.dataset.uxPlus = 'true';

  const page = currentPage();
  const pageMap = {
    'index.html': ['Início', 'Escolha um caminho para entrar no acervo com mais contexto.'],
    'comprar-arte.html': ['Comprar arte', 'Filtre, compare e salve obras antes de falar com a curadoria.'],
    'obras.html': ['Explorar obras', 'Veja o acervo disponível e abra a leitura curatorial de cada obra.'],
    'obra.html': ['Página da obra', 'Confira preço, técnica, certificado, leitura curatorial e etapas de compra.'],
    'acervo.html': ['Acervo', 'Navegue por obras, artistas e trajetórias em construção.'],
    'empresas.html': ['Empresas', 'Monte uma proposta curatorial para ambientes profissionais.'],
    'para-artistas.html': ['Para artistas', 'Entenda critérios de seleção, documentação e publicação.'],
    'confianca.html': ['Confiança', 'Veja critérios, autenticidade, compra segura e documentação.'],
    'narrativa.html': ['Narrativa', 'Leia histórias, bastidores e contexto da arte brasileira contemporânea.']
  };

  function ensureProgress() {
    if (document.getElementById('arandu-progress')) return;
    const progress = document.createElement('div');
    progress.id = 'arandu-progress';
    document.body.appendChild(progress);

    const update = () => {
      const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const value = Math.min(100, Math.max(0, (window.scrollY / scrollable) * 100));
      progress.style.width = value + '%';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  function ensureHelper() {
    if (document.querySelector('.arandu-page-helper')) return;
    const info = pageMap[page] || ['Arandu', 'Explore obras, artistas, confiança e curadoria em poucos passos.'];
    const helper = document.createElement('div');
    helper.className = 'arandu-page-helper';
    helper.innerHTML = `
      <div class="container">
        <div class="helper-left">
          <span class="helper-mark" aria-hidden="true"></span>
          <span class="helper-title">${info[0]}</span>
          <span class="helper-copy">${info[1]}</span>
        </div>
        <div class="helper-actions">
          <a class="primary" href="comprar-arte.html">Ver acervo</a>
          <button type="button" data-assistant-open>Me orientar</button>
        </div>
      </div>
    `;
    const header = document.querySelector('.site-header');
    if (header && header.nextSibling) header.parentNode.insertBefore(helper, header.nextSibling);
  }

  function setupReveal() {
    const targets = document.querySelectorAll('main section, .showcase-card, .macro-card, .artist-work-card, .trust-card, .mini-kpi, .journey-card');
    targets.forEach((el) => el.classList.add('reveal-ready'));
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    targets.forEach((el) => observer.observe(el));
  }

  function setupSectionNav() {
    if (document.querySelector('.arandu-section-nav')) return;
    const sections = Array.from(document.querySelectorAll('main section')).filter((section, index) => {
      if (!section.id) section.id = 'secao-arandu-' + (index + 1);
      return section.offsetHeight > 120;
    }).slice(0, 7);
    if (sections.length < 3) return;

    const nav = document.createElement('nav');
    nav.className = 'arandu-section-nav';
    nav.setAttribute('aria-label', 'Navegação por seções');
    nav.innerHTML = sections.map((section, index) => `<a href="#${section.id}" aria-label="Ir para seção ${index + 1}"></a>`).join('');
    document.body.appendChild(nav);

    const links = Array.from(nav.querySelectorAll('a'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((link) => link.classList.toggle('is-current', link.getAttribute('href') === '#' + entry.target.id));
      });
    }, { threshold: 0.44 });
    sections.forEach((section) => observer.observe(section));
  }

  function ensureBackTop() {
    if (document.getElementById('arandu-back-top')) return;
    const button = document.createElement('button');
    button.id = 'arandu-back-top';
    button.type = 'button';
    button.setAttribute('aria-label', 'Voltar ao topo');
    button.textContent = '↑';
    document.body.appendChild(button);
    button.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    const update = () => button.classList.toggle('is-visible', window.scrollY > 640);
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function ensureToast() {
    if (document.querySelector('.arandu-toast')) return null;
    const toast = document.createElement('div');
    toast.className = 'arandu-toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
    return toast;
  }

  function showToast(message) {
    const toast = document.querySelector('.arandu-toast') || ensureToast();
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 2300);
  }

  function setupFeedback() {
    ensureToast();
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-save-artwork]')) showToast('Obra adicionada à sua seleção.');
      if (event.target.closest('[data-reserve-artwork]')) showToast('Pedido de reserva iniciado.');
      if (event.target.closest('[data-assistant-open]')) showToast('Assistente aberto para te orientar.');
    });
  }

  function setupSelectionNudge() {
    if (document.querySelector('.selection-nudge')) return;
    const nudge = document.createElement('div');
    nudge.className = 'selection-nudge';
    nudge.innerHTML = 'Monte sua seleção · <a href="minha-selecao.html">ver escolhas</a>';
    document.body.appendChild(nudge);

    const update = () => {
      let hasItems = false;
      try {
        hasItems = Object.keys(localStorage || {}).some((key) => /selection|arandu/i.test(key) && String(localStorage.getItem(key) || '').length > 2);
      } catch (_) {}
      nudge.classList.toggle('is-visible', hasItems && window.scrollY > 420);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('storage', update);
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-save-artwork]')) setTimeout(update, 120);
    });
  }

  function improveExternalSearchLinks() {
    document.querySelectorAll('a.search-trigger[href="pesquisa.html"]').forEach((link) => {
      link.textContent = link.textContent.trim() || 'Pesquisar';
      link.setAttribute('aria-label', 'Pesquisar no site Arandu');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureProgress();
    ensureHelper();
    setupReveal();
    setupSectionNav();
    ensureBackTop();
    setupFeedback();
    setupSelectionNudge();
    improveExternalSearchLinks();
  });
})();

/* Arandu — pacote de usabilidade 40+ */
(function () {
  const INTERNAL_PAGE_PATTERNS = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const currentPage = () => window.location.pathname.split('/').pop() || 'index.html';
  if (INTERNAL_PAGE_PATTERNS.test(currentPage()) || document.body.dataset.usabilityPack === 'true') return;
  document.body.dataset.usabilityPack = 'true';

  const SEARCH_ITEMS = [
    ['Comprar arte', 'comprar-arte.html', 'Compra', 'obras disponíveis, preço, técnica, artista, reserva e curadoria'],
    ['Explorar obras', 'obras.html', 'Obras', 'catálogo, pintura, fotografia, escultura, filtros e acervo'],
    ['Acervo', 'acervo.html', 'Acervo', 'obras, artistas, trajetória, técnica e procedência'],
    ['Empresas', 'empresas.html', 'Empresas', 'curadoria para escritórios, clínicas, hotéis, restaurantes e ambientes'],
    ['Confiança', 'confianca.html', 'Confiança', 'autenticidade, certificado, compra segura e documentação'],
    ['Narrativa', 'narrativa.html', 'Narrativa', 'histórias, bastidores e arte brasileira contemporânea'],
    ['Para artistas', 'para-artistas.html', 'Artistas', 'submeter portfólio, documentação, curadoria e publicação'],
    ['Verificar certificado', 'verificar-certificado.html', 'Certificado', 'código, autenticidade, validação e procedência'],
    ['Minha seleção', 'minha-selecao.html', 'Seleção', 'obras salvas, comparação e contato com curadoria'],
    ['Contato', 'contato.html', 'Contato', 'falar com curadoria, dúvidas e atendimento']
  ];

  const PAGE_LABELS = {
    'index.html': 'Início',
    'comprar-arte.html': 'Comprar arte',
    'obras.html': 'Explorar obras',
    'obra.html': 'Obra',
    'acervo.html': 'Acervo',
    'empresas.html': 'Empresas',
    'para-artistas.html': 'Para artistas',
    'confianca.html': 'Confiança',
    'narrativa.html': 'Narrativa',
    'minha-selecao.html': 'Minha seleção',
    'contato.html': 'Contato'
  };

  const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

  function toast(message) {
    const existing = document.querySelector('.arandu-toast');
    if (existing) {
      existing.textContent = message;
      existing.classList.add('show');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => existing.classList.remove('show'), 2200);
    }
  }

  function ensureSkipLink() {
    if (document.querySelector('.skip-link')) return;
    const main = document.querySelector('main');
    if (main && !main.id) main.id = 'conteudo';
    const link = document.createElement('a');
    link.className = 'skip-link';
    link.href = '#conteudo';
    link.textContent = 'Pular para o conteúdo';
    document.body.prepend(link);
  }

  function setupKeyboardFocus() {
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') document.body.classList.add('using-keyboard');
    });
    window.addEventListener('mousedown', () => document.body.classList.remove('using-keyboard'));
  }

  function setupActiveAria() {
    const page = currentPage();
    document.querySelectorAll('a[href]').forEach((link) => {
      const href = (link.getAttribute('href') || '').split('?')[0].split('#')[0] || 'index.html';
      if (href === page) link.setAttribute('aria-current', 'page');
    });
  }

  function ensureBreadcrumbs() {
    if (document.querySelector('.arandu-breadcrumbs-pack')) return;
    const page = currentPage();
    if (page === 'index.html') return;
    const label = PAGE_LABELS[page] || document.title.replace('— Arandu', '').trim() || 'Página';
    const nav = document.createElement('nav');
    nav.className = 'arandu-breadcrumbs-pack';
    nav.setAttribute('aria-label', 'Você está em');
    nav.innerHTML = `<a href="index.html">Arandu</a><span>${escapeHtml(label)}</span>`;
    const main = document.querySelector('main');
    if (main) main.parentNode.insertBefore(nav, main);
  }

  function ensureQuickSearch() {
    if (document.querySelector('.quick-search-overlay')) return;
    const overlay = document.createElement('section');
    overlay.className = 'quick-search-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="quick-search-dialog" role="dialog" aria-modal="true" aria-label="Busca rápida Arandu">
        <div class="quick-search-head"><h2>Buscar na Arandu</h2><button class="quick-search-close" type="button" aria-label="Fechar busca">×</button></div>
        <input class="quick-search-input" type="search" placeholder="Busque por obra, artista, certificado, empresa..." autocomplete="off" />
        <div class="quick-search-results"></div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.quick-search-input');
    const results = overlay.querySelector('.quick-search-results');
    const render = (query = '') => {
      const q = normalize(query);
      const filtered = SEARCH_ITEMS.filter((item) => !q || normalize(item.join(' ')).includes(q)).slice(0, 9);
      results.innerHTML = filtered.length ? filtered.map(([title, url, type, text]) => `<a class="quick-search-result" href="${url}"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(type)}</small><p>${escapeHtml(text)}</p></a>`).join('') : '<p class="empty-guidance"><strong>Nenhum resultado direto.</strong>Tente buscar por obra, artista, compra, certificado ou empresa.</p>';
    };
    render('');

    const open = () => { overlay.hidden = false; render(''); setTimeout(() => input.focus(), 40); };
    const close = () => { overlay.hidden = true; };
    overlay.querySelector('.quick-search-close').addEventListener('click', close);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    input.addEventListener('input', () => render(input.value));
    document.addEventListener('keydown', (event) => {
      const shortcut = event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k');
      if (shortcut && !/input|textarea|select/i.test(document.activeElement.tagName)) { event.preventDefault(); open(); }
      if (event.key === 'Escape' && !overlay.hidden) close();
    });
    window.aranduOpenSearch = open;
  }

  function addToolbarActions() {
    const helperActions = document.querySelector('.helper-actions');
    if (!helperActions || helperActions.querySelector('.ux-toolbar')) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'ux-toolbar';
    toolbar.innerHTML = '<button type="button" data-open-search>Buscar</button><button type="button" data-copy-page>Copiar link</button><button type="button" data-toggle-contrast>Contraste</button><button type="button" data-toggle-text>Texto +</button>';
    helperActions.appendChild(toolbar);
  }

  function setupToolbarEvents() {
    document.addEventListener('click', async (event) => {
      if (event.target.closest('[data-open-search]')) { window.aranduOpenSearch?.(); }
      if (event.target.closest('[data-copy-page]')) {
        try { await navigator.clipboard.writeText(location.href); toast('Link copiado.'); event.target.closest('button')?.classList.add('copy-feedback'); } catch (_) { toast('Não foi possível copiar o link.'); }
      }
      if (event.target.closest('[data-toggle-contrast]')) {
        document.body.classList.toggle('high-contrast-mode');
        localStorage.setItem('arandu-contrast', document.body.classList.contains('high-contrast-mode') ? '1' : '0');
      }
      if (event.target.closest('[data-toggle-text]')) {
        document.body.classList.toggle('text-large');
        localStorage.setItem('arandu-text-large', document.body.classList.contains('text-large') ? '1' : '0');
      }
    });
    if (localStorage.getItem('arandu-contrast') === '1') document.body.classList.add('high-contrast-mode');
    if (localStorage.getItem('arandu-text-large') === '1') document.body.classList.add('text-large');
  }

  function setupRecentPages() {
    const page = currentPage();
    const label = PAGE_LABELS[page] || document.title.replace('— Arandu', '').trim() || 'Página';
    let recent = [];
    try { recent = JSON.parse(localStorage.getItem('arandu-recent-pages') || '[]'); } catch (_) {}
    recent = recent.filter((item) => item.url !== page);
    recent.unshift({ label, url: page });
    recent = recent.slice(0, 5);
    localStorage.setItem('arandu-recent-pages', JSON.stringify(recent));

    const useful = recent.filter((item) => item.url !== page).slice(0, 4);
    if (!useful.length || document.querySelector('.recent-pages-strip')) return;
    const strip = document.createElement('section');
    strip.className = 'recent-pages-strip';
    strip.innerHTML = `<div class="container"><strong>Vistos recentemente</strong><div class="recent-pages-links">${useful.map((item) => `<a href="${item.url}">${escapeHtml(item.label)}</a>`).join('')}</div></div>`;
    const footer = document.querySelector('.site-footer');
    if (footer) footer.parentNode.insertBefore(strip, footer);
  }

  function setupLinkPrefetch() {
    const prefetched = new Set();
    document.addEventListener('mouseover', (event) => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || prefetched.has(href)) return;
      prefetched.add(href);
      const prefetch = document.createElement('link');
      prefetch.rel = 'prefetch';
      prefetch.href = href;
      document.head.appendChild(prefetch);
    }, { passive: true });
  }

  function setupSmoothAnchors() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function enhanceLinks() {
    document.querySelectorAll('a[target="_blank"]').forEach((link) => link.setAttribute('rel', 'noopener noreferrer'));
    document.querySelectorAll('a[href=""],a[href="#"]').forEach((link) => link.setAttribute('aria-disabled', 'true'));
  }

  function enhanceImages() {
    document.querySelectorAll('img').forEach((img) => { img.loading = 'lazy'; img.decoding = 'async'; if (!img.alt) img.alt = ''; });
  }

  function enhanceCards() {
    document.querySelectorAll('.showcase-card[href],.macro-card[href],.artist-work-card[href],.journey-card[href]').forEach((card) => {
      if (!card.querySelector('.card-action-hint')) {
        const hint = document.createElement('span');
        hint.className = 'card-action-hint';
        hint.textContent = 'Ver detalhes';
        card.appendChild(hint);
      }
      if (!card.getAttribute('aria-label')) card.setAttribute('aria-label', card.textContent.trim().replace(/\s+/g, ' '));
    });
  }

  function setupButtons() {
    document.querySelectorAll('button:not([type])').forEach((button) => button.type = 'button');
    document.body.classList.add('tap-target-ready');
  }

  function setupRipple() {
    document.addEventListener('click', (event) => {
      const target = event.target.closest('.cta,.button,.assistant-chip,.quick-search-result,.showcase-card,.journey-card,.macro-card');
      if (!target) return;
      target.classList.add('click-ripple');
      const rect = target.getBoundingClientRect();
      const dot = document.createElement('span');
      dot.className = 'ripple-dot';
      dot.style.left = (event.clientX - rect.left) + 'px';
      dot.style.top = (event.clientY - rect.top) + 'px';
      target.appendChild(dot);
      setTimeout(() => dot.remove(), 560);
    });
  }

  function setupEscapeClose() {
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('.mobile-menu-panel').forEach((panel) => panel.hidden = true);
      document.body.classList.remove('menu-open');
      const assistant = document.querySelector('.assistant-panel');
      if (assistant) assistant.hidden = true;
    });
  }

  function setupFormHelpers() {
    document.querySelectorAll('input,select,textarea').forEach((field) => {
      if (!field.id && field.name) field.id = 'field-' + field.name;
      if (field.required && !field.closest('label') && !document.querySelector(`label[for="${field.id}"]`)) {
        const helper = document.createElement('small');
        helper.className = 'form-helper-text';
        helper.textContent = 'Campo obrigatório';
        field.insertAdjacentElement('afterend', helper);
      }
      field.addEventListener('invalid', () => field.classList.add('field-invalid'));
      field.addEventListener('input', () => field.classList.remove('field-invalid'));
    });
  }

  function setupPageTransitions() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (!link || link.target === '_blank' || link.href.includes('#') || link.origin !== location.origin) return;
      document.body.classList.add('page-exit');
    });
  }

  function setupIntentMemory() {
    document.addEventListener('click', (event) => {
      const journey = event.target.closest('.journey-card[href]');
      if (!journey) return;
      localStorage.setItem('arandu-last-intent', journey.textContent.trim().replace(/\s+/g, ' ').slice(0, 120));
    });
  }

  function addSearchHint() {
    if (document.querySelector('.quick-hint-pill')) return;
    const hint = document.createElement('div');
    hint.className = 'quick-hint-pill';
    hint.innerHTML = 'Busca rápida <kbd>/</kbd>';
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 7200);
  }

  function setupSelectionCount() {
    const update = () => {
      const dock = document.querySelector('.arandu-mobile-dock a[href="minha-selecao.html"] span');
      if (!dock) return;
      let count = 0;
      try {
        Object.keys(localStorage).forEach((key) => { if (/selection|selecao|arandu/i.test(key)) count += Math.min(9, JSON.stringify(localStorage.getItem(key)).length > 4 ? 1 : 0); });
      } catch (_) {}
      dock.textContent = count ? `Seleção (${count})` : 'Seleção';
    };
    update();
    document.addEventListener('click', (event) => { if (event.target.closest('[data-save-artwork]')) setTimeout(update, 160); });
  }

  function setupShareFallback() {
    if (navigator.share) {
      document.querySelectorAll('[data-copy-page]').forEach((button) => button.textContent = 'Compartilhar');
      document.addEventListener('click', async (event) => {
        if (!event.target.closest('[data-copy-page]')) return;
        try { await navigator.share({ title: document.title, url: location.href }); } catch (_) {}
      });
    }
  }

  function setupScrollRestoration() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  }

  function improveTables() {
    document.querySelectorAll('table').forEach((table) => {
      if (table.parentElement.classList.contains('table-scroll')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-scroll';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function setupSoftLoading() {
    document.addEventListener('click', (event) => {
      const action = event.target.closest('[data-reserve-artwork],form button[type="submit"]');
      if (!action) return;
      action.classList.add('is-loading-soft');
      setTimeout(() => action.classList.remove('is-loading-soft'), 1300);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    ensureSkipLink();
    setupKeyboardFocus();
    setupActiveAria();
    ensureBreadcrumbs();
    ensureQuickSearch();
    addToolbarActions();
    setupToolbarEvents();
    setupRecentPages();
    setupLinkPrefetch();
    setupSmoothAnchors();
    enhanceLinks();
    enhanceImages();
    enhanceCards();
    setupButtons();
    setupRipple();
    setupEscapeClose();
    setupFormHelpers();
    setupPageTransitions();
    setupIntentMemory();
    addSearchHint();
    setupSelectionCount();
    setupShareFallback();
    setupScrollRestoration();
    improveTables();
    setupSoftLoading();
  });
})();

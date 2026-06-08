/* ARANDU — comportamento global do site */
const SELECTION_KEY = 'arandu.selection.v1';
const FAVORITES_KEY = 'arandu.favorites.v1';

const SEARCH_INDEX = [
  { title: 'Comece aqui', url: 'comece-aqui.html', type: 'Entrada', text: 'comprar primeira obra empresa artista começar curadoria caminho seguro' },
  { title: 'Como comprar na Arandu', url: 'como-comprar-na-arandu.html', type: 'Compra', text: 'comprar reservar certificado entrega pagamento proposta confiança' },
  { title: 'Para colecionadores iniciantes', url: 'colecionadores-iniciantes.html', type: 'Iniciante', text: 'colecionador repertório orçamento anual acompanhar artistas coleção primeira compra' },
  { title: 'Encontrar arte', url: 'encontrar-arte.html', type: 'Curadoria', text: 'quiz curatorial ambiente momento orçamento sensação casa empresa hospitalidade primeira obra' },
  { title: 'Guia da primeira obra', url: 'guia-primeira-obra.html', type: 'Iniciante', text: 'primeira obra iniciante orçamento fotografia pintura escultura certificado' },
  { title: 'Obras até R$ 3.000', url: 'obras-ate-3000.html', type: 'Entrada', text: 'obras acessíveis fotografia primeira compra até 3000 orçamento entrada' },
  { title: 'Comparar obras', url: 'comparar-obras.html', type: 'Comparação', text: 'comparar preço técnica dimensão linguagem presença iniciante decisão' },
  { title: 'Arte para casa', url: 'arte-para-casa.html', type: 'Intenção', text: 'casa apartamento sala quarto ambiente acolhimento memória presença' },
  { title: 'Arte para empresa', url: 'arte-para-empresa.html', type: 'Corporativo', text: 'empresa corporativo motivar cativar incentivar recepção escritório cultura marca' },
  { title: 'Empresas e arquitetos', url: 'empresas-e-arquitetos.html', type: 'Corporativo', text: 'empresa arquitetura hotelaria recepção briefing proposta corporativo interiores' },
  { title: 'Obras', url: 'obras.html', type: 'Acervo', text: 'pintura fotografia escultura matéria memória movimento reflexão primeira obra' },
  { title: 'Artistas', url: 'artistas.html', type: 'Trajetórias', text: 'artistas trajetória linguagem séries evolução maturação portfólio' },
  { title: 'Prova de confiança', url: 'prova-de-confianca.html', type: 'Confiança', text: 'confiar arandu certificados curadoria reserva artista processo procedência' },
  { title: 'Autenticidade', url: 'autenticidade.html', type: 'Confiança', text: 'certificado autoria procedência ficha técnica autenticidade registro obra' },
  { title: 'Prospecção de artistas', url: 'prospeccao-artistas.html', type: 'Prospecção', text: 'artistas captação convite portfólio benefícios processo acompanhamento' },
  { title: 'Proposta para empresas', url: 'proposta-empresas.html', type: 'Empresas', text: 'empresas proposta corporativo hotelaria briefing curadoria orçamento' },
  { title: 'Arandu para Instagram', url: 'arandu-para-instagram.html', type: 'Mídias', text: 'instagram carrossel conteúdo redes sociais frases obras artistas' },
  { title: 'Narrativas', url: 'narrativas.html', type: 'Editorial', text: 'notas artigos informes movimentos artísticos curadoria obras artistas' },
  { title: 'Falar com a curadoria', url: 'contato.html', type: 'Contato', text: 'dúvidas ajuda escolher obra certificado orçamento entrega curadoria' },
  { title: 'Minha seleção', url: 'minha-selecao.html', type: 'Seleção', text: 'obras salvas seleção curadoria whatsapp copiar enviar comparar baixar leitura automática' }
];

const SEARCH_SYNONYMS = {
  quadro: 'pintura tela obra',
  decoracao: 'casa ambiente interiores parede',
  decoração: 'casa ambiente interiores parede',
  escritorio: 'empresa corporativo recepção escritório',
  escritório: 'empresa corporativo recepção escritório',
  barato: 'obras acessíveis orçamento até 3000 primeira obra',
  investimento: 'coleção trajetória artista procedência confiança',
  arquiteto: 'empresas arquitetos interiores briefing',
  hotel: 'hotelaria empresas hospitalidade recepção',
  iniciante: 'primeira obra guia segurança orçamento'
};

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function currentPageName() {
  return (window.location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
}

function getSelectionCount() {
  try { return JSON.parse(localStorage.getItem(SELECTION_KEY) || '[]').length; } catch { return 0; }
}

function getFavorites() {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]'); } catch { return []; }
}

function writeFavorites(items) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
}

function updateSelectionBadges() {
  document.querySelectorAll('[data-selection-count]').forEach((node) => { node.textContent = String(getSelectionCount()); });
}

function injectProductCss() {
  if (!document.querySelector('link[href*="css/arandu-product.css"]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/arandu-product.css?v=20260608';
    document.head.appendChild(link);
  }
}

function applyPageIdentity() {
  const page = currentPageName();
  document.body.dataset.page = page;
  const firstSection = document.querySelector('main > .section:first-child .container, main > .home-hero:first-child .container');
  if (firstSection && !firstSection.querySelector('[data-page-chip]')) {
    const chip = document.createElement('span');
    chip.className = 'page-chip';
    chip.dataset.pageChip = 'true';
    const labels = {
      index: 'Início',
      'comece-aqui': 'Comece aqui',
      'encontrar-arte': 'Curadoria guiada',
      obras: 'Acervo',
      artistas: 'Trajetórias',
      'empresas-e-arquitetos': 'Corporativo',
      'arte-para-empresa': 'Empresas',
      'para-artistas': 'Artistas',
      autenticidade: 'Confiança',
      narrativas: 'Editorial',
      contato: 'Curadoria'
    };
    chip.textContent = labels[page] || 'Arandu';
    firstSection.prepend(chip);
  }
}

function markActiveLinks() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('a[href]').forEach((link) => {
    if (link.getAttribute('href') === page) link.classList.add('is-active');
  });
}

function addSelectionCounter() {
  document.querySelectorAll('.site-nav, .nav').forEach((nav) => {
    if (!nav.querySelector('[data-selection-nav]')) {
      const link = document.createElement('a');
      link.href = 'minha-selecao.html';
      link.dataset.selectionNav = 'true';
      link.innerHTML = `Seleção (<span data-selection-count>${getSelectionCount()}</span>)`;
      nav.appendChild(link);
    }
  });
  updateSelectionBadges();
}

function setupMegaNav() {
  const headerInner = document.querySelector('.header-inner');
  if (!headerInner || document.querySelector('[data-mega-trigger]')) return;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'mega-trigger';
  trigger.dataset.megaTrigger = 'true';
  trigger.textContent = 'Explorar';
  trigger.setAttribute('aria-expanded', 'false');
  headerInner.insertBefore(trigger, headerInner.querySelector('.site-nav'));

  const mega = document.createElement('div');
  mega.className = 'product-mega';
  mega.dataset.megaNav = 'true';
  mega.hidden = true;
  mega.innerHTML = '<div class="mega-group"><h3>Comprar arte</h3><a href="comece-aqui.html">Comece aqui</a><a href="encontrar-arte.html">Quiz curatorial</a><a href="guia-primeira-obra.html">Primeira obra</a><a href="obras-ate-3000.html">Obras até R$ 3.000</a><a href="comparar-obras.html">Comparar obras</a></div><div class="mega-group"><h3>Acervo</h3><a href="obras.html">Obras</a><a href="artistas.html">Artistas</a><a href="fotografia-brasileira.html">Fotografia</a><a href="pintura-contemporanea-brasileira.html">Pintura</a><a href="escultura-brasileira.html">Escultura</a></div><div class="mega-group"><h3>Empresas</h3><a href="empresas-e-arquitetos.html">Empresas e arquitetos</a><a href="arte-para-empresa.html">Arte para empresas</a><a href="arte-para-escritorios.html">Escritórios</a><a href="arte-para-hoteis.html">Hotéis</a><a href="arte-para-restaurantes.html">Restaurantes</a></div><div class="mega-group"><h3>Confiança</h3><a href="prova-de-confianca.html">Por que confiar</a><a href="autenticidade.html">Autenticidade</a><a href="como-comprar-na-arandu.html">Como comprar</a><a href="como-precificamos-obras.html">Preço</a><a href="como-funciona-reserva.html">Reserva</a></div><div class="mega-group"><h3>Editorial</h3><a href="narrativas.html">Narrativas</a><a href="para-artistas.html">Para artistas</a><a href="prospeccao-artistas.html">Prospecção</a><a href="media-kit.html">Media kit</a><a href="contato.html">Curadoria</a></div>';
  document.body.appendChild(mega);

  function closeMega() {
    mega.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', () => {
    const nextOpen = mega.hidden;
    mega.hidden = !nextOpen;
    trigger.setAttribute('aria-expanded', String(nextOpen));
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('[data-mega-nav]') && !event.target.closest('[data-mega-trigger]')) closeMega();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMega();
  });
}

function scoreSearchItem(item, query) {
  const q = normalizeText(query);
  if (!q) return 1;
  const expanded = `${q} ${q.split(/\s+/).map((term) => SEARCH_SYNONYMS[term] || '').join(' ')}`;
  const terms = normalizeText(expanded).split(/\s+/).filter(Boolean);
  const title = normalizeText(item.title);
  const type = normalizeText(item.type);
  const text = normalizeText(item.text);
  const full = `${title} ${type} ${text}`;
  let score = full.includes(q) ? 16 : 0;
  terms.forEach((term) => {
    if (title.includes(term)) score += 6;
    if (type.includes(term)) score += 4;
    if (text.includes(term)) score += 2;
  });
  return score;
}

function renderSearchResults(query = '') {
  const target = document.querySelector('[data-search-results]');
  if (!target) return;
  const results = SEARCH_INDEX
    .map((item) => ({ ...item, score: scoreSearchItem(item, query) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 14);
  target.innerHTML = results.length
    ? results.map((item) => `<a class="search-result" href="${escapeHtml(item.url)}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.type)}</small><p>${escapeHtml(item.text)}</p></a>`).join('')
    : '<p>Nenhum resultado encontrado. Tente obra, artista, certificado, empresa, fotografia ou curadoria.</p>';
}

function setupSearch() {
  if (!document.querySelector('[data-search-overlay]')) {
    const overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.dataset.searchOverlay = 'true';
    overlay.hidden = true;
    overlay.innerHTML = '<div class="search-dialog" role="dialog" aria-modal="true" aria-label="Pesquisar na Arandu"><div class="search-dialog-header"><h2>Pesquisar na Arandu</h2><button class="search-close" type="button" data-search-close>Fechar</button></div><div class="tags"><button class="tag" data-search-suggestion="primeira obra">Primeira obra</button><button class="tag" data-search-suggestion="fotografia até 3000">Fotografia até 3000</button><button class="tag" data-search-suggestion="empresa">Arte para empresa</button><button class="tag" data-search-suggestion="certificado">Certificado</button><button class="tag" data-search-suggestion="decoração">Decoração</button></div><input data-search-input placeholder="Busque por obra, artista, certificado, empresa, fotografia..." autocomplete="off" /><div class="search-results" data-search-results></div><div class="page-actions"><a class="cta secondary" href="encontrar-arte.html">Não sei o que buscar, me guie pela curadoria</a></div></div>';
    document.body.appendChild(overlay);
  }
  const headerInner = document.querySelector('.header-inner');
  if (headerInner && !headerInner.querySelector('[data-search-open]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'search-trigger desktop-search-inline';
    button.dataset.searchOpen = 'true';
    button.textContent = 'Pesquisar';
    headerInner.insertBefore(button, headerInner.querySelector('.cta'));
  }
  if (!document.querySelector('[data-floating-search]')) {
    const floating = document.createElement('button');
    floating.type = 'button';
    floating.className = 'floating-search';
    floating.dataset.floatingSearch = 'true';
    floating.dataset.searchOpen = 'true';
    floating.textContent = 'Pesquisar';
    document.body.appendChild(floating);
  }
  renderSearchResults('');
}

function openSearch() {
  const overlay = document.querySelector('[data-search-overlay]');
  if (!overlay) return;
  overlay.hidden = false;
  renderSearchResults('');
  setTimeout(() => overlay.querySelector('[data-search-input]')?.focus(), 30);
}

function closeSearch() {
  const overlay = document.querySelector('[data-search-overlay]');
  if (overlay) overlay.hidden = true;
}

function setupMobileMenu() {
  const headerInner = document.querySelector('.header-inner');
  const nav = document.querySelector('.site-nav, .nav');
  if (!headerInner || !nav || document.querySelector('[data-mobile-menu-button]')) return;
  document.body.classList.add('nav-compact');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mobile-menu-button';
  button.dataset.mobileMenuButton = 'true';
  button.setAttribute('aria-expanded', 'false');
  button.textContent = 'Menu';
  const panel = document.createElement('div');
  panel.className = 'mobile-menu-panel';
  panel.hidden = true;
  panel.innerHTML = `<button type="button" data-search-open>Pesquisar</button>${nav.innerHTML}`;
  button.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    document.body.classList.toggle('menu-open', open);
    button.setAttribute('aria-expanded', String(open));
  });
  panel.addEventListener('click', (event) => {
    if (event.target.closest('a') || event.target.closest('[data-search-open]')) {
      panel.hidden = true;
      document.body.classList.remove('menu-open');
      button.setAttribute('aria-expanded', 'false');
    }
  });
  headerInner.appendChild(button);
  document.querySelector('.site-header, .header')?.appendChild(panel);
}

function setupMobileBottomNav() {
  if (document.querySelector('[data-mobile-bottom-nav]')) return;
  const nav = document.createElement('nav');
  nav.className = 'mobile-bottom-nav';
  nav.dataset.mobileBottomNav = 'true';
  nav.innerHTML = '<a href="index.html">Início</a><button type="button" data-search-open>Buscar</button><a href="obras.html">Obras</a><a href="minha-selecao.html">Seleção</a><a href="contato.html">Curadoria</a>';
  document.body.appendChild(nav);
}

function setupFloatingCta() {
  if (document.querySelector('[data-floating-cta]')) return;
  const a = document.createElement('a');
  a.className = 'cta floating-cta';
  a.dataset.floatingCta = 'true';
  a.href = 'contato.html';
  a.textContent = 'Pedir curadoria';
  document.body.appendChild(a);
}

function setupFavorites() {
  document.querySelectorAll('[data-save-intent]').forEach((button) => {
    button.addEventListener('click', () => {
      const fav = {
        id: button.dataset.saveIntent,
        title: button.dataset.intentTitle || button.textContent.trim(),
        url: button.dataset.intentUrl || location.pathname,
        type: button.dataset.intentType || 'intenção'
      };
      const current = getFavorites();
      if (!current.some((item) => item.id === fav.id)) writeFavorites([...current, fav]);
      button.textContent = 'Caminho salvo';
      button.setAttribute('aria-live', 'polite');
    });
  });
}

document.addEventListener('click', (event) => {
  const suggestion = event.target.closest('[data-search-suggestion]');
  if (suggestion) {
    event.preventDefault();
    const input = document.querySelector('[data-search-input]');
    if (input) input.value = suggestion.dataset.searchSuggestion;
    renderSearchResults(suggestion.dataset.searchSuggestion);
  }
  if (event.target.closest('[data-search-open]')) {
    event.preventDefault();
    openSearch();
  }
  if (event.target.closest('[data-search-close]') || event.target.matches('[data-search-overlay]')) {
    event.preventDefault();
    closeSearch();
  }
});

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-search-input]')) renderSearchResults(event.target.value);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeSearch();
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openSearch();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  injectProductCss();
  applyPageIdentity();
  markActiveLinks();
  addSelectionCounter();
  setupMegaNav();
  setupSearch();
  setupMobileMenu();
  setupMobileBottomNav();
  setupFloatingCta();
  setupFavorites();
});

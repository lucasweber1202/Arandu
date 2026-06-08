/* ARANDU — comportamento global do site */
const SELECTION_KEY = 'arandu.selection.v1';

const SEARCH_INDEX = [
  { title: 'Encontrar arte', url: 'encontrar-arte.html', type: 'Curadoria', text: 'ambiente momento orçamento sensação casa empresa hospitalidade primeira obra' },
  { title: 'Obras', url: 'obras.html', type: 'Acervo', text: 'pintura fotografia escultura matéria memória movimento reflexão primeira obra' },
  { title: 'Sertão Silencioso', url: 'obra-sertao-silencioso.html', type: 'Obra', text: 'Camila Rebouças fotografia fine art memória silêncio primeira obra' },
  { title: 'Estudo de Solo Nº 04', url: 'obra-estudo-de-solo-04.html', type: 'Obra', text: 'Marina Silveira pintura óleo matéria reflexão memória' },
  { title: 'Equilíbrio Suspenso', url: 'obra-equilibrio-suspenso.html', type: 'Obra', text: 'Arthur D Avila escultura bronze equilíbrio matéria tensão' },
  { title: 'Artistas', url: 'artistas.html', type: 'Trajetórias', text: 'artistas trajetória linguagem séries evolução maturação' },
  { title: 'Empresas', url: 'empresas-e-arquitetos.html', type: 'Corporativo', text: 'empresa corporativo hospitalidade hotel restaurante recepção motivar cativar incentivar' },
  { title: 'Para artistas', url: 'para-artistas.html', type: 'Artistas', text: 'submeter portfólio reconhecimento evolução maturação plataforma' },
  { title: 'Autenticidade', url: 'autenticidade.html', type: 'Confiança', text: 'certificado autenticidade procedência critérios validação autoria ficha técnica' },
  { title: 'Narrativas', url: 'narrativas.html', type: 'Editorial', text: 'notas artigos informes movimentos artísticos curadoria obras artistas' },
  { title: 'Falar com a curadoria', url: 'contato.html', type: 'Contato', text: 'dúvidas ajuda escolher obra certificado orçamento entrega curadoria' },
  { title: 'Minha seleção', url: 'minha-selecao.html', type: 'Seleção', text: 'obras salvas seleção curadoria whatsapp copiar enviar' }
];

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function currentPageName() {
  return (window.location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
}

function applyPageIdentity() {
  const page = currentPageName();
  document.body.dataset.page = page;
  const firstSection = document.querySelector('main > .section:first-child .container');
  if (firstSection && !firstSection.querySelector('[data-page-chip]')) {
    const chip = document.createElement('span');
    chip.className = 'page-chip';
    chip.dataset.pageChip = 'true';
    const labels = {
      index: 'Início',
      'encontrar-arte': 'Curadoria guiada',
      obras: 'Acervo',
      artistas: 'Trajetórias',
      'empresas-e-arquitetos': 'Corporativo',
      'para-artistas': 'Artistas',
      autenticidade: 'Confiança',
      narrativas: 'Editorial',
      contato: 'Curadoria'
    };
    chip.textContent = labels[page] || 'Arandu';
    firstSection.prepend(chip);
  }
}

function getSelectionCount() {
  try { return JSON.parse(localStorage.getItem(SELECTION_KEY) || '[]').length; } catch { return 0; }
}

function markActiveLinks() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('a[href]').forEach((link) => {
    if (link.getAttribute('href') === page) link.classList.add('is-active');
  });
}

function addSelectionCounter() {
  const navs = document.querySelectorAll('.site-nav, .nav');
  navs.forEach((nav) => {
    if (!nav.querySelector('[data-selection-nav]')) {
      const link = document.createElement('a');
      link.href = 'minha-selecao.html';
      link.dataset.selectionNav = 'true';
      link.innerHTML = `Seleção (<span data-selection-count>${getSelectionCount()}</span>)`;
      nav.appendChild(link);
    }

    if (!nav.querySelector('[data-auth-nav]')) {
      const auth = document.createElement('span');
      auth.dataset.authNav = 'true';
      auth.innerHTML = '<a href="login.html">Entrar</a>';
      nav.appendChild(auth);
    }
  });
}

function renderSearchResults(query = '') {
  const target = document.querySelector('[data-search-results]');
  if (!target) return;
  const q = normalizeText(query);
  const results = SEARCH_INDEX.filter((item) => {
    if (!q) return true;
    return normalizeText(`${item.title} ${item.type} ${item.text}`).includes(q);
  }).slice(0, 9);

  target.innerHTML = results.length
    ? results.map((item) => `<a class="search-result" href="${item.url}"><strong>${item.title}</strong><small>${item.type}</small><p>${item.text}</p></a>`).join('')
    : '<p>Nenhum resultado encontrado. Tente obra, artista, certificado, empresa, fotografia ou curadoria.</p>';
}

function setupSearch() {
  if (!document.querySelector('[data-search-overlay]')) {
    const overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.dataset.searchOverlay = 'true';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="search-dialog" role="dialog" aria-modal="true" aria-label="Pesquisar na Arandu">
        <div class="search-dialog-header"><h2>Pesquisar na Arandu</h2><button class="search-close" type="button" data-search-close>Fechar</button></div>
        <input data-search-input placeholder="Busque por obra, artista, certificado, empresa, fotografia..." autocomplete="off" />
        <div class="search-results" data-search-results></div>
      </div>`;
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
    button.setAttribute('aria-expanded', String(open));
  });

  panel.addEventListener('click', (event) => {
    if (event.target.closest('a') || event.target.closest('[data-search-open]')) {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }
  });

  headerInner.appendChild(button);
  document.querySelector('.site-header, .header')?.appendChild(panel);
}

document.addEventListener('click', (event) => {
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
  applyPageIdentity();
  markActiveLinks();
  addSelectionCounter();
  setupSearch();
  setupMobileMenu();
});

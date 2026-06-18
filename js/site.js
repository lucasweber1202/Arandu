/* ARANDU — shell público principal */
const SEARCH_INDEX = [
  { title: 'Comprar arte', url: 'comprar-arte.html', type: 'Compra', text: 'obras disponíveis preço técnica artista reserva curadoria' },
  { title: 'Explorar obras', url: 'obras.html', type: 'Obras', text: 'catálogo pintura fotografia escultura filtros acervo' },
  { title: 'Acervo', url: 'acervo.html', type: 'Acervo', text: 'obras artistas trajetória técnica procedência' },
  { title: 'Empresas', url: 'empresas.html', type: 'Empresas', text: 'curadoria escritórios clínicas hotéis restaurantes ambientes' },
  { title: 'Confiança', url: 'confianca.html', type: 'Confiança', text: 'autenticidade certificado critérios reserva compra procedência' },
  { title: 'Narrativa', url: 'narrativa.html', type: 'Narrativa', text: 'histórias artistas bastidores textos arte brasileira contemporânea' },
  { title: 'Contato', url: 'contato.html', type: 'Contato', text: 'falar com curadoria dúvidas compra artistas empresas' },
  { title: 'Assistente virtual', url: '#assistente', type: 'Atendimento', text: 'orientação caminho comprar obra empresa artista certificado' },
  { title: 'Para artistas', url: 'para-artistas.html', type: 'Artistas', text: 'submeter portfólio documentação certificado curadoria' },
  { title: 'Verificar certificado', url: 'verificar-certificado.html', type: 'Certificado', text: 'código certificado autenticidade validação procedência' }
];

const PUBLIC_NAV_ITEMS = [
  ['Comprar arte', 'comprar-arte.html'],
  ['Acervo', 'acervo.html'],
  ['Empresas', 'empresas.html'],
  ['Confiança', 'confianca.html'],
  ['Narrativa', 'narrativa.html'],
  ['Explorar', 'obras.html']
];

const INTERNAL_PAGE_PATTERNS = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;

function normalizeText(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

function currentPage() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function isInternalPage() {
  return INTERNAL_PAGE_PATTERNS.test(currentPage());
}

function hasAsset(srcOrHref) {
  return Boolean(document.querySelector(`script[src*="${srcOrHref}"],link[href*="${srcOrHref}"]`));
}

function injectScriptOnce(src, id) {
  if (!document.getElementById(id) && !hasAsset(src.split('?')[0])) {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.defer = true;
    document.body.appendChild(script);
  }
}

function injectCssOnce(href, id) {
  if (!document.getElementById(id) && !hasAsset(href.split('?')[0])) {
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}

function loadCentralLoader() {
  if (isInternalPage()) return;
  injectScriptOnce('js/arandu-loader.js?v=20260610-public-shell-1', 'arandu-loader-js');
}

function injectPageIntegrations() {
  if (isInternalPage()) return;
  injectScriptOnce('js/arandu-functions.js?v=20260610-ux-1', 'arandu-functions-js');
  injectScriptOnce('js/arandu-recent.js?v=20260610-ux-1', 'arandu-recent-js');
  injectScriptOnce('js/arandu-journey.js?v=20260610-ux-1', 'arandu-journey-js');
  injectScriptOnce('js/arandu-usability.js?v=20260610-ux-1', 'arandu-usability-js');
  injectScriptOnce('js/arandu-assistant.js?v=20260618-experience-1', 'arandu-assistant-js');
  injectScriptOnce('js/arandu-mobile.js?v=20260618-mobile-1', 'arandu-mobile-js');
  injectScriptOnce('js/arandu-ux-plus.js?v=20260618-ux-plus-1', 'arandu-ux-plus-js');
  injectScriptOnce('js/arandu-usability-pack.js?v=20260618-usability-pack-1', 'arandu-usability-pack-js');
  if (currentPage() === 'proposta-curatorial.html') injectScriptOnce('js/proposal-api.js?v=20260610-operational-1', 'arandu-proposal-api-js');
}

function injectProductCss() {
  if (isInternalPage()) return;
  injectCssOnce('css/arandu-architecture.css?v=20260610-public-shell-1', 'arandu-architecture-css');
  injectCssOnce('css/arandu-clean.css?v=20260610-public-shell-1', 'arandu-clean-css');
  injectCssOnce('css/arandu-visual-polish.css?v=20260610-ux-1', 'arandu-visual-polish-css');
  injectCssOnce('css/arandu-experience.css?v=20260618-experience-1', 'arandu-experience-css');
  injectCssOnce('css/arandu-presentation.css?v=20260618-presentation-1', 'arandu-presentation-css');
  injectCssOnce('css/arandu-mobile.css?v=20260618-mobile-1', 'arandu-mobile-css');
  injectCssOnce('css/arandu-ux-plus.css?v=20260618-ux-plus-1', 'arandu-ux-plus-css');
  injectCssOnce('css/arandu-usability-pack.css?v=20260618-usability-pack-1', 'arandu-usability-pack-css');
}

function markActiveLinks() {
  const page = currentPage();
  document.querySelectorAll('a[href]').forEach((link) => {
    const href = link.getAttribute('href') || '';
    const target = href.split('#')[0].split('?')[0] || 'index.html';
    if (target === page) link.classList.add('is-active');
  });
}

function normalizeHeader() {
  if (isInternalPage()) return;

  document.querySelectorAll('.header-inner > .search-trigger, .header-inner > .native-search-link').forEach((link) => link.remove());

  document.querySelectorAll('.site-nav, .nav').forEach((nav) => {
    nav.innerHTML = '';
    PUBLIC_NAV_ITEMS.forEach(([label, href]) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      nav.appendChild(a);
    });
  });

  document.querySelectorAll('.site-header .cta').forEach((cta) => {
    if (cta.matches('[data-assistant-open]')) return;
    cta.href = 'contato.html';
    cta.textContent = 'Falar com a curadoria';
  });
}

function renderSearchResults(query = '') {
  const target = document.querySelector('[data-search-results]');
  if (!target) return;

  const q = normalizeText(query);
  const results = SEARCH_INDEX
    .filter((item) => !q || normalizeText(`${item.title} ${item.type} ${item.text}`).includes(q))
    .slice(0, 8);

  target.innerHTML = results.length
    ? results.map((item) => {
      if (item.url === '#assistente') {
        return `<button class="search-result" type="button" data-assistant-open><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.type)}</small><p>${escapeHtml(item.text)}</p></button>`;
      }
      return `<a class="search-result" href="${escapeHtml(item.url)}"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.type)}</small><p>${escapeHtml(item.text)}</p></a>`;
    }).join('')
    : '<p>Nenhum resultado encontrado.</p>';
}

function setupSearch() {
  document.querySelectorAll('[data-search-results]').forEach(() => renderSearchResults(''));
}

function setupMobileMenu() {
  if (isInternalPage()) return;
  const headerInner = document.querySelector('.header-inner');
  const nav = document.querySelector('.site-nav, .nav');
  if (!headerInner || !nav || document.querySelector('[data-mobile-menu-button]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mobile-menu-button mobile-only';
  button.dataset.mobileMenuButton = 'true';
  button.setAttribute('aria-expanded', 'false');
  button.textContent = 'Menu';

  const panel = document.createElement('div');
  panel.className = 'mobile-menu-panel mobile-only';
  panel.hidden = true;
  panel.innerHTML = nav.innerHTML;

  button.addEventListener('click', () => {
    const open = panel.hidden;
    panel.hidden = !open;
    document.body.classList.toggle('menu-open', open);
    button.setAttribute('aria-expanded', String(open));
  });

  panel.addEventListener('click', (event) => {
    if (event.target.closest('a')) {
      panel.hidden = true;
      document.body.classList.remove('menu-open');
      button.setAttribute('aria-expanded', 'false');
    }
  });

  headerInner.appendChild(button);
  document.querySelector('.site-header, .header')?.appendChild(panel);
}

function setupShare() {
  document.addEventListener('click', async (event) => {
    const target = event.target.closest('.share-action, [href="#compartilhar"]');
    if (!target) return;
    event.preventDefault();

    const data = { title: document.title || 'Arandu', text: 'Conheça a Arandu', url: location.href };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
      await navigator.clipboard.writeText(location.href);
      alert('Link copiado para compartilhar.');
    } catch (_) {
      location.href = 'https://wa.me/?text=' + encodeURIComponent(location.href);
    }
  });
}

function removeLegacyUi() {
  if (isInternalPage()) return;
  document.querySelectorAll('#mood-bar,#side-inquiry,#sticky-decision-footer,#lead-magnet,#intent-cloud,#buyer-profile,#budget-helper,#command-palette,#copy-journey,#section-index,#compare-tray,#selection-drawer-hint,[data-mega-trigger],[data-mega-nav],[data-mobile-bottom-nav],[data-floating-cta],.floating-cta,.mobile-bottom-nav,.bottom-nav,.product-mega,.mega-trigger').forEach((el) => el.remove());
}

document.addEventListener('input', (event) => {
  if (event.target.matches('[data-search-input]')) renderSearchResults(event.target.value);
});

document.addEventListener('DOMContentLoaded', () => {
  document.body.dataset.publicShell = isInternalPage() ? '20260610-internal-shell-safe' : '20260618-usability-pack-shell-1';
  loadCentralLoader();
  injectProductCss();
  injectPageIntegrations();
  normalizeHeader();
  markActiveLinks();
  setupSearch();
  setupMobileMenu();
  setupShare();
  removeLegacyUi();
  setTimeout(removeLegacyUi, 300);
  setTimeout(removeLegacyUi, 1200);
});

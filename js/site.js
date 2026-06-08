/* ARANDU — comportamento global do site */
const SELECTION_KEY = 'arandu.selection.v1';

const SEARCH_INDEX = [
  { title: 'Encontrar arte', url: 'encontrar-arte.html', type: 'Curadoria', text: 'quiz curatorial ambiente momento orçamento sensação casa empresa hospitalidade primeira obra' },
  { title: 'Guia da primeira obra', url: 'guia-primeira-obra.html', type: 'Iniciante', text: 'primeira obra iniciante orçamento fotografia pintura escultura certificado' },
  { title: 'Obras até R$ 3.000', url: 'obras-ate-3000.html', type: 'Entrada', text: 'obras baratas acessíveis fotografia primeira compra até 3000' },
  { title: 'Comparar obras', url: 'comparar-obras.html', type: 'Comparação', text: 'comparar preço técnica dimensão linguagem presença iniciante' },
  { title: 'Arte para casa', url: 'arte-para-casa.html', type: 'Intenção', text: 'casa ambiente acolhimento memória presença' },
  { title: 'Arte para apartamento', url: 'arte-para-apartamento.html', type: 'Intenção', text: 'apartamento escala respiro primeira obra' },
  { title: 'Arte para empresa', url: 'arte-para-empresa.html', type: 'Corporativo', text: 'empresa corporativo motivar cativar incentivar recepção escritório' },
  { title: 'Arte para hotelaria', url: 'arte-para-hotelaria.html', type: 'Hospitalidade', text: 'hotelaria hotel restaurante café atmosfera experiência' },
  { title: 'Fotografia brasileira', url: 'fotografia-brasileira.html', type: 'Linguagem', text: 'fotografia edição tiragem primeira compra memória' },
  { title: 'Pintura contemporânea brasileira', url: 'pintura-contemporanea-brasileira.html', type: 'Linguagem', text: 'pintura matéria gesto superfície trajetória' },
  { title: 'Escultura brasileira', url: 'escultura-brasileira.html', type: 'Linguagem', text: 'escultura objeto volume espaço materialidade' },
  { title: 'Obras', url: 'obras.html', type: 'Acervo', text: 'pintura fotografia escultura matéria memória movimento reflexão primeira obra' },
  { title: 'Sertão Silencioso', url: 'obra-sertao-silencioso.html', type: 'Obra', text: 'Camila Rebouças fotografia fine art memória silêncio primeira obra' },
  { title: 'Estudo de Solo Nº 04', url: 'obra-estudo-de-solo-04.html', type: 'Obra', text: 'Marina Silveira pintura óleo matéria reflexão memória' },
  { title: 'Equilíbrio Suspenso', url: 'obra-equilibrio-suspenso.html', type: 'Obra', text: 'Arthur D Avila escultura bronze equilíbrio matéria tensão' },
  { title: 'Artistas', url: 'artistas.html', type: 'Trajetórias', text: 'artistas trajetória linguagem séries evolução maturação' },
  { title: 'Como selecionamos artistas', url: 'como-selecionamos-artistas.html', type: 'Confiança', text: 'seleção artistas linguagem consistência documentação trajetória' },
  { title: 'Como precificamos obras', url: 'como-precificamos-obras.html', type: 'Confiança', text: 'preço precificação técnica dimensão trajetória edição procedência' },
  { title: 'Como funciona a reserva', url: 'como-funciona-reserva.html', type: 'Confiança', text: 'reserva obra disponibilidade prazo decisão compra' },
  { title: 'Empresas', url: 'empresas-e-arquitetos.html', type: 'Corporativo', text: 'empresa corporativo hospitalidade hotel restaurante recepção motivar cativar incentivar' },
  { title: 'Arte para escritórios', url: 'arte-para-escritorios.html', type: 'Corporativo', text: 'escritório sala reunião recepção empresa' },
  { title: 'Arte para hotéis', url: 'arte-para-hoteis.html', type: 'Hospitalidade', text: 'hotel pousada lobby suíte estadia' },
  { title: 'Arte para restaurantes', url: 'arte-para-restaurantes.html', type: 'Hospitalidade', text: 'restaurante café atmosfera memória experiência' },
  { title: 'Arte para clínicas', url: 'arte-para-clinicas.html', type: 'Corporativo', text: 'clínica consultório acolhimento cuidado serenidade' },
  { title: 'Arte para recepções', url: 'arte-para-recepcoes.html', type: 'Corporativo', text: 'recepção primeira impressão identidade impacto' },
  { title: 'Para artistas', url: 'para-artistas.html', type: 'Artistas', text: 'submeter portfólio reconhecimento evolução maturação plataforma comissão pagamento checklist' },
  { title: 'Checklist de portfólio', url: 'checklist-portfolio-artista.html', type: 'Artistas', text: 'portfólio artista bio ficha técnica imagens disponibilidade faixa de preço' },
  { title: 'Autenticidade', url: 'autenticidade.html', type: 'Confiança', text: 'certificado autenticidade procedência critérios validação autoria ficha técnica' },
  { title: 'Narrativas', url: 'narrativas.html', type: 'Editorial', text: 'notas artigos informes movimentos artísticos curadoria obras artistas' },
  { title: 'Como escolher sua primeira obra', url: 'narrativa-primeira-obra.html', type: 'Artigo', text: 'primeira obra guia iniciante sensação linguagem orçamento' },
  { title: 'Por que empresas devem investir em arte', url: 'narrativa-empresas-arte.html', type: 'Artigo', text: 'empresa arte corporativa motivar cativar incentivar' },
  { title: 'O que significa uma obra certificada', url: 'narrativa-certificado.html', type: 'Artigo', text: 'certificado autoria técnica registro verificação' },
  { title: 'Fotografia é uma boa primeira compra?', url: 'narrativa-fotografia-primeira-compra.html', type: 'Artigo', text: 'fotografia primeira compra edição tiragem' },
  { title: 'Como uma obra muda um ambiente', url: 'narrativa-obra-ambiente.html', type: 'Artigo', text: 'ambiente escala ritmo atmosfera obra' },
  { title: 'O que observar antes de comprar uma pintura', url: 'narrativa-comprar-pintura.html', type: 'Artigo', text: 'pintura superfície série suporte trajetória' },
  { title: 'Falar com a curadoria', url: 'contato.html', type: 'Contato', text: 'dúvidas ajuda escolher obra certificado orçamento entrega curadoria' },
  { title: 'Minha seleção', url: 'minha-selecao.html', type: 'Seleção', text: 'obras salvas seleção curadoria whatsapp copiar enviar comparar baixar' }
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
    const labels = { index: 'Início', 'encontrar-arte': 'Curadoria guiada', obras: 'Acervo', artistas: 'Trajetórias', 'empresas-e-arquitetos': 'Corporativo', 'para-artistas': 'Artistas', autenticidade: 'Confiança', narrativas: 'Editorial', contato: 'Curadoria' };
    chip.textContent = labels[page] || 'Arandu';
    firstSection.prepend(chip);
  }
}

function getSelectionCount() { try { return JSON.parse(localStorage.getItem(SELECTION_KEY) || '[]').length; } catch { return 0; } }

function markActiveLinks() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('a[href]').forEach((link) => { if (link.getAttribute('href') === page) link.classList.add('is-active'); });
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
  const results = SEARCH_INDEX.filter((item) => !q || normalizeText(`${item.title} ${item.type} ${item.text}`).includes(q)).slice(0, 12);
  target.innerHTML = results.length ? results.map((item) => `<a class="search-result" href="${item.url}"><strong>${item.title}</strong><small>${item.type}</small><p>${item.text}</p></a>`).join('') : '<p>Nenhum resultado encontrado. Tente obra, artista, certificado, empresa, fotografia ou curadoria.</p>';
}

function setupSearch() {
  if (!document.querySelector('[data-search-overlay]')) {
    const overlay = document.createElement('div');
    overlay.className = 'search-overlay';
    overlay.dataset.searchOverlay = 'true';
    overlay.hidden = true;
    overlay.innerHTML = `<div class="search-dialog" role="dialog" aria-modal="true" aria-label="Pesquisar na Arandu"><div class="search-dialog-header"><h2>Pesquisar na Arandu</h2><button class="search-close" type="button" data-search-close>Fechar</button></div><div class="tags"><button class="tag" data-search-suggestion="primeira obra">Primeira obra</button><button class="tag" data-search-suggestion="fotografia até 3000">Fotografia até 3000</button><button class="tag" data-search-suggestion="empresa">Arte para empresa</button><button class="tag" data-search-suggestion="certificado">Certificado</button><button class="tag" data-search-suggestion="pintura">Pintura</button></div><input data-search-input placeholder="Busque por obra, artista, certificado, empresa, fotografia..." autocomplete="off" /><div class="search-results" data-search-results></div><div class="page-actions"><a class="cta secondary" href="encontrar-arte.html">Não sei o que buscar, me guie pela curadoria</a></div></div>`;
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

function openSearch() { const overlay = document.querySelector('[data-search-overlay]'); if (!overlay) return; overlay.hidden = false; renderSearchResults(''); setTimeout(() => overlay.querySelector('[data-search-input]')?.focus(), 30); }
function closeSearch() { const overlay = document.querySelector('[data-search-overlay]'); if (overlay) overlay.hidden = true; }

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
  button.addEventListener('click', () => { const open = panel.hidden; panel.hidden = !open; button.setAttribute('aria-expanded', String(open)); });
  panel.addEventListener('click', (event) => { if (event.target.closest('a') || event.target.closest('[data-search-open]')) { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); } });
  headerInner.appendChild(button);
  document.querySelector('.site-header, .header')?.appendChild(panel);
}

document.addEventListener('click', (event) => {
  const suggestion = event.target.closest('[data-search-suggestion]');
  if (suggestion) {
    event.preventDefault();
    const input = document.querySelector('[data-search-input]');
    if (input) input.value = suggestion.dataset.searchSuggestion;
    renderSearchResults(suggestion.dataset.searchSuggestion);
  }
  if (event.target.closest('[data-search-open]')) { event.preventDefault(); openSearch(); }
  if (event.target.closest('[data-search-close]') || event.target.matches('[data-search-overlay]')) { event.preventDefault(); closeSearch(); }
});

document.addEventListener('input', (event) => { if (event.target.matches('[data-search-input]')) renderSearchResults(event.target.value); });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSearch(); if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openSearch(); } });
document.addEventListener('DOMContentLoaded', () => { applyPageIdentity(); markActiveLinks(); addSelectionCounter(); setupSearch(); setupMobileMenu(); });

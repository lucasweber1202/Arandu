/* Arandu — fechamento visual para versão de apresentação */
(function () {
  const INTERNAL_PAGE_PATTERNS = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const currentPage = () => window.location.pathname.split('/').pop() || 'index.html';
  if (INTERNAL_PAGE_PATTERNS.test(currentPage()) || document.body.dataset.finalPolish === 'true') return;
  document.body.dataset.finalPolish = 'true';

  const page = currentPage();
  const params = new URLSearchParams(location.search);
  const isPresentation = params.has('apresentacao') || params.has('demo') || params.has('present');

  function toast(message) {
    const existing = document.querySelector('.arandu-toast');
    if (existing) {
      existing.textContent = message;
      existing.classList.add('show');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => existing.classList.remove('show'), 2200);
    }
  }

  function buildActionBar() {
    if (document.querySelector('.final-action-bar')) return;
    const bar = document.createElement('aside');
    bar.className = 'final-action-bar';
    bar.setAttribute('aria-label', 'Ações principais da página');

    let title = 'Próximo passo';
    let primary = ['Ver acervo', 'comprar-arte.html'];
    let secondary = ['Falar com assistente', '#assistente'];

    if (page === 'obra.html') {
      title = 'Gostou desta obra?';
      primary = ['Reservar obra', '#reservar'];
      secondary = ['Salvar seleção', '#salvar'];
    } else if (page === 'empresas.html') {
      title = 'Projeto para ambiente';
      primary = ['Solicitar curadoria', 'contato.html'];
      secondary = ['Ver obras', 'obras.html'];
    } else if (page === 'para-artistas.html') {
      title = 'Submeta seu portfólio';
      primary = ['Enviar interesse', 'contato.html'];
      secondary = ['Critérios', 'confianca.html'];
    } else if (page === 'comprar-arte.html' || page === 'obras.html' || page === 'acervo.html') {
      title = 'Escolha com contexto';
      primary = ['Ver seleção', 'minha-selecao.html'];
      secondary = ['Me orientar', '#assistente'];
    }

    bar.innerHTML = `<strong>${title}</strong><a class="primary" href="${primary[1]}">${primary[0]}</a><a class="secondary" href="${secondary[1]}">${secondary[0]}</a><button class="close" type="button" aria-label="Ocultar ações">×</button>`;
    document.body.appendChild(bar);

    bar.addEventListener('click', (event) => {
      if (event.target.closest('.close')) {
        bar.classList.remove('is-visible');
        sessionStorage.setItem('arandu-final-bar-closed', '1');
      }
      if (event.target.closest('a[href="#assistente"]')) {
        event.preventDefault();
        document.querySelector('[data-assistant-open]')?.click();
      }
      if (event.target.closest('a[href="#reservar"]')) {
        event.preventDefault();
        document.querySelector('[data-reserve-artwork]')?.click();
      }
      if (event.target.closest('a[href="#salvar"]')) {
        event.preventDefault();
        document.querySelector('[data-save-artwork]')?.click();
      }
    });

    const update = () => {
      if (sessionStorage.getItem('arandu-final-bar-closed') === '1') return;
      bar.classList.toggle('is-visible', window.scrollY > 420);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
  }

  function addConfidenceMiniStrip() {
    const buybox = document.querySelector('.artwork-buybox,.premium-buybox');
    if (!buybox || buybox.querySelector('.confidence-mini-strip')) return;
    const strip = document.createElement('div');
    strip.className = 'confidence-mini-strip';
    strip.innerHTML = '<span>Autoria verificada</span><span>Certificado e registro</span><span>Reserva acompanhada</span>';
    const price = buybox.querySelector('.price-line');
    if (price) price.insertAdjacentElement('afterend', strip);
  }

  function addCopyNotes() {
    document.querySelectorAll('.artwork-buybox,.premium-buybox,.collector-guidance,.brand-statement').forEach((box) => {
      if (box.querySelector('.final-copy-note')) return;
      const note = document.createElement('span');
      note.className = 'final-copy-note';
      note.textContent = box.matches('.artwork-buybox,.premium-buybox') ? 'Compra com confirmação de disponibilidade' : 'Fluxo guiado e documentação clara';
      box.appendChild(note);
    });
  }

  function addSectionEndCtas() {
    document.querySelectorAll('.works-section,.artists-section,.ecosystem-section').forEach((section) => {
      if (section.querySelector('.section-end-cta')) return;
      const cta = document.createElement('div');
      cta.className = 'section-end-cta';
      cta.innerHTML = '<div><strong>Quer seguir por esse caminho?</strong><span>Continue pelo acervo ou peça orientação para encontrar uma obra adequada.</span></div><a href="comprar-arte.html">Continuar pelo acervo</a>';
      section.querySelector('.container')?.appendChild(cta);
    });
  }

  function createPresentationRoutePanel() {
    if (!isPresentation || document.querySelector('.final-route-panel')) return;
    document.body.classList.add('presentation-clean');
    const badge = document.createElement('div');
    badge.className = 'demo-mode-badge';
    badge.textContent = 'Modo apresentação';
    document.body.appendChild(badge);

    const panel = document.createElement('aside');
    panel.className = 'final-route-panel is-open';
    panel.innerHTML = `
      <header><strong>Roteiro sugerido</strong><button type="button" aria-label="Fechar roteiro">×</button></header>
      <ol>
        <li><strong>1. Comece pela home</strong>Mostre a entrada pela obra, o caminho do usuário e a identidade visual.</li>
        <li><strong>2. Abra uma obra</strong>Mostre imagem, preço, ficha técnica, leitura curatorial e certificado.</li>
        <li><strong>3. Salve na seleção</strong>Mostre que o usuário pode comparar e decidir com calma.</li>
        <li><strong>4. Reserve ou fale com curadoria</strong>Feche no atendimento acompanhado, sem compra fria.</li>
      </ol>`;
    document.body.appendChild(panel);
    panel.querySelector('button').addEventListener('click', () => panel.classList.remove('is-open'));
  }

  function highlightDemoElements() {
    if (!isPresentation) return;
    const targets = ['.immersive-hero .cta', '.journey-card', '.showcase-card', '.artwork-reading', '.price-line'];
    let index = 0;
    const cycle = () => {
      document.querySelectorAll('.demo-highlight').forEach((el) => el.classList.remove('demo-highlight'));
      const element = document.querySelector(targets[index]);
      if (element) element.classList.add('demo-highlight');
      index = (index + 1) % targets.length;
    };
    cycle();
    setInterval(cycle, 5200);
  }

  function refineEmptyStates() {
    document.querySelectorAll('.empty-state,.recommendation-box:empty').forEach((empty) => {
      if (empty.classList.contains('final-empty')) return;
      empty.classList.add('final-empty');
      if (!empty.textContent.trim()) empty.innerHTML = '<strong>Nenhum item por enquanto.</strong>Continue navegando pelo acervo ou fale com a curadoria para receber orientação.';
    });
  }

  function improveChipRows() {
    document.querySelectorAll('.reading-tags,.hero-route-pills,.filter-chip-row').forEach((row) => {
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', row.getAttribute('aria-label') || 'Lista de opções rolável');
    });
  }

  function improveMobileKeyboard() {
    const dock = document.querySelector('.arandu-mobile-dock');
    if (!dock) return;
    document.addEventListener('focusin', (event) => {
      if (/input|textarea|select/i.test(event.target.tagName)) dock.hidden = true;
    });
    document.addEventListener('focusout', () => setTimeout(() => { dock.hidden = false; }, 120));
  }

  function setupFinalShortcuts() {
    document.addEventListener('keydown', (event) => {
      if (/input|textarea|select/i.test(document.activeElement.tagName)) return;
      if (event.key.toLowerCase() === 'a') {
        document.querySelector('[data-assistant-open]')?.click();
        toast('Assistente aberto.');
      }
      if (event.key.toLowerCase() === 's') {
        document.querySelector('[data-save-artwork]')?.click();
      }
      if (event.key.toLowerCase() === 'r') {
        document.querySelector('[data-reserve-artwork]')?.click();
      }
    });
  }

  function finalImageFallbacks() {
    document.querySelectorAll('.thumb,.artwork-image,[class*="thumb-"]').forEach((thumb) => {
      if (thumb.dataset.finalReady) return;
      thumb.dataset.finalReady = 'true';
      thumb.setAttribute('role', thumb.getAttribute('role') || 'img');
      thumb.setAttribute('aria-label', thumb.getAttribute('aria-label') || 'Representação visual da obra');
    });
  }

  function markPrimaryFlow() {
    document.querySelectorAll('.cta,.button').forEach((button) => {
      if (!button.textContent.trim()) return;
      const text = button.textContent.toLowerCase();
      if (/comprar|reservar|acervo|curadoria|seleção|selecao/.test(text)) button.dataset.primaryFlow = 'true';
    });
  }

  function init() {
    buildActionBar();
    addConfidenceMiniStrip();
    addCopyNotes();
    addSectionEndCtas();
    createPresentationRoutePanel();
    highlightDemoElements();
    refineEmptyStates();
    improveChipRows();
    improveMobileKeyboard();
    setupFinalShortcuts();
    finalImageFallbacks();
    markPrimaryFlow();
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    setTimeout(init, 500);
    setTimeout(init, 1500);
  });
})();

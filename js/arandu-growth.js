/* Arandu — crescimento, conversão e mídia premium */
(function () {
  const INTERNAL_PAGE_PATTERNS = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const currentPage = () => window.location.pathname.split('/').pop() || 'index.html';
  if (INTERNAL_PAGE_PATTERNS.test(currentPage()) || document.body.dataset.growthLayer === 'true') return;
  document.body.dataset.growthLayer = 'true';

  const page = currentPage();
  const params = new URLSearchParams(location.search);
  const source = params.get('utm_source') || params.get('ref') || localStorage.getItem('arandu-source') || 'direto';
  localStorage.setItem('arandu-source', source);

  const events = [];
  function track(name, detail) {
    const event = { name, detail: detail || {}, page, source, at: new Date().toISOString() };
    events.push(event);
    try {
      const saved = JSON.parse(localStorage.getItem('arandu-growth-events') || '[]').slice(-80);
      saved.push(event);
      localStorage.setItem('arandu-growth-events', JSON.stringify(saved));
      if (window.dataLayer) window.dataLayer.push({ event: name, ...event.detail, page, source });
    } catch (_) {}
  }

  function toast(message) {
    const existing = document.querySelector('.arandu-toast');
    if (existing) {
      existing.textContent = message;
      existing.classList.add('show');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => existing.classList.remove('show'), 2300);
    }
  }

  function setupVariant() {
    let variant = localStorage.getItem('arandu-growth-variant');
    if (!variant) {
      variant = Math.random() > 0.5 ? 'warm' : 'direct';
      localStorage.setItem('arandu-growth-variant', variant);
    }
    document.body.dataset.growthVariant = variant;
    track('growth_variant_loaded', { variant });
  }

  function createAdSlot(zone, title, text, href) {
    const slot = document.createElement('aside');
    slot.className = 'arandu-ad-slot';
    slot.dataset.adZone = zone;
    slot.innerHTML = `<div class="arandu-ad-inner"><div><span class="arandu-ad-label">Espaço patrocinado</span><strong>${title}</strong><p>${text}</p></div><a href="${href}">Conhecer</a></div>`;
    slot.addEventListener('click', () => track('ad_slot_click', { zone, title }));
    return slot;
  }

  function injectAdPlacements() {
    if (document.querySelector('[data-ad-zone="home-mid"]')) return;
    const homeTarget = document.querySelector('.works-section .container, .path-section .container, main .container');
    if (homeTarget) {
      const ad = createAdSlot('home-mid', 'Projetos de arte para ambientes com presença', 'Área reservada para parceiros de arquitetura, molduraria, iluminação, transporte especializado ou seguros de obra.', 'empresas.html');
      homeTarget.appendChild(ad);
    }

    const afterReading = document.querySelector('.artwork-reading') || document.querySelector('.collector-guidance');
    if (afterReading && !document.querySelector('[data-ad-zone="artwork-context"]')) {
      afterReading.insertAdjacentElement('afterend', createAdSlot('artwork-context', 'Serviços para instalação e conservação', 'Placement premium para parceiros ligados à instalação, moldura, conservação e transporte de obras.', 'contato.html'));
    }

    const footer = document.querySelector('.site-footer');
    if (footer && !document.querySelector('.arandu-sponsored-grid')) {
      const grid = document.createElement('section');
      grid.className = 'clean-section';
      grid.innerHTML = `<div class="container"><p class="eyebrow">Mídia e parcerias</p><h2 class="section-title">Espaços comerciais sem quebrar a experiência premium.</h2><div class="arandu-sponsored-grid"><article class="arandu-sponsored-card"><small>Arquitetura</small><strong>Projetos com arte</strong><p>Placement para escritórios, arquitetos e interiores.</p></article><article class="arandu-sponsored-card"><small>Serviços</small><strong>Transporte e conservação</strong><p>Parcerias para entrega, seguro e instalação.</p></article><article class="arandu-sponsored-card"><small>Marcas</small><strong>Conteúdo patrocinado</strong><p>Espaço nativo para marcas alinhadas à arte brasileira.</p></article></div></div>`;
      footer.parentNode.insertBefore(grid, footer);
    }
  }

  function personalizedCopy(intent) {
    const map = {
      casa: ['Uma obra para transformar sua casa', 'Comece por peças com boa presença de parede, leitura clara e compra acompanhada pela curadoria.', 'Ver obras para casa'],
      empresa: ['Arte para receber clientes e contar uma história', 'Monte um acervo para escritório, clínica, hotel ou recepção com orientação curatorial.', 'Ver projetos para empresas'],
      artista: ['Seu portfólio pode entrar com contexto', 'Entenda critérios, documentação e como a Arandu acompanha a trajetória do artista.', 'Enviar portfólio'],
      colecao: ['Construa uma coleção com coerência', 'Compare obras, salve escolhas e avance com curadoria antes de comprar.', 'Montar seleção']
    };
    return map[intent] || ['Encontre arte brasileira com contexto', 'Escolha por obra, artista, ambiente e documentação, sem compra fria.', 'Começar pelo acervo'];
  }

  function injectPersonalizedCTA() {
    if (document.querySelector('.growth-personalized-cta')) return;
    const intent = localStorage.getItem('arandu-intent') || 'colecao';
    const [title, text, button] = personalizedCopy(intent);
    const href = intent === 'empresa' ? 'empresas.html' : intent === 'artista' ? 'para-artistas.html' : 'comprar-arte.html';
    const block = document.createElement('section');
    block.className = 'clean-section';
    block.innerHTML = `<div class="container"><div class="growth-personalized-cta"><strong>${title}</strong><p>${text}</p><div class="growth-actions"><a class="primary" href="${href}">${button}</a><button class="secondary" type="button" data-growth-intent-open>Escolher outro caminho</button></div></div></div>`;
    const target = document.querySelector('main section:nth-of-type(2)') || document.querySelector('main section');
    if (target) target.insertAdjacentElement('afterend', block);
  }

  function buildIntentPanel() {
    if (document.querySelector('.growth-intent-panel')) return;
    const panel = document.createElement('aside');
    panel.className = 'growth-intent-panel';
    panel.innerHTML = `<header><strong>Qual é seu objetivo?</strong><button type="button" aria-label="Fechar">×</button></header><div class="growth-intent-body"><button class="growth-intent-option" data-intent="casa"><strong>Comprar para casa</strong><span>Obras para parede principal, sala, quarto ou coleção pessoal.</span></button><button class="growth-intent-option" data-intent="empresa"><strong>Projeto para empresa</strong><span>Curadoria para recepção, escritório, clínica, hotel ou restaurante.</span></button><button class="growth-intent-option" data-intent="colecao"><strong>Montar coleção</strong><span>Salvar obras, comparar e avançar com orientação.</span></button><button class="growth-intent-option" data-intent="artista"><strong>Sou artista</strong><span>Entender submissão, documentação e publicação.</span></button></div>`;
    document.body.appendChild(panel);
    panel.querySelector('header button').addEventListener('click', () => panel.classList.remove('is-open'));
    panel.querySelectorAll('[data-intent]').forEach((button) => {
      button.addEventListener('click', () => {
        const intent = button.dataset.intent;
        localStorage.setItem('arandu-intent', intent);
        track('intent_selected', { intent });
        toast('Caminho ajustado para você.');
        panel.classList.remove('is-open');
        setTimeout(() => location.reload(), 300);
      });
    });
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-growth-intent-open]')) panel.classList.add('is-open');
    });
  }

  function maybePromptIntent() {
    if (localStorage.getItem('arandu-intent') || sessionStorage.getItem('arandu-intent-asked')) return;
    sessionStorage.setItem('arandu-intent-asked', '1');
    setTimeout(() => document.querySelector('.growth-intent-panel')?.classList.add('is-open'), 5500);
  }

  function addLeadCard() {
    if (document.querySelector('.growth-lead-card')) return;
    const target = document.querySelector('.collector-guidance .container, .ecosystem-section .container, .site-footer') || document.querySelector('main .container');
    if (!target) return;
    const card = document.createElement('div');
    card.className = 'growth-lead-card';
    card.innerHTML = `<strong>Receba uma orientação curatorial</strong><p>Informe seu perfil e a Arandu monta um caminho inicial de compra, projeto ou submissão.</p><div class="growth-lead-fields"><input data-growth-name placeholder="Nome" aria-label="Nome"><select data-growth-profile aria-label="Perfil"><option value="comprador">Comprador</option><option value="empresa">Empresa</option><option value="artista">Artista</option><option value="arquiteto">Arquiteto</option></select><button type="button" data-growth-lead>Gerar contato</button></div>`;
    if (target.classList.contains('site-footer')) target.parentNode.insertBefore(card, target); else target.appendChild(card);
    card.querySelector('[data-growth-lead]').addEventListener('click', () => {
      const name = card.querySelector('[data-growth-name]').value || 'Interessado';
      const profile = card.querySelector('[data-growth-profile]').value;
      localStorage.setItem('arandu-lead-profile', JSON.stringify({ name, profile, at: new Date().toISOString() }));
      track('lead_generated', { profile });
      toast('Contato preparado. Abra a página de contato para enviar.');
      setTimeout(() => { window.location.href = 'contato.html?perfil=' + encodeURIComponent(profile) + '&nome=' + encodeURIComponent(name); }, 700);
    });
  }

  function addSocialProof() {
    if (document.querySelector('.growth-proof')) return;
    const proof = document.createElement('div');
    proof.className = 'growth-proof';
    proof.innerHTML = '<strong>Interesse recente</strong><span>Alguém acabou de salvar uma obra para receber orientação curatorial.</span>';
    document.body.appendChild(proof);
    const messages = [
      'Um visitante abriu a leitura curatorial de uma obra.',
      'Uma obra foi adicionada à seleção para comparação.',
      'Alguém iniciou um projeto para ambiente corporativo.',
      'Um artista acessou os critérios de submissão.'
    ];
    let index = 0;
    setInterval(() => {
      proof.querySelector('span').textContent = messages[index % messages.length];
      proof.classList.add('is-visible');
      setTimeout(() => proof.classList.remove('is-visible'), 4200);
      index += 1;
    }, 18000);
  }

  function addArtworkUrgency() {
    const buybox = document.querySelector('.artwork-buybox,.premium-buybox');
    if (!buybox || buybox.querySelector('.growth-urgency')) return;
    const urgency = document.createElement('div');
    urgency.className = 'growth-urgency';
    urgency.textContent = 'Obra sujeita à confirmação de disponibilidade antes da reserva.';
    const price = buybox.querySelector('.price-line') || buybox.querySelector('.lead');
    if (price) price.insertAdjacentElement('afterend', urgency);
  }

  function buildQuizLauncher() {
    if (document.querySelector('.growth-quiz-launch')) return;
    const button = document.createElement('button');
    button.className = 'growth-quiz-launch';
    button.type = 'button';
    button.textContent = 'Encontrar obra ideal';
    button.addEventListener('click', () => {
      track('quiz_opened');
      document.querySelector('.growth-intent-panel')?.classList.add('is-open');
    });
    document.body.appendChild(button);
  }

  function setupExitCapture() {
    if (document.querySelector('.growth-exit-card')) return;
    const overlay = document.createElement('div');
    overlay.className = 'growth-exit-card';
    overlay.hidden = true;
    overlay.innerHTML = `<div class="growth-exit-box"><h2>Antes de sair, salve seu caminho.</h2><p>A Arandu pode organizar uma seleção por ambiente, orçamento e técnica para você decidir com mais calma.</p><div class="growth-exit-actions"><a href="comprar-arte.html">Continuar vendo obras</a><button type="button">Fechar</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('button').addEventListener('click', () => { overlay.hidden = true; sessionStorage.setItem('arandu-exit-closed', '1'); });
    document.addEventListener('mouseleave', (event) => {
      if (event.clientY > 12 || sessionStorage.getItem('arandu-exit-closed') || localStorage.getItem('arandu-intent')) return;
      overlay.hidden = false;
      track('exit_capture_shown');
      sessionStorage.setItem('arandu-exit-closed', '1');
    });
  }

  function trackCoreActions() {
    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (link) track('link_click', { text: link.textContent.trim().slice(0, 80), href: link.getAttribute('href') });
      if (event.target.closest('[data-save-artwork]')) track('artwork_saved');
      if (event.target.closest('[data-reserve-artwork]')) track('reserve_started');
      if (event.target.closest('[data-assistant-open]')) track('assistant_opened');
      if (event.target.closest('[data-primary-flow]')) track('primary_cta_click', { text: event.target.textContent.trim().slice(0, 80) });
    });
  }

  function addDebugMarker() {
    if (!params.has('debugGrowth') || document.querySelector('.growth-funnel-debug')) return;
    const marker = document.createElement('div');
    marker.className = 'growth-funnel-debug';
    marker.textContent = 'growth:on · source:' + source;
    document.body.appendChild(marker);
  }

  function init() {
    setupVariant();
    injectAdPlacements();
    buildIntentPanel();
    injectPersonalizedCTA();
    maybePromptIntent();
    addLeadCard();
    addSocialProof();
    addArtworkUrgency();
    buildQuizLauncher();
    setupExitCapture();
    trackCoreActions();
    addDebugMarker();
    track('page_view');
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    setTimeout(() => { injectAdPlacements(); addArtworkUrgency(); }, 800);
  });
})();

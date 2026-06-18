/* Arandu — camada de comércio, monetização e conversão */
(function () {
  const INTERNAL_PAGE_PATTERNS = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const currentPage = () => window.location.pathname.split('/').pop() || 'index.html';
  if (INTERNAL_PAGE_PATTERNS.test(currentPage()) || document.body.dataset.commerceLayer === 'true') return;
  document.body.dataset.commerceLayer = 'true';

  const page = currentPage();
  const savedKey = 'arandu-commerce-compare';
  const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

  function getSaved() {
    try { return JSON.parse(localStorage.getItem(savedKey) || '[]'); } catch (_) { return []; }
  }
  function setSaved(items) {
    localStorage.setItem(savedKey, JSON.stringify(items.slice(0, 3)));
  }
  function track(name, detail) {
    try {
      const list = JSON.parse(localStorage.getItem('arandu-commerce-events') || '[]').slice(-70);
      list.push({ name, detail: detail || {}, page, at: new Date().toISOString() });
      localStorage.setItem('arandu-commerce-events', JSON.stringify(list));
    } catch (_) {}
  }
  function toast(message) {
    const existing = document.querySelector('.arandu-toast');
    if (existing) {
      existing.textContent = message;
      existing.classList.add('show');
      clearTimeout(toast.timer);
      toast.timer = setTimeout(() => existing.classList.remove('show'), 2200);
    }
  }

  function buildCompareTray() {
    if (document.querySelector('.commerce-compare-tray')) return;
    const tray = document.createElement('aside');
    tray.className = 'commerce-compare-tray';
    tray.setAttribute('aria-label', 'Comparador de obras');
    tray.innerHTML = '<div class="commerce-compare-head"><strong>Comparar seleção</strong><button type="button" data-commerce-clear>Limpar</button></div><div class="commerce-compare-items"></div><div class="commerce-compare-actions"><a href="minha-selecao.html">Abrir seleção</a><button type="button" data-commerce-inquiry>Receber orientação</button></div>';
    document.body.appendChild(tray);
    tray.querySelector('[data-commerce-clear]').addEventListener('click', () => { setSaved([]); renderCompareTray(); toast('Comparador limpo.'); });
    tray.querySelector('[data-commerce-inquiry]').addEventListener('click', () => {
      track('compare_inquiry');
      window.location.href = 'contato.html?origem=comparador';
    });
  }

  function renderCompareTray() {
    const tray = document.querySelector('.commerce-compare-tray');
    if (!tray) return;
    const items = getSaved();
    tray.classList.toggle('is-visible', items.length > 0);
    tray.querySelector('.commerce-compare-items').innerHTML = [0, 1, 2].map((index) => {
      const item = items[index];
      if (!item) return '<div class="commerce-compare-item"><small>Vazio</small><strong>Salve uma obra</strong></div>';
      return `<div class="commerce-compare-item"><small>${escapeHtml(item.artist || 'Artista')}</small><strong>${escapeHtml(item.title || 'Obra selecionada')}</strong><span>${escapeHtml(item.price || item.priceLabel || 'sob consulta')}</span></div>`;
    }).join('');
  }

  function interceptSaveButtons() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-save-artwork]');
      if (!button) return;
      const item = {
        id: button.getAttribute('data-save-artwork') || location.href,
        title: button.getAttribute('data-artwork-title') || document.querySelector('h1,.title')?.textContent?.trim() || 'Obra Arandu',
        artist: button.getAttribute('data-artwork-artist') || 'Artista Arandu',
        price: button.getAttribute('data-artwork-price-label') || button.getAttribute('data-artwork-price') || 'sob consulta'
      };
      const current = getSaved().filter((existing) => existing.id !== item.id);
      current.unshift(item);
      setSaved(current);
      renderCompareTray();
      track('compare_item_added', { id: item.id });
    });
  }

  function addReserveFlow() {
    const buybox = document.querySelector('.artwork-buybox,.premium-buybox');
    if (!buybox || buybox.querySelector('.commerce-reserve-flow')) return;
    const flow = document.createElement('div');
    flow.className = 'commerce-reserve-flow';
    flow.innerHTML = '<strong>Como a reserva funciona</strong><ol><li>Você sinaliza interesse sem compra automática.</li><li>A curadoria confirma disponibilidade, condição e prazo.</li><li>Depois vem pagamento, documentação e envio.</li></ol>';
    buybox.appendChild(flow);
  }

  function addPriceAnchors() {
    const target = document.querySelector('.growth-personalized-cta,.brand-statement .container,.path-section .container');
    if (!target || document.querySelector('.commerce-price-anchor')) return;
    const row = document.createElement('div');
    row.className = 'commerce-price-anchor';
    row.innerHTML = '<button type="button" data-price-intent="entrada"><strong>Até R$ 3 mil</strong><span>Primeira obra ou presente</span></button><button type="button" data-price-intent="medio"><strong>R$ 3 a 10 mil</strong><span>Peças com presença</span></button><button type="button" data-price-intent="projeto"><strong>Projeto sob medida</strong><span>Empresa ou coleção</span></button>';
    target.appendChild(row);
    row.querySelectorAll('[data-price-intent]').forEach((button) => {
      button.addEventListener('click', () => {
        localStorage.setItem('arandu-price-intent', button.dataset.priceIntent);
        toast('Faixa de interesse salva.');
        track('price_intent_selected', { value: button.dataset.priceIntent });
      });
    });
  }

  function addMediaKit() {
    if (document.querySelector('.commerce-media-kit')) return;
    const footer = document.querySelector('.site-footer');
    if (!footer) return;
    const section = document.createElement('section');
    section.className = 'clean-section commerce-media-kit-section';
    section.innerHTML = `<div class="container"><div class="commerce-media-kit"><div class="commerce-media-kit-inner"><div><span class="commerce-partner-badge">Mídia premium</span><h2>Parcerias comerciais com contexto.</h2><p>A Arandu pode receber marcas e serviços alinhados à compra de arte sem parecer um banner genérico.</p><ul><li>Placements para arquitetura, interiores e decoração.</li><li>Serviços de moldura, transporte, seguro e conservação.</li><li>Conteúdo patrocinado com linguagem editorial.</li></ul></div><div class="commerce-media-card"><strong>Mídia kit Arandu</strong><span>Ideal para parceiros que querem aparecer no momento de decisão de compra.</span><a href="contato.html?assunto=midia-kit">Solicitar mídia kit</a></div></div></div><div class="commerce-ad-map"><article><small>Home</small><strong>Entrada de marca</strong><span>Topo/meio da jornada.</span></article><article><small>Obra</small><strong>Serviço contextual</strong><span>Instalação, moldura, seguro.</span></article><article><small>Empresas</small><strong>Arquitetura</strong><span>Projetos e ambientes.</span></article><article><small>Narrativa</small><strong>Conteúdo nativo</strong><span>Editorial patrocinado.</span></article></div></div>`;
    footer.parentNode.insertBefore(section, footer);
  }

  function addRecommendations() {
    if (document.querySelector('.commerce-reco-strip')) return;
    const target = document.querySelector('.artwork-reading,.showcase-grid,.clean-grid,.growth-personalized-cta');
    if (!target) return;
    let title = 'Continue por obras com contexto';
    let text = 'Salve obras, compare técnica/preço e avance com a curadoria antes de reservar.';
    let href = 'obras.html';
    if (page === 'obra.html') { title = 'Compare antes de decidir'; text = 'Abra outras obras próximas em técnica, presença ou faixa de preço antes de reservar.'; href = 'obras.html'; }
    if (page === 'empresas.html') { title = 'Transforme isso em projeto'; text = 'A curadoria pode montar uma seleção para recepção, escritório, clínica, hotel ou restaurante.'; href = 'contato.html?origem=empresa'; }
    const block = document.createElement('div');
    block.className = 'commerce-reco-strip';
    block.innerHTML = `<h3>${title}</h3><p>${text}</p><div class="commerce-reco-actions"><a href="${href}">Ver próximo passo</a><button type="button" data-assistant-open>Falar com assistente</button></div>`;
    target.insertAdjacentElement('afterend', block);
  }

  function addStickyInquiry() {
    if (document.querySelector('.commerce-sticky-inquiry')) return;
    const box = document.createElement('div');
    box.className = 'commerce-sticky-inquiry';
    box.innerHTML = '<button class="primary" type="button" data-commerce-main-inquiry>Receber curadoria</button><button type="button" data-commerce-media-kit>Mídia kit</button>';
    document.body.appendChild(box);
    box.querySelector('[data-commerce-main-inquiry]').addEventListener('click', () => {
      track('sticky_inquiry_click');
      window.location.href = 'contato.html?origem=sticky-curadoria';
    });
    box.querySelector('[data-commerce-media-kit]').addEventListener('click', () => {
      track('media_kit_click');
      window.location.href = 'contato.html?assunto=midia-kit';
    });
  }

  function addSoftPremium() {
    if (document.querySelector('.commerce-paywall-soft')) return;
    const narrative = document.querySelector('.narrativa-page main .container,.narrativa main .container,.site-footer');
    if (!narrative) return;
    const box = document.createElement('div');
    box.className = 'commerce-paywall-soft';
    box.innerHTML = '<strong>Conteúdo curatorial sob medida</strong><p>Para colecionadores, empresas e arquitetos, a Arandu pode preparar recortes por ambiente, orçamento e linguagem.</p><a href="contato.html?assunto=curadoria-sob-medida">Pedir recorte curatorial</a>';
    if (narrative.classList.contains('site-footer')) narrative.parentNode.insertBefore(box, narrative); else narrative.appendChild(box);
  }

  function addMetricPills() {
    const buybox = document.querySelector('.artwork-buybox,.premium-buybox');
    if (!buybox || buybox.querySelector('.commerce-metric-pill')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = '<span class="commerce-metric-pill">Compra acompanhada</span><span class="commerce-metric-pill">Documentação preservada</span><span class="commerce-metric-pill">Envio combinado</span>';
    buybox.appendChild(wrap);
  }

  function init() {
    buildCompareTray();
    renderCompareTray();
    interceptSaveButtons();
    addReserveFlow();
    addPriceAnchors();
    addMediaKit();
    addRecommendations();
    addStickyInquiry();
    addSoftPremium();
    addMetricPills();
    track('commerce_layer_loaded');
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    setTimeout(() => { addReserveFlow(); addMetricPills(); renderCompareTray(); }, 900);
  });
})();

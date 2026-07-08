/* Arandu — assistente virtual global */
(function () {
  const INTERNAL_PAGE_PATTERNS = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const currentPage = () => window.location.pathname.split('/').pop() || 'index.html';

  if (INTERNAL_PAGE_PATTERNS.test(currentPage()) || document.querySelector('[data-arandu-assistant]')) return;

  const CORE_STYLE_ID = 'arandu-assistant-core-css';

  function injectCoreCss() {
    if (document.getElementById(CORE_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = CORE_STYLE_ID;
    style.textContent = `
      .arandu-assistant { position: fixed !important; right: 22px !important; bottom: 22px !important; z-index: 99999 !important; font-family: Arial, sans-serif !important; color: #180f0c !important; }
      .arandu-assistant *, .arandu-assistant *::before, .arandu-assistant *::after { box-sizing: border-box !important; }
      .arandu-assistant .assistant-toggle { border: 0 !important; border-radius: 999px !important; padding: 14px 18px !important; background: linear-gradient(135deg, #3e100d, #9f2f24, #c4492e) !important; color: #fff1dc !important; font-weight: 900 !important; box-shadow: 0 18px 50px rgba(62, 16, 13, .34) !important; cursor: pointer !important; font-size: 14px !important; line-height: 1 !important; }
      .arandu-assistant .assistant-toggle:hover { transform: translateY(-2px) !important; }
      .arandu-assistant .assistant-panel { position: absolute !important; right: 0 !important; bottom: 62px !important; width: min(390px, calc(100vw - 32px)) !important; max-height: min(680px, calc(100vh - 110px)) !important; background: #fff1dc !important; border: 1px solid rgba(62, 16, 13, .34) !important; border-radius: 28px !important; box-shadow: 0 28px 90px rgba(20, 13, 10, .32) !important; overflow: hidden !important; }
      .arandu-assistant .assistant-panel[hidden] { display: none !important; }
      .arandu-assistant .assistant-panel header { display: flex !important; justify-content: space-between !important; align-items: center !important; gap: 12px !important; padding: 18px 18px 12px !important; background: linear-gradient(135deg, #3e100d, #9f2f24) !important; color: #fff1dc !important; }
      .arandu-assistant .assistant-panel header strong { display: block !important; font-family: Georgia, serif !important; font-size: 21px !important; color: #fff1dc !important; }
      .arandu-assistant .assistant-panel header small { display: block !important; margin-top: 3px !important; color: rgba(255, 241, 220, .78) !important; font-size: 12px !important; line-height: 1.35 !important; }
      .arandu-assistant .assistant-close { width: 32px !important; height: 32px !important; border-radius: 999px !important; border: 1px solid rgba(255, 241, 220, .34) !important; background: transparent !important; color: #fff1dc !important; cursor: pointer !important; font-size: 22px !important; line-height: 1 !important; }
      .arandu-assistant .assistant-messages { display: grid !important; gap: 10px !important; max-height: 310px !important; overflow: auto !important; padding: 16px !important; background: #fff6e9 !important; }
      .arandu-assistant .assistant-message { padding: 12px 14px !important; border-radius: 18px !important; line-height: 1.45 !important; font-size: 14px !important; }
      .arandu-assistant .assistant-message.bot { background: #f2d5af !important; color: #180f0c !important; border: 1px solid rgba(62, 16, 13, .14) !important; }
      .arandu-assistant .assistant-message.user { background: #163c30 !important; color: #fff1dc !important; justify-self: end !important; max-width: 86% !important; }
      .arandu-assistant .assistant-message a { font-weight: 900 !important; color: #3e100d !important; text-decoration: underline !important; text-underline-offset: 3px !important; }
      .arandu-assistant .assistant-quick-actions { display: flex !important; gap: 8px !important; flex-wrap: wrap !important; padding: 0 16px 14px !important; background: #fff6e9 !important; }
      .arandu-assistant .assistant-chip { border: 1px solid rgba(62, 16, 13, .22) !important; background: rgba(255, 241, 220, .88) !important; color: #3e100d !important; border-radius: 999px !important; padding: 8px 10px !important; font-weight: 800 !important; font-size: 12px !important; cursor: pointer !important; }
      .arandu-assistant .assistant-input-row { display: flex !important; gap: 8px !important; padding: 12px 14px 16px !important; border-top: 1px solid rgba(62, 16, 13, .22) !important; background: #fff1dc !important; }
      .arandu-assistant .assistant-input-row input { flex: 1 !important; min-width: 0 !important; border: 1px solid rgba(62, 16, 13, .26) !important; border-radius: 999px !important; padding: 11px 13px !important; background: #fffaf1 !important; color: #180f0c !important; font-size: 14px !important; }
      .arandu-assistant .assistant-input-row button { border: 0 !important; border-radius: 999px !important; padding: 0 14px !important; background: #3e100d !important; color: #fff1dc !important; font-weight: 900 !important; cursor: pointer !important; }
      @media (max-width: 720px) { .arandu-assistant { right: 14px !important; bottom: 14px !important; } .arandu-assistant .assistant-toggle { padding: 12px 14px !important; font-size: 13px !important; } .arandu-assistant .assistant-panel { right: 0 !important; bottom: 56px !important; width: calc(100vw - 28px) !important; max-height: calc(100vh - 92px) !important; } .arandu-assistant .assistant-input-row { flex-direction: column !important; } .arandu-assistant .assistant-input-row button { padding: 11px 14px !important; } }
    `;

    document.head.appendChild(style);
  }

  injectCoreCss();

  const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
  const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const routes = {
    comprar: { label: 'Comprar', text: 'A melhor entrada agora é Comprar: uma grade única com todas as obras, foto, artista e tags rápidas.', links: [['Comprar', 'comprar-arte.html'], ['Pesquisar', 'pesquisa.html'], ['Minha seleção', 'minha-selecao.html']] },
    primeiraObra: { label: 'Primeira obra', text: 'Para primeira compra, comece pela página Comprar e use a busca por técnica, preço, eixo ou edição.', links: [['Comprar', 'comprar-arte.html'], ['Pesquisar', 'pesquisa.html'], ['Confiança', 'confianca.html']] },
    casa: { label: 'Arte para casa', text: 'Para casa ou apartamento, use Comprar para ver todas as obras e Pesquisar para filtrar por sala, parede, fotografia, pintura ou escultura.', links: [['Comprar', 'comprar-arte.html'], ['Pesquisar', 'pesquisa.html'], ['Confiança', 'confianca.html']] },
    empresa: { label: 'Empresa', text: 'Para projetos de empresas e espaços, entre por Pesquisar ou pela conta Empresa. A curadoria pode organizar briefing e proposta.', links: [['Pesquisar', 'pesquisa.html'], ['Entrar', 'login.html'], ['Contato', 'contato.html']] },
    clinica: { label: 'Clínicas e recepções', text: 'Para clínicas e recepções, pesquise por acolhimento, fotografia, pintura, sala de espera ou recepção.', links: [['Pesquisar', 'pesquisa.html'], ['Comprar', 'comprar-arte.html'], ['Confiança', 'confianca.html']] },
    pintura: { label: 'Pintura', text: 'A pintura está dentro de Comprar. Os cards indicam técnica, eixo e tipo de edição.', links: [['Ver pinturas', 'comprar-arte.html'], ['Pesquisar', 'pesquisa.html'], ['Artistas', 'artistas.html']] },
    fotografia: { label: 'Fotografia', text: 'Fotografias aparecem na página Comprar com tag de técnica e edição. Use Pesquisar para afinar a busca.', links: [['Ver fotografias', 'comprar-arte.html'], ['Pesquisar', 'pesquisa.html'], ['Narrativa', 'narrativa.html']] },
    escultura: { label: 'Escultura', text: 'Esculturas e objetos aparecem em Comprar. Clique na obra para ver ficha essencial e reservar com curadoria.', links: [['Ver esculturas', 'comprar-arte.html'], ['Pesquisar', 'pesquisa.html'], ['Confiança', 'confianca.html']] },
    artista: { label: 'Artistas', text: 'A página Artistas mostra foto, nome, origem e quantidade de obras disponíveis. Para submeter portfólio, use a área de artista.', links: [['Artistas', 'artistas.html'], ['Entrar', 'login.html'], ['Para artistas', 'para-artistas.html']] },
    certificado: { label: 'Confiança', text: 'Para certificado, reserva, envio e compra segura, entre em Confiança. A página está mais direta e com depoimentos.', links: [['Confiança', 'confianca.html'], ['Verificar certificado', 'verificar-certificado.html'], ['Comprar', 'comprar-arte.html']] },
    curadoria: { label: 'Ajuda', text: 'Se precisar de ajuda, o caminho mais direto é pesquisar, abrir a obra desejada ou falar com a curadoria.', links: [['Pesquisar', 'pesquisa.html'], ['Comprar', 'comprar-arte.html'], ['Contato', 'contato.html']] },
    narrativa: { label: 'Narrativa', text: 'Narrativa reúne manifestos, estudos, resumos, análises e depoimentos sobre arte no Brasil e no mundo.', links: [['Narrativa', 'narrativa.html'], ['Artistas', 'artistas.html'], ['Comprar', 'comprar-arte.html']] }
  };

  function routeForText(text) {
    const q = normalize(text);
    if (/narrativa|manifesto|estudo|texto|analise|análise|arte no brasil|mundo da arte/.test(q)) return routes.narrativa;
    if (/primeira|iniciante|comecar|começar|ate 3000|ate r\$? ?3|barat|acessivel/.test(q)) return routes.primeiraObra;
    if (/casa|apartamento|sala|parede|decoracao|decoração/.test(q)) return routes.casa;
    if (/clinica|consultorio|recepcao|saude|paciente/.test(q)) return routes.clinica;
    if (/empresa|escritorio|hotel|ambiente|arquiteto|corporativo|briefing/.test(q)) return routes.empresa;
    if (/pintura|tela|oleo|acrilica|acrílica/.test(q)) return routes.pintura;
    if (/fotografia|foto|edicao|edição/.test(q)) return routes.fotografia;
    if (/escultura|objeto|volume|bronze|ceramica|cerâmica/.test(q)) return routes.escultura;
    if (/artista|portfolio|portfólio|submeter|vender|expor|representado|galeria/.test(q)) return routes.artista;
    if (/certificado|autenticidade|seguranca|segurança|procedencia|procedência|reembolso|reserva|confiança|confianca/.test(q)) return routes.certificado;
    if (/curadoria|atendimento|duvida|dúvida|falar|whatsapp|contato|ajuda/.test(q)) return routes.curadoria;
    if (/comprar|preco|preço|obra|acervo|colecionar/.test(q)) return routes.comprar;
    return { label: 'Orientação inicial', text: 'Posso te guiar pelos caminhos principais atuais: Home, Comprar, Artistas, Confiança, Pesquisar, Narrativa ou Entrar.', links: [['Home', 'index.html'], ['Comprar', 'comprar-arte.html'], ['Artistas', 'artistas.html'], ['Pesquisar', 'pesquisa.html'], ['Narrativa', 'narrativa.html']] };
  }

  function renderLinks(links) { return links.map(([label, href]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join(' · '); }

  const root = document.createElement('div');
  root.className = 'arandu-assistant';
  root.dataset.aranduAssistant = 'true';
  root.innerHTML = `
    <button class="assistant-toggle" type="button" aria-expanded="false" aria-controls="arandu-assistant-panel">Assistente Arandu</button>
    <section class="assistant-panel" id="arandu-assistant-panel" aria-label="Assistente virtual Arandu" hidden>
      <header><div><strong>Assistente Arandu</strong><small>Escolha um caminho ou descreva o que procura.</small></div><button class="assistant-close" type="button" aria-label="Fechar assistente">×</button></header>
      <div class="assistant-messages" data-assistant-messages><div class="assistant-message bot">Olá. Posso te levar para as páginas principais atuais: Comprar, Artistas, Confiança, Pesquisar, Narrativa ou Entrar.</div></div>
      <div class="assistant-quick-actions">
        <button class="assistant-chip" type="button" data-assistant-choice="comprar">Comprar</button>
        <button class="assistant-chip" type="button" data-assistant-choice="artista">Artistas</button>
        <button class="assistant-chip" type="button" data-assistant-choice="certificado">Confiança</button>
        <button class="assistant-chip" type="button" data-assistant-choice="narrativa">Narrativa</button>
        <button class="assistant-chip" type="button" data-assistant-choice="empresa">Empresa</button>
      </div>
      <form class="assistant-input-row" data-assistant-form><input type="text" name="message" autocomplete="off" placeholder="Ex.: quero uma pintura até R$ 5 mil" /><button type="submit">Enviar</button></form>
    </section>`;

  document.body.appendChild(root);
  const toggle = root.querySelector('.assistant-toggle');
  const panel = root.querySelector('.assistant-panel');
  const close = root.querySelector('.assistant-close');
  const messages = root.querySelector('[data-assistant-messages]');
  const form = root.querySelector('[data-assistant-form]');

  function setOpen(open) { panel.hidden = !open; root.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); if (open) setTimeout(() => form.querySelector('input')?.focus(), 40); }
  function addMessage(kind, html) { const message = document.createElement('div'); message.className = `assistant-message ${kind}`; message.innerHTML = html; messages.appendChild(message); messages.scrollTop = messages.scrollHeight; }
  function answer(route, userText) { if (userText) addMessage('user', escapeHtml(userText)); addMessage('bot', `${escapeHtml(route.text)}<br>${renderLinks(route.links)}`); }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  root.addEventListener('click', (event) => { const choice = event.target.closest('[data-assistant-choice]'); if (!choice) return; const route = routes[choice.dataset.assistantChoice] || routes.comprar; answer(route, route.label); });
  form.addEventListener('submit', (event) => { event.preventDefault(); const input = form.elements.message; const value = input.value.trim(); if (!value) return; answer(routeForText(value), value); input.value = ''; });
  document.addEventListener('click', (event) => { const opener = event.target.closest('[data-assistant-open]'); if (!opener) return; event.preventDefault(); setOpen(true); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
})();

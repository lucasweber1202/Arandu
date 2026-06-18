/* Arandu — assistente virtual simples */
(function () {
  const INTERNAL_PAGE_PATTERNS = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const currentPage = () => window.location.pathname.split('/').pop() || 'index.html';
  if (INTERNAL_PAGE_PATTERNS.test(currentPage()) || document.querySelector('[data-arandu-assistant]')) return;

  const escapeHtml = (value) => String(value || '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));

  const normalize = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const routes = {
    comprar: {
      label: 'Comprar obra',
      text: 'Para comprar, comece por obras disponíveis e depois salve as favoritas. Você também pode falar com a curadoria antes de reservar.',
      links: [['Comprar arte', 'comprar-arte.html'], ['Explorar obras', 'obras.html'], ['Minha seleção', 'minha-selecao.html']]
    },
    empresa: {
      label: 'Projeto para empresa',
      text: 'Para empresas, o melhor caminho é explicar ambiente, orçamento, tamanho das paredes e intenção do espaço. A Arandu monta uma proposta curatorial.',
      links: [['Empresas', 'empresas.html'], ['Falar com curadoria', 'contato.html']]
    },
    artista: {
      label: 'Sou artista',
      text: 'Para artistas, o fluxo começa pelo portfólio, ficha técnica, imagens, faixa de preço e documentação de autoria.',
      links: [['Submeter portfólio', 'para-artistas.html'], ['Critérios de confiança', 'confianca.html']]
    },
    certificado: {
      label: 'Certificado e segurança',
      text: 'Para verificar confiança, veja certificado, critérios de curadoria, política de compra, reserva e reembolso.',
      links: [['Verificar certificado', 'verificar-certificado.html'], ['Confiança', 'confianca.html'], ['Compra segura', 'compra-reserva-reembolso.html']]
    }
  };

  function routeForText(text) {
    const q = normalize(text);
    if (/empresa|escritorio|hotel|clinica|ambiente|arquiteto|decoracao/.test(q)) return routes.empresa;
    if (/artista|portfolio|submeter|vender|expor|representado/.test(q)) return routes.artista;
    if (/certificado|autenticidade|seguranca|procedencia|reembolso|reserva/.test(q)) return routes.certificado;
    if (/comprar|preco|obra|acervo|pintura|fotografia|escultura|colecionar/.test(q)) return routes.comprar;
    return {
      label: 'Orientação inicial',
      text: 'Posso te guiar por três caminhos: comprar uma obra, montar um projeto/acervo ou submeter portfólio como artista.',
      links: [['Comprar obra', 'comprar-arte.html'], ['Empresas', 'empresas.html'], ['Para artistas', 'para-artistas.html']]
    };
  }

  function renderLinks(links) {
    return links.map(([label, href]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join(' · ');
  }

  const root = document.createElement('div');
  root.className = 'arandu-assistant';
  root.dataset.aranduAssistant = 'true';
  root.innerHTML = `
    <button class="assistant-toggle" type="button" aria-expanded="false">Assistente Arandu</button>
    <section class="assistant-panel" aria-label="Assistente virtual Arandu" hidden>
      <header>
        <div><strong>Assistente Arandu</strong><small>Escolha um caminho ou descreva o que procura.</small></div>
        <button class="assistant-close" type="button" aria-label="Fechar assistente">×</button>
      </header>
      <div class="assistant-messages" data-assistant-messages>
        <div class="assistant-message bot">Olá. Posso te ajudar a encontrar uma obra, entender certificados, montar um projeto para empresa ou enviar portfólio como artista.</div>
      </div>
      <div class="assistant-quick-actions">
        <button class="assistant-chip" type="button" data-assistant-choice="comprar">Comprar obra</button>
        <button class="assistant-chip" type="button" data-assistant-choice="empresa">Projeto para empresa</button>
        <button class="assistant-chip" type="button" data-assistant-choice="artista">Sou artista</button>
        <button class="assistant-chip" type="button" data-assistant-choice="certificado">Certificado</button>
      </div>
      <form class="assistant-input-row" data-assistant-form>
        <input type="text" name="message" autocomplete="off" placeholder="Ex.: quero uma pintura até R$ 5 mil" />
        <button type="submit">Enviar</button>
      </form>
    </section>
  `;

  document.body.appendChild(root);

  const toggle = root.querySelector('.assistant-toggle');
  const panel = root.querySelector('.assistant-panel');
  const close = root.querySelector('.assistant-close');
  const messages = root.querySelector('[data-assistant-messages]');
  const form = root.querySelector('[data-assistant-form]');

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) setTimeout(() => form.querySelector('input')?.focus(), 40);
  }

  function addMessage(kind, html) {
    const message = document.createElement('div');
    message.className = `assistant-message ${kind}`;
    message.innerHTML = html;
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
  }

  function answer(route, userText) {
    if (userText) addMessage('user', escapeHtml(userText));
    addMessage('bot', `${escapeHtml(route.text)}<br>${renderLinks(route.links)}`);
  }

  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));

  root.addEventListener('click', (event) => {
    const choice = event.target.closest('[data-assistant-choice]');
    if (!choice) return;
    const route = routes[choice.dataset.assistantChoice] || routes.comprar;
    answer(route, route.label);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const input = form.elements.message;
    const value = input.value.trim();
    if (!value) return;
    answer(routeForText(value), value);
    input.value = '';
  });

  document.addEventListener('click', (event) => {
    const opener = event.target.closest('[data-assistant-open]');
    if (!opener) return;
    event.preventDefault();
    setOpen(true);
  });
})();

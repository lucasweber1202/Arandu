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
      .arandu-assistant {
        position: fixed !important;
        right: 22px !important;
        bottom: 22px !important;
        z-index: 99999 !important;
        font-family: Arial, sans-serif !important;
        color: #180f0c !important;
      }

      .arandu-assistant *,
      .arandu-assistant *::before,
      .arandu-assistant *::after {
        box-sizing: border-box !important;
      }

      .arandu-assistant .assistant-toggle {
        border: 0 !important;
        border-radius: 999px !important;
        padding: 14px 18px !important;
        background: linear-gradient(135deg, #3e100d, #9f2f24, #c4492e) !important;
        color: #fff1dc !important;
        font-weight: 900 !important;
        box-shadow: 0 18px 50px rgba(62, 16, 13, .34) !important;
        cursor: pointer !important;
        font-size: 14px !important;
        line-height: 1 !important;
      }

      .arandu-assistant .assistant-toggle:hover {
        transform: translateY(-2px) !important;
      }

      .arandu-assistant .assistant-panel {
        position: absolute !important;
        right: 0 !important;
        bottom: 62px !important;
        width: min(390px, calc(100vw - 32px)) !important;
        max-height: min(680px, calc(100vh - 110px)) !important;
        background: #fff1dc !important;
        border: 1px solid rgba(62, 16, 13, .34) !important;
        border-radius: 28px !important;
        box-shadow: 0 28px 90px rgba(20, 13, 10, .32) !important;
        overflow: hidden !important;
      }

      .arandu-assistant .assistant-panel[hidden] {
        display: none !important;
      }

      .arandu-assistant .assistant-panel header {
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        gap: 12px !important;
        padding: 18px 18px 12px !important;
        background: linear-gradient(135deg, #3e100d, #9f2f24) !important;
        color: #fff1dc !important;
      }

      .arandu-assistant .assistant-panel header strong {
        display: block !important;
        font-family: Georgia, serif !important;
        font-size: 21px !important;
        color: #fff1dc !important;
      }

      .arandu-assistant .assistant-panel header small {
        display: block !important;
        margin-top: 3px !important;
        color: rgba(255, 241, 220, .78) !important;
        font-size: 12px !important;
        line-height: 1.35 !important;
      }

      .arandu-assistant .assistant-close {
        width: 32px !important;
        height: 32px !important;
        border-radius: 999px !important;
        border: 1px solid rgba(255, 241, 220, .34) !important;
        background: transparent !important;
        color: #fff1dc !important;
        cursor: pointer !important;
        font-size: 22px !important;
        line-height: 1 !important;
      }

      .arandu-assistant .assistant-messages {
        display: grid !important;
        gap: 10px !important;
        max-height: 310px !important;
        overflow: auto !important;
        padding: 16px !important;
        background: #fff6e9 !important;
      }

      .arandu-assistant .assistant-message {
        padding: 12px 14px !important;
        border-radius: 18px !important;
        line-height: 1.45 !important;
        font-size: 14px !important;
      }

      .arandu-assistant .assistant-message.bot {
        background: #f2d5af !important;
        color: #180f0c !important;
        border: 1px solid rgba(62, 16, 13, .14) !important;
      }

      .arandu-assistant .assistant-message.user {
        background: #163c30 !important;
        color: #fff1dc !important;
        justify-self: end !important;
        max-width: 86% !important;
      }

      .arandu-assistant .assistant-message a {
        font-weight: 900 !important;
        color: #3e100d !important;
        text-decoration: underline !important;
        text-underline-offset: 3px !important;
      }

      .arandu-assistant .assistant-quick-actions {
        display: flex !important;
        gap: 8px !important;
        flex-wrap: wrap !important;
        padding: 0 16px 14px !important;
        background: #fff6e9 !important;
      }

      .arandu-assistant .assistant-chip {
        border: 1px solid rgba(62, 16, 13, .22) !important;
        background: rgba(255, 241, 220, .88) !important;
        color: #3e100d !important;
        border-radius: 999px !important;
        padding: 8px 10px !important;
        font-weight: 800 !important;
        font-size: 12px !important;
        cursor: pointer !important;
      }

      .arandu-assistant .assistant-input-row {
        display: flex !important;
        gap: 8px !important;
        padding: 12px 14px 16px !important;
        border-top: 1px solid rgba(62, 16, 13, .22) !important;
        background: #fff1dc !important;
      }

      .arandu-assistant .assistant-input-row input {
        flex: 1 !important;
        min-width: 0 !important;
        border: 1px solid rgba(62, 16, 13, .26) !important;
        border-radius: 999px !important;
        padding: 11px 13px !important;
        background: #fffaf1 !important;
        color: #180f0c !important;
        font-size: 14px !important;
      }

      .arandu-assistant .assistant-input-row button {
        border: 0 !important;
        border-radius: 999px !important;
        padding: 0 14px !important;
        background: #3e100d !important;
        color: #fff1dc !important;
        font-weight: 900 !important;
        cursor: pointer !important;
      }

      @media (max-width: 720px) {
        .arandu-assistant {
          right: 14px !important;
          bottom: 14px !important;
        }

        .arandu-assistant .assistant-toggle {
          padding: 12px 14px !important;
          font-size: 13px !important;
        }

        .arandu-assistant .assistant-panel {
          right: 0 !important;
          bottom: 56px !important;
          width: calc(100vw - 28px) !important;
          max-height: calc(100vh - 92px) !important;
        }

        .arandu-assistant .assistant-input-row {
          flex-direction: column !important;
        }

        .arandu-assistant .assistant-input-row button {
          padding: 11px 14px !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  injectCoreCss();

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
      text: 'Comece pelo acervo. Você pode salvar obras, comparar opções e reservar com acompanhamento da curadoria.',
      links: [['Explorar obras', 'obras.html'], ['Comprar arte', 'comprar-arte.html'], ['Minha seleção', 'minha-selecao.html']]
    },
    primeiraObra: {
      label: 'Primeira obra',
      text: 'Para primeira compra, o ideal é começar por obras com leitura clara, preço acessível e boa documentação.',
      links: [['Guia primeira obra', 'guia-primeira-obra.html'], ['Obras até R$ 3.000', 'obras-ate-3000.html'], ['Explorar obras', 'obras.html?q=primeira%20obra']]
    },
    casa: {
      label: 'Arte para casa',
      text: 'Para casa ou apartamento, pense em ambiente, dimensão, luz, parede e intenção: presença, acolhimento ou contraste.',
      links: [['Arte para casa', 'arte-para-casa.html'], ['Arte para apartamento', 'arte-para-apartamento.html'], ['Explorar obras', 'obras.html']]
    },
    empresa: {
      label: 'Projeto para empresa',
      text: 'Para empresas, clínicas, hotéis ou escritórios, a Arandu organiza uma proposta curatorial conforme espaço, orçamento e narrativa desejada.',
      links: [['Empresas', 'empresas.html'], ['Arquitetos', 'para-arquitetos.html'], ['Falar com curadoria', 'contato.html']]
    },
    clinica: {
      label: 'Clínicas e recepções',
      text: 'Para clínicas e recepções, priorize obras que construam acolhimento, confiança e presença sem excesso de ruído visual.',
      links: [['Arte para clínicas', 'arte-para-clinicas.html'], ['Arte para recepções', 'arte-para-recepcoes.html'], ['Falar com curadoria', 'contato.html']]
    },
    pintura: {
      label: 'Pintura',
      text: 'A pintura costuma funcionar bem quando você busca presença material, cor, gesto e força visual no ambiente.',
      links: [['Pintura brasileira', 'pintura-contemporanea-brasileira.html'], ['Ver pinturas', 'obras.html?filter=pintura'], ['Comprar arte', 'comprar-arte.html']]
    },
    fotografia: {
      label: 'Fotografia',
      text: 'A fotografia pode ser uma boa entrada para colecionar com narrativa, memória, território e formatos mais acessíveis.',
      links: [['Fotografia brasileira', 'fotografia-brasileira.html'], ['Ver fotografias', 'obras.html?filter=fotografia'], ['Guia primeira obra', 'guia-primeira-obra.html']]
    },
    escultura: {
      label: 'Escultura',
      text: 'A escultura funciona quando o espaço pede presença física, volume, textura e diálogo com circulação.',
      links: [['Escultura brasileira', 'escultura-brasileira.html'], ['Ver esculturas', 'obras.html?filter=escultura'], ['Falar com curadoria', 'contato.html']]
    },
    artista: {
      label: 'Sou artista',
      text: 'Para artistas, o fluxo começa pelo portfólio, ficha técnica, imagens, faixa de preço, contexto da trajetória e disponibilidade das obras.',
      links: [['Submeter portfólio', 'para-artistas.html#submissao'], ['Checklist do artista', 'checklist-portfolio-artista.html'], ['Como selecionamos', 'como-selecionamos-artistas.html']]
    },
    certificado: {
      label: 'Certificado e segurança',
      text: 'A Arandu trabalha com procedência, ficha técnica, autoria, imagem, status da obra e verificação de certificado.',
      links: [['Verificar certificado', 'verificar-certificado.html'], ['Autenticidade', 'autenticidade.html'], ['Compra segura', 'compra-reserva-reembolso.html']]
    },
    curadoria: {
      label: 'Falar com curadoria',
      text: 'A curadoria pode ajudar a entender obra, preço, ambiente, certificado, disponibilidade e próximos passos de reserva.',
      links: [['Contato', 'contato.html'], ['Curadoria', 'curadoria.html'], ['Confiança', 'confianca.html']]
    }
  };

  function routeForText(text) {
    const q = normalize(text);

    if (/primeira|iniciante|comecar|começar|ate 3000|ate r\$? ?3|barat|acessivel/.test(q)) return routes.primeiraObra;
    if (/casa|apartamento|sala|parede|decoracao|decoração/.test(q)) return routes.casa;
    if (/clinica|consultorio|recepcao|saude|paciente/.test(q)) return routes.clinica;
    if (/empresa|escritorio|hotel|ambiente|arquiteto|corporativo/.test(q)) return routes.empresa;
    if (/pintura|tela|oleo|acrilica|acrílica/.test(q)) return routes.pintura;
    if (/fotografia|foto|edicao|edição/.test(q)) return routes.fotografia;
    if (/escultura|objeto|volume|bronze|ceramica|cerâmica/.test(q)) return routes.escultura;
    if (/artista|portfolio|portfólio|submeter|vender|expor|representado|galeria/.test(q)) return routes.artista;
    if (/certificado|autenticidade|seguranca|segurança|procedencia|procedência|reembolso|reserva/.test(q)) return routes.certificado;
    if (/curadoria|atendimento|duvida|dúvida|falar|whatsapp|contato/.test(q)) return routes.curadoria;
    if (/comprar|preco|preço|obra|acervo|colecionar/.test(q)) return routes.comprar;

    return {
      label: 'Orientação inicial',
      text: 'Posso te guiar por alguns caminhos: comprar uma obra, escolher para casa, montar um projeto, verificar certificado ou submeter portfólio como artista.',
      links: [['Explorar obras', 'obras.html'], ['Para empresas', 'empresas.html'], ['Para artistas', 'para-artistas.html#submissao'], ['Falar com curadoria', 'contato.html']]
    };
  }

  function renderLinks(links) {
    return links.map(([label, href]) => `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join(' · ');
  }

  const root = document.createElement('div');
  root.className = 'arandu-assistant';
  root.dataset.aranduAssistant = 'true';
  root.innerHTML = `
    <button class="assistant-toggle" type="button" aria-expanded="false" aria-controls="arandu-assistant-panel">Assistente Arandu</button>
    <section class="assistant-panel" id="arandu-assistant-panel" aria-label="Assistente virtual Arandu" hidden>
      <header>
        <div>
          <strong>Assistente Arandu</strong>
          <small>Escolha um caminho ou descreva o que procura.</small>
        </div>
        <button class="assistant-close" type="button" aria-label="Fechar assistente">×</button>
      </header>

      <div class="assistant-messages" data-assistant-messages>
        <div class="assistant-message bot">Olá. Posso te ajudar a encontrar uma obra, entender certificados, montar um projeto para empresa ou enviar portfólio como artista.</div>
      </div>

      <div class="assistant-quick-actions">
        <button class="assistant-chip" type="button" data-assistant-choice="comprar">Comprar obra</button>
        <button class="assistant-chip" type="button" data-assistant-choice="primeiraObra">Primeira obra</button>
        <button class="assistant-chip" type="button" data-assistant-choice="casa">Casa</button>
        <button class="assistant-chip" type="button" data-assistant-choice="empresa">Empresa</button>
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
    root.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));

    if (open) {
      setTimeout(() => form.querySelector('input')?.focus(), 40);
    }
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

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });
})();
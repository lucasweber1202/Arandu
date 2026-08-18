/* Arandu — assistente virtual global */
(function () {
  const INTERNAL_PAGE_PATTERNS = /^(painel|admin|demo|roadmap|configuracao|login|cadastro|minha-conta)/i;
  const currentPage = () => window.location.pathname.split('/').pop() || 'index.html';

  if (INTERNAL_PAGE_PATTERNS.test(currentPage()) || document.querySelector('[data-arandu-assistant]')) return;


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
      <form class="assistant-input-row" data-assistant-form><label class="sr-only" for="arandu-assistant-message">Pergunte à Arandu</label><input id="arandu-assistant-message" type="text" name="message" autocomplete="off" placeholder="Ex.: quero uma pintura até R$ 5 mil" /><button type="submit">Enviar</button></form>
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

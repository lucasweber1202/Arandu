import { test, expect } from '@playwright/test';

/**
 * Jornada do comprador de ponta a ponta sobre o build real.
 *
 * O catálogo vem exclusivamente da API, então cada teste injeta uma resposta
 * verificada. Isso mantém a suíte determinística e ainda exercita o contrato:
 * `verifiedReady !== true` faz o site recusar os dados (coberto pela suíte de
 * jornadas públicas).
 */

const CATALOG = {
  ok: true,
  mode: 'supabase',
  verifiedReady: true,
  release: 'e2e-fixture',
  items: [
    {
      id: 'obra-horizonte',
      title: 'Horizonte de Barro',
      artist_name: 'Ayla Nunes',
      technique: 'Óleo sobre linho',
      dimensions: '120 x 90 cm',
      price: 6400,
      price_label: 'R$ 6.400',
      status: 'available',
      summary: 'Paisagem de sertão em camadas de ocre.',
      tags: ['sertao', 'pintura'],
      certificate: true,
      created_at: '2026-05-01T12:00:00.000Z'
    },
    {
      id: 'obra-mare-alta',
      title: 'Maré Alta',
      artist_name: 'Joana Prado',
      technique: 'Fotografia fine art',
      dimensions: '60 x 40 cm',
      price: 2200,
      price_label: 'R$ 2.200',
      status: 'available',
      summary: 'Litoral em fotografia de longa exposição.',
      tags: ['fotografia', 'rio'],
      certificate: true,
      created_at: '2026-04-02T12:00:00.000Z'
    },
    {
      id: 'obra-volume-seco',
      title: 'Volume Seco',
      artist_name: 'Rui Bastos',
      technique: 'Escultura em bronze',
      dimensions: '48 x 30 cm',
      price: 18500,
      price_label: 'R$ 18.500',
      status: 'available',
      summary: 'Objeto em bronze de superfície bruta.',
      tags: ['escultura'],
      certificate: false,
      created_at: '2026-03-03T12:00:00.000Z'
    }
  ]
};

/** Silencia as rotas de rede que não existem no servidor estático de teste. */
async function stubApi(page, { catalog = CATALOG } = {}) {
  await page.route('**/api/catalog', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(catalog) }));
  await page.route('**/api/artists', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, verifiedReady: true, items: [] }) }));
  await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: false }) }));
  await page.route('**/api/public-config', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) }));
}

/** Resolve a barra de consentimento para liberar a interação com a página. */
async function acceptEssential(page) {
  const banner = page.locator('[data-privacy-banner]');
  if (await banner.count()) {
    await page.locator('[data-consent-essential]').click();
    await expect(banner).toHaveCount(0);
  }
}

// 390×844 é o retrato de iPhone mais comum e a largura onde o botão flutuante
// do assistente encostava na barra de consentimento. Larguras maiores davam
// folga suficiente para o defeito passar despercebido.
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`a escolha de privacidade não é coberta em ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await stubApi(page);
    await page.goto('/index.html');
    const button = page.locator('[data-consent-essential]');
    await expect(button).toBeVisible();

    // Cada canto e o centro do botão precisam pertencer a ele: qualquer
    // flutuante por cima devolve outro elemento em `elementFromPoint` e o
    // toque se perde.
    const obstruction = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const inset = 3;
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + inset, rect.top + inset],
        [rect.right - inset, rect.top + inset],
        [rect.left + inset, rect.bottom - inset],
        [rect.right - inset, rect.bottom - inset]
      ];
      for (const [x, y] of points) {
        const hit = document.elementFromPoint(x, y);
        if (!hit || !(element === hit || element.contains(hit) || hit.contains(element))) {
          return `${hit?.tagName || 'nada'}.${String(hit?.className || '').slice(0, 60)}`;
        }
      }
      return '';
    });
    expect(obstruction, 'elemento sobre o botão de consentimento').toBe('');

    await button.click();
    await expect(page.locator('[data-privacy-banner]')).toHaveCount(0);
  });
}

test('a dobra inicial mostra proposta e ação principal sem rolagem', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'A dobra é medida no viewport de desktop.');
  await stubApi(page);
  await page.goto('/index.html');
  await acceptEssential(page);

  const viewportHeight = page.viewportSize().height;
  const headingBottom = await page.locator('main h1').evaluate((el) => el.getBoundingClientRect().bottom);
  const actionTop = await page.locator('.safe-actions a').first().evaluate((el) => el.getBoundingClientRect().top);

  expect(headingBottom).toBeLessThan(viewportHeight);
  expect(actionTop).toBeLessThan(viewportHeight);
});

test('a marca do cabeçalho contrasta com o próprio cabeçalho', async ({ page }) => {
  await stubApi(page);
  for (const route of ['/index.html', '/comprar-arte.html']) {
    await page.goto(route);
    const contrast = await page.evaluate(() => {
      const brand = document.querySelector('.brand-logo, .safe-logo');
      const header = brand.closest('header');
      const parse = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const luminance = ([r, g, b]) => {
        const channel = (raw) => {
          const v = raw / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const background = (() => {
        let node = header;
        while (node) {
          const value = getComputedStyle(node).backgroundColor;
          if (value && !/rgba\(0, 0, 0, 0\)|transparent/.test(value)) return parse(value);
          node = node.parentElement;
        }
        return [255, 255, 255];
      })();
      const foreground = parse(getComputedStyle(brand).color);
      const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
      return (light + 0.05) / (dark + 0.05);
    });
    expect(contrast, `contraste da marca em ${route}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('busca do catálogo filtra, informa o total e oferece estado vazio útil', async ({ page }) => {
  await stubApi(page);
  await page.goto('/comprar-arte.html');
  await acceptEssential(page);

  const cards = page.locator('[data-card-artwork]');
  await expect(cards).toHaveCount(3);
  await expect(page.locator('[data-ux-catalog-count]')).toContainText('3 obras');

  await page.locator('[data-ux-catalog-search]').fill('Maré');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Maré Alta');

  await page.locator('[data-ux-catalog-search]').fill('termo-que-nao-existe');
  await expect(cards).toHaveCount(0);
  await expect(page.locator('.op-empty')).toContainText('Nenhuma obra encontrada');
});

test('salvar obra alimenta a seleção e as ferramentas da seleção funcionam', async ({ page }) => {
  await stubApi(page);
  await page.goto('/comprar-arte.html');
  await acceptEssential(page);

  await page.locator('[data-card-artwork="obra-horizonte"] [data-save-artwork]').click();
  await page.locator('[data-card-artwork="obra-mare-alta"] [data-save-artwork]').click();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('arandu.selection.v1') || '[]'));
  expect(stored.map((item) => item.id)).toEqual(['obra-horizonte', 'obra-mare-alta']);

  await page.goto('/minha-selecao.html');
  await acceptEssential(page);

  // Regressão direta da colisão de escopo global: com o SyntaxError anterior,
  // selection-tools.js nunca executava e nada abaixo respondia.
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await expect(page.locator('[data-selection-list] [data-remove-artwork]')).toHaveCount(2);

  await page.locator('[data-briefing-form] [name="ambiente"]').fill('Sala de estar com luz natural');
  await page.locator('[data-briefing-form] [name="orcamento"]').fill('Até R$ 9.000');
  await expect(page.locator('[data-briefing-preview]')).toContainText('Sala de estar');

  await page.locator('[data-show-selection-comparison]').click();
  const comparison = page.locator('[data-selection-comparison]');
  await expect(comparison).toContainText('Horizonte de Barro');
  await expect(comparison).toContainText('Maré Alta');

  await page.locator('[data-selection-list] [data-remove-artwork]').first().click();
  await expect(page.locator('[data-selection-list] [data-remove-artwork]')).toHaveCount(1);

  expect(pageErrors).toEqual([]);
});

// Com `ARANDU_COMMERCIAL_READY=false` — o estado da beta — o servidor recusa
// `/api/reservations` de forma fechada. Oferecer "Reservar com curadoria" era
// prometer um fluxo que termina em erro de política comercial. A jornada com a
// compra aberta vive em `commerce-journeys.spec.js`, sobre um build próprio.
test('com a compra fechada, o acervo oferece a curadoria no lugar da reserva', async ({ page }) => {
  await stubApi(page);
  await page.goto('/comprar-arte.html');
  await acceptEssential(page);

  const card = page.locator('[data-card-artwork="obra-horizonte"]');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-reserve-artwork]')).toHaveCount(0);

  const curadoria = card.locator('[data-commerce-replaced]');
  await expect(curadoria).toBeVisible();
  await expect(curadoria).toHaveText('Falar com a curadoria');
  await expect(curadoria).toHaveAttribute('href', /^contato\.html/);

  // Nenhum caminho de reserva pode sobrar em outros pontos da mesma página.
  await expect(page.locator('[data-reserve-artwork]')).toHaveCount(0);
  await expect(page.locator('[data-reserve-modal]')).toHaveCount(0);
});

test('página inexistente oferece saída para o acervo', async ({ page }) => {
  await stubApi(page);
  const response = await page.goto('/404.html');
  expect(response.status()).toBe(200);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('main a[href*="comprar-arte.html"]').first()).toBeVisible();
});

test('formulário de login é rotulado, navegável por teclado e anuncia a recusa', async ({ page }) => {
  await stubApi(page);
  await page.route('**/api/auth/login', (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'E-mail ou senha incorretos.', code: 'invalid_credentials' })
  }));

  await page.goto('/login.html');
  await acceptEssential(page);

  const email = page.locator('[data-login-form] input[name="email"]');
  const password = page.locator('[data-login-form] input[name="password"]');
  // Placeholder não é rótulo: ele some ao digitar e nem sempre é anunciado.
  for (const field of [email, password]) {
    const label = await field.evaluate((element) => {
      const byFor = element.id ? document.querySelector(`label[for="${element.id}"]`) : null;
      return byFor?.textContent?.trim() || element.getAttribute('aria-label') || '';
    });
    expect(label.length).toBeGreaterThan(0);
  }

  await email.fill('pessoa@example.com');
  await password.fill('senha-incorreta');
  await page.locator('[data-login-form]').evaluate((form) => form.requestSubmit());

  const status = page.locator('[data-login-form] [data-auth-status]');
  await expect(status).toContainText('E-mail ou senha incorretos.');
  await expect(status).toHaveAttribute('role', 'status');
  await expect(email).toHaveAttribute('aria-invalid', 'true');
});

test('todo campo de formulário público tem nome acessível', async ({ page }) => {
  await stubApi(page);
  // Uma página de cada família de formulário: contato, briefing de empresa,
  // newsletter, briefing da seleção, portal do artista e acesso administrativo.
  const routes = [
    '/contato.html',
    '/empresas.html',
    '/newsletter.html',
    '/minha-selecao.html',
    '/portal-artista.html',
    '/admin-login.html'
  ];
  for (const route of routes) {
    await page.goto(route);
    const unnamed = await page.evaluate(() => {
      const missing = [];
      document.querySelectorAll('input, select, textarea').forEach((field) => {
        const type = String(field.getAttribute('type') || '').toLowerCase();
        if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;
        if (field.getAttribute('aria-hidden') === 'true') return;
        const associated = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`) : null;
        const name = (associated?.textContent || field.closest('label')?.textContent || field.getAttribute('aria-label') || '').trim();
        if (!name) missing.push(`${field.tagName.toLowerCase()}[name=${field.name || '?'}]`);
      });
      return missing;
    });
    expect(unnamed, `campos sem rótulo em ${route}`).toEqual([]);
  }
});

/**
 * Páginas públicas do artefato publicado.
 *
 * As três varreduras abaixo passam por todas elas. Cada uma declara o próprio
 * tempo: 88 navegações não cabem no limite de 30s que vale para um teste de
 * jornada, e afrouxar o limite global esconderia lentidão real nos outros
 * testes. `domcontentloaded` basta — o que elas medem (h1, caixa dos
 * elementos, largura da página) já está no documento e no CSS; esperar todo
 * subrecurso de cada página multiplicava o custo por cinco motores.
 */
const TEMPO_DE_VARREDURA = 180_000;

async function paginasPublicadas() {
  const { readdirSync } = await import('node:fs');
  const { INTERNAL_PAGE_SET } = await import('../../lib/internal-pages.mjs');
  const SEM_CASCA = new Set(['admin-login.html', 'certificado-template.html', 'proposta-curatorial-template.html', 'selecao-curatorial-template.html', 'proposta-publica.html']);
  return readdirSync('dist')
    .filter((arquivo) => arquivo.endsWith('.html') && !INTERNAL_PAGE_SET.has(arquivo) && !SEM_CASCA.has(arquivo))
    .sort();
}

// Alvo de toque e rolagem lateral no celular, nas 87 páginas publicadas.
//
// mapa-do-site, press-kit e o bloco de ajuda do catálogo empilhavam âncoras sem
// classe com 19px de altura, coladas umas nas outras — abaixo do mínimo de
// 24x24 do WCAG 2.5.8. O mínimo aqui é o da norma, não um número escolhido:
// link dentro de parágrafo ou item de lista é texto corrido e fica de fora,
// como a própria norma prevê.
test('no celular nada rola de lado nem fica pequeno demais para o polegar', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a medida só faz sentido no viewport de celular');
  test.setTimeout(TEMPO_DE_VARREDURA);
  await stubApi(page);
  const paginas = await paginasPublicadas();

  const falhas = [];
  for (const pagina of paginas) {
    await page.goto(`/${pagina}`, { waitUntil: 'domcontentloaded' });
    const medida = await page.evaluate(() => {
      const doc = document.documentElement;
      const pequenos = [];
      document.querySelectorAll('main a[href], main button, main select').forEach((elemento) => {
        const caixa = elemento.getBoundingClientRect();
        if (!caixa.width || !caixa.height) return;
        if (elemento.closest('p, li')) return;
        if (caixa.height < 24) pequenos.push(`${(elemento.textContent || '').trim().slice(0, 24) || elemento.tagName} ${Math.round(caixa.height)}px`);
      });
      return { rolagem: doc.scrollWidth - doc.clientWidth, pequenos: [...new Set(pequenos)].slice(0, 4) };
    });
    if (medida.rolagem > 1) falhas.push(`${pagina}: rolagem lateral de ${medida.rolagem}px`);
    if (medida.pequenos.length) falhas.push(`${pagina}: alvo abaixo de 24px — ${medida.pequenos.join(' | ')}`);
  }
  expect(falhas, falhas.join('\n')).toEqual([]);
});

// Conteúdo que o build publica e o navegador não desenha.
//
// A cascata acumulou regras de limpeza com seletor curinga — [class*='intent'],
// [class*='suggest'], [class*='mobile'], a[href*='3000'] — escritas para matar
// widgets de protótipo. Elas também apagavam coisas reais: a busca por
// intenção e as sugestões de pesquisa.html, e a trilha de etapas de três
// páginas. Nenhuma catraca via isso, porque o HTML publicado estava correto:
// só o resultado renderizado é que faltava. Este teste mede o resultado.
test('nada que a página publica fica invisível para quem lê', async ({ page }) => {
  test.setTimeout(TEMPO_DE_VARREDURA);
  await stubApi(page);
  const paginas = await paginasPublicadas();

  const falhas = [];
  for (const pagina of paginas) {
    await page.goto(`/${pagina}`, { waitUntil: 'domcontentloaded' });
    const invisiveis = await page.evaluate(() => {
      const achados = [];
      document.querySelectorAll('main a[href], main button, main section, main article').forEach((elemento) => {
        const caixa = elemento.getBoundingClientRect();
        if (caixa.width > 0 || caixa.height > 0) return;
        const texto = (elemento.innerText || '').trim();
        if (!texto || texto.length > 90) return;
        // Painel fechado de propósito não conta: `hidden`, `details` fechado e
        // `aria-hidden` são estados legítimos da interface.
        if (elemento.closest('[hidden], details:not([open]), [aria-hidden="true"]')) return;
        achados.push(`${elemento.tagName.toLowerCase()} "${texto.replace(/\s+/g, ' ').slice(0, 50)}"`);
      });
      return achados;
    });
    for (const item of invisiveis) falhas.push(`${pagina}: ${item}`);
  }
  expect(falhas, falhas.join('\n')).toEqual([]);
});

// Varre todas as páginas públicas publicadas, não uma lista escolhida à mão.
// A lista antiga tinha oito rotas e não incluía artigo.html, que publicava dois
// h1 — o do herói e o do texto montado por JS.
test('cada página pública tem um único h1 e um alvo para o link de pular', async ({ page }) => {
  test.setTimeout(TEMPO_DE_VARREDURA);
  await stubApi(page);
  // Estas quatro montam o h1 por JS; as demais já o trazem no HTML publicado.
  const MONTADAS_POR_JS = { 'obra.html': '?id=obra-horizonte', 'artista.html': '?id=a1', 'artigo.html': '', 'colecao.html': '' };
  const paginas = await paginasPublicadas();
  const rotas = paginas.map((arquivo) => ({ arquivo, url: `/${arquivo}${MONTADAS_POR_JS[arquivo] ?? ''}` }));

  expect(rotas.length, 'a varredura precisa encontrar as páginas publicadas').toBeGreaterThan(50);

  const falhas = [];
  for (const { arquivo, url } of rotas) {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Só quem depende de JS espera por ele, e espera pelo resultado em vez de
    // por um tempo fixo — 250ms por página, vezes 88, vezes cinco motores, era
    // a maior parte do custo desta varredura.
    if (arquivo in MONTADAS_POR_JS) {
      // Esperar o h1 existir não basta: colecao.html publica
      // "Carregando coleção..." no HTML e só depois troca o bloco inteiro pelo
      // resultado, então a medida caía sobre o placeholder. O que interessa é
      // o estado assentado. (Com a API respondendo, este é o estado de
      // sucesso; o estado de falha é medido pela varredura sem stub, no fim
      // deste arquivo.)
      await page.locator('h1').first().waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    }
    const titulos = await page.locator('h1').allTextContents();
    if (titulos.length !== 1) falhas.push(`${url}: ${titulos.length} h1 (${titulos.join(' | ')})`);
    const skip = page.locator('.skip-link');
    const quantos = await skip.count();
    if (quantos !== 1) { falhas.push(`${url}: ${quantos} links de pular`); continue; }
    const alvo = await skip.getAttribute('href');
    if (await page.locator(alvo).count() !== 1) falhas.push(`${url}: alvo ${alvo} não existe`);
  }
  expect(falhas, falhas.join('\n')).toEqual([]);
});


// Mensagem de erro do servidor não é texto de página.
//
// O servidor estático de teste responde 404 em `/api/*` com um texto próprio,
// "API não simulada." Ele funciona como marcador: se aparecer na página, é
// porque o código imprimiu a resposta do servidor no lugar de uma frase
// escrita para quem está lendo. Foi o que acontecia em nove páginas — e em
// produção o mesmo caminho mostrava ao comprador "A migration de prontidão do
// catálogo ainda não foi aplicada" e o nome do banco de dados.
//
// A varredura visita só quem busca dados, e descobre esse conjunto pelos
// scripts que a página carrega: uma página nova entra sozinha.
const MARCADOR_DO_SERVIDOR = 'API não simulada';

async function paginasComBuscaDeDados() {
  const { readFileSync } = await import('node:fs');
  const paginas = await paginasPublicadas();
  const busca = new Map();
  const scriptBusca = (arquivo) => {
    if (!busca.has(arquivo)) {
      let fonte = '';
      try { fonte = readFileSync(`js/${arquivo}`, 'utf8'); } catch { fonte = ''; }
      busca.set(arquivo, fonte.includes('/api/') || fonte.includes('AranduCatalogSource'));
    }
    return busca.get(arquivo);
  };
  return paginas.filter((pagina) => {
    const html = readFileSync(`dist/${pagina}`, 'utf8');
    return [...html.matchAll(/src="\/?js\/([\w.-]+\.js)/g)].some((achado) => scriptBusca(achado[1]));
  });
}

test('com a API fora do ar, nada vaza texto do servidor nem perde o título', async ({ page }) => {
  test.setTimeout(TEMPO_DE_VARREDURA);
  // Sem `stubApi` de propósito. As outras varreduras injetam um catálogo
  // válido e medem o estado de sucesso; enquanto o catálogo real não é
  // liberado, quem visita o site encontra o estado de falha — e era só nele
  // que os dois defeitos apareciam.
  const paginas = await paginasComBuscaDeDados();
  expect(paginas.length, 'a varredura precisa encontrar as páginas que buscam dados').toBeGreaterThan(8);

  const falhas = [];
  for (const pagina of paginas) {
    await page.goto(`/${pagina}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    const medida = await page.evaluate((marcador) => {
      const alvo = document.querySelector('main') || document.body;
      const texto = (alvo.innerText || '').replace(/\s+/g, ' ');
      const posicao = texto.indexOf(marcador);
      return {
        vazamento: posicao < 0 ? '' : texto.slice(Math.max(0, posicao - 60), posicao + marcador.length + 10),
        titulos: [...document.querySelectorAll('h1')].length
      };
    }, MARCADOR_DO_SERVIDOR);
    if (medida.vazamento) falhas.push(`${pagina}: ...${medida.vazamento}`);
    // colecao.html trocava o bloco inteiro pelo aviso de indisponibilidade e
    // levava junto o único h1 da página.
    if (medida.titulos !== 1) falhas.push(`${pagina}: ${medida.titulos} h1 no estado de falha`);
  }
  expect(falhas, falhas.join('\n')).toEqual([]);
});


// Saída de emergência que aponta para a própria página não é saída.
//
// Quando o envio falha, o formulário guarda um rascunho e diz "use um dos
// canais abaixo". Em contato.html o único canal oferecido era "Abrir a página
// de contato" — a página onde a pessoa já estava. Sem WhatsApp nem e-mail
// configurados no ambiente (o estado da beta), a frase apontava para o nada.
test('quando o envio falha, a saída oferecida não é a própria página', async ({ page }) => {
  await stubApi(page);
  await page.route('**/api/forms', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ ok: false, error: 'A gravação de formulários ainda não foi configurada no servidor.', code: 'forms_unconfigured' })
  }));

  await page.goto('/contato.html');
  await acceptEssential(page);

  const form = page.locator('form').first();
  await form.evaluate((elemento) => {
    for (const campo of elemento.querySelectorAll('input, select, textarea')) {
      if (['hidden', 'submit', 'button'].includes(campo.type)) continue;
      if (campo.type === 'checkbox') { if (campo.required) campo.checked = true; continue; }
      if (campo.tagName === 'SELECT') { if (campo.options.length > 1) campo.selectedIndex = 1; continue; }
      campo.value = campo.type === 'email' ? 'pessoa@example.com' : 'Mensagem de verificação';
      campo.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await form.evaluate((elemento) => elemento.requestSubmit());

  await expect(form.locator('[data-form-status]')).toContainText('Não conseguimos registrar seu envio agora');
  const saidas = form.locator('[data-form-rescue] a');
  await expect(saidas.first()).toBeVisible();

  const destinos = await saidas.evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(destinos.length, 'a falha precisa oferecer alguma saída').toBeGreaterThan(0);
  for (const destino of destinos) {
    expect(destino.split('?')[0].split('#')[0], `saída aponta para a própria página`).not.toBe('contato.html');
  }
});

// O contrário da varredura do ambiente demonstrativo: com o acervo fechado — o
// estado publicado — a página precisa continuar dizendo isso. A alternativa
// demonstrativa mora num atributo do HTML e só pode entrar quando
// presentation-runtime.js está carregado.
test('com o acervo fechado, a página continua dizendo que ele está fechado', async ({ page }) => {
  await stubApi(page);
  await page.goto('/comprar-arte.html');
  await acceptEssential(page);

  await expect(page.locator('main h1')).toContainText('ainda está em validação curatorial');
  await expect(page.locator('body')).not.toContainText('Acervo demonstrativo');
  await expect(page.locator('.presentation-banner')).toHaveCount(0);
});

// A comparação existia como página vazia.
//
// comparar-obras.html trazia o gancho `data-compare-runtime` e a chave
// `arandu.compare.v1` desde sempre, mas os seis scripts que tocavam nessa
// chave eram carregados por zero páginas publicadas: não havia como pôr uma
// obra na comparação, e a página abria vazia para qualquer visitante.
test('comparar obras funciona do acervo até a tabela', async ({ page }) => {
  await stubApi(page);
  await page.goto('/comprar-arte.html');
  await acceptEssential(page);

  const botoes = page.locator('[data-card-artwork] [data-compare-artwork]');
  await expect(botoes).toHaveCount(3);
  await expect(botoes.first()).toHaveAttribute('aria-pressed', 'false');

  await botoes.nth(0).click();
  await botoes.nth(1).click();
  await expect(botoes.nth(0)).toHaveAttribute('aria-pressed', 'true');

  const barra = page.locator('[data-compare-bar]');
  await expect(barra).toContainText('2 obras na comparação');

  // Clicar de novo tira a obra: o botão é alternador, não acumulador.
  await botoes.nth(1).click();
  await expect(barra).toContainText('1 obra na comparação');
  await botoes.nth(1).click();

  await page.locator('[data-compare-bar] a[href="comparar-obras.html"]').click();
  await expect(page).toHaveURL(/comparar-obras\.html/);

  const tabela = page.locator('.compare-table');
  await expect(tabela).toBeVisible();
  await expect(tabela.locator('thead th')).toHaveCount(3);
  await expect(tabela).toContainText('Horizonte de Barro');
  await expect(tabela).toContainText('Maré Alta');

  // A comparação só ajuda se apontar a diferença; linha igual não é marcada.
  await expect(tabela.locator('tbody tr.is-different').first()).toBeVisible();
  await expect(tabela).toContainText('Preço por m²');

  await tabela.locator('[data-compare-remove]').first().click();
  await expect(tabela.locator('thead th')).toHaveCount(2);
});

test('a comparação para em quatro obras e avisa', async ({ page }) => {
  await stubApi(page, { catalog: { ...CATALOG, items: [...CATALOG.items, ...CATALOG.items.map((item, indice) => ({ ...item, id: item.id + '-b' + indice, title: item.title + ' II' }))] } });
  await page.goto('/comprar-arte.html');
  await acceptEssential(page);

  const botoes = page.locator('[data-card-artwork] [data-compare-artwork]');
  await expect(botoes).toHaveCount(6);
  for (let indice = 0; indice < 5; indice += 1) await botoes.nth(indice).click();

  await expect(page.locator('[data-compare-bar]')).toContainText('4 obras na comparação');
  const marcados = await botoes.evaluateAll((lista) => lista.filter((botao) => botao.getAttribute('aria-pressed') === 'true').length);
  expect(marcados, 'a quinta obra não pode entrar').toBe(4);
});

// A barra é fixa. O botão do assistente também é, e a barra de consentimento
// também: cobrir a escolha de privacidade já foi defeito nesta base.
test('a barra de comparação não cobre o consentimento nem o assistente', async ({ page }) => {
  await stubApi(page);
  await page.goto('/comprar-arte.html');

  // Antes da escolha de privacidade a barra não pode sequer existir.
  await page.locator('[data-card-artwork] [data-compare-artwork]').first().click();
  if (await page.locator('[data-privacy-banner]').count()) {
    await expect(page.locator('[data-compare-bar]')).toHaveCount(0);
  }
  await acceptEssential(page);
  await page.locator('[data-card-artwork] [data-compare-artwork]').nth(1).click();

  const barra = page.locator('[data-compare-bar]');
  await expect(barra).toBeVisible();

  const colisoes = await page.evaluate(() => {
    const caixa = document.querySelector('[data-compare-bar]').getBoundingClientRect();
    const encosta = (outro) => {
      if (!outro) return false;
      const alvo = outro.getBoundingClientRect();
      if (!alvo.width || !alvo.height) return false;
      return !(caixa.bottom <= alvo.top || caixa.top >= alvo.bottom || caixa.right <= alvo.left || caixa.left >= alvo.right);
    };
    return {
      assistente: encosta(document.querySelector('.arandu-assistant')),
      consentimento: encosta(document.querySelector('[data-privacy-banner]'))
    };
  });
  expect(colisoes.assistente, 'a barra cobre o botão do assistente').toBe(false);
  expect(colisoes.consentimento, 'a barra cobre a escolha de privacidade').toBe(false);

  // Numa tela estreita a barra também não pode empurrar o documento de lado.
  const rolagem = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(rolagem).toBeLessThanOrEqual(1);
});

// Leitura objetiva: a página passou a publicar números derivados da ficha.
// Um número inventado aqui seria pior que nenhum, então o teste cobra o valor
// exato que a aritmética tem de produzir.
test('a obra publica leitura objetiva calculada da própria ficha', async ({ page }) => {
  await stubApi(page);
  await page.goto('/obra.html?id=obra-horizonte');
  await acceptEssential(page);

  const ficha = page.locator('.artwork-analysis');
  await expect(ficha).toBeVisible();

  // 120 x 90 cm = 1,08 m²; R$ 6.400 / 1,08 m² = R$ 5.926/m².
  await expect(ficha).toContainText('1,08 m²');
  await expect(ficha).toContainText('R$ 5.926');
  await expect(ficha).toContainText('Escala grande');

  // A origem do número fica dita na página, e a promessa que não existe também.
  await expect(ficha).toContainText('Não é avaliação de mercado');
});

test('o artista publica o próprio retrato no acervo de hoje', async ({ page }) => {
  await stubApi(page, { catalog: CATALOG });
  await page.route('**/api/artists', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ ok: true, verifiedReady: true, items: [{ id: 'ayla-nunes', name: 'Ayla Nunes', city: 'Recife', state: 'PE' }] })
  }));
  await page.goto('/artista.html?id=ayla-nunes');
  await acceptEssential(page);

  const ficha = page.locator('.artist-analysis');
  await expect(ficha).toBeVisible();
  await expect(ficha).toContainText('Obras publicadas');
  await expect(ficha).toContainText('Recife');
});

// A varredura de alvos acima mede só `main`. O aviso de beta e a assinatura
// legal ficam fora dele — e é no aviso de beta que estão as duas ações que esta
// beta existe para colher, em toda página pública. Elas chegaram a 15px de
// altura no celular sem que nenhuma catraca visse. Esta mede o que aquela não
// alcança.
test('as ações fora do main também cabem no polegar', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a medida só faz sentido no viewport de celular');
  test.setTimeout(TEMPO_DE_VARREDURA);
  await stubApi(page);

  const falhas = [];
  for (const pagina of ['index.html', 'comprar-arte.html', 'para-artistas.html', 'contato.html', 'empresas-e-arquitetos.html']) {
    await page.goto(`/${pagina}`, { waitUntil: 'domcontentloaded' });
    const pequenos = await page.evaluate(() => {
      const medidos = [];
      document.querySelectorAll('[data-beta-banner] a, .footer-legal a, .site-footer a[href]').forEach((elemento) => {
        const caixa = elemento.getBoundingClientRect();
        if (!caixa.width || !caixa.height) return;
        if (caixa.height < 24) medidos.push(`${(elemento.textContent || '').trim().slice(0, 28)} ${Math.round(caixa.height)}px`);
      });
      return [...new Set(medidos)];
    });
    if (pequenos.length) falhas.push(`${pagina}: alvo abaixo de 24px — ${pequenos.join(' | ')}`);
  }
  expect(falhas, falhas.join('\n')).toEqual([]);
});

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

// Conteúdo que o build publica e o navegador não desenha.
//
// A cascata acumulou regras de limpeza com seletor curinga — [class*='intent'],
// [class*='suggest'], [class*='mobile'], a[href*='3000'] — escritas para matar
// widgets de protótipo. Elas também apagavam coisas reais: a busca por
// intenção e as sugestões de pesquisa.html, e a trilha de etapas de três
// páginas. Nenhuma catraca via isso, porque o HTML publicado estava correto:
// só o resultado renderizado é que faltava. Este teste mede o resultado.
test('nada que a página publica fica invisível para quem lê', async ({ page }) => {
  await stubApi(page);
  const { readdirSync } = await import('node:fs');
  const { INTERNAL_PAGE_SET } = await import('../../lib/internal-pages.mjs');
  const SEM_CASCA = new Set(['admin-login.html', 'certificado-template.html', 'proposta-curatorial-template.html', 'selecao-curatorial-template.html', 'proposta-publica.html']);
  const paginas = readdirSync('dist')
    .filter((arquivo) => arquivo.endsWith('.html') && !INTERNAL_PAGE_SET.has(arquivo) && !SEM_CASCA.has(arquivo))
    .sort();

  const falhas = [];
  for (const pagina of paginas) {
    await page.goto(`/${pagina}`);
    await page.waitForTimeout(250);
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
  await stubApi(page);
  const { readdirSync } = await import('node:fs');
  const { INTERNAL_PAGE_SET } = await import('../../lib/internal-pages.mjs');
  // Impressos e o login administrativo não usam a casca pública nem um h1 de página.
  const SEM_CASCA = new Set(['admin-login.html', 'certificado-template.html', 'proposta-curatorial-template.html', 'selecao-curatorial-template.html', 'proposta-publica.html']);
  // As páginas de detalhe montam o h1 por JS a partir do id.
  const COM_ID = { 'obra.html': '?id=obra-horizonte', 'artista.html': '?id=a1', 'artigo.html': '', 'colecao.html': '' };
  const rotas = readdirSync('dist')
    .filter((arquivo) => arquivo.endsWith('.html') && !INTERNAL_PAGE_SET.has(arquivo) && !SEM_CASCA.has(arquivo))
    .sort()
    .map((arquivo) => `/${arquivo}${COM_ID[arquivo] ?? ''}`);

  expect(rotas.length, 'a varredura precisa encontrar as páginas publicadas').toBeGreaterThan(50);

  const falhas = [];
  for (const rota of rotas) {
    await page.goto(rota);
    await page.waitForTimeout(250);
    const titulos = await page.locator('h1').allTextContents();
    if (titulos.length !== 1) falhas.push(`${rota}: ${titulos.length} h1 (${titulos.join(' | ')})`);
    const skip = page.locator('.skip-link');
    if (await skip.count() !== 1) { falhas.push(`${rota}: ${await skip.count()} links de pular`); continue; }
    const alvo = await skip.getAttribute('href');
    if (await page.locator(alvo).count() !== 1) falhas.push(`${rota}: alvo ${alvo} não existe`);
  }
  expect(falhas, falhas.join('\n')).toEqual([]);
});

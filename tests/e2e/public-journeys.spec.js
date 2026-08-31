import { test, expect } from '@playwright/test';

test('home oferece navegação, busca, acessibilidade e escolha de privacidade', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page).toHaveTitle(/Arandu/);
  await expect(page.locator('.skip-link')).toHaveText('Pular para o conteúdo');
  await expect(page.locator('[data-privacy-banner]')).toBeVisible();
  await page.locator('[data-consent-essential]').click();
  await expect(page.locator('[data-privacy-banner]')).toHaveCount(0);
  const consent = await page.evaluate(() => JSON.parse(localStorage.getItem('arandu.privacy.consent.v1')));
  expect(consent.analytics).toBe(false);
  const mobileMenuButton = page.locator('[data-mobile-menu-button]');
  if (await mobileMenuButton.isVisible()) {
    await mobileMenuButton.click();
    await expect(page.locator('#arandu-site-menu a[href*="pesquisa.html"]').first()).toBeVisible();
  } else {
    await expect(page.locator('.site-actions a[href*="pesquisa.html"]').first()).toBeVisible();
  }
});

test('catálogo indisponível não revela fixtures', async ({ page }) => {
  await page.route('**/api/catalog', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'catalog_not_verified', error: 'Catálogo em validação.' }) }));
  await page.goto('/comprar-arte.html');
  await expect(page.locator('body')).not.toContainText('Marina Silveira');
  await expect(page.locator('body')).not.toContainText('Estudo de Solo 04');
});

test('cadastro mantém perfil público de comprador e orienta confirmação', async ({ page }) => {
  await page.route('**/api/auth/session', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: false }) }));
  await page.route('**/api/auth/signup', async (route) => {
    const payload = route.request().postDataJSON();
    expect(payload.profileType).toBe('comprador');
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, authenticated: false, needsEmailConfirmation: true }) });
  });
  await page.goto('/cadastro.html');
  await page.locator('[data-signup-form] input[name="fullName"]').fill('Pessoa Teste');
  await page.locator('[data-signup-form] input[name="email"]').fill('pessoa@example.com');
  await page.locator('[data-signup-form] input[name="password"]').fill('senha-segura');
  await page.locator('[data-signup-form]').evaluate((form) => form.requestSubmit());
  await expect(page.locator('[data-signup-form] [data-auth-status]')).toContainText('confirme a conta');
});

// Catraca do defeito que esta rodada corrigiu: com a listagem fechada, quem
// liga filtro, ordenação, atalho de coleção e painel de compra rápida aos seus
// eventos é o mesmo caminho de sucesso que não aconteceu. Os controles ficavam
// na página, visíveis e clicáveis, sem efeito nenhum — nem resultado, nem
// explicação. O contrato aqui é funcional: se o controle continua na página,
// ele tem de responder.
const SUPERFICIES_DE_LISTAGEM = [
  {
    rota: '/comprar-arte.html',
    api: '**/api/catalog',
    controles: '[data-catalog-controls], [data-toggle-filters], [data-ux-collections], [data-quick-buy-panel], [data-listing-only]'
  },
  {
    rota: '/artistas.html',
    api: '**/api/artists',
    controles: '[data-artists-controls]'
  }
];

for (const superficie of SUPERFICIES_DE_LISTAGEM) {
  test(`com a listagem fechada, ${superficie.rota} não deixa controle inerte na página`, async ({ page }) => {
    for (const rota of ['**/api/catalog', '**/api/artists']) {
      await page.route(rota, (route) => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, code: 'catalog_not_verified', error: 'Catálogo em validação.' })
      }));
    }
    await page.goto(superficie.rota);
    await expect(page.locator('.catalog-unavailable')).toBeVisible();
    await expect(page.locator(superficie.controles)).toHaveCount(0);

    // Nada de esconder o problema num controle invisível mas focável.
    const focaveisSemEfeito = await page.evaluate(() => document.querySelectorAll(
      '[data-catalog-controls], [data-toggle-filters], [data-ux-collections], [data-quick-buy-panel], [data-artists-controls], [data-listing-only]'
    ).length);
    expect(focaveisSemEfeito).toBe(0);

    // A saída real continua na página: a listagem fecha, o produto não.
    await expect(page.locator('.arandu-rescue-actions a[href*="contato.html"]').first()).toBeVisible();
    await expect(page.locator('.arandu-rescue-actions a[href*="para-artistas.html"]').first()).toBeVisible();
  });
}

// Com a listagem aberta, os mesmos controles precisam continuar existindo e
// operando — a correção acima não pode virar uma poda permanente.
test('com o acervo aberto, os filtros do catálogo continuam na página e operam', async ({ page }) => {
  await page.route('**/api/catalog', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      verifiedReady: true,
      items: [
        { id: 'obra-a', title: 'Horizonte Seco', artist_name: 'Artista A', technique: 'Pintura', price: 4200, status: 'available' },
        { id: 'obra-b', title: 'Maré Alta', artist_name: 'Artista B', technique: 'Fotografia', price: 2800, status: 'available' }
      ]
    })
  }));
  await page.goto('/comprar-arte.html');
  await expect(page.locator('[data-card-artwork]')).toHaveCount(2);
  await expect(page.locator('[data-catalog-controls]')).toHaveCount(1);
  await expect(page.locator('[data-quick-buy-panel]')).toHaveCount(1);

  await page.locator('[data-ux-catalog-search]').fill('Maré');
  await expect(page.locator('[data-card-artwork]')).toHaveCount(1);
});

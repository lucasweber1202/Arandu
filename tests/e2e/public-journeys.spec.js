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
  await expect(page.locator('a[href*="pesquisa.html"]').first()).toBeVisible();
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

import { test, expect } from '@playwright/test';

test('modo de apresentação identifica o ambiente e carrega acervo demonstrativo', async ({ page }) => {
  await page.goto('/comprar-arte.html');
  await expect(page.locator('.presentation-banner')).toContainText('Ambiente de apresentação');
  await expect(page.locator('[data-card-artwork]')).toHaveCount(22);
  await expect(page.locator('body')).toContainText('Estudo de Solo Nº 04');
});

test('reserva demonstrativa não chama a API nem persiste PII', async ({ page }) => {
  let reservationWrites = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/reservations') && request.method() !== 'GET') reservationWrites += 1;
  });
  await page.goto('/comprar-arte.html');
  await page.locator('[data-reserve-artwork]').first().click();
  const form = page.locator('[data-reserve-form]');
  await form.locator('[name="name"]').fill('Pessoa Demonstrativa');
  await form.locator('[name="whatsapp"]').fill('11999999999');
  await form.evaluate((node) => node.requestSubmit());
  await expect(page.locator('[data-reserve-status]')).toContainText('Nenhuma reserva, contato ou transação foi enviada');
  expect(reservationWrites).toBe(0);
  const stored = await page.evaluate(() => sessionStorage.getItem('arandu.presentation.reservations.v1'));
  expect(stored).not.toContain('Pessoa Demonstrativa');
  expect(stored).not.toContain('11999999999');
});

test('certificado demonstrativo nunca é apresentado como válido comercialmente', async ({ page }) => {
  await page.goto('/verificar-certificado.html');
  await page.locator('[data-certificate-code]').fill('ARD-2026-0001');
  await page.locator('[data-certificate-form]').evaluate((node) => node.requestSubmit());
  await expect(page.locator('[data-certificate-result]')).toContainText('sem validade comercial');
});

test('conta e operação demonstrativas não fingem autenticação ou evidência real', async ({ page }) => {
  await page.goto('/minha-conta.html');
  await expect(page.locator('[data-account-panel]')).toContainText('Nenhuma sessão real foi criada');
  await expect(page.locator('[data-account-orders]')).toContainText('Nenhum pedido ou pagamento foi criado');
  await page.goto('/admin-preview.html');
  await expect(page.locator('main')).toContainText('não constitui evidência operacional');
  await expect(page.locator('main')).toContainText('não concede acesso administrativo');
});

test('layout móvel não cria rolagem horizontal', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'Validação específica dos projetos móveis.');
  for (const path of ['/index.html', '/comprar-arte.html', '/minha-conta.html']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} possui overflow horizontal`).toBeLessThanOrEqual(1);
  }
});

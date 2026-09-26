import { test, expect } from '@playwright/test';

// Build de apresentação (preview): o site público leva à demonstração, e o
// portal real continua exigindo sessão — dado fictício só existe em /demo.

test('a página inicial oferece a demonstração sem esconder o acesso real', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Contratações financeiras');
  await expect(page.getByRole('link', { name: 'Explorar demonstração' })).toHaveAttribute('href', '/demo/index.html');
  await expect(page.getByRole('link', { name: /Acessar plataforma/ })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Comprar arte|Artistas|Curadoria antes da vitrine/);
});

test('no mesmo build, o portal real continua exigindo login e não mistura dado fictício', async ({ page }) => {
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('#view')).toContainText('Entre para usar o portal');
  await expect(page.locator('.demo-banner')).toHaveCount(0);
  await expect(page.locator('#view')).not.toContainText(/Acme|DEMO/);
  // O atalho para a demo é explícito e leva para outro espaço de endereços.
  await expect(page.getByRole('link', { name: 'Explorar a demonstração' })).toHaveAttribute('href', '/demo/index.html');
});

test('layout móvel da demonstração não cria rolagem horizontal', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'Validação específica dos projetos móveis.');
  for (const path of ['/', '/demo/index.html', '/demo/finance/dashboard.html', '/demo/finance/rfqs.html', '/demo/finance/contracts.html', '/demo/provider/index.html']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} possui overflow horizontal`).toBeLessThanOrEqual(1);
  }
});

import { test, expect } from '@playwright/test';

test('B2B landing and both workspaces are reachable and operable on every browser profile', async ({ page }) => {
  await page.goto('/b2b/index.html');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Documentos, evidências');
  for (const [path,title] of [['export.html','Export Compliance'],['finance.html','Financial Procurement']]) {
    await page.goto(`/b2b/${path}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    await expect(page.getByRole('button', { name: 'Criar organização' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pular para conteúdo' })).toHaveAttribute('href','#main');
    const unlabeled = await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(nodes =>
      nodes.filter(node => !node.getAttribute('aria-label') && !node.labels?.length).map(node => node.outerHTML));
    expect(unlabeled).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  }
  await page.goto('/b2b/passport.html?token=bad');
  await expect(page.locator('#passport')).toContainText('Identificador inválido');
});

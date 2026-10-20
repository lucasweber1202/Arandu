import { test, expect } from '@playwright/test';

// Visita guiada pública (P0-A): entrada → visita → etapas por link profundo,
// comprador e instituição, sem rolagem horizontal e sem chamada de API.

test('entrada leva à visita guiada com uma ação principal', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demo/index.html');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contratações financeiras, do pedido à renovação.');
  await expect(page.locator('.btn-primary')).toHaveCount(1);
  await expect(page.locator('#sobre')).toContainText('Simulação no navegador');
  await expect(page.locator('#sobre')).toContainText('Não está disponível neste link');
  await page.getByRole('link', { name: 'Conhecer a plataforma' }).click();
  await expect(page).toHaveURL(/\/demo\/visita\.html$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Uma contratação financeira, do pedido à renovação');
  await expect(page.getByRole('region', { name: 'Ambiente demonstrativo' })).toContainText('dados fictícios');
  await page.waitForLoadState('networkidle');
  // Volta pelo cabeçalho: nenhum erro de transição em nenhum dos sentidos (#241).
  await page.locator('#topo a').click();
  await page.locator('.tour-header').getByRole('link', { name: 'Início', exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/index\.html$/);
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});

test('a jornada completa avança e volta etapa por etapa, sem API', async ({ page }) => {
  const api = [];
  page.on('request', (request) => { if (request.url().includes('/api/')) api.push(request.url()); });
  await page.goto('/demo/visita.html');
  await page.getByRole('link', { name: 'Começar pela etapa 1' }).click();
  const titles = ['O que pede atenção hoje', 'A solicitação financeira', 'Convites às instituições', 'Propostas e versões', 'Comparação lado a lado',
    'Aprovação com responsabilidades separadas', 'O contrato registrado', 'Depois da assinatura', 'A instituição recebe o convite', 'Preparar e enviar a proposta'];
  for (const [index, title] of titles.entries()) {
    const current = page.locator('.tour-step.is-current');
    await expect(current.getByRole('heading', { level: 2 })).toContainText(title);
    await expect(current).toContainText(`Etapa ${index + 1} de ${titles.length}`);
    await expect(current).toContainText('Visita informativa');
    await expect(page.locator('.tour-steps [aria-current="step"]')).toContainText(title);
    if (index < titles.length - 1) await current.getByRole('link', { name: `${titles[index + 1]} →` }).click();
  }
  await page.locator('.tour-step.is-current').getByRole('link', { name: 'Ver as cinco áreas →' }).click();
  for (const area of ['Meu trabalho', 'Contratações', 'Portfólio financeiro', 'Relacionamentos', 'Governança']) await expect(page.locator('#areas')).toContainText(area);
  await page.goBack();
  await expect(page.locator('.tour-step.is-current h2')).toContainText('Preparar e enviar a proposta');
  expect(api).toEqual([]);
});

test('links profundos abrem a etapa; etapa inexistente explica e volta ao início', async ({ page }) => {
  await page.goto('/demo/visita.html#comparacao');
  const current = page.locator('.tour-step.is-current');
  await expect(current).toHaveAttribute('id', 'comparacao');
  await expect(current).toContainText('Lumina Pay v2');
  // No celular a tabela vira cartões: cada valor leva o nome da instituição.
  await expect(current.locator('td[data-label="Lumina Pay v2"]').first()).toBeAttached();
  await expect(current).not.toContainText(/recomendad|vencedora|melhor opção/i);
  await page.goto('/demo/visita.html#instituicao');
  await expect(page.locator('.tour-step.is-current')).toContainText('Instituição financeira');
  await expect(page.locator('.tour-step.is-current')).toContainText('somente as solicitações');
  await page.goto('/demo/visita.html#nao-existe');
  await expect(page.getByRole('status')).toHaveText('Esta etapa não existe. Você está no início da visita.');
  await page.getByRole('link', { name: 'Início', exact: true }).click();
  await expect(page).toHaveURL(/\/demo\/index\.html$/);
});

test('teclado: pular para o conteúdo e navegar pelas etapas', async ({ page, browserName }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile-') || browserName === 'webkit', 'Tab em links depende de preferência do sistema no WebKit.');
  await page.goto('/demo/visita.html');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#topo')).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  await page.locator('.tour-steps a[href="#aprovacao"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#aprovacao-title')).toBeFocused();
});

test('sem rolagem horizontal na entrada e nas etapas', async ({ page }) => {
  for (const path of ['/', '/demo/index.html', '/demo/visita.html', '/demo/visita.html#comparacao', '/demo/visita.html#continuidade', '/demo/visita.html#areas']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} possui overflow horizontal`).toBeLessThanOrEqual(1);
  }
  const broken = [];
  page.on('response', (response) => { if (response.status() >= 400) broken.push(`${response.status()} ${response.url()}`); });
  await page.goto('/demo/visita.html');
  await page.waitForLoadState('networkidle');
  expect(broken).toEqual([]);
});

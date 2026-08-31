import { test, expect } from '@playwright/test';

test('modo de apresentação identifica o ambiente e carrega acervo demonstrativo', async ({ page }) => {
  await page.goto('/comprar-arte.html');
  const banner = page.locator('.presentation-banner');
  await expect(banner).toContainText('Ambiente de apresentação');

  // O aviso precisa ser legível: um `strong { color }` global com `!important`
  // já derrubou o rótulo para 1.41:1 sobre o vinho do banner.
  const contraste = await banner.evaluate((elemento) => {
    const componentes = (valor) => (valor.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const canal = (bruto) => {
      const v = bruto / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const luminancia = ([r, g, b]) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    const fundo = luminancia(componentes(getComputedStyle(elemento).backgroundColor));
    return [...elemento.querySelectorAll('strong, span')].map((no) => {
      const [claro, escuro] = [luminancia(componentes(getComputedStyle(no).color)), fundo].sort((a, b) => b - a);
      return (claro + 0.05) / (escuro + 0.05);
    });
  });
  for (const razao of contraste) expect(razao).toBeGreaterThanOrEqual(4.5);

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
  await expect(page.locator('main')).toContainText('não constituem evidência operacional');
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

// Frase que a página só pode dizer com o acervo fechado.
//
// comprar-arte.html anunciava "o acervo ainda está em validação curatorial" e
// "a listagem abaixo só abre quando os dados forem reais" — com 22 obras
// desenhadas logo abaixo. A cópia honesta do estado publicado virava
// contradição justamente na tela em que a demonstração começa.
test('nenhuma página do ambiente demonstrativo nega o acervo que ela mesma mostra', async ({ page }) => {
  const NEGACOES = [
    'ainda está em validação curatorial',
    'só abre quando os dados forem reais',
    'quando o acervo abrir',
    'O acervo abre depois da validação curatorial'
  ];
  for (const rota of ['/index.html', '/comprar-arte.html']) {
    await page.goto(rota);
    await page.waitForLoadState('networkidle').catch(() => {});
    const texto = await page.locator('body').innerText();
    for (const negacao of NEGACOES) {
      expect(texto, `${rota} nega o acervo demonstrativo: "${negacao}"`).not.toContain(negacao);
    }
  }

  // A troca só pode valer para a frase marcada: o aviso de ambiente continua.
  await expect(page.locator('.presentation-banner')).toContainText('demonstrativos');
  await expect(page.locator('[data-card-artwork]')).toHaveCount(22);
});

import { test, expect } from '@playwright/test';

// Jornadas do Arandu Financial Procurement no build publicado (sem modo de
// demonstração e sem sessão): o que se verifica aqui é a navegação, os estados
// vazios/negados, a acessibilidade dos formulários e a ausência de qualquer
// ranking subjetivo. O fluxo com dados reais é coberto por
// `npm run test:database` (Postgres real) e pelas suítes de API.

const COMPANY_PAGES = [
  ['/finance/index.html', 'Procurement financeiro para a sua empresa'],
  ['/finance/dashboard.html', 'Painel'],
  ['/finance/rfqs.html', 'Solicitações (RFQs)'],
  ['/finance/rfq.html', 'Detalhe da solicitação'],
  ['/finance/providers.html', 'Provedores'],
  ['/finance/proposals.html', 'Propostas recebidas'],
  ['/finance/contracts.html', 'Contratos e renovações'],
  ['/finance/settings.html', 'Perfil financeiro da empresa'],
  ['/finance/boundaries.html', 'Limites do produto']
];

const PROVIDER_PAGES = [
  ['/provider/index.html', 'Portal do provedor'],
  ['/provider/rfqs.html', 'RFQs atribuídas'],
  ['/provider/proposal.html', 'Responder proposta']
];

test('portais da empresa e do provedor abrem, são acessíveis e cabem na viewport', async ({ page }) => {
  for (const [path, heading] of [...COMPANY_PAGES, ...PROVIDER_PAGES]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.getByRole('link', { name: 'Pular para o conteudo' })).toHaveAttribute('href', '#main');

    // Nenhum controle sem nome acessível.
    const unlabeled = await page.locator('input:not([type=hidden]),select,textarea')
      .evaluateAll((nodes) => nodes
        .filter((node) => !node.getAttribute('aria-label') && !node.labels?.length)
        .map((node) => node.outerHTML));
    expect(unlabeled, `controles sem rótulo em ${path}`).toEqual([]);

    // Sem rolagem horizontal, inclusive nos perfis móveis.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `overflow horizontal em ${path}`).toBeLessThanOrEqual(1);

    // A fronteira de produto é declarada em toda página operacional do portal;
    // a própria página de limites é a versão longa dela.
    if (path === '/finance/boundaries.html') await expect(page.locator('main')).toContainText('não concede crédito');
    else await expect(page.locator('.boundary')).toContainText('não concede crédito');
  }
});

test('a navegação entre os portais funciona por links reais, sem depender de JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/finance/index.html');
  await page.getByRole('navigation', { name: 'Navegacao do portal' }).getByRole('link', { name: 'Contratos' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contratos e renovações');
  await page.getByRole('link', { name: 'Portal do provedor' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Portal do provedor');
  // Sem JavaScript o painel explica a limitação em vez de ficar em branco.
  // O <noscript> não entra em innerText, então a verificação é no DOM.
  expect(await page.locator('#view').textContent()).toContain('depende de JavaScript');
  await context.close();
});

test('sem sessão o portal pede login em vez de mostrar dado de outra organização', async ({ page }) => {
  await page.goto('/finance/dashboard.html');
  const view = page.locator('#view');
  await expect(view).toContainText(/Entre para usar o portal|Acesso negado|Conteúdo indisponível/);
  await expect(view.getByRole('link', { name: 'Entrar na conta' })).toBeVisible();
  // Nenhum dado de demonstração vaza para o build publicado.
  await expect(page.locator('#demo-notice')).toHaveCount(0);
  await expect(page.locator('.demo-flag')).toHaveCount(0);
});

test('o formulário de proposta do provedor traz os campos normalizados do produto', async ({ page }) => {
  await page.goto('/provider/proposal.html');
  const form = page.locator('#proposal-form');
  await expect(form).toBeVisible();
  for (const label of ['Instituição', 'Valor ofertado (R$)', 'Taxa (% a.m.)', 'Prazo (meses)', 'Validade da proposta']) {
    await expect(form.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(page.locator('#view')).toContainText('nova versão');
});

test('nenhuma página do portal promete aprovação, recomendação ou ranking', async ({ page }) => {
  // boundaries.html fica de fora: é justamente a página que cita as expressões
  // proibidas para explicar que o Arandu não as usa.
  const operational = [...COMPANY_PAGES, ...PROVIDER_PAGES].filter(([path]) => path !== '/finance/boundaries.html');
  for (const [path] of operational) {
    await page.goto(path);
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text, path).not.toMatch(/recomendação do arandu|melhor banco|melhor instituição|aprovação garantida|garantimos aprovação/);
  }
});

test('o portal do provedor permite salvar rascunho local e recuperá-lo', async ({ page }) => {
  await page.goto('/provider/proposal.html');
  const form = page.locator('#proposal-form');
  await form.getByLabel('Instituição', { exact: true }).fill('Banco Alfa Demo');
  await form.getByLabel('Taxa (% a.m.)', { exact: true }).fill('1.85');
  await page.getByRole('button', { name: 'Salvar rascunho local' }).click();
  await expect(page.locator('#message')).toHaveText('Rascunho salvo neste navegador.');
  await page.reload();
  await expect(page.locator('#proposal-form').getByLabel('Instituição', { exact: true })).toHaveValue('Banco Alfa Demo');
});

test('o teclado alcança a navegação e o conteúdo principal', async ({ page }) => {
  await page.goto('/finance/rfqs.html');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('Pular para o conteudo');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

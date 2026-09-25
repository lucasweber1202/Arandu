import { test, expect } from '@playwright/test';

// O modo de apresentação publica apenas as rotas financeiras. As verificações
// históricas de acervo/arte foram substituídas por jornadas do produto atual.
test('prévia financeira rotula dados fictícios sem prometer operação real', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Contratações financeiras');
  await expect(page.locator('body')).not.toContainText(/Comprar arte|Artistas|Curadoria antes da vitrine/);
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('.demo-flag')).toHaveText('DEMONSTRATION DATA');
  await expect(page.locator('#demo-notice')).toContainText('fictícios');
});

test('explorar a prévia e aplicar pesos não escreve uma operação financeira', async ({ page }) => {
  const writes = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/finance/') && request.method() !== 'GET') writes.push(request.url());
  });
  await page.goto('/finance/rfq.html?id=demo-rfq-credito');
  await page.locator('#weights-form').getByLabel('Peso de Taxa (% a.m.)').fill('40');
  await page.getByRole('button', { name: 'Aplicar meus pesos' }).click();
  await expect(page.locator('#weights-output')).toContainText('pesos definidos por você');
  expect(writes).toEqual([]);
});

test('a superfície da prévia não oferece navegação para a vertical antiga', async ({ page }) => {
  await page.goto('/');
  const links = await page.locator('a[href]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
  expect(links.join(' ')).not.toMatch(/comprar-arte|artistas|colecoes|obras|catalogo/);
  await expect(page.getByRole('link', { name: /Acessar plataforma/ })).toBeVisible();
});

test('layout móvel financeiro não cria rolagem horizontal', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'), 'Validação específica dos projetos móveis.');
  for (const path of ['/', '/finance/rfqs.html', '/provider/rfqs.html']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} possui overflow horizontal`).toBeLessThanOrEqual(1);
  }
});

test('reutilização da RFQ demonstrativa copia demanda sem copiar proposta', async ({ page }) => {
  await page.goto('/finance/rfqs.html?clone=demo-rfq-credito#rfq-form');
  const form = page.locator('#rfq-form');
  await expect(form.getByLabel('Título da solicitação')).toHaveValue(/Nova solicitação/);
  await form.getByRole('button', { name: 'Continuar' }).click();
  await expect(form.getByLabel('Valor desejado (R$)')).toHaveValue('500000');
  await expect(page.locator('#view')).toContainText('Convites, propostas e decisões não são copiados');
});

// ---------------------------------------------------------------------------
// Arandu Financial Procurement — jornada demonstrativa.
//
// O conjunto de dados fictício só existe em build de apresentação, e o build
// de produção falha se a variável for ligada lá. Aqui se verifica que o fluxo
// crédito e adquirência vai da demanda à decisão, e que a comparação continua
// factual: nenhum "melhor provedor", nenhuma recomendação do Arandu.
// ---------------------------------------------------------------------------

test('procurement financeiro demonstra crédito e adquirência com dados rotulados', async ({ page }) => {
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('.demo-flag')).toHaveText('DEMONSTRATION DATA');
  await expect(page.locator('#demo-notice')).toContainText('fictícios');
  await expect(page.locator('.stat')).not.toHaveCount(0);
  // A economia nunca é inventada.
  await expect(page.locator('#view')).toContainText('Propostas por solicitação');
  await expect(page.locator('#view')).not.toContainText('Taxa de resposta');

  await page.goto('/finance/rfqs.html');
  await expect(page.getByRole('link', { name: /Capital de giro/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Adquirência/ })).toBeVisible();
});

test('a comparação de crédito destaca diferenças factuais e nunca recomenda', async ({ page }, testInfo) => {
  await page.goto('/finance/rfq.html?id=demo-rfq-credito');
  await expect(page.locator('#comparison-notice')).toContainText('O Arandu não recomenda instituições.');

  // A mesma comparação tem duas apresentações: tabela em tela larga e um
  // cartão por proposta no celular. Só uma delas está visível por vez.
  const mobile = (testInfo.project.use.viewport?.width ?? 1280) < 760;
  if (mobile) {
    const cards = page.locator('.compare-card');
    await expect(cards).toHaveCount(3);
    await expect(cards.filter({ hasText: 'Banco Alfa Demo' })).toBeVisible();
    await expect(page.locator('.comparison-wide')).toBeHidden();
    const best = cards.filter({ hasText: 'Banco Alfa Demo' }).locator('dd.best');
    await expect(best.filter({ hasText: 'menor valor informado' }).first()).toBeVisible();
  } else {
    const table = page.locator('table').first();
    for (const name of ['Banco Alfa Demo', 'Fintech Beta Demo', 'Crédito Gama Demo']) {
      await expect(table.getByRole('columnheader', { name })).toBeVisible();
    }
    // A menor taxa informada é marcada, com o critério verificável ao lado.
    const rateRow = table.locator('tr', { has: page.getByRole('rowheader', { name: 'Taxa (% a.m.)' }) });
    await expect(rateRow.locator('td.best')).toHaveCount(1);
    await expect(rateRow.locator('td.best')).toContainText('menor valor informado');
    await expect(rateRow.locator('td.best')).toContainText('1,72');
    await expect(page.locator('.comparison-cards')).toBeHidden();
  }

  // CET só aparece quando o provedor informou; a estimativa própria vem
  // rotulada, e quando não é calculável o motivo aparece no lugar do número.
  const view = page.locator('#view');
  await expect(view).toContainText('CET informado pelo provedor');
  await expect(view).toContainText('Estimativa do Arandu');
  // Banco Alfa Demo tem carência: a projeção PRICE não vale e o motivo é dito.
  await expect(view).toContainText('Estimativa não calculável: há carência');
  // Crédito Gama Demo é indexado ao CDI e amortiza em SAC.
  await expect(view).toContainText('taxa indexada a CDI');

  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).not.toContain('recomendação do arandu');
  expect(body).not.toContain('melhor proposta');
});

test('os pesos são da empresa e o resultado é rotulado como dela', async ({ page }) => {
  await page.goto('/finance/rfq.html?id=demo-rfq-credito');
  const form = page.locator('#weights-form');
  await expect(form).toBeVisible();
  // Antes de definir pesos não existe nenhuma ordenação.
  await expect(page.locator('#weights-output')).toBeEmpty();

  await form.getByLabel('Peso de Taxa (% a.m.)').fill('40');
  await form.getByLabel('Peso de Prazo (meses)').fill('25');
  await form.getByLabel('Peso de Carência (meses)').fill('20');
  await form.getByRole('button', { name: 'Aplicar meus pesos' }).click();

  const output = page.locator('#weights-output');
  await expect(output).toContainText('Resultado conforme os pesos definidos por você.');
  await expect(output).not.toContainText('Recomendação');
  await expect(output.locator('li')).toHaveCount(3);
  // A cobertura da pontuação aparece em cada linha: uma nota alta sobre pouco
  // peso respondido não pode passar por equivalente a uma proposta completa.
  await expect(output.locator('.coverage').first()).toContainText('Cobertura da pontuação:');
  await expect(output).toContainText('Pesos aplicados:');
});

test('a cobertura baixa é avisada em vez de liderar em silêncio', async ({ page }) => {
  await page.goto('/finance/rfq.html?id=demo-rfq-credito');
  const form = page.locator('#weights-form');
  // Tarifas: só Banco Alfa e Gama informaram valor comparável neste conjunto,
  // e CET só o Banco Alfa — critérios com resposta parcial.
  await form.getByLabel('Peso de CET informado (% a.a.)').fill('60');
  await form.getByLabel('Peso de Taxa (% a.m.)').fill('40');
  await form.getByRole('button', { name: 'Aplicar meus pesos' }).click();
  const output = page.locator('#weights-output');
  await expect(output).toContainText('Cobertura da pontuação: 40%');
  await expect(page.locator('#coverage-warning')).toContainText('não é comparável');
  // A proposta de cobertura baixa fica marcada e aparece por último.
  await expect(output.locator('li').last()).toContainText('cobertura baixa');
});

test('a comparação de adquirência traz MDR, PIX, antecipação e liquidação', async ({ page }, testInfo) => {
  await page.goto('/finance/rfq.html?id=demo-rfq-adquirencia');
  const labels = ['MDR débito (%)', 'MDR crédito à vista (%)', 'Taxa PIX (%)', 'Antecipação (% a.m.)', 'Prazo de liquidação (dias)'];
  const mobile = (testInfo.project.use.viewport?.width ?? 1280) < 760;
  if (mobile) {
    const card = page.locator('.compare-card').first();
    for (const label of labels) await expect(card.getByText(label, { exact: true })).toBeVisible();
    await expect(page.locator('.compare-card dd.best').first()).toBeVisible();
  } else {
    const table = page.locator('table').first();
    for (const label of labels) await expect(table.getByRole('rowheader', { name: label })).toBeVisible();
    const pixRow = table.locator('tr', { has: page.getByRole('rowheader', { name: 'Taxa PIX (%)' }) });
    await expect(pixRow.locator('td.best')).toContainText('menor valor informado');
  }
  const view = page.locator('#view');
  await expect(view).toContainText('Custo mensal estimado');
  // A antecipação não entra na conta: calculá-la exigiria volume antecipado e
  // prazo médio, que a empresa não declara.
  await expect(view).toContainText('sem antecipação');
});

test('contratos demonstrativos mostram a janela de renovação', async ({ page }) => {
  await page.goto('/finance/contracts.html');
  await expect(page.locator('#view')).toContainText(/Janela de renovação aberta desde|Iniciar revisão de renovação em/);
  await expect(page.locator('#view')).toContainText('Banco Alfa Demo');
});

test('o portal do provedor demonstra a resposta sem expor concorrentes', async ({ page }) => {
  await page.goto('/provider/rfqs.html');
  await expect(page.locator('#view')).toContainText('Capital de giro — R$ 500 mil (DEMO)');
  const body = (await page.locator('body').innerText()).toLowerCase();
  // Nenhuma condição de outro provedor aparece na tela do provedor.
  expect(body).not.toContain('fintech beta demo');
  expect(body).not.toContain('crédito gama demo');
});

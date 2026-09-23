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
  await expect(page.locator('#view')).toContainText('metodologia explícita');

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

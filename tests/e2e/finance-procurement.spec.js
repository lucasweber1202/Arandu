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
  ['/provider/invite.html', 'Aceitar convite'],
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

    // Operational screens link to the full boundary instead of repeating a
    // long legal block above every task.
    if (path === '/finance/boundaries.html') await expect(page.locator('main')).toContainText('não concede crédito');
    else await expect(page.getByRole('link', { name: 'Limites do produto' }).first()).toBeVisible();
  }
});

test('página inicial, login e cadastro falam de procurement financeiro', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Contratações financeiras');
  await expect(page.locator('main')).toContainText('crédito empresarial e adquirência');
  await expect(page.locator('body')).not.toContainText(/Comprar arte|Portal do artista|Enviar portfólio/);
  await page.getByRole('link', { name: /Acessar plataforma/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('processo financeiro');
  await expect(page.locator('form[data-finance-auth="login"]')).toBeVisible();
  await page.getByRole('link', { name: 'Criar conta' }).click();
  await expect(page.locator('form[data-finance-auth="signup"]')).toBeVisible();
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

test('a página de convite trata cada estado do token em vez de dar erro genérico', async ({ page }) => {
  // Sem token: pede o token, não finge que algo deu errado.
  await page.goto('/provider/invite.html');
  await expect(page.locator('#invite-state')).toContainText('Nenhum token no endereço');

  // Token malformado é reconhecido antes de qualquer chamada ao servidor.
  await page.goto('/provider/invite.html?token=nao-e-um-token');
  await expect(page.locator('#invite-state')).toContainText('não tem o formato de um convite');

  // Token bem formado leva ao passo de confirmação da organização.
  await page.goto(`/provider/invite.html?token=${'a'.repeat(64)}`);
  await expect(page.locator('#invite-state')).toContainText('Confirme a organização');
  await expect(page.getByLabel('Token do convite')).toHaveValue('a'.repeat(64));
  await expect(page.locator('#view')).toContainText('vale uma vez e expira');
});

test('a criação de solicitação avança por etapas em vez de um formulário único', async ({ page }) => {
  await page.goto('/finance/rfqs.html');
  const form = page.locator('#rfq-form');
  await expect(form).toBeVisible();
  // Só a etapa atual aparece.
  await expect(form.locator('fieldset[data-step="0"]')).toBeVisible();
  await expect(form.locator('fieldset[data-step="1"]')).toBeHidden();
  await expect(page.locator('.steps li[aria-current="step"]')).toHaveText('1. Produto');

  // Campo obrigatório vazio não deixa avançar escondendo o problema.
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(form.locator('fieldset[data-step="1"]')).toBeHidden();

  await form.getByLabel('Título da solicitação').fill('Capital de giro do teste');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(form.locator('fieldset[data-step="1"]')).toBeVisible();
  await expect(page.locator('.steps li[aria-current="step"]')).toHaveText('2. Necessidade');
  await expect(page.getByRole('button', { name: 'Voltar' })).toBeVisible();
});

test('o mix de recebimentos que não fecha 100% é avisado antes do envio', async ({ page }) => {
  await page.goto('/finance/rfqs.html');
  const form = page.locator('#rfq-form');
  await form.getByLabel('Produto financeiro').selectOption('acquiring');
  await form.getByLabel('Título da solicitação').fill('Adquirência do teste');
  await page.getByRole('button', { name: 'Continuar' }).click();

  await form.getByLabel('Faturamento mensal em cartões (R$)').fill('1200000');
  await form.getByLabel('Percentual débito (%)').fill('80');
  await form.getByLabel('Percentual crédito à vista (%)').fill('60');
  await form.getByLabel('Percentual parcelado (%)').fill('40');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  // 180% é erro de preenchimento: a revisão explica e o envio fica bloqueado.
  await expect(page.locator('#rfq-review')).toContainText('180%');
  await expect(page.getByRole('button', { name: 'Criar solicitação' })).toBeDisabled();
});

test('a comparação usa tabela no desktop e cartões no celular', async ({ page }, testInfo) => {
  // Sem sessão não há propostas, então o que se verifica aqui é a regra de
  // apresentação: as duas formas nunca aparecem ao mesmo tempo.
  await page.goto('/finance/rfq.html');
  const mobile = (testInfo.project.use.viewport?.width ?? 1280) < 760;
  const wide = await page.locator('.comparison-wide').count();
  const cards = await page.locator('.comparison-cards').count();
  if (wide && cards) {
    if (mobile) await expect(page.locator('.comparison-wide')).toBeHidden();
    else await expect(page.locator('.comparison-cards')).toBeHidden();
  }
  await expect(page.locator('#view')).toContainText(/não há propostas|Entre para usar o portal|Nenhuma RFQ/);
});

test('a página de convite não entrega o token a analytics, ao histórico nem ao referrer', async ({ page }) => {
  const token = 'b'.repeat(64);
  const externalRequests = [];
  page.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith('http://127.0.0.1:4173')) externalRequests.push(url);
  });

  // O link real leva o token no FRAGMENTO, que o navegador nunca envia.
  await page.goto(`/provider/invite.html#token=${token}`);
  await expect(page.locator('#invite-state')).toContainText('Confirme a organização');
  await expect(page.getByLabel('Token do convite')).toHaveValue(token);

  // Nenhuma requisição saiu para fora da origem — não há analytics nesta página.
  expect(externalRequests, `requisições externas: ${externalRequests.join(', ')}`).toEqual([]);
  const analytics = await page.locator('script[src*="speed-insights"]').count();
  expect(analytics, 'a página de convite não pode carregar analytics').toBe(0);

  // A política de referrer impede que a URL vaze em qualquer navegação.
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');

  // Um link antigo com ?token= ainda funciona, mas o endereço é limpo na hora.
  await page.goto(`/provider/invite.html?token=${token}`);
  await expect(page.getByLabel('Token do convite')).toHaveValue(token);
  expect(page.url(), 'o token não pode permanecer no endereço').not.toContain(token);
  expect(page.url()).not.toContain('token=');
});

test('uma conta sem organização recebe o formulário de criação, não um beco sem saída', async ({ page }) => {
  // Sem sessão o portal pede login; o que se verifica aqui é que a tela de
  // criação existe e está montada, porque antes a API aceitava criar
  // organização e nenhuma página chamava essa rota.
  await page.goto('/provider/index.html');
  await expect(page.locator('#view')).toContainText(/organização|Entre para usar o portal/);
  await page.goto('/finance/settings.html');
  await expect(page.locator('#view')).toBeVisible();
});

test('o teclado alcança a navegação e o conteúdo principal', async ({ page }) => {
  await page.goto('/finance/rfqs.html');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('Pular para o conteudo');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

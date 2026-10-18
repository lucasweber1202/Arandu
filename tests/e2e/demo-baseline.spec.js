// Jornada central da demonstração canônica (Vitta Foods) no produto real.
// Pré-requisito: app em ARANDU_ENV=demo com o dataset de scripts/demo/seed.mjs
// (npm run demo:setup). Só leitura, exceto a jornada de responsáveis de tarefa,
// que devolve o responsável original e cancela a tarefa que cria.
import { test, expect } from '@playwright/test';

const PASSWORD = process.env.ARANDU_DEMO_PASSWORD;
const PEOPLE = {
  juliana: 'juliana.ramos@vittafoods.example',
  helena: 'helena.duarte@vittafoods.example',
  carlos: 'carlos.tavares@vittafoods.example',
  diego: 'diego.freitas@luminapay.example',
  eduardo: 'eduardo.lima@atlasbank.example'
};

test.skip(!PASSWORD, 'Defina ARANDU_DEMO_PASSWORD (scripts/pilot-local/.state/demo.env) para rodar a jornada da demonstração.');

function watch(page) {
  const problems = [];
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') problems.push(`console: ${message.text()}`); });
  page.on('response', (response) => { if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/api/')) problems.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  return problems;
}

async function login(page, who) {
  await page.goto('/login.html');
  await page.getByLabel('E-mail corporativo').fill(PEOPLE[who]);
  await page.getByLabel('Senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/(finance|provider)\//);
  await expect(page.locator('#view')).not.toHaveAttribute('aria-busy', 'true');
}

async function openRfq(page, titleStart) {
  await page.waitForFunction(() => Array.isArray(window.__aranduCtx?.data?.rfqs));
  const id = await page.evaluate((start) => window.__aranduCtx.data.rfqs.find((rfq) => rfq.title.startsWith(start))?.id, titleStart);
  expect(id, `RFQ "${titleStart}"`).toBeTruthy();
  await page.goto(`/finance/rfq.html?id=${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(titleStart);
}

test('tesouraria: painel → RFQ concluída → propostas → comparação → aprovação → decisão → contrato → renovação', async ({ page, isMobile }) => {
  const problems = watch(page);
  await login(page, 'juliana');

  // Painel: a empresa já opera o procurement financeiro no Arandu.
  await expect(page).toHaveURL(/\/finance\//);
  await expect(page.locator('#environment-chip')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Precisa de você' })).toBeVisible();
  await expect(page.locator('#precisa-de-voce')).toContainText('Decidir renovação: Atlas Bank');
  await expect(page.locator('#precisa-de-voce')).not.toContainText('undefined');
  const summary = page.locator('.summary-strip');
  await expect(summary).toContainText('Contratos vigentes3');
  await expect(summary).toContainText('Aguardando aprovação1');

  // RFQ de adquirência concluída: convidados, propostas e versões.
  await openRfq(page, 'Adquirência');
  await expect(page.locator('#convites')).toContainText('3 convidados · 3 responderam');
  await expect(page.locator('#convites')).toContainText('Lumina Pay');
  await page.getByRole('tab', { name: /Propostas/ }).click();
  await expect(page.locator('#view')).toContainText('Nexo Payments');
  await expect(page.locator('#view')).toContainText('Atlas Bank');

  // Comparação com os pesos registrados na decisão.
  await page.getByRole('tab', { name: 'Comparação' }).click();
  await expect(page.locator('#view')).toContainText('MDR crédito à vista');
  await expect(page.locator('#weights-origin')).toContainText('Pesos registrados na decisão');
  await expect(page.locator('.score-list li')).toHaveCount(3);
  if (!isMobile) await expect(page.locator('.score-list li').first()).toContainText('Lumina Pay');

  // Aprovação em duas etapas, decisão com justificativa e contrato.
  await page.getByRole('tab', { name: 'Aprovações' }).click();
  await expect(page.locator('#view')).toContainText('Carlos Tavares');
  await expect(page.locator('#view')).toContainText('Helena Duarte');
  await page.getByRole('tab', { name: 'Decisão' }).click();
  await expect(page.locator('#view')).toContainText('Lumina Pay · proposta v2');
  await expect(page.locator('#view')).toContainText('Aprovado pelo Controller e pela CFO');
  await page.getByRole('link', { name: 'Abrir ciclo de vida do contrato' }).click();

  // Contratos: renovação na janela, com próxima ação.
  await expect(page).toHaveURL(/contracts\.html/);
  await expect(page.locator('#view')).toContainText('Atlas Bank');
  await expect(page.locator('#view')).toContainText('Janela de renovação aberta');
  await expect(page.getByRole('button', { name: 'Iniciar nova concorrência' }).first()).toBeEnabled();

  // Colaboração na RFQ em negociação.
  await page.goto('/finance/rfqs.html');
  await openRfq(page, 'Capital de giro — nova linha');
  await expect(page.locator('#convites')).toContainText('Meridian Financial');
  await expect(page.locator('#view')).toContainText('Aguardando Helena Duarte');
  await page.getByRole('tab', { name: 'Atividade' }).click();
  await expect(page.locator('#view')).toContainText('redução da TAC');

  // Tarefas e avisos reais.
  await page.goto('/finance/tasks.html');
  await expect(page.locator('#view')).toContainText('covenant');
  await page.goto('/finance/notifications.html');
  await expect(page.locator('#view')).toContainText('Contrato em revisão de renovação');

  expect(problems, problems.join('\n')).toEqual([]);
});

test('CFO: aprovação pendente chega a ela, com contexto', async ({ page }) => {
  const problems = watch(page);
  await login(page, 'helena');
  await expect(page.locator('#precisa-de-voce')).toContainText('Aprovar: Capital de giro — nova linha');
  await page.goto('/finance/approvals.html');
  await expect(page.locator('#view')).toContainText('Etapa 2 de 2');
  await expect(page.getByRole('button', { name: 'Aprovar' })).toBeEnabled();
  await page.goto('/finance/notifications.html');
  await expect(page.locator('#view')).toContainText('Aprovação solicitada');
  expect(problems, problems.join('\n')).toEqual([]);
});

test('provedor: entra pelo login comum e cai no próprio portal, sem ver concorrentes', async ({ page }) => {
  const problems = watch(page);
  await login(page, 'eduardo');
  await expect(page).toHaveURL(/\/provider\//);
  await expect(page.locator('.side-user-name')).toHaveText('Eduardo Lima');
  await page.goto('/provider/rfqs.html');
  await expect(page.locator('#view')).toContainText('Capital de giro — nova linha');
  const text = await page.locator('#view').innerText();
  for (const competitor of ['Orbe Capital', 'Meridian', 'Nexo', 'Lumina']) expect(text).not.toContain(competitor);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('Financial Passport: cobertura, proveniência, histórico e fotografia na RFQ; provedor não alcança', async ({ page, browser }) => {
  const problems = watch(page);
  await login(page, 'juliana');
  await page.waitForFunction(() => Boolean(window.__aranduCtx?.organization?.id));
  const org = await page.evaluate(() => window.__aranduCtx.organization.id);
  await page.goto('/finance/passport.html');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Financial Passport');
  await expect(page.locator('#field-receita_anual')).toContainText('R$ 182.000.000');
  await expect(page.locator('#field-receita_anual')).toContainText('Rafael Menezes');
  await expect(page.locator('#field-volume_cartoes_mensal [data-freshness]')).toHaveAttribute('data-freshness', 'stale');
  await expect(page.locator('#field-garantias_disponiveis')).toContainText('confirmado');
  await expect(page.locator('.passport-notice')).toContainText('Não é nota de risco');
  await page.getByRole('button', { name: 'Histórico de Faturamento anual (R$)' }).click();
  await expect(page.getByRole('dialog')).toContainText('R$ 158.000.000 → R$ 182.000.000');
  await page.keyboard.press('Escape');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await openRfq(page, 'Capital de giro — nova linha');
  await expect(page.locator('#passport')).toContainText('Mudanças posteriores no Passport não alteram este processo');
  await expect(page.locator('#passport')).toContainText('usado sem alteração');
  expect(problems, problems.join('\n')).toEqual([]);

  // Provedor convidado na mesma RFQ: sessão real, nenhuma linha do Passport.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const provider = await context.newPage();
  await login(provider, 'eduardo');
  for (const path of [`profile?organization_id=${org}`, `profile/history?organization_id=${org}&field_key=receita_anual`]) {
    const response = await provider.request.get(`/api/finance/${path}`);
    expect(response.status(), path).toBe(403);
    expect(await response.text()).not.toContain('182000000');
  }
  await context.close();
});

// Pós-contrato: a mesma demo canônica conta a história até a próxima renovação.
// Só leitura. Dados de scripts/demo/dataset.mjs → LIFECYCLE.
test('pós-contrato: implantação → covenants → performance → spend → qualificação → documento → oportunidades → executivo e busca', async ({ page }) => {
  const problems = watch(page);
  await login(page, 'juliana');
  const noOverflow = async (label) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), label).toBeLessThanOrEqual(1);
  const open = async (path, heading) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.locator('#view [role=status].loading-state')).toHaveCount(0);
    await noOverflow(path);
  };

  // Do contrato à implantação: a página diz de qual contrato a pessoa veio, que o
  // recorte é o próprio contrato (contract_id, #211) e a devolve ao cartão.
  await open('/finance/contracts.html', 'Contratos e renovações');
  await page.locator('.contract-card', { hasText: 'Lumina Pay' }).getByRole('link', { name: 'Implantação deste contrato' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Implantação pós-award');
  const origin = page.getByRole('complementary', { name: 'Contrato de origem' });
  await expect(origin).toContainText('com Lumina Pay');
  await expect(origin).toContainText('Filtro aplicado: este contrato.');
  await expect(page.locator('#view')).toContainText('Migração da adquirência para a Lumina Pay');
  await noOverflow('implantação vinda do contrato');
  await origin.getByRole('link', { name: 'Voltar ao contrato' }).click();
  await expect(page).toHaveURL(/\/finance\/contracts\.html#contract-/);
  await expect(page.locator('.contract-card:focus')).toContainText('Lumina Pay');

  await open('/finance/implementations.html', 'Implantação pós-award');
  await expect(page.locator('#view')).toContainText('Migração da adquirência para a Lumina Pay');
  await expect(page.locator('#view')).toContainText('Bloqueada');
  await page.getByRole('button', { name: 'Detalhe' }).first().click();
  await expect(page.getByRole('dialog')).toContainText('Remessa de 60 terminais');
  await expect(page.getByRole('dialog')).toContainText('Nenhum aceite. Serviço ativo não é inferido.');
  await page.keyboard.press('Escape');

  await open('/finance/covenants.html', 'Covenants e obrigações');
  for (const state of ['Conforme após revisão', 'Waiver vigente']) await expect(page.locator('#view')).toContainText(state);
  await expect(page.locator('#view')).toContainText(/Aguardando dados|Prazo próximo/);
  await expect(page.locator('#view')).toContainText('Dados ausentes ≠ conformidade');

  await open('/finance/performance.html', 'Performance do provedor');
  await expect(page.locator('#view')).toContainText('Primeiro mês da Lumina Pay');
  await expect(page.locator('#view')).toContainText('Sem nota universal ou recomendação de banco');

  await open('/finance/spend.html', 'Financial Spend');
  await expect(page.locator('#view')).toContainText('Não soma moedas ou tipos');
  await expect(page.locator('#view')).toContainText('Observado · BRL');
  await expect(page.locator('#view')).toContainText('Contratado · BRL');

  await open('/finance/qualifications.html', 'Qualificação de provedores');
  await expect(page.locator('#view')).toContainText('Atlas Bank');

  await open('/finance/extractions.html', 'Documentos e fatos extraídos');
  await expect(page.locator('#view')).toContainText('Cédula de crédito bancário');

  await open('/finance/opportunities.html', 'Oportunidades');
  await expect(page.locator('#view')).not.toContainText(/melhor proposta|recomendamos|vencedor/i);

  // Executivo no painel e busca global.
  await open('/finance/dashboard.html', 'Painel');
  await page.keyboard.press('Control+k');
  await page.locator('#command-query').fill('Lumina');
  await expect(page.locator('#command-results')).toContainText('Lumina');
  await page.keyboard.press('Escape');

  expect(problems, problems.join('\n')).toEqual([]);
});

test('responsáveis de tarefa no backend real: reatribuir, deixar sem responsável, recarregar, idempotência e recusas', async ({ page, browser, baseURL }) => {
  await login(page, 'juliana');
  const write = (method, body) => page.request.fetch('/api/finance/tasks', { method, data: body, headers: { Origin: new URL(baseURL).origin } });
  await page.waitForFunction(() => Boolean(window.__aranduCtx?.organization?.id));
  const org = await page.evaluate(() => window.__aranduCtx.organization.id);
  await page.goto('/finance/tasks.html');
  const row = page.locator('.task-item', { hasText: 'Confirmar TAC e tarifas da versão 2' });
  const select = row.locator('select.task-assignee');
  // Cada troca espera a resposta do servidor (PATCH) e a releitura da lista: nada de sucesso presumido.
  const assign = async (target, option) => {
    const saved = page.waitForResponse((r) => r.url().includes('/api/finance/tasks') && r.request().method() === 'PATCH');
    await target.selectOption(option);
    expect((await saved).status()).toBe(200);
    await page.waitForResponse((r) => r.url().includes('/api/finance/tasks?') && r.request().method() === 'GET');
  };
  const taskId = (await row.getAttribute('id')).replace('task-', '');
  // Seed: criada para Rafael e reatribuída a Juliana pela CFO, pela API real. Uma
  // execução anterior interrompida pode ter deixado outro responsável: devolve antes.
  if ((await select.locator('option:checked').textContent()) !== 'Juliana Ramos (você)') {
    await assign(select, { label: 'Juliana Ramos (você)' });
  }
  await expect(select.locator('option:checked')).toHaveText('Juliana Ramos (você)');
  await expect(select.locator('option')).not.toContainText(['Carlos Tavares']);
  await assign(select, { label: 'Rafael Menezes' });
  await page.reload();
  await expect(row.locator('select.task-assignee option:checked')).toHaveText('Rafael Menezes');
  await assign(row.locator('select.task-assignee'), '');
  await page.goto('/finance/tasks.html?filtro=sem-responsavel');
  await expect(row).toBeVisible();
  await assign(row.locator('select.task-assignee'), { label: 'Juliana Ramos (você)' });

  // Criação idempotente: mesma chave e mesmo conteúdo devolvem a mesma tarefa; conteúdo diferente é recusado.
  const key = crypto.randomUUID();
  const body = { organization_id: org, title: 'Tarefa de ensaio da demonstração (cancelada ao final)', due_on: null, idempotency_key: key };
  const first = await (await write('POST', body)).json();
  const again = await (await write('POST', body)).json();
  expect(again.row.id).toBe(first.row.id);
  const reused = await write('POST', { ...body, title: 'Outro conteúdo com a mesma chave' });
  expect(reused.status()).toBe(409);
  expect((await write('PATCH', { organization_id: org, task_id: first.row.id, status: 'cancelled' })).status()).toBe(200);

  // Leitor (controller): vê quem responde, não recebe controle e o servidor recusa a atribuição.
  const viewer = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  const carlos = await viewer.newPage();
  await login(carlos, 'carlos');
  await carlos.goto('/finance/tasks.html');
  await expect(carlos.locator('.task-item', { hasText: 'Confirmar TAC' })).toContainText('Juliana Ramos');
  await expect(carlos.locator('select.task-assignee')).toHaveCount(0);
  // Leitor também não recebe caixa de conclusão nem formulário de criação: o banco
  // (fin_task_edit) ignora a alteração dele, e a API ainda responde 200 sem gravar.
  await expect(carlos.locator('.task-item').getByRole('checkbox')).toHaveCount(0);
  await expect(carlos.locator('#task-new')).toHaveCount(0);
  await expect(carlos.locator('.task-readonly')).toBeVisible();
  const denied = await carlos.request.fetch('/api/finance/tasks', { method: 'PATCH', data: { organization_id: org, task_id: taskId, assignee_id: null }, headers: { Origin: new URL(baseURL).origin } });
  expect(denied.status()).toBe(403);
  const ignored = await carlos.request.fetch('/api/finance/tasks', { method: 'PATCH', data: { organization_id: org, task_id: taskId, status: 'done' }, headers: { Origin: new URL(baseURL).origin } });
  // Hoje 200 sem gravar (handoff ao Codex: 403/404). Seja qual for o código, nada muda.
  expect([200, 403, 404]).toContain(ignored.status());
  const reread = await (await page.request.get(`/api/finance/tasks?organization_id=${org}`)).json();
  expect(reread.rows.find((t) => t.id === taskId)?.status).toBe('open');
  await viewer.close();

  // Outra organização (instituição financeira) não lê nem altera tarefas da empresa.
  const provider = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  const eduardo = await provider.newPage();
  await login(eduardo, 'eduardo');
  const foreign = await eduardo.request.get(`/api/finance/tasks?organization_id=${org}`);
  expect(foreign.status()).toBeGreaterThanOrEqual(400);
  expect(JSON.stringify(await foreign.json())).not.toContain('Confirmar TAC');
  await provider.close();
});

// Jornada central da demonstração canônica (Vitta Foods) no produto real.
// Pré-requisito: app em ARANDU_ENV=demo com o dataset de scripts/demo/seed.mjs
// (npm run demo:setup). Só leitura: não altera o estado da demonstração.
import { test, expect } from '@playwright/test';

const PASSWORD = process.env.ARANDU_DEMO_PASSWORD;
const PEOPLE = {
  juliana: 'juliana.ramos@vittafoods.example',
  helena: 'helena.duarte@vittafoods.example',
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
  await expect(summary).toContainText('Contratos vigentes2');
  await expect(summary).toContainText('Aguardando aprovação1');

  // RFQ de adquirência concluída: convidados, propostas e versões.
  await openRfq(page, 'Adquirência');
  await expect(page.locator('#convites')).toContainText('3 convidado(s) · 3 responderam');
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

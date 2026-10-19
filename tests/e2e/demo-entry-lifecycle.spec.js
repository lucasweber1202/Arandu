// Roteiro comercial de 29/10 inteiro pela ENTRADA PÚBLICA, num único workspace
// de visitante, contra o produto REAL (ARANDU_ENV=demo + Supabase com o seed):
// gestora → RFQ, convites, propostas, comparação → CFO aprova → gestora vê o
// efeito → decisão e contrato → implantação, covenants e renovação → tarefa
// gravada → instituição envia e revisa proposta → outra instituição não alcança
// → gestora recebe a versão 2 → leitor sem escrita → sair.
//
//   npm run demo:setup
//   set -a; . scripts/pilot-local/.state/demo.env; set +a
//   npm run demo:local:workspaces -- provision --count=1
//   ARANDU_DEMO_LIFECYCLE_E2E=1 npx playwright test --config playwright.demo.config.js tests/e2e/demo-entry-lifecycle.spec.js --project=demo-desktop
//
// ESCREVE no workspace do visitante (nunca no baseline) e consome um workspace.
// Persistência só conta depois de recarregar: toast não é prova.
import { test, expect } from '@playwright/test';
import { RFQ_OPEN } from '../../scripts/demo/dataset.mjs';

// Flag própria: o harness de integração (scripts/ci-demo) liga ARANDU_DEMO_ENTRY_E2E
// com o pool dimensionado para as duas suítes de visitantes; este ensaio consome
// um workspace a mais e roda só quando a estação o pede (Roteiro B, passo 6).
const ENABLED = process.env.ARANDU_DEMO_LIFECYCLE_E2E === '1';
test.skip(!ENABLED, 'Defina ARANDU_DEMO_LIFECYCLE_E2E=1 com um workspace livre no pool local (consome um workspace).');

const settle = async (page) => {
  await page.waitForLoadState('networkidle').catch(() => null);
  await page.waitForFunction(() => document.querySelector('#view')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 }).catch(() => null);
};
/**
 * Troca de persona como o visitante faz: pela entrada pública. O limite legítimo
 * de entradas por rede (429) é respeitado esperando o tempo que a tela informa —
 * nunca trocando de identidade para contornar.
 */
async function enterAs(page, key, landing) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto('/login.html#demonstracao');
    const card = page.locator(`[data-persona="${key}"]`);
    await expect(card).toBeVisible({ timeout: 15000 });
    const response = page.waitForResponse((r) => r.url().endsWith('/api/auth/demo-login'));
    await card.click();
    const answer = await response;
    if (answer.status() === 429) {
      await expect(page.locator('.demo-entry-status')).toContainText('Muitas entradas', { timeout: 5000 });
      await page.waitForTimeout(Math.min(Number(answer.headers()['retry-after'] || 60), 600) * 1000 + 1000);
      continue;
    }
    expect(answer.status(), `entrada como ${key}`).toBe(200);
    await page.waitForURL(landing, { timeout: 30000 });
    await settle(page);
    return;
  }
  throw new Error(`entrada como ${key} recusada repetidamente`);
}
const buyerOrg = (page) => page.evaluate(async () => {
  const listing = await (await fetch('/api/finance/organizations', { credentials: 'same-origin' })).json();
  return (listing.rows || []).find((row) => row.kind === 'BUYER')?.id || null;
});
async function openRfq(page, title) {
  await page.goto('/finance/rfqs.html'); await settle(page);
  await page.getByRole('link', { name: title }).first().click();
  await page.waitForURL(/rfq\.html\?id=/); await settle(page);
}
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(`^${name}`) });
const visiblePanel = (page) => page.locator('[role=tabpanel]:not([hidden])');

test('roteiro de 29/10 pela entrada pública: compra, aprovação, contrato, pós-contrato, instituição, leitor e saída', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'demo-desktop', 'Consome um workspace: roda uma vez, no projeto desktop.');
  test.setTimeout(30 * 60 * 1000);
  const visitor = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', viewport: { width: 1440, height: 900 } });
  const page = await visitor.newPage();
  const apiErrors = [];
  page.on('response', (r) => { if (r.url().includes('/api/finance/') && r.status() >= 500) apiErrors.push(`${r.status()} ${new URL(r.url()).pathname}`); });

  // 1–2. Entrada, organização, papel e Painel.
  await enterAs(page, 'juliana', '**/finance/dashboard.html');
  const workspace = await buyerOrg(page);
  expect(workspace).toBeTruthy();
  await expect(page.locator('#environment-chip')).toBeVisible();
  await expect(page.locator('.side-user-name')).toHaveText('Juliana Ramos');
  await expect(page.locator('.workspace-switch')).toContainText('Vitta Foods');
  await expect(page.locator('#precisa-de-voce')).toBeVisible();

  // 3–5. Necessidade, condições, convites e propostas da nova linha (cenário A).
  await openRfq(page, /Capital de giro — nova linha/);
  await expect(visiblePanel(page)).toContainText('R$ 12.000.000');
  await expect(visiblePanel(page)).toContainText('3 convidados · 2 responderam');
  await expect(visiblePanel(page)).toContainText('Meridian Financial');
  await tab(page, 'Propostas').click();
  await expect(visiblePanel(page).locator('.proposal-card', { hasText: 'Atlas Bank' })).toContainText(/versão 2/);
  await tab(page, 'Comparação').click();
  await expect(visiblePanel(page)).toContainText('O Arandu não recomenda instituições');
  await tab(page, 'Aprovações').click();
  await expect(visiblePanel(page)).toContainText('Helena Duarte');

  // 6–7. Comparação completa, decisão e contrato da adquirência (cenário B).
  await openRfq(page, /Adquirência/);
  await tab(page, 'Comparação').click();
  await expect(visiblePanel(page).locator('.matrix-provider', { hasText: 'Lumina Pay' })).toContainText('v2');
  await tab(page, 'Decisão').click();
  await expect(visiblePanel(page)).toContainText('Lumina Pay');
  await expect(visiblePanel(page)).toContainText(/versão 2|v2/);

  // CFO decide a etapa dela; a gestora vê o efeito no Painel.
  await enterAs(page, 'helena', '**/finance/dashboard.html');
  expect(await buyerOrg(page), 'troca de persona mantém o workspace').toBe(workspace);
  await page.goto('/finance/approvals.html'); await settle(page);
  const pending = page.locator('.inbox-row.mine').first();
  await expect(pending).toBeVisible();
  const approvalTitle = (await pending.locator('.inbox-title').innerText()).trim();
  await pending.getByRole('button', { name: 'Aprovar' }).click();
  await page.getByRole('dialog', { name: 'Aprovar esta proposta?' }).getByRole('button', { name: 'Aprovar' }).click();
  await expect(page.getByText(/Aprovação registrada/)).toBeVisible();
  await page.reload(); await settle(page);
  await page.getByRole('tab', { name: /Concluídas/ }).click();
  await expect(page.locator('.inbox-row', { hasText: approvalTitle }).first(), 'aprovação persistiu').toBeVisible();

  await enterAs(page, 'juliana', '**/finance/dashboard.html');
  await expect(page.locator('#precisa-de-voce .action-row', { hasText: 'Registrar decisão' }).first()).toBeVisible();

  // 8–11. Contrato com origem, implantação, covenants e renovação.
  await page.goto('/finance/contracts.html'); await settle(page);
  const lumina = page.locator('.contract-card', { hasText: 'Lumina Pay' }).filter({ hasText: 'Adquirência' }).first();
  await expect(lumina.getByRole('link', { name: /Ver processo e decisão de origem/ })).toBeVisible();
  await lumina.getByRole('link', { name: 'Implantação deste contrato' }).click();
  await page.waitForURL(/implementations\.html/); await settle(page);
  await expect(page.locator('main')).toContainText('Lumina Pay');
  await page.goto('/finance/contracts.html'); await settle(page);
  const atlas = page.locator('.contract-card', { hasText: 'Atlas Bank' }).filter({ hasText: 'Capital de giro' }).first();
  await expect(atlas).toContainText('Janela de renovação aberta');
  await expect(atlas.getByRole('button', { name: 'Iniciar nova concorrência' }).or(atlas.getByRole('link', { name: 'Iniciar nova concorrência' }))).toBeVisible();
  await atlas.getByRole('link', { name: 'Covenants e obrigações deste contrato' }).click();
  await page.waitForURL(/covenants\.html/); await settle(page);
  await expect(page.locator('main')).toContainText(/Dívida líquida|EBITDA/);

  // 14. Tarefa com responsável, gravada e relida.
  const title = `Pedir à Lumina o cronograma dos terminais ${Date.now()}`;
  await page.goto('/finance/tasks.html'); await settle(page);
  const form = page.locator('#task-new');
  await form.getByLabel(/^Nova tarefa/).fill(title);
  await form.getByLabel(/^Responsável/).selectOption({ label: 'Rafael Menezes' });
  await form.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('Tarefa criada.')).toBeVisible();
  await page.reload(); await settle(page);
  const task = page.locator('.task-item', { hasText: title });
  await expect(task, 'tarefa persistiu').toBeVisible();
  await expect(task.locator('select.task-assignee option:checked')).toHaveText('Rafael Menezes');

  // 21–23. Instituição: convite, rascunho validado, envio v1 e revisão v2.
  await enterAs(page, 'meridian', '**/provider/index.html');
  await page.goto('/provider/rfqs.html'); await settle(page);
  await page.getByRole('link', { name: RFQ_OPEN.title }).click();
  await page.waitForURL(/proposal\.html\?proposal=/); await settle(page);
  const proposalUrl = page.url();
  await expect(page.locator('.meta-buyer')).toContainText('Vitta Foods');
  await expect(page.locator('main')).not.toContainText('Orbe Capital');
  const proposal = page.locator('#proposal-form');
  await proposal.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  await expect(proposal.getByText('Obrigatório para enviar.').first()).toBeVisible();
  const live = RFQ_OPEN.liveProposal.meridian;
  await proposal.getByLabel('Produto ofertado').fill('Giro safra — mesa agro');
  await proposal.getByLabel('Valor ofertado (R$)').fill(live.offered_amount);
  await proposal.getByLabel('Taxa (% a.m.)').fill(live.interest_rate_month);
  await proposal.getByLabel('Prazo (meses)').fill(live.term_months);
  await proposal.locator('summary', { hasText: 'Custo e amortização' }).click();
  await proposal.getByLabel('CET informado (% a.a.)').fill(live.cet_year);
  await proposal.getByLabel('Carência (meses)').fill(live.grace_months);
  await proposal.getByLabel('Nota para a empresa').fill(live.note);
  await proposal.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  await page.getByRole('dialog', { name: 'Enviar proposta?' }).getByRole('button', { name: 'Enviar proposta' }).click();
  await expect(page.getByText('Proposta enviada como versão 1.')).toBeVisible();
  await page.reload(); await settle(page);
  await expect(page.getByText('Proposta enviada · versão 1')).toBeVisible();
  await proposal.getByLabel('Taxa (% a.m.)').fill('1.27');
  await proposal.getByLabel('Nota para a empresa').fill('Versão 2: taxa revista (fictício).');
  await proposal.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  await page.getByRole('dialog', { name: 'Enviar a versão 2?' }).getByRole('button', { name: 'Enviar proposta' }).click();
  await expect(page.getByText('Proposta enviada como versão 2.')).toBeVisible();
  await page.reload(); await settle(page);
  await expect(page.locator('#versao-2')).toContainText(/1,29.*→.*1,27/s);

  // Outra instituição convidada não alcança a proposta da Meridian, nem pelo link.
  await enterAs(page, 'orbe', '**/provider/index.html');
  await page.goto(proposalUrl); await settle(page);
  await expect(page.getByText('Proposta não encontrada')).toBeVisible();
  for (const leak of ['Meridian', '1,27', 'mesa agro']) await expect(page.locator('main')).not.toContainText(leak);

  // 24–25. De volta à empresa: a versão 2 chegou e a coleta reflete as duas respostas.
  await enterAs(page, 'juliana', '**/finance/dashboard.html');
  expect(await buyerOrg(page)).toBe(workspace);
  await openRfq(page, RFQ_OPEN.title);
  await tab(page, 'Propostas').click();
  await expect(visiblePanel(page).locator('.proposal-card', { hasText: 'Meridian Financial' }).locator('.proposal-head')).toContainText('versão 2 de 2');
  await page.goto('/finance/tasks.html'); await settle(page);
  await expect(page.locator('.task-item', { hasText: title })).toBeVisible();

  // Leitor vê a mesma tarefa, sem controle de escrita.
  await enterAs(page, 'carlos', '**/finance/dashboard.html');
  await page.goto('/finance/tasks.html'); await settle(page);
  await expect(page.locator('.task-item', { hasText: title })).toBeVisible();
  await expect(page.locator('.task-item').getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('#task-new')).toHaveCount(0);

  // 26. Sair pelo menu da conta encerra a sessão no servidor.
  await page.getByRole('button', { name: /^Conta de/ }).click();
  await page.getByRole('button', { name: 'Sair' }).click();
  await page.waitForURL(/\/login\.html$/);
  expect(await page.evaluate(async () => (await fetch('/api/finance/organizations', { credentials: 'same-origin' })).status)).toBe(401);
  expect(apiErrors, 'nenhuma falha 5xx da API durante o roteiro').toEqual([]);
  await visitor.close();
});

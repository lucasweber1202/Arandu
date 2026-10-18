// Demo canônica pela ENTRADA PÚBLICA (login.html → persona), contra o produto
// REAL: app em ARANDU_ENV=demo + Supabase com o dataset de scripts/demo/seed.mjs
// e o pool de workspaces de visitante abastecido:
//
//   npm run demo:setup
//   set -a; . scripts/pilot-local/.state/demo.env; set +a
//   npm run demo:local:workspaces -- provision --count=2
//   ARANDU_DEMO_ENTRY_E2E=1 npx playwright test --config playwright.demo.config.js tests/e2e/demo-entry-journeys.spec.js
//
// ESCREVE (uma tarefa) e consome dois workspaces: cada visitante escreve só no
// próprio. Nada aqui usa fixture, mock ou estado no navegador: a prova é a
// releitura do servidor depois de recarregar.
import { test, expect } from '@playwright/test';

const ENABLED = process.env.ARANDU_DEMO_ENTRY_E2E === '1';
test.skip(!ENABLED, 'Defina ARANDU_DEMO_ENTRY_E2E=1 com o pool local abastecido (consome dois workspaces).');

async function enterAs(page, key, landing) {
  // O limite legítimo de entradas por rede (429) é respeitado esperando o tempo
  // que o servidor informa, nunca trocando de identidade.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto('/login.html#demonstracao');
    const card = page.locator(`[data-persona="${key}"]`);
    await expect(card, 'o servidor expõe a entrada por persona').toBeVisible({ timeout: 15000 });
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
    await page.waitForFunction(() => document.querySelector('#view')?.getAttribute('aria-busy') !== 'true', null, { timeout: 30000 }).catch(() => null);
    return;
  }
  throw new Error(`entrada como ${key} recusada repetidamente`);
}
const buyerOrg = (page) => page.evaluate(async () => {
  const listing = await (await fetch('/api/finance/organizations', { credentials: 'same-origin' })).json();
  return { environment: listing.environment, org: (listing.rows || []).find((row) => row.kind === 'BUYER') || null };
});

test('visitante entra pela página pública, escreve no próprio workspace, troca de persona e não vê o de outro visitante', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'demo-desktop', 'Consome dois workspaces: roda uma vez, no projeto desktop.');
  test.setTimeout(30 * 60 * 1000);

  // Identidade vem do servidor, não de um selo na tela.
  const visitor = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'pt-BR' });
  const page = await visitor.newPage();
  const health = await (await page.request.get('/api/health')).json();
  expect(health.ok).toBe(true);
  testInfo.annotations.push({ type: 'release', description: JSON.stringify(health.release) });

  // 1. Gestora entra pela entrada pública e cai no Painel do produto real.
  await enterAs(page, 'juliana', '**/finance/dashboard.html');
  await expect(page.locator('#environment-chip')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Trocar persona da demonstração' })).toBeVisible();
  const a = await buyerOrg(page);
  expect(a.environment).toBe('demo');
  expect(a.org?.legal_name).toMatch(/Vitta Foods/);

  // 2. Escrita real + releitura depois de recarregar (toast não é prova).
  const title = `Tarefa da entrada pública ${Date.now()}`;
  await page.goto('/finance/tasks.html');
  await page.locator('#task-new').getByLabel(/^Nova tarefa/).fill(title);
  await page.locator('#task-new').getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.locator('.task-item', { hasText: title })).toBeVisible({ timeout: 15000 });
  await page.reload();
  await expect(page.locator('.task-item', { hasText: title }), 'persistiu no servidor').toBeVisible({ timeout: 15000 });

  // 3. Outra persona autorizada do MESMO visitante vê o resultado (mesmo workspace).
  await enterAs(page, 'rafael', '**/finance/dashboard.html');
  expect((await buyerOrg(page)).org?.id, 'troca de persona mantém o workspace').toBe(a.org.id);
  await page.goto('/finance/tasks.html');
  await expect(page.locator('.task-item', { hasText: title })).toBeVisible({ timeout: 15000 });

  // 4. Leitor: vê, mas não recebe controle de escrita (o servidor também recusa).
  await enterAs(page, 'carlos', '**/finance/dashboard.html');
  await page.goto('/finance/tasks.html');
  await expect(page.locator('.task-item', { hasText: title })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.task-item').getByRole('checkbox')).toHaveCount(0);
  await expect(page.locator('#task-new')).toHaveCount(0);

  // 5. Instituição: portal próprio, comprador identificado, sem concorrentes.
  await enterAs(page, 'meridian', '**/provider/index.html');
  await expect(page.locator('#view')).toContainText('Vitta Foods');
  await page.goto('/provider/rfqs.html');
  await page.locator('.opportunity-title a').first().click();
  await expect(page.locator('.meta-buyer')).toContainText('Solicitado por Vitta Foods');
  await expect(page.locator('main')).not.toContainText(/Atlas Bank|Orbe Capital|Lumina Pay/);

  // 6. Segundo visitante, ao mesmo tempo: outro workspace, nada do primeiro.
  const other = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'pt-BR' });
  const second = await other.newPage();
  await enterAs(second, 'juliana', '**/finance/dashboard.html');
  const b = await buyerOrg(second);
  expect(b.org?.id).toBeTruthy();
  expect(b.org.id, 'visitantes em workspaces diferentes').not.toBe(a.org.id);
  await second.goto('/finance/tasks.html');
  await expect(second.locator('.task-list, .empty-state').first()).toBeVisible({ timeout: 15000 });
  await expect(second.locator('.task-item', { hasText: title }), 'escrita de um visitante não vaza para outro').toHaveCount(0);
  // O primeiro visitante continua no próprio workspace depois da entrada do segundo.
  await enterAs(page, 'juliana', '**/finance/dashboard.html');
  expect((await buyerOrg(page)).org?.id).toBe(a.org.id);

  // 7. Sair encerra a sessão: o portal volta a pedir login.
  const out = await page.evaluate(async () => (await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })).status);
  expect([200, 503]).toContain(out);
  const after = await page.evaluate(async () => (await fetch('/api/finance/organizations', { credentials: 'same-origin' })).status);
  expect(after).toBe(401);
  await visitor.close();
  await other.close();
});

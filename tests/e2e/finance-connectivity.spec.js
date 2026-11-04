import { test, expect } from '@playwright/test';
// Conexão e ações por URL. APIs SIMULADAS (page.route): valida o comportamento da
// interface, não persistência hospedada.
const ORG = '00000000-0000-4000-8000-0000000000a1';

async function setup(page) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method() });
    const json = (v) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, providers: [], contracts: [], rfqs: [], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'admin', display_name: 'Ana Tesouraria' }], viewer_id: 'u1' });
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('rede cai: aviso persistente; volta: atualizar é escolha da pessoa e refaz a leitura', async ({ page, context }) => {
  const calls = await setup(page);
  await page.goto('/finance/contracts.html');
  await expect(page.locator('#view')).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('#connectivity-notice')).toHaveCount(0);
  await context.setOffline(true);
  const notice = page.locator('#connectivity-notice');
  await expect(notice).toContainText('Sem conexão');
  await expect(notice).toHaveAttribute('role', 'status');
  await context.setOffline(false);
  await expect(notice).toContainText('Conexão restabelecida');
  // Nada é recarregado sozinho: só depois do clique a visão geral é lida de novo.
  const before = calls.filter((call) => call.path === 'overview').length;
  await page.waitForTimeout(300);
  expect(calls.filter((call) => call.path === 'overview').length).toBe(before);
  await notice.getByRole('button', { name: 'Atualizar dados' }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => calls.filter((call) => call.path === 'overview').length).toBeGreaterThan(before);
});

test('?acao= fora da lista fechada não aciona nada e sai da URL só quando reconhecida', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/contracts.html?acao=consultas');
  await expect(page.locator('#view')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page).toHaveURL(/acao=consultas/);
  await page.goto('/finance/contracts.html?acao=registrar-contrato');
  await expect(page.locator('#view')).toHaveAttribute('aria-busy', 'false');
  await expect(page).not.toHaveURL(/acao=/);
});

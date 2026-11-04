import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { PRODUCTS } from '../../lib/finance/products.mjs';
// Arquitetura frontend v7.0: módulos carregados sob demanda (abas da RFQ, busca
// Ctrl/Cmd+K) e estados de falha. APIs SIMULADAS; não é validação hospedada.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const RFQ = '00000000-0000-4000-8000-000000000702';
const PA = '00000000-0000-4000-8000-000000000a01';
const rfq = { id: RFQ, organization_id: ORG, title: 'Capital de giro 2027', product: 'credit', status: 'comparing', revision: 1, owner_id: 'u1',
  demand: { amount: 500000, purpose: 'capital_de_giro', term_months: 24 }, invites: [{ provider_id: PA, provider_name: 'Atlas Bank', status: 'accepted' }], proposals: [] };

async function setup(page) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method(), query: Object.fromEntries(u.searchParams) });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, providers: [{ id: PA, name: 'Atlas Bank', status: 'active' }], contracts: [], rfqs: [rfq], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'admin', display_name: 'Ana Tesouraria' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: true });
    if (path === 'search') return json({ ok: true, rows: [{ kind: 'provider', title: 'Atlas Bank', detail: 'Instituição', href: `/finance/providers.html?provider_id=${PA}` }] });
    if (path === 'approval-policy') return json({ ok: true, required_for_decision: false });
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('rótulos de produto do core seguem o catálogo canônico sem importá-lo', () => {
  const core = readFileSync(new URL('../../finance/src/core.js', import.meta.url), 'utf8');
  expect(core).not.toMatch(/products\.mjs/);
  for (const [id, product] of Object.entries(PRODUCTS)) expect(core).toMatch(new RegExp(`${id}: \\[[^\\]]*'${product.label}'\\]`));
});

test('aba carregada sob demanda: módulo que não carrega vira aviso legível e recarregar recupera a aba', async ({ page }) => {
  await setup(page);
  let block = true;
  await page.route(/\/assets\/comparison-tab-[^/]+\.js$/, (route) => (block ? route.abort('internetdisconnected') : route.continue()));
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await expect(page.getByRole('heading', { name: 'Capital de giro 2027' })).toBeVisible();
  // Visão geral não depende do módulo da comparação.
  await page.getByRole('tab', { name: 'Comparação' }).click();
  const panel = page.locator('#panel-comparacao');
  const alert = panel.getByRole('alert');
  await expect(alert).toContainText('Uma parte da página não carregou');
  await expect(alert).not.toContainText(/assets|dynamically|\.js/);
  // O navegador guarda a falha do módulo: a ação honesta é recarregar, não
  // prometer nova tentativa no lugar. Recarregar volta para a mesma aba.
  await expect(alert.getByRole('button', { name: 'Tentar novamente' })).toHaveCount(0);
  block = false;
  await alert.getByRole('button', { name: 'Recarregar a página' }).click();
  await expect(page).toHaveURL(/#comparacao$/);
  await expect(page.getByRole('tab', { name: 'Comparação' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel.getByRole('alert')).toHaveCount(0);
  await expect(panel).toContainText(/proposta|Comparação|compar/i);
  // Alternar abas não reconstrói nem refaz a leitura da aba já aberta.
  await page.getByRole('tab', { name: 'Visão geral' }).click();
  await page.getByRole('tab', { name: 'Comparação' }).click();
  await expect(panel.getByRole('alert')).toHaveCount(0);
});

test('busca Ctrl/Cmd+K: não baixada ao abrir a página; carrega no atalho e busca na organização ativa', async ({ page }) => {
  const calls = await setup(page);
  const loaded = [];
  page.on('request', (req) => { if (/\/assets\/command-center-[^/]+\.js$/.test(req.url())) loaded.push(req.url()); });
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('#command-center')).toHaveCount(0);
  await page.waitForLoadState('networkidle');
  expect(loaded).toHaveLength(0);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Buscar no espaço da empresa' });
  await expect(dialog).toBeVisible();
  expect(loaded).toHaveLength(1);
  await page.locator('#command-query').fill('Atlas');
  await expect(dialog.getByRole('option', { name: /Atlas Bank/ })).toBeVisible();
  await expect.poll(() => calls.find((c) => c.path === 'search')?.query.organization_id).toBe(ORG);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  // Segunda abertura reutiliza o módulo e o diálogo.
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  expect(loaded).toHaveLength(1);
  await expect(page.locator('#command-center')).toHaveCount(1);
});

test('busca: falha ao carregar o módulo avisa sem detalhe técnico e recarregar recupera', async ({ page }) => {
  await setup(page);
  let block = true;
  await page.route(/\/assets\/command-center-[^/]+\.js$/, (route) => (block ? route.abort('internetdisconnected') : route.continue()));
  await page.goto('/finance/dashboard.html');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Control+k');
  const notice = page.getByText(/A busca não carregou .* Recarregue a página/);
  await expect(notice).toBeVisible();
  await expect(page.getByText(/dynamically|assets\//)).toHaveCount(0);
  block = false;
  await page.getByRole('button', { name: 'Recarregar' }).click();
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Buscar no espaço da empresa' })).toBeVisible();
});

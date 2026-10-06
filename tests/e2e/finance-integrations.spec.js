import { test, expect } from '@playwright/test';

// Integrações (Public API v1 & Webhooks) em Configurações: só admin, token e
// segredo exibidos uma única vez, escopos e alcance enviados ao servidor. A
// sessão é simulada por `page.route`; credencial por hash, escopo + entidade e
// webhooks são provados em tests/database/financial-public-api.sql.

const ORG = '00000000-0000-4000-8000-0000000000a1';
const ENTITY_A = '00000000-0000-4000-8000-00000000e0a1';
const ACCOUNT = '00000000-0000-4000-8000-0000000002a1';
const TOKEN = 'arnd_pilot_' + 'A1b2C3d4E5'.repeat(4) + 'XyZ';
const SECRET = 'whsec_' + 'k'.repeat(43);

async function mockSession(page, { role = 'admin', secretsConfigured = true } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    calls.push({ method: request.method(), path, body });
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], providers: [], contracts: [], tasks: [], rfqs: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, entity_scope: 'group', display_name: 'Paula Nogueira', title: 'Tesouraria' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [{ id: ENTITY_A, organization_id: ORG, kind: 'legal_entity', parent_id: null, legal_name: 'Vitta Alimentos Ltda', short_name: 'Alimentos', currency: 'BRL', status: 'active', depth: 0 }], scope: 'group', can_admin: role === 'admin', base_currency: 'BRL' });
    if (path === 'entity-scopes') return json({ ok: true, rows: [], viewer_id: 'u1' });
    if (path === 'service-accounts' && request.method() === 'GET') return json({ ok: true, rows: [{ id: ACCOUNT, name: 'ERP SAP', scopes: ['rfqs:read', 'contracts:read'], entity_scope: 'group', status: 'active', entity_ids: [], last_used_at: null,
      credentials: [{ id: 'c1', token_prefix: 'arnd_pilot_A1b2C3', created_at: '2026-10-01T10:00:00Z', expires_at: '2027-01-01T10:00:00Z', revoked_at: null, last_used_at: '2026-10-02T10:00:00Z' }] }] });
    if (path === 'service-accounts' && request.method() === 'POST') return json({ ok: true, id: ACCOUNT }, 201);
    if (path === 'service-accounts/credentials') return json({ ok: true, id: 'c2', token: TOKEN, prefix: TOKEN.slice(0, 17) }, 201);
    if (path === 'webhooks' && request.method() === 'GET') return json({ ok: true, secrets_configured: secretsConfigured, rows: [{ id: 'w1', url: 'https://erp.example.com/hook', events: ['rfq.created'], status: 'active', consecutive_failures: 0,
      deliveries: [{ id: 'd1', status: 'dead', attempts: 8, last_status_code: 500, last_error_code: 'http_5xx', created_at: '2026-10-02T10:00:00Z' }] }] });
    if (path === 'webhooks' && request.method() === 'POST') return json({ ok: true, id: 'w2', secret: SECRET }, 201);
    if (path === 'webhooks/replay') return json({ ok: true, id: 'd2' }, 201);
    if (path === 'approval-policies') return json({ ok: true, can_admin: role === 'admin', flags: [], rows: [] });
    if (path === 'approval-delegations') return json({ ok: true, rows: [], viewer_id: 'u1' });
    if (['approvals', 'notifications', 'decisions', 'events', 'comments', 'tasks', 'notification-preferences', 'scorecard-templates'].includes(path) || path.startsWith('private-documents')) return json({ ok: true, rows: [] });
    if (path === 'approval-policy') return json({ ok: true, required_for_decision: false });
    if (path === 'signals') return json({ ok: true });
    return json({ ok: false }, 404);
  });
  return calls;
}

async function noHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('admin vê contas de serviço, emite token exibido uma vez e cria conta com escopos', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/settings.html#integracoes');
  const section = page.locator('#integracoes');
  await expect(section.getByRole('heading', { name: 'Integrações: API e webhooks' })).toBeVisible();
  await expect(section.getByText('ERP SAP')).toBeVisible();
  await expect(section.getByText(/Ler solicitações, Ler contratos/)).toBeVisible();
  await expect(section.getByText('arnd_pilot_A1b2C3…')).toBeVisible();
  await section.getByRole('button', { name: 'Emitir token' }).click();
  await expect(section.locator('.secret-once')).toHaveText(TOKEN);
  await expect(section.getByText(/não será mostrado de novo/).first()).toBeVisible();
  await noHorizontalOverflow(page);

  await section.getByText('Nova conta de serviço').click();
  await section.getByLabel('Nome do sistema').fill('TMS Alimentos');
  await section.getByLabel('Criar rascunhos de solicitação').check();
  await section.getByLabel('Alcance').selectOption('entities');
  await section.locator('form', { hasText: 'Criar conta de serviço' }).getByLabel('Alimentos').check();
  await section.getByRole('button', { name: 'Criar conta de serviço' }).click();
  await expect.poll(() => calls.find((call) => call.method === 'POST' && call.path === 'service-accounts')?.body).toEqual({
    organization_id: ORG, name: 'TMS Alimentos', scopes: ['rfqs:read', 'rfqs:write'], entity_scope: 'entities', entity_ids: [ENTITY_A]
  });
});

test('webhooks: segredo exibido uma vez, entregas em dead-letter podem ser reenviadas', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/settings.html#integracoes');
  const section = page.locator('#integracoes');
  await expect(section.getByText('https://erp.example.com/hook')).toBeVisible();
  await section.getByText('Entregas recentes (1)').click();
  await expect(section.getByText('dead-letter')).toBeVisible();
  await section.getByRole('button', { name: 'Reenviar' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'webhooks/replay')?.body).toEqual({ delivery_id: 'd1' });
  await section.getByText('Novo webhook').click();
  await section.getByLabel('URL https pública').fill('https://tms.example.com/arandu');
  await section.getByRole('button', { name: 'Criar webhook' }).click();
  await expect(section.locator('.secret-once')).toHaveText(SECRET);
  expect(calls.find((call) => call.method === 'POST' && call.path === 'webhooks').body.events).toEqual(['rfq.created', 'approval.required']);
  await noHorizontalOverflow(page);
});

test('sem chave de cifragem no ambiente, a tela avisa em vez de falhar em silêncio', async ({ page }) => {
  await mockSession(page, { secretsConfigured: false });
  await page.goto('/finance/settings.html#integracoes');
  await expect(page.locator('#integracoes').getByText(/ARANDU_WEBHOOK_SECRET_KEY/)).toBeVisible();
});

test('quem não é admin não vê a seção de integrações', async ({ page }) => {
  await mockSession(page, { role: 'finance_manager' });
  await page.goto('/finance/settings.html');
  await expect(page.getByRole('heading', { name: 'Seu nome e cargo' })).toBeVisible();
  await expect(page.locator('#integracoes')).toHaveCount(0);
});

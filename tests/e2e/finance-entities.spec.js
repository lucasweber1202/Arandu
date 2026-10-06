import { test, expect } from '@playwright/test';

// Multi-entity na interface publicada: contexto de entidade, criação de
// processo na entidade, administração do grupo, escopo dos membros e
// consolidado. A sessão é simulada por `page.route`; o isolamento real é
// provado em tests/database/financial-multi-entity.sql (Postgres + RLS).

const ORG = '00000000-0000-4000-8000-0000000000a1';
const ENTITY_A = '00000000-0000-4000-8000-00000000e0a1';
const UNIT = '00000000-0000-4000-8000-00000000e0a2';
const ENTITY_B = '00000000-0000-4000-8000-00000000e0b1';
const ENTITIES = [
  { id: ENTITY_A, organization_id: ORG, kind: 'legal_entity', parent_id: null, legal_name: 'Vitta Alimentos Ltda', short_name: 'Alimentos', tax_identifier: '11222333000181', country: 'BR', currency: 'BRL', status: 'active', depth: 0 },
  { id: UNIT, organization_id: ORG, kind: 'business_unit', parent_id: ENTITY_A, legal_name: 'Unidade Nordeste', short_name: 'Nordeste', tax_identifier: null, country: 'BR', currency: 'BRL', status: 'active', depth: 1 },
  { id: ENTITY_B, organization_id: ORG, kind: 'legal_entity', parent_id: null, legal_name: 'Vitta Logística Ltda', short_name: 'Logística', tax_identifier: null, country: 'BR', currency: 'BRL', status: 'active', depth: 0 }
];
const rfq = (id, title, entity, status = 'collecting') => ({ id, title, product: 'credit', status, revision: 1, response_deadline: '2027-10-01', legal_entity_id: entity,
  demand: { amount: 500000, purpose: 'capital_de_giro', term_months: 24 }, invites_count: 1, owner_id: 'u1', created_at: '2026-09-01T10:00:00Z', proposals: [] });
const OVERVIEW = {
  ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], providers: [], tasks: [],
  rfqs: [
    rfq('00000000-0000-4000-8000-0000000000c1', 'Capital de giro Alimentos', ENTITY_A),
    rfq('00000000-0000-4000-8000-0000000000c2', 'Adquirência Nordeste', UNIT),
    rfq('00000000-0000-4000-8000-0000000000c3', 'Frota Logística', ENTITY_B),
    rfq('00000000-0000-4000-8000-0000000000c4', 'Linha do grupo', null)
  ],
  contracts: [{ id: '00000000-0000-4000-8000-0000000000d1', provider_name: 'Banco Legado', product: 'credit', status: 'active', starts_on: '2026-01-01', ends_on: '2027-06-30',
    renewal_notice_days: 60, review_from: '2027-05-01', legal_entity_id: null, days_to_end: 270 }]
};

async function mockSession(page, { role = 'admin', scope = 'group', entities = ENTITIES } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    calls.push({ method: request.method(), path, body, query: url.search });
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json(OVERVIEW);
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Paula Nogueira', title: 'Tesouraria' }, { user_id: 'u2', role: 'finance_manager', display_name: 'Rui Tavares', title: 'Financeiro Logística' }], viewer_id: 'u1' });
    if (path === 'entities' && request.method() === 'GET') return json({ ok: true, rows: entities, scope, can_admin: role === 'admin', base_currency: 'BRL' });
    if (path === 'entities' && request.method() === 'POST') return json({ ok: true, id: '00000000-0000-4000-8000-00000000e0c1', tax_identifier: null }, 201);
    if (path === 'entity-scopes' && request.method() === 'GET') return json({ ok: true, rows: [
      { user_id: 'u1', role, entity_scope: scope, display_name: 'Paula Nogueira', title: 'Tesouraria', entity_ids: [] },
      { user_id: 'u2', role: 'finance_manager', entity_scope: 'entities', display_name: 'Rui Tavares', title: 'Financeiro Logística', entity_ids: [ENTITY_B] }], viewer_id: 'u1' });
    if (path === 'entity-scopes') return json({ ok: true, scope: body.scope, entities: body.entity_ids.length });
    if (path === 'entity-summary') return json({ ok: true, base_currency: 'BRL', truncated: false, definition: 'Contagens de processos e contratos que você pode ler, por entidade. Sem soma de valores entre moedas, sem nota e sem ranking.', rows: [
      { key: ENTITY_A, legal_entity_id: ENTITY_A, label: 'Alimentos', currency: 'BRL', status: 'active', depth: 0, rfqs_open: 1, rfqs_decided: 0, contracts_active: 0, contracts_notice_due: 0, next_contract_end: null },
      { key: UNIT, legal_entity_id: UNIT, label: 'Alimentos › Nordeste', currency: 'BRL', status: 'active', depth: 1, rfqs_open: 1, rfqs_decided: 0, contracts_active: 0, contracts_notice_due: 0, next_contract_end: null },
      { key: 'group', legal_entity_id: null, label: 'Nível de grupo', currency: null, status: null, depth: 0, rfqs_open: 1, rfqs_decided: 0, contracts_active: 1, contracts_notice_due: 0, next_contract_end: '2027-06-30' }] });
    if (path === 'rfqs' && request.method() === 'POST') return json({ ok: true, id: '00000000-0000-4000-8000-0000000000c9', warnings: [] }, 201);
    if (path === 'rfq-editor' && request.method() === 'GET') return json({ ok: true, draft: null });
    if (path === 'rfq-editor') return json({ ok: true, revision: 1, updated_at: new Date().toISOString() });
    if (['approvals', 'notifications', 'decisions', 'events', 'comments', 'rfq-revisions', 'tasks', 'notification-preferences'].includes(path) || path.startsWith('private-documents')) return json({ ok: true, rows: [] });
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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { try { sessionStorage.removeItem('arandu-finance-entity'); } catch { /* sem storage */ } });
});

test('lista de solicitações filtra pela entidade e a unidade conta na entidade-mãe', async ({ page }) => {
  await mockSession(page);
  await page.goto('/finance/rfqs.html');
  const filter = page.getByLabel('Filtrar por entidade');
  await expect(filter).toBeVisible();
  await expect(page.locator('.rfq-table tbody tr')).toHaveCount(4);
  await filter.selectOption(ENTITY_A);
  await expect(page.locator('.rfq-table tbody tr')).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Frota Logística' })).toHaveCount(0);
  await expect(page.getByText('Adquirência Nordeste')).toBeVisible();
  await filter.selectOption('group');
  await expect(page.locator('.rfq-table tbody tr')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Linha do grupo' })).toBeVisible();
  await noHorizontalOverflow(page);
});

test('escopo restrito: nova solicitação exige entidade e envia a escolhida', async ({ page }) => {
  const calls = await mockSession(page, { role: 'finance_manager', scope: 'entities', entities: ENTITIES.slice(0, 2) });
  await page.goto('/finance/new-rfq.html');
  const entity = page.getByLabel(/Entidade do grupo/);
  await expect(entity).toBeVisible();
  await expect(entity.locator('option', { hasText: 'Nível de grupo' })).toHaveCount(0);
  await entity.selectOption(UNIT);
  await page.getByLabel(/Título da solicitação/).fill('Capital de giro Nordeste');
  await page.locator('#rfq-next').click();
  const form = page.locator('#rfq-form');
  await form.getByLabel('Valor desejado (R$)').fill('300000');
  await form.locator('select[name="purpose"]').selectOption('capital_de_giro');
  await form.getByLabel('Prazo desejado (meses)').fill('12');
  await page.locator('#rfq-next').click();
  await page.locator('#rfq-next').click();
  await page.locator('#rfq-submit').click();
  await expect.poll(() => calls.find((call) => call.method === 'POST' && call.path === 'rfqs')?.body?.legal_entity_id).toBe(UNIT);
  // O rascunho persistido não carrega a entidade (o editor tem allowlist própria).
  expect(calls.filter((call) => call.path === 'rfq-editor' && call.method === 'PATCH').every((call) => !JSON.stringify(call.body).includes('legal_entity_id'))).toBe(true);
});

test('configurações: admin cadastra entidade e restringe escopo de membro', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/settings.html#entidades');
  await expect(page.getByRole('heading', { name: 'Entidades do grupo' })).toBeVisible();
  const alimentos = page.locator('.entity-row', { hasText: 'Vitta Alimentos Ltda' });
  await expect(alimentos).toBeVisible();
  await expect(alimentos.getByText(/CNPJ 11\.222\.333\/0001-81/)).toBeVisible();
  await page.getByText('Cadastrar entidade ou unidade').click();
  await page.locator('#entity-form select[name="kind"]').selectOption('business_unit');
  await page.locator('#entity-form select[name="parent_id"]').selectOption(ENTITY_B);
  await page.locator('#entity-form input[name="legal_name"]').fill('Centro de distribuição Sul');
  await page.locator('#entity-form button[type="submit"]').click();
  await expect.poll(() => calls.find((call) => call.method === 'POST' && call.path === 'entities')?.body).toMatchObject({ organization_id: ORG, kind: 'business_unit', parent_id: ENTITY_B, legal_name: 'Centro de distribuição Sul', currency: 'BRL', country: 'BR' });

  const rui = page.locator('.scope-row', { hasText: 'Rui Tavares' });
  await expect(rui.getByText('Escopo restrito')).toBeVisible();
  await rui.getByText('Alterar escopo').click();
  await rui.getByLabel('Alimentos').check();
  await rui.getByRole('button', { name: 'Salvar escopo' }).click();
  await expect.poll(() => calls.find((call) => call.method === 'PUT' && call.path === 'entity-scopes')?.body).toMatchObject({ user_id: 'u2', scope: 'entities', entity_ids: [ENTITY_A, ENTITY_B] });
  // Administrador do grupo não tem editor de escopo: admin é sempre do grupo.
  await expect(page.locator('.scope-row', { hasText: 'Paula Nogueira' }).getByText('Administradores são sempre do grupo.')).toBeVisible();
  await noHorizontalOverflow(page);
});

test('quem não é admin vê a estrutura sem controles de administração', async ({ page }) => {
  await mockSession(page, { role: 'finance_manager' });
  await page.goto('/finance/settings.html#entidades');
  await expect(page.locator('.entity-row', { hasText: 'Vitta Alimentos Ltda' })).toBeVisible();
  await expect(page.getByText('Cadastrar entidade ou unidade')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Arquivar' })).toHaveCount(0);
  await expect(page.getByText('Somente administradores do grupo alteram escopos.')).toBeVisible();
});

test('painel mostra o consolidado por entidade sem somar moedas', async ({ page }) => {
  await mockSession(page);
  await page.goto('/finance/dashboard.html');
  const summary = page.locator('.entity-summary');
  await expect(summary.getByRole('heading', { name: 'Consolidado por entidade' })).toBeVisible();
  await expect(summary.getByText('Sem soma de valores entre moedas')).toBeVisible();
  await expect(summary.getByText('Alimentos › Nordeste')).toBeVisible();
  await noHorizontalOverflow(page);
});

test('contrato anterior à fundação pode ganhar entidade uma vez, com confirmação', async ({ page }) => {
  const calls = [];
  await mockSession(page);
  await page.route('**/api/finance/contract-entity', (route) => {
    calls.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await page.goto('/finance/contracts.html');
  await page.getByLabel('Atribuir entidade ao contrato').selectOption(ENTITY_B);
  await page.getByRole('button', { name: 'Atribuir entidade' }).click();
  await page.getByRole('button', { name: 'Atribuir', exact: true }).click();
  await expect.poll(() => calls[0]).toMatchObject({ contract_id: '00000000-0000-4000-8000-0000000000d1', legal_entity_id: ENTITY_B });
});

test('sem entidades cadastradas a interface segue como antes', async ({ page }) => {
  await mockSession(page, { entities: [] });
  await page.goto('/finance/rfqs.html');
  await expect(page.locator('.rfq-table tbody tr')).toHaveCount(4);
  await expect(page.getByLabel('Filtrar por entidade')).toHaveCount(0);
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('.entity-summary')).toHaveCount(0);
});

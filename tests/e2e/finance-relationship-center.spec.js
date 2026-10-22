import { test, expect } from '@playwright/test';
// Central de Relacionamentos 2.0 (v3.8): fila de trabalho por instituição a
// partir de contratos, solicitações e tarefas já carregados. Nada inventado:
// responsável ausente aparece ausente; aviso prévio é o registrado.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const P_ATLAS = '00000000-0000-4000-8000-0000000000b1';
const P_NEXO = '00000000-0000-4000-8000-0000000000b2';
const P_NOVO = '00000000-0000-4000-8000-0000000000b3';
const ENTITY = '00000000-0000-4000-8000-0000000000e1';
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const contract = (id, over) => ({ id, organization_id: ORG, status: 'active', origin: 'imported', starts_on: day(-300), renewal_notice_days: 60, current_version: 1, legal_entity_id: null, owner_id: null, ...over });
const OVERVIEW = {
  ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [],
  providers: [{ id: P_ATLAS, name: 'Atlas Bank', kind: 'bank', status: 'active' }, { id: P_NEXO, name: 'Nexo Payments', kind: 'acquirer', status: 'active' }, { id: P_NOVO, name: 'Banco Novo', kind: 'bank', status: 'active' }],
  contracts: [
    contract('00000000-0000-4000-8000-0000000000c1', { provider_id: P_ATLAS, provider_name: 'Atlas Bank', product: 'credit', title: 'Capital de giro 2025', ends_on: day(80), owner_id: 'u1' }),
    contract('00000000-0000-4000-8000-0000000000c2', { provider_id: P_NEXO, provider_name: 'Nexo Payments', product: 'acquiring', title: 'Adquirência lojas', ends_on: day(-5), legal_entity_id: ENTITY }),
    contract('00000000-0000-4000-8000-0000000000c3', { provider_id: P_ATLAS, provider_name: 'Atlas Bank', product: 'cash_management', title: 'Pacote de serviços', ends_on: null }),
    contract('00000000-0000-4000-8000-0000000000c4', { provider_id: P_ATLAS, provider_name: 'Atlas Bank', product: 'credit', title: 'Linha longa', ends_on: day(700) })
  ],
  rfqs: [{ id: '00000000-0000-4000-8000-0000000000d1', title: 'Revisão de MDR', product: 'acquiring', status: 'collecting', revision: 2, response_deadline: day(6), owner_id: 'u1', owner_name: 'Paula Nogueira', legal_entity_id: ENTITY,
    invites: [{ provider_id: P_NEXO, provider_name: 'Nexo Payments', status: 'accepted' }], proposals: [] }],
  tasks: [{ id: '00000000-0000-4000-8000-0000000000f1', title: 'Revisar renovação', due_on: day(-2), status: 'open', related_type: 'contract', related_id: '00000000-0000-4000-8000-0000000000c1', assignee_id: null }]
};

async function setup(page, { role = 'admin' } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method(), body: req.postData() ? JSON.parse(req.postData()) : null });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json(OVERVIEW);
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Paula Nogueira' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [{ id: ENTITY, legal_name: 'Vitta Varejo', kind: 'subsidiary', parent_id: null }], scope: 'group', can_admin: role === 'admin' });
    if (path === 'contract-import') return json({ ok: true, id: '00000000-0000-4000-8000-0000000000c9', next_task: null }, 201);
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('fila mostra o que pede ação, por urgência, com responsável, origem e destino', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  await expect(center.getByRole('heading', { name: 'O que pede ação nos relacionamentos' })).toBeVisible();
  const items = center.locator('.rel-item');
  // Vencido primeiro; contrato longe do prazo não entra na fila.
  await expect(items.first()).toContainText('Vigência terminou');
  await expect(items.first()).toContainText('Adquirência lojas');
  await expect(center).not.toContainText('Linha longa');
  await expect(center.locator('[data-situation="window"]')).toContainText('aviso prévio de 60 dias registrado no cadastro');
  await expect(center.locator('[data-situation="window"]')).toContainText('Responsável: Paula Nogueira');
  await expect(center.locator('[data-situation="no_end"]')).toContainText('Responsável não informado no registro');
  await expect(center.locator('[data-situation="task_overdue"]')).toContainText('Revisar renovação');
  await expect(center.locator('[data-situation="negotiation"]')).toContainText('Revisão de MDR');
  await expect(center.locator('[data-situation="window"]')).toContainText('Origem: Contrato registrado pela empresa (carteira existente)');
  await expect(center.locator('[data-situation="window"]').getByRole('link', { name: /Decidir renovação no contrato/ })).toHaveAttribute('href', /contracts\.html\?abrir=contrato#contract-00000000-0000-4000-8000-0000000000c1/);
  for (const banned of [/melhor/i, /recomendad/i, /score/i]) await expect(center.getByText(banned)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('filtros por instituição, entidade, condição e situação recortam a fila', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  await center.getByLabel('Instituição').selectOption(P_NEXO);
  await expect(center.locator('.rel-item')).toHaveCount(2);
  await expect(center).not.toContainText('Capital de giro 2025');
  await center.getByLabel('Instituição').selectOption('');
  await center.getByLabel('Entidade').selectOption(ENTITY);
  await expect(center.locator('.rel-item')).toHaveCount(2);
  await center.getByLabel('Entidade').selectOption('');
  await center.getByLabel('Condição').selectOption('cash_management');
  await expect(center.locator('.rel-item')).toHaveCount(1);
  await expect(center.locator('.rel-item')).toContainText('Término não informado');
  await center.getByLabel('Condição').selectOption('');
  await center.getByLabel('Situação').selectOption('negotiation');
  await expect(center.locator('.rel-item')).toHaveCount(1);
});

test('instituição sem contrato: registrar o existente já com a instituição e seguir para o contrato', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  await center.getByText(/1 instituição sem contrato vigente registrado/).click();
  await center.locator('.rel-missing-row', { hasText: 'Banco Novo' }).getByRole('button', { name: 'Registrar contrato existente' }).click();
  const form = page.locator('#contract-import-form');
  await expect(form.getByLabel(/^Instituição financeira/)).toHaveValue(P_NOVO);
  await form.getByLabel(/^Título/).fill('Conta e cobrança');
  await form.getByLabel(/^Início/).fill(day(-30));
  await form.getByLabel(/^Fim/).fill(day(335));
  // Aviso prévio não é presumido: sem valor, o registro não é enviado.
  await page.getByRole('button', { name: 'Registrar contrato', exact: true }).click();
  await expect(form.getByText(/Informe o aviso prévio/)).toBeVisible();
  expect(calls.some((c) => c.path === 'contract-import')).toBe(false);
  await form.getByLabel(/^Aviso prévio/).fill('45');
  await page.getByRole('button', { name: 'Registrar contrato', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.path === 'contract-import')?.body).toMatchObject({ provider_id: P_NOVO, renewal_notice_days: 45 });
  await expect(page).toHaveURL(/contracts\.html\?abrir=contrato#contract-00000000-0000-4000-8000-0000000000c9/);
});

test('leitor vê a fila sem ação de registro', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  await page.goto('/finance/providers.html');
  await expect(page.locator('#relationship-center .rel-item').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar contrato existente' })).toHaveCount(0);
});

test('workspace da instituição separa término, marco de aviso prévio e tarefa operacional', async ({ page }) => {
  await setup(page);
  await page.route('**/api/finance/provider-relationship**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ok: true, provider: { id: P_ATLAS, name: 'Atlas Bank' }, neutrality: 'Fatos do histórico da empresa.', contracts: OVERVIEW.contracts.filter((row) => row.provider_id === P_ATLAS),
    facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [],
    metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 3, open_issues: 0, median_resolution_days: null, definitions: {} } }) }));
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const attention = page.getByRole('dialog', { name: 'Atlas Bank' }).locator('.rel-attention');
  await expect(attention).toContainText(/Decidir renovação até .*: Capital de giro 2025/);
  await expect(attention).toContainText('60 dias registrados no cadastro; confira no documento');
  await expect(attention).toContainText(/Término contratual em/);
  await expect(attention).toContainText('Tarefa: Revisar renovação');
  await expect(attention).toContainText('responsável não definido');
  // Leva à tarefa específica (a lista de tarefas destaca e rola até ela), não à lista genérica.
  await expect(attention.getByRole('link', { name: 'Abrir tarefa' })).toHaveAttribute('href', /\/finance\/tasks\.html#task-[\w-]+$/);
});

test('workspace da instituição sem contrato vigente oferece registrar o existente', async ({ page }) => {
  await setup(page);
  await page.route('**/api/finance/provider-relationship**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ok: true, provider: { id: P_NOVO, name: 'Banco Novo' }, neutrality: 'Fatos.', contracts: [], facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [],
    metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 0, open_issues: 0, median_resolution_days: null, definitions: {} } }) }));
  await page.goto(`/finance/providers.html?provider_id=${P_NOVO}`);
  await page.getByRole('dialog', { name: 'Banco Novo' }).locator('.rel-start').getByRole('button', { name: 'Registrar contrato existente' }).click();
  await expect(page.locator('#contract-import-form').getByLabel(/^Instituição financeira/)).toHaveValue(P_NOVO);
});

test('uma negociação com várias instituições vira um item só; coleta encerrada não parece prazo perdido', async ({ page }) => {
  const rfq = { id: '00000000-0000-4000-8000-0000000000d2', title: 'Nova linha de R$ 12 milhões', product: 'credit', status: 'comparing', revision: 1, response_deadline: day(-3), owner_name: 'Paula Nogueira',
    invites: [{ provider_id: P_ATLAS, provider_name: 'Atlas Bank', status: 'accepted' }, { provider_id: P_NEXO, provider_name: 'Nexo Payments', status: 'accepted' }, { provider_id: P_NOVO, provider_name: 'Banco Novo', status: 'invited' }], proposals: [] };
  await setup(page);
  await page.route('**/api/finance/overview**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...OVERVIEW, rfqs: [rfq], tasks: [] }) }));
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  const negotiation = center.locator('[data-situation="negotiation"]');
  await expect(negotiation).toHaveCount(1);
  await expect(negotiation).toContainText('Atlas Bank, Nexo Payments, Banco Novo');
  await expect(negotiation).toContainText(/coleta encerrada \(prazo era/);
  await expect(negotiation).toContainText('3 instituições convidadas, 2 com convite aceito');
  await expect(negotiation.getByRole('button', { name: /Relacionamento com/ })).toHaveCount(0);
  await center.getByLabel('Instituição').selectOption(P_NOVO);
  await expect(center.locator('[data-situation="negotiation"]')).toHaveCount(1);
});

test('workspace usa o aviso prévio do contrato carregado quando o relacionamento não o traz', async ({ page }) => {
  await setup(page);
  const withoutNotice = OVERVIEW.contracts.filter((row) => row.provider_id === P_ATLAS).map(({ renewal_notice_days, ...row }) => row);
  await page.route('**/api/finance/provider-relationship**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ok: true, provider: { id: P_ATLAS, name: 'Atlas Bank' }, neutrality: 'Fatos.', contracts: withoutNotice, facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [],
    metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 3, open_issues: 0, median_resolution_days: null, definitions: {} } }) }));
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const attention = page.getByRole('dialog', { name: 'Atlas Bank' }).locator('.rel-attention');
  await expect(attention).toContainText('60 dias registrados no cadastro');
  await expect(attention).not.toContainText('Aviso prévio não informado');
});

import { test, expect } from '@playwright/test';

// Financial Portfolio e Provider Relationship na interface publicada. A
// sessão é simulada por `page.route`; regras de escopo, imutabilidade e
// versões estão em tests/database/financial-relationships-portfolio.sql e as
// visões por moeda em scripts/test-finance-portfolio.mjs.

const ORG = '00000000-0000-4000-8000-0000000000a1';
const PROVIDER = '00000000-0000-4000-8000-0000000000e1';
const CONTRACT = '00000000-0000-4000-8000-000000000008';
const FACILITY = '00000000-0000-4000-8000-0000000000f1';
const DEFINITIONS = { approved_limit: 'Soma dos limites aprovados.', used_limit: 'Uso.', available_limit: 'Aprovado menos uso.', outstanding: 'Saldo.', maturity_wall: 'Principal a vencer por ano.',
  indexer_mix: 'Participação de cada indexador.', provider_concentration: 'Participação de cada provedor. É fato registrado, não avaliação.', refinancing_window: 'Vencimento no horizonte.', committed_guarantees: 'Garantias ativas.', review_due: 'Revisão.' };
const PORTFOLIO = {
  ok: true,
  facilities: [{ id: FACILITY, provider_id: PROVIDER, provider_name: 'Banco Um', name: 'Conta garantida', kind: 'revolving_credit', currency: 'BRL', approved_limit: 10000000, indexer: 'cdi', spread_pct_year: 1.8,
    maturity_on: '2027-06-30', status: 'active', source: 'contract', verified_at: '2026-09-30T00:00:00Z', schedule_version: 0, legal_entity_id: null }],
  guarantees: [{ id: 'g1', kind: 'receivables', description: 'Cessão de duplicatas', currency: 'BRL', committed_amount: 3000000, status: 'active', legal_entity_id: null }],
  balances: [{ facility_id: FACILITY, as_of: '2026-09-30', used_limit_amount: 6000000, outstanding_amount: 6000000, source: 'statement' }],
  views: {
    as_of: '2026-10-03', horizon_months: 12,
    currencies: [
      { currency: 'BRL', facilities: 1, approved_limit: 10000000, used_limit: 6000000, available_limit: 4000000, limit_without_usage: 0, outstanding: 6000000, outstanding_unknown: 0,
        indexer_mix: [{ key: 'cdi', amount: 6000000, share_pct: 100 }], provider_concentration: { outstanding: [{ key: PROVIDER, provider: 'Banco Um', amount: 6000000, share_pct: 100 }], approved_limit: [] },
        maturity_wall: [{ year: '2027', scheduled: 0, final_balance: 6000000 }] },
      { currency: 'USD', facilities: 1, approved_limit: 2000000, used_limit: 0, available_limit: 0, limit_without_usage: 1, outstanding: 0, outstanding_unknown: 1, indexer_mix: [], provider_concentration: { outstanding: [], approved_limit: [] }, maturity_wall: [] }
    ],
    guarantees: [{ currency: 'BRL', count: 1, committed: 3000000, unknown_amount: 0, by_kind: [] }],
    refinancing_windows: [{ id: FACILITY, name: 'Conta garantida', provider: 'Banco Um', currency: 'BRL', maturity_on: '2027-06-30', outstanding: 6000000, as_of: '2026-09-30', legal_entity_id: null }],
    review_due: [], definitions: DEFINITIONS
  },
  boundary: 'Visão de procurement e relacionamento. O Arandu não calcula juros nem substitui contabilidade ou TMS.'
};
const RELATIONSHIP = {
  ok: true, provider: { id: PROVIDER, name: 'Banco Um' }, contacts: [{ id: 'c1', name: 'Ana Gerente', title: 'Corporate', email: 'ana@banco.example', is_primary: true }],
  relationships: [], issues: [{ id: 'i1', title: 'Tarifa em duplicidade', category: 'billing', severity: 'high', status: 'open', opened_on: '2026-09-20' }],
  reviews: [{ id: 'r1', template_id: 't1', period_start: '2026-01-01', period_end: '2026-06-30', weighted_result: '80.000', answered_weight: '60.000' }],
  templates: [{ id: 't1', name: 'Relacionamento bancário', version: 1, criteria: [{ key: 'atendimento', label: 'Atendimento', weight: 60, scale_max: 5 }, { key: 'prazo', label: 'Prazo', weight: 40, scale_max: 5 }] }],
  contracts: [{ id: CONTRACT, title: 'Contrato de crédito', status: 'active', ends_on: null }, { id: '00000000-0000-4000-8000-00000000c0c2', title: null, product: 'credit', status: 'active', starts_on: '2025-01-01', ends_on: '2027-01-09' }], facilities: [{ id: FACILITY, name: 'Limite sem saldo', kind: 'revolving_credit', currency: 'BRL', approved_limit: 100000 }], map: [],
  rfqs: [{ id: '00000000-0000-4000-8000-000000000009', title: 'Renegociação de crédito', status: 'comparing' }], invites: [], proposals: [], balances: [],
  metrics: { invited: 3, responded: 2, response_rate: 66.67, median_response_days: 3, proposals: 2, active_contracts: 1, active_facilities: 1, open_issues: 1, median_resolution_days: null,
    definitions: { response_rate: 'Respondidos ÷ convidados. Fato do histórico, não nota.', responded: 'Convites com proposta.', median_response_days: 'Mediana.', active_contracts: 'Ativos.', open_issues: 'Abertas.', median_resolution_days: 'Mediana.', review: 'Avaliação conforme critérios e pesos definidos pela sua empresa. O Arandu não atribui nota própria a instituições.' } },
  timeline: [{ at: '2026-09-20T10:00:00Z', kind: 'issue', text: 'Issue aberta: Tarifa em duplicidade' }],
  neutrality: 'Fatos do histórico da sua empresa e avaliações definidas por ela. O Arandu não classifica nem recomenda instituições.'
};

async function mockSession(page, role = 'finance_manager', { providers = [{ id: PROVIDER, name: 'Banco Um', kind: 'bank', status: 'active' }] } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    calls.push({ method: request.method(), path, body, search: url.search });
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], tasks: [], rfqs: [], contracts: [],
      providers });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Paula Nogueira' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: false, base_currency: 'BRL' });
    if (path === 'portfolio') return json(PORTFOLIO);
    if (path === 'provider-relationship') return json(RELATIONSHIP);
    if (['facilities', 'facility-balances', 'facility-schedule', 'guarantees', 'provider-reviews', 'provider-issues', 'provider-contacts'].includes(path)) return json({ ok: true, id: 'x' }, 201);
    if (['approvals', 'notifications', 'events', 'tasks'].includes(path)) return json({ ok: true, rows: [] });
    if (path === 'signals') return json({ ok: true });
    return json({ ok: false }, 404);
  });
  return calls;
}

for (const role of ['admin', 'finance_manager', 'analyst', 'approver', 'viewer']) {
  test(`intake facility alcança a ação final conforme o papel: ${role}`, async ({ page }) => {
    const calls = await mockSession(page, role);
    const allowed = ['admin', 'finance_manager', 'analyst'].includes(role);
    await page.goto('/finance/dashboard.html');
    await page.getByRole('button', { name: 'Começar' }).click();
    const entry = page.getByRole('dialog').getByRole('link', { name: /Registrar facility ou limite/ });
    if (allowed) await entry.click();
    else {
      await expect(entry).toHaveCount(0);
      await page.goto('/finance/portfolio.html?acao=registrar-facility');
    }
    const dialog = page.getByRole('dialog', { name: 'Registrar facility', exact: true });
    if (!allowed) {
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('[data-intent="registrar-facility"]')).toHaveCount(0);
      expect(calls.some((call) => call.method === 'POST')).toBe(false);
      return;
    }
    await expect(dialog).toBeVisible();
    await dialog.getByLabel(/^Nome/).fill('Limite existente');
    await dialog.getByLabel('Limite aprovado').fill('100000');
    await dialog.getByRole('button', { name: 'Registrar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(calls.find((call) => call.path === 'facilities' && call.method === 'POST').body).toMatchObject({ organization_id: ORG, name: 'Limite existente', approved_limit: '100000' });
    await noHorizontalOverflow(page);
  });
}

async function noHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test('portfólio por moeda: limites, ausência explícita, vencimentos e fronteira declarada', async ({ page }) => {
  await mockSession(page);
  await page.goto('/finance/portfolio.html');
  await expect(page.getByRole('heading', { name: 'Portfólio em BRL' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Portfólio em USD' })).toBeVisible();
  await expect(page.getByText('1 facility(ies) sem saldo registrado')).toBeVisible();
  await expect(page.getByText(/não avaliação/).first()).toBeVisible();
  await expect(page.getByText('Janelas de refinanciamento')).toBeVisible();
  await expect(page.getByText(/não calcula juros/)).toBeVisible();
  await expect(page.locator('.facility-table')).toContainText('Contrato');
  await noHorizontalOverflow(page);
});

test('registrar fotografia de saldo envia data, origem e valor', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/portfolio.html');
  await page.locator('.facility-table').getByRole('button', { name: 'Saldo' }).click();
  await page.getByLabel(/Uso do limite/).fill('6500000');
  await page.getByLabel('Origem', { exact: true }).selectOption('statement');
  await page.getByRole('button', { name: 'Registrar fotografia' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'facility-balances')?.body).toMatchObject({ facility_id: FACILITY, used_limit_amount: '6500000', source: 'statement' });
});

test('registrar facility exige provedor e envia allowlist', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/portfolio.html');
  await page.getByRole('button', { name: 'Registrar facility' }).click();
  await page.locator('#facility-form input[name="name"]').fill('CCB capital de giro');
  await page.locator('#facility-form input[name="principal_amount"]').fill('5000000');
  await page.locator('#facility-form select[name="indexer"]').selectOption('pre');
  await page.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect.poll(() => calls.find((call) => call.path === 'facilities')?.body).toMatchObject({ organization_id: ORG, name: 'CCB capital de giro', provider_id: PROVIDER, principal_amount: '5000000', indexer: 'pre', currency: 'BRL' });
});

test('relacionamento com provedor: fatos, neutralidade e avaliação do cliente', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/providers.html');
  await page.getByRole('button', { name: 'Relacionamento com Banco Um' }).click();
  const panel = page.getByRole('dialog');
  // Indicadores e avaliações são consulta: ficam a um clique, abaixo do trabalho.
  await expect(panel.getByText('2 de 3 respondidos')).toBeHidden();
  await panel.getByText('Indicadores, mapa e avaliações').click();
  await expect(panel.getByText(/não classifica nem recomenda/)).toBeVisible();
  await expect(panel.getByText('2 de 3 respondidos')).toBeVisible();
  await expect(panel.getByText('Tarifa em duplicidade').first()).toBeVisible();
  await expect(panel.getByText(/80 de 100/)).toBeVisible();
  await expect(panel.getByText(/definidos pela sua empresa/).first()).toBeVisible();
  await panel.getByRole('button', { name: 'Registrar avaliação' }).click();
  await panel.getByLabel(/Atendimento \(peso 60/).fill('4');
  await panel.getByLabel(/Início do período/).fill('2026-07-01');
  await panel.getByLabel(/Fim do período/).fill('2026-12-31');
  await panel.getByRole('button', { name: 'Registrar avaliação' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'provider-reviews')?.body).toMatchObject({ provider_id: PROVIDER, template_id: 't1', scores: { atendimento: 4 }, period_start: '2026-07-01' });
  await noHorizontalOverflow(page);
});


test('instituição: deep link reúne contratos, limites, processos e pendências sem zeros inventados', async ({ page }, testInfo) => {
  await mockSession(page, 'viewer');
  await page.goto(`/finance/providers.html?provider_id=${PROVIDER}`);
  const dialog = page.getByRole('dialog', { name: 'Banco Um' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('não o histórico completo');
  await expect(dialog).toContainText('Saldo e utilização não registrados');
  await expect(dialog.getByRole('link', { name: 'Contrato de crédito' })).toHaveAttribute('href', `/finance/contracts.html?abrir=contrato#contract-${CONTRACT}`);
  // Contrato sem título é nomeado pela categoria e vencimento, não por um rótulo genérico igual para todos.
  await expect(dialog.getByRole('link', { name: /^Crédito.* · vence 09 de jan de 2027$/ })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Contrato registrado' })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'Limite sem saldo' })).toHaveAttribute('href', `/finance/portfolio.html#facility-${FACILITY}`);
  await expect(dialog.getByRole('link', { name: 'Renegociação de crédito' })).toHaveAttribute('href', /finance\/rfq.html\?id=/);
  await expect(dialog.getByRole('link', { name: 'Obrigações e covenants' })).toHaveAttribute('href', `/finance/covenants.html?provider_id=${PROVIDER}`);
  await expect(dialog.getByRole('button', { name: 'Adicionar contato' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Registrar avaliação' })).toHaveCount(0);
  await noHorizontalOverflow(page);
  await testInfo.attach('instituicao-contextual-sintetica', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page).not.toHaveURL(/provider_id=/);
});

test('instituição como workspace: resumo, pendências classificadas e ação conforme o papel', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'));
  await mockSession(page);
  await page.goto(`/finance/providers.html?provider_id=${PROVIDER}`);
  const dialog = page.getByRole('dialog', { name: 'Banco Um' });
  const head = dialog.getByRole('region', { name: 'Resumo do relacionamento' });
  await expect(head).toContainText('Ana Gerente · Corporate');
  await expect(head).toContainText('Vence em 81 dias');
  const attention = dialog.locator('.rel-attention');
  const rows = attention.locator('.milestone-row');
  // Próximo do vencimento, depois questão e negociação; término ausente é "Não informado", não "em dia".
  await expect(rows.nth(0)).toContainText('Próximo');
  await expect(rows.nth(0)).toContainText('Vence em 81 dias');
  await expect(attention).toContainText('Questão aberta: Tarifa em duplicidade');
  await expect(attention).toContainText('Negociação em andamento: Renegociação de crédito');
  await expect(attention.locator('.milestone-row', { hasText: 'Término não informado: Contrato de crédito' })).toContainText('Não informado');
  await expect(attention.getByRole('link', { name: 'Abrir negociação' })).toHaveAttribute('href', /finance\/rfq.html\?id=/);
  await expect(attention.getByRole('button', { name: 'Resolver' })).toBeVisible();
  // Nada de nota ou ranking no topo.
  await expect(head).not.toContainText(/nota|score|melhor/i);
  await noHorizontalOverflow(page);
});

test('instituição sem contatos nem registros: lacunas explícitas; leitor não recebe ação de escrita', async ({ page }) => {
  await mockSession(page, 'viewer');
  await page.route('**/api/finance/provider-relationship**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...RELATIONSHIP, contacts: [], issues: [], contracts: [], facilities: [], rfqs: [], timeline: [] }) }));
  await page.goto(`/finance/providers.html?provider_id=${PROVIDER}`);
  const dialog = page.getByRole('dialog', { name: 'Banco Um' });
  const head = dialog.getByRole('region', { name: 'Resumo do relacionamento' });
  await expect(head).toContainText('Contato principal');
  await expect(head).toContainText('Não registrado');
  await expect(head).toContainText('Nenhum prazo futuro registrado');
  await expect(dialog.locator('.rel-attention')).toContainText('Nenhum contato registrado');
  await expect(dialog.getByRole('button', { name: 'Adicionar contato' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Resolver' })).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test('primeiro valor sem banco: começar sugere registrar o que existe; instituição cadastrada abre o relacionamento', async ({ page }) => {
  const providers = [];
  const calls = await mockSession(page, 'finance_manager', { providers });
  await page.route('**/api/finance/providers', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    providers.push({ id: PROVIDER, name: 'Banco Um', kind: 'bank', status: 'active' });
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, row: { id: PROVIDER } }) });
  });
  await page.goto('/finance/dashboard.html');
  await page.getByRole('button', { name: 'Começar' }).click();
  const panel = page.getByRole('dialog', { name: 'O que você precisa fazer?' });
  await expect(panel).toContainText('Nenhuma instituição precisa ter conta no Arandu');
  await expect(panel.locator('.intent-group-title').first()).toHaveText('Registrar o que já existe');
  // Atalhos que levariam a listas vazias não aparecem.
  await expect(panel.getByRole('link', { name: /Comparar propostas recebidas/ })).toHaveCount(0);
  await expect(panel.getByRole('link', { name: /Renovar ou renegociar/ })).toHaveCount(0);
  await panel.getByRole('link', { name: /Cadastrar uma instituição/ }).click();
  const form = page.getByRole('dialog', { name: 'Cadastrar instituição' });
  await form.getByLabel(/^Nome/).fill('Banco Um');
  await form.getByRole('button', { name: 'Cadastrar instituição' }).click();
  await expect(page.getByText(/não precisa ter conta no Arandu/)).toBeVisible();
  const workspace = page.getByRole('dialog', { name: 'Banco Um' });
  await expect(workspace.getByRole('region', { name: 'Resumo do relacionamento' })).toBeVisible();
  await expect(page).toHaveURL(/provider_id=/);
  expect(calls.some((call) => call.method === 'POST' && call.path === 'contract-import')).toBe(false);
});

test('instituição de outro escopo em deep link não abre relacionamento', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/providers.html?provider_id=00000000-0000-4000-8000-000000000099');
  await expect(page.getByText('Instituição indisponível no seu escopo carregado.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(calls.some(call => call.path === 'provider-relationship')).toBe(false);
});

test('facility de origem contextual recebe foco no destino autorizado', async ({ page }) => {
  await mockSession(page);
  await page.goto(`/finance/portfolio.html#facility-${FACILITY}`);
  await expect(page.locator(`[id="facility-${FACILITY}"]`)).toBeFocused();
  await noHorizontalOverflow(page);
});


for (const role of ['finance_manager', 'analyst']) test(`primeiro registro sem instituição explica o pré-requisito para ${role}`, async ({ page }) => {
  const calls = await mockSession(page, role, { providers: [] });
  await page.goto('/finance/portfolio.html?acao=registrar-facility');
  const dialog = page.getByRole('dialog', { name: 'Instituição necessária' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('#facility-form')).toHaveCount(0);
  if (role === 'finance_manager') {
    await dialog.getByRole('link', { name: 'Cadastrar instituição' }).click();
    const institution = page.getByRole('dialog', { name: 'Cadastrar instituição' });
    await expect(institution).toBeVisible();
    await expect(institution.getByLabel(/^Nome/)).toBeVisible();
  } else {
    await expect(dialog).toContainText('pessoa administradora ou gestora financeira');
    await expect(dialog.getByRole('link', { name: 'Cadastrar instituição' })).toHaveCount(0);
  }
  expect(calls.some(call => call.path === 'facilities' && call.method === 'POST')).toBe(false);
});

test('edição reutiliza instituição da própria facility fora do índice carregado', async ({ page }) => {
  await mockSession(page, 'analyst', { providers: [] });
  await page.goto('/finance/portfolio.html');
  await page.locator('.facility-table').getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Editar facility' }).getByLabel('Provedor')).toHaveValue(PROVIDER);
});

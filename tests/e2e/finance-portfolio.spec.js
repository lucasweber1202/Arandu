import { test, expect } from '@playwright/test';

// Financial Portfolio e Provider Relationship na interface publicada. A
// sessão é simulada por `page.route`; regras de escopo, imutabilidade e
// versões estão em tests/database/financial-relationships-portfolio.sql e as
// visões por moeda em scripts/test-finance-portfolio.mjs.

const ORG = '00000000-0000-4000-8000-0000000000a1';
const PROVIDER = '00000000-0000-4000-8000-0000000000e1';
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
  contracts: [], facilities: [], map: [],
  metrics: { invited: 3, responded: 2, response_rate: 66.67, median_response_days: 3, proposals: 2, active_contracts: 1, active_facilities: 1, open_issues: 1, median_resolution_days: null,
    definitions: { response_rate: 'Respondidos ÷ convidados. Fato do histórico, não nota.', responded: 'Convites com proposta.', median_response_days: 'Mediana.', active_contracts: 'Ativos.', open_issues: 'Abertas.', median_resolution_days: 'Mediana.', review: 'Avaliação conforme critérios e pesos definidos pela sua empresa. O Arandu não atribui nota própria a instituições.' } },
  timeline: [{ at: '2026-09-20T10:00:00Z', kind: 'issue', text: 'Issue aberta: Tarifa em duplicidade' }],
  neutrality: 'Fatos do histórico da sua empresa e avaliações definidas por ela. O Arandu não classifica nem recomenda instituições.'
};

async function mockSession(page) {
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
      providers: [{ id: PROVIDER, name: 'Banco Um', kind: 'bank', status: 'active' }] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'finance_manager', display_name: 'Paula Nogueira' }], viewer_id: 'u1' });
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

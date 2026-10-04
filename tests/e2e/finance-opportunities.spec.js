import { test, expect } from '@playwright/test';
import { presentOpportunityPage, presentOpportunityDetail } from '../../lib/finance/opportunity-presenter.mjs';
// Mocks usam o apresentador real do servidor: o teste cobre a cópia que o usuário vê.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const P1 = '00000000-0000-4000-8000-0000000000d1';
const O1 = '00000000-0000-4000-8000-0000000000e1';
const O2 = '00000000-0000-4000-8000-0000000000e2';
const U2 = '00000000-0000-4000-8000-0000000000f2';
const renewal = { id: O1, organization_id: ORG, opportunity_type: 'contract_renewal', status: 'open', rule_version: 2, rule_snapshot: { parameters: { lead_days: 30, cooldown_days: 10 } },
  facts_snapshot: { notice_date: '2026-03-16', ends_on: '2026-04-15', days_to_notice: 15 }, current_facts: { notice_date: '2026-03-16', ends_on: '2026-04-15', days_to_notice: 14 },
  source_object_type: 'contract', source_object_id: C1, discriminator: '', deadline: '2026-03-16', opened_at: '2026-03-01T09:00:00Z', last_seen_at: '2026-03-02T09:00:00Z', possible_action: 'open_sourcing', reopen_count: 0, provider_id: P1 };
const concentration = { ...renewal, id: O2, opportunity_type: 'provider_concentration', rule_version: 1, rule_snapshot: { parameters: { max_share_pct: 60, cooldown_days: 30 } },
  facts_snapshot: { share_pct: 80, currency: 'BRL' }, current_facts: { share_pct: 80, currency: 'BRL' }, source_object_type: 'provider', source_object_id: P1, discriminator: 'BRL', deadline: null, possible_action: 'open_sourcing' };
const rules = [{ rule_key: 'contract_renewal', version: 2, enabled: true, parameters: { lead_days: 30, cooldown_days: 10 } }, { rule_key: 'provider_concentration', version: 1, enabled: true, parameters: { max_share_pct: 60, cooldown_days: 30 } }];

async function setup(page, { role = 'admin', fail = false } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method(), query: Object.fromEntries(u.searchParams), body: req.postData() ? JSON.parse(req.postData()) : null });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Opportunity test group' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Opportunity test group' }, providers: [{ id: P1, name: 'Banco fixture' }], contracts: [{ id: C1, title: 'Contrato fixture', status: 'active' }], rfqs: [], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Test actor' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin' });
    if (path === 'opportunities' && req.method() === 'GET') return fail ? json({ ok: false, error: 'Falha controlada no teste' }, 503)
      : json({ ok: true, ...presentOpportunityPage({ rows: [renewal, concentration], summary: [{ status: 'open', opportunities: 2, due_30: 1, overdue: 0 }], next: null, rules, today: '2026-03-02' }) });
    if (path === 'opportunities/detail') return json({ ok: true, ...presentOpportunityDetail({ opportunity: renewal, events: [{ created_at: '2026-03-01T09:00:00Z', event_type: 'opened', to_status: 'open', actor_id: null }], reviewers: [{ user_id: U2, display_name: 'Revisora fixture', role: 'finance_manager' }], entity: 'Entidade A' }) });
    if (path.startsWith('opportunities/')) return json({ ok: true, id: O1, status: 'acknowledged' }, 201);
    if (path.startsWith('graph')) return json({ ok: true, rows: [], next_offset: null });
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('worklist explica fato, regra, fonte, prazo e ação possível; filtros no servidor', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/opportunities.html');
  await expect(page.getByRole('heading', { name: 'Oportunidades', exact: true }).first()).toBeVisible();
  await expect(page.getByText(/2 ativas/)).toBeVisible();
  await expect(page.getByRole('cell', { name: /Aviso prévio em 16\/03\/2026/ })).toBeVisible();
  await expect(page.getByRole('cell', { name: /80% dos limites aprovados em BRL.*máximo da sua política: 60%/ })).toBeVisible();
  await expect(page.getByText(/Concentração acima da política da sua empresa · v1 · ativa/)).toBeVisible();
  await expect(page.getByText(/Utilização acima da política da sua empresa · não configurada \(limiar definido pela sua empresa\)/)).toBeVisible();
  await page.getByLabel('Estado').selectOption('open');
  await page.getByLabel('Prazo até').fill('2026-04-01');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect.poll(() => calls.filter((c) => c.path === 'opportunities').at(-1)?.query.status).toBe('open');
  expect(calls.filter((c) => c.path === 'opportunities').at(-1).query.due_before).toBe('2026-04-01');
  for (const banned of [/recomend/i, /melhor banco/i, /cobrança indevida/i]) await expect(page.getByText(banned)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('detalhe com regra e histórico; revisão com revisor; RFQ só com confirmação', async ({ page }) => {
  const calls = await setup(page);
  await page.goto(`/finance/opportunities.html?id=${O1}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Por que disparou: Aviso prévio em 16\/03\/2026/)).toBeVisible();
  await expect(dialog.getByText(/Regra v2: Antecedência \(dias\) 30/)).toBeVisible();
  await expect(dialog.getByText(/sugestão de trabalho, sem execução automática/)).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Abrir contrato' })).toHaveAttribute('href', '/finance/contracts.html');
  await dialog.getByRole('button', { name: 'Iniciar revisão' }).click();
  const form = page.getByRole('dialog').last();
  await form.getByLabel(/^Revisor/).selectOption(U2);
  await form.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.path === 'opportunities/transition')?.body).toMatchObject({ opportunity_id: O1, expected_status: 'open', to_status: 'under_review', reviewer_id: U2 });
  await page.goto(`/finance/opportunities.html?id=${O1}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Criar rascunho de RFQ' }).click();
  const rfq = page.getByRole('dialog').last();
  await rfq.getByRole('button', { name: 'Registrar', exact: true }).click();
  expect(calls.some((c) => c.path === 'opportunities/rfq')).toBe(false);
  await rfq.getByLabel('Confirmo criar o rascunho').check();
  await rfq.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.path === 'opportunities/rfq')?.body).toMatchObject({ opportunity_id: O1, confirmed: true });
});

test('viewer lê sem ações materiais nem configuração de regra', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  await page.goto(`/finance/opportunities.html?id=${O1}`);
  await expect(page.getByRole('dialog').getByText(/Por que disparou/)).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Configurar regra' })).toHaveCount(0);
});

test('indisponibilidade oferece recuperação sem inventar contagem', async ({ page }) => {
  await setup(page, { fail: true });
  await page.goto('/finance/opportunities.html');
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await expect(page.getByText(/ativas/)).toHaveCount(0);
});

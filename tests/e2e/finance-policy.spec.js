import { test, expect } from '@playwright/test';

// Policy & Approval Engine v2 na interface publicada: prévia da política no
// pedido de aprovação (com justificativa quando exigida) e publicação de
// policy pelo admin. Avaliação, snapshot e SoD estão provados em
// tests/database/financial-policy-engine.sql.

const ORG = '00000000-0000-4000-8000-0000000000a1';
const RFQ = '00000000-0000-4000-8000-0000000000b1';
const RFQ_ROW = { id: RFQ, title: 'Capital de giro grande', product: 'credit', status: 'comparing', revision: 1, response_deadline: '2027-10-01', owner_id: 'u1', created_at: '2026-09-01T10:00:00Z',
  demand: { amount: 8000000, purpose: 'capital_de_giro', term_months: 24 }, invites_count: 1,
  proposals: [{ id: 'p1', provider_id: 'x1', provider_name: 'Banco Um', status: 'submitted', version: 1, rfq_revision: 1, submitted_at: '2026-09-10T10:00:00Z', terms: { offered_amount: 8000000, interest_rate_month: 1.3, term_months: 24 } }] };
const EVALUATION = { matched: [{ label: 'Crédito acima de R$ 5 milhões' }, { label: 'Menos de 3 propostas' }],
  requirements: { approval_required: true, approvals: 2, approver_groups: [{ roles: ['admin', 'finance_manager'], scope: 'group', label: 'Tesouraria do grupo' }], justification_required: true, step_hours: 24, sod_decider: true } };

async function mockSession(page, { role = 'finance_manager' } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    calls.push({ method: request.method(), path, body, search: url.search });
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], providers: [], contracts: [], tasks: [], rfqs: [RFQ_ROW] });
    if (path === 'members') return json({ ok: true, viewer_id: 'u1', rows: [
      { user_id: 'u1', role, display_name: 'Paula Nogueira', title: 'Gerente Financeira' },
      { user_id: 'u2', role: 'finance_manager', display_name: 'Rui Tavares', title: 'Tesouraria' },
      { user_id: 'u3', role: 'viewer', display_name: 'Clara Diretora', title: 'CFO' }] });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin', base_currency: 'BRL' });
    if (path === 'policy-preview') return json({ ok: true, evaluation: EVALUATION });
    if (path === 'policies' && request.method() === 'GET') return json({ ok: true, rows: [], notice: 'Policies são da sua empresa.' });
    if (path === 'policies') return json({ ok: true, id: 'pol1' }, 201);
    if (path === 'approvals/request') return json({ ok: true, id: 'req1' }, 201);
    if (path === 'approval-policy') return json({ ok: true, required_for_decision: false });
    if (path === 'notification-preferences') return json({ ok: true, rows: [] });
    if (path === 'entity-scopes') return json({ ok: true, rows: [] });
    if (path === 'scorecard-templates') return json({ ok: true, rows: [], notice: 'Critérios da empresa.' });
    if (['approvals', 'notifications', 'decisions', 'events', 'comments', 'rfq-revisions', 'tasks'].includes(path) || path.startsWith('private-documents')) return json({ ok: true, rows: [] });
    if (path === 'signals') return json({ ok: true });
    return json({ ok: false }, 404);
  });
  return calls;
}

test('pedido de aprovação mostra a política aplicável e exige a justificativa', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await page.getByRole('tab', { name: 'Aprovações' }).click();
  const preview = page.locator('.policy-preview');
  await expect(preview).toContainText('Crédito acima de R$ 5 milhões');
  await expect(preview).toContainText('ao menos 1 de "Tesouraria do grupo"');
  await expect.poll(() => calls.find((call) => call.path === 'policy-preview')?.search).toContain('proposal_id=p1');
  await page.getByRole('checkbox', { name: /Clara Diretora/ }).check();
  await page.getByRole('checkbox', { name: /Rui Tavares/ }).check();
  await page.getByLabel('Contexto para quem aprova').fill('Única proposta com o valor integral.');
  await page.getByRole('button', { name: 'Solicitar aprovação' }).click();
  await expect(page.getByText('A política exige justificativa (pelo menos 10 caracteres).')).toBeVisible();
  expect(calls.some((call) => call.path === 'approvals/request')).toBe(false);
  await page.getByLabel(/Justificativa exigida pela política/).fill('Só um banco ofertou no prazo; os demais declinaram.');
  await page.getByRole('button', { name: 'Solicitar aprovação' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'approvals/request')?.body).toMatchObject({
    rfq_id: RFQ, proposal_id: 'p1', approver_ids: ['u3', 'u2'], justification: 'Só um banco ofertou no prazo; os demais declinaram.'
  });
});

test('admin publica policy com regra de alçada', async ({ page }) => {
  const calls = await mockSession(page, { role: 'admin' });
  await page.goto('/finance/settings.html#politicas');
  await page.getByText('Publicar policy ou nova versão').click();
  const form = page.locator('#policy-form');
  await form.getByLabel('Prazo por etapa (horas)').fill('48');
  await form.getByLabel('Quem pediu a aprovação não registra a decisão').check();
  await form.getByRole('button', { name: 'Publicar policy' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'policies' && call.method === 'POST')?.body).toMatchObject({
    organization_id: ORG, policy_key: 'alcadas_grupo',
    rules: [{ id: 'regra_1', label: 'Crédito acima de R$ 5 milhões', when: { products: ['credit'], amount_gte: 5000000 },
      require: { approvals: 2, approver_groups: [{ roles: ['admin', 'finance_manager'], scope: 'group', label: 'Tesouraria do grupo' }], step_hours: 48, sod_decider: true } }]
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('quem não é admin não vê o editor de policies', async ({ page }) => {
  await mockSession(page);
  await page.goto('/finance/settings.html#politicas');
  await expect(page.getByRole('heading', { name: 'Políticas de aprovação v2' })).toBeVisible();
  await expect(page.getByText('Publicar policy ou nova versão')).toHaveCount(0);
});

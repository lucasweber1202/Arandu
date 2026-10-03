import { test, expect } from '@playwright/test';

// Contract & Renewal Center v2 na interface publicada. A sessão é simulada
// por `page.route`; imutabilidade, versões, escopo e marcos idempotentes são
// provados em tests/database/financial-contracts-v2.sql.

const ORG = '00000000-0000-4000-8000-0000000000a1';
const CONTRACT = '00000000-0000-4000-8000-0000000000d1';
const PROVIDER = '00000000-0000-4000-8000-0000000000e1';
const CONTRACT_ROW = { id: CONTRACT, organization_id: ORG, provider_id: PROVIDER, provider_name: 'Banco Carteira', product: 'credit', origin: 'imported', title: 'Capital de giro carteira',
  status: 'active', starts_on: '2026-01-01', ends_on: '2027-12-31', renewal_notice_days: 90, review_from: '2027-10-02', days_to_end: 450, current_version: 2, currency: 'BRL', legal_entity_id: null };
const DETAIL = {
  ok: true, contract: CONTRACT_ROW,
  effective: { version: 2, effective_from: '2026-06-01', source: 'correction', terms: { contract_number: 'CCB-123', principal_amount: 5100000, indexer: 'cdi', spread_pct_year: 2.1, fees: [{ service: 'TAC', unit: 'one_off', amount: 5000 }] } },
  versions: [
    { version: 2, effective_from: '2026-06-01', source: 'correction', reason: 'Valor digitado errado', recorded_at: '2026-06-02T10:00:00Z', terms: {}, changes: [{ key: 'principal_amount', label: 'Valor principal contratado', change: 'changed', before: 5000000, after: 5100000 }] },
    { version: 1, effective_from: '2026-01-01', source: 'import', recorded_at: '2026-01-02T10:00:00Z', terms: {}, changes: [] }
  ],
  amendments: [], milestones: [{ id: 'm1', kind: 'obligation', title: 'Enviar demonstrações', due_on: '2026-12-01', lead_days: 15, recurrence: 'quarterly', status: 'scheduled' }],
  renewal_milestones: [], children: []
};

async function mockSession(page) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    calls.push({ method: request.method(), path, body });
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], tasks: [], rfqs: [],
      providers: [{ id: PROVIDER, name: 'Banco Carteira', status: 'active' }], contracts: [CONTRACT_ROW] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'finance_manager', display_name: 'Paula Nogueira', title: 'Tesouraria' }], viewer_id: 'u1' });
    if (path === 'contract-detail') return json(DETAIL);
    if (path === 'contract-import') return json({ ok: true, id: '00000000-0000-4000-8000-0000000000d9' }, 201);
    if (path === 'contract-amendments') return json({ ok: true, id: 'a1' }, 201);
    if (path === 'contract-milestones') return json({ ok: true, id: 'm2', status: 'scheduled' }, request.method() === 'POST' ? 201 : 200);
    if (path === 'contract-terms') return json({ ok: true, version: 3 }, 201);
    if (['approvals', 'notifications', 'events', 'tasks'].includes(path) || path.startsWith('private-documents')) return json({ ok: true, rows: [] });
    if (path === 'signals') return json({ ok: true });
    return json({ ok: false }, 404);
  });
  return calls;
}

async function noHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test('contrato da carteira: termos vigentes, histórico com diff e marco recorrente', async ({ page }) => {
  await mockSession(page);
  await page.goto('/finance/contracts.html');
  await expect(page.getByText('Carteira existente')).toBeVisible();
  await expect(page.getByText('Termos v2')).toBeVisible();
  await page.getByRole('button', { name: /Abrir contrato/ }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByRole('heading', { name: 'Termos vigentes (v2)' })).toBeVisible();
  await expect(panel.getByText('CCB-123')).toBeVisible();
  await expect(panel.getByText(/TAC:/)).toBeVisible();
  await panel.getByText('Histórico de versões (2)').click();
  await expect(panel.getByText('Justificativa: Valor digitado errado')).toBeVisible();
  await expect(panel.getByText(/Valor principal contratado: alterado — 5000000 → 5100000/)).toBeVisible();
  await expect(panel.getByText('Enviar demonstrações')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Concluir ocorrência' })).toBeVisible();
  await noHorizontalOverflow(page);
});

test('registrar contrato existente envia só termos do catálogo', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar contrato existente' }).click();
  const form = page.locator('#contract-import-form');
  await form.getByLabel('Categoria').selectOption('cash_management');
  await form.getByLabel(/^Título/).fill('Pacote de serviços bancários');
  await form.getByLabel(/^Início/).fill('2026-01-01');
  await form.getByLabel(/^Fim/).fill('2027-12-31');
  await form.getByText('Termos estruturados').click();
  await form.getByRole('button', { name: 'Adicionar tarifa' }).click();
  await form.getByLabel('Serviço da tarifa').fill('PIX enviado');
  await form.getByLabel('Valor contratado').fill('0.5');
  await page.getByRole('button', { name: 'Registrar contrato', exact: true }).click();
  await expect.poll(() => calls.find((call) => call.path === 'contract-import')?.body).toMatchObject({
    organization_id: ORG, product: 'cash_management', provider_id: PROVIDER, title: 'Pacote de serviços bancários', starts_on: '2026-01-01', ends_on: '2027-12-31',
    terms: { fees: [{ service: 'PIX enviado', unit: 'per_transaction', amount: 0.5 }] }
  });
});

test('aditivo preserva datas e gera versão quando altera termos', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: /Abrir contrato/ }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Registrar aditivo' }).click();
  await panel.getByLabel(/Vigência a partir de/).fill('2026-10-01');
  await panel.getByLabel(/Novo fim do contrato/).fill('2028-12-31');
  await panel.getByLabel('O aditivo altera termos estruturados (gera nova versão)').check();
  await panel.getByLabel('Spread (% a.a.)').fill('1.9');
  await panel.getByRole('button', { name: 'Registrar aditivo' }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect.poll(() => calls.find((call) => call.path === 'contract-amendments')?.body).toMatchObject({
    contract_id: CONTRACT, effective_from: '2026-10-01', new_ends_on: '2028-12-31', expected_version: 2, terms: { spread_pct_year: 1.9, contract_number: 'CCB-123' }
  });
});

test('correção de termos exige justificativa', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: /Abrir contrato/ }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Corrigir termos (nova versão)' }).click();
  await panel.getByRole('button', { name: 'Gravar nova versão' }).click();
  await expect(page.getByText('Explique a correção.')).toBeVisible();
  expect(calls.some((call) => call.path === 'contract-terms')).toBe(false);
  await panel.getByLabel(/Justificativa da correção/).fill('Indexador corrigido');
  await panel.getByRole('button', { name: 'Gravar nova versão' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'contract-terms')?.body).toMatchObject({ contract_id: CONTRACT, expected_version: 2, reason: 'Indexador corrigido' });
  await noHorizontalOverflow(page);
});

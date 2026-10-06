import { test, expect } from '@playwright/test';
import { presentFeePage, presentFeeDetail, providerLines } from '../../lib/finance/fee-presenter.mjs';
// Mocks usam o apresentador real do servidor: o teste cobre a cópia que o usuário vê.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const P1 = '00000000-0000-4000-8000-0000000000d1';
const V1 = '00000000-0000-4000-8000-0000000000e1';
const V2 = '00000000-0000-4000-8000-0000000000e2';
const S1 = '00000000-0000-4000-8000-0000000000f1';
const variance = { id: V1, contract_id: C1, service: 'TED', currency: 'BRL', period_start: '2025-03-01', period_end: '2025-03-31', comparison_status: 'comparable', direction: 'above', reasons: [], contracted_amount: 500, observed_amount: 520, variance_amount: 20, review_status: 'new',
  methodology: { version: 1, formula: 'observed_amount - contracted_reference', reference_formula: 'rate * volume', inputs: { volume: 100 } },
  reference_snapshot: { version: 1, contract_version: 1, effective_from: '2025-01-01', pricing_model: 'per_unit', rate: 5, currency: 'BRL', source: 'contract_terms', source_reference: 'CONTRACT-ANNEX-1' } };
const notComparable = { ...variance, id: V2, currency: 'USD', comparison_status: 'not_comparable', reasons: ['currency_mismatch'], contracted_amount: null, variance_amount: null, direction: null };
const summary = [
  { currency: 'BRL', observations: 2, verified: 1, comparable: 1, not_comparable: 0, missing_reference: 1, above: 1, below: 0, equal: 0, contracted_total: 500, observed_total: 520, above_total: 20, below_total: null, open_review: 1, under_review: 0, closed_review: 0, schedules: 2, schedules_observed: 1 },
  { currency: 'USD', observations: 1, verified: 0, comparable: 0, not_comparable: 1, missing_reference: 0, above: 0, below: 0, equal: 0, contracted_total: null, observed_total: null, above_total: null, below_total: null, open_review: 1, under_review: 0, closed_review: 0, schedules: 0, schedules_observed: 0 }
];
const schedules = [{ id: S1, service: 'TED', category: 'transfers', charging_unit: 'per_transaction', current_version: 2, versions: [
  { version: 1, effective_from: '2025-01-01', contract_version: 1, pricing_model: 'per_unit', rate: 5, currency: 'BRL', source: 'contract_terms', source_reference: 'CONTRACT-ANNEX-1', minimum_amount: null, maximum_amount: null },
  { version: 2, effective_from: '2025-07-01', contract_version: 2, pricing_model: 'per_unit', rate: 4, currency: 'BRL', source: 'amendment', source_reference: 'AMENDMENT-1', reason: 'Renegociação', minimum_amount: null, maximum_amount: null }] }];

async function setup(page, { role = 'admin', fail = false } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method(), query: Object.fromEntries(u.searchParams), body: req.postData() ? JSON.parse(req.postData()) : null });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Fee test group' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Fee test group' }, providers: [{ id: P1, name: 'Banco fixture' }], contracts: [{ id: C1, title: 'Contrato tarifas', status: 'active' }], rfqs: [], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Test actor' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin' });
    if (path === 'fees' && req.method() === 'GET') return fail ? json({ ok: false, error: 'Falha controlada no teste' }, 503) : json({ ok: true, ...presentFeePage({ rows: [variance, notComparable], summary, next: null, schedules, contracts: [{ id: C1, title: 'Contrato tarifas' }] }) });
    if (path === 'fees/detail') return json({ ok: true, ...presentFeeDetail({ variance, observation: { id: V1, source_type: 'bank_statement', source_reference: 'STATEMENT-03', evidence_reference: 'EVIDENCE-03', ingested_at: '2026-01-02T10:00:00Z', verification_status: 'unverified' },
      reviews: [{ reviewed_at: '2026-01-03T10:00:00Z', from_status: 'new', to_status: 'under_review', reason_code: 'review_started', notes: 'Revisão iniciada pela tesouraria' }], entity: 'Entidade A' }) });
    if (path === 'fees/summary') return json({ ok: true, summary, lines: providerLines(summary) });
    if (path.startsWith('fees/')) return json({ ok: true, id: V1 }, 201);
    if (path.startsWith('graph')) return json({ ok: true, rows: [], next_offset: null });
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('tarifas por moeda, comparação segura, filtros no servidor e detalhe rastreável', async ({ page }) => {
  const calls = await setup(page);
  await page.goto(`/finance/fees.html?provider_id=${P1}`);
  await expect(page.getByRole('heading', { name: 'Tarifas bancárias', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tarifas · BRL' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tarifas · USD' })).toBeVisible();
  await expect(page.getByText('1 acima da referência contratada', { exact: false })).toBeVisible();
  await expect(page.getByText(/Cobertura: 1\/2 tarifas contratadas/)).toBeVisible();
  await expect(page.getByRole('cell', { name: /Não comparável: Moeda diferente da contratada/ })).toBeVisible();
  await expect(page.getByText(/v2 desde 01\/07\/2025 \(contrato v2\)/)).toBeVisible();
  expect(calls.find((c) => c.path === 'fees').query.provider_id).toBe(P1);
  await page.getByLabel('Estado da revisão').selectOption('new');
  await page.getByLabel('Serviço/categoria').selectOption('transfers');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect.poll(() => calls.filter((c) => c.path === 'fees').at(-1)?.query.review_status).toBe('new');
  expect(calls.filter((c) => c.path === 'fees').at(-1).query.category).toBe('transfers');
  await page.getByRole('button', { name: 'Detalhe' }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Referência: tarifa v1 \(contrato v1\)/)).toBeVisible();
  await expect(dialog.getByText(/Fórmula v1: observed_amount - contracted_reference/)).toBeVisible();
  await expect(dialog.getByText(/Fonte: Extrato bancário · STATEMENT-03/)).toBeVisible();
  await expect(dialog.getByText(/Revisão iniciada pela tesouraria/)).toBeVisible();
  for (const banned of [/cobrança indevida/i, /erro do banco/i, /fraude/i]) await expect(page.getByText(banned)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('revisão humana com estado esperado e cobrança observada com origem explícita', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/fees.html');
  await page.getByRole('button', { name: 'Detalhe' }).first().click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Diferença confirmada por pessoa' })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Em revisão' }).click();
  const form = page.getByRole('dialog').last();
  await form.getByLabel('Notas').fill('Conferir anexo do contrato');
  await form.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.path === 'fees/review')?.body).toMatchObject({ variance_id: V1, expected_status: 'new', to_status: 'under_review', reason_code: 'review_started', notes: 'Conferir anexo do contrato' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Registrar cobrança observada' }).click();
  const obs = page.getByRole('dialog').last();
  await obs.getByRole('combobox', { name: 'Contrato', exact: true }).selectOption(C1);
  await obs.getByLabel('Serviço (como no contrato)').fill('TED');
  await obs.getByLabel('Início do período').fill('2025-03-01');
  await obs.getByLabel('Fim do período').fill('2025-03-31');
  await obs.getByLabel(/^Volume/).fill('100');
  await obs.getByLabel('Valor cobrado no período').fill('520');
  await obs.getByLabel('Origem do dado').selectOption('bank_statement');
  await obs.getByLabel('Referência da fonte (extrato, relatório)').fill('STATEMENT-03');
  await obs.getByLabel('Referência da evidência').fill('EVIDENCE-03');
  await obs.getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.path === 'fees/observe')?.body).toMatchObject({ organization_id: ORG, contract_id: C1, service: 'TED', volume: 100, observed_amount: 520, source_type: 'bank_statement' });
  const options = await page.getByLabel('Origem do dado').locator('option').allTextContents().catch(() => []);
  expect(options.join(' ')).not.toMatch(/API|extração/i);
});

test('viewer lê fatos sem ações materiais', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  await page.goto('/finance/fees.html');
  await expect(page.getByRole('heading', { name: 'Tarifas · BRL' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar tarifa contratada' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Nova versão de tarifa contratada' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Detalhe' }).first().click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Em revisão' })).toHaveCount(0);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Verificar observação' })).toHaveCount(0);
});

test('indisponibilidade não vira zero e oferece recuperação', async ({ page }) => {
  await setup(page, { fail: true });
  await page.goto('/finance/fees.html');
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tarifas · BRL' })).toHaveCount(0);
});

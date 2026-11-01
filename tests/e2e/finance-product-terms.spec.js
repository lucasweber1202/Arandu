import { test, expect } from '@playwright/test';
// Condições especializadas (financial-product-terms-1) e simulador de fiança
// (bank-guarantee-explicit-cost-v1). APIs SIMULADAS; a validação e o cálculo
// reais estão em scripts/test-platform-intelligence*.mjs e no banco.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const G1 = '00000000-0000-4000-8000-0000000000c1';
const G2 = '00000000-0000-4000-8000-0000000000c2';
const FX = '00000000-0000-4000-8000-0000000000c3';
const base = { organization_id: ORG, status: 'active', origin: 'imported', starts_on: '2026-01-01', ends_on: '2027-01-01', renewal_notice_days: 30, legal_entity_id: null, owner_id: null };
const GUAR = { ...base, id: G1, product: 'guarantee', title: 'Fiança aduaneira', provider_name: 'Atlas Bank', provider_id: 'p1', current_version: 1 };
const GUAR2 = { ...base, id: G2, product: 'guarantee', title: 'Fiança locatícia', provider_name: 'Banco Novo', provider_id: 'p2', current_version: 3 };
const FXC = { ...base, id: FX, product: 'fx', title: 'Câmbio importação', provider_name: 'Atlas Bank', provider_id: 'p1', current_version: 0 };
const PT = { schema_version: 'financial-product-terms-1', modality: 'bank_guarantee', values: { source_reference: 'Cláusula 3', beneficiary: 'Receita Federal', currency: 'BRL', guaranteed_amount: 1000000, valid_from: '2026-01-01', valid_until: '2027-01-01', commission_pct_year: 2, day_count: 'ACT/365F', upfront_fee: 100, other_expenses: 50 } };
const detail = (contract, terms) => ({ ok: true, contract, effective: terms ? { version: contract.current_version, effective_from: '2026-01-01', source: 'import', terms } : null, versions: [], amendments: [], milestones: [], children: [], documents: [], events: [] });

async function setup(page, { details }) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (req.method() !== 'GET') calls.push({ path, body: JSON.parse(req.postData() || '{}') });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], providers: [], contracts: [GUAR, GUAR2, FXC], rfqs: [], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'admin', display_name: 'Paula' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: true });
    if (path === 'contract-detail') return json(details[u.searchParams.get('id')]);
    if (path === 'contract-terms') return json({ ok: true, version: 2 }, 201);
    if (path === 'guarantee-economics') {
      const b = calls.at(-1).body;
      return json({ ok: true, analysis: { methodology: 'bank-guarantee-explicit-cost-v1', scenarios: b.scenarios.map((s) => ({ scenario: s, results: b.sources.map((src) => src.contract_id === G1
        ? { source: { object_type: 'contract', id: G1, label: 'Fiança aduaneira', version: 1 }, comparable: true, total: 20150, currency: 'BRL', components: { commission: 20000, upfront_fee: 100, other_expenses: 50 }, inputs: { days: 365, basis: 365, commission_pct_year: 2 } }
        : { source: { object_type: 'contract', id: G2, label: 'Fiança locatícia', version: 3 }, comparable: false, total: null, reasons: ['outside_contractual_validity'] }) })), limitations: [] } });
    }
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('fiança: condições exibidas, simulação com componentes, incomparabilidade explicada e volta ao contrato', async ({ page }) => {
  const calls = await setup(page, { details: { [G1]: detail(GUAR, { currency: 'BRL', product_terms: PT }) } });
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${G1}`);
  const dialog = page.getByRole('dialog', { name: 'Fiança aduaneira' });
  const section = dialog.locator('#termos-especializados');
  await expect(section).toContainText('Fiança bancária');
  await expect(section).toContainText('Receita Federal');
  await expect(section).toContainText('BRL 1.000.000,00');
  await expect(section).toContainText('2% a.a.');
  await expect(section).toContainText('Não habilita solicitação (RFQ)');
  await section.getByRole('button', { name: 'Simular custo da fiança' }).click();
  const sim = page.getByRole('dialog', { name: 'Simulador de custo de fiança' });
  await sim.getByRole('checkbox', { name: /Fiança locatícia/ }).check();
  await sim.getByLabel(/^Início/).fill('2026-01-01');
  await sim.getByLabel(/^Fim/).fill('2027-01-01');
  await sim.getByLabel(/^Valor garantido no cenário/).fill('1000000');
  await sim.getByRole('button', { name: 'Calcular' }).click();
  await expect(sim.locator('td[data-comparable="true"]')).toContainText('BRL 20.150,00');
  await expect(sim.locator('td[data-comparable="true"]')).toContainText('Comissão: BRL 20.000,00 (365 dias / base 365');
  await expect(sim.locator('td[data-comparable="false"]')).toContainText('Período do cenário fora da vigência declarada');
  const req = calls.find((c) => c.path === 'guarantee-economics').body;
  expect(req.sources).toEqual([{ contract_id: G1, version: 1 }, { contract_id: G2, version: 3 }]);
  expect(req.scenarios[0]).toMatchObject({ label: 'Base', currency: 'BRL', guaranteed_amount: 1000000, period_start: '2026-01-01' });
  for (const banned of [/melhor/i, /recomendad/i, /economia/i]) await expect(sim.locator('.guarantee-table')).not.toContainText(banned);
  await expect(sim.getByRole('link', { name: 'Fiança aduaneira' })).toHaveAttribute('href', new RegExp(`contract-${G1}`));
});

test('câmbio: formulário especializado por modalidade, preserva termos e grava nova versão', async ({ page }) => {
  const calls = await setup(page, { details: { [FX]: detail({ ...FXC, current_version: 1 }, { currency: 'USD', notes: 'termo legado' }) } });
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${FX}`);
  const section = page.getByRole('dialog', { name: 'Câmbio importação' }).locator('#termos-especializados');
  await expect(section).toContainText('Sem condições estruturadas de Câmbio à vista (spot), Câmbio a termo (forward), NDF (termo sem entrega física), Swap');
  await section.getByRole('button', { name: 'Registrar condições' }).click();
  const form = page.getByRole('dialog', { name: /Registrar condições/ });
  await form.getByLabel(/^Modalidade/).selectOption('ndf');
  await expect(form.getByLabel(/^Data de fixação/)).toBeVisible();
  await form.getByLabel(/^Modalidade/).selectOption('fx_forward');
  await expect(form.getByLabel(/^Data de fixação/)).toHaveCount(0);
  await form.getByRole('button', { name: 'Gravar nova versão' }).click();
  await expect(form).toContainText('Informe referência da fonte.');
  expect(calls.filter((c) => c.path === 'contract-terms')).toHaveLength(0);
  await form.getByLabel(/^Referência da fonte/).fill('Boleta 778');
  await form.getByLabel(/^Moeda base/).fill('usd');
  await form.getByLabel(/^Moeda cotada/).fill('BRL');
  await form.getByLabel(/^Valor na moeda base/).fill('250000');
  await form.getByLabel(/^Taxa contratada/).fill('5.4321');
  await form.getByLabel(/^Data de contratação/).fill('2026-10-01');
  await form.getByLabel(/^Data de liquidação/).fill('2027-01-04');
  await form.getByLabel(/^Direção contratual/).selectOption('buy_base');
  await form.getByRole('button', { name: 'Gravar nova versão' }).click();
  await expect(page.getByText('Condições registradas em nova versão do contrato.')).toBeVisible();
  const body = calls.find((c) => c.path === 'contract-terms').body;
  expect(body).toMatchObject({ contract_id: FX, expected_version: 1, terms: { notes: 'termo legado', currency: 'USD', product_terms: { schema_version: 'financial-product-terms-1', modality: 'fx_forward',
    values: { source_reference: 'Boleta 778', base_currency: 'USD', quote_currency: 'BRL', base_amount: 250000, agreed_rate: 5.4321, trade_on: '2026-10-01', settles_on: '2027-01-04', side: 'buy_base' } } } });
});

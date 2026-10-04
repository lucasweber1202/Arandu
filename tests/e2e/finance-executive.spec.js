import { test, expect } from '@playwright/test';
import { presentExecutive } from '../../lib/finance/executive-presenter.mjs';
// Mocks usam o apresentador real do servidor: o teste cobre a cópia que o usuário vê.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const value = [{ kind: 'NEGOTIATED_SAVINGS', currency: 'BRL', records: 2, comparable: 2, value_amount: 300 }, { kind: 'COST_AVOIDANCE', currency: 'USD', records: 1, comparable: 0, value_amount: null }];
const fees = [{ currency: 'BRL', observations: 4, verified: 2, comparable: 3, not_comparable: 1, missing_reference: 0, above: 2, below: 0, equal: 1, above_total: 30, below_total: null, open_review: 1, under_review: 0, closed_review: 1, schedules: 3, schedules_observed: 2 }];
const opportunities = [{ status: 'open', opportunities: 3, due_30: 2, overdue: 0 }];

async function setup(page, { fail = false } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, query: Object.fromEntries(u.searchParams) });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Executive test group' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Executive test group', sector: 'industry' }, providers: [], contracts: [], rfqs: [], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'finance_manager', display_name: 'Test actor' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: false });
    if (path === 'executive') {
      if (fail) return json({ ok: false, error: 'Falha controlada no teste' }, 503);
      const filters = { start: u.searchParams.get('start'), end: u.searchParams.get('end'), entity: null };
      return json({ ok: true, filters, ...presentExecutive({ value, fees, opportunities, filters, today: '2026-03-02' }) });
    }
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('painel mostra valor, tarifas e oportunidades separados por moeda e tipo, com cobertura e links', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/dashboard.html');
  const section = page.locator('#value-intelligence');
  await expect(section.getByRole('heading', { name: 'Inteligência de valor' })).toBeVisible();
  await expect(section.getByText(/^BRL: economia negociada R\$\s?300,00 \(2\/2 com cálculo\)/)).toBeVisible();
  await expect(section.getByText(/^USD: .*custo evitado sem cálculo defensável \(0\/1 com cálculo\)/)).toBeVisible();
  await expect(section.getByText(/custo evitado não é caixa/)).toBeVisible();
  await expect(section.getByText(/BRL: 2 acima da referência contratada \(diferença R\$\s?30,00\)/)).toBeVisible();
  await expect(section.getByText(/Diferença não é economia nem acusação/)).toBeVisible();
  await expect(section.getByText('3 ativas · 2 com prazo nos próximos 30 dias · 0 com prazo vencido')).toBeVisible();
  await expect(section.getByRole('link', { name: 'Diferenças aguardando revisão' })).toHaveAttribute('href', /\/finance\/fees\.html\?.*review_status=new/);
  await expect(section.getByRole('link', { name: 'Abrir worklist' })).toHaveAttribute('href', /\/finance\/opportunities\.html\?status=open/);
  await section.getByLabel('Início do período').fill('2025-01-01');
  await section.getByLabel('Fim do período').fill('2025-06-30');
  await section.getByRole('button', { name: 'Atualizar' }).click();
  await expect.poll(() => calls.filter((c) => c.path === 'executive').at(-1)?.query.start).toBe('2025-01-01');
  expect(calls.filter((c) => c.path === 'executive').at(-1).query.end).toBe('2025-06-30');
  for (const banned of [/recomend/i, /melhor banco/i, /cobrança indevida/i]) await expect(page.getByText(banned)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('indisponibilidade da inteligência de valor não derruba o painel nem inventa número', async ({ page }) => {
  await setup(page, { fail: true });
  await page.goto('/finance/dashboard.html');
  const section = page.locator('#value-intelligence');
  await expect(section.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await expect(section.getByText(/ativas|com cálculo/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Tarefas' })).toBeVisible();
});

import { test, expect } from '@playwright/test';
import { presentQualificationPage, presentQualificationDetail } from '../../lib/finance/qualification-presenter.mjs';
// Mocks usam o apresentador real do servidor.
const ORG = '00000000-0000-4000-8000-0000000a0e01';
const P = '00000000-0000-4000-8000-0000000a0e02';
const Q = '00000000-0000-4000-8000-0000000a0e03';
const R1 = '00000000-0000-4000-8000-0000000a0e04';
const R2 = '00000000-0000-4000-8000-0000000a0e05';
const EV = '00000000-0000-4000-8000-0000000a0e06';
const TODAY = new Date().toISOString().slice(0, 10);
const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
const requirements = [{ id: R1, area: 'legal', title: 'Contrato social e poderes', category: 'all', version: 2, critical: true, validity_days: 365 }, { id: R2, area: 'security', title: 'Relatório SOC 2', category: 'acquiring', version: 1, critical: false }];
const qualification = { id: Q, organization_id: ORG, provider_id: P, legal_entity_id: null, category: 'acquiring', status: 'pending_internal_review', owner_id: 'u1', review_due_on: plus(20), updated_at: '2026-10-05T10:00:00Z' };
const ctx = { providers: [{ id: P, name: 'Banco Fictício Alfa' }], entities: [], members: [{ user_id: 'u1', role: 'admin', display_name: 'Test actor' }], requirements };

async function setup(page, { role = 'admin', ready = false } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method(), query: Object.fromEntries(u.searchParams), body: req.postData() ? JSON.parse(req.postData()) : null });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Qualification test group' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Qualification test group' }, providers: ctx.providers, contracts: [], rfqs: [], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Test actor' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin' });
    if (path === 'qualifications' && req.method() === 'GET') return json({ ok: true, ...presentQualificationPage({ rows: [qualification, { ...qualification, id: 'q2', category: 'credit', status: 'qualified', valid_until: plus(10) }], ...ctx, next: null, today: TODAY }) });
    if (path === 'qualifications/detail') return json({ ok: true, ...presentQualificationDetail({ qualification, provider: ctx.providers[0], requirements,
      evidence: ready ? [{ id: EV, requirement_id: R1, source: 'external_service', external_service: 'Serviço KYB contratado', evidence_reference: 'KYB-2026-10', status: 'accepted', valid_until: plus(365), created_at: '2026-10-05T10:00:00Z' }, { id: 'e2', requirement_id: R2, source: 'provider', evidence_reference: 'SOC2-2026', status: 'accepted', valid_until: plus(200), created_at: '2026-10-05T10:00:00Z' }]
        : [{ id: EV, requirement_id: R1, source: 'external_service', external_service: 'Serviço KYB contratado', evidence_reference: 'KYB-2026-10', status: 'submitted', created_at: '2026-10-05T10:00:00Z' }],
      exceptions: [], events: [{ created_at: '2026-10-05T09:00:00Z', event_type: 'opened', to_status: 'not_started' }], today: TODAY }) });
    if (path.startsWith('qualifications/')) return json({ ok: true, id: Q }, 201);
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('lista: estados, vencimento e exigências da empresa; não escolhe provedor', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/qualifications.html');
  await expect(page.getByRole('heading', { name: 'Qualificação de provedores', exact: true }).first()).toBeVisible();
  await expect(page.getByText(/1 vencendo em 30 dias/)).toBeVisible();
  await expect(page.getByText(/◆ Jurídico · Contrato social e poderes · Todas as categorias · validade 365 dias · v2/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Aguardando revisão interna' })).toBeVisible();
  await page.getByLabel('Estado').selectOption('qualified');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect.poll(() => calls.filter((c) => c.path === 'qualifications').at(-1)?.query.status).toBe('qualified');
  for (const banned of [/recomend/i, /melhor provedor/i, /verificado pelo Arandu/i]) await expect(page.getByText(banned)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('detalhe sem prontidão: pendências visíveis e decisão de qualificar indisponível', async ({ page }) => {
  await setup(page);
  await page.goto(`/finance/qualifications.html?id=${Q}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/Prontidão: 0 atendida\(s\) · 0 com exceção · 2 pendente\(s\)/)).toBeVisible();
  await expect(dialog.getByText(/Serviço especializado externo \(KYC\/KYB\/sanções, etc\.\) \(Serviço KYB contratado\) · KYB-2026-10 · Enviada/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Mudar estado / decidir' }).click();
  const form = page.getByRole('dialog').last();
  const options = await form.getByLabel('Novo estado').locator('option').allTextContents();
  expect(options).not.toContain('Qualificado');
  expect(options).not.toContain('Qualificado com condições');
});

test('com prontidão: decisão humana com justificativa enviada com estado esperado', async ({ page }) => {
  const calls = await setup(page, { ready: true });
  await page.goto(`/finance/qualifications.html?id=${Q}`);
  await page.getByRole('dialog').getByRole('button', { name: 'Mudar estado / decidir' }).click();
  const form = page.getByRole('dialog').last();
  await form.getByLabel('Novo estado').selectOption('qualified');
  await form.getByLabel(/Justificativa/).fill('Todas as exigências atendidas e revisadas pela equipe');
  await form.getByRole('button', { name: /Salvar|Enviar|Registrar|Confirmar/ }).click();
  await expect.poll(() => calls.find((c) => c.path === 'qualifications/transition')?.body).toMatchObject({ qualification_id: Q, expected_status: 'pending_internal_review', to_status: 'qualified' });
});

test('viewer lê a qualificação sem ações', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  await page.goto(`/finance/qualifications.html?id=${Q}`);
  await expect(page.getByRole('dialog').getByText(/Prontidão:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mudar estado / decidir' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Abrir qualificação' })).toHaveCount(0);
});

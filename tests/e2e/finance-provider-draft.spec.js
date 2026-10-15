import { test, expect } from '@playwright/test';

// Rascunho da proposta no portal do provedor: nada do que foi digitado se perde
// em silêncio. Sessão simulada por `page.route`; a revisão otimista do rascunho
// e o isolamento por instituição são provados em tests/database.

const PROVIDER = '00000000-0000-4000-8000-0000000000c1';
const PROPOSAL = '00000000-0000-4000-8000-0000000000d1';
const ASSIGNMENT = {
  proposal_id: PROPOSAL, rfq_id: '00000000-0000-4000-8000-0000000000b1', title: 'Capital de giro 2027', product: 'credit', rfq_status: 'open',
  rfq_revision: 1, response_deadline: '2027-12-01', buyer_name: 'Empresa compradora', demand: { amount: 1000000, purpose: 'capital_de_giro', term_months: 24 },
  version: null, terms: {}, has_draft: false
};

async function mockProvider(page, { patch = () => 200, assignment = ASSIGNMENT } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/finance/', '');
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: PROVIDER, kind: 'PROVIDER', legal_name: 'Banco Atlas S.A.' }] });
    if (path === 'assignments') return json({ ok: true, rows: [assignment] });
    if (path === 'members') return json({ ok: true, rows: [], viewer_id: 'u1' });
    if (path === 'proposal-draft' && request.method() === 'GET') return json({ ok: true, draft: null });
    if (path === 'proposal-draft' && request.method() === 'PATCH') {
      calls.push(request.postDataJSON());
      const status = patch(calls.length);
      return status === 200 ? json({ ok: true, revision: calls.length, updated_at: new Date().toISOString() }) : json({ ok: false, error: 'Serviço indisponível.' }, status);
    }
    if (['notifications', 'events', 'comments', 'tasks', 'rfq-revisions'].includes(path)) return json({ ok: true, rows: [] });
    if (path === 'signals') return json({ ok: true });
    return json({ ok: false }, 404);
  });
  return calls;
}

test('falha ao salvar o rascunho: a volta da conexão salva de novo, sem a pessoa redigitar', async ({ page }) => {
  let failing = true;
  const calls = await mockProvider(page, { patch: () => (failing ? 503 : 200) });
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  const indicator = page.locator('#proposal-form .save-indicator');
  await page.getByLabel('Valor ofertado (R$)').fill('950000');
  await expect(indicator).toContainText('Falha ao salvar');
  failing = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(indicator).toContainText('Rascunho salvo');
  expect(calls.at(-1).terms.offered_amount).toBe('950000');
});

test('sair com alteração ainda não salva avisa e tenta salvar antes', async ({ page }) => {
  const calls = await mockProvider(page);
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  await page.getByLabel('Valor ofertado (R$)').fill('870000');
  // Antes do salvamento automático (0,9 s): fechar a aba não pode descartar em silêncio.
  const dialog = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const shown = await dialog;
  expect(shown.type()).toBe('beforeunload');
  await shown.dismiss();
  await expect.poll(() => calls.some((call) => call.terms.offered_amount === '870000')).toBe(true);
});

test('aba em segundo plano salva o rascunho na hora; sem alteração, sair não pergunta nada', async ({ page }) => {
  const calls = await mockProvider(page);
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  await page.getByLabel('Valor ofertado (R$)').fill('910000');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => calls.length, { timeout: 500 }).toBe(1);
  await expect(page.locator('#proposal-form .save-indicator')).toContainText('Rascunho salvo');
  let asked = false;
  page.on('dialog', (dialog) => { asked = true; dialog.accept(); });
  await page.close({ runBeforeUnload: true });
  expect(asked).toBe(false);
});

test('prazo de resposta vencido com coleta aberta: o provedor é avisado antes de enviar', async ({ page }) => {
  await mockProvider(page, { assignment: { ...ASSIGNMENT, response_deadline: '2026-01-05' } });
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  await expect(page.locator('.proposal-status')).toContainText('O prazo de resposta já passou.');
  await expect(page.locator('.proposal-status')).toContainText('registrada como enviada após o prazo');
});

test('conflito de rascunho: o aviso com "Recarregar" é anunciado como alerta e não some sozinho', async ({ page }) => {
  await page.clock.install();
  await mockProvider(page, { patch: () => 409 });
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  await page.getByLabel('Valor ofertado (R$)').fill('920000');
  await page.clock.runFor(1500);
  const alert = page.getByRole('alert').filter({ hasText: 'Este rascunho mudou em outra aba' });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Recarregar' })).toBeVisible();
  await page.clock.runFor(30_000);
  await expect(alert.getByRole('button', { name: 'Recarregar' })).toBeVisible();
});

test('histórico do provedor: condições de cada versão enviada, mudanças legíveis e ausência explícita', async ({ page }) => {
  const v1 = { offered_amount: 1000000, interest_rate_month: 1.29, index: 'pre', term_months: 24, collateral_required: 'Aval dos sócios' };
  const v2 = { offered_amount: 1000000, interest_rate_month: 1.24, index: 'cdi', term_months: 24 };
  await mockProvider(page, { assignment: { ...ASSIGNMENT, version: 2, terms: v2, rfq_revision: 2,
    history: [
      { version: 2, submitted_at: '2026-10-10T14:00:00Z', note: 'Ajuste após a revisão 2', rfq_revision: 2, terms: v2 },
      { version: 1, submitted_at: '2026-10-01T14:00:00Z', note: null, rfq_revision: 1, terms: v1 }
    ] } });
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  const history = page.locator('.version-history');
  const latest = history.locator('#versao-2');
  await expect(latest).toContainText('responde à rev. 2');
  await expect(latest).toContainText('Nota: Ajuste após a revisão 2');
  // Diferenças pela regra da comparação, com unidade e indexador por extenso.
  const changes = latest.getByRole('list', { name: 'Mudanças desde a versão 1' });
  await expect(changes).toContainText('Taxa (% a.m.): 1,29% → 1,24%');
  await expect(changes).toContainText('Indexador: Pré-fixado → CDI');
  await expect(changes).toContainText('Garantias exigidas: Aval dos sócios → não informado');
  await expect(changes).not.toContainText('Valor ofertado');
  // Condições daquela versão (snapshot), ausência explícita, sem JSON nem código.
  await history.locator('#versao-1').getByText('Condições desta versão').click();
  const terms = history.locator('#versao-1 .version-terms');
  await expect(terms).toContainText('1,29%');
  await expect(terms).toContainText('Pré-fixado');
  await expect(terms).toContainText('Não informado');
  await expect(history).not.toContainText(/\{|\bpre\b|\bcdi\b|null|undefined|NaN/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

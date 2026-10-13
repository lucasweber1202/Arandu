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

async function mockProvider(page, { patch = () => 200 } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/finance/', '');
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: PROVIDER, kind: 'PROVIDER', legal_name: 'Banco Atlas S.A.' }] });
    if (path === 'assignments') return json({ ok: true, rows: [ASSIGNMENT] });
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

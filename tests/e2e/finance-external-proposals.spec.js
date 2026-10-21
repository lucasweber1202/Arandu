import { test, expect } from '@playwright/test';
import { EXTERNAL_PROPOSAL_NOTICE, externalComparisonProposal } from '../../lib/finance/external-proposals.mjs';
import { buildComparison } from '../../lib/finance/comparison.mjs';
// Propostas recebidas fora do portal (v3.7): a interface consome o contrato real
// de external-proposals e nunca oferece escolher/contratar a proposta externa.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const RFQ = '00000000-0000-4000-8000-000000000702';
const P1 = '00000000-0000-4000-8000-000000000704';
const X1 = '00000000-0000-4000-8000-000000000801';
const rfq = { id: RFQ, organization_id: ORG, title: 'Capital de giro 2026', product: 'credit', status: 'comparing', revision: 1, demand: { amount: 500000, purpose: 'capital_de_giro', term_months: 24 }, proposals: [], invites: [] };
const record = (over = {}) => ({ id: X1, organization_id: ORG, rfq_id: RFQ, provider_id: P1, provider_name: 'Banco Exemplo', product: 'credit', state: 'pending_review', current_version: 1,
  terms: { offered_amount: 400000, interest_rate_month: 1.6 }, channel: 'email', received_at: null, source_reference: 'E-mail do gerente, ref. DEMO-01', currency: null,
  rfq_revision: 1, rfq_revision_matches: true, recorded_by: 'u1', recorded_at: '2026-10-20T12:00:00Z', document_id: null, document_version: null, document_state: 'not_presented', document_available: false,
  origin: 'buyer_recorded_external', decision_allowed: false, ...over });

async function setup(page, { role = 'admin', list = 'ok', rows = [record()], conflict = false } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method(), query: Object.fromEntries(u.searchParams), body: req.postData() ? JSON.parse(req.postData()) : null });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo teste' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo teste' }, providers: [{ id: P1, name: 'Banco Exemplo', status: 'active' }], contracts: [], rfqs: [rfq], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Ana Tesouraria' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin' });
    if (path === 'external-proposals' && req.method() === 'GET') {
      if (list === 'schema') return json({ ok: false, error: 'Indisponível', code: 'schema_incompatible' }, 503);
      if (list === 'forbidden') return json({ ok: false, error: 'Acesso negado.', code: 'organization_forbidden' }, 403);
      if (u.searchParams.get('id')) return json({ ok: true, record: rows[0], versions: [{ version: 1, version_state: rows[0].state, channel: 'email', recorded_by: 'u1', recorded_at: '2026-10-20T12:00:00Z', correction_reason: null }], reviews: [], page: { has_more: false, next_before: null }, decision_allowed: false, notice: EXTERNAL_PROPOSAL_NOTICE });
      return json({ ok: true, rows, page: { has_more: false, next_after: null }, decision_allowed: false, notice: EXTERNAL_PROPOSAL_NOTICE });
    }
    if (path === 'external-proposals' || path === 'external-proposals/versions') {
      if (conflict) return json({ ok: false, error: 'Conflito.', code: 'external_proposal_conflict' }, 409);
      return json({ ok: true, id: X1, version: path.endsWith('versions') ? 2 : 1, replayed: false, notice: EXTERNAL_PROPOSAL_NOTICE }, 201);
    }
    if (path === 'external-proposals/confirm') return json({ ok: true, review_id: 'r1', notice: EXTERNAL_PROPOSAL_NOTICE });
    if (path === 'private-documents') return json({ ok: true, rows: [] });
    if (path === 'comparison') return json({ ok: true, comparison: buildComparison('credit', rows.filter((row) => row.state === 'reviewed').map(externalComparisonProposal), rfq.demand, { revision: 1 }) });
    if (path === 'approval-policy') return json({ ok: true, required_for_decision: false });
    return json({ ok: true, rows: [] });
  });
  return calls;
}
const open = async (page) => { await page.goto('about:blank'); await page.goto(`/finance/rfq.html?id=${RFQ}#propostas`); };

test('registra transcrição com revisão prévia, sem moeda inventada e sem atribuir ao banco', async ({ page }) => {
  const calls = await setup(page, { rows: [] });
  await open(page);
  await expect(page.getByRole('heading', { name: 'Propostas recebidas fora do portal' })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar proposta recebida' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Instituição').selectOption(P1);
  await sheet.getByLabel('Moeda declarada').selectOption('');
  await sheet.getByLabel('Referência do material').fill('E-mail do gerente, ref. DEMO-01');
  await sheet.getByLabel('Valor ofertado (na moeda do material)').fill('400000');
  await sheet.getByRole('button', { name: 'Revisar antes de gravar' }).click();
  await expect(sheet.getByText(/não é proposta autenticada pela instituição/)).toBeVisible();
  await expect(sheet.getByText('Não declarada', { exact: true })).toBeVisible();
  await sheet.getByRole('button', { name: 'Gravar para conferência' }).click();
  await expect.poll(() => calls.find((c) => c.path === 'external-proposals' && c.method === 'POST')?.body).toMatchObject({
    rfq_id: RFQ, provider_id: P1, state: 'pending_review', channel: 'email', currency: null, received_at: null, document_id: null, terms: { offered_amount: 400000 }, rfq_revision: 1 });
  const body = calls.find((c) => c.path === 'external-proposals' && c.method === 'POST').body;
  expect(body.terms).not.toHaveProperty('interest_rate_month');
  expect(body).not.toHaveProperty('recorded_by');
  expect(body.request_key).toMatch(/^ui-new-/);
});

test('conferência só para gestão; nenhuma ação de escolher ou contratar a proposta externa', async ({ page }) => {
  const calls = await setup(page);
  await open(page);
  const card = page.locator(`#external-${X1}`);
  await expect(card.getByText('Fonte externa')).toBeVisible();
  await expect(card.getByText(/Moeda não declarada/)).toBeVisible();
  await expect(card.getByText('Nenhum documento vinculado')).toBeVisible();
  await expect(card.getByRole('button', { name: /Escolher|Contratar|Selecionar/ })).toHaveCount(0);
  await card.getByRole('button', { name: 'Conferir transcrição' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Como conferiu').fill('Conferido contra o e-mail original do gerente.');
  await dialog.getByText('Li o material recebido para esta conferência.').click();
  await dialog.getByRole('button', { name: 'Confirmar conferência' }).click();
  await expect.poll(() => calls.find((c) => c.path === 'external-proposals/confirm')?.body).toEqual({ id: X1, expected_version: 1, reason: 'Conferido contra o e-mail original do gerente.', material_reviewed: true, document_read: false });
  expect(calls.some((c) => /external-proposals\/(decision|contract)/.test(c.path))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('analista registra mas não confere; leitor não vê ações de escrita', async ({ page }) => {
  await setup(page, { role: 'analyst' });
  await open(page);
  const card = page.locator(`#external-${X1}`);
  await expect(card.getByRole('button', { name: 'Corrigir (nova versão)' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Conferir transcrição' })).toHaveCount(0);
  await page.unrouteAll();
  await setup(page, { role: 'viewer' });
  await open(page);
  await expect(page.locator(`#external-${X1}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar proposta recebida' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Corrigir (nova versão)' })).toHaveCount(0);
});

test('correção exige motivo e envia expected_version; conflito 409 não é repetido', async ({ page }) => {
  const calls = await setup(page, { conflict: true });
  await open(page);
  await page.locator(`#external-${X1}`).getByRole('button', { name: 'Corrigir (nova versão)' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'Revisar antes de gravar' }).click();
  await expect(sheet.getByText(/motivo da correção/i).last()).toBeVisible();
  await sheet.getByLabel('Motivo da correção').fill('Taxa transcrita com erro de digitação.');
  await sheet.getByRole('button', { name: 'Revisar antes de gravar' }).click();
  await sheet.getByRole('button', { name: 'Gravar nova versão' }).click();
  await expect(sheet.getByText(/Outra pessoa alterou este registro/)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Gravar nova versão' })).toBeDisabled();
  const posts = calls.filter((c) => c.path === 'external-proposals/versions');
  expect(posts).toHaveLength(1);
  expect(posts[0].body).toMatchObject({ id: X1, expected_version: 1, correction_reason: 'Taxa transcrita com erro de digitação.' });
});

test('schema incompatível e acesso negado não viram "nenhuma proposta"', async ({ page }) => {
  await setup(page, { list: 'schema' });
  await open(page);
  await expect(page.locator('#external-unavailable')).toContainText('não está disponível neste ambiente');
  await expect(page.getByText('Nenhuma proposta externa registrada')).toHaveCount(0);
  await page.unrouteAll();
  await setup(page, { list: 'forbidden' });
  await open(page);
  await expect(page.getByText(/Seu papel não permite/)).toBeVisible();
  await expect(page.getByText('Nenhuma proposta externa registrada')).toHaveCount(0);
});

// Defeitos da auditoria #253: USD exibido como R$ e registro novo presumindo BRL.
test('moeda declarada é respeitada: USD nunca vira R$ e ausente fica não declarada', async ({ page }) => {
  await setup(page, { rows: [record({ currency: 'USD', terms: { offered_amount: 250000, interest_rate_month: 0.9 } }), record({ id: '00000000-0000-4000-8000-000000000803', currency: null, provider_name: 'Banco Sem Moeda' }), record({ id: '00000000-0000-4000-8000-000000000804', currency: 'EUR', provider_name: 'Banco Euro', terms: { offered_amount: 1000 } })] });
  await open(page);
  const usd = page.locator(`#external-${X1}`);
  await expect(usd.locator('.key-terms')).toContainText('US$ 250.000');
  await expect(usd.locator('.key-terms')).not.toContainText('R$');
  await usd.getByText('Ver todas as condições transcritas').click();
  await expect(usd.locator('.deflist')).toContainText('US$ 250.000');
  await expect(usd.locator('.deflist')).not.toContainText('R$');
  const unknown = page.locator('#external-00000000-0000-4000-8000-000000000803');
  await expect(unknown.locator('.key-terms')).toContainText('400.000 (moeda não declarada)');
  await expect(unknown.locator('.key-terms')).not.toContainText('R$');
  await expect(page.locator('#external-00000000-0000-4000-8000-000000000804 .key-terms')).toContainText('€');
});

test('registro novo não presume real; correção preserva USD e revisão mostra a moeda', async ({ page }) => {
  const calls = await setup(page, { rows: [record({ currency: 'USD' })] });
  await open(page);
  await page.getByRole('button', { name: 'Registrar proposta recebida' }).click();
  await expect(page.getByRole('dialog').getByLabel('Moeda declarada')).toHaveValue('');
  await expect(page.getByRole('dialog').getByText(/= R\$/)).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar painel' }).click();
  await page.locator(`#external-${X1}`).getByRole('button', { name: 'Corrigir (nova versão)' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByLabel('Moeda declarada')).toHaveValue('USD');
  await sheet.getByLabel('Motivo da correção').fill('Taxa transcrita com erro de digitação.');
  await sheet.getByRole('button', { name: 'Revisar antes de gravar' }).click();
  await expect(sheet.locator('#external-review .key-terms')).toContainText('US$ 400.000');
  await expect(sheet.locator('#external-review .key-terms')).not.toContainText('R$');
  await sheet.getByRole('button', { name: 'Gravar nova versão' }).click();
  await expect.poll(() => calls.find((c) => c.path === 'external-proposals/versions')?.body.currency).toBe('USD');
});

test('comparação: coluna externa em USD sem R$, origem declarada e sem escolher vencedor', async ({ page }) => {
  await setup(page, { rows: [record({ state: 'reviewed', currency: 'USD', reviewed_at: '2026-10-20T15:00:00Z' }), record({ id: '00000000-0000-4000-8000-000000000805', state: 'reviewed', currency: 'BRL', provider_name: 'Banco Real', terms: { offered_amount: 380000, interest_rate_month: 1.4 } })] });
  await page.goto('about:blank');
  await page.goto(`/finance/rfq.html?id=${RFQ}#comparacao`);
  const table = page.locator('.comparison-wide table.matrix, .compare-mobile').first();
  await expect(page.locator('.matrix-external').first()).toContainText('Fonte externa');
  await expect(page.getByText('US$ 400.000').first()).toBeAttached();
  await expect(page.getByText('R$ 380.000').first()).toBeAttached();
  await expect(page.getByText(/transcrição registrada pela empresa/).first()).toBeAttached();
  await expect(page.getByText(/Origem: não disponível/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Escolher|Contratar|vencedor/i })).toHaveCount(0);
  await expect(table).toBeAttached();
});

test('conferência valida no próprio painel sem perder o texto e não envia incompleta', async ({ page }) => {
  const calls = await setup(page);
  await open(page);
  await page.locator(`#external-${X1}`).getByRole('button', { name: 'Conferir transcrição' }).click();
  const sheet = page.locator('#external-review-form');
  await sheet.getByLabel('Como conferiu').fill('Conferido contra o e-mail original.');
  await sheet.getByRole('button', { name: 'Confirmar conferência' }).click();
  await expect(sheet.getByText(/Marque as declarações de leitura/)).toBeVisible();
  await expect(sheet.getByLabel('Como conferiu')).toHaveValue('Conferido contra o e-mail original.');
  expect(calls.some((c) => c.path === 'external-proposals/confirm')).toBe(false);
  await sheet.getByText('Li o material recebido para esta conferência.').click();
  await sheet.getByRole('button', { name: 'Confirmar conferência' }).click();
  await expect.poll(() => calls.filter((c) => c.path === 'external-proposals/confirm').length).toBe(1);
});

test('gestão grava e segue para conferir a versão gravada; analista só grava', async ({ page }) => {
  const calls = await setup(page, { rows: [] });
  await open(page);
  const fillAndSave = async () => {
    await page.getByRole('button', { name: 'Registrar proposta recebida' }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByLabel('Instituição').selectOption(P1);
    await sheet.getByLabel('Referência do material').fill('E-mail do gerente, ref. DEMO-02');
    await sheet.getByRole('button', { name: 'Revisar antes de gravar' }).click();
    await sheet.getByRole('button', { name: 'Gravar para conferência' }).click();
  };
  await fillAndSave();
  const review = page.locator('#external-review-form');
  await expect(review).toContainText('versão 1');
  await review.getByLabel('Como conferiu').fill('Conferido contra o e-mail do gerente.');
  await review.getByText('Li o material recebido para esta conferência.').click();
  await review.getByRole('button', { name: 'Confirmar conferência' }).click();
  await expect.poll(() => calls.find((c) => c.path === 'external-proposals/confirm')?.body).toMatchObject({ id: X1, expected_version: 1, material_reviewed: true });
  await page.unrouteAll();
  await setup(page, { role: 'analyst', rows: [] });
  await open(page);
  await fillAndSave();
  await expect(page.locator('#external-review-form')).toHaveCount(0);
});

test('pesos ficam disponíveis quando a comparação do servidor inclui externas conferidas', async ({ page }) => {
  const calls = await setup(page, { rows: [record({ state: 'reviewed', currency: 'BRL' }), record({ id: '00000000-0000-4000-8000-000000000806', state: 'reviewed', currency: 'BRL', provider_name: 'Banco Dois', terms: { offered_amount: 390000, interest_rate_month: 1.5 } })] });
  await page.goto('about:blank');
  await page.goto(`/finance/rfq.html?id=${RFQ}#comparacao`);
  await expect(page.locator('.matrix-external').first()).toBeAttached();
  await expect(page.getByText('Seus critérios e pesos')).toBeVisible();
  expect(calls.filter((c) => c.path === 'comparison').length).toBeGreaterThan(0);
});

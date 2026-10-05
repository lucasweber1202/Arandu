import { test, expect } from '@playwright/test';
import { presentExtractionPage, presentExtractionDetail } from '../../lib/finance/extraction-presenter.mjs';
// Mocks usam o apresentador real do servidor: o teste cobre a cópia que o usuário vê.
const ORG = '00000000-0000-4000-8000-0000000d0e01';
const DOC = '00000000-0000-4000-8000-0000000d0e02';
const X1 = '00000000-0000-4000-8000-0000000d0e03';
const X0 = '00000000-0000-4000-8000-0000000d0e04';
const F1 = '00000000-0000-4000-8000-0000000d0e05';
const F2 = '00000000-0000-4000-8000-0000000d0e06';
const extraction = { id: X1, organization_id: ORG, document_id: DOC, document_version: 2, schema_key: 'credit_proposal', provider: 'deterministic_v1', provider_version: 'deterministic-v1.0', status: 'completed',
  document_mime: 'application/pdf', document_sha256: 'a'.repeat(64), pages: 2, flags: ['instruction_like_content'], warnings: [], created_at: '2026-10-05T10:00:00Z' };
const base = { organization_id: ORG, extraction_id: X1, document_id: DOC, document_version: 2, schema_key: 'credit_proposal', method: 'deterministic_parser', parser_version: 'deterministic-v1.0', created_at: '2026-10-05T10:00:00Z' };
const facts = [
  { ...base, id: F1, field_key: 'spread_pct_year', value_state: 'present', raw_value: '2,10% a.a.', normalized_value: 2.1, unit: 'percent_per_year', confidence: 0.9, page: 1, locator: 'página 1, linha 5', criticality: 'critical', status: 'needs_review' },
  { ...base, id: F2, field_key: 'collateral', value_state: 'present', raw_value: 'Cessão fiduciária', normalized_value: 'Cessão fiduciária', confidence: 0.9, page: 2, locator: 'página 2, linha 1', criticality: 'standard', status: 'extracted' },
  { ...base, id: 'f3', field_key: 'validity_date', value_state: 'not_provided', criticality: 'critical', status: 'needs_review', confidence: null }
];
const previousFacts = [{ ...base, id: 'p1', extraction_id: X0, document_version: 1, field_key: 'spread_pct_year', value_state: 'present', normalized_value: 2.35, unit: 'percent_per_year', status: 'confirmed', confirmed_at: '2026-09-30T10:00:00Z', criticality: 'critical' }];

async function setup(page, { role = 'admin', fail = false } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method(), query: Object.fromEntries(u.searchParams), body: req.postData() ? JSON.parse(req.postData()) : null });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Extraction test group' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Extraction test group' }, providers: [], contracts: [], rfqs: [], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Test actor' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin' });
    if (path === 'extractions' && req.method() === 'GET') return fail ? json({ ok: false, error: 'Falha controlada no teste' }, 503)
      : json({ ok: true, ...presentExtractionPage({ rows: [{ ...extraction, document_title: 'Proposta Banco Fictício', needs_review: 2 }], documents: [{ id: DOC, title: 'Proposta Banco Fictício', entity_type: 'proposal', entity_id: DOC, current_version: 2 }], next: null, queue: { needs_review: 2, extracted: 1, confirmed: 4 } }) });
    if (path === 'extractions/detail') return json({ ok: true, ...presentExtractionDetail({ extraction, document: { id: DOC, title: 'Proposta Banco Fictício', entity_type: 'proposal', entity_id: DOC }, facts, reviews: [], previous: { id: X0, created_at: '2026-09-30T10:00:00Z', document_version: 1 }, previousFacts }) });
    if (path.startsWith('extractions/')) return json({ ok: true, id: X1, facts: 3 }, 201);
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('fila de documentos: estado, revisão pendente e origem; extrair não é decidir', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/extractions.html');
  await expect(page.getByRole('heading', { name: 'Documentos e fatos extraídos', exact: true }).first()).toBeVisible();
  await expect(page.getByText(/2 fato\(s\) com revisão necessária · 1 extraído\(s\) sem confirmação · 4 confirmado\(s\) por pessoa/)).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Proposta Banco Fictício · v2' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '2 pendente(s)' })).toBeVisible();
  await page.getByLabel('Tipo de documento').selectOption('credit_proposal');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect.poll(() => calls.filter((c) => c.path === 'extractions').at(-1)?.query.schema_key).toBe('credit_proposal');
  for (const banned of [/recomend/i, /melhor proposta/i, /vencedor/i]) await expect(page.getByText(banned)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('extração: documento, tipo e leitor enviados ao servidor', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/extractions.html');
  await page.getByRole('button', { name: 'Extrair fatos de documento' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Documento (versão atual)').selectOption(`${DOC}|2`);
  await dialog.getByLabel('Tipo de documento').selectOption('credit_proposal');
  await dialog.getByLabel('Leitor').selectOption('deterministic_v1');
  await dialog.getByRole('button', { name: /Salvar|Enviar|Registrar|Confirmar/ }).click();
  await expect.poll(() => calls.find((c) => c.path === 'extractions/start')?.body).toMatchObject({ organization_id: ORG, document: `${DOC}|2`, schema_key: 'credit_proposal', provider: 'deterministic_v1' });
});

test('revisão: proveniência por campo, crítico marcado, diff com a versão anterior e aviso de instrução', async ({ page }) => {
  const calls = await setup(page);
  await page.goto(`/finance/extractions.html?id=${X1}`);
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/◆ Spread \(% a\.a\.\): 2,1 % a\.a\. \(no documento: "2,10% a\.a\."\) — Revisão necessária · documento v2, página 1, linha 5 · Leitor determinístico deterministic-v1\.0 · confiança 90%/)).toBeVisible();
  await expect(dialog.getByText(/Validade da proposta: Não informado no documento/)).toBeVisible();
  await expect(dialog.getByText(/◆ Spread \(% a\.a\.\): 2,35 % a\.a\. → 2,1 % a\.a\. \(alterado, -0,25 p\.p\.\) · inclui valor não confirmado/)).toBeVisible();
  await expect(dialog.getByText(/trechos com formato de instrução — tratados apenas como texto, nunca obedecidos/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Revisar fato' }).click();
  const form = page.getByRole('dialog').last();
  await form.getByLabel('Fato').selectOption(`${F1}|needs_review`);
  await form.getByLabel('Ação').selectOption('correct');
  await form.getByLabel(/Valor correto/).fill('2,45% a.a.');
  await form.getByLabel(/Justificativa/).fill('Conferido na página 1 do documento');
  await form.getByRole('button', { name: /Salvar|Enviar|Registrar|Confirmar/ }).click();
  await expect.poll(() => calls.find((c) => c.path === 'extractions/review')?.body).toMatchObject({ fact: `${F1}|needs_review`, action: 'correct', value: '2,45% a.a.' });
});

test('leitor (viewer) vê fatos e origem, sem botões de extração ou revisão', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  await page.goto(`/finance/extractions.html?id=${X1}`);
  await expect(page.getByRole('dialog').getByText(/◆ Spread/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revisar fato' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Extrair fatos de documento' })).toHaveCount(0);
});

test('falha do servidor mostra erro recuperável, nunca lista vazia como zero', async ({ page }) => {
  await setup(page, { fail: true });
  await page.goto('/finance/extractions.html');
  await expect(page.getByText(/Falha controlada no teste/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Tentar novamente/ })).toBeVisible();
});

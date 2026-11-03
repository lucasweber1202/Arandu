import { test, expect } from '@playwright/test';
import { EXTERNAL_PROPOSAL_NOTICE } from '../../lib/finance/external-proposals.mjs';
import { buildComparison } from '../../lib/finance/comparison.mjs';
import { PRODUCTS } from '../../lib/finance/products.mjs';
// Quadro de respostas da negociação: convites, propostas do portal e propostas
// externas por instituição, com de quem é a vez e "Antes de comparar".
// APIs SIMULADAS (contratos rfq/overview e external-proposals); não é
// validação contra Supabase real nem ambiente hospedado.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const RFQ = '00000000-0000-4000-8000-000000000702';
const PA = '00000000-0000-4000-8000-000000000a01';
const PB = '00000000-0000-4000-8000-000000000a02';
const PC = '00000000-0000-4000-8000-000000000a03';
const XB = '00000000-0000-4000-8000-000000000b02';
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
// Todas as condições comparáveis do produto preenchidas (fixture), com validade futura.
const full = { ...Object.fromEntries(PRODUCTS.credit.proposalFields.filter((f) => f.comparable).map((f) => [f.key, f.options ? f.options[0]?.[0] ?? f.options[0] : 1])), valid_until: day(30) };
const proposal = (id, provider, name, over = {}) => ({ id, provider_id: provider, provider_name: name, provider_kind: 'bank', status: 'submitted', version: 1, versions_count: 1, rfq_revision: 2, submitted_at: new Date(Date.now() - 86400000).toISOString(), terms: full, ...over });
const rfq = { id: RFQ, organization_id: ORG, title: 'Capital de giro 2027', product: 'credit', status: 'collecting', revision: 2, owner_id: 'u1', response_deadline: day(6),
  demand: { amount: 500000, purpose: 'capital_de_giro', term_months: 24 },
  invites: [{ provider_id: PA, provider_name: 'Atlas Bank', status: 'accepted' }, { provider_id: PB, provider_name: 'Boreal Banco', status: 'invited' }, { provider_id: PC, provider_name: 'Cais Financeira', status: 'invited' }],
  proposals: [proposal('00000000-0000-4000-8000-000000000c01', PA, 'Atlas Bank'), proposal('00000000-0000-4000-8000-000000000c03', PC, 'Cais Financeira', { rfq_revision: 1, terms: { offered_amount: 300000 } })] };
const external = { id: XB, organization_id: ORG, rfq_id: RFQ, provider_id: PB, provider_name: 'Boreal Banco', product: 'credit', state: 'pending_review', current_version: 1, terms: { offered_amount: 450000 }, channel: 'email', received_at: null,
  source_reference: 'E-mail do gerente', currency: null, rfq_revision: 2, rfq_revision_matches: true, recorded_by: 'u1', recorded_at: '2026-10-20T12:00:00Z', document_id: null, document_state: 'not_presented', document_available: false, origin: 'buyer_recorded_external', decision_allowed: false };

async function setup(page, { externals = 'ok', role = 'admin' } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method(), query: Object.fromEntries(u.searchParams) });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, providers: [{ id: PA, name: 'Atlas Bank', status: 'active' }, { id: PB, name: 'Boreal Banco', status: 'active' }, { id: PC, name: 'Cais Financeira', status: 'active' }], contracts: [], rfqs: [rfq], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Ana Tesouraria' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin' });
    if (path === 'external-proposals' && req.method() === 'GET') {
      if (externals === 'failed') return json({ ok: false, error: 'falha' }, 500);
      if (externals === 'unavailable') return json({ ok: false, error: 'Indisponível', code: 'schema_incompatible' }, 503);
      return json({ ok: true, rows: [external], page: { has_more: false, next_after: null }, decision_allowed: false, notice: EXTERNAL_PROPOSAL_NOTICE });
    }
    if (path === 'comparison') return json({ ok: true, comparison: buildComparison('credit', [], rfq.demand, { revision: 2 }) });
    if (path === 'approval-policy') return json({ ok: true, required_for_decision: false });
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('quadro de respostas: por instituição, canal, de quem é a vez e navegação à proposta e ao relacionamento', async ({ page }) => {
  const calls = await setup(page);
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  const board = page.locator('#quadro-respostas');
  await expect(board.getByRole('heading', { name: 'Quadro de respostas' })).toBeVisible();
  await expect(board).toContainText('3 instituições · 1 aguardando a instituição · 1 aguardando a empresa · 2 na comparação');
  const row = (id) => board.locator(`[data-provider="${id}"]`);
  await expect(row(PA)).toContainText('Proposta v1 recebida');
  await expect(row(PA)).toContainText('Sem pendência nesta etapa');
  // Externa: registrada pela empresa, não autenticada; vez da empresa conferir.
  await expect(row(PB)).toContainText('Aguardando a empresa');
  await expect(row(PB)).toContainText('Registrada pela empresa (fonte externa, não autenticada pela instituição)');
  await expect(row(PB)).toContainText('fora da comparação');
  await expect(row(PB)).not.toContainText('Enviada pela instituição');
  // Resposta para revisão anterior com coleta aberta: vez da instituição.
  await expect(row(PC)).toContainText('Aguardando a instituição');
  await expect(row(PC)).toContainText('Respondeu à revisão 1; a solicitação está na revisão 2');
  await expect(row(PA).getByRole('link', { name: 'Relacionamento' })).toHaveAttribute('href', new RegExp(`providers\\.html\\?provider_id=${PA}`));
  await expect(board).not.toContainText(/melhor|mais vantajos|recomend/i);
  expect(calls.find((c) => c.path === 'external-proposals').query.rfq_id).toBe(RFQ);
  // Uma única leitura da lista externa ao abrir: o quadro reutiliza a que a página já fez.
  expect(calls.filter((c) => c.path === 'external-proposals' && c.method === 'GET')).toHaveLength(1);

  // Copilot com a negociação como contexto: abre a pergunta, não executa nada.
  await board.getByRole('button', { name: 'Resumir respostas' }).click();
  await expect(page.getByRole('dialog').filter({ hasText: 'Capital de giro 2027' }).first()).toBeVisible();
  await page.keyboard.press('Escape');

  // Do quadro à proposta externa: abre a aba Propostas e foca o cartão.
  await row(PB).getByRole('link', { name: 'Ver proposta de Boreal Banco (fonte externa)' }).click();
  await expect(page).toHaveURL(/#propostas$/);
  await expect(page.locator(`#external-${XB}`)).toBeFocused();
});

test('Antes de comparar: o que fica fora e o que falta, sem ranking', async ({ page }) => {
  await setup(page);
  await page.goto(`/finance/rfq.html?id=${RFQ}#comparacao`);
  const ready = page.locator('#antes-de-comparar');
  await expect(ready).toContainText('Antes de comparar');
  await expect(ready).toContainText('Boreal Banco (externa): fora da comparação — aguardando conferência.');
  await expect(ready).toContainText('Cais Financeira (portal): responde a uma revisão anterior da solicitação.');
  await expect(ready).toContainText(/Cais Financeira \(portal\): \d+ condições comparáveis não informadas/);
  await expect(ready).not.toContainText('Atlas Bank');
  await ready.getByRole('link', { name: 'Ver' }).first().click();
  await expect(page).toHaveURL(/#propostas$/);
});

test('propostas externas que falham viram aviso; 503 é indisponível neste ambiente', async ({ page }) => {
  await setup(page, { externals: 'failed' });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  const board = page.locator('#quadro-respostas');
  await expect(board.getByRole('alert')).toContainText('As propostas externas não carregaram. Isso não significa que não existam');
  await expect(board).toContainText('Atlas Bank');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await setup(page, { externals: 'unavailable' });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await expect(page.locator('#quadro-respostas')).toContainText('registro ainda não disponível neste ambiente');
});

test('quadro de respostas cabe na largura do celular', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await expect(page.locator('#quadro-respostas [data-provider]').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

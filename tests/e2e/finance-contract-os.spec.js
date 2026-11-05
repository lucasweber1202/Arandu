import { test, expect } from '@playwright/test';
// Contract & Portfolio OS: carteira com pendências e filtros na URL, contrato com
// covenants/obrigações, Caixa de Trabalho com prazos de obrigações e instituição
// levando à carteira recortada.
// APIs SIMULADAS (overview, contract-detail, covenants, provider-relationship):
// não é validação contra Supabase real nem ambiente hospedado.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const PA = '00000000-0000-4000-8000-0000000000b1';
const PB = '00000000-0000-4000-8000-0000000000b2';
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const contract = (n, over = {}) => ({ id: id(n), organization_id: ORG, provider_id: PA, provider_name: 'Atlas Bank', product: 'credit', origin: 'imported', title: `Contrato ${n}`, status: 'active',
  starts_on: day(-400), ends_on: day(700), renewal_notice_days: 60, review_from: day(640), current_version: 1, document_reference: 'CCB 1', owner_id: 'u1', currency: 'BRL', legal_entity_id: null, ...over });
const OK = contract(1, { title: 'Giro em dia' });
const PAST = contract(2, { title: 'Giro aviso vencido', ends_on: day(40) }); // aviso há 20 dias
const NOOWNER = contract(3, { title: 'Adquirência sem dono', provider_id: PB, provider_name: 'Boreal Banco', product: 'acquiring', owner_id: null, document_reference: null });
const CONTRACTS = [OK, PAST, NOOWNER];
const covenant = (n, over = {}) => ({ id: id(900 + n), title: `Covenant ${n}`, kind_label: 'Covenant financeiro', status: 'awaiting_data', status_label: 'Aguardando dados', has_data: false,
  due_on: day(10), contract_id: OK.id, provider_id: PA, legal_entity_id: null, owner_id: 'u1', cells: ['x', 'y', 'z', 'w', 'v'], ...over });

async function setup(page, { detailExtra = {}, contracts = CONTRACTS, pagedContracts = null, endlessCovenants = false, covenants = 'ok', covenantRows = [covenant(1), covenant(2, { status: 'compliant', status_label: 'Conforme após revisão', has_data: true, title: 'Covenant já conforme' })] } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, query: Object.fromEntries(u.searchParams) });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta', sector: 'industry' }, providers: [{ id: PA, name: 'Atlas Bank', status: 'active' }, { id: PB, name: 'Boreal Banco', status: 'active' }], contracts, rfqs: [], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'admin', display_name: 'Paula Nogueira' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: true });
    if (path === 'contracts' && u.searchParams.get('paged') === '1') {
      if (pagedContracts === 'error') return json({ ok: false, error: 'falha' }, 500);
      const all = pagedContracts || contracts; const after = u.searchParams.get('after');
      const start = after ? all.findIndex((r) => r.id === after) + 1 : 0; const page = all.slice(start, start + 100);
      return json({ ok: true, rows: page, next: start + 100 < all.length ? page.at(-1).id : null, limit: 100 });
    }
    if (path === 'contract-detail') {
      const c = CONTRACTS.find((row) => row.id === u.searchParams.get('id'));
      return c ? json({ ok: true, contract: c, effective: null, versions: [], amendments: [], milestones: [], children: [], documents: [], events: [], renewal_milestones: [], ...detailExtra }) : json({ ok: false }, 404);
    }
    if (path === 'covenants') {
      if (covenants === 'error') return json({ ok: false, error: 'falha' }, 500);
      if (covenants === 'forbidden') return json({ ok: false, error: 'negado' }, 403);
      // Emula os filtros do servidor (status=open, janela de prazo, sem prazo).
      const sp = u.searchParams; const cid = sp.get('contract_id');
      const closed = ['compliant', 'waived', 'not_applicable'];
      const rows = covenantRows.filter((r) => (!cid || r.contract_id === cid) && (sp.get('status') !== 'open' || !closed.includes(r.status))
        && (sp.get('no_due') !== 'true' || !r.due_on) && (!sp.get('due_before') || (r.due_on && r.due_on <= sp.get('due_before'))));
      return json({ ok: true, rows, next: endlessCovenants && sp.get('no_due') !== 'true' ? String(Number(sp.get('after') || 0) + 25) : null, columns: [], cards: [] });
    }
    if (path === 'provider-relationship') return json({ ok: true, provider: { id: PA, name: 'Atlas Bank' }, neutrality: 'Fatos.', contracts: [OK, PAST], tasks: [], facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [],
      metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 2, open_issues: 0, median_resolution_days: null, definitions: {} } });
    return json({ ok: true, rows: [] });
  });
  return calls;
}
const card = (page, c) => page.locator(`#contract-${c.id}`);

test('carteira: pendências factuais, filtro por pendência na URL e recarga preserva o recorte', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/contracts.html');
  const chips = page.getByRole('group', { name: 'Pendências da carteira' });
  await expect(chips.getByRole('button', { name: /Com pendência\s*2/ })).toBeVisible();
  await expect(card(page, PAST).locator('.contract-exceptions')).toContainText('Aviso prévio vencido');
  await expect(card(page, NOOWNER).locator('.contract-exceptions')).toContainText('Sem responsável');
  await expect(card(page, OK).locator('.contract-exceptions')).toHaveCount(0);
  await chips.getByRole('button', { name: /Aviso prévio vencido/ }).click();
  await expect(page).toHaveURL(/[?&]excecao=past_notice/);
  await expect(card(page, PAST)).toBeVisible();
  await expect(card(page, OK)).toBeHidden();
  await expect(page.getByRole('status').filter({ hasText: 'contratos' }).first()).toContainText('1 de 3 contratos');
  await page.reload();
  await expect(card(page, OK)).toBeHidden();
  await expect(chips.getByRole('button', { name: /Aviso prévio vencido/ })).toHaveAttribute('aria-pressed', 'true');
});

test('carteira por instituição: resumo filtra, link de relacionamento e deep link da instituição', async ({ page }) => {
  await setup(page);
  await page.goto(`/finance/contracts.html?provider_id=${PB}`);
  await expect(card(page, NOOWNER)).toBeVisible();
  await expect(card(page, OK)).toBeHidden();
  await expect(page.locator('.contracts-tower select[name="provider_id"]')).toHaveValue(PB);
  const inst = page.locator('.portfolio-institutions');
  await expect(inst.getByRole('link', { name: 'Relacionamento com Atlas Bank' })).toHaveAttribute('href', new RegExp(`providers\\.html\\?provider_id=${PA}`));
  await inst.getByRole('button', { name: 'Atlas Bank' }).click();
  await expect(page).toHaveURL(new RegExp(`provider_id=${PA}`));
  await expect(card(page, OK)).toBeVisible();
  await expect(card(page, NOOWNER)).toBeHidden();
  // Parâmetro forjado é descartado: nada some por um filtro inexistente.
  await page.goto('/finance/contracts.html?provider_id=00000000-0000-4000-8000-000000000999&owner=intruso');
  await expect(card(page, OK)).toBeVisible();
  await expect(card(page, NOOWNER)).toBeVisible();
});

test('carteira → contrato → covenants deste contrato e volta ao recorte; filtro preservado ao fechar', async ({ page }) => {
  const calls = await setup(page);
  await page.goto(`/finance/contracts.html?provider_id=${PA}`);
  await card(page, OK).getByRole('button', { name: 'Abrir contrato: termos, aditivos e marcos' }).click();
  const dialog = page.getByRole('dialog', { name: 'Giro em dia' });
  const obl = dialog.locator('.contract-obligations');
  await expect(obl.getByRole('heading', { name: 'Covenants e obrigações' })).toBeVisible();
  await expect(obl).toContainText('Covenant 1');
  await expect(obl).toContainText('Aguardando dados');
  await expect(obl).toContainText('dados ausentes');
  await expect(obl).toContainText('conformidade só após revisão humana');
  await expect(obl.getByRole('link', { name: 'Registrar ou revisar' })).toHaveAttribute('href', new RegExp(`covenants\\.html\\?contract_id=${OK.id}`));
  expect(calls.find((c) => c.path === 'covenants' && c.query.contract_id)?.query.contract_id).toBe(OK.id);
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(new RegExp(`provider_id=${PA}`));
  await expect(card(page, NOOWNER)).toBeHidden();
});

for (const [mode, rows, text] of [['error', undefined, 'Isso não significa que não existam'], ['forbidden', undefined, 'Seu acesso não permite ver as obrigações'], ['ok', [], 'Ausência de registro não significa conformidade']]) {
  test(`contrato: covenants ${mode === 'ok' ? 'vazio não é conformidade' : mode === 'error' ? 'que falham são avisados' : 'sem acesso é explicado'}`, async ({ page }) => {
    await setup(page, { covenants: mode, ...(rows ? { covenantRows: rows } : {}) });
    await page.goto(`/finance/contracts.html?abrir=contrato#contract-${OK.id}`);
    await expect(page.getByRole('dialog').locator('.contract-obligations')).toContainText(text);
  });
}

test('Caixa de Trabalho: prazo de covenant em aberto entra e leva ao registro do contrato; conforme fica fora', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/tasks.html#deadline-radar');
  const radar = page.locator('#deadline-radar');
  const item = radar.locator('[data-kind="obligation"]');
  await expect(item).toHaveCount(1);
  await expect(item).toContainText('Covenant financeiro: Covenant 1');
  await expect(item).toContainText('Aguardando dados');
  await expect(item.getByRole('link')).toHaveAttribute('href', new RegExp(`covenants\\.html\\?contract_id=${OK.id}`));
  await expect(radar).not.toContainText('Covenant já conforme');
});

test('Caixa de Trabalho: falha das obrigações é avisada, nunca "nada pendente"', async ({ page }) => {
  await setup(page, { covenants: 'error' });
  await page.goto('/finance/tasks.html#deadline-radar');
  await expect(page.locator('#deadline-radar [data-source="obligations"]')).toContainText('Isso não significa que não haja nenhum');
});

test('instituição → carteira de contratos já recortada', async ({ page }) => {
  await setup(page);
  await page.goto(`/finance/providers.html?provider_id=${PA}`);
  const link = page.getByRole('dialog', { name: 'Atlas Bank' }).getByRole('link', { name: 'Contratos desta instituição' });
  await expect(link).toHaveAttribute('href', new RegExp(`contracts\\.html\\?provider_id=${PA}`));
  await link.click();
  await expect(card(page, OK)).toBeVisible();
  await expect(card(page, NOOWNER)).toBeHidden();
});

test('carteira cabe na largura do celular', async ({ page }) => {
  await setup(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/finance/contracts.html');
  await expect(card(page, OK)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test('Caixa de Trabalho pede só obrigações abertas na janela, lê as sem prazo e diz quando a cobertura é parcial', async ({ page }) => {
  const calls = await setup(page, { endlessCovenants: true, covenantRows: [covenant(1), covenant(3, { due_on: null, title: 'Covenant sem prazo' })] });
  await page.goto('/finance/tasks.html#deadline-radar');
  const radar = page.locator('#deadline-radar');
  await expect(radar.locator('[data-source="obligations-partial"]')).toContainText('cobertura parcial (primeiros 200 períodos');
  const reads = calls.filter((c) => c.path === 'covenants');
  expect(reads.every((c) => c.query.status === 'open')).toBe(true);
  expect(reads.filter((c) => c.query.due_before).length).toBe(8);
  expect(reads.some((c) => c.query.no_due === 'true')).toBe(true);
  await radar.locator('[data-bucket="undated"] summary').click();
  await expect(radar.locator('[data-bucket="undated"]')).toContainText('Covenant sem prazo');
});

const many = (n) => Array.from({ length: n }, (_, i) => contract(1000 + i, { title: `Carteira ${String(i).padStart(3, '0')}`, ends_on: day(700) }));
test('carteira grande: no limite da visão geral lê todas as páginas e conta a carteira inteira', async ({ page }) => {
  const all = [...many(249), PAST];
  const calls = await setup(page, { contracts: all.slice(0, 200), pagedContracts: all });
  await page.goto('/finance/contracts.html');
  await expect(page.getByRole('status').filter({ hasText: 'contratos' }).first()).toContainText('250 de 250 contratos');
  expect(calls.filter((c) => c.path === 'contracts' && c.query.paged === '1').length).toBe(3);
  await expect(page.locator('[data-coverage]')).toHaveCount(0);
  // Renderização progressiva: 50 cartões, o resto sob demanda; contagens cobrem os 250.
  await expect(page.locator('.contract-list > .contract-card')).toHaveCount(50);
  await page.locator('[data-more="contracts"]').click();
  await expect(page.locator('.contract-list > .contract-card')).toHaveCount(100);
  // O contrato da 3ª página entra nas pendências e aparece pelo filtro.
  await page.getByRole('group', { name: 'Pendências da carteira' }).getByRole('button', { name: /Aviso prévio vencido\s*1/ }).click();
  await expect(card(page, PAST)).toBeVisible();
});

test('carteira grande: falha na leitura completa é dita e as contagens valem só para o recorte lido', async ({ page }) => {
  await setup(page, { contracts: many(200), pagedContracts: 'error' });
  await page.goto('/finance/contracts.html');
  await expect(page.locator('[data-coverage="failed"]')).toContainText('primeiros 200 contratos');
});

test('Contract 360: lacunas vêm dos sinais do servidor (v8) e levam ao bloco que as resolve', async ({ page }) => {
  const signal = (code, reason) => ({ code, reason, source: { type: 'contract', id: OK.id }, state: 'information_review', permission: {}, action: {} });
  await setup(page, { detailExtra: { information_quality: { observed_on: day(0), assessment: 'recorded_information_only' },
    next_actions: [signal('contract_document_missing', 'Nenhum documento privado associado neste escopo; referências externas são consultadas separadamente.'), signal('contract_end_missing', 'Data de término não registrada.')] } });
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${OK.id}`);
  const summary = page.getByRole('dialog').locator('.contract-summary');
  const gaps = summary.locator('.contract-gaps');
  await expect(gaps.locator('[data-gap="contract_document_missing"]')).toContainText('Nenhum documento privado associado');
  await expect(gaps.locator('[data-gap="contract_end_missing"]')).toContainText('Data de término não registrada.');
  // Regra local não duplica: "Sem referência do documento assinado" (cliente) não aparece quando o servidor responde.
  await expect(gaps).not.toContainText('Sem referência do documento assinado');
  await expect(summary).toContainText('Sinais calculados pelo servidor');
  await expect(summary).toContainText('não avaliam qualidade de crédito nem conformidade');
  await gaps.locator('[data-gap="contract_document_missing"]').getByRole('button', { name: 'Ver documentos' }).click();
  await expect(summary.locator('.lazy-documents summary')).toBeFocused();
});

test('Relationship 360: obrigações em aberto da instituição pelo filtro do servidor; vazio não é conformidade', async ({ page }) => {
  const calls = await setup(page);
  await page.goto(`/finance/providers.html?provider_id=${PA}`);
  const dialog = page.getByRole('dialog', { name: 'Atlas Bank' });
  const section = dialog.locator('.contract-obligations');
  await expect(section.getByRole('heading', { name: 'Obrigações em aberto com esta instituição' })).toBeVisible();
  await expect(section).toContainText('Covenant 1');
  await expect(section).not.toContainText('Covenant já conforme');
  const read = calls.find((c) => c.path === 'covenants' && c.query.provider_id === PA);
  expect(read.query.status).toBe('open');
  await expect(section.getByRole('link', { name: 'Abrir registro' })).toHaveAttribute('href', new RegExp(`covenants\\.html\\?provider_id=${PA}`));
});

// Histórico documental: ao abrir, versões paginadas do servidor
// (private-documents/versions), com envio não concluído declarado e sem baixar
// o que não está disponível. API SIMULADA: não prova Storage nem trilha real.
test('contrato: histórico completo de versões do documento, paginado e com estado do envio', async ({ page }) => {
  await setup(page);
  const DOC = id(800);
  const version = (v, over = {}) => ({ document_id: DOC, version: v, status: 'available', mime_type: 'application/pdf', size_bytes: 2048 * v, sha256: 'a'.repeat(64), uploaded_by: 'u1', created_at: '2026-10-0' + v + 'T10:00:00Z', completed_at: '2026-10-0' + v + 'T10:01:00Z', ...over });
  const reads = [];
  await page.route('**/api/finance/private-documents?*', (route) => route.fulfill({ json: { ok: true, rows: [{ id: DOC, organization_id: ORG, title: 'CCB assinada', visibility: 'internal', current_version: 3,
    versions: [version(3), version(2)] }], limits: {} } }));
  await page.route('**/api/finance/private-documents/versions?*', (route) => {
    const u = new URL(route.request().url()); reads.push(Object.fromEntries(u.searchParams));
    return route.fulfill({ json: u.searchParams.get('cursor')
      ? { ok: true, rows: [version(1)], page: { has_more: false, next_cursor: null } }
      : { ok: true, rows: [version(4, { status: 'pending', completed_at: null, size_bytes: null }), version(3), version(2)], page: { has_more: true, next_cursor: 'c1' } } });
  });
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${OK.id}`);
  const dialog = page.getByRole('dialog');
  await dialog.locator('.lazy-documents summary').click();
  const history = dialog.locator('.document-history');
  await history.locator('summary').click();
  await expect(history.locator('[data-version="4"]')).toContainText('envio não concluído');
  await expect(history.locator('[data-version="4"]').getByRole('button', { name: /Baixar/ })).toHaveCount(0);
  await expect(history.locator('[data-version="3"]')).toContainText('integridade registrada');
  await expect(history).not.toContainText('aaaaaaaa');
  await history.getByRole('button', { name: 'Carregar versões anteriores' }).click();
  await expect(history.locator('[data-version="1"]')).toBeVisible();
  await expect(history).toContainText('Histórico completo: todas as versões registradas');
  expect(reads.map((r) => [r.document_id, r.cursor || null])).toEqual([[DOC, null], [DOC, 'c1']]);
});

test('contrato: histórico detalhado que falha é declarado e mantém a lista resumida', async ({ page }) => {
  await setup(page);
  const DOC = id(801);
  await page.route('**/api/finance/private-documents?*', (route) => route.fulfill({ json: { ok: true, rows: [{ id: DOC, organization_id: ORG, title: 'Aditivo', visibility: 'internal', current_version: 2,
    versions: [{ version: 2, mime_type: 'application/pdf', size_bytes: 10, uploaded_by: 'u1', completed_at: '2026-10-02T10:00:00Z' }, { version: 1, mime_type: 'application/pdf', size_bytes: 10, uploaded_by: 'u1', completed_at: '2026-10-01T10:00:00Z' }] }], limits: {} } }));
  await page.route('**/api/finance/private-documents/versions?*', (route) => route.fulfill({ status: 500, json: { ok: false, error: 'falha' } }));
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${OK.id}`);
  const dialog = page.getByRole('dialog');
  await dialog.locator('.lazy-documents summary').click();
  const history = dialog.locator('.document-history');
  await history.locator('summary').click();
  await expect(history).toContainText('pode estar incompleta');
  await expect(history.locator('[data-version="1"]')).toBeVisible();
});

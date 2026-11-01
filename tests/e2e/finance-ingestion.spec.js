import { test, expect } from '@playwright/test';
// Importação de tarifas (financial-fee-import-v1) e ERP Hub (erp-fees).
// APIs SIMULADAS: o mock devolve prévias e recibos no formato do contrato. O
// parsing/validação real está em scripts/test-structured-ingestion.mjs e no
// banco em tests/database/financial-fee-ingestion.sql. Business Central real:
// NÃO VERIFICADO (sem credencial).
const ORG = '00000000-0000-4000-8000-0000000000a1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const INT = '00000000-0000-4000-8000-0000000000e9';
const day = (o) => new Date(Date.now() + o * 86400000).toISOString().slice(0, 10);
const CONTRACT = { id: C1, organization_id: ORG, provider_id: 'p1', provider_name: 'Atlas Bank', product: 'cash_management', title: 'Pacote de serviços', status: 'active', origin: 'imported', starts_on: day(-300), ends_on: day(200), current_version: 1, legal_entity_id: null };
const CSV = 'ID;Serviço;Unidade;Moeda;Início;Fim;Valor;Obs\nA1;TED;per_transaction;BRL;2026-09-01;2026-09-30;12,50;x\nA2;DOC;per_transaction;BRL;2026-09-01;2026-09-30;8,00;y\nA3;Pacote;per_month;BRL;2026-09-01;2026-09-30;;z\nA4;TED;per_transaction;BRL;2026-09-01;2026-09-30;13,00;w\n';
const PREVIEW = { api_version: 'financial-fee-import-v1', fingerprint: 'fp-1', file_fingerprint: 'sha', confirmation_required: true, columns: ['ID', 'Serviço'], stats: { valid: 1, duplicate: 1, incomplete: 1, conflicting: 1 },
  rows: [
    { line: 1, state: 'valid', values: { service: 'TED', currency: 'BRL', period_start: '2026-09-01', period_end: '2026-09-30', observed_amount: '12.50' }, errors: [] },
    { line: 2, state: 'duplicate', existing_id: 'o2', values: { service: 'DOC', currency: 'BRL', period_start: '2026-09-01', period_end: '2026-09-30', observed_amount: '8.00' }, errors: [] },
    { line: 3, state: 'incomplete', values: { service: 'Pacote', currency: 'BRL', period_start: '2026-09-01', period_end: '2026-09-30', observed_amount: '' }, errors: [{ column: 'Valor', code: 'required', suggestion: 'Informe o valor da coluna.' }] },
    { line: 4, state: 'conflicting', existing_id: 'o4', values: { service: 'TED', currency: 'BRL', period_start: '2026-09-01', period_end: '2026-09-30', observed_amount: '13.00' }, errors: [] }
  ] };

async function setup(page, { role = 'admin', confirm = () => ({ status: 200, body: { ok: true, rows: [{ line: 1, id: 'n1', state: 'imported' }, { line: 2, id: 'o2', state: 'ignored' }], imported: 1, ignored: 1, replayed: false } }), integrations = [], erpPreview = null } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (req.method() !== 'GET') calls.push({ path, body: JSON.parse(req.postData() || '{}') });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], providers: [], contracts: [CONTRACT], rfqs: [], tasks: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Paula' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin' });
    if (path === 'fees') return json({ ok: true, rows: [], columns: [], forms: [], filters: {} });
    if (path === 'fee-imports/preview') return json({ ok: true, preview: PREVIEW });
    if (path === 'fee-imports/confirm') { const o = confirm(calls.at(-1).body); return json(o.body, o.status); }
    if (path === 'fee-imports/history') return json({ ok: true, rows: [{ id: 'e1', happened_at: new Date().toISOString(), metadata: { file_name: 'tarifas.csv', imported: 1 } }], next: null });
    if (path === 'erp-fees' && req.method() === 'GET') return json({ ok: true, rows: integrations, next: null });
    if (path === 'erp-fees/configure') { const b = calls.at(-1).body; return json({ ok: true, configuration: { id: b.integration_id, contract_id: b.contract_id, version: b.expected_version + 1, status: b.status, settings: b.settings, connection_state: 'not_tested' } }); }
    if (path === 'erp-fees/preview') { const o = erpPreview || { status: 503, body: { ok: false, code: 'erp_not_configured' } }; return json(o.body, o.status); }
    if (path === 'erp-fees/confirm') return json({ ok: true, imported: 1, ignored: 0, replayed: false });
    return json({ ok: true, rows: [] });
  });
  return calls;
}
async function upload(page, dialog, { name = 'tarifas.csv', content = CSV } = {}) {
  await dialog.getByLabel(/^Contrato das tarifas/).selectOption(C1);
  await dialog.getByLabel(/^Arquivo/).setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(content) });
  await dialog.getByLabel(/^Origem do arquivo/).fill('Extrato Atlas setembro 2026');
  await dialog.getByRole('button', { name: 'Ler colunas' }).click();
}

test('arquivo misto: colunas, mapeamento, prévia por linha, seleção, confirmação e recibo', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/fees.html');
  await page.locator('#fee-import-trigger').click();
  const dialog = page.getByRole('dialog', { name: 'Importar tarifas cobradas' });
  await upload(page, dialog);
  // Mapeamento sugerido pelos nomes; a pessoa confere.
  await expect(dialog.locator('[data-field="service"]')).toHaveValue('Serviço');
  await expect(dialog.locator('[data-field="observed_amount"]')).toHaveValue('Valor');
  await dialog.getByRole('button', { name: 'Gerar prévia' }).click();
  const preview = calls.find((c) => c.path === 'fee-imports/preview').body;
  expect(preview).toMatchObject({ organization_id: ORG, contract_id: C1, delimiter: ';', source_reference: 'Extrato Atlas setembro 2026', file: { name: 'tarifas.csv', format: 'csv' },
    mapping: { source_object_id: 'ID', service: 'Serviço', charging_unit: 'Unidade', currency: 'Moeda', period_start: 'Início', period_end: 'Fim', observed_amount: 'Valor' } });
  expect(Buffer.from(preview.file.content_base64, 'base64').toString()).toBe(CSV);
  expect(preview.mapping).not.toHaveProperty('volume');
  // Estados por linha; problemas com coluna e sugestão.
  await expect(dialog.locator('tr[data-state="incomplete"]')).toContainText('Coluna "Valor": Valor obrigatório ausente — Informe o valor da coluna.');
  await expect(dialog.locator('tr[data-state="conflicting"]')).toContainText('Não sobrescreve');
  await expect(dialog.getByLabel('Importar linha 3')).toBeDisabled();
  await expect(dialog.getByLabel('Importar linha 4')).toBeDisabled();
  await expect(dialog.getByLabel('Importar linha 1')).toBeChecked();
  await dialog.getByLabel('Importar linha 2').check();
  await dialog.getByRole('button', { name: 'Confirmar importação' }).click();
  await page.getByRole('dialog', { name: /Gravar 2 linhas/ }).getByRole('button', { name: 'Gravar' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: '1 linha importada' })).toContainText('1 linha ignorada (já registrada)');
  const confirm = calls.find((c) => c.path === 'fee-imports/confirm').body;
  expect(confirm).toMatchObject({ confirmation: true, preview_fingerprint: 'fp-1', selected_lines: [1, 2], mapping: preview.mapping, contract_id: C1 });
  expect(confirm.request_key).toMatch(/^[0-9a-f-]{36}$/);
  await expect(dialog.getByRole('link', { name: 'Ver tarifas do contrato' })).toHaveAttribute('href', new RegExp(`fees\\.html\\?contract_id=${C1}`));
  await expect(dialog).toContainText('tarifas.csv · 1 importada');
});

test('validação local: separador errado, limite de tamanho e mapeamento incompleto não chegam ao servidor', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/fees.html');
  await page.locator('#fee-import-trigger').click();
  const dialog = page.getByRole('dialog', { name: 'Importar tarifas cobradas' });
  await dialog.getByLabel(/^Separador/).selectOption(',');
  await upload(page, dialog);
  await expect(dialog.getByRole('alert')).toContainText('Troque o separador');
  await dialog.getByLabel(/^Separador/).selectOption(';');
  await dialog.getByLabel(/^Arquivo/).setInputFiles({ name: 'grande.csv', mimeType: 'text/csv', buffer: Buffer.alloc(70000, 'a') });
  await dialog.getByRole('button', { name: 'Ler colunas' }).click();
  await expect(dialog.getByRole('alert')).toContainText('passa do limite de 64 KiB');
  await dialog.getByLabel(/^Arquivo/).setInputFiles({ name: 'tarifas.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV.replace('Serviço', 'Item')) });
  await dialog.getByRole('button', { name: 'Ler colunas' }).click();
  await dialog.getByRole('button', { name: 'Gerar prévia' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Mapeie: Serviço cobrado');
  expect(calls.filter((c) => c.path.startsWith('fee-imports'))).toHaveLength(0);
});

test('confirmação incerta repete a mesma chave; corrigir mapeamento preserva o arquivo', async ({ page }) => {
  let n = 0;
  const calls = await setup(page, { confirm: () => (++n === 1 ? { status: 502, body: { ok: false } } : { status: 200, body: { ok: true, rows: [], imported: 1, ignored: 0, replayed: true } }) });
  await page.goto(`/finance/fees.html?contract_id=${C1}`);
  await page.locator('#fee-import-trigger').click();
  const dialog = page.getByRole('dialog', { name: 'Importar tarifas cobradas' });
  await expect(dialog.getByLabel(/^Contrato das tarifas/)).toHaveValue(C1);
  await upload(page, dialog);
  await dialog.getByRole('button', { name: 'Gerar prévia' }).click();
  await dialog.getByRole('button', { name: 'Corrigir mapeamento' }).click();
  await expect(dialog.locator('[data-field="service"]')).toHaveValue('Serviço');
  await dialog.getByRole('button', { name: 'Gerar prévia' }).click();
  await dialog.getByRole('button', { name: 'Confirmar importação' }).click();
  await page.getByRole('dialog', { name: /Gravar 1 linha/ }).getByRole('button', { name: 'Gravar' }).click();
  await expect(dialog.getByRole('alert')).toContainText('consulte o histórico');
  await dialog.getByRole('button', { name: 'Repetir a mesma confirmação' }).click();
  await page.getByRole('dialog', { name: /Gravar 1 linha/ }).getByRole('button', { name: 'Gravar' }).click();
  await expect(dialog).toContainText('nada foi duplicado');
  const keys = calls.filter((c) => c.path === 'fee-imports/confirm').map((c) => c.body.request_key);
  expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1]);
});

test('ERP Hub: catálogo verdadeiro, configuração sem segredo, prévia sem credencial é explícita', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/settings.html#integracoes');
  const hub = page.locator('#erp-hub');
  await expect(hub.locator('[data-state="planned"]')).toHaveCount(6);
  await expect(hub.locator('[data-state="implemented"]')).toContainText('Adaptador implementado · leitura');
  await expect(hub).toContainText('Nenhuma integração configurada.');
  await hub.getByRole('button', { name: 'Configurar Business Central' }).click();
  const form = page.getByRole('dialog', { name: 'Configurar Business Central' });
  await expect(form).toContainText('Nenhuma senha, token ou segredo é pedido aqui');
  await expect(form.locator('input[type="password"]')).toHaveCount(0);
  await form.getByRole('button', { name: 'Gravar configuração' }).click();
  await expect(form).toContainText('Use o ID do tenant');
  await form.getByLabel(/^Contrato que recebe/).selectOption(C1);
  await form.getByLabel(/^Tenant/).fill('11111111-1111-4111-8111-111111111111');
  await form.getByLabel(/^Ambiente/).fill('sandbox');
  await form.getByLabel(/^Empresa/).fill('22222222-2222-4222-8222-222222222222');
  await form.getByLabel(/^Conta de despesa/).fill('33333333-3333-4333-8333-333333333333');
  await form.getByLabel(/^Moeda/).fill('BRL');
  await form.getByLabel(/^Serviço/).fill('Tarifas bancárias Atlas');
  await form.getByRole('button', { name: 'Gravar configuração' }).click();
  await expect(page.getByText('Conexão ainda não testada')).toBeVisible();
  expect(calls.find((c) => c.path === 'erp-fees/configure').body).toMatchObject({ expected_version: 0, status: 'configured', contract_id: C1, settings: { environment: 'sandbox', currency: 'BRL', charging_unit: 'per_month' } });
  for (const banned of [/conectado/i, /sincronizad/i]) await expect(hub.getByText(banned)).toHaveCount(0);
});

test('ERP Hub: prévia sem credencial, suspensão e revogação', async ({ page }) => {
  const cfg = { id: INT, contract_id: C1, version: 2, status: 'configured', connection_state: 'not_tested', settings: { tenant_id: 't', environment: 'sandbox', company_id: 'c', account_id: 'a', currency: 'BRL', service: 'Tarifas Atlas', charging_unit: 'per_month' } };
  const calls = await setup(page, { integrations: [cfg] });
  await page.goto('/finance/settings.html#integracoes');
  const hub = page.locator('#erp-hub');
  await expect(hub.locator('[data-integration="configured"]')).toContainText('Configurada · conexão não testada');
  await hub.getByRole('button', { name: 'Prévia do ERP' }).click();
  const prev = page.getByRole('dialog', { name: 'Prévia do Business Central' });
  await prev.getByLabel(/^Início/).fill('2026-09-01');
  await prev.getByLabel(/^Fim/).fill('2026-09-30');
  await prev.getByRole('button', { name: 'Ler o Business Central' }).click();
  await expect(prev.getByRole('alert')).toContainText('não está habilitada no servidor deste ambiente');
  await prev.getByRole('button', { name: 'Fechar painel' }).click();
  await hub.getByRole('button', { name: 'Suspender' }).click();
  await page.getByRole('dialog', { name: 'Suspender integração?' }).getByRole('button', { name: 'Suspender' }).click();
  await expect(page.getByText('Integração suspensa.')).toBeVisible();
  expect(calls.filter((c) => c.path === 'erp-fees/configure').at(-1).body).toMatchObject({ integration_id: INT, expected_version: 2, status: 'suspended' });
});

test('ERP Hub: prévia real (simulada) separa revisão de importação e confirma só válidos', async ({ page }) => {
  const cfg = { id: INT, contract_id: C1, version: 1, status: 'configured', settings: { environment: 'sandbox', currency: 'BRL', service: 'Tarifas Atlas', charging_unit: 'per_month' } };
  const calls = await setup(page, { integrations: [cfg], erpPreview: { status: 200, body: { ok: true, preview: { fingerprint: 'erp-fp', coverage: { complete: true }, stats: { valid: 1, pending_review: 1 },
    rows: [{ line: 1, state: 'valid', values: { period_start: '2026-09-10', currency: 'BRL', observed_amount: '45.00' } }, { line: 2, state: 'pending_review', values: { period_start: '2026-09-12', currency: 'BRL', observed_amount: '-45.00' } }] } } } });
  await page.goto('/finance/settings.html#integracoes');
  await page.locator('#erp-hub').getByRole('button', { name: 'Prévia do ERP' }).click();
  const prev = page.getByRole('dialog', { name: 'Prévia do Business Central' });
  await prev.getByLabel(/^Início/).fill('2026-09-01');
  await prev.getByLabel(/^Fim/).fill('2026-09-30');
  await prev.getByRole('button', { name: 'Ler o Business Central' }).click();
  await expect(prev).toContainText('requer revisão; não será importado automaticamente');
  await prev.getByRole('button', { name: 'Confirmar 1 lançamento válido' }).click();
  await page.getByRole('dialog', { name: 'Gravar lançamentos selecionados?' }).getByRole('button', { name: 'Gravar' }).click();
  await expect(prev).toContainText('1 lançamento importado');
  expect(calls.find((c) => c.path === 'erp-fees/confirm').body).toMatchObject({ integration_id: INT, selected_lines: [1], preview_fingerprint: 'erp-fp', confirmation: true });
});

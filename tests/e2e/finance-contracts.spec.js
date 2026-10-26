import { test, expect } from '@playwright/test';

// Contract & Renewal Center v2 na interface publicada. A sessão é simulada
// por `page.route`; imutabilidade, versões, escopo e marcos idempotentes são
// provados em tests/database/financial-contracts-v2.sql.

const ORG = '00000000-0000-4000-8000-0000000000a1';
const CONTRACT = '00000000-0000-4000-8000-0000000000d1';
const PROVIDER = '00000000-0000-4000-8000-0000000000e1';
const NEW_PROVIDER = '00000000-0000-4000-8000-0000000000e2';
const CONTRACT_ROW = { id: CONTRACT, organization_id: ORG, provider_id: PROVIDER, provider_name: 'Banco Carteira', product: 'credit', origin: 'imported', title: 'Capital de giro carteira',
  status: 'active', starts_on: '2026-01-01', ends_on: '2027-12-31', renewal_notice_days: 90, review_from: '2027-10-02', days_to_end: 450, current_version: 2, currency: 'BRL', legal_entity_id: null };
const DETAIL = {
  ok: true, contract: CONTRACT_ROW,
  effective: { version: 2, effective_from: '2026-06-01', source: 'correction', terms: { contract_number: 'CCB-123', principal_amount: 5100000, indexer: 'cdi', spread_pct_year: 2.1, fees: [{ service: 'TAC', unit: 'one_off', amount: 5000 }] } },
  versions: [
    { version: 2, effective_from: '2026-06-01', source: 'correction', reason: 'Valor digitado errado', recorded_at: '2026-06-02T10:00:00Z', terms: {}, changes: [{ key: 'principal_amount', label: 'Valor principal contratado', change: 'changed', before: 5000000, after: 5100000 }] },
    { version: 1, effective_from: '2026-01-01', source: 'import', recorded_at: '2026-01-02T10:00:00Z', terms: {}, changes: [] }
  ],
  amendments: [], milestones: [{ id: 'm1', kind: 'obligation', title: 'Enviar demonstrações', due_on: '2026-12-01', lead_days: 15, recurrence: 'quarterly', status: 'scheduled' }],
  renewal_milestones: [], children: []
};

async function mockSession(page, { providers = [{ id: PROVIDER, name: 'Banco Carteira', status: 'active' }], contracts = [CONTRACT_ROW], importReply = null, tasks = [], detail = DETAIL } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    calls.push({ method: request.method(), path, body });
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], tasks: tasks.filter((task) => task.status === 'open'), rfqs: [],
      providers, contracts });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'finance_manager', display_name: 'Paula Nogueira', title: 'Tesouraria' }], viewer_id: 'u1' });
    if (path === 'contract-detail') return json(detail);
    if (path === 'tasks' && request.method() === 'GET') return json({ ok: true, rows: tasks });
    if (path === 'contract-import') return importReply ? json(importReply.body, importReply.status) : json({ ok: true, id: '00000000-0000-4000-8000-0000000000d9' }, 201);
    if (path === 'providers' && request.method() === 'POST') return json({ ok: true, row: { id: NEW_PROVIDER, name: body.name } }, 201);
    if (path === 'contract-amendments') return json({ ok: true, id: 'a1' }, 201);
    if (path === 'contract-milestones') return json({ ok: true, id: 'm2', status: 'scheduled' }, request.method() === 'POST' ? 201 : 200);
    if (path === 'contract-terms') return json({ ok: true, version: 3 }, 201);
    if (['approvals', 'notifications', 'events', 'tasks'].includes(path) || path.startsWith('private-documents')) return json({ ok: true, rows: [] });
    if (path === 'signals') return json({ ok: true });
    return json({ ok: false }, 404);
  });
  return calls;
}

async function noHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
}

test('contrato da carteira: termos vigentes, histórico com diff e marco recorrente', async ({ page }) => {
  await mockSession(page);
  await page.goto('/finance/contracts.html');
  await expect(page.getByText('Carteira existente')).toBeVisible();
  await expect(page.getByText('Termos v2')).toBeVisible();
  await page.getByRole('button', { name: /Abrir contrato/ }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByRole('heading', { name: 'Termos vigentes (v2)' })).toBeVisible();
  await expect(panel.getByText('CCB-123')).toBeVisible();
  await expect(panel.getByText(/TAC:/)).toBeVisible();
  await panel.getByText('Histórico de versões (2)').click();
  await expect(panel.getByText('Justificativa: Valor digitado errado')).toBeVisible();
  // Valores do histórico com moeda formatada, nunca o número cru.
  await expect(panel.getByText(/Valor principal contratado: alterado — R\$\s5\.000\.000 → R\$\s5\.100\.000/)).toBeVisible();
  await expect(panel.getByText('Enviar demonstrações')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Concluir ocorrência' })).toBeVisible();
  await noHorizontalOverflow(page);
});

test('registrar contrato existente envia só termos do catálogo', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar contrato existente' }).click();
  const form = page.locator('#contract-import-form');
  await form.getByLabel('Categoria').selectOption('cash_management');
  await form.getByLabel(/^Título/).fill('Pacote de serviços bancários');
  await form.getByLabel(/^Início/).fill('2026-01-01');
  await form.getByLabel(/^Fim/).fill('2027-12-31');
  await form.getByLabel(/^Aviso prévio/).fill('60');
  await form.getByText('Termos estruturados').click();
  await form.getByRole('button', { name: 'Adicionar tarifa' }).click();
  await form.getByLabel('Serviço da tarifa').fill('PIX enviado');
  await form.getByLabel('Valor contratado').fill('0.5');
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await expect(page.locator('#contract-import-review')).toContainText('Carteira existente, declarada pela empresa');
  await page.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
  await expect.poll(() => calls.find((call) => call.path === 'contract-import')?.body).toMatchObject({
    organization_id: ORG, product: 'cash_management', provider_id: PROVIDER, title: 'Pacote de serviços bancários', starts_on: '2026-01-01', ends_on: '2027-12-31',
    terms: { fees: [{ service: 'PIX enviado', unit: 'per_transaction', amount: 0.5 }] }
  });
});

test('aditivo preserva datas e gera versão quando altera termos', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: /Abrir contrato/ }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Registrar aditivo' }).click();
  await panel.getByLabel(/Vigência a partir de/).fill('2026-10-01');
  await panel.getByLabel(/Novo fim do contrato/).fill('2028-12-31');
  await panel.getByLabel('O aditivo altera termos estruturados (gera nova versão)').check();
  await panel.getByLabel('Spread (% a.a.)').fill('1.9');
  await panel.getByRole('button', { name: 'Registrar aditivo' }).click();
  await page.getByRole('dialog').last().getByRole('button', { name: 'Registrar', exact: true }).click();
  await expect.poll(() => calls.find((call) => call.path === 'contract-amendments')?.body).toMatchObject({
    contract_id: CONTRACT, effective_from: '2026-10-01', new_ends_on: '2028-12-31', expected_version: 2, terms: { spread_pct_year: 1.9, contract_number: 'CCB-123' }
  });
});

test('correção de termos exige justificativa', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: /Abrir contrato/ }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Corrigir termos (nova versão)' }).click();
  await panel.getByRole('button', { name: 'Gravar nova versão' }).click();
  await expect(page.getByText('Explique a correção.')).toBeVisible();
  expect(calls.some((call) => call.path === 'contract-terms')).toBe(false);
  await panel.getByLabel(/Justificativa da correção/).fill('Indexador corrigido');
  await panel.getByRole('button', { name: 'Gravar nova versão' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'contract-terms')?.body).toMatchObject({ contract_id: CONTRACT, expected_version: 2, reason: 'Indexador corrigido' });
  await noHorizontalOverflow(page);
});


test('termos: valores confirmados em documentos preenchem só campos vazios, com origem, e nada é gravado sozinho', async ({ page }) => {
  const calls = await mockSession(page);
  const source = { document_title: 'Contrato assinado DEMO', page: 3, confirmed_at: '2026-10-01T12:00:00Z' };
  await page.route('**/api/finance/contract-fact-suggestions**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true,
    suggestions: [{ key: 'limit_amount', label: 'Limite contratado', value: 6000000, source }, { key: 'spread_pct_year', label: 'Spread (% a.a.)', value: 2.4, source },
      { key: 'guarantees', label: 'Garantias', value: 'Cessão fiduciária de recebíveis', source }],
    conflicts: [{ key: 'rate_pct_year', label: 'Taxa (% a.a.)', values: [{ value: 14.1 }, { value: 14.4 }] }], skipped: 1 }) }));
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: /Abrir contrato/ }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Corrigir termos (nova versão)' }).click();
  const facts = panel.getByRole('region', { name: 'Valores confirmados em documentos' });
  await expect(facts).toContainText('3 valores confirmados');
  await expect(facts).toContainText('Taxa (% a.a.): valores diferentes (14,1 × 14,4)');
  await facts.getByRole('button', { name: 'Preencher campos vazios' }).click();
  await expect(facts.getByRole('status')).toContainText('2 campos preenchidos com a origem indicada. 1 mantido(s) como você digitou. Revise antes de gravar.');
  await expect(panel.getByLabel('Limite contratado')).toHaveValue('6000000');
  await expect(panel.getByLabel('Spread (% a.a.)')).toHaveValue('2.1');
  await expect(panel.getByText(/Do documento "Contrato assinado DEMO", pág\. 3, confirmado em/).first()).toBeVisible();
  expect(calls.some((call) => call.path === 'contract-terms')).toBe(false);
  await panel.getByLabel(/Justificativa da correção/).fill('Termos do contrato assinado');
  await panel.getByRole('button', { name: 'Gravar nova versão' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'contract-terms')?.body?.terms).toMatchObject({ limit_amount: 6000000, spread_pct_year: 2.1, guarantees: 'Cessão fiduciária de recebíveis' });
  await noHorizontalOverflow(page);
});

test('termos: valor confirmado em outra unidade é declarado, não convertido nem descartado em silêncio', async ({ page }) => {
  const calls = await mockSession(page);
  const source = { document_title: 'Proposta Banco Um', page: 5, confirmed_at: '2026-10-01T12:00:00Z' };
  await page.route('**/api/finance/contract-fact-suggestions**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true,
    suggestions: [], conflicts: [], skipped: 0,
    unusable: [{ key: 'spread_pct_year', label: 'Spread (% a.a.)', reason: 'unit_mismatch', unit: 'percent_per_month', source },
      { key: 'limit_amount', label: 'Limite contratado', reason: 'invalid_value', unit: null, source }] }) }));
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: /Abrir contrato/ }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Corrigir termos (nova versão)' }).click();
  const facts = panel.getByRole('region', { name: 'Valores confirmados em documentos' });
  await expect(facts).toContainText('não preenchem os termos sozinhos');
  await expect(facts).toContainText('Spread (% a.a.): o documento traz o valor em % ao mês, e o Arandu não converte (do documento "Proposta Banco Um", pág. 5, confirmado em');
  await expect(facts).toContainText('Limite contratado: o valor confirmado não cabe neste campo');
  await expect(facts.getByRole('button', { name: 'Preencher campos vazios' })).toHaveCount(0);
  await expect(facts).not.toContainText('percent_per_month');
  await expect(panel.getByLabel('Spread (% a.a.)')).toHaveValue('2.1');
  expect(calls.some((call) => call.path === 'contract-terms')).toBe(false);
  await noHorizontalOverflow(page);
});

test('termos: sem valores confirmados, nenhum aviso aparece', async ({ page }) => {
  await mockSession(page);
  await page.route('**/api/finance/contract-fact-suggestions**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, suggestions: [], conflicts: [], skipped: 0 }) }));
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: /Abrir contrato/ }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Corrigir termos (nova versão)' }).click();
  await expect(panel.getByRole('button', { name: 'Gravar nova versão' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Valores confirmados em documentos' })).toHaveCount(0);
});

test('contrato abre termos e histórico pelo link contextual', async ({ page }) => {
  await mockSession(page);
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${CONTRACT}`);
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Termos vigentes (v2)' })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.keyboard.press('Escape');
  await expect(page).not.toHaveURL(/#contract-/);
});

test('contrato fora do recorte consulta API, mas não abre outra organização', async ({ page }) => {
  await mockSession(page);
  await page.route('**/api/finance/contract-detail**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...DETAIL, contract: { ...CONTRACT_ROW, organization_id: '00000000-0000-4000-8000-000000000099' } }) }));
  await page.goto('/finance/contracts.html?abrir=contrato#contract-00000000-0000-4000-8000-000000000088');
  await expect(page.getByText('Contrato indisponível neste contexto.')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});


test('contrato fora do overview usa o detalhe autorizado para continuar a jornada', async ({ page }) => {
  await mockSession(page);
  await page.route('**/api/finance/overview**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, providers: [], contracts: [], rfqs: [], tasks: [], profile: [] }) }));
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${CONTRACT}`);
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Termos vigentes (v2)' })).toBeVisible();
  await noHorizontalOverflow(page);
});

test('termos: Gravar duas vezes enquanto a primeira gravação não volta cria uma versão só', async ({ page }) => {
  await mockSession(page);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const posts = [];
  await page.route('**/api/finance/contract-terms', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts.push(route.request().postDataJSON());
    await gate;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, version: 2 }) });
  });
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: /Abrir contrato/ }).click();
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Corrigir termos (nova versão)' }).click();
  await panel.getByLabel(/Justificativa da correção/).fill('Termos do contrato assinado');
  const save = panel.getByRole('button', { name: 'Gravar nova versão' });
  await save.click();
  await expect(save).toHaveAttribute('aria-busy', 'true');
  await panel.getByLabel(/Justificativa da correção/).press('Enter');
  await save.click({ force: true });
  release();
  await expect.poll(() => posts.length).toBe(1);
  await page.waitForTimeout(300);
  expect(posts).toHaveLength(1);
});

for (const [days, text] of [[0, 'vence hoje'], [1, 'vence amanhã'], [12, 'vence em 12 dias']]) {
  test(`cartão do contrato: ${days} dia(s) para o fim aparece como "${text}"`, async ({ page }) => {
    // A contagem vem do vencimento no calendário de quem lê (a mesma do Painel);
    // o days_to_end da API chega com um dia a menos de propósito e é ignorado.
    const local = new Date(); local.setDate(local.getDate() + days);
    const endsOn = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
    await mockSession(page, { contracts: [{ ...CONTRACT_ROW, starts_on: '2026-01-01', ends_on: endsOn, days_to_end: days - 1 }] });
    await page.goto('/finance/contracts.html');
    await expect(page.locator(`#contract-${CONTRACT} .contract-days`)).toHaveText(text);
  });
}

const isoDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

test('primeiro contrato: instituição cadastrada no próprio registro e próxima ação visível', async ({ page }) => {
  const calls = await mockSession(page, { providers: [], contracts: [], importReply: { status: 201, body: { ok: true, id: '00000000-0000-4000-8000-0000000000d9', status: 'active', next_task: { id: 't1', title: 'Revisar renovação do contrato antes do aviso prévio', due_on: isoDay(305) } } } });
  await page.goto('/finance/contracts.html');
  await expect(page.getByText('Nenhum contrato registrado ainda')).toBeVisible();
  await page.getByRole('button', { name: 'Registrar o primeiro contrato' }).click();
  const form = page.locator('#contract-import-form');
  // Sem instituição cadastrada: o registro não termina em beco sem saída.
  await form.getByLabel(/^Instituição financeira/).selectOption({ label: '+ Cadastrar nova instituição' });
  await form.getByLabel(/^Nome da instituição/).fill('Banco Horizonte');
  await form.getByLabel(/^Título/).fill('Capital de giro 2026');
  await form.getByLabel(/^Início/).fill(isoDay(-60));
  await form.getByLabel(/^Fim/).fill(isoDay(365));
  await form.getByLabel(/^Aviso prévio/).fill('60');
  await expect(page.locator('#contract-import-preview')).toContainText(/Próxima ação: tarefa “Revisar renovação” para \d{1,2} de .+ de \d{4}, 60 dias antes do fim\./);
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
  await expect.poll(() => calls.find((call) => call.path === 'contract-import')?.body).toMatchObject({ provider_id: NEW_PROVIDER, title: 'Capital de giro 2026', renewal_notice_days: 60, parent_contract_id: null });
  expect(calls.find((call) => call.path === 'providers' && call.method === 'POST')?.body).toMatchObject({ organization_id: ORG, name: 'Banco Horizonte', kind: 'bank' });
  await expect(page.getByText(/Contrato registrado\. Próxima ação: revisar a renovação até \d{1,2} de .+ \(em Tarefas\)\./)).toBeVisible();
});

test('registro de contrato aponta o campo com problema e não envia dado inválido', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar contrato existente' }).click();
  const form = page.locator('#contract-import-form');
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await expect(form.getByText('Dê um título com pelo menos 2 caracteres.')).toBeVisible();
  await expect(form.getByText('Informe a data de início.')).toBeVisible();
  await expect(form.getByLabel(/^Título/)).toBeFocused();
  await form.getByLabel(/^Título/).fill('Fiança bancária');
  await form.getByLabel(/^Início/).fill('2026-05-01');
  await form.getByLabel(/^Fim/).fill('2026-04-01');
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await expect(form.getByText('O fim não pode anteceder o início.')).toBeVisible();
  await form.getByLabel(/^Fim/).fill('2027-04-01');
  await form.getByLabel(/^Aviso prévio/).fill('12.5');
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await expect(form.getByText('Use um número inteiro de 0 a 3650 dias.')).toBeVisible();
  expect(calls.some((call) => call.path === 'contract-import')).toBe(false);
});

test('contrato já registrado: recusa explicada no título e contrato principal só da mesma instituição', async ({ page }) => {
  const calls = await mockSession(page, { importReply: { status: 409, body: { ok: false, error: 'Este contrato já está na carteira: mesma instituição, categoria, título e período. Abra o contrato existente em vez de registrá-lo de novo.', code: 'contract_duplicate' } } });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar contrato existente' }).click();
  const form = page.locator('#contract-import-form');
  // O único contrato da mesma instituição aparece como principal possível.
  await expect(form.getByLabel(/^Contrato principal/)).toContainText('Capital de giro carteira');
  await form.getByLabel(/^Contrato principal/).selectOption(CONTRACT);
  await form.getByLabel(/^Título/).fill('Capital de giro carteira');
  await form.getByLabel(/^Início/).fill('2026-01-01');
  await form.getByLabel(/^Fim/).fill('2027-12-31');
  await form.getByLabel(/^Aviso prévio/).fill('60');
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
  await expect(form.getByText(/já está na carteira/)).toBeVisible();
  await expect(form.getByRole('button', { name: 'Abrir o contrato já registrado' })).toBeVisible();
  expect(calls.find((call) => call.path === 'contract-import')?.body.parent_contract_id).toBe(CONTRACT);
  await expect(page.getByRole('button', { name: 'Confirmar registro', exact: true })).toBeEnabled();
  await noHorizontalOverflow(page);
});

test('histórico de versões: indexador e percentuais por extenso, ausência explícita', async ({ page }) => {
  const detail = structuredClone(DETAIL);
  detail.versions[0].changes = [
    { key: 'indexer', label: 'Indexador', change: 'changed', before: 'pre', after: 'cdi' },
    { key: 'spread_pct_year', label: 'Spread (% a.a.)', change: 'added', before: null, after: 2.1 },
    { key: 'fees', label: 'Tarifas contratadas', change: 'changed', before: [{ service: 'TAC' }], after: [{ service: 'TAC' }, { service: 'TED' }] }
  ];
  await mockSession(page, { detail });
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: /Abrir contrato/ }).click();
  const panel = page.getByRole('dialog');
  await panel.getByText('Histórico de versões (2)').click();
  await expect(panel.getByText('Indexador: alterado — Pré-fixado → CDI')).toBeVisible();
  await expect(panel.getByText('Spread (% a.a.): incluído — não informado → 2,1%')).toBeVisible();
  await expect(panel.getByText('Tarifas contratadas: alterado — 1 tarifa → 2 tarifas')).toBeVisible();
  await expect(panel.locator('.diff-list')).not.toContainText(/\bcdi\b|\bpre\b|null|undefined/);
});

test('registrar contrato existente: clique fora, Esc ou Cancelar com dados preenchidos pedem confirmação', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar contrato existente' }).click();
  const form = page.locator('#contract-import-form');
  // Sem nada digitado, fechar não pergunta.
  await page.getByRole('button', { name: 'Fechar painel' }).click();
  await expect(form).toHaveCount(0);
  await page.getByRole('button', { name: 'Registrar contrato existente' }).click();
  await form.getByLabel(/^Título/).fill('Conta garantida 2026');
  // Clique no fundo (fora do painel) não descarta o que foi digitado.
  await page.mouse.click(5, 5);
  const ask = page.getByRole('dialog', { name: 'Descartar o registro do contrato?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Cancelar' }).click();
  await expect(form.getByLabel(/^Título/)).toHaveValue('Conta garantida 2026');
  await form.getByLabel(/^Título/).press('Escape');
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Cancelar' }).click();
  await expect(form.getByLabel(/^Título/)).toHaveValue('Conta garantida 2026');
  await page.locator('.drawer-foot').getByRole('button', { name: 'Cancelar' }).click();
  await ask.getByRole('button', { name: 'Descartar' }).click();
  await expect(form).toHaveCount(0);
  expect(calls.some((call) => call.path === 'contract-import')).toBe(false);
});

test('responsável do contrato e tarefa de contrato com contexto: qual contrato e quando vence de fato', async ({ page }) => {
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const contract = { ...CONTRACT_ROW, owner_id: 'u1', ends_on: day(80), review_from: day(-10), renewal_notice_days: 90 };
  const tasks = [
    { id: 't1', title: 'Obrigação: Dívida líquida / EBITDA', due_on: day(-3), status: 'open', related_type: 'contract', related_id: CONTRACT },
    { id: 't2', title: 'Revisar renovação do contrato antes do aviso prévio', due_on: day(-10), status: 'done', related_type: 'contract', related_id: CONTRACT }
  ];
  await mockSession(page, { contracts: [contract], tasks });
  await page.goto('/finance/contracts.html');
  const card = page.locator('.contract-card');
  await expect(card.locator('.deflist-row', { hasText: 'Responsável' })).toContainText('Paula Nogueira');

  await page.goto('/finance/tasks.html');
  const open = page.locator('#task-t1');
  await expect(open.getByRole('link', { name: 'Banco Carteira · Capital de giro carteira' })).toBeVisible();
  await expect(open).toContainText(/Contrato vence em .* · aviso prévio até/);
  await expect(open.locator('.task-meta')).not.toContainText(/^\s*·/);
  // Concluir a revisão não apaga o prazo real do contrato.
  await page.getByLabel('Mostrar tarefas').selectOption('concluidas');
  await expect(page.locator('#task-t2')).toContainText('Contrato vence em');

  await page.goto('/finance/dashboard.html');
  const item = page.locator('.action-row', { hasText: 'Obrigação: Dívida líquida / EBITDA' });
  await expect(item).toContainText('Banco Carteira · Crédito · Vencida');
  await noHorizontalOverflow(page);
});

test('contrato leva à implantação e às obrigações DESTE contrato, com o filtro contract_id aplicado no servidor (#211)', async ({ page }) => {
  await mockSession(page);
  const requested = [];
  await page.route('**/api/finance/implementations?**', (route) => {
    requested.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cards: [], columns: [], rows: [], empty: { title: 'Nenhum plano' }, options: {}, forms: [] }) });
  });
  await page.goto('/finance/contracts.html');
  const links = page.getByRole('navigation', { name: 'Pós-contratação do contrato com Banco Carteira' });
  await expect(links.getByRole('link', { name: 'Covenants e obrigações deste contrato' })).toHaveAttribute('href', `/finance/covenants.html?contract_id=${CONTRACT}&contrato=${CONTRACT}`);
  await links.getByRole('link', { name: 'Implantação deste contrato' }).click();
  await page.waitForURL(/\/finance\/implementations\.html\?contract_id=/);
  await expect.poll(() => requested.at(-1)?.get('contract_id')).toBe(CONTRACT);
  await noHorizontalOverflow(page);
});

test('contrato encerrado não oferece atalhos de pós-contratação', async ({ page }) => {
  await mockSession(page, { contracts: [{ ...CONTRACT_ROW, status: 'expired' }] });
  await page.goto('/finance/contracts.html');
  await expect(page.locator('.contract-card')).toBeVisible();
  await expect(page.locator('.contract-lifecycle-links')).toHaveCount(0);
});

// ------------------------------------------------- responsabilidade de tarefas (#204)
const U = { paula: 'u1', rui: '00000000-0000-4000-8000-0000000000f2', ana: '00000000-0000-4000-8000-0000000000f3' };
const MEMBERS = [
  { user_id: U.paula, role: 'finance_manager', display_name: 'Paula Nogueira' },
  { user_id: U.rui, role: 'analyst', display_name: 'Rui Tavares' },
  { user_id: U.ana, role: 'viewer', display_name: 'Ana Lima' },
  { user_id: '00000000-0000-4000-8000-0000000000f9', role: 'provider_user', display_name: 'Banco Externo' }
];
/** Servidor de tarefas fiel ao contrato: idempotência por chave+payload, 403 a quem não gerencia, lista persistida. */
async function taskServer(page, { viewerRole = 'finance_manager', viewer = U.paula, initial = [], failNextPost = 0, ignoreStatusPatch = false } = {}) {
  // ignoreStatusPatch: o PATCH responde 200 sem gravar, como o banco faz com linha fora do alcance de quem pede (RLS).
  const state = { tasks: initial.map((t) => ({ ...t })), posts: [], patches: [], gets: [], keys: new Map(), failNextPost, holdPost: null, holdGet: null, ignoreStatusPatch };
  await page.route('**/api/finance/members**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: MEMBERS.map((m) => (m.user_id === viewer ? { ...m, role: viewerRole } : m)), viewer_id: viewer }) }));
  await page.route('**/api/finance/tasks**', async (route) => {
    const request = route.request();
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    const named = (t) => ({ ...t, assignee_name: t.assignee_id ? MEMBERS.find((m) => m.user_id === t.assignee_id)?.display_name || null : null });
    if (request.method() === 'GET') {
      // Contrato da #206: status/assignee_id/unassigned/limit/cursor, ordem estável, sem total global.
      state.gets.push(Object.fromEntries(new URL(request.url()).searchParams));
      if (state.holdGet) await state.holdGet;
      const q = new URL(request.url()).searchParams;
      let rows = state.tasks.filter((t) => (!q.get('status') || t.status === q.get('status'))
        && (!q.get('assignee_id') || t.assignee_id === q.get('assignee_id')) && (q.get('unassigned') !== 'true' || !t.assignee_id));
      rows = rows.sort((a, b) => String(a.due_on || '9999').localeCompare(String(b.due_on || '9999')) || a.id.localeCompare(b.id));
      let start = 0;
      if (q.has('cursor')) {
        const at = rows.findIndex((t) => Buffer.from(t.id).toString('base64url') === q.get('cursor'));
        if (at < 0) return json({ ok: false, code: 'invalid_task_cursor', error: 'Cursor de tarefas inválido.' }, 400);
        start = at + 1;
      }
      const limit = Number(q.get('limit') || 200);
      const page = rows.slice(start, start + limit);
      const hasMore = rows.length > start + limit;
      return json({ ok: true, rows: page.map(named), page: { limit, has_more: hasMore, next_cursor: hasMore ? Buffer.from(page.at(-1).id).toString('base64url') : null } });
    }
    const body = request.postDataJSON();
    const manager = ['admin', 'finance_manager'].includes(viewerRole);
    if (request.method() === 'POST') {
      state.posts.push(body);
      if (state.holdPost) await state.holdPost;
      if (Object.hasOwn(body, 'assignee_id') && !manager) return json({ ok: false, code: 'task_assignment_forbidden', error: 'Sua conta não tem permissão para atribuir esta tarefa.' }, 403);
      const { idempotency_key: key, ...input } = body;
      const hash = JSON.stringify(input);
      if (key && state.keys.has(key)) {
        const prior = state.keys.get(key);
        if (prior.hash !== hash) return json({ ok: false, code: 'idempotency_key_reused', error: 'Esta chave de criação já foi usada com outros dados. Gere uma nova chave.' }, 409);
        return json({ ok: true, row: named(prior.task) });
      }
      // 409 sem ter gravado (unknownDropsWrite): o navegador não pode distinguir dos dois casos.
      if (state.unknownNextPost > 0 && state.unknownDropsWrite) { state.unknownNextPost -= 1; return json({ ok: false, code: 'task_creation_unknown', error: 'Não foi possível confirmar a criação da tarefa. Recarregue a lista antes de tentar novamente.' }, 409); }
      const task = { id: `00000000-0000-4000-8000-${String(state.tasks.length + 100).padStart(12, '0')}`, title: body.title, due_on: body.due_on, status: 'open', related_type: null, related_id: null, assignee_id: body.assignee_id ?? null };
      state.tasks.push(task);
      if (key) state.keys.set(key, { hash, task });
      // Falha de rede DEPOIS de gravar: o resultado é desconhecido para o navegador.
      if (state.failNextPost > 0) { state.failNextPost -= 1; return route.abort('failed'); }
      // Gravou, mas o servidor não confirma a linha: contrato 409 task_creation_unknown.
      if (state.unknownNextPost > 0) { state.unknownNextPost -= 1; return json({ ok: false, code: 'task_creation_unknown', error: 'Não foi possível confirmar a criação da tarefa. Recarregue a lista antes de tentar novamente.' }, 409); }
      return json({ ok: true, row: named(task) }, 201);
    }
    if (request.method() === 'PATCH') {
      state.patches.push(body);
      const task = state.tasks.find((t) => t.id === body.task_id);
      if (Object.hasOwn(body, 'assignee_id') && !manager) return json({ ok: false, code: 'task_assignment_forbidden', error: 'Sua conta não tem permissão para atribuir esta tarefa.' }, 403);
      // Contrato atual (#206): linha não alterada (RLS, ausente) → 404, nunca 200.
      if (!task || (Object.hasOwn(body, 'status') && state.ignoreStatusPatch)) return json({ ok: false, code: 'not_found', error: 'Tarefa não encontrada ou sem acesso para esta conta.' }, 404);
      if (Object.hasOwn(body, 'status')) task.status = body.status;
      if (Object.hasOwn(body, 'assignee_id')) task.assignee_id = body.assignee_id;
      return json({ ok: true });
    }
    return json({ ok: false }, 405);
  });
  return state;
}
const OPEN_TASK = { id: '00000000-0000-4000-8000-0000000000a9', title: 'Conferir tarifas do Banco Carteira', due_on: '2027-01-10', status: 'open', related_type: 'contract', related_id: CONTRACT, assignee_id: null };

test('tarefas: gestor cria com responsável; a chave de criação é estável no retry e não duplica', async ({ page }) => {
  await mockSession(page);
  const server = await taskServer(page, { failNextPost: 1 });
  await page.goto('/finance/tasks.html');
  const form = page.locator('#task-new');
  // Leitor e provedor nunca são candidatos (o banco recusaria); o valor é o id do membro, não o nome.
  await expect(form.getByLabel(/^Responsável/).locator('option')).toHaveText(['Sem responsável', 'Paula Nogueira (você)', 'Rui Tavares']);
  await form.getByLabel(/^Nova tarefa/).fill('Enviar demonstrações ao Banco Carteira');
  await form.getByLabel(/^Responsável/).selectOption({ label: 'Rui Tavares' });
  await form.getByRole('button', { name: 'Adicionar' }).click();
  // Rede caiu depois de gravar: aviso honesto, dados preservados, nada de "Tarefa criada".
  await expect(form.getByRole('status')).toContainText('Não confirmamos');
  await expect(form.getByLabel(/^Nova tarefa/)).toHaveValue('Enviar demonstrações ao Banco Carteira');
  await form.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByText('Tarefa criada.')).toBeVisible();
  expect(server.posts).toHaveLength(2);
  expect(server.posts[0].idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
  expect(server.posts[1].idempotency_key).toBe(server.posts[0].idempotency_key);
  expect(server.posts[1]).toMatchObject({ title: 'Enviar demonstrações ao Banco Carteira', assignee_id: U.rui });
  expect(server.tasks).toHaveLength(1);
  const row = page.locator('.task-item', { hasText: 'Enviar demonstrações' });
  await expect(row.getByLabel(/^Responsável: Enviar/)).toHaveValue(U.rui);
  await expect(form.getByRole('status')).toBeHidden();
  // Intenção confirmada encerra a chave: a próxima tarefa usa outra.
  await form.getByLabel(/^Nova tarefa/).fill('Segunda tarefa');
  await form.getByRole('button', { name: 'Adicionar' }).click();
  await expect.poll(() => server.posts.length).toBe(3);
  expect(server.posts[2].idempotency_key).not.toBe(server.posts[0].idempotency_key);
  expect(server.posts[2]).not.toHaveProperty('assignee_id');
});

test('tarefas: 409 task_creation_unknown não vira sucesso, relê a lista e repete com a mesma chave sem duplicar', async ({ page }) => {
  await mockSession(page);
  const server = await taskServer(page);
  server.unknownNextPost = 1;
  await page.goto('/finance/tasks.html');
  const form = page.locator('#task-new');
  await form.getByLabel(/^Nova tarefa/).fill('Pedir extrato de encargos ao Banco Carteira');
  const gets = server.gets.length;
  await form.getByRole('button', { name: 'Adicionar' }).click();
  await expect(form.getByRole('status')).toContainText('o título sozinho não prova que é a sua');
  await expect(page.getByText('Tarefa criada.')).toHaveCount(0);
  expect(server.gets.length).toBeGreaterThan(gets);
  await expect(page.locator('.task-item', { hasText: 'Pedir extrato de encargos' })).toHaveCount(1);
  await expect(form.getByLabel(/^Nova tarefa/)).toHaveValue('Pedir extrato de encargos ao Banco Carteira');
  // Conferir com o servidor reaproveita a chave: o servidor devolve a linha existente.
  await form.getByRole('button', { name: 'Conferir com o servidor' }).click();
  await expect(page.getByText('Tarefa criada.')).toBeVisible();
  expect(server.posts).toHaveLength(2);
  expect(server.posts[1].idempotency_key).toBe(server.posts[0].idempotency_key);
  expect(server.tasks.filter((task) => task.title.startsWith('Pedir extrato'))).toHaveLength(1);
  await expect(page.locator('.task-item', { hasText: 'Pedir extrato de encargos' })).toHaveCount(1);
});

test('tarefas: 409 com tarefa homônima de outra pessoa não é tomado como confirmação; só a mesma chave confirma', async ({ page }) => {
  await mockSession(page);
  // Já existe "Pedir CND" de um colega. A tentativa da Paula falha sem gravar (409).
  const server = await taskServer(page, { initial: [{ id: '00000000-0000-4000-8000-0000000000b1', title: 'Pedir CND', due_on: '2027-02-01', status: 'open', related_type: null, related_id: null, assignee_id: U.rui }] });
  server.unknownNextPost = 1;
  server.unknownDropsWrite = true;
  await page.goto('/finance/tasks.html');
  const form = page.locator('#task-new');
  await form.getByLabel(/^Nova tarefa/).fill('Pedir CND');
  await form.getByRole('button', { name: 'Adicionar' }).click();
  const note = form.getByRole('status');
  await expect(note).toContainText('A lista mostra uma tarefa aberta com este título, mas o título sozinho não prova que é a sua');
  await expect(note).not.toContainText('já mostra');
  await expect(page.getByText('Tarefa criada.')).toHaveCount(0);
  expect(server.tasks.filter((task) => task.title === 'Pedir CND')).toHaveLength(1);
  // A conferência repete a mesma tentativa: o servidor grava uma única vez e confirma.
  await note.getByRole('button', { name: 'Conferir com o servidor' }).click();
  await expect(page.getByText('Tarefa criada.')).toBeVisible();
  expect(server.posts).toHaveLength(2);
  expect(server.posts[1].idempotency_key).toBe(server.posts[0].idempotency_key);
  expect(server.tasks.filter((task) => task.title === 'Pedir CND')).toHaveLength(2);
  await expect(note).toBeHidden();
  // Repetir de novo não cria terceira: a intenção foi encerrada e a lista mostra as duas.
  await expect(page.locator('.task-item', { hasText: 'Pedir CND' })).toHaveCount(2);
});

test('tarefas: duplo clique envia uma vez; dados alterados após resultado desconhecido pedem descarte explícito', async ({ page }) => {
  await mockSession(page);
  const server = await taskServer(page, { failNextPost: 1 });
  let release;
  server.holdPost = new Promise((resolve) => { release = resolve; });
  await page.goto('/finance/tasks.html');
  const form = page.locator('#task-new');
  await form.getByLabel(/^Nova tarefa/).fill('Pedir CND');
  await form.getByRole('button', { name: 'Adicionar' }).dblclick();
  await expect.poll(() => server.posts.length).toBe(1);
  release(); server.holdPost = null;
  await expect(form.getByRole('status')).toContainText('Não confirmamos');
  expect(server.posts).toHaveLength(1);
  await form.getByLabel(/^Nova tarefa/).fill('Pedir CND e certidão trabalhista');
  await form.getByRole('button', { name: 'Adicionar' }).click();
  const ask = page.getByRole('dialog', { name: 'Descartar a tentativa anterior?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'Descartar e criar nova' }).click();
  await expect.poll(() => server.posts.length).toBe(2);
  expect(server.posts[1].idempotency_key).not.toBe(server.posts[0].idempotency_key);
  // A tentativa anterior foi registrada e aparece na lista recarregada; nada se perde em silêncio.
  await expect(page.locator('.task-item', { hasText: 'Pedir CND' })).toHaveCount(2);
});

test('tarefas: reatribuir, deixar sem responsável e omitir o campo não mexe no responsável', async ({ page }) => {
  await mockSession(page);
  const server = await taskServer(page, { initial: [{ ...OPEN_TASK, assignee_id: U.rui }] });
  await page.goto(`/finance/tasks.html#task-${OPEN_TASK.id}`);
  const row = page.locator(`#task-${OPEN_TASK.id}`);
  await expect(row).toHaveClass(/highlighted/);
  const select = row.getByLabel(`Responsável: ${OPEN_TASK.title}`);
  await expect(select).toHaveValue(U.rui);
  await select.selectOption({ label: 'Paula Nogueira (você)' });
  await expect(page.getByText('Responsável atualizado.')).toBeVisible();
  expect(server.patches.at(-1)).toEqual({ organization_id: '00000000-0000-4000-8000-0000000000a1', task_id: OPEN_TASK.id, assignee_id: U.paula });
  await expect(row.getByLabel(`Responsável: ${OPEN_TASK.title}`)).toHaveValue(U.paula);
  await row.getByLabel(`Responsável: ${OPEN_TASK.title}`).selectOption('');
  await expect(page.getByText('Tarefa ficou sem responsável.')).toBeVisible();
  expect(server.patches.at(-1).assignee_id).toBeNull();
  // Concluir envia só o estado: o campo de responsável não vai e o servidor não o altera.
  server.tasks[0].assignee_id = U.rui;
  await page.reload();
  await page.locator(`#task-${OPEN_TASK.id}`).getByRole('checkbox').check();
  await expect.poll(() => server.patches.at(-1)).toEqual({ organization_id: '00000000-0000-4000-8000-0000000000a1', task_id: OPEN_TASK.id, status: 'done' });
  expect(server.tasks[0].assignee_id).toBe(U.rui);
  // Concluída: aparece em "Concluídas", com o responsável preservado e reabrível.
  await page.getByLabel('Mostrar tarefas').selectOption('concluidas');
  await expect(page).toHaveURL(/filtro=concluidas/);
  const done = page.locator(`#task-${OPEN_TASK.id}`);
  await expect(done).toContainText('Rui Tavares');
  await done.getByRole('checkbox').uncheck();
  await expect.poll(() => server.tasks[0].status).toBe('open');
});

test('tarefas: recusa do servidor ao reatribuir mantém o responsável persistido e explica', async ({ page }) => {
  await mockSession(page);
  // A interface acha que pode (papel desatualizado), o servidor decide e recusa.
  const server = await taskServer(page, { initial: [{ ...OPEN_TASK, assignee_id: U.rui }] });
  await page.route('**/api/finance/tasks', async (route) => route.request().method() === 'PATCH'
    ? route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'task_assignment_forbidden', error: 'Sua conta não tem permissão para atribuir esta tarefa.' }) })
    : route.fallback());
  await page.goto('/finance/tasks.html');
  const select = page.getByLabel(`Responsável: ${OPEN_TASK.title}`);
  await select.selectOption({ label: 'Paula Nogueira (você)' });
  await expect(page.getByText(/A alteração de responsável não foi permitida.*Nada mudou\./)).toBeVisible();
  await expect(select).toHaveValue(U.rui);
  await expect(select).toBeEnabled();
  expect(server.tasks[0].assignee_id).toBe(U.rui);
});

test('tarefas: analista cria sem responsável e vê quem responde, sem controle de atribuição', async ({ page }) => {
  await mockSession(page);
  const server = await taskServer(page, { viewerRole: 'analyst', viewer: U.rui, initial: [{ ...OPEN_TASK, assignee_id: U.paula }, { ...OPEN_TASK, id: '00000000-0000-4000-8000-0000000000b9', title: 'Tarefa sem dono', assignee_id: null }] });
  await page.goto('/finance/tasks.html');
  await expect(page.locator('#task-new').getByLabel(/^Responsável/)).toHaveCount(0);
  await expect(page.locator('#task-new')).toContainText('Gestores financeiros e administradores definem quem responde');
  await expect(page.locator('select.task-assignee')).toHaveCount(0);
  await expect(page.locator(`#task-${OPEN_TASK.id}`)).toContainText('Paula Nogueira');
  await expect(page.locator('#task-00000000-0000-4000-8000-0000000000b9')).toContainText('Sem responsável');
  await page.locator('#task-new').getByLabel(/^Nova tarefa/).fill('Revisar planilha de tarifas');
  await page.locator('#task-new').getByRole('button', { name: 'Adicionar' }).click();
  await expect.poll(() => server.posts.length).toBe(1);
  expect(server.posts[0]).not.toHaveProperty('assignee_id');
});

test('tarefas: filtros consultam o servidor, com contagem honesta do que foi carregado e reload preservado', async ({ page }) => {
  await mockSession(page);
  await taskServer(page, { initial: [
    { ...OPEN_TASK, id: '00000000-0000-4000-8000-0000000000c1', title: 'Minha tarefa', assignee_id: U.paula },
    { ...OPEN_TASK, id: '00000000-0000-4000-8000-0000000000c2', title: 'Tarefa do Rui', assignee_id: U.rui },
    { ...OPEN_TASK, id: '00000000-0000-4000-8000-0000000000c3', title: 'Tarefa órfã', assignee_id: null },
    { ...OPEN_TASK, id: '00000000-0000-4000-8000-0000000000c4', title: 'Removido', assignee_id: '00000000-0000-4000-8000-0000000000ee' }
  ] });
  await page.goto('/finance/tasks.html?filtro=minhas');
  await expect(page.getByLabel('Mostrar tarefas')).toHaveValue('minhas');
  await expect(page.locator('.task-item')).toHaveText([/Minha tarefa/]);
  await expect(page.locator('.task-toolbar [role=status]')).toHaveText('1 tarefa carregada · todas deste filtro');
  await page.getByLabel('Mostrar tarefas').selectOption('sem-responsavel');
  await expect(page.locator('.task-item')).toHaveText([/Tarefa órfã/]);
  await page.getByLabel('Mostrar tarefas').selectOption('abertas');
  // Membro que não está mais entre os carregados: sem inventar nome nem expor identificador.
  await expect(page.locator('#task-00000000-0000-4000-8000-0000000000c4').getByRole('combobox')).toContainText('Responsável indisponível');
  await expect(page.locator('#view')).not.toContainText('00000000-0000-4000-8000-0000000000ee');
  await noHorizontalOverflow(page);
});

test('painel: tarefa sem responsável não aparece como sua; a sua é marcada como sua', async ({ page }) => {
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  await mockSession(page, { tasks: [
    { id: 't-mine', title: 'Minha tarefa vencida', due_on: day(-1), status: 'open', assignee_id: 'u1', assignee_name: 'Paula Nogueira' },
    { id: 't-none', title: 'Tarefa sem dono vencida', due_on: day(-2), status: 'open', assignee_id: null, assignee_name: null },
    { id: 't-other', title: 'Tarefa do Rui vencida', due_on: day(-1), status: 'open', assignee_id: U.rui, assignee_name: 'Rui Tavares' }
  ] });
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('.action-row', { hasText: 'Minha tarefa vencida' })).toContainText('Com você · Vencida');
  await expect(page.locator('.action-row', { hasText: 'Tarefa sem dono vencida' })).toContainText('Sem responsável · Vencida');
  await expect(page.locator('.action-row', { hasText: 'Tarefa do Rui vencida' })).toHaveCount(0);
  await expect(page.locator('.mini-row', { hasText: 'Tarefa do Rui vencida' })).toContainText('Rui Tavares');
});

// ------------------------------------------- integridade das ações de tarefa (16/10)
test('tarefas: PATCH recusado (404, linha não alterada) não vira "Tarefa concluída"; a lista mostra o estado salvo', async ({ page }) => {
  await mockSession(page);
  const server = await taskServer(page, { viewerRole: 'analyst', viewer: U.rui, initial: [OPEN_TASK], ignoreStatusPatch: true });
  await page.goto('/finance/tasks.html');
  const row = page.locator(`#task-${OPEN_TASK.id}`);
  await row.getByRole('checkbox', { name: `Concluir: ${OPEN_TASK.title}` }).click();
  await expect(page.getByText('Esta tarefa não está mais disponível para você. Nada mudou.')).toBeVisible();
  await expect(page.getByText('Tarefa concluída.')).toHaveCount(0);
  expect(server.patches).toHaveLength(1);
  await expect(page.locator(`#task-${OPEN_TASK.id}`).getByRole('checkbox')).not.toBeChecked();
  expect(server.tasks[0].status).toBe('open');
});

test('tarefas: recusa e falha de rede ao concluir explicam sem mensagem técnica e não marcam como concluída', async ({ page }) => {
  await mockSession(page);
  await taskServer(page, { viewerRole: 'analyst', viewer: U.rui, initial: [OPEN_TASK] });
  let reply = 'gone';
  await page.route('**/api/finance/tasks', (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    if (reply === 'offline') return route.abort('failed');
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'task_not_found', error: 'fin_tasks row not found' }) });
  });
  await page.goto('/finance/tasks.html');
  const box = () => page.locator(`#task-${OPEN_TASK.id}`).getByRole('checkbox');
  await box().click();
  await expect(page.getByText('Esta tarefa não está mais disponível para você. Nada mudou.')).toBeVisible();
  await expect(page.locator('#view')).not.toContainText('fin_tasks');
  await expect(box()).not.toBeChecked();
  reply = 'offline';
  await box().click();
  await expect(page.getByText('Sem conexão com o servidor. Nada foi confirmado.')).toBeVisible();
  await expect(box()).not.toBeChecked();
  await expect(page.getByText('Tarefa concluída.')).toHaveCount(0);
});

test('tarefas: leitor acompanha sem caixa de conclusão nem formulário que o banco recusaria', async ({ page }) => {
  await mockSession(page);
  const server = await taskServer(page, { viewerRole: 'viewer', viewer: U.ana, initial: [OPEN_TASK, { ...OPEN_TASK, id: '00000000-0000-4000-8000-0000000000b8', title: 'Tarefa encerrada', status: 'done', assignee_id: U.rui }] });
  await page.goto('/finance/tasks.html');
  await expect(page.locator('#task-new')).toHaveCount(0);
  await expect(page.locator('.task-readonly')).toContainText('criar, concluir e reabrir ficam com administradores, gestores financeiros e analistas');
  await expect(page.locator(`#task-${OPEN_TASK.id}`)).toContainText('Aberta');
  await expect(page.locator('.task-item').getByRole('checkbox')).toHaveCount(0);
  await page.getByLabel('Mostrar tarefas').selectOption('concluidas');
  await expect(page.locator('#task-00000000-0000-4000-8000-0000000000b8')).toContainText('Concluída');
  await expect(page.locator('.task-item').getByRole('checkbox')).toHaveCount(0);
  expect(server.patches).toHaveLength(0);
  expect(server.posts).toHaveLength(0);
  await noHorizontalOverflow(page);
});

test('painel: conclusão rápida só diz "concluída" depois de reler a tarefa; leitor não recebe a caixa', async ({ page }) => {
  const task = { ...OPEN_TASK, due_on: '2099-01-10', related_type: null, related_id: null };
  await mockSession(page, { tasks: [task] });
  const server = await taskServer(page, { initial: [task], ignoreStatusPatch: true });
  await page.goto('/finance/dashboard.html');
  const row = page.locator('.mini-row', { hasText: OPEN_TASK.title });
  await row.getByRole('checkbox', { name: `Concluir: ${OPEN_TASK.title}` }).click();
  await expect(page.getByText('Esta tarefa não está mais disponível para você. Nada mudou.')).toBeVisible();
  await expect(page.getByText('Tarefa concluída.')).toHaveCount(0);
  await expect(row).not.toHaveClass(/done/);
  await expect(row.getByRole('checkbox')).not.toBeChecked();
  server.ignoreStatusPatch = false;
  await row.getByRole('checkbox').click();
  await expect(page.getByText('Tarefa concluída.')).toBeVisible();
  await expect(row).toHaveClass(/done/);
  expect(server.tasks[0].status).toBe('done');
});

test('painel: leitor vê as tarefas sem caixa de conclusão', async ({ page }) => {
  const task = { ...OPEN_TASK, due_on: '2099-01-10', related_type: null, related_id: null };
  await mockSession(page, { tasks: [task] });
  await taskServer(page, { viewerRole: 'viewer', viewer: U.ana, initial: [task] });
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('.mini-row', { hasText: OPEN_TASK.title })).toBeVisible();
  await expect(page.locator('.mini-row').getByRole('checkbox')).toHaveCount(0);
});

test('linha do tempo do contrato: marcos na mesma data aparecem uma vez, com os dois nomes', async ({ page }) => {
  // Aviso prévio de 90 dias cai no mesmo dia do marco de 90 dias.
  await mockSession(page);
  await page.goto('/finance/contracts.html');
  const legend = page.locator(`#contract-${CONTRACT} .life-legend`);
  await expect(legend.locator('.life-point-label')).toHaveText(['Início', 'Aviso prévio · 90 dias', '60 dias', '30 dias', 'Vencimento']);
  const dates = await legend.locator('.life-point-date').allTextContents();
  expect(new Set(dates).size).toBe(dates.length);
});

test('painel e menu do leitor: tarefa sem responsável não vira pendência dele; a atribuída a ele, sim', async ({ page }) => {
  const overdue = { ...OPEN_TASK, due_on: '2020-01-10', related_type: null, related_id: null };
  const mine = { ...OPEN_TASK, id: '00000000-0000-4000-8000-0000000000b8', title: 'Conferir parecer da controladoria', due_on: '2020-01-12', related_type: null, related_id: null, assignee_id: U.ana, assignee_name: 'Ana Lima' };
  await mockSession(page, { tasks: [overdue, mine] });
  await taskServer(page, { viewerRole: 'viewer', viewer: U.ana, initial: [overdue, mine] });
  await page.goto('/finance/dashboard.html');
  const attention = page.locator('#precisa-de-voce');
  await expect(attention).toContainText('Conferir parecer da controladoria');
  await expect(attention).not.toContainText(OPEN_TASK.title);
  // A tarefa da equipe continua visível para acompanhamento, fora de "Precisa de você".
  await expect(page.locator('.mini-row', { hasText: OPEN_TASK.title })).toBeVisible();
  const isMobile = await page.evaluate(() => innerWidth < 760);
  if (!isMobile) await expect(page.locator('.side-nav a[href*="tasks.html"] .side-count')).toHaveText('1');
});

test('primeiros passos: leitor não recebe ações de gestão que o servidor recusaria', async ({ page }) => {
  await mockSession(page, { contracts: [], providers: [] });
  await taskServer(page, { viewerRole: 'viewer', viewer: U.ana });
  await page.goto('/finance/dashboard.html');
  const onboarding = page.locator('#buyer-onboarding');
  await expect(onboarding).toContainText('fica com administradores e gestores financeiros');
  await expect(onboarding.getByRole('link', { name: 'Contratos registrados' })).toBeVisible();
  await expect(onboarding).toContainText('nenhum ainda');
  await expect(page.locator('a[href*="new-rfq"], a[href*="acao=registrar-contrato"]')).toHaveCount(0);
  await noHorizontalOverflow(page);
});

test('primeiros passos: gestor de empresa com contrato existente vê o passo cumprido e o próximo', async ({ page }) => {
  await mockSession(page);
  await page.goto('/finance/dashboard.html');
  const onboarding = page.locator('#buyer-onboarding');
  await expect(onboarding.locator('.onboarding-step.done')).toContainText(['Cadastre os provedores com quem fala', 'Registre um contrato que já existe']);
  await expect(onboarding.getByRole('link', { name: 'Crie a primeira solicitação' })).toHaveAttribute('href', '/finance/new-rfq.html');
});

test('contrato → implantação: a página diz de qual contrato a pessoa veio, o recorte real e devolve ao contrato', async ({ page }) => {
  await mockSession(page);
  const requested = [];
  await page.route('**/api/finance/implementations?**', (route) => {
    requested.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cards: [], columns: ['Plano'], rows: [{ id: 'p1', cells: ['Implantação do contrato com o Banco Carteira'] }], empty: { title: 'Nenhum plano' }, options: {}, forms: [] }) });
  });
  await page.goto('/finance/contracts.html');
  await page.getByRole('link', { name: 'Implantação deste contrato' }).click();
  const origin = page.getByRole('complementary', { name: 'Contrato de origem' });
  await expect(origin).toContainText('Vindo do contrato: Crédito');
  await expect(origin).toContainText('com Banco Carteira');
  await expect(origin).toContainText('vence 31 de dez de 2027');
  await expect(origin).toContainText('Filtro aplicado: este contrato. A lista mostra só os planos de implantação vinculados a ele.');
  await expect(page.getByLabel('Contrato', { exact: true })).toHaveValue(CONTRACT);
  // O parâmetro de origem (contrato) não vai ao servidor; o filtro real é contract_id.
  await expect.poll(() => requested.at(-1)?.get('contract_id')).toBe(CONTRACT);
  expect(requested.every((q) => !q.has('contrato'))).toBe(true);
  await expect(page.locator('#view')).not.toContainText(CONTRACT);
  await noHorizontalOverflow(page);
  // Sem o filtro de contrato, a página diz que a lista deixa de ser só deste contrato.
  await page.getByLabel('Contrato', { exact: true }).selectOption('');
  await page.getByLabel('Instituição').selectOption(PROVIDER);
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(origin).toContainText('Sem o filtro de contrato, a lista pode incluir outros contratos com a mesma instituição.');
  expect(requested.at(-1).has('contract_id')).toBe(false);
  await page.getByLabel('Instituição').selectOption('');
  await page.getByRole('button', { name: 'Aplicar filtros' }).click();
  await expect(origin).toContainText('Sem filtro: a lista mostra planos de implantação de todo o seu escopo, não só deste contrato.');
  await origin.getByRole('link', { name: 'Voltar ao contrato' }).click();
  await expect(page).toHaveURL(new RegExp(`/finance/contracts\\.html#contract-${CONTRACT}$`));
  await expect(page.locator(`#contract-${CONTRACT}`)).toBeFocused();
});

test('contrato fora da lista carregada: o filtro contract_id do link não se perde em silêncio', async ({ page }) => {
  await mockSession(page);
  const requested = [];
  await page.route('**/api/finance/covenants?**', (route) => { requested.push(new URL(route.request().url()).searchParams); return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cards: [], columns: [], rows: [], empty: { title: 'Nenhuma obrigação' }, options: {}, forms: [] }) }); });
  const other = '00000000-0000-4000-8000-0000000000fe';
  await page.goto(`/finance/covenants.html?contract_id=${other}&contrato=${other}`);
  await expect.poll(() => requested.at(-1)?.get('contract_id')).toBe(other);
  await expect(page.getByLabel('Contrato', { exact: true }).locator('option:checked')).toHaveText('Contrato do link');
  await expect(page.getByRole('complementary', { name: 'Contrato de origem' })).toContainText('Filtro aplicado: este contrato.');
  await expect(page.locator('#view')).not.toContainText(other);
});

test('covenants: origem desconhecida ou malformada não expõe identificador nem inventa contrato', async ({ page }) => {
  await mockSession(page);
  await page.route('**/api/finance/covenants?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cards: [], columns: [], rows: [], empty: { title: 'Nenhuma obrigação' }, options: {}, forms: [] }) }));
  const unknown = '00000000-0000-4000-8000-0000000000ff';
  await page.goto(`/finance/covenants.html?provider_id=${PROVIDER}&contrato=${unknown}`);
  const origin = page.getByRole('complementary', { name: 'Contrato de origem' });
  await expect(origin).toContainText('contrato fora da lista carregada nesta sessão');
  await expect(origin.getByRole('link', { name: 'Abrir contratos' })).toHaveAttribute('href', '/finance/contracts.html');
  await expect(page.locator('#view')).not.toContainText(unknown);
  await page.goto(`/finance/covenants.html?provider_id=${PROVIDER}&contrato=nao-e-um-id`);
  await expect(page.getByText('Nenhuma obrigação')).toBeVisible();
  await expect(page.locator('.origin-context')).toHaveCount(0);
});

// ------------------------------------------- tarefas com paginação do servidor (#206)
const many = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ ...OPEN_TASK, related_type: null, related_id: null,
  id: `00000000-0000-4000-8000-${String(1000 + i).padStart(12, '0')}`, title: `Tarefa sintética ${String(i + 1).padStart(3, '0')}`, due_on: `2027-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, ...extra }));

test('tarefas: mais de 200 abertas — páginas pelo cursor do servidor, sem total inventado nem duplicata, filtro preservado', async ({ page }) => {
  await mockSession(page);
  const server = await taskServer(page, { initial: [...many(230), ...many(3, { status: 'done' }).map((t, i) => ({ ...t, id: `00000000-0000-4000-8000-${String(9000 + i).padStart(12, '0')}` }))] });
  await page.goto('/finance/tasks.html');
  const note = page.locator('.task-toolbar [role=status]');
  await expect(note).toHaveText('50 tarefas carregadas · há mais neste filtro');
  expect(server.gets.at(-1)).toMatchObject({ status: 'open', limit: '50' });
  for (const expected of [100, 150, 200]) {
    await page.getByRole('button', { name: 'Carregar mais tarefas' }).click();
    await expect(note).toHaveText(`${expected} tarefas carregadas · há mais neste filtro`);
  }
  await page.getByRole('button', { name: 'Carregar mais tarefas' }).click();
  await expect(note).toHaveText('230 tarefas carregadas · todas deste filtro');
  await expect(page.getByRole('button', { name: 'Carregar mais tarefas' })).toBeHidden();
  const ids = await page.locator('.task-item').evaluateAll((nodes) => nodes.map((n) => n.id));
  expect(new Set(ids).size).toBe(230);
  // Cada página repete o mesmo filtro; nenhuma concluída se mistura às abertas.
  expect(server.gets.every((q) => q.status === 'open')).toBe(true);
  expect(ids.some((id) => id.includes('000000009'))).toBe(false);
  await page.getByLabel('Mostrar tarefas').selectOption('concluidas');
  await expect(note).toHaveText('3 tarefas carregadas · todas deste filtro');
  expect(server.gets.at(-1)).toMatchObject({ status: 'done' });
  expect(server.gets.at(-1)).not.toHaveProperty('cursor');
  await noHorizontalOverflow(page);
});

test('tarefas: resposta de um filtro anterior que chega atrasada é descartada', async ({ page }) => {
  await mockSession(page);
  const server = await taskServer(page, { initial: [...many(5), ...many(2, { assignee_id: U.paula }).map((t, i) => ({ ...t, id: `00000000-0000-4000-8000-${String(8000 + i).padStart(12, '0')}`, title: `Minha ${i + 1}` }))] });
  await page.goto('/finance/tasks.html');
  await expect(page.locator('.task-item')).toHaveCount(7);
  let release;
  server.holdGet = new Promise((resolve) => { release = resolve; });
  await page.getByLabel('Mostrar tarefas').selectOption('sem-responsavel');
  await expect.poll(() => server.gets.length).toBe(2);
  server.holdGet = null;
  await page.getByLabel('Mostrar tarefas').selectOption('minhas');
  await expect(page.locator('.task-item')).toHaveText([/Minha 1/, /Minha 2/]);
  release();
  await page.waitForTimeout(300);
  await expect(page.locator('.task-item')).toHaveText([/Minha 1/, /Minha 2/]);
  expect(server.gets.at(-1)).toMatchObject({ status: 'open', assignee_id: U.paula });
});

test('tarefas: cursor recusado recarrega do início; falha de rede em "carregar mais" mantém o que já estava na tela', async ({ page }) => {
  await mockSession(page);
  const server = await taskServer(page, { initial: many(60) });
  await page.goto('/finance/tasks.html');
  await expect(page.locator('.task-item')).toHaveCount(50);
  let mode = 'offline';
  await page.route('**/api/finance/tasks?**', (route) => {
    const q = new URL(route.request().url()).searchParams;
    if (!q.has('cursor')) return route.fallback();
    if (mode === 'offline') return route.abort('failed');
    return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'invalid_task_cursor', error: 'Cursor de tarefas inválido.' }) });
  });
  await page.getByRole('button', { name: 'Carregar mais tarefas' }).click();
  await expect(page.getByText('Não foi possível carregar mais tarefas. As já exibidas continuam como estavam.')).toBeVisible();
  await expect(page.locator('.task-item')).toHaveCount(50);
  mode = 'invalid';
  await page.getByRole('button', { name: 'Carregar mais tarefas' }).click();
  await expect(page.getByText('A lista mudou desde a última página. Recarregamos do início.')).toBeVisible();
  await expect(page.locator('.task-item')).toHaveCount(50);
  await expect(page.locator('#view')).not.toContainText('invalid_task_cursor');
  expect(server.tasks).toHaveLength(60);
});

test('tarefas: concluir na segunda página relê o filtro e a tarefa sai das abertas, sem repetir linhas', async ({ page }) => {
  await mockSession(page);
  const server = await taskServer(page, { initial: many(55) });
  await page.goto('/finance/tasks.html');
  await page.getByRole('button', { name: 'Carregar mais tarefas' }).click();
  await expect(page.locator('.task-item')).toHaveCount(55);
  const last = page.locator('.task-item').last();
  const title = await last.locator('.task-title').innerText();
  await last.getByRole('checkbox').click();
  await expect(page.getByText('Tarefa concluída.')).toBeVisible();
  await expect(page.locator('.task-item', { hasText: title })).toHaveCount(0);
  await expect(page.locator('.task-toolbar [role=status]')).toHaveText('50 tarefas carregadas · há mais neste filtro');
  expect(server.tasks.filter((t) => t.status === 'done')).toHaveLength(1);
});

test('tarefas abertas agrupadas por urgência: vencidas, próximos 7 dias, mais adiante e sem prazo', async ({ page }) => {
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  await mockSession(page);
  await taskServer(page, { initial: [
    { ...OPEN_TASK, id: '00000000-0000-4000-8000-0000000000f1', title: 'Atrasada', due_on: day(-3) },
    { ...OPEN_TASK, id: '00000000-0000-4000-8000-0000000000f2', title: 'Desta semana', due_on: day(2) },
    { ...OPEN_TASK, id: '00000000-0000-4000-8000-0000000000f3', title: 'Do mês que vem', due_on: day(40) },
    { ...OPEN_TASK, id: '00000000-0000-4000-8000-0000000000f4', title: 'Sem data', due_on: null }
  ] });
  await page.goto('/finance/tasks.html');
  const groups = page.locator('.task-group');
  await expect(groups.locator('.notice-group-title')).toHaveText(['Vencidas · 1', 'Próximos 7 dias · 1', 'Mais adiante · 1', 'Sem prazo · 1']);
  await expect(page.getByRole('region', { name: 'Vencidas' }).locator('.task-item')).toHaveText([/Atrasada/]);
  await expect(page.getByRole('region', { name: 'Sem prazo' }).locator('.task-item')).toHaveText([/Sem data/]);
  // A contagem do filtro continua sendo a do que foi carregado, não a dos grupos.
  await expect(page.locator('.task-toolbar [role=status]')).toHaveText('4 tarefas carregadas · todas deste filtro');
  await noHorizontalOverflow(page);
});

for (const status of ['open','done','cancelled','unavailable']) test(`tarefa além da página inicial: ${status}`, async ({page}, testInfo) => {
  await mockSession(page);
  const target='00000000-0000-4000-8000-00000000f999';
  const lookups=[];
  await page.route('**/api/finance/tasks**',route=>{
    const id=new URL(route.request().url()).searchParams.get('task_id');lookups.push(id);
    const rows=id===target ? status==='unavailable'?[]:[{id:target,title:'Revisar obrigação fora da primeira página',status,due_on:'2026-12-01',assignee_id:null,related_type:'contract',related_id:CONTRACT}]
      : [{id:'00000000-0000-4000-8000-00000000f998',title:'Outra tarefa da primeira página',status:'open',due_on:'2026-11-01'}];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,rows,page:{limit:id?1:50,has_more:!id,next_cursor:id?null:'more'}})});
  });
  await page.goto(`/finance/tasks.html#task-${target}`);
  await expect(page.getByRole('heading',{name:'Tarefas',exact:true})).toBeVisible();
  if(process.env.TASK_LINK_CAPTURE && status==='open')await page.screenshot({path:`reports/task-link-${process.env.TASK_LINK_CAPTURE}-${testInfo.project.name}.png`});
  await expect.poll(()=>lookups.includes(target)).toBe(true);
  await expect(page.getByLabel('Mostrar tarefas')).toHaveValue('vinculada');
  await expect(page.getByText('Outra tarefa da primeira página',{exact:true})).toHaveCount(0);
  if(status==='unavailable') {
    await expect(page.getByText('Tarefa não disponível neste escopo',{exact:true})).toBeVisible();
    await expect(page.locator('.task-item')).toHaveCount(0);
  } else {
    const row=page.locator(`#task-${target}`);
    await expect(row).toContainText('Revisar obrigação fora da primeira página');
    if(status==='cancelled') {await expect(row).toContainText('Cancelada');await expect(row.getByRole('checkbox')).toHaveCount(0);}
    else await expect(row.getByRole('checkbox')).toBeChecked({checked:status==='done'});
  }
  await noHorizontalOverflow(page);
  if(status==='open') {
    await page.getByLabel('Mostrar tarefas').selectOption('abertas');
    await expect(page.getByText('Outra tarefa da primeira página',{exact:true})).toBeVisible();
    await expect(page.locator(`#task-${target}`)).toHaveCount(0);
    await expect(page).toHaveURL(/filtro=abertas/);
    await page.reload();
    await expect(page.getByLabel('Mostrar tarefas')).toHaveValue('abertas');
    await expect(page.getByText('Outra tarefa da primeira página',{exact:true})).toBeVisible();
  }
});

async function contractWorkServer(page,{viewer=false,unknown=false,source=false}={}) {
  await mockSession(page);
  const records=[],posts=[],patches=[];
  if(source)await page.route('**/api/finance/contract-detail**',route=>route.fulfill({json:{...DETAIL,contract:{...CONTRACT_ROW,origin:'sourcing'},source_rfq:{id:PROVIDER,title:'Concorrência de capital de giro'}}}));
  if(viewer)await page.route('**/api/finance/members**',route=>route.fulfill({json:{ok:true,viewer_id:'u1',rows:[{user_id:'u1',role:'viewer',display_name:'Leitora'}]}}));
  await page.route('**/api/finance/tasks**',async route=>{
    const request=route.request(),q=new URL(request.url()).searchParams;
    if(request.method()==='POST') {
      const body=request.postDataJSON();posts.push(body);
      if(!records.length)records.push({...body,id:'00000000-0000-4000-8000-00000000f111',status:'open',created_at:'2026-10-23T12:00:00Z',assignee_name:null});
      if(unknown && posts.length===1)return route.fulfill({status:503,json:{ok:false,error:'Resposta não confirmada.'}});
      return route.fulfill({status:posts.length>1?200:201,json:{ok:true,row:records[0]}});
    }
    if(request.method()==='PATCH'){const body=request.postDataJSON();patches.push(body);records[0].status=body.status;return route.fulfill({json:{ok:true}});}
    const rows=q.has('task_id')?records.filter(row=>row.id===q.get('task_id')):q.get('contract_id')===CONTRACT?records.filter(row=>row.status===q.get('status')):[];
    return route.fulfill({json:{ok:true,rows,page:{limit:25,has_more:false,next_cursor:null}}});
  });
  return {records,posts,patches};
}

test('trabalho no contrato conserva vínculo e mostra conclusão no histórico', async ({page},testInfo) => {
  const server=await contractWorkServer(page);
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${CONTRACT}`);
  const work=page.getByRole('region',{name:'Trabalho deste contrato'});
  await expect(work.getByRole('heading',{name:'Trabalho deste contrato'})).toBeVisible();
  await expect(work.getByText('Situação das tarefas do contrato',{exact:true})).toBeVisible();
  await expect(work.getByRole('combobox',{name:'Situação das tarefas do contrato',exact:true})).toBeVisible();
  await expect(work.getByRole('link',{name:'Relacionamento com Banco Carteira'})).toHaveAttribute('href',new RegExp(`provider_id=${PROVIDER}`));
  await work.getByText('Registrar próxima ação',{exact:true}).click();
  await work.getByLabel('O que precisa ser feito').fill('Conferir documento da renovação');
  await work.getByLabel('Prazo da tarefa').fill('2026-11-10');
  await work.getByRole('button',{name:'Registrar tarefa neste contrato'}).click();
  await expect(work).toContainText('Tarefa registrada neste contrato');
  expect(server.posts[0]).toMatchObject({related_type:'contract',related_id:CONTRACT,due_on:'2026-11-10'});
  expect(server.posts[0].idempotency_key).toMatch(/^[a-f0-9-]{36}$/);
  await work.getByRole('button',{name:'Concluir tarefa: Conferir documento da renovação',exact:true}).click();
  await expect(work).toContainText('Tarefa concluída.');
  await work.getByLabel('Situação das tarefas do contrato').selectOption('done');
  await expect(work.locator('.milestone-list')).toContainText('Conferir documento da renovação');
  await expect(work.locator('.milestone-list')).toContainText('Concluída');
  expect(server.patches).toHaveLength(1);
  if(process.env.LIFECYCLE_CAPTURE)await page.screenshot({path:`reports/lifecycle-${process.env.LIFECYCLE_CAPTURE}-${testInfo.project.name}.png`});
  await work.getByRole('button',{name:'Reabrir tarefa: Conferir documento da renovação',exact:true}).click();
  await work.getByLabel('Situação das tarefas do contrato').selectOption('open');
  await expect(work.locator('.milestone-list')).toContainText('Conferir documento da renovação');
  await noHorizontalOverflow(page);
});

test('registro contextual incerto confere a mesma chave; leitor não recebe ações',async({page})=>{
  const server=await contractWorkServer(page,{unknown:true});
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${CONTRACT}`);
  const work=page.getByRole('region',{name:'Trabalho deste contrato'});
  await work.getByText('Registrar próxima ação',{exact:true}).click();
  await work.getByLabel('O que precisa ser feito').fill('Cobrar documento');
  await work.getByRole('button',{name:'Registrar tarefa neste contrato'}).click();
  await expect(work.getByRole('button',{name:'Conferir registro da tarefa'})).toBeVisible();
  await expect(work.getByLabel('O que precisa ser feito')).toBeDisabled();
  await work.getByRole('button',{name:'Conferir registro da tarefa'}).click();
  await expect(work).toContainText('Tarefa registrada neste contrato');
  expect(server.posts).toHaveLength(2);expect(server.posts[0]).toEqual(server.posts[1]);expect(server.records).toHaveLength(1);
  await noHorizontalOverflow(page);
});

test('leitor acompanha trabalho do contrato sem criar ou concluir',async({page})=>{
 await contractWorkServer(page,{viewer:true});
 await page.goto(`/finance/contracts.html?abrir=contrato#contract-${CONTRACT}`);
 const work=page.getByRole('region',{name:'Trabalho deste contrato'});
 await expect(work).toContainText('Nenhuma tarefa nesta situação');
 await expect(work.getByRole('button',{name:'Registrar tarefa neste contrato'})).toHaveCount(0);
 await expect(work.getByLabel('O que precisa ser feito')).toHaveCount(0);
});

test('tarefas do contrato paginam, preservam linhas no erro e permitem atualizar o mesmo cursor',async({page})=>{
 await mockSession(page);let pages=0;
 const tasks=Array.from({length:26},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,related_type:'contract',related_id:CONTRACT,status:'open',title:`Ação contratual ${i+1}`,created_at:'2026-10-23T12:00:00Z'}));
 await page.route('**/api/finance/tasks**',route=>{
  const q=new URL(route.request().url()).searchParams;
  if(q.has('cursor')){pages++;if(pages===1)return route.fulfill({status:503,json:{ok:false,error:'Página indisponível.'}});}
  return route.fulfill({json:{ok:true,rows:q.has('cursor')?tasks.slice(25):tasks.slice(0,25),page:{limit:25,has_more:!q.has('cursor'),next_cursor:q.has('cursor')?null:'continuation'}}});
 });
 await page.goto(`/finance/contracts.html?abrir=contrato#contract-${CONTRACT}`);
 const work=page.getByRole('region',{name:'Trabalho deste contrato'});
 await expect(work.locator('.milestone-row')).toHaveCount(25);
 await work.getByRole('button',{name:'Mais tarefas deste contrato'}).click();
 await expect(work).toContainText('Página indisponível');
 await expect(work.locator('.milestone-row')).toHaveCount(25);
 await work.getByRole('button',{name:'Mais tarefas deste contrato'}).click();
 await expect(work.locator('.milestone-row')).toHaveCount(26);
 await work.getByRole('button',{name:'Atualizar tarefas do contrato'}).click();
 await expect(work.locator('.milestone-row')).toHaveCount(25);
 await expect(work.getByRole('button',{name:'Mais tarefas deste contrato'})).toBeVisible();
 await noHorizontalOverflow(page);
});

 test('contrato originado em procurement preserva acesso à solicitação autorizada',async({page})=>{
  await contractWorkServer(page,{source:true});
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${CONTRACT}`);
  const work=page.getByRole('region',{name:'Trabalho deste contrato'});
  await expect(work.getByRole('link',{name:'Solicitação de origem: Concorrência de capital de giro'})).toHaveAttribute('href',new RegExp(`/finance/rfq.html\\?id=${PROVIDER}`));
 });

test('trabalho do contrato no celular: solicitação de origem longa quebra linha sem cortar o painel', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await mockSession(page);
  const title='Adquirência — revisão de MDR e antecipação (R$ 12 milhões/mês) com título longo de propósito';
  await page.route('**/api/finance/contract-detail**',route=>route.fulfill({json:{...DETAIL,contract:{...CONTRACT_ROW,origin:'sourcing'},source_rfq:{id:PROVIDER,title}}}));
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${CONTRACT}`);
  const work=page.getByRole('region',{name:'Trabalho deste contrato'});
  await expect(work.getByRole('link',{name:`Solicitação de origem: ${title}`})).toBeVisible();
  const overflow=await page.locator('dialog[open]').evaluate(dialog=>[...dialog.querySelectorAll('*')].filter(node=>node.getBoundingClientRect().right>window.innerWidth+1).length);
  expect(overflow).toBe(0);
  await noHorizontalOverflow(page);
});

// ---------------------------------------------------------------- buyer-first v3.7
// Jornada do primeiro valor sem banco: registrar o contrato que já existe,
// revisar antes de gravar, só confirmar com o id do servidor e seguir para o
// contrato com a próxima ação. Sessão simulada (teste de UI); escopo, RLS e
// idempotência no banco seguem provados em tests/database.
const SAVED = '00000000-0000-4000-8000-0000000000d9';
async function fillImport(page, { title = 'Conta garantida 2026', notice = '45' } = {}) {
  const form = page.locator('#contract-import-form');
  await form.getByLabel(/^Título/).fill(title);
  await form.getByLabel(/^Início/).fill(isoDay(-30));
  await form.getByLabel(/^Fim/).fill(isoDay(400));
  if (notice !== null) await form.getByLabel(/^Aviso prévio/).fill(notice);
  return form;
}

test('buyer-first: revisão antes de gravar declara origem, prazo e ausência de responsável; voltar preserva o preenchimento', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar contrato existente' }).click();
  const form = await fillImport(page, { notice: null });
  // Sem aviso prévio, o prazo não é presumido.
  await expect(page.locator('#contract-import-preview')).toHaveText('Sem aviso prévio informado, o prazo para decidir a renovação não pode ser determinado.');
  await form.getByLabel(/^Aviso prévio/).fill('45');
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  const review = page.locator('#contract-import-review');
  await expect(review).toBeFocused();
  await expect(review).toContainText('Banco Carteira');
  await expect(review).toContainText(/Revisar a renovação até .+ \(45 dias antes do fim\)/);
  await expect(review).toContainText('Nenhum responsável é atribuído automaticamente');
  await expect(review).toContainText('Sem concorrência, proposta ou aprovação no Arandu');
  expect(calls.some((call) => call.path === 'contract-import')).toBe(false);
  await page.getByRole('button', { name: 'Voltar e editar' }).click();
  await expect(form.getByLabel(/^Título/)).toBeFocused();
  await expect(form.getByLabel(/^Título/)).toHaveValue('Conta garantida 2026');
  expect(calls.some((call) => call.path === 'contract-import')).toBe(false);
});

test('buyer-first: gravado pelo servidor abre o contrato com o trabalho dele (próxima ação) e sobrevive a refresh', async ({ page }) => {
  const contracts = [CONTRACT_ROW];
  const calls = await mockSession(page, { contracts, importReply: { status: 201, body: { ok: true, id: SAVED, status: 'active', next_task: { id: 't1', title: 'Revisar renovação', due_on: isoDay(355) } } } });
  await page.route('**/api/finance/contract-detail**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...DETAIL, contract: { ...CONTRACT_ROW, id: SAVED, title: 'Conta garantida 2026' } }) }));
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar contrato existente' }).click();
  await fillImport(page);
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`contracts\\.html\\?abrir=contrato#contract-${SAVED}$`));
  const panel = page.getByRole('dialog', { name: 'Conta garantida 2026' });
  await expect(panel.getByRole('heading', { name: 'Trabalho deste contrato' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Relacionamento com Banco Carteira' })).toBeVisible();
  expect(calls.filter((call) => call.path === 'contract-import')).toHaveLength(1);
  // Deep link estável: refresh reabre o mesmo contrato pelo detalhe autorizado.
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Conta garantida 2026' })).toBeVisible();
});

test('buyer-first: queda de rede na gravação não vira sucesso nem reenvio; conferir acha o contrato gravado', async ({ page }) => {
  const contracts = [CONTRACT_ROW];
  const calls = await mockSession(page, { contracts });
  await page.route('**/api/finance/contract-import', async (route) => {
    calls.push({ method: 'POST', path: 'contract-import' });
    // O servidor gravou, mas a resposta se perdeu.
    contracts.push({ ...CONTRACT_ROW, id: SAVED, title: 'Conta garantida 2026', starts_on: isoDay(-30), ends_on: isoDay(400) });
    await route.abort('connectionreset');
  });
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar contrato existente' }).click();
  const form = await fillImport(page);
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
  await expect(form.getByText('A resposta não confirmou o registro.', { exact: false })).toBeVisible();
  await expect(page.getByText(/^Contrato registrado/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Voltar e editar' })).toBeHidden();
  // Novo clique em Confirmar não reenvia enquanto o resultado é incerto.
  await page.getByRole('button', { name: 'Confirmar registro', exact: true }).click({ force: true });
  expect(calls.filter((call) => call.path === 'contract-import')).toHaveLength(1);
  await form.getByRole('button', { name: 'Conferir na carteira' }).click();
  await expect(form.getByText('O contrato foi gravado. Nada foi enviado de novo.')).toBeVisible();
  await form.getByRole('button', { name: 'Abrir o contrato registrado' }).click();
  await expect(page).toHaveURL(new RegExp(`#contract-${SAVED}$`));
  expect(calls.filter((call) => call.path === 'contract-import')).toHaveLength(1);
});

test('buyer-first: recusa de permissão e sessão expirada explicam que nada foi gravado', async ({ page }) => {
  let status = 403;
  await mockSession(page);
  await page.route('**/api/finance/contract-import', (route) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'forbidden', code: 'forbidden' }) }));
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar contrato existente' }).click();
  const form = await fillImport(page);
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
  await expect(form.getByText(/Seu papel não permite registrar contratos/)).toBeVisible();
  status = 401;
  await page.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
  await expect(form.getByText(/Sua sessão expirou\. Nada foi gravado/)).toBeVisible();
  await expect(form.getByLabel(/^Título/)).toHaveValue('Conta garantida 2026');
});

test('buyer-first: leitor numa carteira vazia vê o que acontecerá, sem ação de registro', async ({ page }) => {
  await mockSession(page, { contracts: [] });
  await page.route('**/api/finance/members**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [{ user_id: 'u1', role: 'viewer', display_name: 'Leitor' }], viewer_id: 'u1' }) }));
  await page.goto('/finance/contracts.html');
  await expect(page.getByText('Nenhum contrato registrado ainda')).toBeVisible();
  await expect(page.getByText(/Registrar contratos fica com administração e gestão financeira/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Registrar/ })).toHaveCount(0);
});

test('buyer-first: celular 390px, teclado do início ao fim e sem overflow', async ({ page }) => {
  const calls = await mockSession(page, { providers: [], contracts: [] });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar o primeiro contrato' }).focus();
  await page.keyboard.press('Enter');
  const form = page.locator('#contract-import-form');
  // Sem instituição cadastrada, o foco começa na escolha da instituição.
  await expect(form.getByLabel(/^Instituição financeira/)).toBeFocused();
  await form.getByLabel(/^Instituição financeira/).selectOption({ label: '+ Cadastrar nova instituição' });
  await form.getByLabel(/^Nome da instituição/).fill('Banco Horizonte');
  await fillImport(page);
  await noHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#contract-import-review')).toContainText('Banco Horizonte (nova instituição, cadastrada junto)');
  await noHorizontalOverflow(page);
  expect(calls.some((call) => call.path === 'providers' && call.method === 'POST')).toBe(false);
});

test('buyer-first: filtro de entidade sem contrato não parece carteira vazia; registro já vem na entidade em foco', async ({ page }) => {
  const A = '00000000-0000-4000-8000-0000000000f1', B = '00000000-0000-4000-8000-0000000000f2';
  await mockSession(page, { contracts: [{ ...CONTRACT_ROW, legal_entity_id: A }] });
  await page.route('**/api/finance/entities**', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, scope: 'group', can_admin: true, base_currency: 'BRL', rows: [
    { id: A, legal_name: 'Vitta Indústria', short_name: 'Indústria', status: 'active', parent_id: null, kind: 'legal_entity' },
    { id: B, legal_name: 'Vitta Logística', short_name: 'Logística', status: 'active', parent_id: null, kind: 'legal_entity' }] }) }));
  await page.addInitScript((id) => sessionStorage.setItem('arandu-finance-entity', id), B);
  await page.goto('/finance/contracts.html');
  await expect(page.getByText('Nenhum contrato nesta entidade')).toBeVisible();
  await expect(page.getByText('Nenhum contrato registrado ainda')).toHaveCount(0);
  await page.locator('.empty').getByRole('button', { name: 'Registrar contrato existente' }).click();
  await expect(page.locator('#contract-import-form').getByLabel(/^Entidade/)).toHaveValue(B);
});

test('buyer-first: instituição gravada cuja resposta se perdeu é reaproveitada na conferência, sem segundo cadastro', async ({ page }) => {
  const providers = [];
  const calls = await mockSession(page, { providers, contracts: [] });
  let providerPosts = 0;
  await page.route('**/api/finance/providers', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    providerPosts += 1;
    providers.push({ id: NEW_PROVIDER, name: 'Banco Horizonte', status: 'active' });
    return route.abort('connectionreset');
  });
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar o primeiro contrato' }).click();
  const form = page.locator('#contract-import-form');
  await form.getByLabel(/^Instituição financeira/).selectOption({ label: '+ Cadastrar nova instituição' });
  await form.getByLabel(/^Nome da instituição/).fill('Banco Horizonte');
  await fillImport(page);
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
  await form.getByRole('button', { name: 'Conferir na carteira' }).click();
  await expect(form.getByText(/Isso não prova que ele não foi gravado/)).toBeVisible();
  await expect(form.getByText(/A instituição já gravada será reaproveitada/)).toBeVisible();
  await expect(page.locator('#contract-import-review')).toContainText('Banco Horizonte');
  await page.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
  await expect.poll(() => calls.find((call) => call.path === 'contract-import')?.body?.provider_id).toBe(NEW_PROVIDER);
  expect(providerPosts).toBe(1);
});

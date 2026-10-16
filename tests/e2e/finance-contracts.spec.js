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
  await form.getByText('Termos estruturados').click();
  await form.getByRole('button', { name: 'Adicionar tarifa' }).click();
  await form.getByLabel('Serviço da tarifa').fill('PIX enviado');
  await form.getByLabel('Valor contratado').fill('0.5');
  await page.getByRole('button', { name: 'Registrar contrato', exact: true }).click();
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
  await expect(form.getByRole('status')).toContainText(/Próxima ação: tarefa “Revisar renovação” para \d{1,2} de .+ de \d{4}, 60 dias antes do fim\./);
  await page.getByRole('button', { name: 'Registrar contrato', exact: true }).click();
  await expect.poll(() => calls.find((call) => call.path === 'contract-import')?.body).toMatchObject({ provider_id: NEW_PROVIDER, title: 'Capital de giro 2026', renewal_notice_days: 60, parent_contract_id: null });
  expect(calls.find((call) => call.path === 'providers' && call.method === 'POST')?.body).toMatchObject({ organization_id: ORG, name: 'Banco Horizonte', kind: 'bank' });
  await expect(page.getByText(/Contrato registrado\. Próxima ação: revisar a renovação até \d{1,2} de .+ \(em Tarefas\)\./)).toBeVisible();
});

test('registro de contrato aponta o campo com problema e não envia dado inválido', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/contracts.html');
  await page.getByRole('button', { name: 'Registrar contrato existente' }).click();
  const form = page.locator('#contract-import-form');
  await page.getByRole('button', { name: 'Registrar contrato', exact: true }).click();
  await expect(form.getByText('Dê um título com pelo menos 2 caracteres.')).toBeVisible();
  await expect(form.getByText('Informe a data de início.')).toBeVisible();
  await expect(form.getByLabel(/^Título/)).toBeFocused();
  await form.getByLabel(/^Título/).fill('Fiança bancária');
  await form.getByLabel(/^Início/).fill('2026-05-01');
  await form.getByLabel(/^Fim/).fill('2026-04-01');
  await page.getByRole('button', { name: 'Registrar contrato', exact: true }).click();
  await expect(form.getByText('O fim não pode anteceder o início.')).toBeVisible();
  await form.getByLabel(/^Fim/).fill('2027-04-01');
  await form.getByLabel(/^Aviso prévio/).fill('12.5');
  await page.getByRole('button', { name: 'Registrar contrato', exact: true }).click();
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
  await page.getByRole('button', { name: 'Registrar contrato', exact: true }).click();
  await expect(form.getByText(/já está na carteira/)).toBeVisible();
  expect(calls.find((call) => call.path === 'contract-import')?.body.parent_contract_id).toBe(CONTRACT);
  await expect(page.getByRole('button', { name: 'Registrar contrato', exact: true })).toBeEnabled();
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

test('contrato leva à implantação e às obrigações da mesma instituição, com o filtro aplicado no servidor', async ({ page }) => {
  await mockSession(page);
  const requested = [];
  await page.route('**/api/finance/implementations?**', (route) => {
    requested.push(new URL(route.request().url()).searchParams);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cards: [], columns: [], rows: [], empty: { title: 'Nenhum plano' }, options: {}, forms: [] }) });
  });
  await page.goto('/finance/contracts.html');
  const links = page.getByRole('navigation', { name: 'Pós-contratação com Banco Carteira' });
  await expect(links.getByRole('link', { name: 'Covenants e obrigações com Banco Carteira' })).toHaveAttribute('href', /\/finance\/covenants\.html\?provider_id=00000000-0000-4000-8000-0000000000e1$/);
  await links.getByRole('link', { name: 'Implantação com Banco Carteira' }).click();
  await page.waitForURL(/\/finance\/implementations\.html\?provider_id=/);
  await expect.poll(() => requested.at(-1)?.get('provider_id')).toBe(PROVIDER);
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
async function taskServer(page, { viewerRole = 'finance_manager', viewer = U.paula, initial = [], failNextPost = 0 } = {}) {
  const state = { tasks: initial.map((t) => ({ ...t })), posts: [], patches: [], keys: new Map(), failNextPost, holdPost: null };
  await page.route('**/api/finance/members**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: MEMBERS.map((m) => (m.user_id === viewer ? { ...m, role: viewerRole } : m)), viewer_id: viewer }) }));
  await page.route('**/api/finance/tasks**', async (route) => {
    const request = route.request();
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    const named = (t) => ({ ...t, assignee_name: t.assignee_id ? MEMBERS.find((m) => m.user_id === t.assignee_id)?.display_name || null : null });
    if (request.method() === 'GET') return json({ ok: true, rows: state.tasks.map(named) });
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
      const task = { id: `00000000-0000-4000-8000-${String(state.tasks.length + 100).padStart(12, '0')}`, title: body.title, due_on: body.due_on, status: 'open', related_type: null, related_id: null, assignee_id: body.assignee_id ?? null };
      state.tasks.push(task);
      if (key) state.keys.set(key, { hash, task });
      // Falha de rede DEPOIS de gravar: o resultado é desconhecido para o navegador.
      if (state.failNextPost > 0) { state.failNextPost -= 1; return route.abort('failed'); }
      return json({ ok: true, row: named(task) }, 201);
    }
    if (request.method() === 'PATCH') {
      state.patches.push(body);
      const task = state.tasks.find((t) => t.id === body.task_id);
      if (Object.hasOwn(body, 'assignee_id') && !manager) return json({ ok: false, code: 'task_assignment_forbidden', error: 'Sua conta não tem permissão para atribuir esta tarefa.' }, 403);
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
  await expect(form.getByRole('status')).toContainText('Não confirmamos se a tarefa foi criada');
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

test('tarefas: filtros de apresentação sobre o recorte carregado, com contagem honesta e reload preservado', async ({ page }) => {
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
  await expect(page.locator('.task-toolbar [role=status]')).toHaveText('1 de 4 tarefas carregadas');
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

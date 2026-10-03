import { test, expect } from '@playwright/test';
import { buildPassport } from '../../lib/finance/passport.mjs';

// Financial Passport no build publicado, com a sessão simulada por
// `page.route` (como em finance-procurement.spec.js). Autorização, RLS,
// histórico e snapshot imutável são provados contra Postgres real em
// tests/database/financial-passport.sql; aqui a interface é exercitada:
// leitura, edição, salvamento, recarga, proveniência, frescor, cobertura,
// privacidade de documento, reuso na RFQ, snapshot histórico, negação ao
// provedor, teclado, celular e ausência de overflow horizontal.

const ORG = '00000000-0000-4000-8000-0000000000a1';
const PROVIDER_ORG = '00000000-0000-4000-8000-0000000000c1';
const RFQ = '00000000-0000-4000-8000-0000000000b1';
const DOC = '00000000-0000-4000-8000-0000000000d1';
const ORGANIZATION = { id: ORG, kind: 'BUYER', legal_name: 'Vitta Foods S.A.', tax_identifier: '11222333000181', sector: 'Alimentos', revenue_band: '30m_300m' };
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

function initialRows() {
  return [
    { id: 'r1', field_key: 'receita_anual', field_value: '182000000', source: 'documento_interno', updated_at: daysAgo(20), updated_by: 'u1', review_after_days: 365 },
    { id: 'r2', field_key: 'volume_cartoes_mensal', field_value: '12400000', source: 'extrato', updated_at: daysAgo(200), updated_by: 'u2', review_after_days: 90 },
    { id: 'r3', field_key: 'garantias_disponiveis', field_value: 'Recebíveis de cartão e duplicatas', source: 'declarado_pela_empresa', updated_at: daysAgo(10), updated_by: 'u1', review_after_days: 180 },
    { id: 'r4', field_key: 'doc_contrato_social', field_value: 'Consolidação de 2026', source: 'documento_interno', updated_at: daysAgo(10), updated_by: 'u1', review_after_days: 730, document_id: DOC },
    { id: 'r5', field_key: 'colaboradores_texto', field_value: '612 colaboradores em 5 unidades', source: 'declarado_pela_empresa', updated_at: daysAgo(5), updated_by: 'u2' }
  ];
}

/** Sessão simulada com Passport de estado: o que é salvo volta na recarga. */
async function mockPassport(page, { role = 'finance_manager', kind = 'BUYER', snapshot = [], entities = [] } = {}) {
  const state = { rows: initialRows(), writes: [], confirms: [], creates: [], forbidden: [] };
  const members = { u1: 'Helena Duarte', u2: 'Rafael Menezes' };
  const documents = [{ id: DOC, title: 'Contrato social consolidado', current_version: 2 }];
  await page.route('**/api/finance/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const organization = kind === 'BUYER' ? ORGANIZATION : { id: PROVIDER_ORG, kind: 'PROVIDER', legal_name: 'Atlas Bank' };
    if (path === 'entities') return json({ok:true,rows:entities,scope:'group'});
    if (path === 'organizations') return json({ ok: true, rows: [organization] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Helena Duarte', title: 'CFO' }], viewer_id: 'u1' });
    if (path === 'overview') return json({ ok: true, organization, profile: state.rows, providers: [], contracts: [], tasks: [], rfqs: kind === 'BUYER' ? [{ id: RFQ, title: 'Capital de giro', product: 'credit', status: 'draft', revision: 1, demand: { amount: 500000, purpose: 'capital_de_giro', term_months: 24, annual_revenue: 182000000 }, invites: [], proposals: [], created_at: daysAgo(3) }] : [] });
    if (path === 'profile' && request.method() === 'GET') {
      // A API real recusa organização de provedor (organization_kind).
      if (kind !== 'BUYER') { state.forbidden.push(path); return json({ ok: false, error: 'Tipo de organização incompatível com a operação.' }, 400); }
      return json({ ok: true, rows: state.rows, documents, passport: buildPassport({ organization: ORGANIZATION, rows: state.rows, documents, members: new Map(Object.entries(members)), legalEntityId:url.searchParams.get('legal_entity_id'), entity:entities.find(row=>row.id===url.searchParams.get('legal_entity_id')) }) });
    }
    if (path === 'profile' && request.method() === 'POST') {
      const body = request.postDataJSON();
      state.writes.push(body);
      const row = state.rows.find((item) => item.field_key === body.field_key);
      const next = { field_key: body.field_key, field_value: String(body.field_value).replace(',', '.'), source: body.source, document_id: body.document_id, valid_until: body.valid_until, review_after_days: body.review_after_days, updated_at: new Date().toISOString(), updated_by: 'u1', verified_at: null };
      if (row) Object.assign(row, next); else state.rows.push({ id: `n${state.rows.length}`, ...next });
      return json({ ok: true, id: 'x' }, 201);
    }
    if (path === 'profile/confirm') {
      const body = request.postDataJSON();
      state.confirms.push(body.field_key);
      Object.assign(state.rows.find((item) => item.field_key === body.field_key), { verified_at: new Date().toISOString() });
      return json({ ok: true });
    }
    if (path === 'profile/history') return json({ ok: true, rows: [
      { change_type: 'updated', previous_value: '170000000', new_value: '182000000', previous_source: 'declarado_pela_empresa', new_source: 'documento_interno', changed_at: daysAgo(20), changed_by_name: 'Helena Duarte' },
      { change_type: 'created', previous_value: null, new_value: '170000000', new_source: 'declarado_pela_empresa', changed_at: daysAgo(400), changed_by_name: 'Rafael Menezes' }
    ] });
    if (path === 'rfq-passport') return json({ ok: true, rows: snapshot });
    if (path === 'rfqs' && request.method() === 'POST') { state.creates.push(request.postDataJSON()); return json({ ok: true, id: RFQ, warnings: [] }, 201); }
    if (path === 'rfq-editor' && request.method() === 'GET') return json({ ok: true, draft: null });
    if (path === 'rfq-editor') return json({ ok: true, revision: 1, updated_at: new Date().toISOString() });
    if (path.startsWith('private-documents')) return json({ ok: true, rows: documents.map((doc) => ({ ...doc, entity_type: 'profile', visibility: 'internal', versions: [] })) });
    if (['approvals', 'notifications', 'decisions', 'events', 'comments', 'rfq-revisions', 'tasks'].includes(path)) return json({ ok: true, rows: [] });
    if (path === 'approval-policy') return json({ ok: true, required_for_decision: false });
    if (path === 'signals' || path === 'search') return json({ ok: true, rows: [] });
    return json({ ok: false }, 404);
  });
  return state;
}

async function noOverflow(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `overflow horizontal em ${label}`).toBeLessThanOrEqual(1);
}

test('Passport mostra cobertura, proveniência e frescor sem virar nota', async ({ page }) => {
  await mockPassport(page);
  await page.goto('/finance/passport.html');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Financial Passport');
  const coverage = page.getByRole('list', { name: 'Cobertura do Passport por contexto' });
  // Empresa: razão social, CNPJ, setor, faixa de faturamento e faturamento anual.
  await expect(coverage.getByRole('link', { name: /^Empresa:/ })).toContainText('5/10');
  await expect(coverage.getByRole('link', { name: /^Documentação:/ })).toContainText('1/4');
  await expect(coverage.getByRole('link', { name: /^Adquirência:/ })).toContainText('1 desatualizado');
  await expect(page.locator('.passport-notice')).toContainText('Não é nota de risco');

  const revenue = page.locator('#field-receita_anual');
  await expect(revenue).toContainText('R$ 182.000.000');
  await expect(revenue).toContainText('Documento interno');
  await expect(revenue).toContainText('Helena Duarte');
  await expect(revenue.locator('[data-freshness]')).toHaveAttribute('data-freshness', 'current');
  const volume = page.locator('#field-volume_cartoes_mensal');
  await expect(volume.locator('[data-freshness]')).toHaveAttribute('data-freshness', 'stale');
  await expect(volume).toContainText('Extrato');
  await expect(page.getByRole('status').filter({ hasText: 'pede revisão' })).toContainText('Volume mensal em cartões');
  // Cadastro da organização aparece com origem própria, formatado.
  await expect(page.locator('#field-tax_identifier')).toContainText('11.222.333/0001-81');
  await expect(page.locator('#field-tax_identifier')).toContainText('Cadastro da organização');
  // Campo livre antigo aparece fora da cobertura.
  await expect(page.locator('#passport-outros')).toContainText('612 colaboradores');
  const body = (await page.locator('main').innerText()).toLowerCase();
  expect(body).not.toMatch(/score|rating|melhor (banco|proposta)|recomendad/);
  await noOverflow(page, 'Passport');
});

test('Passport edita, salva, recarrega e confirma com origem declarada', async ({ page }) => {
  const state = await mockPassport(page);
  await page.goto('/finance/passport.html');
  await page.getByRole('button', { name: 'Editar Faturamento anual (R$)' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', { name: 'Faturamento anual (R$)' })).toBeVisible();
  await drawer.getByLabel('Valor').fill('190000000');
  await drawer.getByLabel('Origem do dado').selectOption('contrato_vigente');
  await drawer.getByLabel('Revisar a cada (dias)').fill('180');
  await drawer.getByRole('button', { name: 'Salvar' }).click();
  await expect(drawer).toBeHidden();
  expect(state.writes.at(-1)).toMatchObject({ organization_id: ORG, field_key: 'receita_anual', field_value: '190000000', source: 'contrato_vigente', review_after_days: 180 });
  // Recarga real da página: o valor salvo volta do servidor simulado.
  await page.reload();
  await expect(page.locator('#field-receita_anual')).toContainText('R$ 190.000.000');
  await expect(page.locator('#field-receita_anual')).toContainText('Contrato vigente');
  await expect(page.locator('#field-receita_anual')).toContainText('revisão a cada 180 dias');

  await page.getByRole('button', { name: 'Confirmar Volume mensal em cartões e PIX (R$) como atual' }).click();
  await expect(page.locator('#field-volume_cartoes_mensal [data-freshness]')).toHaveAttribute('data-freshness', 'current');
  expect(state.confirms).toEqual(['volume_cartoes_mensal']);

  await page.getByRole('button', { name: 'Histórico de Faturamento anual (R$)' }).click();
  await expect(page.getByRole('dialog')).toContainText('Alterado');
  await expect(page.getByRole('dialog')).toContainText('R$ 170.000.000 → R$ 182.000.000');
  await expect(page.getByRole('dialog')).toContainText('append-only');
});

test('documento do Passport só aparece por referência privada, sem URL guardada', async ({ page }) => {
  await mockPassport(page);
  await page.goto('/finance/passport.html');
  const doc = page.locator('#field-doc_contrato_social');
  await expect(doc).toContainText('Contrato social consolidado · v2');
  await expect(page.locator('#passport-documentacao')).toContainText('armazenamento privado');
  const html = await page.locator('main').innerHTML();
  expect(html).not.toMatch(/supabase\.co|storage\/v1|token=|sign\//);
  // Campo de documento exige arquivo vinculado.
  await page.getByRole('button', { name: 'Preencher Certidões negativas' }).click();
  await expect(page.getByRole('dialog').getByLabel('Arquivo vinculado')).toHaveAttribute('required', '');
});

test('Passport preenche a RFQ de forma visível, sinaliza desatualizado e envia o snapshot', async ({ page }) => {
  const state = await mockPassport(page);
  await page.goto('/finance/new-rfq.html');
  const form = page.locator('#rfq-form');
  await form.getByLabel('Título da solicitação').fill('Capital de giro com Passport');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.passport-callout')).toContainText('vieram do Financial Passport');
  await expect(form.getByLabel('Faturamento anual (R$)')).toHaveValue('182000000');
  await expect(form.getByLabel('Setor')).toHaveValue('Alimentos');
  await expect(form.locator('.field-passport').filter({ hasText: 'Faturamento anual' })).toContainText('Do Financial Passport (Documento interno');
  await form.getByLabel('Valor desejado (R$)').fill('500000');
  await form.getByLabel('Finalidade').selectOption('capital_de_giro');
  await form.getByLabel('Prazo desejado (meses)').fill('24');
  await page.getByRole('button', { name: 'Continuar' }).click();
  // A pessoa revisa e altera um campo antes de criar.
  await expect(form.getByLabel('Garantias disponíveis')).toHaveValue('Recebíveis de cartão e duplicatas');
  await form.getByLabel('Garantias disponíveis').fill('Somente recebíveis de cartão');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.passport-review')).toContainText('Faturamento anual (R$): mantido como no Passport');
  await expect(page.locator('.passport-review')).toContainText('Garantias disponíveis: alterado nesta solicitação');
  await page.getByRole('button', { name: 'Criar solicitação' }).click();
  await expect.poll(() => state.creates.length).toBe(1);
  expect(state.creates[0].passport_fields).toEqual([
    { demand_key: 'annual_revenue', field_key: 'receita_anual' },
    { demand_key: 'sector', field_key: 'sector' },
    { demand_key: 'collateral', field_key: 'garantias_disponiveis' }
  ]);
  expect(state.creates[0].demand.collateral).toBe('Somente recebíveis de cartão');
});

test('adquirência sinaliza campo desatualizado vindo do Passport', async ({ page }) => {
  await mockPassport(page);
  await page.goto('/finance/new-rfq.html');
  const form = page.locator('#rfq-form');
  await form.getByText('Adquirência e meios de pagamento').click();
  await form.getByLabel('Título da solicitação').fill('Adquirência com Passport');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('.passport-callout')).toContainText('desatualizado no Passport');
  await expect(form.locator('.field-passport[data-freshness="stale"]')).toContainText('confirme o valor antes de enviar');
  await noOverflow(page, 'assistente com Passport');
});

test('RFQ mostra a fotografia do Passport usada na criação', async ({ page }) => {
  await mockPassport(page, { snapshot: [
    { field_key: 'receita_anual', demand_key: 'annual_revenue', field_value: '182000000', source: 'documento_interno', profile_updated_at: daysAgo(20), freshness: 'current', used_as_is: true, captured_at: daysAgo(3) },
    { field_key: 'garantias_disponiveis', demand_key: 'collateral', field_value: 'Recebíveis de cartão', source: 'declarado_pela_empresa', profile_updated_at: daysAgo(300), freshness: 'stale', used_as_is: false, captured_at: daysAgo(3) }
  ] });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  const card = page.locator('#passport');
  await expect(card).toContainText('Mudanças posteriores no Passport não alteram este processo');
  await expect(card).toContainText('R$ 182.000.000');
  await expect(card).toContainText('usado sem alteração');
  await expect(card).toContainText('desatualizado na criação · alterado na solicitação');
});

test('viewer lê o Passport, mas não edita', async ({ page }) => {
  await mockPassport(page, { role: 'viewer' });
  await page.goto('/finance/passport.html');
  await expect(page.locator('#field-receita_anual')).toContainText('R$ 182.000.000');
  await expect(page.getByRole('button', { name: /^(Editar|Preencher|Confirmar)/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Histórico de/ }).first()).toBeVisible();
});

test('organização de provedor não recebe o Passport', async ({ page }) => {
  const state = await mockPassport(page, { kind: 'PROVIDER' });
  await page.goto('/provider/index.html');
  await expect(page.getByRole('navigation', { name: 'Navegacao do portal' }).getByRole('link', { name: 'Passport' })).toHaveCount(0);
  await page.goto('/finance/passport.html');
  await expect(page.locator('#view')).not.toContainText('Faturamento anual');
  expect(state.writes).toEqual([]);
});

test('Passport por teclado: cobertura leva ao contexto e edição abre e fecha com foco de volta', async ({ page }) => {
  await mockPassport(page);
  await page.goto('/finance/passport.html');
  const edit = page.getByRole('button', { name: 'Editar Faturamento anual (R$)' });
  await edit.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('Valor')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(edit).toBeFocused();
  await page.getByRole('link', { name: /Documentação: 1 de 4/ }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#passport-documentacao$/);
});

for (const width of [320, 360, 375, 390, 768, 1024, 1440]) {
  test(`Passport cabe em ${width}px sem overflow horizontal`, async ({ page }, testInfo) => {
    // Larguras de celular nos projetos móveis; as demais no desktop.
    const mobileProject = /mobile/.test(testInfo.project.name);
    test.skip(mobileProject !== (width < 600), 'largura coberta pelo outro tipo de projeto');
    await page.setViewportSize({ width, height: 860 });
    await mockPassport(page);
    await page.goto('/finance/passport.html');
    await expect(page.locator('#field-receita_anual')).toBeVisible();
    await noOverflow(page, `Passport ${width}px`);
    await page.getByRole('button', { name: 'Editar Faturamento anual (R$)' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await noOverflow(page, `edição do Passport ${width}px`);
  });
}

test('Passport mantém identidade e saldos no escopo da entidade selecionada', async ({page}) => {
 const A='00000000-0000-4000-8000-000000000e01',B='00000000-0000-4000-8000-000000000e02';
 const state=await mockPassport(page,{entities:[{id:A,legal_name:'Entity A',kind:'legal_entity',status:'active'},{id:B,legal_name:'Entity B',kind:'legal_entity',status:'active'}]});
 state.rows.push({field_key:'receita_anual',field_value:'100',legal_entity_id:A,source:'extrato',updated_at:daysAgo(1)},{field_key:'receita_anual',field_value:'200',legal_entity_id:B,source:'extrato',updated_at:daysAgo(1)});
 await page.goto(`/finance/passport.html?legal_entity_id=${A}`);
 await expect(page.getByRole('combobox',{name:'Escopo do Passport'})).toHaveValue(A);
 await expect(page.locator('#field-legal_name')).toContainText('Entity A');
 await expect(page.locator('#field-receita_anual .passport-value')).toContainText('100');
 await expect(page.locator('#field-receita_anual')).toContainText('Entidade legal');
 await page.getByRole('combobox',{name:'Escopo do Passport'}).selectOption(B);
 await expect(page.locator('#field-legal_name')).toContainText('Entity B');
 await expect(page.locator('#field-receita_anual .passport-value')).toContainText('200');
 await noOverflow(page,'Passport entity scope');
});

import { test, expect } from '@playwright/test';
// Arandu Copilot (interface sobre financial-copilot-v1).
// APIs SIMULADAS: /api/finance/** é interceptado; nenhum modelo de IA real é
// chamado. A resposta do mock segue o contrato (answer, sources, prepared_actions).
// Execução com provedor externo (Vercel AI Gateway) segue NÃO VERIFICADA.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const P_ATLAS = '00000000-0000-4000-8000-0000000000b1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const CONTRACT = { id: C1, organization_id: ORG, provider_id: P_ATLAS, provider_name: 'Atlas Bank', product: 'credit', title: 'Capital de giro 2025', status: 'active', origin: 'imported', starts_on: day(-300), ends_on: day(60), renewal_notice_days: 30, current_version: 2, legal_entity_id: null, owner_id: 'u1' };
const OVERVIEW = { ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], providers: [{ id: P_ATLAS, name: 'Atlas Bank', kind: 'bank', status: 'active' }], contracts: [CONTRACT], rfqs: [], tasks: [] };
const RELATIONSHIP = { ok: true, provider: { id: P_ATLAS, name: 'Atlas Bank' }, neutrality: 'Fatos.', contracts: [CONTRACT], tasks: [], facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [],
  metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 1, open_issues: 0, median_resolution_days: null, definitions: {} } };
const ANSWER = { ok: true, api_version: 'financial-copilot-v1', state: 'completed', answer: 'O contrato Capital de giro 2025 com o Atlas Bank vence em 60 dias; o aviso prévio registrado é de 30 dias.',
  sources: [{ source_id: `contract:${C1}`, object_type: 'contracts', id: C1, label: 'Capital de giro 2025', version: 2, updated_at: new Date().toISOString(), href: `/finance/contracts.html?id=${C1}` }],
  prepared_actions: [], provider: 'vercel_gateway', model: 'simulado', persistence: 'not_persisted' };
const PREPARED = { ...ANSWER, answer: 'Atividade preparada para sua revisão e confirmação.', sources: [],
  prepared_actions: [{ type: 'create_crm_activity', method: 'POST', endpoint: '/api/finance/copilot/confirm', confirmation_required: true,
    payload: { organization_id: ORG, legal_entity_id: null, request_key: '00000000-0000-4000-8000-00000000f001', values: { kind: 'follow_up', subject: 'Follow-up sobre renovação', status: 'planned', due_on: day(7), source_reference: 'Pedido ao Copilot', related_type: 'provider', related_id: P_ATLAS } },
    notice: 'Prévia validada na forma. Vínculos, responsável e estado serão novamente autorizados pelo banco na confirmação.' }] };

async function setup(page, { ask = () => ({ status: 200, body: ANSWER }), confirm = () => ({ status: 201, body: { ok: true, id: 'x', version: 1, replayed: false } }), delay = 0 } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const path = new URL(req.url()).pathname.replace('/api/finance/', '');
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (req.method() !== 'GET') calls.push({ path, body: JSON.parse(req.postData() || '{}') });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json(OVERVIEW);
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'admin', display_name: 'Paula Nogueira' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: true });
    if (path === 'provider-relationship') return json(RELATIONSHIP);
    if (path === 'copilot/ask') { if (delay) await new Promise((r) => setTimeout(r, delay)); const out = ask(calls.at(-1).body); return json(out.body, out.status); }
    if (path === 'copilot/confirm') { const out = confirm(calls.at(-1).body); return json(out.body, out.status); }
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('pergunta global com fonte navegável, sem contexto de página', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/dashboard.html');
  await page.locator('#copilot-trigger').click();
  const panel = page.getByRole('dialog', { name: 'Copilot financeiro' });
  await expect(panel).toContainText('Contexto: toda a organização (Grupo Vitta)');
  await panel.getByRole('button', { name: 'Quais contratos vencem nos próximos 90 dias?' }).click();
  await panel.getByRole('button', { name: 'Perguntar' }).click();
  await expect(panel.locator('.copilot-answer')).toContainText('vence em 60 dias');
  await expect(panel.locator('.copilot-a')).toContainText('texto gerado por IA a partir das fontes abaixo');
  expect(calls[0]).toEqual({ path: 'copilot/ask', body: { organization_id: ORG, question: 'Quais contratos vencem nos próximos 90 dias?' } });
  await expect(panel.getByRole('link', { name: 'Capital de giro 2025' })).toHaveAttribute('href', new RegExp(`contracts\\.html\\?abrir=contrato#contract-${C1}`));
  await expect(panel.locator('.copilot-sources')).toContainText('Contrato · versão 2');
  for (const banned of [/[0-9a-f]{8}-[0-9a-f]{4}-/, /undefined/, /\bnull\b/, /vercel_gateway/]) await expect(panel).not.toContainText(banned);
});

test('contexto da instituição, atividade preparada, revisão e confirmação idempotente', async ({ page }) => {
  const calls = await setup(page, { ask: () => ({ status: 200, body: PREPARED }) });
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  await page.getByRole('dialog', { name: 'Atlas Bank' }).getByRole('button', { name: 'Resumir com o Copilot' }).click();
  const panel = page.getByRole('dialog', { name: 'Copilot financeiro' });
  await expect(panel).toContainText('Contexto: a instituição Atlas Bank');
  await panel.getByLabel('Sua pergunta').fill('Prepare um follow-up com esta instituição para a próxima semana.');
  await panel.getByRole('button', { name: 'Perguntar' }).click();
  const action = panel.locator('.copilot-action');
  await expect(action).toContainText('Atividade preparada — ainda não gravada');
  await expect(action).toContainText('Follow-up sobre renovação');
  expect(calls[0].body.question).toContain('Sobre a instituição "Atlas Bank"');
  expect(calls.filter((c) => c.path === 'copilot/confirm')).toHaveLength(0);
  await action.getByRole('button', { name: 'Revisar e confirmar' }).click();
  const review = page.getByRole('dialog', { name: 'Revisar atividade preparada' });
  await review.getByLabel(/^Assunto/).fill('Follow-up: minuta de renovação');
  await review.getByRole('button', { name: 'Confirmar e gravar' }).click();
  await expect(page.getByText('Atividade registrada.')).toBeVisible();
  const confirm = calls.find((c) => c.path === 'copilot/confirm');
  expect(confirm.body).toMatchObject({ organization_id: ORG, confirmation: true, request_key: '00000000-0000-4000-8000-00000000f001', values: { subject: 'Follow-up: minuta de renovação', kind: 'follow_up', status: 'planned', related_type: 'provider', related_id: P_ATLAS } });
});

test('confirmação incerta repete a mesma chave; recusa do banco não finge sucesso', async ({ page }) => {
  let n = 0;
  const calls = await setup(page, { ask: () => ({ status: 200, body: PREPARED }), confirm: () => (++n === 1 ? { status: 502, body: { ok: false } } : { status: 200, body: { ok: true, replayed: true } }) });
  await page.goto('/finance/dashboard.html');
  await page.locator('#copilot-trigger').click();
  const panel = page.getByRole('dialog', { name: 'Copilot financeiro' });
  await panel.getByLabel('Sua pergunta').fill('Prepare um follow-up com o Atlas Bank');
  await panel.getByRole('button', { name: 'Perguntar' }).click();
  await panel.getByRole('button', { name: 'Revisar e confirmar' }).click();
  const review = page.getByRole('dialog', { name: 'Revisar atividade preparada' });
  await review.getByRole('button', { name: 'Confirmar e gravar' }).click();
  await expect(review.getByRole('alert')).toContainText('Pode ter sido gravada');
  await review.getByRole('button', { name: 'Repetir a mesma confirmação' }).click();
  await expect(page.getByText('Esta atividade já tinha sido registrada; nada foi duplicado.')).toBeVisible();
  const keys = calls.filter((c) => c.path === 'copilot/confirm').map((c) => c.body.request_key);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test('sem modelo configurado: diz isso e oferece consultas guiadas determinísticas', async ({ page }) => {
  await setup(page, { ask: () => ({ status: 503, body: { ok: false, error: 'x', code: 'copilot_not_configured' } }) });
  await page.goto('/finance/dashboard.html');
  await page.locator('#copilot-trigger').click();
  const panel = page.getByRole('dialog', { name: 'Copilot financeiro' });
  await panel.getByLabel('Sua pergunta').fill('Quais contratos vencem?');
  await panel.getByRole('button', { name: 'Perguntar' }).click();
  await expect(panel.getByRole('alert')).toContainText('Copilot generativo não configurado neste ambiente');
  await expect(panel.locator('.copilot-answer')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Abrir consultas guiadas' }).click();
  await expect(page.getByRole('dialog', { name: 'Consultas do Arandu' })).toContainText('Não há modelo de IA generativa configurado');
});

test('falha da ferramenta permite tentar de novo; limite e cancelamento são claros', async ({ page }) => {
  let n = 0;
  await setup(page, { ask: () => (++n === 1 ? { status: 503, body: { ok: false, code: 'copilot_tool_failed' } } : n === 2 ? { status: 200, body: ANSWER } : { status: 429, body: { ok: false, code: 'rate_limited' } }) });
  await page.goto('/finance/dashboard.html');
  await page.locator('#copilot-trigger').click();
  const panel = page.getByRole('dialog', { name: 'Copilot financeiro' });
  await panel.getByLabel('Sua pergunta').fill('Quais contratos vencem?');
  await panel.getByRole('button', { name: 'Perguntar' }).click();
  await expect(panel.getByRole('alert')).toContainText('Nenhuma ação foi executada e nenhuma resposta foi inventada');
  await panel.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(panel.locator('.copilot-answer')).toContainText('vence em 60 dias');
  await panel.getByLabel('Sua pergunta').fill('Outra pergunta');
  await panel.getByRole('button', { name: 'Perguntar' }).click();
  await expect(panel.getByRole('alert')).toContainText('Limite de perguntas atingido');
});

test('cancelar descarta a resposta pendente', async ({ page }) => {
  await setup(page, { delay: 1500 });
  await page.goto('/finance/dashboard.html');
  await page.locator('#copilot-trigger').click();
  const panel = page.getByRole('dialog', { name: 'Copilot financeiro' });
  await panel.getByLabel('Sua pergunta').fill('Quais contratos vencem?');
  await panel.getByRole('button', { name: 'Perguntar' }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'Consultando' })).toBeVisible();
  await panel.getByRole('button', { name: 'Cancelar' }).click();
  await expect(panel).toContainText('Pergunta cancelada nesta tela');
  await page.waitForTimeout(1800);
  await expect(panel.locator('.copilot-answer')).toHaveCount(0);
});

test('contrato oferece perguntas contextuais ao Copilot', async ({ page }) => {
  const calls = await setup(page);
  await page.route('**/api/finance/contract-detail**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, contract: CONTRACT, effective: {}, versions: [], amendments: [], milestones: [], children: [], documents: [], events: [] }) }));
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${C1}`);
  const dialog = page.getByRole('dialog', { name: 'Capital de giro 2025' });
  await dialog.getByRole('button', { name: 'Explicar condições' }).click();
  const panel = page.getByRole('dialog', { name: 'Copilot financeiro' });
  await expect(panel).toContainText('Contexto: o contrato Capital de giro 2025');
  await panel.getByRole('button', { name: 'Perguntar' }).click();
  await expect(panel.locator('.copilot-answer')).toBeVisible();
  expect(calls.find((c) => c.path === 'copilot/ask').body.question).toMatch(/^Sobre o contrato "Capital de giro 2025"/);
});

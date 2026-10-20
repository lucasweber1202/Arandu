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

async function mockProvider(page, { patch = () => 200, assignment = ASSIGNMENT, pendingInvites = null } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/finance/', '');
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: PROVIDER, kind: 'PROVIDER', legal_name: 'Banco Atlas S.A.' }] });
    if (path === 'assignments') return json({ ok: true, rows: [assignment], ...(pendingInvites ? { pending_invites: pendingInvites } : {}) });
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

test('prazo de resposta vencido com coleta aberta: o provedor é avisado antes de enviar', async ({ page }) => {
  await mockProvider(page, { assignment: { ...ASSIGNMENT, response_deadline: '2026-01-05' } });
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  await expect(page.locator('.proposal-status')).toContainText('O prazo de resposta já passou.');
  await expect(page.locator('.proposal-status')).toContainText('registrada como enviada após o prazo');
});

test('conflito de rascunho: o aviso com "Recarregar" é anunciado como alerta e não some sozinho', async ({ page }) => {
  await page.clock.install();
  await mockProvider(page, { patch: () => 409 });
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  await page.getByLabel('Valor ofertado (R$)').fill('920000');
  await page.clock.runFor(1500);
  const alert = page.getByRole('alert').filter({ hasText: 'Este rascunho mudou em outra aba' });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole('button', { name: 'Recarregar' })).toBeVisible();
  await page.clock.runFor(30_000);
  await expect(alert.getByRole('button', { name: 'Recarregar' })).toBeVisible();
});

test('histórico do provedor: condições de cada versão enviada, mudanças legíveis e ausência explícita', async ({ page }) => {
  const v1 = { offered_amount: 1000000, interest_rate_month: 1.29, index: 'pre', term_months: 24, collateral_required: 'Aval dos sócios' };
  const v2 = { offered_amount: 1000000, interest_rate_month: 1.24, index: 'cdi', term_months: 24 };
  await mockProvider(page, { assignment: { ...ASSIGNMENT, version: 2, terms: v2, rfq_revision: 2,
    history: [
      { version: 2, submitted_at: '2026-10-10T14:00:00Z', note: 'Ajuste após a revisão 2', rfq_revision: 2, terms: v2 },
      { version: 1, submitted_at: '2026-10-01T14:00:00Z', note: null, rfq_revision: 1, terms: v1 }
    ] } });
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  const history = page.locator('.version-history');
  const latest = history.locator('#versao-2');
  await expect(latest).toContainText('responde à rev. 2');
  await expect(latest).toContainText('Nota: Ajuste após a revisão 2');
  // Diferenças pela regra da comparação, com unidade e indexador por extenso.
  const changes = latest.getByRole('list', { name: 'Mudanças desde a versão 1' });
  await expect(changes).toContainText('Taxa (% a.m.): 1,29% → 1,24%');
  await expect(changes).toContainText('Indexador: Pré-fixado → CDI');
  await expect(changes).toContainText('Garantias exigidas: Aval dos sócios → não informado');
  await expect(changes).not.toContainText('Valor ofertado');
  // Condições daquela versão (snapshot), ausência explícita, sem JSON nem código.
  await history.locator('#versao-1').getByText('Condições desta versão').click();
  const terms = history.locator('#versao-1 .version-terms');
  await expect(terms).toContainText('1,29%');
  await expect(terms).toContainText('Pré-fixado');
  await expect(terms).toContainText('Não informado');
  await expect(history).not.toContainText(/\{|\bpre\b|\bcdi\b|null|undefined|NaN/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

// Envio da proposta pelo portal, no formato real da API (POST proposals → versão).
// Nada aparece como enviado antes da resposta confirmada; a recarga mostra a versão.
async function sendServer(page, { fail = null } = {}) {
  const state = { assignment: { ...ASSIGNMENT, history: [] }, posts: [] };
  await mockProvider(page, { assignment: state.assignment });
  await page.route('**/api/finance/assignments**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [state.assignment] }) }));
  await page.route('**/api/finance/proposals', async (route) => {
    const body = route.request().postDataJSON();
    state.posts.push(body);
    if (fail) return route.fulfill({ status: fail.status, contentType: 'application/json', body: JSON.stringify({ ok: false, code: fail.code, error: fail.error }) });
    const version = (state.assignment.version || 0) + 1;
    state.assignment = { ...state.assignment, version, terms: body.terms, submitted_rfq_revision: 1,
      history: [{ version, submitted_at: '2026-10-17T15:00:00Z', note: body.note, rfq_revision: 1, terms: body.terms }, ...state.assignment.history] };
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, version }) });
  });
  return state;
}

test('envio da proposta: obrigatórios validados, valor por extenso, resumo antes de enviar e versão após recarregar', async ({ page }) => {
  const server = await sendServer(page);
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  const form = page.locator('#proposal-form');
  await form.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  await expect(form.getByText('Obrigatório para enviar.').first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(server.posts).toHaveLength(0);
  await form.getByLabel('Produto ofertado').fill('Giro safra');
  await form.getByLabel('Valor ofertado (R$)').fill('5000000');
  // Leitura por extenso evita erro de casa decimal; associada ao campo para leitor de tela.
  const amount = form.getByLabel('Valor ofertado (R$)');
  await expect(form.locator('.field-readout').first()).toHaveText('= R$ 5.000.000');
  await expect(amount).toHaveAttribute('aria-describedby', /-readout/);
  await form.getByLabel('Taxa (% a.m.)').fill('1.29');
  await form.getByLabel('Prazo (meses)').fill('12');
  await expect(form.locator('.completion')).toContainText('Campos obrigatórios completos');
  await form.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  const confirm = page.getByRole('dialog', { name: 'Enviar proposta?' });
  await expect(confirm).toContainText('R$ 5.000.000');
  await expect(confirm).toContainText('1,29%');
  // Cancelar não envia nada.
  await confirm.getByRole('button', { name: 'Cancelar' }).click();
  expect(server.posts).toHaveLength(0);
  await form.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  await page.getByRole('dialog', { name: 'Enviar proposta?' }).getByRole('button', { name: 'Enviar proposta' }).click();
  await expect(page.getByText('Proposta enviada como versão 1.')).toBeVisible();
  await expect(page.locator('.proposal-status')).toContainText('Proposta enviada · versão 1');
  expect(server.posts).toHaveLength(1);
  expect(server.posts[0]).toMatchObject({ proposal_id: PROPOSAL, terms: { offered_amount: '5000000', interest_rate_month: '1.29', term_months: '12', product_name: 'Giro safra' } });
  await expect(page.locator('#versao-1')).toBeVisible();
});

test('envio recusado pelo servidor: nada aparece como enviado, botão volta e o motivo é dito', async ({ page }) => {
  const server = await sendServer(page, { fail: { status: 409, code: 'rfq_not_collecting', error: 'A coleta desta solicitação foi encerrada. A proposta não foi enviada.' } });
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  const form = page.locator('#proposal-form');
  await form.getByLabel('Produto ofertado').fill('Giro safra');
  await form.getByLabel('Valor ofertado (R$)').fill('5000000');
  await form.getByLabel('Taxa (% a.m.)').fill('1.29');
  await form.getByLabel('Prazo (meses)').fill('12');
  await form.getByRole('button', { name: 'Revisar e enviar proposta' }).click();
  await page.getByRole('dialog', { name: 'Enviar proposta?' }).getByRole('button', { name: 'Enviar proposta' }).click();
  await expect(page.getByText('A coleta desta solicitação foi encerrada. A proposta não foi enviada.')).toBeVisible();
  expect(server.posts).toHaveLength(1);
  await expect(page.locator('.proposal-status')).toContainText('Rascunho — ainda não enviado.');
  await expect(form.getByRole('button', { name: 'Revisar e enviar proposta' })).toBeEnabled();
  await expect(form.getByLabel('Valor ofertado (R$)')).toHaveValue('5000000');
});

test('link de proposta de outra instituição: "Proposta não encontrada", sem dado da solicitação', async ({ page }) => {
  await mockProvider(page);
  await page.goto('/provider/proposal.html?proposal=00000000-0000-4000-8000-0000000000ff');
  await expect(page.locator('.empty-title')).toHaveText('Proposta não encontrada');
  await expect(page.locator('main')).toContainText('Este link não pertence à sua instituição');
  await expect(page.locator('main')).not.toContainText('Capital de giro 2027');
  await expect(page.locator('#proposal-form')).toHaveCount(0);
});

test('comprador sem nome na resposta: o portal não inventa "Empresa"', async ({ page }) => {
  const { buyer_name: _omitted, ...withoutBuyer } = ASSIGNMENT;
  await mockProvider(page, { assignment: withoutBuyer });
  await page.goto('/provider/index.html');
  await expect(page.locator('#provider-status')).toContainText('Responda: Capital de giro 2027');
  await expect(page.locator('#provider-status .next-hero-text')).toHaveText(/^Prazo /);
});

test('convite sem nome do comprador: o portal mostra a solicitação, sem "undefined" nem empresa inventada', async ({ page }) => {
  await mockProvider(page, { pendingInvites: [{ id: 'i1', title: 'Antecipação de recebíveis 2027', product: 'credit', response_deadline: '2020-01-01', created_at: '2026-10-01T10:00:00Z', demo_token: 't' }] });
  await page.goto('/provider/index.html');
  const hero = page.locator('#provider-status');
  await expect(hero).toContainText('Aceite o convite: Antecipação de recebíveis 2027');
  const card = page.locator('#convites');
  await expect(card).toContainText('Antecipação de recebíveis 2027');
  await expect(page.locator('#view')).not.toContainText('undefined');
});

test('nome longo do comprador (buyer_name da #215) cabe no celular estreito e aparece uma vez por cartão', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const buyer = 'Companhia Brasileira de Alimentos e Bebidas Vegetais do Centro-Oeste Participações S.A.';
  await mockProvider(page, { assignment: { ...ASSIGNMENT, buyer_name: buyer } });
  await page.goto('/provider/index.html');
  await expect(page.locator('#provider-status')).toContainText(buyer);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  for (const node of await page.locator('.opportunity-kicker').all()) {
    expect((await node.innerText()).split(buyer).length - 1).toBeLessThanOrEqual(1);
  }
});

test('proposta: quem pediu aparece no topo e no resumo do celular; sem nome, nada é inventado', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const buyer = 'Companhia Brasileira de Alimentos e Bebidas Vegetais do Centro-Oeste Participações S.A.';
  await mockProvider(page, { assignment: { ...ASSIGNMENT, buyer_name: buyer } });
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  await expect(page.locator('.meta-buyer')).toHaveText(`Solicitado por ${buyer}`);
  await expect(page.locator('.demand-peek-title')).toHaveText(`O que ${buyer} pediu`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  // A barra de envio no celular não cobre o formulário: no máximo 1/5 da tela.
  const bar = await page.locator('.proposal-bar').boundingBox();
  if (page.viewportSize().width < 760) expect(bar.height).toBeLessThanOrEqual(720 / 5 + 8);

  const { buyer_name: _omitted, ...withoutBuyer } = ASSIGNMENT;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockProvider(page, { assignment: withoutBuyer });
  await page.goto(`/provider/proposal.html?proposal=${PROPOSAL}`);
  await expect(page.locator('.meta-buyer')).toHaveCount(0);
  await expect(page.locator('.demand-peek-title')).toHaveText('O que a empresa pediu');
});

test('convite em destaque: uma só ação principal na tela; o cartão do convite não compete com ela', async ({ page }) => {
  await mockProvider(page, { pendingInvites: [{ id: 'i1', title: 'Antecipação de recebíveis 2027', product: 'credit', response_deadline: '2020-01-01', created_at: '2026-10-01T10:00:00Z', demo_token: 't' }] });
  await page.goto('/provider/index.html');
  await expect(page.locator('#provider-status .btn-primary')).toHaveText(/Aceitar convite/);
  await expect(page.locator('#view .btn-primary')).toHaveCount(1);
  await expect(page.locator('#convites').getByRole('button', { name: 'Aceitar' })).toBeVisible();
});

test('caixa da instituição: rascunho separado do que falta responder e fronteira de visibilidade explícita', async ({ page }) => {
  await mockProvider(page, { assignment: { ...ASSIGNMENT, has_draft: true } });
  await page.goto('/provider/index.html');
  await expect(page.getByRole('heading', { name: 'Rascunhos (1)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Para responder/ })).toHaveCount(0);
  await expect(page.getByRole('note')).toContainText('apenas as suas propostas');
  await expect(page.getByRole('note')).toContainText('nunca aparecem aqui');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

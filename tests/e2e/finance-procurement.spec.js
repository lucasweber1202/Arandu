import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { buildComparison, applyUserWeights } from '../../lib/finance/comparison.mjs';

// Jornadas do Arandu Financial Procurement no build publicado (sem
// demonstração). Sem sessão, o portal pede login; com sessão simulada por
// `page.route`, verificamos o transporte HTTP real da interface: rascunho no
// servidor, busca autorizada e comparação. O fluxo com dados reais é coberto
// por `npm run test:database` (Postgres real) e pelas suítes de API.

const COMPANY_PAGES = [
  ['/finance/index.html', 'Painel'],
  ['/finance/dashboard.html', 'Painel'],
  ['/finance/rfqs.html', 'Solicitações'],
  ['/finance/new-rfq.html', 'Nova solicitação'],
  ['/finance/rfq.html', 'Detalhe da solicitação'],
  ['/finance/approvals.html', 'Aprovações'],
  ['/finance/providers.html', 'Instituições'],
  ['/finance/passport.html', 'Financial Passport'],
  ['/finance/proposals.html', 'Propostas recebidas'],
  ['/finance/contracts.html', 'Contratos e renovações'],
  ['/finance/portfolio.html', 'Dívida, limites e garantias'],
  ['/finance/tasks.html', 'Tarefas'],
  ['/finance/notifications.html', 'Notificações'],
  ['/finance/settings.html', 'Configurações'],
  ['/finance/boundaries.html', 'Limites do produto'],
  ['/finance/ops.html', 'Console operacional']
];
const PROVIDER_PAGES = [
  ['/provider/index.html', 'Portal da instituição'],
  ['/provider/invite.html', 'Aceitar convite'],
  ['/provider/rfqs.html', 'Oportunidades'],
  ['/provider/proposal.html', 'Responder proposta']
];

const ORG = '00000000-0000-4000-8000-0000000000a1';
const RFQ = '00000000-0000-4000-8000-0000000000b1';
function overview(extra = {}) {
  return {
    ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Empresa de teste' }, profile: [], providers: [], contracts: [], tasks: [],
    rfqs: [{ id: RFQ, title: 'Crédito expansão', product: 'credit', status: 'comparing', revision: 2, response_deadline: '2027-10-01',
      demand: { amount: 500000, purpose: 'expansao', term_months: 24 }, invites_count: 2, owner_id: 'u1', created_at: '2026-09-01T10:00:00Z',
      proposals: [
        { id: 'p1', provider_id: 'x1', provider_name: 'Banco Um', status: 'submitted', version: 1, rfq_revision: 2, submitted_at: '2026-09-10T10:00:00Z',
          terms: { index: 'pre', offered_amount: 500000, interest_rate_month: 1.4, term_months: 24, cet_year: 19 } },
        { id: 'p2', provider_id: 'x2', provider_name: 'Banco Dois', status: 'submitted', version: 1, rfq_revision: 1, submitted_at: '2026-09-09T10:00:00Z',
          terms: { index: 'pre', offered_amount: 450000, interest_rate_month: 1.2, term_months: 24 } }
      ] }],
    ...extra
  };
}
/** Sessão simulada: responde as rotas que a interface usa. */
async function mockSession(page, { organizations = [{ id: ORG, kind: 'BUYER', legal_name: 'Empresa de teste' }], data = overview(), editor = {}, onSearch = null, onDocuments = null, viewerRole = 'finance_manager' } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    calls.push(`${request.method()} ${path}`);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === 'organizations') return json({ ok: true, rows: organizations });
    if (path === 'overview') return json(data);
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: viewerRole, display_name: 'Paula Nogueira', title: 'Gerente Financeira' }, { user_id: 'u2', role: 'analyst', display_name: 'Rui Tavares', title: 'Analista de Crédito' }], viewer_id: 'u1' });
    if (path.startsWith('private-documents') || path.startsWith('ops/')) return onDocuments ? onDocuments(path, request, json) : json({ ok: true, rows: [] });
    if (path === 'search') { onSearch?.(url); return json({ ok: true, rows: [{ kind: 'rfq', id: RFQ, title: 'Crédito expansão', detail: 'comparing', href: `/finance/rfq.html?id=${RFQ}` }] }); }
    if (path === 'rfq-editor' && request.method() === 'GET') return json({ ok: true, draft: editor.draft || null });
    if (path === 'rfq-editor' && request.method() === 'PATCH') return editor.patchStatus ? json({ ok: false, error: 'Esta solicitação foi alterada em outra aba.' }, editor.patchStatus) : json({ ok: true, revision: (editor.revision = (editor.revision || 0) + 1), updated_at: new Date().toISOString() });
    if (['approvals', 'notifications', 'decisions', 'events', 'comments', 'rfq-revisions', 'tasks'].includes(path)) return json({ ok: true, rows: [] });
    if (path === 'approval-policy') return json({ ok: true, required_for_decision: false });
    if (path === 'approval-policies/preview') return json({ ok: true, evaluation: { approval_required: false } });
    if (path === 'comparison') { const rfq = data.rfqs.find(row => row.id === request.postDataJSON().rfq_id); return json({ ok: true, comparison: buildComparison(rfq.product, rfq.proposals, rfq.demand, { revision: rfq.revision }), weighted: applyUserWeights(rfq.product, rfq.proposals, request.postDataJSON().weights) }); }
    if (path === 'signals') return json({ ok: true });
    return json({ ok: false }, 404);
  });
  return calls;
}

test('capturas reproduzíveis das superfícies financeiras', async ({ page }, testInfo) => {
  if (!['chromium-desktop', 'mobile-chrome'].includes(testInfo.project.name)) test.skip();
  const folder = join(process.cwd(), 'reports', 'financial-visual', testInfo.project.name);
  await mkdir(folder, { recursive: true });
  for (const [name, path] of [
    ['home', '/'], ['login', '/login.html'], ['signup', '/cadastro.html'],
    ['dashboard', '/finance/dashboard.html'], ['rfqs', '/finance/rfqs.html'], ['rfq', '/finance/rfq.html'],
    ['contracts', '/finance/contracts.html'], ['provider', '/provider/index.html'], ['provider-invite', '/provider/invite.html']
  ]) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: join(folder, name + '.png'), fullPage: true });
  }
});

test('portais da empresa e do provedor abrem, são acessíveis e cabem na viewport', async ({ page }) => {
  for (const [path, heading] of [...COMPANY_PAGES, ...PROVIDER_PAGES]) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    await expect(page.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute('href', '#main');
    await expect(page.locator('#view [aria-busy=true], #view .loading-state')).toHaveCount(0);
    const unlabeled = await page.locator('input:not([type=hidden]),select,textarea')
      .evaluateAll((nodes) => nodes.filter((node) => !node.getAttribute('aria-label') && !node.labels?.length).map((node) => node.outerHTML));
    expect(unlabeled, `controles sem rótulo em ${path}`).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `overflow horizontal em ${path}`).toBeLessThanOrEqual(1);
    if (path === '/finance/boundaries.html') await expect(page.locator('main')).toContainText('não concede crédito');
    else await expect(page.getByRole('link', { name: 'Limites do produto' }).first()).toBeAttached();
  }
});

test('página inicial, login e cadastro falam de procurement financeiro', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Contratações financeiras');
  await expect(page.locator('main')).toContainText('crédito empresarial e adquirência');
  await expect(page.locator('body')).not.toContainText(/Comprar arte|Portal do artista|Enviar portfólio/);
  // Build publicado sem demonstração: nenhum atalho para /demo.
  await expect(page.locator('[data-demo-cta]')).toHaveCount(0);
  await page.getByRole('link', { name: /Acessar plataforma/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('processo financeiro');
  await expect(page.locator('form[data-finance-auth="login"]')).toBeVisible();
  await page.getByRole('link', { name: 'Criar conta' }).click();
  await expect(page.locator('form[data-finance-auth="signup"]')).toBeVisible();
});

test('login do provedor retorna ao portal atribuído sem redirect externo', async ({ page }) => {
  await page.route('**/api/auth/login', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await page.goto('/login.html?next=%2Fprovider%2Findex.html');
  await page.getByLabel('E-mail corporativo').fill('provedor@example.invalid');
  await page.getByLabel('Senha').fill('example-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/provider\/index\.html$/);
  await page.goto('/login.html?next=https%3A%2F%2Fevil.example');
  await page.getByLabel('E-mail corporativo').fill('provedor@example.invalid');
  await page.getByLabel('Senha').fill('example-password');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/finance\/index\.html$/);
  // Link compartilhado com o id do registro volta ao registro; query fora da regra não passa.
  for (const [next, landing] of [
    [`/finance/rfq.html?id=${RFQ}`, new RegExp(`/finance/rfq\\.html\\?id=${RFQ}$`)],
    ['/finance/rfq.html?id=<script>', /\/finance\/index\.html$/],
    ['//evil.example/finance/rfq.html', /\/finance\/index\.html$/],
    ['/finance/rfq.html?id=1#x', /\/finance\/index\.html$/]
  ]) {
    await page.goto(`/login.html?next=${encodeURIComponent(next)}`);
    await page.getByLabel('E-mail corporativo').fill('provedor@example.invalid');
    await page.getByLabel('Senha').fill('example-password');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page, next).toHaveURL(landing);
  }
});

test('a navegação entre os portais funciona por links reais, sem depender de JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/finance/index.html');
  await page.getByRole('navigation', { name: 'Navegacao do portal' }).getByRole('link', { name: 'Contratos' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contratos e renovações');
  await page.getByRole('link', { name: 'Portal da instituição' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Portal da instituição');
  expect(await page.locator('#view').textContent()).toContain('depende de JavaScript');
  await context.close();
});

test('app real: sem sessão o portal exige login e nunca cai na demonstração', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/finance/dashboard.html');
  const view = page.locator('#view');
  await expect(view).toContainText('Entre para usar o portal');
  await expect(view.getByRole('link', { name: 'Entrar na conta' })).toHaveAttribute('href', '/login.html?next=%2Ffinance%2Fdashboard.html');
  await expect(view.getByRole('link', { name: /demonstração/ })).toHaveCount(0);
  await expect(page.locator('.demo-banner')).toHaveCount(0);
  // Sem sessão nada de dado aparece — nem fictício.
  await expect(view).not.toContainText(/DEMO|Acme/);
  const stored = await page.evaluate(() => Object.keys(localStorage));
  expect(stored.filter((key) => key.startsWith('arandu_demo') || key.startsWith('arandu-finance-draft'))).toEqual([]);
  expect(requests.filter((url) => /engine-|demo\//.test(url))).toEqual([]);
  expect(requests.some((url) => url.includes('/api/finance/organizations'))).toBe(true);
});

test('app real: /demo não existe no build publicado', async ({ page }) => {
  for (const path of ['/demo/index.html', '/demo/finance/dashboard.html', '/demo/provider/index.html']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test('sem sessão o portal do provedor não presume organização criada', async ({ page }) => {
  await page.goto('/provider/index.html');
  await expect(page.locator('#view')).toContainText('Entre para usar o portal');
  await expect(page.locator('#view')).not.toContainText('Organização criada');
  await page.goto('/provider/proposal.html');
  await expect(page.locator('#proposal-form')).toHaveCount(0);
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith('arandu-finance-draft-')));
  expect(keys).toEqual([]);
});

test('nenhuma página do portal promete aprovação, recomendação ou ranking', async ({ page }) => {
  const operational = [...COMPANY_PAGES, ...PROVIDER_PAGES].filter(([path]) => path !== '/finance/boundaries.html');
  for (const [path] of operational) {
    await page.goto(path);
    const text = (await page.locator('body').innerText()).toLowerCase();
    expect(text, path).not.toMatch(/recomendação do arandu|melhor banco|melhor instituição|aprovação garantida|garantimos aprovação/);
  }
});

test('a página de convite trata cada estado do token em vez de dar erro genérico', async ({ page }) => {
  await page.goto('/provider/invite.html');
  await expect(page.locator('#invite-state')).toContainText('Nenhum token no endereço');
  await page.goto('/provider/invite.html?token=nao-e-um-token');
  await expect(page.locator('#invite-state')).toContainText('não tem o formato de um convite');
  await page.goto(`/provider/invite.html?token=${'a'.repeat(64)}`);
  await expect(page.locator('#invite-state')).toContainText('Confirme a organização');
  await expect(page.getByLabel('Token do convite')).toHaveValue('a'.repeat(64));
  await expect(page.locator('#view')).toContainText('vale uma vez e expira');
});

test('a página de convite não entrega o token a analytics, ao histórico nem ao referrer', async ({ page, baseURL }) => {
  const token = 'b'.repeat(64);
  const externalRequests = [];
  page.on('request', (request) => { if (new URL(request.url()).origin !== new URL(baseURL).origin) externalRequests.push(request.url()); });
  await page.goto(`/provider/invite.html#token=${token}`);
  await expect(page.locator('#invite-state')).toContainText('Confirme a organização');
  await expect(page.getByLabel('Token do convite')).toHaveValue(token);
  expect(externalRequests, `requisições externas: ${externalRequests.join(', ')}`).toEqual([]);
  expect(await page.locator('script[src*="speed-insights"]').count()).toBe(0);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  await page.goto(`/provider/invite.html?token=${token}`);
  await expect(page.getByLabel('Token do convite')).toHaveValue(token);
  expect(page.url()).not.toContain(token);
});

test('uma conta sem organização recebe o formulário de criação, não um beco sem saída', async ({ page }) => {
  await mockSession(page, { organizations: [] });
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('#create-organization')).toContainText('Crie a organização da sua empresa');
  await expect(page.getByLabel('Razão social')).toBeVisible();
});

test('o teclado alcança a navegação e o conteúdo principal', async ({ page }) => {
  await page.goto('/finance/rfqs.html');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('Pular para o conteúdo');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('o assistente avança por etapas, valida em linha e salva o rascunho no servidor', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/new-rfq.html');
  const form = page.locator('#rfq-form');
  await expect(form.locator('fieldset[data-step="0"]')).toBeVisible();
  await expect(form.locator('fieldset[data-step="1"]')).toBeHidden();
  // O número da etapa aparece uma vez (no círculo), não "1 1. Produto".
  await expect(page.locator('.stepper-item[aria-current="step"] .stepper-index')).toHaveText('1');
  await expect(page.locator('.stepper-item[aria-current="step"] .stepper-label')).toHaveText('Produto');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(form.locator('fieldset[data-step="1"]')).toBeHidden();
  await expect(page.getByRole('alert')).toContainText('Corrija 1 campo');
  await form.getByLabel('Título da solicitação').fill('Capital de giro do teste');
  await expect(page.locator('.save-indicator').first()).toContainText(/Salvo às/);
  expect(calls.filter((call) => call === 'PATCH rfq-editor').length).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(form.locator('fieldset[data-step="1"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Voltar' })).toBeVisible();
  const stored = await page.evaluate(() => Object.keys(localStorage));
  expect(stored, 'rascunho real nunca vai ao navegador').toEqual([]);
});

test('entrada por objetivo leva ao fluxo existente e só oferece o que o papel permite', async ({ page }) => {
  await mockSession(page);
  await page.goto('/finance/dashboard.html');
  await page.getByRole('button', { name: 'Começar' }).click();
  const panel = page.getByRole('dialog', { name: 'O que você precisa fazer?' });
  await expect(panel.getByRole('heading', { name: 'Contratar' })).toBeVisible();
  await expect(panel.getByRole('link', { name: /Registrar um contrato existente/ })).toHaveAttribute('href', /contracts\.html\?acao=registrar-contrato$/);
  await panel.getByRole('link', { name: /Contratar crédito/ }).click();
  await expect(page).toHaveURL(/new-rfq\.html\?product=credit$/);
  await expect(page.locator('#product-credit')).toBeChecked();
  // Ação pedida pela URL abre o formulário do fluxo de destino e sai da URL.
  await page.goto('/finance/contracts.html?acao=registrar-contrato');
  await expect(page.getByRole('dialog', { name: 'Registrar contrato existente' })).toBeVisible();
  await expect(page).toHaveURL(/contracts\.html$/);
  // Valor fora da lista fechada não aciona nada.
  await page.goto('/finance/contracts.html?acao=logout');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('leitor não recebe ações de criação na entrada por objetivo', async ({ page }) => {
  await mockSession(page, { viewerRole: 'viewer' });
  await page.goto('/finance/dashboard.html');
  await page.getByRole('button', { name: 'Começar' }).click();
  const panel = page.getByRole('dialog', { name: 'O que você precisa fazer?' });
  await expect(panel.getByRole('link', { name: /Comparar propostas recebidas/ })).toBeVisible();
  for (const name of [/Contratar crédito/, /Avaliar adquirência/, /Registrar um contrato existente/, /Cadastrar uma instituição/, /Registrar tarifa/]) await expect(panel.getByRole('link', { name })).toHaveCount(0);
  // Sem permissão, a ação pedida pela URL não encontra botão e nada abre.
  await page.goto('/finance/contracts.html?acao=registrar-contrato');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('índice de instituições declara recorte e distingue vencimento ausente', async ({ page }) => {
  await mockSession(page, { data: overview({ providers: [{ id: 'x1', name: 'Banco Um', kind: 'bank' }], contracts: [{ id: 'c1', provider_id: 'x1', status: 'active', ends_on: null }] }) });
  await page.goto('/finance/providers.html');
  await expect(page.getByRole('note')).toContainText('Contagens e vencimentos não representam o histórico completo');
  await expect(page.getByRole('columnheader', { name: 'Contratos vigentes carregados' })).toBeVisible();
  await expect(page.locator('#provider-x1')).toContainText('Vencimento não informado');
  await expect(page.locator('#provider-x1')).not.toContainText('Sem contrato vigente');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('conflito de rascunho entre abas é explicado e para de salvar', async ({ page }) => {
  await mockSession(page, { editor: { patchStatus: 409 } });
  await page.goto('/finance/new-rfq.html');
  await page.locator('#rfq-form').getByLabel('Título da solicitação').fill('Aba antiga');
  await expect(page.locator('.conflict')).toContainText('alterado em outra aba');
  await expect(page.getByRole('button', { name: 'Carregar a versão da outra aba' })).toBeVisible();
});

test('criação sem resposta: reenviar o mesmo conteúdo reabre a RFQ registrada em vez de duplicar', async ({ page }) => {
  await mockSession(page);
  const keys = [];
  // Rota mais recente tem precedência: a primeira criação "cai" depois de gravar.
  await page.route('**/api/finance/rfqs', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    keys.push(route.request().postDataJSON().request_key);
    if (keys.length === 1) return route.abort('connectionreset');
    const replayed = keys[1] === keys[0];
    return route.fulfill({ status: replayed ? 200 : 201, contentType: 'application/json', body: JSON.stringify({ ok: true, id: RFQ, replayed, warnings: [] }) });
  });
  await page.goto('/finance/new-rfq.html');
  const form = page.locator('#rfq-form');
  await form.getByLabel('Título da solicitação').fill('Capital de giro sem resposta');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await form.getByLabel('Valor desejado (R$)').fill('500000');
  await form.getByLabel('Finalidade').selectOption('capital_de_giro');
  await form.getByLabel('Prazo desejado (meses)').fill('24');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Criar solicitação' }).click();
  await expect(page.getByText(/não foi possível confirmar se a operação foi registrada/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar solicitação' })).toBeEnabled();
  await page.getByRole('button', { name: 'Criar solicitação' }).click();
  await expect(page).toHaveURL(new RegExp(`/finance/rfq\\.html\\?id=${RFQ}&created=1`));
  expect(keys).toHaveLength(2);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
  expect(keys[1]).toBe(keys[0]);
});

test('o mix de recebimentos que não fecha 100% é avisado antes do envio', async ({ page }) => {
  await mockSession(page);
  await page.goto('/finance/new-rfq.html');
  const form = page.locator('#rfq-form');
  await form.getByText('Adquirência e meios de pagamento').click();
  await form.getByLabel('Título da solicitação').fill('Adquirência do teste');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await form.getByLabel('Faturamento mensal em cartões (R$)').fill('1200000');
  await form.getByLabel('Percentual débito (%)').fill('80');
  await form.getByLabel('Percentual crédito à vista (%)').fill('60');
  await form.getByLabel('Percentual parcelado (%)').fill('40');
  await expect(page.locator('#share-meter')).toContainText('180%');
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.locator('#rfq-review')).toContainText('180%');
  await expect(page.getByRole('button', { name: 'Criar solicitação' })).toBeDisabled();
});

test('a comparação usa tabela fixa no desktop e seletor de pares no celular', async ({ page }, testInfo) => {
  await mockSession(page);
  await page.goto(`/finance/rfq.html?id=${RFQ}#comparacao`);
  const mobile = (testInfo.project.use.viewport?.width ?? 1280) < 760;
  await expect(page.locator('#comparison-notice')).toContainText('O Arandu não recomenda instituições.');
  if (mobile) {
    await expect(page.locator('.comparison-wide')).toBeHidden();
    await expect(page.getByLabel('Primeira proposta')).toBeVisible();
    await expect(page.locator('.pair-value.best').first()).toBeVisible();
  } else {
    await expect(page.locator('.compare-mobile')).toBeHidden();
    const rate = page.locator('tr', { has: page.getByRole('rowheader', { name: /Taxa \(% a\.m\.\)/ }) });
    await expect(rate.locator('td.best')).toHaveCount(1);
    await expect(rate.locator('td.best')).toContainText('menor valor informado');
    await expect(page.locator('.matrix-flag')).toContainText('Respondeu à revisão 1');
  }
  await expect(page.locator('#view')).toContainText('não informado');
  const body = (await page.locator('body').innerText()).toLowerCase();
  expect(body).not.toMatch(/melhor proposta|recomendado pelo arandu/);
});

test('busca por teclado e duplicação da demanda preservam o contexto da empresa', async ({ page }) => {
  await mockSession(page, { onSearch: (url) => { expect(url.searchParams.get('organization_id')).toBe(ORG); } });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await expect(page.getByRole('button', { name: /Buscar/ })).toBeVisible();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Buscar no espaço da empresa' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('combobox').fill('credito expansao');
  await expect(dialog.getByRole('option', { name: /Crédito expansão/ }).first()).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('link', { name: 'Criar nova solicitação com estes dados' }).click();
  await expect(page).toHaveURL(/new-rfq\.html\?clone=/);
  const form = page.locator('#rfq-form');
  await expect(form.getByLabel('Título da solicitação')).toHaveValue(/Nova solicitação/);
  await form.getByRole('button', { name: 'Continuar' }).click();
  await expect(form.getByLabel('Valor desejado (R$)')).toHaveValue('500000');
});

test('app real: console operacional exige login e não é atalho para dados de empresas', async ({ page }) => {
  await page.goto('/finance/ops.html');
  await expect(page.locator('#view')).toContainText('Entre para usar o portal');
  // Sessão de empresa sem papel de operador: o servidor nega e a tela explica.
  await mockSession(page, { onDocuments: (path, request, json) => json({ ok: false, error: 'Sua conta não tem permissão para esta operação nesta organização.', code: 'forbidden' }, 403) });
  await page.goto('/finance/ops.html');
  await expect(page.locator('#view')).toContainText('Acesso restrito a operadores da plataforma');
  await expect(page.locator('#view')).not.toContainText(/Crédito expansão|Banco Um/);
});

test('app real: documento privado sobe por URL assinada, baixa sob demanda e nenhuma URL fica guardada', async ({ page }) => {
  const DOC = '00000000-0000-4000-8000-0000000000d9';
  const uploads = [];
  let available = false;
  const signedUpload = 'https://proj.supabase.co/storage/v1/object/upload/sign/fin-documents/a/b/v1-c?token=up';
  // Como em lib/finance/document-storage.mjs: a URL assinada leva `download=<nome>`
  // e o Storage responde como anexo — o navegador baixa sem sair da página.
  const signedDownload = 'https://proj.supabase.co/storage/v1/object/sign/fin-documents/a/b/v1-c?token=down&download=Balan%C3%A7o%202025.pdf';
  await page.route('https://proj.supabase.co/**', (route) => {
    uploads.push(`${route.request().method()} ${route.request().url()} ${route.request().headers()['content-type']}`);
    const attachment = route.request().method() === 'GET' && new URL(route.request().url()).searchParams.has('download');
    return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4', headers: attachment ? { 'Content-Disposition': 'attachment; filename="balanco-2025.pdf"' } : {} });
  });
  const calls = await mockSession(page, { onDocuments: (path, request, json) => {
    if (path === 'private-documents' && request.method() === 'GET') {
      return json({ ok: true, rows: available ? [{ id: DOC, organization_id: ORG, buyer_organization_id: ORG, entity_type: 'rfq', entity_id: RFQ, title: 'Balanço 2025', visibility: 'internal', current_version: 1, created_by: 'u2', created_at: '2026-09-26T10:00:00Z',
        versions: [{ document_id: DOC, version: 1, mime_type: 'application/pdf', size_bytes: 8, uploaded_by: 'u2', completed_at: '2026-09-26T10:00:00Z' }] }] : [] });
    }
    if (path === 'private-documents/upload') {
      const body = request.postDataJSON();
      expect(body).toMatchObject({ organization_id: ORG, entity_type: 'rfq', entity_id: RFQ, mime_type: 'application/pdf', size: 8, title: 'Balanço 2025' });
      expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
      return json({ ok: true, document_id: DOC, version: 1, upload_url: signedUpload, expires_in: 120 }, 201);
    }
    if (path === 'private-documents/complete') { available = true; return json({ ok: true, status: 'available' }); }
    if (path === 'private-documents/download') return json({ ok: true, url: signedDownload, version: 1, expires_in: 60 });
    return json({ ok: false }, 404);
  } });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  const docs = page.locator('#documentos');
  await expect(docs).toContainText('Nenhum documento anexado');
  await docs.getByText('Anexar documento', { exact: true }).first().click();
  // Tipo fora da lista é recusado antes de qualquer rede.
  await docs.locator('.document-form input[type=file]').setInputFiles({ name: 'macro.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
  await expect(docs.locator('.document-status')).toContainText('Tipo de arquivo não aceito');
  await docs.locator('.document-form input[type=file]').setInputFiles({ name: 'Balanço 2025.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await docs.locator('.document-form').getByRole('button', { name: 'Anexar documento' }).click();
  await expect(docs.locator('.document-status')).toContainText('Documento anexado');
  await expect(docs).toContainText('Balanço 2025');
  await expect(docs).toContainText('Rui Tavares');
  expect(uploads[0]).toMatch(/^PUT https:\/\/proj\.supabase\.co\/storage\/v1\/object\/upload\/sign\/.* application\/pdf$/);
  expect(calls).toEqual(expect.arrayContaining(['POST private-documents/upload', 'POST private-documents/complete']));
  // Sem esperar o evento `download` do Playwright: no WebKit ele não dispara para
  // resposta interceptada como anexo. O que importa é o GET assinado e a
  // permanência na solicitação.
  await docs.getByRole('button', { name: /Baixar Balanço 2025/ }).click();
  await expect.poll(() => uploads.some((entry) => entry.startsWith('GET ') && entry.includes('token=down'))).toBe(true);
  // O download não tira a pessoa da solicitação.
  await expect(page).toHaveURL(new RegExp(`/finance/rfq\\.html\\?id=${RFQ}$`));
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }));
  expect(stored).not.toMatch(/token=|supabase\.co/);
});

test('comparação financeira: filtros, versões, origem e moedas incompatíveis', async ({ page }) => {
  const data = overview();
  const [first, second] = data.rfqs[0].proposals;
  first.version = 2;
  first.terms.valid_until = '2020-01-01';
  first.previous_version = { version: 1, submitted_at: '2026-08-01T10:00:00Z', terms: { ...first.terms, interest_rate_month: 2.5 } };
  second.currency = 'USD';
  second.terms.index = 'cdi';
  await mockSession(page, { data });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await page.getByRole('tab', { name: 'Comparação' }).click();
  await expect(page.locator('.comparison')).toContainText('Moedas diferentes');
  await expect(page.locator('.comparison')).toContainText('Proposta vencida');
  await expect(page.locator('.comparison .best')).toHaveCount(0);
  const wide = page.locator('.comparison-wide');
  const mobile = page.locator('.compare-mobile');
  const surface = await wide.isVisible() ? wide : mobile;
  if (surface === wide) {
    // Cada aviso da coluna em sua linha: "…desde a v1" e "Proposta vencida" não se fundem num texto só.
    const flags = wide.locator('.matrix-provider', { hasText: 'Banco Um' }).locator('.matrix-flag');
    await expect(flags).toHaveCount(2);
    const [a, b] = [await flags.nth(0).boundingBox(), await flags.nth(1).boundingBox()];
    expect(b.y, 'avisos em linhas separadas').toBeGreaterThanOrEqual(a.y + a.height - 1);
  }
  const cell = surface.locator('[data-condition="interest_rate_month"]').first();
  await cell.locator('summary').first().click();
  await expect(cell).toContainText('sem vínculo de evidência por campo');
  await expect(cell).toContainText('não verificado');
  await page.getByLabel('Foco da comparação').selectOption('changed');
  await expect(surface.locator('[data-condition="interest_rate_month"]')).toBeVisible();
  await expect(surface.locator('[data-condition="term_months"]')).toHaveCount(0);
  await page.getByLabel('Versão de Banco Um').selectOption('previous');
  await expect(surface.locator('[data-condition="interest_rate_month"]')).toContainText('2,5%');
  await page.getByLabel('Foco da comparação').selectOption('missing');
  await expect(surface.locator('[data-condition="fees_amount"]')).toContainText('não informado');
  await page.getByLabel('Peso de Taxa (% a.m.)', { exact: true }).focus();
  await page.getByLabel('Peso de Taxa (% a.m.)', { exact: true }).press('End');
  await page.getByRole('button', { name: 'Aplicar meus pesos' }).click();
  await expect(page.locator('#weights-output')).toContainText('bases incompatíveis');
  await expect(page.locator('.score-row')).toHaveCount(0);
  await page.getByLabel('Foco da comparação').focus();
  await expect(page.getByLabel('Foco da comparação')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `reports/financial-visual/comparison-context-${Math.round((await page.viewportSize()).width)}.png`, fullPage: true });
});

test('comparação com coleta aberta: diz quantas convidadas responderam, sem tratar ausência como pior', async ({ page }) => {
  const data = overview();
  const rfq = data.rfqs[0];
  rfq.status = 'collecting';
  rfq.proposals = [rfq.proposals[0]];
  rfq.invites = [{ provider_id: 'x1', provider_name: 'Banco Um', status: 'accepted' }, { provider_id: 'x2', provider_name: 'Banco Dois', status: 'accepted' },
    { provider_id: 'x3', provider_name: 'Banco Três', status: 'revoked' }];
  await mockSession(page, { data });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await page.getByRole('tab', { name: 'Comparação' }).click();
  const note = page.locator('#comparison-partial');
  // Convite revogado não conta como "aguardando"; a proposta recebida conta uma vez.
  await expect(note).toContainText('Coleta em andamento: 1 de 2 instituições convidadas enviaram proposta');
  await expect(note).toContainText('com uma só proposta não há comparação lado a lado');
  await expect(page.locator('.comparison')).not.toContainText('Banco Dois');
  await expect(page.locator('.comparison .best')).toHaveCount(0);
  // Avaliação (coleta encerrada) não mostra o aviso.
  rfq.status = 'comparing';
  await page.reload();
  await page.getByRole('tab', { name: 'Comparação' }).click();
  await expect(page.locator('.comparison')).toBeVisible();
  await expect(page.locator('#comparison-partial')).toHaveCount(0);
});

test('leitor: conversa do processo em leitura, sem formulário que o banco recusaria', async ({ page }) => {
  await mockSession(page, { viewerRole: 'viewer' });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await page.getByRole('tab', { name: 'Atividade' }).click();
  await expect(page.locator('#comment-readonly')).toContainText('Seu papel lê os comentários deste processo');
  await expect(page.getByLabel('Comentário', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Publicar comentário' })).toHaveCount(0);
});

test('gestão financeira: conversa do processo com formulário', async ({ page }) => {
  await mockSession(page);
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await page.getByRole('tab', { name: 'Atividade' }).click();
  await expect(page.getByLabel('Comentário', { exact: true })).toBeVisible();
  await expect(page.locator('#comment-readonly')).toHaveCount(0);
});

test('configurações: "Seu acesso" diz papel, organização, o que pode e o que fica com outros papéis', async ({ page }) => {
  await mockSession(page, { viewerRole: 'viewer' });
  await page.goto('/finance/settings.html');
  const access = page.locator('#acesso');
  await expect(access).toContainText('Leitura e aprovação em Empresa de teste');
  await expect(access.locator('#access-scope')).toContainText('Aprovar ou pedir alterações quando for aprovador designado');
  await expect(access.locator('#access-scope')).toContainText('Concluir, criar ou atribuir tarefas');
  await expect(access).toContainText('Peça a um administrador');
  // Campo que o papel não altera parece desabilitado (não só para o leitor de tela).
  const trade = page.locator('#organization-form input[name=trade_name]');
  await expect(trade).toBeDisabled();
  expect(await trade.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe('rgb(255, 255, 255)');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('comparação indisponível recusa cálculo local silencioso e oferece repetição', async ({ page }) => {
  await mockSession(page);
  await page.route('**/api/finance/comparison', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Acesso não autorizado.' }) }));
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await page.getByRole('tab', { name: 'Comparação' }).click();
  await expect(page.getByText('Comparação indisponível')).toBeVisible();
  await expect(page.locator('.matrix')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await page.getByLabel('Peso de Taxa (% a.m.)', { exact: true }).focus();
  await page.getByLabel('Peso de Taxa (% a.m.)', { exact: true }).press('End');
  await page.getByRole('button', { name: 'Aplicar meus pesos' }).click();
  await expect(page.locator('#weights-output')).toContainText('Não foi possível calcular');
  await expect(page.locator('.score-row')).toHaveCount(0);
});

test('menu "Mais ações": teclado completo e Tab para fora fecha o menu', async ({ page }) => {
  await mockSession(page);
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  const trigger = page.getByRole('button', { name: 'Mais ações' });
  await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
  await trigger.click();
  const items = page.getByRole('menuitem');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('propostas recebidas: condições principais na lista, ausência como "não informado" e retirada sinalizada', async ({ page }) => {
  const data = overview();
  data.rfqs[0].proposals[1] = { ...data.rfqs[0].proposals[1], status: 'withdrawn', terms: { offered_amount: 450000 } };
  await mockSession(page, { data });
  await page.goto('/finance/proposals.html');
  const one = page.locator('tr', { hasText: 'Banco Um' });
  await expect(one).toContainText(/R\$\s?500\.000/);
  await expect(one).toContainText('1,4');
  await expect(one).toContainText('24 meses');
  const two = page.locator('tr', { hasText: 'Banco Dois' });
  await expect(two).toContainText('Retirada');
  await expect(two).toContainText('não informado');
  await expect(two).not.toContainText(/:\s0(\D|$)/);
  await expect(one).not.toContainText('após o prazo');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('propostas recebidas: resposta depois do prazo informado aparece como tal', async ({ page }) => {
  const data = overview();
  data.rfqs[0].response_deadline = '2026-09-09';
  await mockSession(page, { data });
  await page.goto('/finance/proposals.html');
  await expect(page.locator('tr', { hasText: 'Banco Um' })).toContainText('após o prazo de resposta');
  await expect(page.locator('tr', { hasText: 'Banco Dois' })).not.toContainText('após o prazo');
});

test('convites encerrados aparecem em português e não contam como "ainda sem resposta"', async ({ page }) => {
  const data = overview();
  data.rfqs[0].invites = [
    { id: 'i1', provider_id: 'x1', provider_name: 'Banco Um', status: 'accepted' },
    { id: 'i3', provider_id: 'x3', provider_name: 'Banco Três', status: 'revoked' },
    { id: 'i4', provider_id: 'x4', provider_name: 'Banco Quatro', status: 'declined' },
    { id: 'i5', provider_id: 'x5', provider_name: 'Banco Cinco', status: 'invited' }
  ];
  await mockSession(page, { data });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  const invites = page.locator('#convites');
  await expect(invites.locator('.invite-row', { hasText: 'Banco Três' })).toContainText('Revogado');
  await expect(invites.locator('.invite-row', { hasText: 'Banco Quatro' })).toContainText('Recusou o convite');
  await expect(invites).not.toContainText(/revoked|declined/);
  await page.goto(`/finance/rfq.html?id=${RFQ}#propostas`);
  const waiting = page.locator('.card', { hasText: 'Ainda sem resposta' });
  await expect(waiting).toContainText('Banco Cinco');
  await expect(waiting).not.toContainText('Banco Três');
  await expect(waiting).not.toContainText('Banco Quatro');
});

test('primeiros passos levam a registrar um contrato existente, com o formulário já aberto', async ({ page }) => {
  const data = overview();
  data.rfqs = [];
  await mockSession(page, { data });
  await page.goto('/finance/dashboard.html');
  const steps = page.locator('#buyer-onboarding');
  await steps.getByRole('link', { name: 'Registre um contrato que já existe' }).click();
  await page.waitForURL(/\/finance\/contracts\.html$/);
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText(/contrato/i);
  // Intent desconhecido ou malformado não faz nada.
  await page.goto('/finance/contracts.html?acao=%22%5D,body');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('comparação: condição alterada na versão atual mostra o valor anterior e a cobertura de cada proposta', async ({ page }) => {
  const data = overview();
  const [first] = data.rfqs[0].proposals;
  first.version = 2;
  first.previous_version = { version: 1, submitted_at: '2026-08-01T10:00:00Z', terms: { ...first.terms, interest_rate_month: 2.5 } };
  await mockSession(page, { data });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await page.getByRole('tab', { name: 'Comparação' }).click();
  const wide = page.locator('.comparison-wide');
  const surface = await wide.isVisible() ? wide : page.locator('.compare-mobile');
  // A mudança aparece sem precisar do filtro "Alterações de versão".
  await expect(surface.locator('[data-condition="interest_rate_month"]').first()).toContainText('Alterado na v2 · antes: 2,5%');
  await expect(surface.locator('[data-condition="term_months"]').first()).not.toContainText('Alterado');
  await expect(page.locator('.comparison')).toContainText('condições comparáveis informadas');
  if (await wide.isVisible()) await expect(wide.locator('thead')).toContainText('1 condição mudou desde a v1');
  // A marca é informação, não destaque de "melhor": nunca usa a classe de extremo.
  await expect(surface.locator('.changed-mark')).not.toHaveCount(0);
  // Consulta da versão anterior não carrega a marca de alteração.
  await page.getByLabel('Versão de Banco Um').selectOption('previous');
  await expect(surface.locator('[data-condition="interest_rate_month"]').first()).not.toContainText('Alterado na v2');
  // Recorte técnico fica sob demanda, não na primeira leitura.
  await expect(page.getByText('Recorte: até 500 propostas')).toBeHidden();
  await page.getByText('Como ler esta comparação').click();
  await expect(page.getByText(/Recorte: até 500 propostas/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('decisão com versão alterada pelo provedor: nada é registrado, a mudança aparece e exige confirmação', async ({ page }) => {
  const data = overview();
  await mockSession(page, { data });
  // Depois da recusa, a próxima leitura traz a versão 2 do Banco Um.
  let overviews = 0;
  const posts = [];
  await page.route('**/api/finance/overview**', (route) => {
    overviews += 1;
    const next = overview();
    if (posts.length) {
      const proposal = next.rfqs[0].proposals[0];
      proposal.previous_version = { version: 1, submitted_at: '2026-09-10T10:00:00Z', terms: { ...proposal.terms } };
      proposal.version = 2;
      proposal.terms = { ...proposal.terms, interest_rate_month: 1.9 };
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(next) });
  });
  await page.route('**/api/finance/decisions', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [] }) });
    posts.push(route.request().postDataJSON());
    if (posts.length === 1) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ ok: false, code: 'proposal_version_changed', error: 'A instituição enviou uma versão nova desta proposta depois que você abriu a página. Nada foi registrado: confira as condições atualizadas e decida de novo.' }) });
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'd1' }) });
  });
  await page.goto(`/finance/rfq.html?id=${RFQ}#decisao`);
  await page.getByRole('tab', { name: 'Decisão' }).click();
  await page.getByRole('radio', { name: /Banco Um/ }).check();
  await page.getByRole('button', { name: 'Registrar decisão' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar decisão' }).click();
  await expect.poll(() => overviews).toBeGreaterThan(1);
  await page.getByRole('tab', { name: 'Decisão' }).click();
  const conflict = page.locator('#decision-conflict');
  await expect(conflict).toContainText('mudou para a versão 2');
  await expect(conflict).toContainText('Nada foi registrado');
  await expect(conflict).toContainText('Taxa (% a.m.): 1,4% → 1,9%');
  await expect(page.getByRole('radio', { name: /Banco Um/ })).toBeChecked();
  // Sem confirmar a revisão, a nova tentativa não chega ao servidor.
  await page.getByRole('button', { name: 'Registrar decisão' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(posts).toHaveLength(1);
  await page.getByLabel('Revisei as condições da versão 2 e quero seguir com a decisão').check();
  await page.getByRole('button', { name: 'Registrar decisão' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar decisão' }).click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[0].expected_version).toBe(1);
  expect(posts[1]).toMatchObject({ proposal_id: 'p1', expected_version: 2 });
});

test('painel e contratos contam os mesmos dias e nunca mostram o código da categoria', async ({ page }) => {
  const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const data = overview({ contracts: [{ id: '00000000-0000-4000-8000-0000000000c1', organization_id: ORG, provider_id: 'x1', provider_name: 'Banco Garantidor', product: 'guarantee', status: 'active',
    starts_on: day(-60), ends_on: day(300), renewal_notice_days: 120, review_from: day(180), days_to_end: 299, current_version: 1, currency: 'BRL', legal_entity_id: null }] });
  await mockSession(page, { data });
  await page.goto('/finance/dashboard.html');
  const card = page.locator('.mini-row', { hasText: 'Banco Garantidor' });
  await expect(card).toContainText('Garantia');
  await expect(card).toContainText('vence em 300 dias');
  await expect(page.locator('#view')).not.toContainText('guarantee');
  // Concorrência em avaliação: o prazo de resposta já passou de propósito e não é urgência.
  await expect(page.locator('.process-row', { hasText: 'Crédito expansão' })).toContainText('coleta encerrada');
  await expect(page.locator('.process-row .process-deadline.urgent')).toHaveCount(0);
  await page.goto('/finance/contracts.html');
  // A página usa o calendário de quem lê, não o days_to_end arredondado da API.
  await expect(page.locator('.contract-card', { hasText: 'Banco Garantidor' }).locator('.contract-days')).toHaveText('vence em 300 dias');
});

for (const [status, warned] of [[503, true], [200, false]]) {
  test(`sair: resposta ${status} do logout ${warned ? 'avisa que o encerramento não foi confirmado' : 'volta ao login sem aviso'}`, async ({ page }) => {
    await mockSession(page);
    await page.route('**/api/auth/logout', (route) => route.fulfill({ status, contentType: 'application/json',
      body: JSON.stringify(status === 200 ? { ok: true, authenticated: false } : { ok: false, code: 'auth_logout_unconfirmed', error: 'A sessão local foi encerrada, mas não foi possível confirmar o encerramento das sessões no serviço de contas.' }) }));
    await page.goto('/finance/dashboard.html');
    await page.getByRole('button', { name: /^Conta de / }).click();
    await page.getByRole('button', { name: 'Sair' }).click();
    await page.waitForURL(/\/login\.html/);
    if (warned) await expect(page.getByRole('alert')).toContainText('Não foi possível confirmar o encerramento da sua sessão em outros dispositivos');
    else await expect(page.locator('#logout-unconfirmed')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  });
}

test('decisão e pedido de aprovação: com mais de uma proposta nada vem marcado; a escolha é explícita', async ({ page }) => {
  await mockSession(page);
  const posts = [];
  await page.route('**/api/finance/decisions', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [] }) });
    posts.push(route.request().postDataJSON());
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'd1' }) });
  });
  await page.goto(`/finance/rfq.html?id=${RFQ}#decisao`);
  await page.getByRole('tab', { name: 'Decisão' }).click();
  // A primeira da lista não é recomendação: nenhuma proposta pré-selecionada.
  await expect(page.getByRole('radio', { name: /Banco Um/ })).not.toBeChecked();
  await expect(page.getByRole('radio', { name: /Banco Dois/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Registrar decisão' }).click();
  await expect(page.locator('#decision-form').getByRole('alert')).toHaveText('Escolha a proposta da decisão.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Banco Um/ })).toBeFocused();
  await page.getByRole('radio', { name: /Banco Dois/ }).check();
  await expect(page.locator('#decision-form').getByRole('alert')).toBeHidden();
  await page.getByRole('button', { name: 'Registrar decisão' }).click();
  await expect(page.getByRole('dialog')).toContainText('Registrar a escolha de Banco Dois?');
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar decisão' }).click();
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ proposal_id: 'p2', expected_version: 1 });

  // Pedido de aprovação: mesma regra; sem escolha, nada é enviado.
  let requested = 0;
  await page.route('**/api/finance/approvals/request', (route) => { requested += 1; return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true }) }); });
  await page.goto(`/finance/rfq.html?id=${RFQ}#aprovacoes`);
  await page.getByRole('tab', { name: /Aprovações/ }).click();
  const form = page.locator('#approval-request');
  await expect(form.getByRole('radio', { name: /Banco Um/ })).not.toBeChecked();
  await expect(form.getByText(/Escolha a proposta para ver quem aprova/)).toBeVisible();
  await form.locator('textarea[name="rationale"]').fill('Contexto para quem aprova.');
  await form.getByRole('button', { name: 'Solicitar aprovação' }).click();
  await expect(form.getByText('Escolha a proposta que vai para aprovação.')).toBeVisible();
  expect(requested).toBe(0);
  await form.getByRole('radio', { name: /Banco Dois/ }).check();
  await expect(form.getByText('Aprovadores, na ordem em que devem decidir')).toBeVisible();
  await form.getByLabel(/Rui Tavares/).check();
  await form.getByRole('button', { name: 'Solicitar aprovação' }).click();
  await expect.poll(() => requested).toBe(1);
});

test('painel sem contrato: o cartão leva a registrar o contrato existente, mesmo depois da primeira solicitação', async ({ page }) => {
  await mockSession(page);
  await page.goto('/finance/dashboard.html');
  // Com solicitação criada, os primeiros passos somem; o caminho de primeiro valor não pode sumir junto.
  await expect(page.locator('#buyer-onboarding')).toHaveCount(0);
  const card = page.locator('.card', { hasText: 'Nenhum contrato vigente' });
  await expect(card).not.toContainText('depois de uma decisão');
  await card.getByRole('link', { name: 'Registrar contrato existente' }).click();
  await page.waitForURL(/\/finance\/contracts\.html$/);
  await expect(page.getByRole('dialog', { name: 'Registrar contrato existente' })).toBeVisible();
});

test('leitor não recebe o atalho de registrar contrato no painel', async ({ page }) => {
  await mockSession(page, { viewerRole: 'viewer' });
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('.card', { hasText: 'Nenhum contrato vigente' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Registrar contrato existente' })).toHaveCount(0);
});

// ------------------------------------------- falhas previsíveis na governança e no transporte
test('governança que não carregou: a solicitação em avaliação não oferece decidir nem afirma "sem aprovação"', async ({ page }) => {
  await mockSession(page);
  // Aprovações recusadas por limite (429) e política fora do ar (503): nenhuma das duas é "vazio".
  let failing = true;
  await page.route('**/api/finance/approvals**', (route) => failing
    ? route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }) })
    : route.fallback());
  await page.route('**/api/finance/approval-policy**', (route) => failing
    ? route.fulfill({ status: 503, contentType: 'text/html', body: '<html>indisponível</html>' })
    : route.fallback());
  await page.goto(`/finance/rfq.html?id=${RFQ}#decisao`);
  await page.getByRole('tab', { name: 'Decisão' }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Indisponível até recarregar');
  await expect(page.locator('.governance-gap')).toHaveCount(1);
  const notice = page.locator('.governance-gap');
  await expect(notice).toContainText('Não conseguimos carregar a política de aprovação e as aprovações desta solicitação');
  await expect(notice).toContainText('Nada foi alterado');
  await expect(page.locator('#decision-form')).toHaveCount(0);
  await expect(page.locator('.page-actions, .header-actions').getByRole('link', { name: 'Registrar decisão' })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Visão geral' }).click();
  await expect(page.getByRole('region', { name: 'Próximo passo' })).toContainText('Recarregue antes de seguir');
  // Quando a leitura volta, o fluxo normal reaparece sem recarregar a página inteira.
  failing = false;
  await page.locator('.governance-gap').first().getByRole('button', { name: 'Recarregar' }).click();
  await page.getByRole('tab', { name: 'Decisão' }).click();
  await expect(page.locator('#decision-form')).toBeVisible();
  await expect(page.locator('.governance-gap')).toHaveCount(0);
});

test('aprovações que não carregaram não viram "Tudo em dia" no painel nem caixa vazia na lista', async ({ page }) => {
  await mockSession(page);
  await page.route('**/api/finance/approvals**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Falha temporária.', requestId: 'a1b2c3d4-0000-4000-8000-000000000000' }) }));
  await page.goto('/finance/dashboard.html');
  const attention = page.locator('#precisa-de-voce');
  await expect(attention.getByRole('alert')).toContainText('Não conseguimos carregar as aprovações agora');
  await expect(attention).not.toContainText('Tudo em dia');
  await page.goto('/finance/approvals.html');
  const error = page.locator('#view').getByRole('alert');
  await expect(error).toContainText('Não foi possível carregar as aprovações');
  // Referência curta para o suporte; o identificador inteiro não aparece.
  await expect(error).toContainText('Referência para o suporte: A1B2C3D4.');
  await expect(page.locator('#view')).not.toContainText('a1b2c3d4-0000');
  await expect(page.locator('#view')).not.toContainText('Nada aguardando');
});

test('429 com Retry-After: a tela diz quanto esperar e só libera "Tentar novamente" depois', async ({ page }) => {
  await page.clock.install();
  await mockSession(page);
  let limited = true;
  let hits = 0;
  await page.route('**/api/finance/overview**', (route) => {
    hits += 1;
    return limited
      ? route.fulfill({ status: 429, headers: { 'Retry-After': '20' }, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.' }) })
      : route.fallback();
  });
  await page.goto('/finance/dashboard.html');
  const error = page.locator('#view').getByRole('alert');
  await expect(error).toContainText('Tente de novo em 20 segundos.');
  const retry = error.getByRole('button', { name: 'Tentar novamente' });
  await expect(retry).toBeDisabled();
  const before = hits;
  await page.clock.runFor(10_000);
  await expect(retry).toBeDisabled();
  expect(hits).toBe(before);
  limited = false;
  await page.clock.runFor(11_000);
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page.locator('#precisa-de-voce')).toBeVisible();
});

test('sessão expirada ao enviar: nada é dado como feito, o formulário fica e há caminho para entrar de novo', async ({ page }) => {
  await mockSession(page);
  await page.route('**/api/finance/comments**', (route) => route.request().method() === 'POST'
    ? route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Sessão inválida.' }) })
    : route.fallback());
  await page.goto(`/finance/rfq.html?id=${RFQ}#atividade`);
  await page.getByRole('tab', { name: 'Atividade' }).click();
  const box = page.getByRole('tabpanel').locator('textarea').first();
  await box.fill('Pedir ao Banco Um a minuta da cédula.');
  await page.getByRole('tabpanel').getByRole('button', { name: 'Publicar comentário' }).click();
  const alert = page.getByRole('tabpanel').locator('.field-error, [role=alert]').filter({ hasText: 'Sua sessão expirou' }).first();
  await expect(alert).toContainText('Sua sessão expirou e nada foi registrado');
  const login = alert.getByRole('link', { name: 'Entrar em outra aba' });
  await expect(login).toHaveAttribute('target', '_blank');
  await expect(login).toHaveAttribute('href', `/login.html?next=${encodeURIComponent(`/finance/rfq.html?id=${RFQ}`)}`);
  await expect(box).toHaveValue('Pedir ao Banco Um a minuta da cédula.');
});

test('membros que não carregam não viram "seu papel não permite": a tela diz que não carregou', async ({ page }) => {
  await mockSession(page);
  await page.route('**/api/finance/members**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Serviço temporariamente indisponível.' }) }));
  await page.goto('/finance/tasks.html');
  await expect(page.locator('#view').getByRole('alert')).toContainText('Serviço temporariamente indisponível');
  await expect(page.locator('#view').getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  await expect(page.locator('#view')).not.toContainText('Seu papel');
});

test('propostas recebidas: validade de processo encerrado é histórica (com ano, sem alarme) e "1 dia" no singular', async ({ page }) => {
  const data = overview();
  data.rfqs.push({ id: '00000000-0000-4000-8000-0000000000b2', title: 'Adquirência encerrada', product: 'acquiring', status: 'contracted', revision: 1, response_deadline: '2024-08-01',
    demand: {}, invites_count: 1, owner_id: 'u1', created_at: '2024-07-01T10:00:00Z',
    proposals: [{ id: 'p9', provider_id: 'x9', provider_name: 'Lumina Teste', status: 'submitted', version: 1, rfq_revision: 1, submitted_at: '2024-08-10T10:00:00Z',
      terms: { mdr_debit: 0.89, mdr_credit_cash: 1.99, settlement_days: 1, valid_until: '2024-09-06' } }] });
  data.rfqs[0].proposals[0].terms.valid_until = '2020-01-01';
  await mockSession(page, { data });
  await page.goto('/finance/proposals.html');
  const closed = page.locator('tr', { hasText: 'Lumina Teste' });
  await expect(closed).toContainText('Prazo de liquidação: 1 dia');
  await expect(closed).not.toContainText('1 dias');
  const validity = closed.locator('td[data-label="Validade"]');
  await expect(validity).toContainText('06 de set de 2024 · expirou');
  await expect(validity).not.toHaveClass(/urgent/);
  // Processo ainda em avaliação: a validade vencida continua sendo alerta.
  const live = page.locator('tr', { hasText: 'Banco Um' }).locator('td[data-label="Validade"]');
  await expect(live).toContainText('vencida');
  await expect(live).toHaveClass(/urgent/);
});

test('solicitações: prazo não quebra em duas linhas e o nome do responsável aparece inteiro no desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'layout de tabela só no desktop');
  // Condições da Demo real: títulos longos competem com as colunas curtas (1440 px).
  await page.setViewportSize({ width: 1440, height: 900 });
  const base = overview().rfqs[0];
  await mockSession(page, { data: overview({ rfqs: [
    { ...base, owner_name: 'Juliana Ramos', title: 'Capital de giro sazonal — safra de inverno (R$ 5 milhões / 12 meses)' },
    { ...base, id: '00000000-0000-4000-8000-0000000000b3', owner_name: 'Juliana Ramos', title: 'Adquirência — revisão de MDR e antecipação (R$ 12 milhões/mês)' }
  ] }) });
  await page.goto('/finance/rfqs.html');
  const date = page.locator('.rfq-table .date-cell > span').first();
  const box = await date.boundingBox();
  const lineHeight = await date.evaluate((node) => parseFloat(getComputedStyle(node).lineHeight) || 20);
  expect(box.height).toBeLessThan(lineHeight * 1.5);
  const name = page.locator('.rfq-table .person-name').first();
  expect(await name.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
});

test('solicitações no celular: filtros ocupam a linha e o rótulo não é cortado', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile'), 'só celular');
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSession(page);
  await page.goto('/finance/rfqs.html');
  for (const select of await page.locator('.toolbar select').all()) {
    const fits = await select.evaluate((node) => {
      const probe = document.createElement('span');
      probe.style.cssText = `font:${getComputedStyle(node).font};position:absolute;visibility:hidden;white-space:nowrap`;
      probe.textContent = node.selectedOptions[0].text;
      document.body.append(probe);
      const ok = probe.offsetWidth + 40 <= node.clientWidth;
      probe.remove();
      return ok;
    });
    expect(fits).toBe(true);
  }
});

test('contrato nascido de decisão leva ao processo e à decisão de origem; ?id= destaca o contrato', async ({ page }) => {
  // A API devolve decision_id no contrato (não rfq_id); a solicitação traz decision_id.
  const contract = { id: '00000000-0000-4000-8000-0000000000c1', decision_id: '00000000-0000-4000-8000-0000000000d1', provider_id: 'x1', provider_name: 'Banco Um', product: 'credit',
    status: 'active', starts_on: '2026-01-10', ends_on: '2028-01-10', renewal_notice_days: 60, review_from: '2027-11-11', origin: 'sourcing' };
  const imported = { ...contract, id: '00000000-0000-4000-8000-0000000000c2', decision_id: null, origin: 'imported', title: 'Fiança da sede', provider_name: 'Banco Dois', product: 'guarantee' };
  const base = overview().rfqs[0];
  await mockSession(page, { data: overview({ contracts: [contract, imported], rfqs: [{ ...base, status: 'contracted', decision_id: contract.decision_id }] }) });
  await page.goto(`/finance/contracts.html?id=${contract.id}`);
  const card = page.locator(`#contract-${contract.id}`);
  await expect(card).toHaveClass(/highlighted/);
  await expect(card.locator('.contract-kicker')).toContainText('Crédito expansão');
  await expect(card.getByRole('link', { name: 'Ver processo e decisão de origem' })).toHaveAttribute('href', new RegExp(`rfq\\.html\\?id=${RFQ}#decisao$`));
  // Contrato da carteira existente não inventa origem.
  await expect(page.locator(`#contract-${imported.id}`).getByRole('link', { name: /decisão de origem/ })).toHaveCount(0);
});

test('painel: renovações e tarefas vêm antes da inteligência de valor no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSession(page);
  await page.route('**/api/finance/executive**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, cards: [{ title: 'Valor de procurement', lines: ['Sem registros de valor no período.'], note: 'Cobertura: 0/0.', links: [] }] }) }));
  await page.goto('/finance/dashboard.html');
  const value = page.locator('#value-intelligence');
  await expect(value).toBeVisible();
  const top = async (locator) => (await locator.boundingBox()).y;
  const contracts = page.getByRole('heading', { name: 'Contratos e renovações' });
  const tasks = page.getByRole('heading', { name: /^(Outras tarefas|Tarefas)$/ });
  expect(await top(contracts)).toBeLessThan(await top(value));
  expect(await top(tasks)).toBeLessThan(await top(value));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('painel: até cinco pendências à vista, sem tarefas soterrando processos, o restante sob demanda; atividade só é buscada ao abrir', async ({ page }) => {
  const data = overview();
  data.tasks = Array.from({ length: 7 }, (_, index) => ({ id: `late-${index}`, title: `Tarefa atrasada ${index + 1}`, status: 'open', due_on: '2020-01-0' + (index + 1) }));
  const events = [];
  page.on('request', (request) => { if (/\/api\/finance\/events/.test(request.url())) events.push(request.url()); });
  await mockSession(page, { data });
  await page.goto('/finance/dashboard.html');
  const attention = page.locator('#precisa-de-voce');
  await expect(attention).toContainText('8 itens pedem ação');
  // Sete tarefas vencidas não escondem o passo do processo: só três entram à vista.
  await expect(attention.locator('.action-row:visible')).toHaveCount(4);
  await expect(attention.locator('.action-row:visible', { hasText: 'Avaliar propostas' })).toHaveCount(1);
  const more = attention.getByText('Mostrar mais 4 pendências');
  await more.click();
  await expect(attention.locator('.action-row:visible')).toHaveCount(8);
  // Nada some: a contagem por etapa e o histórico continuam a um clique.
  await expect(page.locator('.pipeline')).toBeHidden();
  await page.getByText('Ver solicitações por etapa').click();
  await expect(page.locator('.pipeline')).toBeVisible();
  expect(events).toEqual([]);
  await page.getByText('Atividade recente da empresa').click();
  await expect.poll(() => events.length).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('solicitação: próximo passo visível em qualquer aba, com atalho e quem age; comparação abre com resumo factual', async ({ page }) => {
  await mockSession(page);
  await page.goto(`/finance/rfq.html?id=${RFQ}#atividade`);
  const next = page.getByRole('region', { name: 'Próximo passo' });
  await expect(next).toBeVisible();
  await expect(next).toContainText('Você pode agir nesta etapa.');
  await next.getByRole('link', { name: 'Ver comparação' }).click();
  await expect(page.getByRole('tab', { name: /Comparação/ })).toHaveAttribute('aria-selected', 'true');
  const summary = page.getByRole('list', { name: 'Resumo da comparação' });
  await expect(summary).toContainText('2 propostas na versão atual');
  await expect(summary).toContainText(/condições comparáveis com valores diferentes/);
  await expect(page.locator('#view')).not.toContainText(/melhor proposta|recomendad/i);
  // Uma só região de próximo passo: o cartão lateral da Visão geral saiu.
  await page.getByRole('tab', { name: 'Visão geral' }).click();
  await expect(page.getByRole('region', { name: 'Próximo passo' })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('solicitação para leitor: próximo passo diz quem age e não oferece ação de gestão', async ({ page }) => {
  await mockSession(page, { viewerRole: 'viewer' });
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  const next = page.getByRole('region', { name: 'Próximo passo' });
  await expect(next).toContainText('Ação de quem gerencia a solicitação; você acompanha.');
  await expect(page.getByRole('button', { name: 'Encerrar coleta e avaliar' })).toHaveCount(0);
});

test('instituições: a coluna de verificação cabe no desktop e as contagens usam singular/plural', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'tabela só no desktop');
  await page.setViewportSize({ width: 1440, height: 900 });
  const providers = [{ id: 'x1', name: 'Banco Um', kind: 'bank', region: 'Nacional — São Paulo (SP)', website: 'https://bancoum.example' },
    { id: 'x2', name: 'Banco Dois', kind: 'bank', region: 'Nacional — Belo Horizonte (MG)', website: 'https://bancodois.example' }];
  const base = overview().rfqs[0];
  await mockSession(page, { data: overview({ providers, rfqs: [{ ...base, proposals: [base.proposals[0]], invites: [{ provider_id: 'x1', status: 'accepted', provider_name: 'Banco Um' }, { provider_id: 'x2', status: 'invited', provider_name: 'Banco Dois' }] }] }) });
  await page.goto('/finance/providers.html');
  const table = page.locator('.provider-table');
  await expect(table.getByRole('columnheader', { name: 'Verificação' })).toBeVisible();
  const scroller = table.locator('xpath=..');
  expect(await scroller.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.locator('#provider-x2')).toContainText('1 convite · 0 propostas');
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  await expect(page.locator('#convites')).toContainText('2 convidados · 1 respondeu');
});

test('Demo canônica: o selo do ambiente vem com "Trocar persona" para a entrada por persona; fora da Demo, nada', async ({ page }) => {
  await mockSession(page);
  await page.route('**/api/finance/organizations', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, environment: 'demo', rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Empresa de teste' }] }) }));
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('#environment-chip')).toBeVisible();
  const change = page.getByRole('link', { name: 'Trocar persona da demonstração' });
  await expect(change).toHaveAttribute('href', '/login.html#demonstracao');
  const box = await change.boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(page.viewportSize().width < 760 ? 40 : 32);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockSession(page);
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('#persona-switch')).toHaveCount(0);
});

test('link aberto sem sessão: "Entrar na conta" leva de volta ao mesmo registro', async ({ page }) => {
  await page.goto(`/finance/rfq.html?id=${RFQ}`);
  const login = page.locator('#view').getByRole('link', { name: 'Entrar na conta' });
  await expect(login).toHaveAttribute('href', `/login.html?next=${encodeURIComponent(`/finance/rfq.html?id=${RFQ}`)}`);
});

test('site público no celular: "Entrar" inteiro no cabeçalho, sem botão cortado', async ({ page }) => {
  for (const path of ['/', '/login.html', '/produto.html']) {
    await page.goto(path);
    const box = await page.locator('.public-header .nav-cta').boundingBox();
    const width = page.viewportSize().width;
    expect(box, path).not.toBeNull();
    expect(box.x, path).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, `${path}: "Entrar" cabe na tela`).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), path).toBeLessThanOrEqual(1);
  }
});

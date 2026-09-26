import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

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
  ['/finance/providers.html', 'Provedores'],
  ['/finance/proposals.html', 'Propostas recebidas'],
  ['/finance/contracts.html', 'Contratos e renovações'],
  ['/finance/tasks.html', 'Tarefas'],
  ['/finance/notifications.html', 'Notificações'],
  ['/finance/settings.html', 'Configurações'],
  ['/finance/boundaries.html', 'Limites do produto']
];
const PROVIDER_PAGES = [
  ['/provider/index.html', 'Portal do provedor'],
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
          terms: { offered_amount: 500000, interest_rate_month: 1.4, term_months: 24, cet_year: 19 } },
        { id: 'p2', provider_id: 'x2', provider_name: 'Banco Dois', status: 'submitted', version: 1, rfq_revision: 1, submitted_at: '2026-09-09T10:00:00Z',
          terms: { offered_amount: 450000, interest_rate_month: 1.2, term_months: 24 } }
      ] }],
    ...extra
  };
}
/** Sessão simulada: responde as rotas que a interface usa. */
async function mockSession(page, { organizations = [{ id: ORG, kind: 'BUYER', legal_name: 'Empresa de teste' }], data = overview(), editor = {}, onSearch = null } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    calls.push(`${request.method()} ${path}`);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === 'organizations') return json({ ok: true, rows: organizations });
    if (path === 'overview') return json(data);
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'finance_manager' }], viewer_id: 'u1' });
    if (path === 'search') { onSearch?.(url); return json({ ok: true, rows: [{ kind: 'rfq', id: RFQ, title: 'Crédito expansão', detail: 'comparing', href: `/finance/rfq.html?id=${RFQ}` }] }); }
    if (path === 'rfq-editor' && request.method() === 'GET') return json({ ok: true, draft: editor.draft || null });
    if (path === 'rfq-editor' && request.method() === 'PATCH') return editor.patchStatus ? json({ ok: false, error: 'Esta solicitação foi alterada em outra aba.' }, editor.patchStatus) : json({ ok: true, revision: (editor.revision = (editor.revision || 0) + 1), updated_at: new Date().toISOString() });
    if (['approvals', 'notifications', 'decisions', 'events', 'comments', 'rfq-revisions', 'tasks'].includes(path)) return json({ ok: true, rows: [] });
    if (path === 'approval-policy') return json({ ok: true, required_for_decision: false });
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
    await expect(page.getByRole('link', { name: 'Pular para o conteudo' })).toHaveAttribute('href', '#main');
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
});

test('a navegação entre os portais funciona por links reais, sem depender de JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/finance/index.html');
  await page.getByRole('navigation', { name: 'Navegacao do portal' }).getByRole('link', { name: 'Contratos' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contratos e renovações');
  await page.getByRole('link', { name: 'Portal do provedor' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Portal do provedor');
  expect(await page.locator('#view').textContent()).toContain('depende de JavaScript');
  await context.close();
});

test('app real: sem sessão o portal exige login e nunca cai na demonstração', async ({ page }) => {
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto('/finance/dashboard.html');
  const view = page.locator('#view');
  await expect(view).toContainText('Entre para usar o portal');
  await expect(view.getByRole('link', { name: 'Entrar na conta' })).toBeVisible();
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

test('a página de convite não entrega o token a analytics, ao histórico nem ao referrer', async ({ page }) => {
  const token = 'b'.repeat(64);
  const externalRequests = [];
  page.on('request', (request) => { if (!request.url().startsWith('http://127.0.0.1:4173')) externalRequests.push(request.url()); });
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
  await expect(page.locator(':focus')).toHaveText('Pular para o conteudo');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main$/);
});

test('o assistente avança por etapas, valida em linha e salva o rascunho no servidor', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/new-rfq.html');
  const form = page.locator('#rfq-form');
  await expect(form.locator('fieldset[data-step="0"]')).toBeVisible();
  await expect(form.locator('fieldset[data-step="1"]')).toBeHidden();
  await expect(page.locator('.stepper-item[aria-current="step"]')).toContainText('1. Produto');
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

test('conflito de rascunho entre abas é explicado e para de salvar', async ({ page }) => {
  await mockSession(page, { editor: { patchStatus: 409 } });
  await page.goto('/finance/new-rfq.html');
  await page.locator('#rfq-form').getByLabel('Título da solicitação').fill('Aba antiga');
  await expect(page.locator('.conflict')).toContainText('alterado em outra aba');
  await expect(page.getByRole('button', { name: 'Carregar a versão da outra aba' })).toBeVisible();
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

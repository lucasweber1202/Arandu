import { test, expect } from '@playwright/test';

// Enterprise SSO em Configurações e no login. A sessão e o servidor são
// simulados por `page.route`; a autorização fail-closed é provada em
// tests/database/financial-sso.sql e scripts/test-finance-sso.mjs.

const ORG = '00000000-0000-4000-8000-0000000000a1';
const CONN = '00000000-0000-4000-8000-000000000901';
const TXT = 'arandu-domain-verification=' + 'Ab3'.repeat(14);
const readiness = (overrides = {}) => ({ ready: false, operational: false, checks: [
  { key: 'state_secret', status: 'ok', detail: 'ARANDU_SSO_STATE_SECRET (≥ 32 caracteres) configurado no ambiente' },
  { key: 'broker', status: 'blocked', detail: 'Supabase Auth com SSO (SAML) habilitado no projeto e provedor cadastrado' },
  { key: 'domain', status: 'ok', detail: 'Domínio verificado por TXT no DNS e ligado à conexão' },
  { key: 'test_login', status: 'missing', detail: 'Ao menos um login SSO bem-sucedido em modo de teste' }], ...overrides });

async function mockSession(page, { role = 'admin', brokerConfigured = false } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    calls.push({ method: request.method(), path, body });
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], providers: [], contracts: [], tasks: [], rfqs: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, entity_scope: 'group', display_name: 'Paula Nogueira', title: 'Tesouraria' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin', base_currency: 'BRL' });
    if (path === 'entity-scopes') return json({ ok: true, rows: [], viewer_id: 'u1' });
    if (path === 'sso' && request.method() === 'GET') return json({ ok: true, state_secret_configured: true, broker_configured: brokerConfigured, challenge_prefix: '_arandu-challenge',
      connections: [{ id: CONN, protocol: 'saml', broker: 'supabase', display_name: 'Entra ID do grupo', provider_ref: 'sso:abc', status: 'testing', enforce_sso: false, max_session_hours: 8, sessions_valid_after: null, readiness: readiness() }],
      domains: [{ domain: 'vitta.example', connection_id: CONN, status: 'verified', verified_at: '2026-10-02T10:00:00Z' }, { domain: 'vittafoods.example', connection_id: null, status: 'pending', verified_at: null }],
      events: [{ connection_id: CONN, outcome: 'denied', reason_code: 'member_not_found', email_domain: 'vitta.example', happened_at: '2026-10-03T10:00:00Z' }] });
    if (path === 'sso/domains') return json({ ok: true, domain: body.domain, record: { type: 'TXT', name: `_arandu-challenge.${body.domain}`, value: TXT }, notice: 'Publique este registro TXT no DNS do domínio e depois clique em Verificar. O valor não é mostrado de novo; para trocar, reivindique de novo.' }, 201);
    if (path === 'sso/domains-verify') return json({ ok: false, error: 'Registro TXT não encontrado ou diferente do esperado. A propagação do DNS pode levar alguns minutos.', code: 'sso_domain_not_verified' }, 409);
    if (path === 'sso/status') return json({ ok: false, error: 'A conexão só fica ativa depois de um login SSO bem-sucedido em teste, com broker real.', code: 'sso_not_ready' }, 409);
    if (path === 'approval-policies') return json({ ok: true, can_admin: role === 'admin', flags: [], rows: [] });
    if (path === 'approval-delegations') return json({ ok: true, rows: [], viewer_id: 'u1' });
    if (path === 'service-accounts' || path === 'webhooks') return json({ ok: true, rows: [], secrets_configured: true });
    if (['approvals', 'notifications', 'decisions', 'events', 'comments', 'tasks', 'notification-preferences', 'scorecard-templates'].includes(path) || path.startsWith('private-documents')) return json({ ok: true, rows: [] });
    if (path === 'approval-policy') return json({ ok: true, required_for_decision: false });
    if (path === 'signals') return json({ ok: true });
    return json({ ok: false }, 404);
  });
  return calls;
}

async function noHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test('admin vê prontidão honesta: em teste e sem broker não é "operacional"', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/settings.html#sso');
  const section = page.locator('#sso');
  await expect(section.getByRole('heading', { name: 'Segurança: SSO corporativo' })).toBeVisible();
  await expect(section.getByRole('region', { name: 'Conexões SSO' }).getByText('Entra ID do grupo')).toBeVisible();
  await expect(section.getByText('não operacional')).toBeVisible();
  await expect(section.getByText('operacional', { exact: true })).toHaveCount(0);
  await expect(section.getByText(/ARANDU_SSO_BROKER=supabase/)).toBeVisible();
  await expect(section.locator('.sso-readiness').getByText('bloqueado')).toBeVisible();
  await section.getByText('Tentativas recentes (1)').click();
  await expect(section.getByText(/conta não convidada · vitta\.example/)).toBeVisible();
  // Ativar sem os pré-requisitos: o servidor recusa e a tela mostra o motivo.
  await section.getByRole('button', { name: 'Ativar', exact: true }).click();
  await expect(page.getByText(/login SSO bem-sucedido em teste/).first()).toBeVisible();
  expect(calls.find((call) => call.path === 'sso/status').body).toEqual({ connection_id: CONN, status: 'active', enforce: false });
  await noHorizontalOverflow(page);
});

test('reivindicar domínio mostra o TXT uma vez; verificação sem TXT falha com explicação', async ({ page }) => {
  const calls = await mockSession(page, { brokerConfigured: true });
  await page.goto('/finance/settings.html#sso');
  const section = page.locator('#sso');
  await section.locator('summary', { hasText: 'Reivindicar domínio' }).click();
  await section.getByLabel('Domínio de e-mail').fill('grupovitta.example');
  await section.getByRole('button', { name: 'Reivindicar domínio' }).click();
  await expect(section.locator('.secret-once').nth(1)).toHaveText(TXT);
  await expect(section.locator('.secret-once').first()).toHaveText('_arandu-challenge.grupovitta.example');
  expect(calls.find((call) => call.path === 'sso/domains').body).toEqual({ organization_id: ORG, domain: 'grupovitta.example' });
  await section.getByRole('button', { name: 'Verificar no DNS' }).click();
  await expect(page.getByText(/Registro TXT não encontrado/).first()).toBeVisible();
  await noHorizontalOverflow(page);
});

test('quem não é admin não vê a seção de SSO', async ({ page }) => {
  await mockSession(page, { role: 'finance_manager' });
  await page.goto('/finance/settings.html');
  await expect(page.getByRole('heading', { name: 'Seu nome e cargo' })).toBeVisible();
  await expect(page.locator('#sso')).toHaveCount(0);
});

test('login: SSO exigido bloqueia a senha e oferece o provedor; motivo de recusa aparece', async ({ page }) => {
  let started = null;
  await page.route('**/api/auth/login', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Sua empresa exige login pelo provedor corporativo (SSO). Use "Entrar com SSO".', code: 'sso_required' }) }));
  await page.route('**/api/auth/sso/discover', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, sso: true, required: true }) }));
  await page.route('**/api/auth/sso/start**', (route) => { started = new URL(route.request().url()); return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>idp</p>' }); });
  await page.goto('/login.html?next=%2Ffinance%2Frfqs.html');
  await page.getByLabel('E-mail corporativo').fill('paula@vitta.example');
  await page.getByLabel('Senha').fill('senha-qualquer');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('Sua empresa exige login pelo provedor corporativo (SSO).', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Entrar com SSO' }).click();
  await expect.poll(() => started?.searchParams.get('email')).toBe('paula@vitta.example');
  expect(started.searchParams.get('next')).toBe('/finance/rfqs.html');

  await page.goto('/login.html?sso_error=member_not_found');
  await expect(page.getByText(/ainda não foi convidada/)).toBeVisible();
  await page.goto('/login.html?sso_error=%3Cscript%3E');
  await expect(page.getByText('O provedor de identidade não concluiu o login. Tente de novo.')).toBeVisible();
  await noHorizontalOverflow(page);
});

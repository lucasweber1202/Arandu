// Isolamento de visitantes da Demo canônica (docs/demo/VISITOR_ISOLATION.md),
// no produto real: app em ARANDU_ENV=demo, Supabase local e pool com pelo menos
// dois workspaces prontos (npm run demo:local:workspaces -- provision --count=2).
// A jornada ESCREVE e consome dois workspaces; reponha o pool antes de repetir.
import { test, expect } from '@playwright/test';
import { RFQ_CREDIT } from '../../scripts/demo/dataset.mjs';

const ENABLED = process.env.ARANDU_DEMO_WORKSPACE_E2E === '1';
test.skip(!ENABLED, 'Defina ARANDU_DEMO_WORKSPACE_E2E=1 com o pool local abastecido (consome dois workspaces).');

const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REST = process.env.ARANDU_DEMO_REST_URL || 'http://localhost:3000';

async function enter(page, personaLabel) {
  await page.goto('/login.html');
  const panel = page.getByRole('region', { name: 'Entrar na demonstração' });
  await panel.getByRole('button', { name: new RegExp(personaLabel) }).click();
  await page.waitForURL(/\/(finance|provider)\//);
  await expect(page.locator('#view')).not.toHaveAttribute('aria-busy', 'true');
}

const api = (page, method, path, body) => page.evaluate(async ([m, p, b]) => {
  const response = await fetch(`/api/finance/${p}`, { method: m, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...(b ? { body: JSON.stringify(b) } : {}) });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}, [method, path, body]);

async function buyerOrg(page) {
  const { body } = await api(page, 'GET', 'organizations');
  return body.rows.find((row) => row.kind === 'BUYER');
}

test('dois visitantes simultâneos: workspaces, escritas, aprovações e sessões isolados', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'demo-desktop', 'Consome dois workspaces: roda uma vez, no projeto desktop.');
  test.setTimeout(240_000);
  const visitorA = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'pt-BR' });
  const visitorB = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'pt-BR' });
  const a = await visitorA.newPage();
  const b = await visitorB.newPage();
  await enter(a, 'Juliana Ramos');
  await enter(b, 'Juliana Ramos');

  // Cada visitante vê a sua Vitta Foods: mesmo nome, organizações diferentes.
  const orgA = await buyerOrg(a);
  const orgB = await buyerOrg(b);
  expect(orgA.legal_name).toBe('Vitta Foods S.A.');
  expect(orgB.legal_name).toBe('Vitta Foods S.A.');
  expect(orgA.id).not.toBe(orgB.id);
  expect((await api(a, 'GET', `overview?organization_id=${orgB.id}`)).status, 'A não lê a organização de B').toBeGreaterThanOrEqual(400);
  // Cada módulo, inclusive o pós-contrato, nega a organização de outro tenant pela API.
  for (const resource of ['rfqs', 'contracts', 'approvals', 'decisions', 'tasks', 'members', 'events', 'profile', 'portfolio', 'covenants',
    'spend', 'opportunities', 'qualifications', 'performance', 'implementations', 'extractions', 'approval-policies',
    'fees?start=2026-01-01&end=2026-12-31', 'value?start=2026-01-01&end=2026-12-31']) {
    const [name, extra] = resource.split('?');
    const denied = await api(a, 'GET', `${name}?organization_id=${orgB.id}${extra ? `&${extra}` : ''}`);
    expect(denied.status, `A lê ${name} de B`).toBe(403);
  }
  // Objeto de B com a organização própria de A (IDOR): nada de B volta.
  const rfqB = (await api(b, 'GET', `rfqs?organization_id=${orgB.id}`)).body.rows[0];
  expect(rfqB?.id).toBeTruthy();
  for (const path of [`rfq/${rfqB.id}`, `comparison?organization_id=${orgA.id}&rfq_id=${rfqB.id}`, `proposals?organization_id=${orgA.id}&rfq_id=${rfqB.id}`,
    `rfq-passport?organization_id=${orgA.id}&rfq_id=${rfqB.id}`, `decisions?organization_id=${orgA.id}&rfq_id=${rfqB.id}`]) {
    const probe = await api(a, 'GET', path);
    expect(JSON.stringify(probe.body), `IDOR em ${path.split('?')[0]}`).not.toContain(rfqB.id);
    expect(JSON.stringify(probe.body)).not.toContain(orgB.id);
  }

  // A cria uma RFQ; B não a vê.
  const title = `Isolamento A ${Date.now()}`;
  const created = await api(a, 'POST', 'rfqs', { organization_id: orgA.id, product: 'credit', title, description: 'Teste de isolamento entre visitantes.', demand: RFQ_CREDIT.demand });
  expect(created.status, JSON.stringify(created.body)).toBeLessThan(300);
  const rfqsB = await api(b, 'GET', `overview?organization_id=${orgB.id}`);
  expect(JSON.stringify(rfqsB.body)).not.toContain(title);
  const rfqsA = await api(a, 'GET', `overview?organization_id=${orgA.id}`);
  expect(JSON.stringify(rfqsA.body)).toContain(title);

  // Quota pela API real: com o limite de RFQs igual ao uso atual, a próxima
  // criação recebe 429 com mensagem clara, sem detalhe interno.
  if (SERVICE) {
    const wsA = (await visitorA.cookies()).find((cookie) => cookie.name === 'arandu_demo_ws').value.split('.')[0];
    const used = (rfqsA.body.rfqs || []).length;
    const quota = await fetch(`${REST}/fin_demo_workspaces?id=eq.${wsA}`, { method: 'PATCH', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ quotas: { rfqs: used, documents: 40, invites: 80, organizations: 1 } }) });
    expect(quota.ok).toBe(true);
    const blocked = await api(a, 'POST', 'rfqs', { organization_id: orgA.id, product: 'credit', title: `${title} excedente`, description: 'Além da quota.', demand: RFQ_CREDIT.demand });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('demo_workspace_quota');
    expect(JSON.stringify(blocked.body)).not.toMatch(/quota exceeded|fin_demo|plpgsql|trigger/);
  }

  // Troca de persona em A (CFO) no mesmo workspace; A aprova a etapa pendente.
  await enter(a, 'Helena Duarte');
  expect((await buyerOrg(a)).id, 'troca de persona mantém o workspace').toBe(orgA.id);
  const pendingA = (await api(a, 'GET', `approvals?organization_id=${orgA.id}`)).body.rows.find((row) => row.status === 'pending');
  expect(pendingA).toBeTruthy();
  const acted = await api(a, 'POST', 'approvals/act', { request_id: pendingA.id, action: 'approved', comment: 'Aprovado no workspace A (teste de isolamento).' });
  expect(acted.status, JSON.stringify(acted.body)).toBeLessThan(300);

  // A aprovação de B continua pendente, e a sessão de B segue intacta (Juliana).
  const approvalsB = (await api(b, 'GET', `approvals?organization_id=${orgB.id}`)).body.rows;
  expect(approvalsB.some((row) => row.status === 'pending'), 'aprovação de B não foi afetada').toBe(true);
  expect((await buyerOrg(b)).id).toBe(orgB.id);

  // Portal do provedor dentro do workspace de A: não vê nada de B.
  await enter(a, 'Diego Freitas');
  await expect(a).toHaveURL(/\/provider\//);
  const providerOrg = (await api(a, 'GET', 'organizations')).body.rows.find((row) => row.kind === 'PROVIDER');
  const assignments = await api(a, 'GET', `assignments?organization_id=${providerOrg.id}`);
  expect(assignments.status).toBe(200);
  expect(JSON.stringify(assignments.body)).not.toContain(orgB.id);

  // Cookie de workspace manipulado (ID de B com o token de A) não abre B.
  const cookies = await visitorA.cookies();
  const own = cookies.find((cookie) => cookie.name === 'arandu_demo_ws');
  expect(own?.httpOnly).toBe(true);
  const ownId = own.value.split('.')[0];
  const wsB = (await visitorB.cookies()).find((cookie) => cookie.name === 'arandu_demo_ws').value.split('.')[0];
  await visitorA.addCookies([{ ...own, value: `${wsB}.${own.value.split('.')[1]}` }]);
  const forged = await a.evaluate(async () => (await fetch('/api/auth/demo-login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: 'juliana' }) })).status);
  if (forged === 200) expect((await buyerOrg(a)).id, 'cookie forjado nunca entrega o workspace de B').not.toBe(orgB.id);
  else expect([429, 503]).toContain(forged);

  // Expiração: com o workspace de B vencido (service role, só no ambiente local),
  // a sessão de B cai na próxima requisição, ainda que o JWT seja válido.
  if (SERVICE) {
    const expire = await fetch(`${REST}/fin_demo_workspaces?id=eq.${wsB}`, { method: 'PATCH', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ expires_at: new Date(Date.now() - 1000).toISOString(), idle_expires_at: new Date(Date.now() - 1000).toISOString() }) });
    expect(expire.ok).toBe(true);
    await expect.poll(async () => (await api(b, 'GET', 'organizations')).status, { timeout: 30_000, intervals: [2_000] }).toBe(401);
  }
  expect(ownId).not.toBe(wsB);
  await visitorA.close();
  await visitorB.close();
});

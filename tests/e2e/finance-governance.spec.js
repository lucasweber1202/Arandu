import { test, expect } from '@playwright/test';

// Governança de dados em Configurações (P0.11). Servidor simulado por
// `page.route`; papéis, RLS, hold, retenção, export e offboarding são provados
// em tests/database/financial-data-governance.sql e
// scripts/test-finance-data-governance.mjs.

const ORG = '00000000-0000-4000-8000-0000000000a1';
const EXPORT = '00000000-0000-4000-8000-000000000b01';
const REQUEST = '00000000-0000-4000-8000-000000000b02';
const CLASSES = [
  { retention_class: 'CONTACT_PII', min_days: 30, max_days: 3650, action: 'anonymize' },
  { retention_class: 'SECURITY_EVENT', min_days: 365, max_days: 3650, action: 'delete' },
  { retention_class: 'TEMPORARY_OPERATIONAL', min_days: 30, max_days: 3650, action: 'delete' },
  { retention_class: 'WEBHOOK_DELIVERY', min_days: 30, max_days: 3650, action: 'delete' }
];

async function mockSession(page, { role = 'admin', offboarding = [], bigExport = false, tamper = false } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    calls.push({ method: request.method(), path, body, query: Object.fromEntries(url.searchParams) });
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], providers: [], contracts: [], tasks: [], rfqs: [] });
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, entity_scope: 'group', display_name: 'Paula Nogueira', title: 'Tesouraria' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin', base_currency: 'BRL' });
    if (path === 'entity-scopes') return json({ ok: true, rows: [], viewer_id: 'u1' });
    if (path === 'governance' && request.method() === 'GET') return json({ ok: true, bundle_max_bytes: 4000000,
      catalog: { tables: 77, personal_data_tables: 9, credential_tables: 7, export_datasets: Array.from({ length: 50 }, (_, i) => `d${i}`) },
      summary: { retention_classes: CLASSES, active_holds: 0, offboarding: offboarding[0] || null, last_retention: null },
      policies: [{ id: 'p1', retention_class: 'TEMPORARY_OPERATIONAL', version: 1, retention_days: 90, status: 'draft', reason: 'Avisos antigos perdem utilidade' }],
      holds: [], log: [], offboarding,
      exports: [{ id: EXPORT, purpose: 'portability', status: 'ready', requested_at: '2026-10-03T10:00:00Z', completed_at: '2026-10-03T10:01:00Z', expires_at: '2026-10-10T10:01:00Z', dataset_count: 50, row_count: 1234, byte_size: bigExport ? 5000000 : 250000 }] });
    // Conjunto grande em duas faixas; sha256('abcdefghijkl') no manifesto.
    if (path === 'governance/export-download' && url.searchParams.get('manifest') === '1') return json({ ok: true, range_max_chars: 4000000,
      manifest: { datasets: [{ dataset: 'events', bytes: 12, sha256: 'd682ed4ca4d989c134ec94f1551e1ec580dd6d5a6ecde9f3d35e6e4a717fbde4' }] } });
    if (path === 'governance/export-download' && url.searchParams.get('dataset') === 'events') {
      const offset = Number(url.searchParams.get('offset'));
      return json(offset === 0 ? { ok: true, content: 'abcdef', total_chars: 12, next_offset: 6 } : { ok: true, content: tamper ? 'XXXXXX' : 'ghijkl', total_chars: 12, next_offset: null });
    }
    if (path === 'governance/retention-policies') return json({ ok: true, id: 'p2', status: 'draft' }, 201);
    if (path === 'governance/retention-activate') return json({ ok: true });
    if (path === 'governance/retention-preview') return json({ ok: true, preview: { dry_run: true, items: [{ retention_class: 'TEMPORARY_OPERATIONAL', eligible: 12, policy_version: 1, held: false }] } });
    if (path === 'governance/legal-holds') return json({ ok: true, id: 'h1' }, 201);
    if (path === 'governance/exports') return json({ ok: true, id: EXPORT, status: 'requested', notice: 'O pacote é montado em segundo plano. Ele fica disponível por 7 dias depois de pronto.' }, 202);
    if (path === 'governance/offboarding') return json({ ok: true, id: REQUEST }, 201);
    if (path === 'governance/offboarding-action') return json({ ok: true, status: 'retention_window' });
    if (path === 'approval-policies') return json({ ok: true, can_admin: role === 'admin', flags: [], rows: [] });
    if (path === 'approval-delegations') return json({ ok: true, rows: [], viewer_id: 'u1' });
    if (path === 'service-accounts' || path === 'webhooks') return json({ ok: true, rows: [], secrets_configured: true });
    if (path === 'sso') return json({ ok: true, state_secret_configured: true, broker_configured: false, connections: [], domains: [], events: [] });
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

test('admin vê governança sem prazo sugerido, cria política, faz prévia, hold e export', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/settings.html#dados');
  const section = page.locator('#dados');
  await expect(section.getByRole('heading', { name: 'Governança de dados' })).toBeVisible();
  await expect(section.getByText(/77 tabelas classificadas/)).toBeVisible();
  await expect(section.getByText('sem retenção automática')).toHaveCount(4);
  await expect(section.getByLabel('Prazo (dias)')).toHaveValue('');
  await section.getByLabel('Classe', { exact: true }).first().selectOption('SECURITY_EVENT');
  await section.getByLabel('Prazo (dias)').fill('730');
  await section.getByLabel('Motivo', { exact: true }).fill('Investigação de acesso por dois anos');
  await section.getByRole('button', { name: 'Criar rascunho de política' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'governance/retention-policies')?.body).toEqual({
    organization_id: ORG, retention_class: 'SECURITY_EVENT', retention_days: 730, reason: 'Investigação de acesso por dois anos', decision_reference: '' });
  await section.getByRole('button', { name: 'Prévia: o que sairia hoje (sem apagar)' }).click();
  await expect(section.getByText(/12 registro\(s\) elegível\(is\) pela política v1/)).toBeVisible();
  await section.getByLabel('Motivo (sem dado pessoal)').fill('Auditoria externa em curso');
  await section.getByRole('button', { name: 'Criar legal hold' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'governance/legal-holds')?.body?.scope_type).toBe('organization');
  const download = section.getByRole('link', { name: 'Baixar pacote (JSON)' });
  await expect(download).toHaveAttribute('href', `/api/finance/governance/export-download?export_id=${EXPORT}`);
  await section.getByRole('button', { name: 'Pedir export dos dados' }).click();
  await expect(page.getByText(/montado em segundo plano/).first()).toBeVisible();
  await noHorizontalOverflow(page);
});

test('offboarding exige confirmação explícita, janela e referência antes de revogar', async ({ page }) => {
  const calls = await mockSession(page, { offboarding: [{ id: REQUEST, status: 'export_ready', requested_at: '2026-10-03T10:00:00Z', reason: 'Encerramento do contrato' }] });
  await page.goto('/finance/settings.html#dados');
  const section = page.locator('#dados');
  await expect(section.locator('.tag', { hasText: 'export pronto' })).toBeVisible();
  await section.getByLabel('Janela de retenção pós-contrato (dias)').fill('90');
  await section.getByLabel('Referência da decisão').last().fill('CONTRATO-2026-7');
  await section.getByRole('button', { name: 'Revogar todos os acessos' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(/perdem acesso imediatamente/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  expect(calls.some((call) => call.path === 'governance/offboarding-action')).toBe(false);
  await section.getByRole('button', { name: 'Revogar todos os acessos' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revogar agora' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'governance/offboarding-action')?.body).toEqual({
    request_id: REQUEST, action: 'confirm_revocation', retention_days: 90, decision_reference: 'CONTRATO-2026-7', export_waived: false, confirm: true });
  await noHorizontalOverflow(page);
});

test('quem não administra o grupo não vê a seção de governança', async ({ page }) => {
  const calls = await mockSession(page, { role: 'finance_manager' });
  await page.goto('/finance/settings.html');
  await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible();
  await expect(page.locator('#dados')).toHaveCount(0);
  expect(calls.some((call) => call.path.startsWith('governance'))).toBe(false);
});

test('pacote grande: baixa por conjunto em faixas e confere o checksum do manifesto', async ({ page }) => {
  const calls = await mockSession(page, { bigExport: true });
  await page.goto('/finance/settings.html#dados');
  const section = page.locator('#dados');
  await expect(section.getByRole('link', { name: 'Baixar pacote (JSON)' })).toHaveCount(0);
  const downloads = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await section.getByRole('button', { name: 'Baixar por conjunto' }).click();
  await expect(page.getByText('Conjuntos baixados e conferidos com o manifesto.')).toBeVisible();
  const ranges = calls.filter((call) => call.path === 'governance/export-download' && call.query.dataset === 'events').map((call) => call.query.offset);
  expect(ranges).toEqual(['0', '6']);
  expect(calls.some((call) => call.path === 'governance/export-download' && call.query.manifest === '1')).toBe(true);
  await expect.poll(() => downloads.sort()).toEqual(['arandu-export-' + EXPORT + '-manifest.json', 'events.json']);
  await noHorizontalOverflow(page);
});

test('pacote grande com faixa adulterada não salva o conjunto', async ({ page }) => {
  await mockSession(page, { bigExport: true, tamper: true });
  await page.goto('/finance/settings.html#dados');
  const downloads = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.locator('#dados').getByRole('button', { name: 'Baixar por conjunto' }).click();
  await expect(page.getByText(/não conferiu com o checksum do manifesto/)).toBeVisible();
  expect(downloads.includes('events.json')).toBe(false);
});

import { test, expect } from '@playwright/test';
// Central Financeira 360°: compromissos do CRM e revisões de tarifa entram em
// "Precisa de você", com origem navegável, filtro por origem e modo degradado.
// APIs SIMULADAS: mock com estado que segue financial-crm-v1 e fees/summary.
// Não é validação contra Supabase/RPC reais (pendente no ambiente canônico).
const ORG = '00000000-0000-4000-8000-0000000000a1';
const P_ATLAS = '00000000-0000-4000-8000-0000000000b1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const A1 = '00000000-0000-4000-8000-0000000000d1';
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const CONTRACT = { id: C1, organization_id: ORG, provider_id: P_ATLAS, provider_name: 'Atlas Bank', product: 'credit', title: 'Capital de giro', status: 'active', origin: 'imported', starts_on: day(-300), ends_on: day(400), renewal_notice_days: 60, current_version: 1, legal_entity_id: null, owner_id: 'u1' };
const OVERVIEW = { ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta', sector: 'industry' }, profile: [], providers: [{ id: P_ATLAS, name: 'Atlas Bank', kind: 'bank', status: 'active' }], contracts: [CONTRACT], rfqs: [], tasks: [] };
const RELATIONSHIP = { ok: true, provider: { id: P_ATLAS, name: 'Atlas Bank' }, neutrality: 'Fatos do histórico da empresa.', contracts: [CONTRACT], tasks: [], facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [],
  metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 1, open_issues: 0, median_resolution_days: null, definitions: {} } };
const SUMMARY = [{ currency: 'BRL', schedules: 4, schedules_observed: 3, observations: 6, verified: 4, above: 2, above_total: 880.4, below: 0, below_total: 0, equal: 1, not_comparable: 1, missing_reference: 0, open_review: 2, under_review: 0, closed_review: 1, contracted_total: 1000, observed_total: 1880.4 }];

async function setup(page, { role = 'admin', crmFails = false, feesStatus = 200 } = {}) {
  const activities = [{ id: A1, organization_id: ORG, version: 1, kind: 'follow_up', subject: 'Retornar sobre tarifa PIX', status: 'planned', due_on: day(-1), owner_id: 'u1', source_reference: 'Reunião de 20/10', related_type: 'provider', related_id: P_ATLAS }];
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method(), query: Object.fromEntries(u.searchParams) });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json(OVERVIEW);
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Paula Nogueira' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin' });
    if (path === 'provider-relationship') return json(RELATIONSHIP);
    if (path === 'fees/summary') return feesStatus === 200 ? json({ ok: true, summary: SUMMARY, lines: [] }) : json({ ok: false, error: 'indisponível' }, feesStatus);
    if (path === 'fees' && req.method() === 'GET') return json({ ok: true, cards: [], columns: ['Serviço'], rows: [], next: null, empty: { title: 'Sem cobranças', text: '—' }, options: { review_status: [['new', 'Revisão necessária']], currency: [['BRL', 'BRL']] }, forms: [] });
    if (path.startsWith('crm-')) {
      if (crmFails) return json({ ok: false, error: 'falha' }, 500);
      if (path === 'crm-activities' && req.method() === 'PATCH') {
        const body = JSON.parse(req.postData());
        const row = activities.find((a) => a.id === body.id);
        if (row.version !== body.expected_version) return json({ ok: false, code: 'crm_conflict' }, 409);
        Object.assign(row, body.values, { version: row.version + 1 });
        return json({ ok: true, id: row.id, object_type: 'activity', version: row.version, replayed: false });
      }
      if (path === 'crm-activities') {
        const status = u.searchParams.get('status');
        const before = u.searchParams.get('due_before');
        return json({ ok: true, api_version: 'financial-crm-v1', rows: activities.filter((a) => (!status || a.status === status) && (!before || (a.due_on && a.due_on <= before))), next: null });
      }
      return json({ ok: true, api_version: 'financial-crm-v1', rows: [], next: null });
    }
    return json({ ok: true, rows: [] });
  });
  return { calls, activities };
}

test('Painel reúne compromisso do CRM e revisão de tarifas, filtra por origem e leva à evidência', async ({ page }) => {
  const { calls } = await setup(page);
  await page.goto('/finance/dashboard.html');
  const attention = page.locator('#precisa-de-voce');
  await expect(attention.getByRole('link', { name: 'Retornar sobre tarifa PIX · Atlas Bank' })).toBeVisible();
  await expect(attention.getByRole('link', { name: 'Revisar 2 cobranças de tarifa em BRL' })).toBeVisible();
  await expect(attention.getByText(/2 acima da referência contratada/)).toBeVisible();
  await expect(attention.getByText(/não é erro nem economia/).first()).toBeVisible();

  // Consulta usa o contrato canônico: agenda ordenada por prazo, só planejados.
  const crmCall = calls.find((c) => c.path === 'crm-activities');
  expect(crmCall.query).toMatchObject({ organization_id: ORG, status: 'planned', sort: 'due_on.asc.nullslast,id.asc' });
  expect(calls.find((c) => c.path === 'fees/summary').query.organization_id).toBe(ORG);

  // Filtro por origem isola Relacionamentos.
  const filters = attention.getByRole('group', { name: 'Filtrar pendências por origem' });
  await filters.getByRole('button', { name: /Relacionamentos/ }).click();
  await expect(filters.getByRole('button', { name: /Relacionamentos/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(attention.getByRole('link', { name: 'Revisar 2 cobranças de tarifa em BRL' })).toBeHidden();
  await expect(attention.getByRole('link', { name: 'Retornar sobre tarifa PIX · Atlas Bank' })).toBeVisible();
  await filters.getByRole('button', { name: /Todas/ }).click();

  // Do sinal ao registro que o originou: lista de tarifas já filtrada.
  await attention.getByRole('link', { name: 'Revisar 2 cobranças de tarifa em BRL' }).click();
  await expect(page).toHaveURL(/fees\.html\?.*review_status=new/);
  await expect.poll(() => calls.filter((c) => c.path === 'fees').at(-1)?.query.review_status).toBe('new');
  expect(calls.filter((c) => c.path === 'fees').at(-1).query.currency).toBe('BRL');
});

test('jornada de relacionamento: concluir o follow-up na instituição tira o item do Painel', async ({ page }) => {
  const { activities } = await setup(page);
  await page.goto('/finance/dashboard.html');
  const item = page.locator('#precisa-de-voce').getByRole('link', { name: 'Retornar sobre tarifa PIX · Atlas Bank' });
  await item.click();
  await expect(page).toHaveURL(new RegExp(`providers\\.html\\?provider_id=${P_ATLAS}`));
  const crm = page.getByRole('dialog', { name: 'Atlas Bank' }).locator('.crm-workspace');
  await crm.getByRole('button', { name: 'Marcar como realizada: Retornar sobre tarifa PIX' }).click();
  const form = page.getByRole('dialog', { name: /Registrar realização/ });
  await form.getByLabel(/^Fonte/).fill('Ligação com o gerente em 03/11');
  await form.getByRole('button', { name: 'Gravar' }).click();
  await expect(page.getByText('Atividade registrada como realizada.')).toBeVisible();
  expect(activities[0].status).toBe('recorded');

  await page.goto('/finance/dashboard.html');
  await expect(page.locator('#precisa-de-voce').getByRole('link', { name: 'Revisar 2 cobranças de tarifa em BRL' })).toBeVisible();
  await expect(page.locator('#precisa-de-voce').getByText('Retornar sobre tarifa PIX')).toHaveCount(0);
});

test('fonte que falha vira aviso, nunca "Tudo em dia"; 503 é informado como indisponível', async ({ page }) => {
  await setup(page, { crmFails: true, feesStatus: 503 });
  await page.goto('/finance/dashboard.html');
  const attention = page.locator('#precisa-de-voce');
  await expect(attention.getByRole('alert').filter({ hasText: 'Não conseguimos carregar Relacionamentos' })).toBeVisible();
  await expect(attention.getByText('Tarifas: ainda não disponível neste ambiente')).toBeVisible();
  await expect(attention.getByText('Tudo em dia')).toHaveCount(0);
  await expect(attention.getByRole('link', { name: 'Abrir agenda comercial' })).toHaveAttribute('href', /providers\.html#crm-agenda/);
});

test('leitor não recebe revisão de tarifas nem consulta o resumo', async ({ page }) => {
  const { calls } = await setup(page, { role: 'viewer' });
  await page.goto('/finance/dashboard.html');
  await expect(page.locator('#precisa-de-voce').getByRole('link', { name: 'Retornar sobre tarifa PIX · Atlas Bank' })).toBeVisible();
  await expect(page.locator('#precisa-de-voce').getByText(/cobranças de tarifa/)).toHaveCount(0);
  expect(calls.some((c) => c.path === 'fees/summary')).toBe(false);
});

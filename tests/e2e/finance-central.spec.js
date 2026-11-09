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

async function setup(page, { role = 'admin', crmFails = false, feesStatus = 200, overview = OVERVIEW, extraActivities = [] } = {}) {
  const activities = [...extraActivities, { id: A1, organization_id: ORG, version: 1, kind: 'follow_up', subject: 'Retornar sobre tarifa PIX', status: 'planned', due_on: day(-1), owner_id: 'u1', source_reference: 'Reunião de 20/10', related_type: 'provider', related_id: P_ATLAS }];
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method(), query: Object.fromEntries(u.searchParams) });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json(overview);
    if (path === 'contract-detail') return json({ ok: true, contract: CONTRACT, effective: null, versions: [], amendments: [], milestones: [], children: [], documents: [], events: [] });
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
        const related = u.searchParams.get('related_id');
        return json({ ok: true, api_version: 'financial-crm-v1', rows: activities.filter((a) => (!status || a.status === status) && (!before || (a.due_on && a.due_on <= before)) && (!related || a.related_id === related)), next: null });
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

const CONTRACT_FOLLOW_UP = { id: '00000000-0000-4000-8000-0000000000d2', organization_id: ORG, version: 1, kind: 'meeting', subject: 'Reunião de renovação do giro', status: 'planned', due_on: day(10), owner_id: 'u2', source_reference: 'Comitê', related_type: 'contract', related_id: C1 };

test('contrato como ponto de entrada: próximas ações, conciliação de tarifas e volta à instituição', async ({ page }) => {
  const { calls } = await setup(page, { extraActivities: [CONTRACT_FOLLOW_UP] });
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${C1}`);
  const dialog = page.getByRole('dialog', { name: 'Capital de giro' });
  const next = dialog.locator('[data-scope="contract"]');
  await expect(next.getByRole('heading', { name: 'Próximas ações deste contrato' })).toBeVisible();
  // Só o compromisso vinculado ao contrato (o follow-up da instituição fica fora), com responsável nomeado.
  await expect(next.getByText('Reunião de renovação do giro · Atlas Bank')).toBeVisible();
  // Responsável fora da lista de membros: rótulo legível, nunca o identificador.
  await expect(next.getByText(/Outra pessoa da equipe/)).toBeVisible();
  await expect(next).not.toContainText('u2');
  await expect(next.getByText('Retornar sobre tarifa PIX')).toHaveCount(0);
  await expect(next.getByText('Revisar 2 cobranças de tarifa em BRL')).toBeVisible();
  // Conciliação: fatos do servidor, sem claim de economia.
  await expect(next.getByRole('heading', { name: 'Tarifas: contratado × cobrado' })).toBeVisible();
  await expect(next.getByText('6 cobranças observadas · 2 com diferença frente ao contratado')).toBeVisible();
  await expect(next).not.toContainText(/economia (recuperada|de|gerada)/i);
  expect(calls.find((c) => c.path === 'fees/summary' && c.query.contract_id)?.query.contract_id).toBe(C1);
  expect(calls.find((c) => c.path === 'crm-activities' && c.query.related_id)?.query.related_id).toBe(C1);
  // O compromisso leva ao relacionamento da instituição (o vínculo direto fica em "Trabalho deste contrato").
  await expect(next.getByRole('link', { name: 'Abrir', exact: true })).toHaveAttribute('href', new RegExp(`provider_id=${P_ATLAS}`));
  await next.getByRole('link', { name: 'Revisar 2 pendentes em BRL' }).click();
  await expect(page).toHaveURL(new RegExp(`fees\\.html\\?.*contract_id=${C1}`));
  await expect.poll(() => calls.filter((c) => c.path === 'fees').at(-1)?.query.contract_id).toBe(C1);
  expect(calls.filter((c) => c.path === 'fees').at(-1).query.review_status).toBe('new');
});

test('contrato: tarifas indisponíveis viram aviso e não mostram conciliação vazia', async ({ page }) => {
  await setup(page, { feesStatus: 500 });
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${C1}`);
  const next = page.getByRole('dialog', { name: 'Capital de giro' }).locator('[data-scope="contract"]');
  await expect(next.getByRole('alert')).toContainText('Não conseguimos carregar Tarifas');
  await expect(next.getByRole('heading', { name: 'Tarifas: contratado × cobrado' })).toHaveCount(0);
});

test('instituição: agenda comercial, revisão de tarifas, conciliação e Copilot no mesmo recorte', async ({ page }) => {
  const { calls } = await setup(page, { extraActivities: [CONTRACT_FOLLOW_UP] });
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const section = page.getByRole('dialog', { name: 'Atlas Bank' }).locator('[data-scope="provider"]');
  await expect(section.getByRole('heading', { name: 'Agenda comercial e tarifas desta instituição' })).toBeVisible();
  // Vínculo direto com a instituição e via contrato entram; a equipe inteira, não só quem lê.
  await expect(section.getByText('Retornar sobre tarifa PIX · Atlas Bank')).toBeVisible();
  await expect(section.getByText('Reunião de renovação do giro · Atlas Bank')).toBeVisible();
  await expect(section.getByRole('button', { name: 'Ver no registro comercial' }).first()).toBeVisible();
  await expect(section.getByRole('link', { name: 'Revisar tarifas' })).toHaveAttribute('href', new RegExp(`provider_id=${P_ATLAS}.*|review_status=new`));
  expect(calls.find((c) => c.path === 'fees/summary' && c.query.provider_id)?.query.provider_id).toBe(P_ATLAS);
  await expect(section.getByRole('group', { name: 'Perguntar ao Copilot sobre Atlas Bank' }).getByRole('button', { name: 'Resumir relacionamento' })).toBeVisible();
});

test('Painel: "Aguardando instituições" mostra convites sem resposta e leva à solicitação', async ({ page }) => {
  const RFQ = '00000000-0000-4000-8000-0000000000e1';
  await setup(page, { overview: { ...OVERVIEW, rfqs: [{ id: RFQ, title: 'Capital de giro 2027', status: 'collecting', product: 'credit', response_deadline: day(4), invites: [{ provider_id: P_ATLAS, status: 'accepted' }, { provider_id: 'x', status: 'invited' }], proposals: [], revision: 1 }] } });
  await page.goto('/finance/dashboard.html');
  const card = page.locator('#aguardando-terceiros');
  await expect(card.getByRole('link', { name: 'Capital de giro 2027' })).toHaveAttribute('href', new RegExp(`rfq\\.html\\?id=${RFQ}`));
  await expect(card).toContainText('Aguardando 2 de 2 instituições');
});

// Arandu 9.1 — a pendência da Caixa de Trabalho leva ao Contract 360 aberto,
// não apenas a uma linha destacada na lista de contratos.
test('Caixa de Trabalho: pendência de contrato abre o Contract 360 do contrato vinculado', async ({ page }) => {
  const task = { id: '00000000-0000-4000-8000-0000000000e1', organization_id: ORG, title: 'Enviar comprovante de garantia', status: 'open', due_on: day(5), assignee_id: 'u1', related_type: 'contract', related_id: C1 };
  await setup(page, { overview: { ...OVERVIEW, tasks: [task] } });
  await page.route('**/api/finance/tasks?*', (route) => route.fulfill({ json: { ok: true, rows: [task], page: { limit: 25, has_more: false, next_cursor: null } } }));
  await page.goto('/finance/tasks.html');
  const link = page.getByRole('link', { name: 'Atlas Bank · Capital de giro' });
  await expect(link).toHaveAttribute('href', `/finance/contracts.html?abrir=contrato#contract-${C1}`);
  await link.click();
  await expect(page.getByRole('dialog', { name: 'Capital de giro' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

// Arandu 9.1 — Caixa de Trabalho recortada por contrato: o recorte vai ao
// servidor (contract_id) e combina com responsável; volta ao contrato e sai do recorte.
test('Caixa de Trabalho por contrato: contract_id no servidor, combinado com sem responsável, com volta ao contrato', async ({ page }) => {
  const task = { id: '00000000-0000-4000-8000-0000000000e2', organization_id: ORG, title: 'Renovar seguro da garantia', status: 'open', due_on: null, assignee_id: null, related_type: 'contract', related_id: C1 };
  await setup(page);
  const seen = [];
  await page.route('**/api/finance/tasks?*', (route) => { const u = new URL(route.request().url()); seen.push(u.searchParams); return route.fulfill({ json: { ok: true, rows: u.searchParams.get('contract_id') ? [task] : [], page: { limit: 50, has_more: false, next_cursor: null } } }); });
  await page.goto(`/finance/tasks.html?contrato=${C1}`);
  await expect(page.getByText('Somente tarefas do contrato Atlas Bank · Capital de giro')).toBeVisible();
  await expect(page.getByText('Renovar seguro da garantia')).toBeVisible();
  expect(seen.at(-1).get('contract_id')).toBe(C1);
  await page.getByLabel('Mostrar tarefas').selectOption('sem-responsavel');
  await expect.poll(() => seen.at(-1).get('unassigned')).toBe('true');
  expect(seen.at(-1).get('contract_id')).toBe(C1);
  await expect(page.getByRole('link', { name: 'Abrir contrato' })).toHaveAttribute('href', `/finance/contracts.html?abrir=contrato#contract-${C1}`);
  await page.getByRole('button', { name: 'Ver todas as tarefas' }).click();
  await expect.poll(() => seen.at(-1).get('contract_id')).toBeNull();
  await expect(page).not.toHaveURL(/contrato=/);
  await expect(page.getByText(/Somente tarefas do contrato/)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('Contract 360 leva às tarefas do contrato na Caixa de Trabalho', async ({ page }) => {
  await setup(page);
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${C1}`);
  const dialog = page.getByRole('dialog', { name: 'Capital de giro' });
  await expect(dialog.getByRole('link', { name: 'Tarefas deste contrato na Caixa de Trabalho' })).toHaveAttribute('href', `/finance/tasks.html?contrato=${C1}`);
});

test('Contract 360: índice leva à seção sem trocar o endereço do contrato', async ({ page }) => {
  await setup(page);
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${C1}`);
  const dialog = page.getByRole('dialog', { name: 'Capital de giro' });
  const index = dialog.getByRole('navigation', { name: 'Seções deste contrato' });
  await expect(index.getByRole('button', { name: 'Aditivos' })).toBeVisible();
  await expect(index.getByRole('button', { name: /^Termos vigentes/ })).toBeVisible();
  await expect(index.getByRole('button', { name: 'Trabalho deste contrato' })).toBeVisible();
  await index.getByRole('button', { name: 'Marcos e obrigações' }).click();
  await expect(dialog.getByRole('heading', { name: 'Marcos e obrigações' })).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`abrir=contrato#contract-${C1}$`));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('Caixa de Trabalho: tarefa de contrato volta ao relacionamento; vazio no recorte não fala da empresa toda', async ({ page }) => {
  const task = { id: '00000000-0000-4000-8000-0000000000e3', organization_id: ORG, title: 'Conferir aviso prévio', status: 'open', due_on: day(3), assignee_id: 'u1', related_type: 'contract', related_id: C1 };
  await setup(page, { role: 'viewer' });
  let rows = [task];
  await page.route('**/api/finance/tasks?*', (route) => route.fulfill({ json: { ok: true, rows, page: { limit: 50, has_more: false, next_cursor: null } } }));
  await page.goto('/finance/tasks.html');
  await expect(page.getByRole('link', { name: 'Relacionamento com Atlas Bank' })).toHaveAttribute('href', `/finance/providers.html?provider_id=${P_ATLAS}`);
  rows = [];
  await page.goto(`/finance/tasks.html?contrato=${C1}`);
  await expect(page.getByText('Nenhuma tarefa aberta neste contrato')).toBeVisible();
});

// Plano de renovações (contratos): grupos pelo prazo do aviso prévio, tarefas
// abertas, renovação em andamento e ações reais. API SIMULADA.
const RW = (n) => `00000000-0000-4000-8000-0000000007${String(n).padStart(2, '0')}`;
const RENEWALS = [
  { ...CONTRACT, id: RW(1), title: 'Giro sazonal', ends_on: day(70), renewal_notice_days: 60, owner_id: 'u1' },
  { ...CONTRACT, id: RW(2), title: 'Fiança aduaneira', product: 'acquiring', ends_on: day(30), renewal_notice_days: 60, owner_id: null },
  { ...CONTRACT, id: RW(3), title: 'Conta garantida', ends_on: null, owner_id: 'u1' },
  { ...CONTRACT, id: RW(4), title: 'Antecipação', status: 'renewing', ends_on: day(150), renewal_notice_days: 60, owner_id: 'u1' },
  { ...CONTRACT, id: RW(5), title: 'Longo prazo', ends_on: day(900), renewal_notice_days: 60, owner_id: 'u1' }
];

test('plano de renovações agrupa pelo prazo do aviso, mostra tarefas e quem responde, sem tratar falta de data como tranquilo', async ({ page }) => {
  const tasks = [{ id: '00000000-0000-4000-8000-0000000008a1', title: 'Pedir minuta', due_on: day(5), status: 'open', related_type: 'contract', related_id: RW(1), assignee_id: 'u1' }];
  await setup(page, { overview: { ...OVERVIEW, contracts: RENEWALS, tasks } });
  await page.goto('/finance/contracts.html');
  await page.locator('#plano-renovacoes-toggle > summary').click();
  const plan = page.locator('#plano-renovacoes');
  await expect(plan.locator('.renewal-past_notice [data-contract]')).toHaveCount(1);
  await expect(plan.locator(`.renewal-past_notice [data-contract="${RW(2)}"]`)).toContainText('Sem responsável');
  await expect(plan.locator(`.renewal-soon [data-contract="${RW(1)}"]`)).toContainText('1 tarefa aberta');
  await expect(plan.locator(`.renewal-soon [data-contract="${RW(1)}"]`).getByRole('link', { name: '1 tarefa aberta' })).toHaveAttribute('href', `/finance/tasks.html?contrato=${RW(1)}`);
  await expect(plan.locator(`.renewal-undated [data-contract="${RW(3)}"]`)).toContainText('Fim de vigência não cadastrado');
  await expect(plan.locator(`.renewal-upcoming [data-contract="${RW(4)}"]`)).toContainText('Renovação em andamento');
  await expect(plan).toContainText('1 contrato vigente tem aviso prévio depois de 6 meses');
  await expect(plan.locator(`[data-contract="${RW(1)}"]`).getByRole('link', { name: /Atlas Bank · Giro sazonal/ })).toHaveAttribute('href', `/finance/contracts.html?abrir=contrato#contract-${RW(1)}`);
  await plan.getByLabel('Plano de renovações: responsável').selectOption('none');
  await expect(plan.locator('[data-contract]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
});

test('plano de renovações registra tarefa de preparação; resposta incerta reenvia a mesma chave sem duplicar', async ({ page }) => {
  await setup(page, { overview: { ...OVERVIEW, contracts: RENEWALS, tasks: [] } });
  const posts = [];
  await page.route('**/api/finance/tasks', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    posts.push(route.request().postDataJSON());
    return posts.length === 1 ? route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Indisponível' }) })
      : route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, row: { id: '00000000-0000-4000-8000-0000000008b1' } }) });
  });
  await page.goto('/finance/contracts.html#plano-renovacoes');
  const row = page.locator(`#plano-renovacoes [data-contract="${RW(1)}"]`);
  await row.getByRole('button', { name: 'Registrar tarefa de preparação' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar tarefa' }).click();
  await expect(row.getByRole('button', { name: 'Conferir registro' })).toBeVisible();
  await row.getByRole('button', { name: 'Conferir registro' }).click();
  await expect(row).toContainText('1 tarefa aberta (1 registrada agora)');
  expect(posts).toHaveLength(2);
  expect(posts[1].idempotency_key).toBe(posts[0].idempotency_key);
  expect(posts[0]).toMatchObject({ related_type: 'contract', related_id: RW(1), organization_id: ORG });
  expect(posts[0].due_on).toBe(day(10));
});

test('plano de renovações: leitor vê o plano sem ações de escrita', async ({ page }) => {
  await setup(page, { role: 'viewer', overview: { ...OVERVIEW, contracts: RENEWALS, tasks: [] } });
  await page.goto('/finance/contracts.html');
  await page.locator('#plano-renovacoes-toggle > summary').click();
  const plan = page.locator('#plano-renovacoes');
  await expect(plan.locator('[data-contract]').first()).toBeVisible();
  await expect(plan.getByRole('button', { name: /Registrar tarefa|Iniciar nova concorrência|Abrir concorrência/ })).toHaveCount(0);
});

test('plano de renovações: com 100 tarefas abertas na leitura, não afirma ausência de tarefas', async ({ page }) => {
  const tasks = Array.from({ length: 100 }, (_, i) => ({ id: `00000000-0000-4000-8000-0000000090${String(i).padStart(2, '0')}`, title: `T${i}`, status: 'open', related_type: 'contract', related_id: RW(5), assignee_id: null, due_on: null }));
  await setup(page, { overview: { ...OVERVIEW, contracts: RENEWALS, tasks } });
  await page.goto('/finance/contracts.html?plano=renovacoes');
  const row = page.locator(`#plano-renovacoes [data-contract="${RW(1)}"]`);
  await expect(row).toContainText('Tarefas do contrato (leitura parcial)');
  await expect(row).not.toContainText('Nenhuma tarefa aberta');
  await expect(page.locator('#plano-renovacoes')).toContainText('Contagem de tarefas a partir das 100 tarefas abertas');
});

// Central de ações (Painel · "Precisa de você"): ação no próprio item, com
// confirmação lida do servidor; triagem de sem-responsável; atalho ao plano. API SIMULADA.
const T_LATE = '00000000-0000-4000-8000-0000000009a1';
const ACTION_TASKS = [
  { id: T_LATE, title: 'Enviar balancete ao banco', status: 'open', due_on: day(-1), assignee_id: 'u1', related_type: 'contract', related_id: C1 },
  { id: '00000000-0000-4000-8000-0000000009a2', title: 'Conferir garantia', status: 'open', due_on: null, assignee_id: null, related_type: 'contract', related_id: C1 },
  { id: '00000000-0000-4000-8000-0000000009a3', title: 'Atualizar cadastro', status: 'open', due_on: day(20), assignee_id: null, related_type: null, related_id: null }
];
async function actionCenter(page, { role = 'admin', patch = 200, readBack = 'done' } = {}) {
  await setup(page, { role, overview: { ...OVERVIEW, tasks: ACTION_TASKS } });
  const calls = [];
  await page.route('**/api/finance/tasks*', (route) => {
    const req = route.request(); const u = new URL(req.url());
    calls.push(`${req.method()} ${u.searchParams.get('task_id') || ''}`);
    if (req.method() === 'PATCH') return route.fulfill({ status: patch, contentType: 'application/json', body: JSON.stringify(patch === 200 ? { ok: true } : { ok: false, error: 'Indisponível' }) });
    return route.fulfill({ json: { ok: true, rows: [{ ...ACTION_TASKS[0], status: readBack }], page: { limit: 1, has_more: false, next_cursor: null } } });
  });
  await page.goto('/finance/dashboard.html');
  return { attention: page.locator('#precisa-de-voce'), calls };
}

test('central de ações: concluir tarefa vencida no próprio item só após confirmação do servidor', async ({ page }) => {
  const { attention, calls } = await actionCenter(page);
  const row = attention.locator('.action-row', { hasText: 'Enviar balancete ao banco' });
  await row.getByRole('button', { name: 'Concluir tarefa: Enviar balancete ao banco' }).click();
  await expect(row).toContainText('Concluída · confirmada pelo servidor.');
  await expect(row).toHaveClass(/action-done/);
  expect(calls).toEqual(['PATCH ', `GET ${T_LATE}`]);
  await expect(row.getByRole('link', { name: 'Enviar balancete ao banco' })).toHaveAttribute('href', `/finance/tasks.html#task-${T_LATE}`);
});

test('central de ações: falha na conclusão não some com a pendência nem afirma sucesso', async ({ page }) => {
  const { attention } = await actionCenter(page, { patch: 503 });
  const row = attention.locator('.action-row', { hasText: 'Enviar balancete ao banco' });
  await row.getByRole('button', { name: /Concluir tarefa/ }).click();
  await expect(row).toContainText('Não confirmamos a conclusão');
  await expect(row).not.toHaveClass(/action-done/);
  await expect(row.getByRole('button', { name: /Concluir tarefa/ })).toBeDisabled();
});

test('central de ações: servidor não confirma o estado → item continua pendente', async ({ page }) => {
  const { attention } = await actionCenter(page, { readBack: 'open' });
  const row = attention.locator('.action-row', { hasText: 'Enviar balancete ao banco' });
  await row.getByRole('button', { name: /Concluir tarefa/ }).click();
  await expect(row).toContainText('Não confirmamos a conclusão');
  await expect(row).not.toHaveClass(/action-done/);
});

test('central de ações: tarefas sem responsável (com e sem prazo) viram triagem para o filtro da Caixa', async ({ page }) => {
  const { attention } = await actionCenter(page);
  // A sem prazo e a de prazo distante; nenhuma vence em até 2 dias (essas já aparecem uma a uma).
  const item = attention.getByRole('link', { name: '2 tarefas abertas sem responsável' });
  await expect(item).toHaveAttribute('href', '/finance/tasks.html?filtro=sem-responsavel');
});

test('central de ações: leitor vê as pendências sem ação de escrita nem triagem de atribuição', async ({ page }) => {
  const { attention } = await actionCenter(page, { role: 'viewer' });
  await expect(attention.getByRole('button', { name: /Concluir tarefa/ })).toHaveCount(0);
  await expect(attention.getByRole('link', { name: /sem responsável/ })).toHaveCount(0);
});

test('central de ações: renovação leva ao contrato e ao plano de renovações', async ({ page }) => {
  const soon = { ...CONTRACT, ends_on: day(70), renewal_notice_days: 60 };
  await setup(page, { overview: { ...OVERVIEW, contracts: [soon], tasks: [] } });
  await page.goto('/finance/dashboard.html');
  const row = page.locator('#precisa-de-voce .action-row', { hasText: 'Decidir renovação' });
  await expect(row.getByRole('link', { name: /Decidir renovação/ })).toHaveAttribute('href', `/finance/contracts.html?abrir=contrato#contract-${C1}`);
  await row.getByRole('link', { name: 'Plano de renovações' }).click();
  await expect(page.locator(`#plano-renovacoes [data-contract="${C1}"]`)).toBeVisible();
});

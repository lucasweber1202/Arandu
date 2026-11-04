import { test, expect } from '@playwright/test';
// Radar de prazos na tela de Tarefas: contratos (aviso prévio e término),
// solicitações em coleta e tarefas abertas da visão geral, com link à origem.
// APIs SIMULADAS (page.route): valida a interface, não persistência hospedada.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const C2 = '00000000-0000-4000-8000-0000000000c2';
const C3 = '00000000-0000-4000-8000-0000000000c3';
const R1 = '00000000-0000-4000-8000-0000000000d1';
const R2 = '00000000-0000-4000-8000-0000000000d2';
const T1 = '00000000-0000-4000-8000-0000000000f1';
const T2 = '00000000-0000-4000-8000-0000000000f2';
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const overview = (over = {}) => ({
  ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, providers: [],
  contracts: [
    // Aviso prévio em 10 dias (término em 70, 60 de aviso).
    { id: C1, status: 'active', title: 'Capital de giro', provider_name: 'Atlas Bank', ends_on: day(70), renewal_notice_days: 60, owner_id: 'u1' },
    // Sem aviso registrado: só o término, avisando a ausência.
    { id: C2, status: 'active', title: 'Adquirência lojas', provider_name: 'Nexo', ends_on: day(20), owner_id: null },
    // Encerrado: não entra.
    { id: C3, status: 'expired', title: 'Antigo', ends_on: day(5) }
  ],
  rfqs: [
    { id: R1, status: 'collecting', title: 'Revisão de MDR', response_deadline: day(-2), owner_id: 'u2', invites: [{ provider_id: 'p' }, { provider_id: 'q' }] },
    { id: R2, status: 'decided', title: 'Decidida', response_deadline: day(3) }
  ],
  tasks: [
    { id: T1, status: 'open', title: 'Coletar extrato', due_on: day(3), assignee_id: 'u1' },
    { id: T2, status: 'open', title: 'Sem prazo', due_on: null, assignee_id: 'u1' }
  ], ...over
});

async function setup(page, data = overview(), { approvals = [], approvalsStatus = 200, entities = [] } = {}) {
  await page.route('**/api/finance/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/finance/', '');
    const json = (v) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json(data);
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'admin', display_name: 'Ana Tesouraria' }, { user_id: 'u2', role: 'analyst', display_name: 'Paula Nogueira' }], viewer_id: 'u1' });
    if (path === 'tasks') return json({ ok: true, rows: data.tasks, page: { has_more: false, next_cursor: null, limit: 50 } });
    if (path === 'approvals') return approvalsStatus === 200 ? json({ ok: true, viewer_id: 'u1', rows: approvals }) : route.fulfill({ status: approvalsStatus, contentType: 'application/json', body: JSON.stringify({ error: 'Indisponível.' }) });
    if (path === 'entities') return json({ ok: true, rows: entities, scope: 'group', can_admin: true });
    return json({ ok: true, rows: [] });
  });
}

test('radar agrupa por janela, mostra responsável e leva ao registro de origem', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/tasks.html');
  const radar = page.locator('#deadline-radar');
  await expect(radar).toBeVisible();
  const items = radar.locator('[data-bucket]:not([data-bucket="undated"]) .deadline-item');
  // C1: aviso + término; C2: término; R1; T1. Encerrado e decidida ficam fora.
  await expect(items).toHaveCount(5);
  await expect(radar).not.toContainText('Antigo');
  await expect(radar).not.toContainText('Decidida');
  // Tarefa sem prazo não some nem vira atraso: fica no grupo próprio.
  const undated = radar.locator('[data-bucket="undated"]');
  await expect(undated).toContainText('ausência de data não é atraso');
  await undated.locator('summary').click();
  await expect(undated.getByRole('link', { name: 'Sem prazo' })).toHaveAttribute('href', `/finance/tasks.html#task-${T2}`);
  const overdue = radar.locator('[data-bucket="overdue"]');
  await expect(overdue).toContainText('Respostas: Revisão de MDR');
  await expect(overdue).toContainText('Responsável: Paula Nogueira');
  await expect(overdue).toContainText('2 instituições convidadas');
  await expect(overdue.getByRole('link', { name: 'Respostas: Revisão de MDR' })).toHaveAttribute('href', `/finance/rfq.html?id=${R1}`);
  await expect(radar.locator('[data-bucket="week"]')).toContainText('Coletar extrato');
  await expect(radar.getByRole('link', { name: 'Coletar extrato' })).toHaveAttribute('href', `/finance/tasks.html#task-${T1}`);
  const month = radar.locator('[data-bucket="month"]');
  await expect(month).toContainText('Decidir renovação: Capital de giro');
  await expect(month).toContainText('60 dias de aviso registrados no cadastro');
  await expect(month).toContainText('Término: Adquirência lojas');
  await expect(month).toContainText('aviso prévio não registrado');
  await expect(month).toContainText('Responsável não definido');
  await expect(radar.getByRole('link', { name: 'Decidir renovação: Capital de giro' })).toHaveAttribute('href', `/finance/contracts.html?abrir=contrato#contract-${C1}`);
  await expect(radar.getByRole('status')).toContainText('5 prazos até 90 dias e 1 item sem prazo.');
  await expect(radar.getByRole('status')).not.toContainText('Recorte');
});

test('filtro "Atribuídos a mim" mostra só os prazos de quem lê', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/tasks.html');
  const radar = page.locator('#deadline-radar');
  const group = radar.getByRole('group', { name: 'De quem são os prazos' });
  await group.getByRole('button', { name: 'Atribuídos a mim' }).click();
  await expect(group.getByRole('button', { name: 'Atribuídos a mim' })).toHaveAttribute('aria-pressed', 'true');
  // C1 (aviso + término, dono u1) e T1; T2 (u1, sem prazo) no grupo próprio.
  await expect(radar.locator('[data-bucket]:not([data-bucket="undated"]) .deadline-item')).toHaveCount(3);
  await expect(radar.locator('[data-bucket="undated"] .deadline-item')).toHaveCount(1);
  await expect(radar).not.toContainText('Revisão de MDR');
  await expect(radar.getByRole('status')).toContainText('atribuídos a você');
});

test('sem prazos: explica o que fica de fora; leitura no limite anuncia o recorte', async ({ page }) => {
  const contracts = Array.from({ length: 200 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, status: 'active', title: `C${i}`, ends_on: day(400) }));
  await setup(page, overview({ contracts, rfqs: [], tasks: [] }));
  await page.goto('/finance/tasks.html');
  const radar = page.locator('#deadline-radar');
  await expect(radar).toContainText('Nenhum prazo registrado nos próximos 90 dias');
  await expect(radar.getByRole('status')).toContainText('Recorte: a leitura de contratos atingiu o limite');
});

test('módulo do radar que não carrega vira aviso sem afetar a lista de tarefas', async ({ page }) => {
  await setup(page);
  await page.route(/\/assets\/deadline-radar-[^/]+\.js$/, (route) => route.abort('internetdisconnected'));
  await page.goto('/finance/tasks.html');
  await expect(page.getByRole('alert').filter({ hasText: 'O radar de prazos não carregou' })).toBeVisible();
  await expect(page.locator('#deadline-radar')).toHaveCount(0);
});

test('link do Painel abre a tela de tarefas com o foco no radar', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/tasks.html#deadline-radar');
  await expect(page.locator('#deadline-radar')).toBeFocused();
});

const A1 = '00000000-0000-4000-8000-0000000000a9';
const A2 = '00000000-0000-4000-8000-0000000000aa';
const R3 = '00000000-0000-4000-8000-0000000000d3';

test('aprovações pendentes entram na caixa: quem decide é o servidor (viewer_can_act)', async ({ page }) => {
  const data = overview();
  data.rfqs.push({ id: R3, status: 'comparing', title: 'Linha de R$ 5 mi', owner_id: 'u2', invites: [] });
  await setup(page, data, { approvals: [
    { id: A1, rfq_id: R3, status: 'pending', viewer_can_act: true, stages: [{ status: 'active', due_at: `${day(2)}T18:00:00Z` }] },
    { id: A2, rfq_id: R1, status: 'pending', viewer_can_act: false, stages: [], expires_at: null },
    { id: '00000000-0000-4000-8000-0000000000ab', rfq_id: R3, status: 'approved', viewer_can_act: false, stages: [] }
  ] });
  await page.goto('/finance/tasks.html');
  const radar = page.locator('#deadline-radar');
  const mine = radar.locator('[data-kind="approval"]');
  await expect(mine).toHaveCount(1);
  await expect(mine).toContainText('Decidir aprovação: Linha de R$ 5 mi');
  await expect(mine).toContainText('Responsável: Ana Tesouraria (você)');
  await expect(mine.getByRole('link')).toHaveAttribute('href', `/finance/rfq.html?id=${R3}#aprovacao`);
  await expect(radar.locator('[data-bucket="week"] [data-kind="approval"]')).toHaveCount(1);
  // Sem prazo e sem poder de decisão: aparece como acompanhamento, sem atribuir a quem lê.
  const waiting = radar.locator('[data-bucket="undated"] [data-kind="approval_wait"]');
  await expect(waiting).toHaveCount(1);
  await expect(waiting).toContainText('Aprovadores da etapa atual');
  await radar.getByRole('group', { name: 'De quem são os prazos' }).getByRole('button', { name: 'Atribuídos a mim' }).click();
  await expect(radar.locator('[data-kind="approval_wait"]')).toHaveCount(0);
  await expect(radar.locator('[data-kind="approval"]')).toHaveCount(1);
});

test('aprovações indisponíveis: aviso explícito, sem dizer que não há pendência, e nova tentativa', async ({ page }) => {
  let status = 503;
  await setup(page);
  await page.route('**/api/finance/approvals**', (route) => (status === 200
    ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, viewer_id: 'u1', rows: [{ id: A1, rfq_id: R1, status: 'pending', viewer_can_act: true, stages: [] }] }) })
    : route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Indisponível.' }) })));
  await page.goto('/finance/tasks.html');
  const radar = page.locator('#deadline-radar');
  const alert = radar.getByRole('alert');
  await expect(alert).toContainText('Isso não significa que não haja nenhuma');
  await expect(radar.locator('[data-kind="approval"]')).toHaveCount(0);
  status = 200;
  await alert.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(radar.getByRole('alert')).toHaveCount(0);
  await expect(radar.locator('[data-kind="approval"]')).toHaveCount(1);
});

test('filtros por instituição e entidade usam só vínculos registrados', async ({ page }) => {
  const P1 = '00000000-0000-4000-8000-0000000000b1';
  const P2 = '00000000-0000-4000-8000-0000000000b2';
  const E1 = '00000000-0000-4000-8000-0000000000e1';
  const E2 = '00000000-0000-4000-8000-0000000000e2';
  const data = overview({ providers: [{ id: P1, name: 'Atlas Bank' }, { id: P2, name: 'Nexo' }] });
  data.contracts[0] = { ...data.contracts[0], provider_id: P1, legal_entity_id: E1 };
  data.contracts[1] = { ...data.contracts[1], provider_id: P2, legal_entity_id: E2 };
  // Tarefa ligada ao contrato C1 herda instituição e entidade dele.
  data.tasks[0] = { ...data.tasks[0], related_type: 'contract', related_id: C1 };
  await setup(page, data, { entities: [{ id: E1, legal_name: 'Vitta Alimentos Ltda' }, { id: E2, legal_name: 'Vitta Logística Ltda' }] });
  await page.goto('/finance/tasks.html');
  const radar = page.locator('#deadline-radar');
  await radar.getByLabel('Instituição').selectOption(P1);
  // C1 (aviso + término) e a tarefa ligada a ele.
  await expect(radar.locator('[data-bucket]:not([data-bucket="undated"]) .deadline-item')).toHaveCount(3);
  await expect(radar).not.toContainText('Adquirência lojas');
  await expect(radar).toContainText('Tarefa do contrato Capital de giro');
  await radar.getByLabel('Instituição').selectOption('');
  await radar.getByLabel('Entidade').selectOption(E2);
  await expect(radar.locator('[data-bucket]:not([data-bucket="undated"]) .deadline-item')).toHaveCount(1);
  await expect(radar).toContainText('Término: Adquirência lojas');
  await expect(radar.getByRole('status')).toContainText('neste recorte');
});

test('Relationship 360°: atalho abre a caixa de trabalho filtrada pela instituição', async ({ page }) => {
  const P1 = '00000000-0000-4000-8000-0000000000b1';
  const P2 = '00000000-0000-4000-8000-0000000000b2';
  const data = overview({ providers: [{ id: P1, name: 'Atlas Bank', kind: 'bank', status: 'active' }, { id: P2, name: 'Nexo', kind: 'acquirer', status: 'active' }] });
  data.contracts[0] = { ...data.contracts[0], provider_id: P1 };
  data.contracts[1] = { ...data.contracts[1], provider_id: P2 };
  await setup(page, data);
  await page.route('**/api/finance/provider-relationship**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ok: true, provider: { id: P1, name: 'Atlas Bank' }, neutrality: 'Fatos.', contracts: [data.contracts[0]], tasks: [], facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], reviews: [], templates: [],
    timeline: [{ at: '2026-10-02T14:00:00Z', kind: 'invite', text: 'Convidado para uma solicitação', ref: R1 }],
    metrics: { invited: 1, responded: 0, response_rate: 0, median_response_days: null, active_contracts: 1, open_issues: 0, median_resolution_days: null, definitions: {} } }) }));
  await page.goto(`/finance/providers.html?provider_id=${P1}`);
  const dialog = page.getByRole('dialog', { name: 'Atlas Bank' });
  await expect(dialog.locator('.rel-head')).toContainText('Último registro no Arandu');
  await expect(dialog.locator('.rel-head')).toContainText('Convidado para uma solicitação');
  const link = dialog.getByRole('link', { name: 'Prazos desta instituição' });
  await expect(link).toHaveAttribute('href', `/finance/tasks.html?provider_id=${P1}#deadline-radar`);
  await page.goto(`/finance/tasks.html?provider_id=${P1}#deadline-radar`);
  const radar = page.locator('#deadline-radar');
  await expect(radar.getByLabel('Instituição')).toHaveValue(P1);
  await expect(radar).toContainText('Decidir renovação: Capital de giro');
  await expect(radar).not.toContainText('Adquirência lojas');
});

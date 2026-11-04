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

async function setup(page, data = overview()) {
  await page.route('**/api/finance/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/finance/', '');
    const json = (v) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json(data);
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role: 'admin', display_name: 'Ana Tesouraria' }, { user_id: 'u2', role: 'analyst', display_name: 'Paula Nogueira' }], viewer_id: 'u1' });
    if (path === 'tasks') return json({ ok: true, rows: data.tasks, page: { has_more: false, next_cursor: null, limit: 50 } });
    return json({ ok: true, rows: [] });
  });
}

test('radar agrupa por janela, mostra responsável e leva ao registro de origem', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/tasks.html');
  const radar = page.locator('#deadline-radar');
  await expect(radar).toBeVisible();
  const items = radar.locator('.deadline-item');
  // C1: aviso + término; C2: término; R1; T1. Encerrado, decidida e sem prazo ficam fora.
  await expect(items).toHaveCount(5);
  await expect(radar).not.toContainText('Antigo');
  await expect(radar).not.toContainText('Decidida');
  await expect(radar).not.toContainText('Sem prazo');
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
  await expect(radar.getByRole('status')).toContainText('5 prazos até 90 dias.');
  await expect(radar.getByRole('status')).not.toContainText('Recorte');
});

test('filtro "Atribuídos a mim" mostra só os prazos de quem lê', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/tasks.html');
  const radar = page.locator('#deadline-radar');
  const group = radar.getByRole('group', { name: 'De quem são os prazos' });
  await group.getByRole('button', { name: 'Atribuídos a mim' }).click();
  await expect(group.getByRole('button', { name: 'Atribuídos a mim' })).toHaveAttribute('aria-pressed', 'true');
  // C1 (aviso + término, dono u1) e T1.
  await expect(radar.locator('.deadline-item')).toHaveCount(3);
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

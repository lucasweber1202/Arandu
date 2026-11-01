import { test, expect } from '@playwright/test';
// Financial Relationship Workspace (CRM visual 1.0).
// APIs SIMULADAS: este spec intercepta /api/finance/** com um mock com estado que
// segue o contrato financial-crm-v1 (versão, request_key, 409, 403). Não é
// validação no ambiente canônico (Supabase/RPC reais), que segue pendente.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const P_ATLAS = '00000000-0000-4000-8000-0000000000b1';
const C1 = '00000000-0000-4000-8000-0000000000c1';
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const CONTRACT = { id: C1, organization_id: ORG, provider_id: P_ATLAS, provider_name: 'Atlas Bank', product: 'credit', title: 'Capital de giro 2025', status: 'active', origin: 'imported', starts_on: day(-300), ends_on: day(200), renewal_notice_days: 60, current_version: 1, legal_entity_id: null, owner_id: 'u1' };
const OVERVIEW = { ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], providers: [{ id: P_ATLAS, name: 'Atlas Bank', kind: 'bank', status: 'active' }], contracts: [CONTRACT], rfqs: [], tasks: [] };
const RELATIONSHIP = { ok: true, provider: { id: P_ATLAS, name: 'Atlas Bank' }, neutrality: 'Fatos do histórico da empresa.', contracts: [CONTRACT], tasks: [], facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [],
  metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 1, open_issues: 0, median_resolution_days: null, definitions: {} } };

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(900 + ++seq).padStart(12, '0')}`;

async function setup(page, { role = 'admin', initial = {}, failWith = null } = {}) {
  const store = { contact: [...(initial.contact || [])], activity: [...(initial.activity || [])], process: [...(initial.process || [])] };
  const events = [];
  const receipts = new Map();
  const writes = [];
  const kinds = { 'crm-contacts': 'contact', 'crm-activities': 'activity', 'crm-processes': 'process' };
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json(OVERVIEW);
    if (path === 'members') return json({ ok: true, rows: [{ user_id: 'u1', role, display_name: 'Paula Nogueira' }, { user_id: 'u2', role: 'analyst', display_name: 'Rafael Lima' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin' });
    if (path === 'provider-relationship') return json(RELATIONSHIP);
    if (path === 'crm-history') {
      const id = u.searchParams.get('object_id');
      return json({ ok: true, rows: events.filter((e) => e.entity_id === id), next: null });
    }
    const kind = kinds[path];
    if (!kind) return json({ ok: true, rows: [] });
    if (req.method() === 'GET') {
      const q = u.searchParams;
      let rows = store[kind];
      if (q.get('provider_id')) rows = rows.filter((r) => r.provider_id === q.get('provider_id'));
      if (q.get('related_id')) rows = rows.filter((r) => r.related_id === q.get('related_id'));
      if (q.get('contact_id')) rows = rows.filter((r) => r.contact_id === q.get('contact_id'));
      if (q.get('status')) rows = rows.filter((r) => kind === 'contact' ? (q.get('status') === 'archived') === Boolean(r.archived_at) : r.status === q.get('status'));
      return json({ ok: true, api_version: 'financial-crm-v1', rows, next: null });
    }
    const body = JSON.parse(req.postData());
    writes.push({ path, method: req.method(), body });
    if (failWith) return json({ ok: false, error: 'falha', code: failWith.code }, failWith.status);
    if (receipts.has(body.request_key)) return json({ ...receipts.get(body.request_key), replayed: true });
    if (req.method() === 'POST') {
      const row = { id: newId(), organization_id: ORG, version: 1, owner_id: 'u1', status: kind === 'activity' ? 'recorded' : 'active', ...body.values, provider_id: body.provider_id || null, legal_entity_id: body.legal_entity_id || null };
      if (kind === 'contact') delete row.status;
      store[kind].push(row);
      events.push({ id: newId(), entity_id: row.id, event_type: `crm_${kind}_created`, happened_at: new Date().toISOString(), actor_id: 'u1', payload: { source_reference: body.values.source_reference } });
      const receipt = { ok: true, id: row.id, object_type: kind, version: 1, replayed: false };
      receipts.set(body.request_key, receipt);
      return json(receipt, 201);
    }
    const row = store[kind].find((r) => r.id === body.id);
    if (row.version !== body.expected_version) return json({ ok: false, error: 'conflito', code: 'crm_conflict' }, 409);
    const { status, ...rest } = body.values;
    Object.assign(row, rest, { version: row.version + 1 });
    if (status) { if (kind === 'contact') row.archived_at = status === 'archived' ? new Date().toISOString() : null; else row.status = status; }
    events.push({ id: newId(), entity_id: row.id, event_type: `crm_${kind}_updated`, happened_at: new Date().toISOString(), actor_id: 'u1', payload: { changed_fields: Object.keys(body.values), source_reference: body.values.source_reference } });
    return json({ ok: true, id: row.id, object_type: kind, version: row.version, replayed: false });
  });
  return { store, writes };
}

test('jornada completa: contato, reunião, processo ligado ao contrato, etapa, histórico e volta ao contrato', async ({ page }) => {
  const { store, writes } = await setup(page);
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const dialog = page.getByRole('dialog', { name: 'Atlas Bank' });
  const crm = dialog.locator('.crm-workspace');
  await expect(crm.getByRole('heading', { name: 'Relacionamento comercial' })).toBeVisible();

  // 1. Contato — validação antes de enviar, sucesso só após a resposta.
  await crm.getByRole('button', { name: 'Novo contato' }).click();
  const contactForm = page.getByRole('dialog', { name: /Novo contato/ });
  await contactForm.getByRole('button', { name: 'Gravar' }).click();
  await expect(contactForm.getByText('Informe nome.')).toBeVisible();
  expect(writes).toHaveLength(0);
  await contactForm.getByLabel(/^Nome/).fill('Maria Souza');
  await contactForm.getByLabel(/^Cargo ou função/).fill('Gerente de relacionamento');
  await contactForm.getByLabel(/^E-mail/).fill('maria@atlas.example');
  await contactForm.getByLabel(/^Fonte da informação/).fill('Cartão entregue na reunião');
  await contactForm.getByRole('button', { name: 'Gravar' }).click();
  await expect(page.getByText('Contato registrado.')).toBeVisible();
  expect(writes[0].body).toMatchObject({ provider_id: P_ATLAS, values: { name: 'Maria Souza', source_reference: 'Cartão entregue na reunião' } });
  expect(writes[0].body.request_key).toMatch(/^[0-9a-f-]{36}$/);
  await crm.getByRole('tab', { name: /Contatos/ }).click();
  await expect(crm.locator('[data-crm="contact"]')).toContainText('Maria Souza');

  // 2. Reunião realizada com o contato.
  await crm.getByRole('button', { name: 'Registrar atividade com Maria Souza' }).click();
  const act = page.getByRole('dialog', { name: /Registrar atividade/ });
  await act.getByLabel(/^Assunto/).fill('Revisão anual do capital de giro');
  await act.getByLabel(/^Fonte( \*)?$/).fill('Ata da reunião');
  await act.getByRole('button', { name: 'Gravar' }).click();
  await expect(page.getByText('Atividade registrada.')).toBeVisible();
  const meeting = writes.at(-1).body.values;
  expect(meeting).toMatchObject({ kind: 'meeting', status: 'recorded', contact_id: store.contact[0].id, related_type: 'provider', related_id: P_ATLAS });
  expect(meeting.occurred_at).toMatch(/[+-]\d{2}:\d{2}$/);

  // 3–7. Processo com responsável e vínculo ao contrato.
  await crm.getByRole('button', { name: 'Novo processo' }).click();
  const proc = page.getByRole('dialog', { name: /Novo processo comercial/ });
  await proc.getByLabel(/^Título/).fill('Renovação do capital de giro');
  await proc.getByLabel(/^Próximo passo/).fill('Enviar demanda atualizada');
  await proc.getByLabel(/^Responsável/).selectOption('u2');
  await proc.getByLabel(/^Contrato, negociação/).selectOption(`contract:${C1}`);
  await proc.getByLabel(/^Fonte( \*)?$/).fill('Comitê de tesouraria');
  await proc.getByRole('button', { name: 'Gravar' }).click();
  await expect(page.getByText('Processo criado.')).toBeVisible();
  expect(writes.at(-1).body.values).toMatchObject({ stage: 'prospect', owner_id: 'u2', related_type: 'contract', related_id: C1 });

  // 8. Atualiza etapa pelo quadro; persistida com expected_version.
  await crm.getByRole('tab', { name: /Processos/ }).click();
  const card = crm.locator('[data-crm="process"]').first();
  await expect(card).toContainText('Responsável: Rafael Lima');
  await card.getByLabel('Etapa de Renovação do capital de giro').selectOption('negotiation');
  await expect(page.getByText('Etapa atualizada para Em negociação.')).toBeVisible();
  expect(writes.at(-1)).toMatchObject({ method: 'PATCH', body: { expected_version: 1, values: { stage: 'negotiation' } } });
  await expect(crm.locator('.crm-column[aria-label^="Em negociação"]')).toContainText('Renovação do capital de giro');

  // 9. Histórico do processo com autor e fonte.
  await crm.getByRole('button', { name: 'Renovação do capital de giro' }).click();
  const detail = page.getByRole('dialog', { name: 'Renovação do capital de giro' });
  await expect(detail.locator('.crm-history')).toContainText('Processo criado');
  await expect(detail.locator('.crm-history')).toContainText('Processo atualizado');
  await expect(detail.locator('.crm-history')).toContainText('Alterou: etapa');
  await expect(detail.locator('.crm-history')).toContainText('Paula Nogueira (você)');

  // 10. Volta ao contrato pelo vínculo.
  await expect(detail.getByRole('link', { name: 'Contrato: Capital de giro 2025' })).toHaveAttribute('href', new RegExp(`contracts\\.html\\?abrir=contrato#contract-${C1}`));
  for (const surface of [crm, detail]) for (const banned of [/melhor/i, /recomendad/i, /\bnull\b/, /undefined/, /crm_/, /[0-9a-f]{8}-[0-9a-f]{4}-/]) await expect(surface).not.toContainText(banned);
});

test('ganho exige resultado declarado e não é tratado como contrato fechado', async ({ page }) => {
  const process = { id: newId(), organization_id: ORG, title: 'Nova linha', stage: 'negotiation', next_action: 'Revisar minuta', source_reference: 'Reunião', status: 'active', version: 3, owner_id: 'u1', related_type: 'provider', related_id: P_ATLAS };
  const { writes } = await setup(page, { initial: { process: [process] } });
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const crm = page.getByRole('dialog', { name: 'Atlas Bank' }).locator('.crm-workspace');
  await crm.getByRole('tab', { name: /Processos/ }).click();
  await expect(crm).toContainText('"Ganho" não fecha contrato');
  const stage = crm.getByLabel('Etapa de Nova linha');
  await stage.selectOption('won');
  const prompt = page.getByRole('dialog', { name: /registrar resultado/ });
  await expect(prompt).toContainText('Isto não fecha contrato');
  await prompt.getByRole('button', { name: 'Cancelar' }).click();
  await expect(stage).toHaveValue('negotiation');
  expect(writes).toHaveLength(0);
  await stage.selectOption('won');
  await prompt.getByLabel('Resultado').fill('Taxa acordada em comitê, minuta em revisão');
  await prompt.getByRole('button', { name: 'Registrar etapa' }).click();
  await expect(page.getByText('Etapa atualizada para Ganho (declarado).')).toBeVisible();
  expect(writes[0].body).toMatchObject({ expected_version: 3, values: { stage: 'won', outcome: 'Taxa acordada em comitê, minuta em revisão' } });
});

test('agenda separa vencidos, hoje e futuros; compromisso só vira realizado com data informada', async ({ page }) => {
  const base = { organization_id: ORG, kind: 'follow_up', source_reference: 'Reunião', status: 'planned', version: 1, related_type: 'provider', related_id: P_ATLAS };
  const { writes } = await setup(page, { initial: { activity: [
    { ...base, id: newId(), subject: 'Cobrar minuta', due_on: day(-2), owner_id: 'u1' },
    { ...base, id: newId(), subject: 'Ligar para gerente', due_on: day(0), owner_id: null },
    { ...base, id: newId(), subject: 'Comitê trimestral', due_on: day(10), owner_id: 'u2' },
    { ...base, id: newId(), subject: 'Reunião passada', status: 'recorded', occurred_at: new Date(Date.now() - 86400000).toISOString(), kind: 'meeting' }
  ] } });
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const crm = page.getByRole('dialog', { name: 'Atlas Bank' }).locator('.crm-workspace');
  await expect(crm.getByRole('tab', { name: /Agenda · 1 vencido/ })).toHaveAttribute('aria-selected', 'true');
  await expect(crm.locator('[aria-label="Vencidos"]')).toContainText('Cobrar minuta');
  await expect(crm.locator('[aria-label="Hoje"]')).toContainText('Ligar para gerente');
  await expect(crm.locator('[aria-label="Próximos"]')).toContainText('Comitê trimestral');
  await expect(crm.locator('.crm-agenda')).not.toContainText('Reunião passada');
  await expect(crm).toContainText('1 item pendente sem responsável definido.');
  await crm.getByRole('button', { name: 'Marcar como realizada: Cobrar minuta' }).click();
  const form = page.getByRole('dialog', { name: /Registrar realização/ });
  await form.getByLabel(/^Fonte/).fill('E-mail do banco com a minuta');
  await form.getByRole('button', { name: 'Gravar' }).click();
  await expect(page.getByText('Atividade registrada como realizada.')).toBeVisible();
  expect(writes[0].body.values).toMatchObject({ status: 'recorded', source_reference: 'E-mail do banco com a minuta' });
  expect(writes[0].body.values.occurred_at).toBeTruthy();
});

test('conflito de versão não sobrescreve e preserva o formulário', async ({ page }) => {
  const contact = { id: newId(), organization_id: ORG, provider_id: P_ATLAS, name: 'João Prado', source_reference: 'Cadastro', version: 2, owner_id: 'u1', archived_at: null };
  const { writes } = await setup(page, { initial: { contact: [contact] }, failWith: { status: 409, code: 'crm_conflict' } });
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const crm = page.getByRole('dialog', { name: 'Atlas Bank' }).locator('.crm-workspace');
  await crm.getByRole('tab', { name: /Contatos/ }).click();
  await crm.getByRole('button', { name: 'Editar João Prado' }).click();
  const form = page.getByRole('dialog', { name: /Editar contato/ });
  await form.getByLabel(/^Cargo ou função/).fill('Superintendente');
  await form.getByLabel(/^Fonte desta alteração/).fill('Assinatura de e-mail');
  await form.getByRole('button', { name: 'Gravar' }).click();
  await expect(form.getByRole('alert')).toContainText('Nada foi sobrescrito');
  await expect(form.getByLabel(/^Cargo ou função/)).toHaveValue('Superintendente');
  await expect(form.getByRole('button', { name: 'Recarregar dados' })).toBeVisible();
  expect(writes[0].body).toMatchObject({ expected_version: 2, values: { title: 'Superintendente' } });
  expect(Object.keys(writes[0].body.values)).not.toContain('name');
});

test('falha incerta reenvia a mesma chave; leitor não vê ações de escrita', async ({ page }) => {
  const { writes } = await setup(page, { failWith: { status: 502 } });
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const crm = page.getByRole('dialog', { name: 'Atlas Bank' }).locator('.crm-workspace');
  await crm.getByRole('button', { name: 'Novo contato' }).click();
  const form = page.getByRole('dialog', { name: /Novo contato/ });
  await form.getByLabel(/^Nome/).fill('Ana Lima');
  await form.getByLabel(/^Fonte da informação/).fill('Telefone');
  await form.getByRole('button', { name: 'Gravar' }).click();
  await expect(form.getByRole('alert')).toContainText('Pode ter sido gravado');
  await form.getByRole('button', { name: 'Repetir a mesma ação' }).click();
  await expect.poll(() => writes.length).toBe(2);
  expect(writes[1].body.request_key).toBe(writes[0].body.request_key);
});

test('pessoa só com leitura consulta sem botões de escrita', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const crm = page.getByRole('dialog', { name: 'Atlas Bank' }).locator('.crm-workspace');
  await expect(crm).toContainText('Seu acesso permite consultar');
  await expect(crm.getByRole('button', { name: 'Novo contato' })).toHaveCount(0);
  await expect(crm.getByRole('button', { name: 'Novo processo' })).toHaveCount(0);
});

test('agenda da organização na Central lista pendências e abre a instituição', async ({ page }) => {
  await setup(page, { initial: { activity: [{ id: newId(), organization_id: ORG, kind: 'commitment', subject: 'Enviar balancete', source_reference: 'Contrato', status: 'planned', due_on: day(-1), version: 1, related_type: 'contract', related_id: C1, owner_id: null }] } });
  await page.goto('/finance/providers.html');
  const agenda = page.locator('#crm-agenda');
  await expect(agenda.getByRole('heading', { name: 'Agenda e processos comerciais' })).toBeVisible();
  await expect(agenda).toContainText('Enviar balancete');
  await expect(agenda).toContainText('Atlas Bank');
  await agenda.getByLabel('Filtrar agenda').selectOption('unowned');
  await expect(agenda.locator('[data-crm="activity"]')).toHaveCount(1);
  await agenda.getByRole('button', { name: 'Abrir relacionamento com Atlas Bank' }).click();
  await expect(page.getByRole('dialog', { name: 'Atlas Bank' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('agenda da organização filtra por instituição, responsável e itens sem prazo', async ({ page }) => {
  const base = { organization_id: ORG, source_reference: 'Reunião', version: 1 };
  await setup(page, { initial: {
    activity: [{ ...base, id: newId(), kind: 'follow_up', subject: 'Cobrar minuta Atlas', status: 'planned', due_on: day(3), related_type: 'provider', related_id: P_ATLAS, owner_id: 'u2' },
      { ...base, id: newId(), kind: 'note', subject: 'Pendência sem vínculo', status: 'planned', due_on: day(4), owner_id: 'u1' }],
    process: [{ ...base, id: newId(), title: 'Revisão de tarifas', stage: 'qualification', next_action: 'Levantar extratos', status: 'active', due_on: null, related_type: 'contract', related_id: C1, owner_id: 'u1' }] } });
  await page.goto('/finance/providers.html');
  const agenda = page.locator('#crm-agenda');
  await expect(agenda.locator('.crm-row')).toHaveCount(3);
  await agenda.getByLabel('Instituição').selectOption(P_ATLAS);
  await expect(agenda.locator('.crm-row')).toHaveCount(2);
  await expect(agenda).not.toContainText('Pendência sem vínculo');
  await agenda.getByLabel('Responsável').selectOption('u2');
  await expect(agenda.locator('.crm-row')).toHaveCount(1);
  await expect(agenda).toContainText('Cobrar minuta Atlas');
  await agenda.getByLabel('Responsável').selectOption('');
  await agenda.getByLabel('Filtrar agenda').selectOption('no_date');
  await expect(agenda.locator('.crm-row')).toHaveCount(1);
  await expect(agenda).toContainText('Revisão de tarifas: Levantar extratos');
});

test('jornada transversal: contrato mostra processos e atividades vinculados e volta à instituição', async ({ page }) => {
  const base = { organization_id: ORG, source_reference: 'Comitê', version: 1 };
  await setup(page, { initial: {
    process: [{ ...base, id: newId(), title: 'Renovação do capital de giro', stage: 'negotiation', next_action: 'Receber minuta', status: 'active', due_on: day(5), related_type: 'contract', related_id: C1, owner_id: 'u1' }],
    activity: [{ ...base, id: newId(), kind: 'meeting', subject: 'Reunião de renovação', status: 'recorded', occurred_at: new Date(Date.now() - 86400000).toISOString(), related_type: 'contract', related_id: C1 }] } });
  await page.route('**/api/finance/contract-detail**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, contract: CONTRACT, effective: null, versions: [], amendments: [], milestones: [], children: [], documents: [], events: [] }) }));
  await page.goto(`/finance/contracts.html?abrir=contrato#contract-${C1}`);
  const linked = page.getByRole('dialog', { name: 'Capital de giro 2025' }).locator('.crm-linked');
  await expect(linked).toContainText('Processo · Em negociação');
  await expect(linked).toContainText('Renovação do capital de giro');
  await expect(linked).toContainText('Reunião de renovação');
  await linked.getByRole('link', { name: 'Abrir relacionamento com Atlas Bank' }).click();
  await expect(page).toHaveURL(new RegExp(`providers\\.html\\?provider_id=${P_ATLAS}`));
  await expect(page.getByRole('dialog', { name: 'Atlas Bank' }).locator('.crm-workspace')).toBeVisible();
});

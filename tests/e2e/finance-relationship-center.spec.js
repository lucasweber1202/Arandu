import { test, expect } from '@playwright/test';
// Central de Relacionamentos 2.0 (v3.8): fila de trabalho por instituição a
// partir de contratos, solicitações e tarefas já carregados. Nada inventado:
// responsável ausente aparece ausente; aviso prévio é o registrado.
const ORG = '00000000-0000-4000-8000-0000000000a1';
const P_ATLAS = '00000000-0000-4000-8000-0000000000b1';
const P_NEXO = '00000000-0000-4000-8000-0000000000b2';
const P_NOVO = '00000000-0000-4000-8000-0000000000b3';
const ENTITY = '00000000-0000-4000-8000-0000000000e1';
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const contract = (id, over) => ({ id, organization_id: ORG, status: 'active', origin: 'imported', starts_on: day(-300), renewal_notice_days: 60, current_version: 1, legal_entity_id: null, owner_id: null, ...over });
const OVERVIEW = {
  ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [],
  providers: [{ id: P_ATLAS, name: 'Atlas Bank', kind: 'bank', status: 'active' }, { id: P_NEXO, name: 'Nexo Payments', kind: 'acquirer', status: 'active' }, { id: P_NOVO, name: 'Banco Novo', kind: 'bank', status: 'active' }],
  contracts: [
    contract('00000000-0000-4000-8000-0000000000c1', { provider_id: P_ATLAS, provider_name: 'Atlas Bank', product: 'credit', title: 'Capital de giro 2025', ends_on: day(80), owner_id: 'u1' }),
    contract('00000000-0000-4000-8000-0000000000c2', { provider_id: P_NEXO, provider_name: 'Nexo Payments', product: 'acquiring', title: 'Adquirência lojas', ends_on: day(-5), legal_entity_id: ENTITY }),
    contract('00000000-0000-4000-8000-0000000000c3', { provider_id: P_ATLAS, provider_name: 'Atlas Bank', product: 'cash_management', title: 'Pacote de serviços', ends_on: null }),
    contract('00000000-0000-4000-8000-0000000000c4', { provider_id: P_ATLAS, provider_name: 'Atlas Bank', product: 'credit', title: 'Linha longa', ends_on: day(700) })
  ],
  rfqs: [{ id: '00000000-0000-4000-8000-0000000000d1', title: 'Revisão de MDR', product: 'acquiring', status: 'collecting', revision: 2, response_deadline: day(6), owner_id: 'u1', owner_name: 'Paula Nogueira', legal_entity_id: ENTITY,
    invites: [{ provider_id: P_NEXO, provider_name: 'Nexo Payments', status: 'accepted' }], proposals: [] }],
  tasks: [{ id: '00000000-0000-4000-8000-0000000000f1', title: 'Revisar renovação', due_on: day(-2), status: 'open', related_type: 'contract', related_id: '00000000-0000-4000-8000-0000000000c1', assignee_id: null }]
};

async function setup(page, { role = 'admin', overview = OVERVIEW, members = null, entities = null } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    calls.push({ path, method: req.method(), body: req.postData() ? JSON.parse(req.postData()) : null });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json(overview);
    if (path === 'members') return json({ ok: true, rows: members || [{ user_id: 'u1', role, display_name: 'Paula Nogueira' }], viewer_id: 'u1' });
    if (path === 'entities') return json({ ok: true, rows: entities || [{ id: ENTITY, legal_name: 'Vitta Varejo', kind: 'subsidiary', parent_id: null }], scope: 'group', can_admin: role === 'admin' });
    if (path === 'contract-import') return json({ ok: true, id: '00000000-0000-4000-8000-0000000000c9', next_task: null }, 201);
    return json({ ok: true, rows: [] });
  });
  return calls;
}

test('fila mostra o que pede ação, por urgência, com responsável, origem e destino', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  await expect(center.getByRole('heading', { name: 'O que pede ação nos relacionamentos' })).toBeVisible();
  const items = center.locator('.rel-item');
  // Vencido primeiro; contrato longe do prazo não entra na fila.
  await expect(items.first()).toContainText('Vigência terminou');
  await expect(items.first()).toContainText('Adquirência lojas');
  await expect(center).not.toContainText('Linha longa');
  await expect(center.locator('[data-situation="window"]')).toContainText('aviso prévio de 60 dias registrado no cadastro');
  await expect(center.locator('[data-situation="window"]')).toContainText('Responsável pela relação contratual: Paula Nogueira (você)');
  await expect(center.locator('[data-situation="no_end"]')).toContainText('Responsável não informado no registro');
  await expect(center.locator('[data-situation="task_overdue"]')).toContainText('Revisar renovação');
  await expect(center.locator('[data-situation="negotiation"]')).toContainText('Revisão de MDR');
  await expect(center.locator('[data-situation="window"]')).toContainText('Origem: Contrato registrado pela empresa (carteira existente)');
  await expect(center.locator('[data-situation="window"]').getByRole('link', { name: /Decidir renovação no contrato/ })).toHaveAttribute('href', /contracts\.html\?abrir=contrato#contract-00000000-0000-4000-8000-0000000000c1/);
  for (const banned of [/melhor/i, /recomendad/i, /score/i]) await expect(center.getByText(banned)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

test('filtros por instituição, entidade, condição e situação recortam a fila', async ({ page }) => {
  await setup(page);
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  await center.getByLabel('Instituição').selectOption(P_NEXO);
  await expect(center.locator('.rel-item')).toHaveCount(2);
  await expect(center).not.toContainText('Capital de giro 2025');
  await center.getByLabel('Instituição').selectOption('');
  await center.getByLabel('Entidade').selectOption(ENTITY);
  await expect(center.locator('.rel-item')).toHaveCount(2);
  await center.getByLabel('Entidade').selectOption('');
  await center.getByLabel('Condição').selectOption('cash_management');
  await expect(center.locator('.rel-item')).toHaveCount(1);
  await expect(center.locator('.rel-item')).toContainText('Término não informado');
  await center.getByLabel('Condição').selectOption('');
  await center.getByLabel('Situação').selectOption('negotiation');
  await expect(center.locator('.rel-item')).toHaveCount(1);
});

test('instituição sem contrato: registrar o existente já com a instituição e seguir para o contrato', async ({ page }) => {
  const calls = await setup(page);
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  await center.getByText(/1 instituição sem contrato vigente registrado/).click();
  await center.locator('.rel-missing-row', { hasText: 'Banco Novo' }).getByRole('button', { name: 'Registrar contrato existente' }).click();
  const form = page.locator('#contract-import-form');
  await expect(form.getByLabel(/^Instituição financeira/)).toHaveValue(P_NOVO);
  await form.getByLabel(/^Título/).fill('Conta e cobrança');
  await form.getByLabel(/^Início/).fill(day(-30));
  await form.getByLabel(/^Fim/).fill(day(335));
  // Aviso prévio não é presumido: sem valor, o registro não é enviado.
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await expect(form.getByText(/Informe o aviso prévio/)).toBeVisible();
  expect(calls.some((c) => c.path === 'contract-import')).toBe(false);
  await form.getByLabel(/^Aviso prévio/).fill('45');
  await page.getByRole('button', { name: 'Revisar registro', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
  await expect.poll(() => calls.find((c) => c.path === 'contract-import')?.body).toMatchObject({ provider_id: P_NOVO, renewal_notice_days: 45 });
  await expect(page).toHaveURL(/contracts\.html\?abrir=contrato#contract-00000000-0000-4000-8000-0000000000c9/);
});

test('leitor vê a fila sem ação de registro', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  await page.goto('/finance/providers.html');
  await expect(page.locator('#relationship-center .rel-item').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar contrato existente' })).toHaveCount(0);
});

test('workspace da instituição separa término, marco de aviso prévio e tarefa operacional', async ({ page }) => {
  await setup(page);
  await page.route('**/api/finance/provider-relationship**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ok: true, provider: { id: P_ATLAS, name: 'Atlas Bank' }, neutrality: 'Fatos do histórico da empresa.', contracts: OVERVIEW.contracts.filter((row) => row.provider_id === P_ATLAS),
    tasks: OVERVIEW.tasks, facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [],
    metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 3, open_issues: 0, median_resolution_days: null, definitions: {} } }) }));
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const attention = page.getByRole('dialog', { name: 'Atlas Bank' }).locator('.rel-attention');
  await expect(attention).toContainText(/Decidir renovação até .*: Capital de giro 2025/);
  await expect(attention).toContainText('60 dias registrados no cadastro; confira no documento');
  await expect(attention).toContainText(/Término contratual em/);
  await expect(attention).toContainText('Tarefa: Revisar renovação');
  await expect(attention).toContainText('responsável não definido');
  // Leva à tarefa específica (a lista de tarefas destaca e rola até ela), não à lista genérica.
  await expect(attention.getByRole('link', { name: 'Abrir tarefa' })).toHaveAttribute('href', /\/finance\/tasks\.html#task-[\w-]+$/);
});

test('workspace da instituição sem contrato vigente oferece registrar o existente', async ({ page }) => {
  await setup(page);
  await page.route('**/api/finance/provider-relationship**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ok: true, provider: { id: P_NOVO, name: 'Banco Novo' }, neutrality: 'Fatos.', contracts: [], facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [],
    metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 0, open_issues: 0, median_resolution_days: null, definitions: {} } }) }));
  await page.goto(`/finance/providers.html?provider_id=${P_NOVO}`);
  await page.getByRole('dialog', { name: 'Banco Novo' }).locator('.rel-start').getByRole('button', { name: 'Registrar contrato existente' }).click();
  await expect(page.locator('#contract-import-form').getByLabel(/^Instituição financeira/)).toHaveValue(P_NOVO);
});

test('uma negociação com várias instituições vira um item só; coleta encerrada não parece prazo perdido', async ({ page }) => {
  const rfq = { id: '00000000-0000-4000-8000-0000000000d2', title: 'Nova linha de R$ 12 milhões', product: 'credit', status: 'comparing', revision: 1, response_deadline: day(-3), owner_name: 'Paula Nogueira',
    invites: [{ provider_id: P_ATLAS, provider_name: 'Atlas Bank', status: 'accepted' }, { provider_id: P_NEXO, provider_name: 'Nexo Payments', status: 'accepted' }, { provider_id: P_NOVO, provider_name: 'Banco Novo', status: 'invited' }], proposals: [] };
  await setup(page);
  await page.route('**/api/finance/overview**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...OVERVIEW, rfqs: [rfq], tasks: [] }) }));
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  const negotiation = center.locator('[data-situation="negotiation"]');
  await expect(negotiation).toHaveCount(1);
  await expect(negotiation).toContainText('Atlas Bank, Nexo Payments, Banco Novo');
  await expect(negotiation).toContainText(/coleta encerrada \(prazo era/);
  await expect(negotiation).toContainText('3 instituições convidadas, 2 com convite aceito');
  await expect(negotiation.getByRole('button', { name: /Relacionamento com/ })).toHaveCount(0);
  await center.getByLabel('Instituição').selectOption(P_NOVO);
  await expect(center.locator('[data-situation="negotiation"]')).toHaveCount(1);
});

test('workspace preserva aviso ausente sem reaproveitar o resumo antigo', async ({ page }) => {
  await setup(page);
  const withoutNotice = OVERVIEW.contracts.filter((row) => row.provider_id === P_ATLAS).map(({ renewal_notice_days, ...row }) => row);
  await page.route('**/api/finance/provider-relationship**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    ok: true, provider: { id: P_ATLAS, name: 'Atlas Bank' }, neutrality: 'Fatos.', contracts: withoutNotice, facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [],
    metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 3, open_issues: 0, median_resolution_days: null, definitions: {} } }) }));
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const attention = page.getByRole('dialog', { name: 'Atlas Bank' }).locator('.rel-attention');
  await expect(attention).not.toContainText('60 dias registrados no cadastro');
  await expect(attention).toContainText('Aviso prévio não informado');
});

// Resposta sintética da API: valida a interface, não substitui prova de RLS real.
test('workspace consulta tarefas próprias, expande a fila e atualiza sem o cache global', async ({ page }, testInfo) => {
  await setup(page);
  let reads = 0;
  await page.route('**/api/finance/provider-relationship**', route => {
    reads++;
    if (reads > 2) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Relacionamento indisponível' }) });
    const tasks = reads === 1 ? Array.from({ length: 8 }, (_, i) => ({ id: `fresh-${i}`, title: `Pendência atual ${i}`, status: 'open', due_on: day(-10 + i), related_type: 'contract', related_id: OVERVIEW.contracts[0].id, assignee_name: 'Ana', assignee_id: 'u2' })) : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      ok: true, provider: { id: P_ATLAS, name: 'Atlas Bank' }, neutrality: 'Fatos.', contracts: OVERVIEW.contracts.filter(row => row.provider_id === P_ATLAS), tasks,
      facilities: [], rfqs: [], invites: [], proposals: [], balances: [], contacts: [], issues: [], relationships: [], map: [], timeline: [], reviews: [], templates: [], coverage: { tasks_truncated: false },
      metrics: { invited: 0, responded: 0, response_rate: null, median_response_days: null, active_contracts: 3, open_issues: 0, median_resolution_days: null, definitions: {} }
    }) });
  });
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const dialog = page.getByRole('dialog', { name: 'Atlas Bank' });
  await expect(dialog.locator('.rel-attention')).toBeVisible();
  if (process.env.RELATIONSHIP_CAPTURE) await page.screenshot({ path: `reports/relationship-${process.env.RELATIONSHIP_CAPTURE}-${testInfo.project.name}.png`, fullPage: true });
  await expect(dialog).toContainText('Tarefa: Pendência atual 0');
  await expect(dialog).not.toContainText('Tarefa: Revisar renovação');
  await dialog.getByText(/Ver mais .* pendências deste recorte/).click();
  await expect(dialog).toContainText('Tarefa: Pendência atual 7');
  await expect(dialog.locator('.rel-attention').getByRole('link', { name: 'Abrir tarefa' })).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Atualizar relacionamento' }).click();
  await expect.poll(() => reads).toBe(2);
  await expect(dialog).not.toContainText('Tarefa: Pendência atual');
  await expect(dialog).not.toContainText('Tarefa: Revisar renovação');
  await dialog.getByRole('button', { name: 'Atualizar relacionamento' }).click();
  await expect.poll(() => reads).toBe(3);
  await expect(dialog).toContainText('Relacionamento indisponível');
  await expect(dialog.locator('.rel-attention')).toHaveCount(0);
});

function pagedRelationship(extra = {}) {
  return { ok:true, provider:{id:P_ATLAS,name:'Atlas Bank'}, neutrality:'Fatos.',
    contracts:OVERVIEW.contracts.filter(row=>row.provider_id===P_ATLAS), tasks:[],
    facilities:[],rfqs:[],invites:[],proposals:[],balances:[],contacts:[],issues:[],relationships:[],map:[],timeline:[],reviews:[],templates:[],
    metrics:{invited:0,responded:0,response_rate:null,median_response_days:null,active_contracts:3,open_issues:0,median_resolution_days:null,definitions:{}}, ...extra };
}

test('relacionamento continua contratos e tarefas; erro parcial preserva o que já foi consultado', async ({page}, testInfo) => {
  await setup(page, {role:'viewer'});
  let taskPages=0;
  const task={id:'page-task-1',title:'Revisar obrigação antiga',status:'open',due_on:day(-10),related_type:'contract',related_id:'outside-contract',assignee_name:null};
  await page.route('**/api/finance/provider-relationship**', route=>{
    const section=new URL(route.request().url()).searchParams.get('section');
    const reply=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    if(section==='tasks') {
      taskPages++;
      if(taskPages===1)return reply({rows:null,page:{has_more:false}});
      return reply({rows:[task,{...task,id:'page-task-2',title:'Conferir documento',due_on:null,assignee_name:'Ana'}],page:{limit:50,has_more:false,next_cursor:null}});
    }
    if(section==='contracts')return reply({rows:[{...OVERVIEW.contracts[0],id:'outside-contract',title:'Contrato anterior recuperado'}],page:{limit:50,has_more:false,next_cursor:null}});
    return reply(pagedRelationship({tasks:[task],pages:{tasks:{limit:200,has_more:true,next_cursor:'task-next'},contracts:{limit:200,has_more:true,next_cursor:'contract-next'}}}));
  });
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const dialog=page.getByRole('dialog',{name:'Atlas Bank'});
  await expect(dialog.getByText('Tarefa: Revisar obrigação antiga',{exact:true})).toBeVisible();
  if(process.env.CONTINUITY_CAPTURE)await page.screenshot({path:`reports/continuity-${process.env.CONTINUITY_CAPTURE}-${testInfo.project.name}.png`});
  await dialog.getByRole('button',{name:'Carregar mais tarefas',exact:true}).click();
  await expect(dialog.locator('.rel-page-error')).toContainText('Não conseguimos carregar a continuação');
  await expect(dialog.getByText('Tarefa: Revisar obrigação antiga',{exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'Carregar mais tarefas',exact:true}).click();
  await expect(dialog).toContainText('Tarefa: Conferir documento');
  await expect(dialog).toContainText('Sem prazo definido · responsável Ana');
  await expect(dialog.getByText('Tarefa: Revisar obrigação antiga',{exact:true})).toHaveCount(1);
  await expect(dialog.locator('.rel-tasks-pages')).toContainText('2 tarefas abertas carregadas');
  await dialog.getByRole('button',{name:'Carregar mais contratos',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('link',{name:'Contrato anterior recuperado'})).toHaveAttribute('href',/contract-outside-contract$/);
  await expect(dialog.locator('.rel-contracts-pages')).toContainText('4 contratos carregados');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(dialog.getByRole('button',{name:'Registrar contrato existente'})).toHaveCount(0);
});

test('atualizar descarta página atrasada e reconsulta tarefas concluídas', async ({page}) => {
  await setup(page);
  let reads=0, pendingRoute;
  await page.route('**/api/finance/provider-relationship**',route=>{
    if(new URL(route.request().url()).searchParams.has('section')){ pendingRoute=route; return; }
    reads++;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(pagedRelationship({tasks:reads===1?[{id:'old-task',title:'Tarefa a concluir',status:'open',due_on:day(-1)}]:[],pages:{tasks:{limit:200,has_more:reads===1,next_cursor:reads===1?'next':null},contracts:{limit:200,has_more:false,next_cursor:null}}}))});
  });
  await page.goto(`/finance/providers.html?provider_id=${P_ATLAS}`);
  const dialog=page.getByRole('dialog',{name:'Atlas Bank'});
  await dialog.getByRole('button',{name:'Carregar mais tarefas',exact:true}).click();
  await expect.poll(()=>Boolean(pendingRoute)).toBe(true);
  await dialog.getByRole('button',{name:'Atualizar relacionamento'}).click();
  await expect.poll(()=>reads).toBe(2);
  await expect(dialog).not.toContainText('Tarefa a concluir');
  await pendingRoute.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows:[{id:'late-task',title:'Resposta obsoleta',status:'open',due_on:day(-3)}],page:{limit:50,has_more:false,next_cursor:null}})});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(dialog).not.toContainText('Resposta obsoleta');
  await expect(dialog.locator('.rel-tasks-pages')).toContainText('0 tarefas abertas carregadas');
});

// ---------------------------------------------------------- Central 3.0
const UNIT = '00000000-0000-4000-8000-0000000000e2';
const OUTSIDE = '00000000-0000-4000-8000-0000000000c8';

test('central 3.0: responsável por tipo, "você", pessoa sem acesso e tarefa sem responsável não se confundem', async ({ page }) => {
  const overview = structuredClone(OVERVIEW);
  overview.contracts[0].owner_id = 'u9';
  overview.tasks.push({ id: '00000000-0000-4000-8000-0000000000f2', title: 'Coletar aditivo', due_on: null, status: 'open', related_type: 'contract', related_id: overview.contracts[2].id, assignee_id: 'u2' });
  await setup(page, { overview, members: [{ user_id: 'u1', role: 'admin', display_name: 'Paula Nogueira' }, { user_id: 'u2', role: 'analyst', display_name: 'Rui Tavares' }] });
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  await expect(center.locator('[data-situation="window"]')).toContainText('Responsável pela relação contratual: pessoa sem acesso atual à organização');
  await expect(center.locator('[data-situation="window"]')).not.toContainText(/Responsável[^.]*: Membro\b/);
  await expect(center.locator('[data-situation="task_overdue"]')).toContainText('Tarefa sem responsável');
  const own = center.locator('.rel-item', { hasText: 'Coletar aditivo' });
  await expect(own).toContainText('Responsável pela tarefa: Rui Tavares');
  await expect(own).toContainText('Sem prazo definido (não é atraso).');
  await expect(own).toHaveAttribute('data-situation', 'task');
  await expect(own).toContainText('Você pode agir neste item.');
});

test('central 3.0: tarefa de contrato fora do recorte aparece com link ao contrato, sem instituição inventada', async ({ page }) => {
  const overview = structuredClone(OVERVIEW);
  overview.tasks.push({ id: '00000000-0000-4000-8000-0000000000f3', title: 'Enviar balanço ao banco', due_on: day(3), status: 'open', related_type: 'contract', related_id: OUTSIDE, assignee_id: null });
  await setup(page, { overview });
  await page.goto('/finance/providers.html');
  const item = page.locator('#relationship-center .rel-item', { hasText: 'Enviar balanço ao banco' });
  await expect(item).toContainText('Instituição do contrato não carregada');
  await expect(item).toContainText('Entidade não carregada');
  await expect(item).toContainText('contrato fora dos contratos carregados');
  await expect(item.getByRole('link', { name: 'Contrato', exact: true })).toHaveAttribute('href', new RegExp(`contracts\\.html\\?abrir=contrato#contract-${OUTSIDE}$`));
  await expect(item.getByRole('button', { name: /Relacionamento/ })).toHaveCount(0);
});

test('central 3.0: entidade em cada item; filtro pela entidade-mãe inclui a unidade', async ({ page }) => {
  const overview = structuredClone(OVERVIEW);
  overview.contracts[0].legal_entity_id = UNIT;
  await setup(page, { overview, entities: [{ id: ENTITY, legal_name: 'Vitta Varejo', kind: 'subsidiary', parent_id: null, status: 'active' }, { id: UNIT, legal_name: 'Loja Centro', kind: 'business_unit', parent_id: ENTITY, status: 'active' }] });
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  await expect(center.locator('[data-situation="expired"]')).toContainText('Vitta Varejo');
  await center.getByLabel('Entidade').selectOption(ENTITY);
  await expect(center.locator('[data-situation="window"]', { hasText: 'Capital de giro 2025' })).toContainText('Loja Centro');
  await expect(center.locator('.rel-item', { hasText: 'Pacote de serviços' })).toHaveCount(0);
});

test('central 3.0: recorte no limite do resumo é declarado; "nada pendente" não vira garantia', async ({ page }) => {
  const overview = structuredClone(OVERVIEW);
  overview.rfqs = []; overview.tasks = [];
  overview.contracts = Array.from({ length: 200 }, (_, i) => contract(`00000000-0000-4000-8000-${String(100000000000 + i)}`, { provider_id: P_ATLAS, provider_name: 'Atlas Bank', product: 'credit', title: `Linha ${i}`, ends_on: day(900) }));
  await setup(page, { overview });
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  await expect(center.locator('#rel-center-scope')).toContainText('chegou ao limite em contratos');
  await expect(center).toContainText('pode haver pendências fora dele');
});

test('central 3.0: leitor vê quem pode agir sem receber a ação como sua', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  await page.goto('/finance/providers.html');
  const item = page.locator('#relationship-center [data-situation="window"]');
  await expect(item).toContainText('Pode agir: administração e gestão financeira; seu papel acompanha.');
  await expect(page.locator('#relationship-center [data-situation="task_overdue"]')).toContainText('Pode agir: administração, gestão financeira e análise');
});

test('central 3.0: celular 390px e teclado percorrem a fila sem overflow', async ({ page }) => {
  await setup(page);
  // Resposta do Radar atrasada: o redesenho acontece com o foco já no link (corrida vista no WebKit).
  let release; const gate = new Promise((resolve) => { release = resolve; });
  await page.route('**/api/finance/opportunities?*', async (route) => { await gate; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [], next: null, summary: [] }) }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/finance/providers.html');
  const first = page.locator('#relationship-center .rel-item').first().getByRole('link').first();
  await first.focus();
  await expect(first).toBeFocused();
  // Sinais do Radar chegam depois e redesenham a fila: o foco do teclado continua no mesmo link.
  release();
  await expect(page.locator('#rel-radar-note')).toContainText('Nenhum sinal ativo');
  await expect(first).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});

// Radar: sinais do Opportunity Engine entram na mesma fila, com motivo, estado,
// origem (regra da empresa) e destino ao detalhe persistido. Sem decisão automática.
test('radar traz sinais das regras da empresa para a fila, por instituição, com destino ao detalhe', async ({ page }) => {
  const OPP = '00000000-0000-4000-8000-0000000000a9';
  const opportunityCalls = [];
  await setup(page);
  await page.route('**/api/finance/opportunities?*', async (route) => {
    const u = new URL(route.request().url()); opportunityCalls.push(Object.fromEntries(u.searchParams));
    const rows = u.searchParams.get('status') === 'open'
      ? [{ id: OPP, cells: ['Diferença de tarifa aguardando revisão', 'Diferença de tarifa (comparável) em TED, 01/09/2026 – 30/09/2026, sem revisão iniciada.', '10/10/2026 (vencido)', 'Revisar tarifa', 'Aberta'], context: { status: 'open', deadline: '2026-10-10', overdue: true, provider_id: P_NEXO, legal_entity_id: ENTITY, source_object_type: 'fee_variance', source_href: '/finance/fees.html?id=v1', linked_rfq_id: null } }] : [];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows, next: null, summary: [] }) });
  });
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  const signal = center.locator('[data-situation="signal_overdue"]');
  await expect(signal).toContainText('Diferença de tarifa aguardando revisão');
  await expect(signal).toContainText('Regra de oportunidade configurada pela sua empresa · estado: Aberta');
  await expect(signal.getByRole('link', { name: /Ver sinal: revisar tarifa/ })).toHaveAttribute('href', new RegExp(`opportunities\\.html\\?id=${OPP}`));
  await expect(center.locator('#rel-radar-note')).toContainText('1 sinal ativo');
  await expect(signal).toContainText('Nexo Payments');
  await expect(signal).toContainText('Vitta Varejo');
  await expect(signal.getByRole('link', { name: 'Origem do sinal' })).toHaveAttribute('href', /fees\.html\?id=v1/);
  expect(new Set(opportunityCalls.map((c) => c.status))).toEqual(new Set(['open', 'acknowledged', 'under_review']));
  await center.getByLabel('Instituição').selectOption(P_ATLAS);
  await expect(center.locator('#rel-radar-note')).toContainText('ligados a Atlas Bank');
  expect(opportunityCalls.some((c) => c.provider_id === P_ATLAS)).toBe(true);
  for (const banned of [/melhor/i, /recomendad/i, /score/i]) await expect(center.getByText(banned)).toHaveCount(0);
});

test('radar indisponível não esconde a fila e diz o que aconteceu', async ({ page }) => {
  await setup(page);
  await page.route('**/api/finance/opportunities?*', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'falha' }) }));
  await page.goto('/finance/providers.html');
  const center = page.locator('#relationship-center');
  await expect(center.locator('#rel-radar-note')).toContainText('Sinais das regras da empresa indisponíveis agora');
  await expect(center.locator('[data-situation="expired"]')).toContainText('Adquirência lojas');
});

// Negotiation Studio: da fila ao rascunho ligado ao contrato, com origem,
// condições registradas, jornada e retorno — sem convidar instituição.
test('renegociação: fila inicia pelo contrato e a solicitação mostra origem, condições, jornada e retorno', async ({ page }) => {
  const RENEWAL = '00000000-0000-4000-8000-0000000000d9';
  const C1 = '00000000-0000-4000-8000-0000000000c1';
  const overview = { ...OVERVIEW, contracts: OVERVIEW.contracts.map((row) => row.id === C1 ? { ...row, main_conditions: 'CDI + 1,9% a.a.', cost_summary: null } : row),
    rfqs: [...OVERVIEW.rfqs, { id: RENEWAL, organization_id: ORG, title: 'Renovação: Capital de giro 2025', product: 'credit', status: 'draft', revision: 1, owner_id: 'u1', invites: [], proposals: [] }] };
  const calls = await setup(page, { overview });
  await page.route('**/api/finance/contract-renewal-rfq', (route) => route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, id: RENEWAL }) }));
  await page.route('**/api/finance/events?*', (route) => {
    const u = new URL(route.request().url());
    const rows = u.searchParams.get('entity_id') === RENEWAL ? [{ id: 'e1', entity_type: 'rfq', entity_id: RENEWAL, event_type: 'rfq_created_from_contract', happened_at: '2026-10-30T10:00:00Z', metadata: { contract_id: C1 } }] : [];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows }) });
  });
  await page.goto('/finance/providers.html');
  const item = page.locator('#relationship-center [data-situation="window"]');
  // Adquirência/crédito em janela: iniciar; tarefa e negociação não ganham o botão.
  await expect(page.locator('#relationship-center [data-situation="negotiation"]').getByRole('button', { name: /renegociação/ })).toHaveCount(0);
  await item.getByRole('button', { name: /Iniciar renegociação/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Nenhuma instituição é convidada automaticamente');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar rascunho' }).click();
  await page.waitForURL(new RegExp(`rfq\\.html\\?id=${RENEWAL}&de=relacionamentos`));
  const origin = page.locator('#negotiation-origin');
  await expect(origin.getByRole('heading', { name: 'Renegociação de contrato existente' })).toBeVisible();
  await expect(origin).toContainText('Atlas Bank');
  await expect(origin).toContainText('CDI + 1,9% a.a.');
  await expect(origin).toContainText('60 dias (confira no documento)');
  await expect(origin.locator('dd.missing').filter({ hasText: 'Não informado' })).toHaveCount(1);
  await expect(origin.locator('[data-step="origin"]')).toHaveAttribute('data-state', 'done');
  await expect(origin.locator('[data-step="request"]')).toHaveAttribute('data-state', 'current');
  await expect(origin.locator('[data-step="proposals"]')).toContainText('sem convidar a instituição');
  await expect(origin.locator('[data-step="decision"]')).toHaveAttribute('data-state', 'todo');
  await expect(origin.locator('[data-step="contract"]')).toContainText('Depois da decisão');
  await expect(origin.getByRole('link', { name: 'Contrato de origem' })).toHaveAttribute('href', new RegExp(`contract-${C1}`));
  await expect(origin.getByRole('link', { name: 'Relacionamento com Atlas Bank' })).toHaveAttribute('href', new RegExp(`provider_id=${P_ATLAS}`));
  await expect(origin.getByRole('link', { name: 'Voltar à Central de Relacionamentos' })).toBeVisible();
  for (const banned of [/melhor/i, /recomendad/i, /vencedor sugerido/i]) await expect(origin.getByText(banned)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
  expect(calls.filter((c) => c.path === 'contract-renewal-rfq')).toHaveLength(0); // rota dedicada acima atendeu a chamada
});

test('renegociação: falha ao iniciar mantém o item e avisa que repetir não duplica', async ({ page }) => {
  await setup(page);
  await page.route('**/api/finance/contract-renewal-rfq', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Serviço indisponível.' }) }));
  await page.goto('/finance/providers.html');
  const item = page.locator('#relationship-center [data-situation="window"]');
  await item.getByRole('button', { name: /Iniciar renegociação/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Criar rascunho' }).click();
  await expect(page.getByText(/Tentar de novo não cria duplicata/)).toBeVisible();
  await expect(item.getByRole('button', { name: /Iniciar renegociação/ })).toBeEnabled();
  await expect(page).toHaveURL(/providers\.html/);
});

test('renegociação: leitor vê a janela de renovação sem a ação de iniciar', async ({ page }) => {
  await setup(page, { role: 'viewer' });
  await page.goto('/finance/providers.html');
  await expect(page.locator('#relationship-center [data-situation="window"]')).toBeVisible();
  await expect(page.locator('#relationship-center').getByRole('button', { name: /renegociação/ })).toHaveCount(0);
});

test('renegociação: solicitação sem contrato de origem não ganha cartão; falha na origem é declarada', async ({ page }) => {
  await setup(page);
  let fail = false;
  await page.route('**/api/finance/events?*', (route) => fail ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' }) : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, rows: [] }) }));
  await page.goto('/finance/rfq.html?id=00000000-0000-4000-8000-0000000000d1');
  await expect(page.getByRole('heading', { name: 'Revisão de MDR' }).first()).toBeVisible();
  await expect(page.locator('#negotiation-origin')).toBeHidden();
  fail = true;
  await page.reload();
  await expect(page.locator('#negotiation-origin')).toContainText('Não foi possível consultar a origem');
});

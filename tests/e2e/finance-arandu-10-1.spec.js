import { test, expect } from '@playwright/test';
import { buildComparison, applyUserWeights } from '../../lib/finance/comparison.mjs';
// Arandu 10.1 — integração das telas com as APIs do Arandu 10:
// decision-scenarios, work-intelligence, renewal-operations, approvals
// (cobertura/condições) e demand-readiness.
// API SIMULADA com estado, seguindo docs/integration/ARANDU_10_CONTRACT.md
// (versão otimista, request_key, cursor, coverage.total=null). Prova o
// comportamento da interface, NÃO o backend real nem ambiente hospedado; a
// jornada contra PostgreSQL/Auth reais é scripts/pilot-local/arandu-10-journey.sh.

const ORG = '00000000-0000-4000-8000-0000000000a1';
const RFQ = '00000000-0000-4000-8000-000000000801';
const DRAFT = '00000000-0000-4000-8000-000000000802';
const PA = '00000000-0000-4000-8000-000000000a01';
const PB = '00000000-0000-4000-8000-000000000a02';
const U1 = '00000000-0000-4000-8000-0000000000f1';
const U2 = '00000000-0000-4000-8000-0000000000f2';
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const terms = (rate) => ({ offered_amount: 500000, interest_rate_month: rate, term_months: 24, valid_until: day(30) });
const proposal = (id, provider, name, rate) => ({ id, provider_id: provider, provider_name: name, provider_kind: 'bank', status: 'submitted', version: 1, versions_count: 1, rfq_revision: 1, submitted_at: new Date(Date.now() - 86400000).toISOString(), terms: terms(rate) });
const rfq = { id: RFQ, organization_id: ORG, title: 'Capital de giro 2027', product: 'credit', status: 'comparing', revision: 1, owner_id: U1, response_deadline: day(-1),
  demand: { amount: 500000, purpose: 'capital_de_giro', term_months: 24 },
  invites: [{ provider_id: PA, provider_name: 'Atlas Bank', status: 'accepted' }, { provider_id: PB, provider_name: 'Boreal Banco', status: 'accepted' }],
  proposals: [proposal('00000000-0000-4000-8000-000000000c01', PA, 'Atlas Bank', 1.4), proposal('00000000-0000-4000-8000-000000000c02', PB, 'Boreal Banco', 1.2)] };
const draft = { id: DRAFT, organization_id: ORG, title: 'Antecipação de recebíveis', product: 'credit', status: 'draft', revision: 1, owner_id: U1, response_deadline: day(10), demand: { purpose: 'capital_de_giro' }, invites: [], proposals: [] };
const members = (role) => ({ ok: true, rows: [{ user_id: U1, role, display_name: 'Ana Tesouraria' }, { user_id: U2, role: 'analyst', display_name: 'Bruno Análise' }], viewer_id: U1 });
const CONTEXT = { rfq_revision: 1, rfq_updated_at: '2026-11-01T10:00:00.000000Z', rfq_status: 'comparing', sources: [] };

/** Servidor simulado de cenários com versão otimista, idempotência e histórico. */
function scenarioServer() {
  const rows = new Map(), keys = new Map(), history = [];
  let seq = 0, staleIds = new Set();
  const dto = (s) => ({ ...s, stale: staleIds.has(s.id), stale_reasons: staleIds.has(s.id) ? ['proposals_changed'] : [], classification: 'human_analysis' });
  const event = (s, type, actor = U1, source = null) => history.unshift({ id: `e${history.length}`, entity_id: s.id, event_type: type, actor_id: actor, happened_at: new Date(Date.now() + history.length * 1000).toISOString(), metadata: { version: s.version, name: s.name, weights: s.weights, status: s.status, source_id: source } });
  const create = (body, type = 'scenario_create', source = null) => {
    const key = `${body.rfq_id || 'dup'}:${body.request_key}`;
    if (keys.has(key)) { const prev = rows.get(keys.get(key)); return JSON.stringify(prev.payload) === JSON.stringify({ name: body.name, weights: body.weights }) ? [201, prev] : [409, null]; }
    const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
    const s = { id, organization_id: ORG, rfq_id: RFQ, name: body.name, weights: body.weights, version: 1, status: 'active', created_by: U1, created_at: new Date().toISOString(), updated_by: U1, updated_at: new Date().toISOString(), context: CONTEXT, payload: { name: body.name, weights: body.weights } };
    rows.set(id, s); keys.set(key, id); event(s, type, U1, source);
    return [201, s];
  };
  return {
    rows, history, staleIds,
    /** Outra sessão altera o cenário (concorrência). */
    externalEdit(id) { const s = rows.get(id); s.version += 1; s.name = `${s.name} (outra sessão)`; s.updated_by = U2; event(s, 'scenario_update', U2); },
    handle(path, method, body, q) {
      const out = (s) => { const { payload, ...rest } = s; return dto(rest); };
      if (path === 'decision-scenarios' && method === 'GET') {
        const status = q.get('status') || 'active';
        return [200, { ok: true, rows: [...rows.values()].filter((s) => s.status === status).reverse().map(out), page: { limit: 25, has_more: false, next_cursor: null }, consistency: 'live_reads_not_transaction_snapshot' }];
      }
      if (path === 'decision-scenarios/detail') {
        const s = rows.get(q.get('id'));
        if (!s) return [404, { ok: false, error: 'Cenário não disponível.', code: 'scenario_not_found' }];
        return [200, { ok: true, scenario: out(s), history: history.filter((e) => e.entity_id === s.id), coverage: { history: { limit: 25, has_more: false, next_cursor: null } } }];
      }
      if (path === 'decision-scenarios' && method === 'POST') { const [status, s] = create(body); return s ? [status, { ok: true, scenario: out(s) }] : [409, { ok: false, error: 'Conflito.', code: 'scenario_conflict' }]; }
      if (path === 'decision-scenarios' && method === 'PATCH') {
        const s = rows.get(body.id);
        if (s.version !== body.expected_version || s.status !== 'active') return [409, { ok: false, error: 'Versão desatualizada.', code: 'scenario_conflict' }];
        Object.assign(s, { name: body.name, weights: body.weights, version: s.version + 1, updated_by: U1, updated_at: new Date().toISOString() });
        if (body.refresh_context) staleIds.delete(s.id);
        event(s, 'scenario_update');
        return [200, { ok: true, scenario: out(s) }];
      }
      if (path === 'decision-scenarios/archive') {
        const s = rows.get(body.id);
        if (s.version !== body.expected_version) return [409, { ok: false, error: 'Versão desatualizada.', code: 'scenario_conflict' }];
        Object.assign(s, { status: 'archived', version: s.version + 1 }); event(s, 'scenario_archive');
        return [200, { ok: true, scenario: out(s) }];
      }
      if (path === 'decision-scenarios/duplicate') {
        const src = rows.get(body.id);
        const [status, s] = create({ request_key: body.request_key, name: body.name, weights: src.weights }, 'scenario_duplicate', src.id);
        return [status, { ok: true, scenario: out(s) }];
      }
      if (path === 'decision-scenarios/compare') {
        if (body.scenario_ids.some((id) => staleIds.has(id))) return [409, { ok: false, error: 'Atualize explicitamente o contexto antes de recalcular.', code: 'scenario_stale' }];
        return [200, { ok: true, classification: 'human_analysis', context: CONTEXT, scenarios: body.scenario_ids.map((id) => ({ scenario: out(rows.get(id)), weighted: applyUserWeights('credit', rfq.proposals, rows.get(id).weights) })) }];
      }
      return null;
    }
  };
}

async function setup(page, { role = 'admin', scenarios = scenarioServer(), extra = null, rfqs = [rfq, draft], contracts = [], approvals = [] } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname.replace('/api/finance/', '');
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    calls.push({ path, method: req.method(), query: Object.fromEntries(u.searchParams), body });
    const json = (v, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(v) });
    const custom = extra?.(path, req.method(), body, u.searchParams, calls);
    if (custom) return json(custom[1], custom[0]);
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json({ ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, providers: [{ id: PA, name: 'Atlas Bank', status: 'active' }, { id: PB, name: 'Boreal Banco', status: 'active' }], contracts, rfqs, tasks: [] });
    if (path === 'members') return json(members(role));
    if (path === 'entities') return json({ ok: true, rows: [], scope: 'group', can_admin: role === 'admin' });
    if (path === 'rfq') { const found = rfqs.find((r) => r.id === u.searchParams.get('id')); return json({ ok: true, rfq: found, ...found }); }
    if (path === 'comparison') return json({ ok: true, comparison: buildComparison('credit', rfq.proposals, rfq.demand, { revision: 1 }), weighted: body?.weights && Object.keys(body.weights).length ? applyUserWeights('credit', rfq.proposals, body.weights) : null });
    if (path === 'approvals' && req.method() === 'GET') return json({ ok: true, viewer_id: U1, rows: approvals, page: { limit: 100, has_more: false, next_cursor: null }, coverage: { assignments: 'complete', counts: 'page_only' } });
    if (path === 'approval-policy') return json({ ok: true, required_for_decision: false });
    const handled = path.startsWith('decision-scenarios') ? scenarios.handle(path, req.method(), body, u.searchParams) : null;
    if (handled) return json(handled[1], handled[0]);
    return json({ ok: true, rows: [] });
  });
  return calls;
}

const studio = (page) => page.locator('#estudio-decisao');
async function setWeight(page, scenarioIndex, label, value) {
  const range = studio(page).locator('.studio-scenario').nth(scenarioIndex).getByRole('slider', { name: new RegExp(`peso de ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });
  await range.evaluate((node, v) => { node.value = String(v); node.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}

test('Decision Studio: cria, salva, recupera após recarregar, edita com versão, histórico, duplica, compara e arquiva pelo servidor', async ({ page }) => {
  const server = scenarioServer();
  const calls = await setup(page, { scenarios: server });
  await page.goto(`/finance/rfq.html?id=${RFQ}#comparacao`);
  await expect(studio(page).getByText('Nenhum cenário salvo nesta solicitação.')).toBeVisible();
  // Criar e salvar.
  const name = studio(page).locator('.studio-scenario').first().locator('input.input').first();
  await name.fill('Taxa prioritária');
  await name.dispatchEvent('change');
  await setWeight(page, 0, 'Taxa (% a.m.)', 70);
  await expect(studio(page).locator('.scenario-save-state').first()).toHaveText('Rascunho não salvo');
  await studio(page).getByRole('button', { name: 'Salvar Taxa prioritária' }).click();
  await expect(studio(page).locator('.scenario-save-state').first()).toHaveText('Salvo na empresa · versão 1');
  const post = calls.find((c) => c.path === 'decision-scenarios' && c.method === 'POST');
  expect(post.body).toMatchObject({ rfq_id: RFQ, name: 'Taxa prioritária', weights: { interest_rate_month: 70 } });
  expect(post.body.request_key).toMatch(/^[A-Za-z0-9._:-]{8,80}$/);
  // Nenhum resultado calculado é enviado como verdade persistida.
  expect(Object.keys(post.body).sort()).toEqual(['name', 'request_key', 'rfq_id', 'weights']);

  // Recarregar: o cenário volta do servidor.
  await page.reload();
  const saved = studio(page).locator('.scenario-saved').filter({ hasText: 'Taxa prioritária' });
  await expect(saved).toContainText('Versão 1 · Ana Tesouraria');
  await expect(saved).toContainText('Contexto atual');

  // Editar com expected_version.
  await saved.getByRole('button', { name: 'Editar Taxa prioritária' }).click();
  await setWeight(page, 0, 'Prazo (meses)', 30);
  await expect(studio(page).locator('.scenario-save-state').first()).toHaveAttribute('data-state', 'dirty');
  await studio(page).getByRole('button', { name: 'Salvar Taxa prioritária' }).click();
  await expect(studio(page).locator('.scenario-save-state').first()).toHaveText('Salvo na empresa · versão 2');
  expect(calls.find((c) => c.method === 'PATCH').body).toMatchObject({ expected_version: 1, weights: { interest_rate_month: 70, term_months: 30 } });

  // Histórico com autoria e versão.
  await studio(page).getByRole('button', { name: 'Histórico de Taxa prioritária' }).click();
  const drawer = page.getByRole('dialog').filter({ hasText: 'Histórico do cenário' });
  await expect(drawer.locator('.scenario-history-row')).toHaveCount(2);
  await expect(drawer.locator('.scenario-history-row').first()).toContainText('Editado · Ana Tesouraria');
  await expect(drawer.locator('.scenario-history-row').first()).toContainText('versão 2');
  await expect(drawer).toContainText('Criado');
  await page.keyboard.press('Escape');

  // Concorrência: outra sessão grava a versão 3; salvar a 2 recebe 409 e não sobrescreve.
  const id = [...server.rows.keys()][0];
  server.externalEdit(id);
  await setWeight(page, 0, 'Prazo (meses)', 40);
  await studio(page).getByRole('button', { name: 'Salvar Taxa prioritária' }).click();
  const conflict = studio(page).locator('.scenario-save-state[role=alert]');
  await expect(conflict).toContainText('alterado em outra sessão');
  await expect(conflict).toContainText('nada foi sobrescrito');
  expect(server.rows.get(id).name).toBe('Taxa prioritária (outra sessão)');
  const patches = calls.filter((c) => c.method === 'PATCH').length;
  await conflict.getByRole('button', { name: 'Carregar versão atual' }).click();
  await expect(studio(page).locator('.scenario-save-state').first()).toHaveText('Salvo · versão 3');
  expect(calls.filter((c) => c.method === 'PATCH').length).toBe(patches); // 409 não é repetido sozinho

  // Duplicar e comparar pelo motor do servidor.
  await studio(page).locator('.scenario-saved').getByRole('button', { name: /^Duplicar/ }).click();
  await expect(studio(page).locator('.scenario-saved')).toHaveCount(2);
  for (const box of await studio(page).locator('.scenario-saved input[type=checkbox]').all()) await box.check();
  await studio(page).getByRole('button', { name: 'Comparar 2 selecionado(s)' }).click();
  await expect(studio(page).locator('.studio-source')).toContainText('Comparação de cenários salvos');
  await expect(studio(page).locator('.studio-table tbody tr')).toHaveCount(2);
  expect(calls.find((c) => c.path === 'decision-scenarios/compare').body.scenario_ids).toHaveLength(2);

  // Arquivar e consultar arquivados.
  await studio(page).locator('.scenario-saved').first().getByRole('button', { name: /^Arquivar/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Arquivar' }).click();
  await expect(studio(page).locator('.scenario-saved')).toHaveCount(1);
  await studio(page).getByRole('button', { name: 'Arquivados' }).click();
  await expect(studio(page).locator('.scenario-saved')).toHaveCount(1);
  await expect(studio(page).locator('.scenario-saved')).toContainText('Arquivado');
  await expect(studio(page).locator('.scenario-saved').getByRole('button', { name: /^Editar/ })).toHaveCount(0);
  await expect(studio(page)).not.toContainText(/melhor proposta|recomendad/i);
});

test('Decision Studio: envio sem confirmação reaproveita a request_key e não duplica', async ({ page }) => {
  const server = scenarioServer();
  let failOnce = true;
  const calls = await setup(page, { scenarios: server, extra: (path, method, body) => {
    if (path === 'decision-scenarios' && method === 'POST' && failOnce) { failOnce = false; server.handle(path, method, body, new URLSearchParams()); return [502, { ok: false, error: 'Gateway' }]; }
    return null;
  } });
  await page.goto(`/finance/rfq.html?id=${RFQ}#comparacao`);
  await setWeight(page, 0, 'Taxa (% a.m.)', 50);
  await studio(page).getByRole('button', { name: 'Salvar Cenário A' }).click();
  await expect(studio(page).locator('.scenario-save-state').first()).toContainText('Não confirmamos o salvamento');
  await studio(page).getByRole('button', { name: 'Salvar Cenário A' }).click();
  await expect(studio(page).locator('.scenario-save-state').first()).toHaveText('Salvo na empresa · versão 1');
  const posts = calls.filter((c) => c.path === 'decision-scenarios' && c.method === 'POST');
  expect(posts).toHaveLength(2);
  expect(posts[1].body.request_key).toBe(posts[0].body.request_key);
  expect(server.rows.size).toBe(1);
  await expect(studio(page).locator('.scenario-saved')).toHaveCount(1);
});

test('Decision Studio: cenário desatualizado bloqueia comparação até atualizar o contexto; viewer só lê', async ({ page }) => {
  const server = scenarioServer();
  server.handle('decision-scenarios', 'POST', { rfq_id: RFQ, name: 'Base', weights: { interest_rate_month: 60 }, request_key: 'seed-0001' }, new URLSearchParams());
  const [id] = server.rows.keys();
  server.staleIds.add(id);
  const calls = await setup(page, { scenarios: server });
  await page.goto(`/finance/rfq.html?id=${RFQ}#comparacao`);
  const row = studio(page).locator('.scenario-saved');
  await expect(row).toContainText('Desatualizado: as propostas mudaram.');
  await row.locator('input[type=checkbox]').check();
  await studio(page).getByRole('button', { name: 'Comparar 1 selecionado(s)' }).click();
  await expect(studio(page).locator('.scenario-library-status')).toContainText('Atualize o contexto do cenário antes de comparar');
  await row.getByRole('button', { name: 'Atualizar contexto de Base' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Atualizar contexto' }).click();
  await expect(studio(page).locator('.scenario-saved')).toContainText('Contexto atual');
  expect(calls.find((c) => c.method === 'PATCH').body).toMatchObject({ refresh_context: true, expected_version: 1 });

  // Viewer: consulta e compara, sem criar/alterar.
  await page.unrouteAll();
  await setup(page, { role: 'viewer', scenarios: server });
  await page.reload();
  await expect(studio(page)).toContainText('Seu papel permite consultar e comparar cenários');
  await expect(studio(page).getByRole('button', { name: /^Salvar/ })).toHaveCount(0);
  await expect(studio(page).getByRole('button', { name: /^Arquivar/ })).toHaveCount(0);
});

function workServer({ failDemands = false } = {}) {
  const tasks = Array.from({ length: 23 }, (_, i) => ({ id: `00000000-0000-4000-8000-000000001${String(i).padStart(3, '0')}`, title: `Tarefa ${i + 1}`, due_on: day(i - 2), status: 'open', assignee_id: i % 2 ? U1 : null, related_type: null, related_id: null, overdue: i < 2, unassigned: !(i % 2), actions: { can_edit: true } }));
  return (path, method, body, q) => {
    if (path !== 'work-intelligence') return null;
    const section = q.get('section');
    const env = (rows, start, limit) => ({ ok: true, section, rows: rows.slice(start, start + limit), page: { limit, has_more: start + limit < rows.length, next_cursor: start + limit < rows.length ? `c${start + limit}` : null }, page_count: Math.min(limit, rows.length - start), coverage: { scope: 'authorized_visible_records', total: null, complete: !q.get('cursor') && rows.length <= limit, counts: 'page_only', enrichment: null } });
    const start = q.get('cursor') ? Number(q.get('cursor').slice(1)) : 0;
    const limit = Number(q.get('limit'));
    if (section === 'tasks') return [200, env(q.get('owner') === 'none' ? tasks.filter((t) => t.unassigned) : tasks, start, limit)];
    if (section === 'approvals') return [200, env([{ id: '00000000-0000-4000-8000-000000000e01', rfq_id: RFQ, requested_by: U2, requested_at: new Date().toISOString(), proposal_version: 1, status: 'pending', stale: true, freshness: 'unknown', context_coverage: 'incomplete', viewer_can_act: false }], start, limit)];
    if (section === 'demands') return failDemands ? [503, { ok: false, error: 'Schema', code: 'schema_incompatible' }] : [200, env([{ id: DRAFT, title: 'Antecipação de recebíveis', product: 'credit', owner_id: U1, updated_at: new Date().toISOString(), readiness: { ready: false, missing_fields: ['amount'], coverage: { required: 3, missing: 1 } }, actions: { can_edit: true } }], start, limit)];
    if (section === 'contracts') return [200, env([{ id: '00000000-0000-4000-8000-000000000d01', title: 'Crédito Atlas', product: 'credit', status: 'active', urgency: 'notice_due', notice_on: day(-3), ends_on: day(27), owner_id: U2, owner_status: 'member_unavailable', unassigned: true, renewal_rfqs: [] }], start, limit)];
    return null;
  };
}

test('Caixa de trabalho: quatro seções, cursor independente, cobertura sem total e erro localizado', async ({ page }) => {
  const calls = await setup(page, { extra: workServer({ failDemands: true }) });
  await page.goto('/finance/dashboard.html#caixa-de-trabalho');
  const box = page.locator('#caixa-de-trabalho');
  await expect(box.locator('.work-row')).toHaveCount(20);
  await expect(box).toContainText('há mais registros no servidor. O total não é calculado.');
  await expect(box.getByRole('tab', { name: /Tarefas/ })).toContainText('20+');
  await expect(box.locator('.work-row').first()).toContainText('Por quê: Prazo vencido');
  await box.getByRole('button', { name: 'Carregar mais' }).click();
  await expect(box.locator('.work-row')).toHaveCount(23);
  await expect(box).toContainText('23 itens carregados. A leitura pode não cobrir todos os registros.');
  expect(calls.filter((c) => c.path === 'work-intelligence' && c.query.section === 'tasks').map((c) => c.query.cursor || null)).toEqual([null, 'c20']);
  // Seções só carregam quando abertas.
  expect(calls.some((c) => c.query.section === 'contracts')).toBe(false);
  await box.getByRole('tab', { name: /Aprovações/ }).click();
  await expect(box.locator('.work-row')).toContainText('Contexto inconclusivo');
  await expect(box.locator('.work-row').getByRole('button', { name: /Aprovar/ })).toHaveCount(0);
  await expect(box.locator('.work-row').getByRole('link', { name: 'Abrir pedido' })).toHaveAttribute('href', /approvals\.html#request-/);
  await box.getByRole('tab', { name: /Demandas/ }).click();
  await expect(box.locator('.section-error')).toContainText('Não foi possível carregar');
  await expect(box).not.toContainText('Nenhum item pendente');
  await box.getByRole('tab', { name: /Contratos/ }).click();
  await expect(box.locator('.work-row')).toContainText('responsável sem acesso à organização');
  // Voltar a Tarefas preserva o que já foi carregado (sem nova leitura).
  await box.getByRole('tab', { name: /Tarefas/ }).click();
  await expect(box.locator('.work-row')).toHaveCount(23);
  expect(calls.filter((c) => c.query.section === 'tasks')).toHaveLength(2);
  // Filtro por responsável reinicia só a seção, com o filtro no servidor.
  await box.getByRole('combobox', { name: 'Filtrar por responsável' }).selectOption('none');
  await expect(box.locator('.work-row')).toHaveCount(12);
  expect(calls.at(-1).query).toMatchObject({ section: 'tasks', owner: 'none' });
});

const C1 = '00000000-0000-4000-8000-000000000d01', C2 = '00000000-0000-4000-8000-000000000d02', RENEW = '00000000-0000-4000-8000-000000000809';
const contract = (id, over) => ({ id, organization_id: ORG, provider_id: PA, provider_name: 'Atlas Bank', title: 'Capital de giro', product: 'credit', status: 'active', starts_on: day(-300), ends_on: day(40), renewal_notice_days: 60, ...over });

test('Plano de renovações: renewal-operations com filtros na URL, paginação, responsável ausente e renovação idempotente', async ({ page }) => {
  const calls = await setup(page, { contracts: [contract(C1), contract(C2, { provider_name: 'Boreal Banco', status: 'renewing' })], extra: (path, method, body, q) => {
    if (path === 'renewal-operations') {
      const all = [
        { ...contract(C1), notice_on: day(-20), days_to_end: 40, urgency: 'notice_due', owner_id: U2, owner_status: 'member_unavailable', unassigned: true, tasks: [{ id: 't1', title: 'Preparar', status: 'open' }], milestones: [], renewal_rfqs: [], history: { endpoint: `contract-detail?id=${C1}`, parent_contract_id: null, source_rfq_id: RFQ }, actions: { can_start_renewal: true, endpoint: 'contract-renewal-rfq', automatic_negotiation: false } },
        { ...contract(C2, { status: 'renewing' }), notice_on: day(-5), days_to_end: 55, urgency: 'renewing', owner_id: U1, owner_status: 'assigned', unassigned: false, tasks: [], milestones: [], renewal_rfqs: [{ id: RENEW, title: 'Renovação Boreal', status: 'collecting' }], history: { parent_contract_id: C1, source_rfq_id: null }, actions: { can_start_renewal: true } }
      ].filter((r) => !q.get('urgency') || r.urgency === q.get('urgency'));
      const start = q.get('cursor') ? 1 : 0;
      const enrichment = { tasks: { limit: 500, complete: start === 0 ? false : true } };
      return [200, { ok: true, rows: all.slice(start, start + 1), page: { limit: 25, has_more: start + 1 < all.length, next_cursor: start + 1 < all.length ? 'next' : null }, coverage: { total: null, complete: false, counts: 'page_only', enrichment } }];
    }
    if (path === 'contract-renewal-rfq') return [200, { ok: true, id: RENEW, existing: true }];
    return null;
  } });
  await page.goto('/finance/contracts.html?plano=renovacoes');
  const plan = page.locator('#plano-renovacoes');
  await expect(plan.locator('.renewal-row')).toHaveCount(1);
  const first = plan.locator(`[data-contract="${C1}"]`);
  await expect(first).toContainText('Aviso prévio no prazo');
  await expect(first).toContainText('Responsável cadastrado não é mais membro da organização');
  await expect(first).toContainText('pode haver mais');
  await expect(plan).toContainText('Ausência aqui não significa que o registro não existe');
  await expect(first.getByRole('link', { name: 'Concorrência de origem' })).toHaveAttribute('href', new RegExp(`rfq\\.html\\?id=${RFQ}`));
  await plan.getByRole('button', { name: 'Carregar mais' }).click();
  const second = plan.locator(`[data-contract="${C2}"]`);
  await expect(second.getByRole('link', { name: /Concorrência de renovação: Renovação Boreal/ })).toHaveAttribute('href', new RegExp(`id=${RENEW}&contrato=${C2}`));
  await expect(second.getByRole('link', { name: 'Contrato anterior' })).toHaveAttribute('href', new RegExp(`contract-${C1}`));
  // Filtro de urgência vai ao servidor e fica na URL (recuperação de contexto).
  await plan.getByRole('combobox', { name: 'Plano de renovações: urgência' }).selectOption('renewing');
  await expect(plan.locator('.renewal-row')).toHaveCount(1);
  await expect(page).toHaveURL(/plano_urgencia=renewing/);
  expect(calls.filter((c) => c.path === 'renewal-operations').at(-1).query).toMatchObject({ urgency: 'renewing', organization_id: ORG });
  // Renovação: rota canônica idempotente devolve a RFQ existente; navegação preserva o contrato.
  await plan.locator(`[data-contract="${C2}"]`).getByRole('button', { name: 'Abrir concorrência de renovação' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Continuar' }).click();
  await expect(page).toHaveURL(new RegExp(`rfq\\.html\\?id=${RENEW}&contrato=${C2}`));
  expect(calls.filter((c) => c.path === 'contract-renewal-rfq')).toHaveLength(1);
});

test('Aprovações: contexto inconclusivo bloqueia o voto; contexto atual permite análise e decisão', async ({ page }) => {
  const base = { rfq_id: RFQ, requested_by: U2, requested_at: new Date().toISOString(), status: 'pending', expired: false, steps: [{ id: 's1', approver_id: U1, position: 1, status: 'pending' }] };
  const approvals = [
    { ...base, id: '00000000-0000-4000-8000-000000000e01', proposal_id: rfq.proposals[0].id, proposal_version: 1, stale: false, freshness: 'unknown', viewer_can_act: true, context_coverage: 'incomplete', stale_reasons: [], context_reference: { recorded: { proposal_version: 1 }, current: {} }, action_conditions: { context_current: false, pending: true, unexpired: true } },
    { ...base, id: '00000000-0000-4000-8000-000000000e02', proposal_id: rfq.proposals[1].id, proposal_version: 1, stale: false, freshness: 'current', viewer_can_act: true, context_coverage: 'complete', stale_reasons: [], context_reference: { recorded: { proposal_version: 1, rfq_revision: 1 }, current: { proposal_version: 1 } }, action_conditions: { context_current: true, pending: true, unexpired: true } }
  ];
  const calls = await setup(page, { approvals, extra: (path) => path === 'approvals/act' ? [200, { ok: true, status: 'approved' }] : null });
  await page.goto('/finance/approvals.html');
  const blocked = page.locator('#request-00000000-0000-4000-8000-000000000e01');
  const current = page.locator('#request-00000000-0000-4000-8000-000000000e02');
  // O inconclusivo não conta como "aguardando você".
  await page.getByRole('tab', { name: /Solicitadas por você|Concluídas|Aguardando você/ }).first().click();
  await expect(current.getByRole('button', { name: 'Aprovar' })).toBeVisible();
  await expect(blocked).toHaveCount(0);
  // Contexto do pedido atual: versões e evidência factual.
  await current.getByRole('button', { name: 'Ver contexto' }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('Contexto conferido com a versão atual.');
  await expect(drawer).toContainText('Versão da proposta no pedido: 1 · versão atual: 1.');
  await drawer.getByRole('button', { name: 'Aprovar' }).click();
  await page.getByRole('dialog').filter({ hasText: 'Aprovar esta proposta?' }).getByRole('button', { name: 'Aprovar' }).click();
  await expect.poll(() => calls.filter((c) => c.path === 'approvals/act').length).toBe(1);
  expect(calls.find((c) => c.path === 'approvals/act').body).toMatchObject({ request_id: approvals[1].id, action: 'approved' });
  expect(calls.some((c) => c.path === 'approvals/act' && c.body.request_id === approvals[0].id)).toBe(false);
});

test('Aprovações: pedido inconclusivo mostra o bloqueio no contexto e não oferece voto', async ({ page }) => {
  const approvals = [{ id: '00000000-0000-4000-8000-000000000e01', rfq_id: RFQ, proposal_id: rfq.proposals[0].id, proposal_version: 1, requested_by: U1, requested_at: new Date().toISOString(), status: 'pending', expired: false,
    steps: [{ id: 's1', approver_id: U1, position: 1, status: 'pending' }], stale: false, freshness: 'unknown', viewer_can_act: true, context_coverage: 'incomplete', stale_reasons: [], action_conditions: { context_current: false, pending: true, unexpired: true } }];
  await setup(page, { approvals });
  await page.goto('/finance/approvals.html#request-00000000-0000-4000-8000-000000000e01');
  const drawer = page.getByRole('dialog');
  await expect(drawer).toContainText('Contexto inconclusivo: não aceita decisão');
  await expect(drawer).toContainText('Não foi possível conferir todo o contexto atual');
  await expect(drawer.getByRole('button', { name: 'Aprovar' })).toHaveCount(0);
});

test('Prontidão da demanda: servidor indica pendências, atalho leva ao campo e falha não vira "pronta"', async ({ page }) => {
  let fail = false;
  await setup(page, { extra: (path) => {
    if (path !== 'demand-readiness') return null;
    if (fail) return [503, { ok: false, error: 'Schema', code: 'schema_incompatible' }];
    return [200, { ok: true, rfq_id: DRAFT, readiness: { ready: false, missing_fields: ['amount'], validation_errors: [], coverage: { required: 3, missing: 1 }, provenance: { kind: 'rfq_declared_data', rfq_id: DRAFT, revision: 1, updated_at: new Date().toISOString() }, passport: { suggestions_applied_automatically: false }, notice: 'Prontidão de preenchimento; não comprova aceite.' } }];
  } });
  await page.goto(`/finance/rfq.html?id=${DRAFT}`);
  const panel = page.locator('#prontidao');
  await expect(panel).toContainText('Falta completar 1 item');
  await expect(panel).toContainText('2 de 3 campos obrigatórios informados');
  await expect(panel).toContainText('Sugestões do Passport nunca são aplicadas sem sua ação');
  await panel.getByRole('button', { name: /^Preencher/ }).click();
  await expect(page.locator('#revision-form [name="amount"]')).toBeFocused();
  await page.keyboard.press('Escape');
  fail = true;
  await panel.getByRole('button', { name: 'Conferir de novo' }).click();
  await expect(panel).toContainText('Prontidão não confirmada');
  await expect(panel).not.toContainText('preenchidos');
});

test('Caixa de trabalho e plano em 320 px: sem rolagem horizontal da página', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await setup(page, { extra: workServer() });
  await page.goto('/finance/dashboard.html#caixa-de-trabalho');
  await expect(page.locator('#caixa-de-trabalho .work-row').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

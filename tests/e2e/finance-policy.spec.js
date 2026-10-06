import { test, expect } from '@playwright/test';

// Policy & Approval Engine v2 na interface publicada: governança em
// Configurações, editor de versão com validação, prévia do plano no pedido de
// aprovação (indicação por etapa), linha do tempo da policy no pedido gravado
// e exceção. A sessão é simulada por `page.route`; precedência, SoD, versão
// imutável e isolamento são provados em tests/database/financial-policy-engine.sql.

const ORG = '00000000-0000-4000-8000-0000000000a1';
const RFQ = '00000000-0000-4000-8000-0000000000b1';
const ENTITY_A = '00000000-0000-4000-8000-00000000e0a1';
const POLICY_GROUP = '00000000-0000-4000-8000-0000000001a1';
const VERSION_GROUP = '00000000-0000-4000-8000-0000000001b1';
const REQUEST = '00000000-0000-4000-8000-0000000001c1';
const STAGE_LOCAL = '00000000-0000-4000-8000-0000000001d1';
const STAGE_GROUP = '00000000-0000-4000-8000-0000000001d2';
const U = { paula: 'u1', rui: 'u2', ana: 'u3', bia: 'u4' };

const GROUP_DOCUMENT = {
  rules: [
    { id: 'above_1m', label: 'Acima de R$ 1 milhão exige tesouraria do grupo', when: [{ fact: 'amount', op: 'gte', value: 1000000, currency: 'BRL' }],
      stages: [{ key: 'group_treasury', label: 'Tesouraria do grupo', sequence: 2, roles: ['admin', 'finance_manager'], scope: 'group', min_approvals: 1, due_hours: 24 }] },
    { id: 'competition', label: 'Crédito exige ao menos duas propostas', when: [{ fact: 'product', op: 'in', value: ['credit'] }], requirements: { min_proposals: 2 } }
  ],
  sod: { requester_cannot_decide: true }, exception_approver_roles: ['admin'], expire_after_hours: 336
};
const POLICIES = { ok: true, can_admin: true, flags: [{ key: 'sanctions_review', label: 'Revisão de sanções', kind: 'compliance', active: true }], rows: [
  { id: POLICY_GROUP, legal_entity_id: null, name: 'Alçadas do grupo', status: 'active', versions: [
    { id: VERSION_GROUP, policy_id: POLICY_GROUP, version: 2, status: 'active', document: GROUP_DOCUMENT, change_note: 'Sobe o limite', activated_by: U.paula, activated_at: '2026-10-01T12:00:00Z' },
    { id: '00000000-0000-4000-8000-0000000001b0', policy_id: POLICY_GROUP, version: 1, status: 'superseded', document: GROUP_DOCUMENT, activated_by: U.paula, activated_at: '2026-09-01T12:00:00Z', ended_at: '2026-10-01T12:00:00Z' }
  ] }
] };
const STAGES = [
  { key: 'entity.local', label: 'Aprovação local', sequence: 1, roles: ['finance_manager', 'analyst'], scope: 'entity', min_approvals: 1, due_hours: 48, allow_delegation: true, sources: [] },
  { key: 'group.group_treasury', label: 'Tesouraria do grupo', sequence: 2, roles: ['admin', 'finance_manager'], scope: 'group', min_approvals: 1, due_hours: 24, allow_delegation: true, sources: [] }
];
const EVALUATION = {
  engine: 'policy', approval_required: true,
  policies: [{ version_id: VERSION_GROUP, version: 2, name: 'Alçadas do grupo', scope: 'group' }, { version_id: 'v-a', version: 1, name: 'Alçada local A', scope: 'entity' }],
  matched: [{ policy_version_id: VERSION_GROUP, rule_id: 'above_1m', label: 'Acima de R$ 1 milhão exige tesouraria do grupo', conservative: false, unknown_facts: [] },
    { policy_version_id: VERSION_GROUP, rule_id: 'competition', label: 'Crédito exige ao menos duas propostas', conservative: false, unknown_facts: [] },
    { policy_version_id: 'v-a', rule_id: 'local', label: 'Toda operação da A passa pelo aprovador local', conservative: false, unknown_facts: [] }],
  stages: STAGES, blockers: [{ policy_version_id: VERSION_GROUP, rule_id: 'competition', kind: 'min_proposals', required: 2, actual: 1 }],
  requirements: { min_proposals: 2, justification: false }, unknown_facts: [], sod: { requester_cannot_decide: true, decider_not_sole_final_approver: true }
};
const PROPOSAL = { id: 'p1', provider_id: 'x1', provider_name: 'Banco Um', status: 'submitted', version: 1, rfq_revision: 1, submitted_at: '2026-09-10T10:00:00Z',
  terms: { offered_amount: 2000000, interest_rate_month: 1.4, term_months: 24 } };
const OVERVIEW = { ok: true, organization: { id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }, profile: [], providers: [], contracts: [], tasks: [],
  rfqs: [{ id: RFQ, title: 'Capital de giro Alimentos', product: 'credit', status: 'comparing', revision: 1, response_deadline: '2027-10-01', legal_entity_id: ENTITY_A,
    demand: { amount: 2000000, purpose: 'capital_de_giro', term_months: 24 }, invites_count: 1, owner_id: U.paula, created_at: '2026-09-01T10:00:00Z', proposals: [PROPOSAL] }] };
const MEMBERS = [
  { user_id: U.paula, role: 'admin', entity_scope: 'group', display_name: 'Paula Nogueira', title: 'Tesouraria' },
  { user_id: U.rui, role: 'finance_manager', entity_scope: 'entities', display_name: 'Rui Tavares', title: 'Financeiro Alimentos' },
  { user_id: U.ana, role: 'finance_manager', entity_scope: 'group', display_name: 'Ana Lima', title: 'Tesouraria do grupo' },
  { user_id: U.bia, role: 'viewer', entity_scope: 'group', display_name: 'Bia Souza', title: 'Controladoria' }
];
function policyRequest({ viewerCanAct = false } = {}) {
  return { id: REQUEST, organization_id: ORG, rfq_id: RFQ, proposal_id: 'p1', proposal_version: 1, requested_by: U.rui, requested_at: '2026-10-02T10:00:00Z', status: 'pending',
    rationale: 'Linha com o banco de relacionamento.', policy_snapshot: EVALUATION, policy_version_ids: [VERSION_GROUP, 'v-a'], evaluated_at: '2026-10-02T10:00:00Z', expires_at: '2026-10-16T10:00:00Z',
    engine: 'policy', viewer_can_act: viewerCanAct,
    stages: [{ ...STAGES[0], id: STAGE_LOCAL, stage_key: 'entity.local', status: 'approved' }, { ...STAGES[1], id: STAGE_GROUP, stage_key: 'group.group_treasury', status: 'active', due_at: '2026-10-05T10:00:00Z' }],
    steps: [{ id: 's1', request_id: REQUEST, position: 1, approver_id: U.bia, status: 'approved', stage_id: STAGE_LOCAL, acted_at: '2026-10-02T12:00:00Z', acted_by: U.bia },
      { id: 's2', request_id: REQUEST, position: 2, approver_id: U.paula, status: 'pending', stage_id: STAGE_GROUP }],
    exceptions: [{ id: 'e1', request_id: REQUEST, policy_version_id: VERSION_GROUP, rule_id: 'competition', requested_by: U.rui, reason_code: 'market_constraint', reason: 'Só um banco atende no prazo', evidence: [{ label: 'Ata', reference: 'Comitê 2026-09' }], status: 'requested', created_at: '2026-10-02T11:00:00Z' }] };
}

async function mockSession(page, { approvals = [], preview = EVALUATION } = {}) {
  const calls = [];
  await page.route('**/api/finance/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/finance/', '');
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    calls.push({ method: request.method(), path, body });
    const json = (payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });
    if (path === 'organizations') return json({ ok: true, rows: [{ id: ORG, kind: 'BUYER', legal_name: 'Grupo Vitta' }] });
    if (path === 'overview') return json(OVERVIEW);
    if (path === 'members') return json({ ok: true, rows: MEMBERS, viewer_id: U.paula });
    if (path === 'entities') return json({ ok: true, rows: [{ id: ENTITY_A, organization_id: ORG, kind: 'legal_entity', parent_id: null, legal_name: 'Vitta Alimentos Ltda', short_name: 'Alimentos', currency: 'BRL', status: 'active', depth: 0 }], scope: 'group', can_admin: true, base_currency: 'BRL' });
    if (path === 'entity-scopes') return json({ ok: true, rows: [], viewer_id: U.paula });
    if (path === 'approval-policies' && request.method() === 'GET') return json(POLICIES);
    if (path === 'approval-policies' && request.method() === 'POST') return json({ ok: true, version_id: '00000000-0000-4000-8000-0000000001b9' }, 201);
    if (path === 'approval-policies/preview') return preview ? json({ ok: true, evaluation: preview }) : json({ ok: false }, 404);
    if (path === 'approval-policies/simulate') return json({ ok: true, evaluation: { ...EVALUATION, simulation: true } });
    if (path === 'approval-delegations') return json({ ok: true, rows: [], viewer_id: U.paula });
    if (path === 'approvals') return json({ ok: true, rows: approvals, viewer_id: U.paula });
    if (path === 'approvals/request') return json({ ok: true, id: REQUEST, engine: 'policy' }, 201);
    if (path === 'approvals/act') return json({ ok: true, status: 'pending' });
    if (path === 'approval-exceptions/decide') return json({ ok: true, request_status: 'approved' });
    if (['notifications', 'decisions', 'events', 'comments', 'rfq-revisions', 'tasks', 'notification-preferences', 'scorecard-templates'].includes(path) || path.startsWith('private-documents')) return json({ ok: true, rows: [] });
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

test('governança: policy do grupo com versão, regras e histórico; editor valida antes de salvar', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto('/finance/settings.html#governanca');
  const section = page.locator('#governanca');
  await expect(section.getByRole('heading', { name: 'Governança: policies de aprovação' })).toBeVisible();
  const card = section.locator('.policy-card', { hasText: 'Alçadas do grupo' });
  await expect(card.getByText(/versão 2 ativa desde/)).toBeVisible();
  await expect(card.getByText('Acima de R$ 1 milhão exige tesouraria do grupo')).toBeVisible();
  await expect(card.getByText(/Quando: Valor da operação maior ou igual a BRL 1\.000\.000/)).toBeVisible();
  await expect(card.getByText(/Quem pede a aprovação não registra a decisão/)).toBeVisible();
  await card.getByText('Histórico de versões (2)').click();
  await expect(card.getByText(/substituída/)).toBeVisible();
  // Entidade sem policy: admin vê o convite para criar.
  await expect(section.locator('.policy-card', { hasText: 'Alimentos' }).getByRole('button', { name: 'Criar policy' })).toBeVisible();
  await noHorizontalOverflow(page);

  await card.getByRole('button', { name: 'Nova versão' }).click();
  const drawer = page.locator('dialog.drawer');
  await expect(drawer.getByRole('heading', { name: /Nova versão/ })).toBeVisible();
  // Regra sem nada exigido é recusada antes de chegar à API.
  const firstRule = drawer.locator('.policy-rule-editor').first();
  await firstRule.getByRole('button', { name: 'Remover etapa' }).click();
  await drawer.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect(drawer.getByRole('alert')).toContainText(/precisa exigir/);
  expect(calls.some((call) => call.method === 'POST' && call.path === 'approval-policies')).toBe(false);
  // Corrige com mínimo de propostas e salva: o documento sai estruturado.
  await firstRule.getByLabel('Mínimo de propostas').fill('3');
  await drawer.getByRole('button', { name: 'Salvar rascunho' }).click();
  await expect.poll(() => calls.find((call) => call.method === 'POST' && call.path === 'approval-policies')?.body?.document?.rules?.[0]?.requirements?.min_proposals).toBe(3);
  const saved = calls.find((call) => call.method === 'POST' && call.path === 'approval-policies').body;
  expect(saved.legal_entity_id).toBeNull();
  expect(JSON.stringify(saved.document)).not.toMatch(/_keyEdited|_idEdited/);
});

test('pedido de aprovação: prévia mostra policy, regras, plano local → tesouraria e bloqueio; envia indicações por etapa', async ({ page }) => {
  const calls = await mockSession(page);
  await page.goto(`/finance/rfq.html?id=${RFQ}#aprovacoes`);
  const form = page.locator('#approval-request');
  await expect(form.getByText(/Policy aplicável: Alçadas do grupo v2 \(grupo\) \+ Alçada local A v1 \(entidade\)/)).toBeVisible();
  await expect(form.getByText('Acima de R$ 1 milhão exige tesouraria do grupo')).toBeVisible();
  await expect(form.getByText(/A regra exige ao menos 2 propostas; há 1/)).toBeVisible();
  // Etapa local só lista quem tem concessão de entidade; tesouraria só escopo de grupo.
  const local = form.locator('fieldset', { hasText: '1. Aprovação local' });
  await expect(local.getByText(/Rui Tavares/)).toBeVisible();
  await expect(local.getByText(/Ana Lima/)).toHaveCount(0);
  const treasury = form.locator('fieldset', { hasText: '2. Tesouraria do grupo' });
  await expect(treasury.getByText(/Ana Lima/)).toBeVisible();
  await expect(treasury.getByText(/Rui Tavares/)).toHaveCount(0);
  await form.locator('textarea[name="rationale"]').fill('Linha com o banco de relacionamento.');
  await form.getByRole('button', { name: 'Solicitar aprovação' }).click();
  await expect(form.getByRole('alert')).toContainText('Aprovação local');
  await local.getByLabel(/Rui Tavares/).check();
  await treasury.getByLabel(/Ana Lima/).check();
  await form.getByRole('button', { name: 'Solicitar aprovação' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'approvals/request')?.body?.assignments).toEqual({ 'entity.local': [U.rui], 'group.group_treasury': [U.ana] });
  expect(calls.find((call) => call.path === 'approvals/request').body.approver_ids).toBeUndefined();
});

test('sem policy (ou transporte sem o engine), o pedido continua com aprovadores em ordem', async ({ page }) => {
  const calls = await mockSession(page, { preview: null });
  await page.goto(`/finance/rfq.html?id=${RFQ}#aprovacoes`);
  const form = page.locator('#approval-request');
  await expect(form.getByText('Aprovadores, na ordem em que devem decidir')).toBeVisible();
  await form.getByLabel(/Ana Lima/).check();
  await form.locator('textarea[name="rationale"]').fill('Sem policy configurada.');
  await form.getByRole('button', { name: 'Solicitar aprovação' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'approvals/request')?.body?.approver_ids).toEqual([U.ana]);
});

test('pedido gravado: linha do tempo da policy, prazo, exceção e motivo estruturado ao devolver', async ({ page }) => {
  const calls = await mockSession(page, { approvals: [policyRequest({ viewerCanAct: true })] });
  await page.goto(`/finance/rfq.html?id=${RFQ}#aprovacoes`);
  const card = page.locator(`#request-${REQUEST}`);
  await expect(card.getByText(/Policy: Alçadas do grupo v2 \+ Alçada local A v1/)).toBeVisible();
  await expect(card.getByText('1. Aprovação local')).toBeVisible();
  await expect(card.getByText(/2\. Tesouraria do grupo/)).toBeVisible();
  await expect(card.getByText(/Aguardando · prazo/)).toBeVisible();
  await expect(card.getByText('1 de 2 etapas', { exact: false })).toBeVisible();
  await expect(card.getByText(/Só um banco atende no prazo/)).toBeVisible();
  await expect(card.getByText('Você é aprovador(a) de uma etapa ativa.')).toBeVisible();
  // Devolver com motivo estruturado.
  await card.getByLabel('Motivo ao devolver ou rejeitar (opcional)').selectOption('risk_review');
  await card.getByRole('button', { name: 'Pedir alterações' }).click();
  await page.getByRole('dialog').getByLabel('Motivo').fill('Revisar a garantia exigida');
  await page.getByRole('dialog').getByRole('button', { name: 'Pedir alterações' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'approvals/act')?.body).toEqual({ request_id: REQUEST, action: 'changes_requested', comment: 'Revisar a garantia exigida', reason_code: 'risk_review' });
  await noHorizontalOverflow(page);
});

test('exceção: admin que não pediu decide com motivo registrado', async ({ page }) => {
  const calls = await mockSession(page, { approvals: [policyRequest()] });
  await page.goto(`/finance/rfq.html?id=${RFQ}#aprovacoes`);
  const card = page.locator(`#request-${REQUEST}`);
  await card.getByRole('button', { name: 'Aprovar exceção' }).click();
  await page.getByRole('dialog').getByLabel('Motivo da decisão').fill('Aceita pelo comitê');
  await page.getByRole('dialog').getByRole('button', { name: 'Aprovar exceção' }).click();
  await expect.poll(() => calls.find((call) => call.path === 'approval-exceptions/decide')?.body).toEqual({ exception_id: 'e1', decision: 'approved', comment: 'Aceita pelo comitê' });
});

test('caixa de aprovações usa a vez informada pelo servidor (etapa ativa própria ou delegada)', async ({ page }) => {
  await mockSession(page, { approvals: [policyRequest({ viewerCanAct: true })] });
  await page.goto('/finance/approvals.html');
  await expect(page.getByRole('tab', { name: /Aguardando você/ })).toContainText('1');
  await expect(page.locator(`#request-${REQUEST}`).getByText('Aguardando você')).toBeVisible();
  await noHorizontalOverflow(page);
});

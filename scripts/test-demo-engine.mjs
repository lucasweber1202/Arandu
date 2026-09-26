#!/usr/bin/env node
// Jornada completa da demonstração contra o motor, sem navegador: prova que as
// regras da demo espelham as do produto e que o motor nunca usa a rede.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDemoEngine, DEMO_STORAGE_KEY, validState } from '../finance/demo/engine.js';
import { R, U, P, C, O } from '../finance/demo/seed.js';

globalThis.fetch = () => { throw new Error('O motor da demonstração tentou usar a rede.'); };

function memory() {
  const map = new Map();
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
const storage = memory();
let clock = new Date('2026-09-26T12:00:00Z');
const engine = createDemoEngine({ storage, now: () => clock });
const call = (path, method = 'GET', body) => engine.request(path, { method, body: body ? JSON.stringify(body) : undefined });
const expectError = async (promise, status, pattern) => {
  await assert.rejects(promise, (error) => { assert.equal(error.status, status, error.message); if (pattern) assert.match(error.message, pattern); return true; });
};

// Seed: todos os estados relevantes existem.
const org = O.acme;
let overview = await call(`overview?organization_id=${org}`);
const statuses = new Set(overview.rfqs.map((row) => row.status));
for (const status of ['draft', 'open', 'collecting', 'comparing', 'decided', 'contracted']) assert.ok(statuses.has(status), `seed sem RFQ ${status}`);
assert.ok(overview.contracts.some((row) => row.review_from <= '2026-09-26' && row.status === 'active'), 'seed sem contrato em janela de renovação');
assert.ok(JSON.stringify(overview).includes('— DEMO'));
assert.equal(overview.rfqs.find((row) => row.id === R.capital).revision, 3);
const lineage = overview.rfqs.find((row) => row.id === R.capital).proposals.map((row) => row.rfq_revision).sort();
assert.deepEqual(lineage, [2, 3, 3], 'propostas precisam guardar a revisão respondida');

// 1. Comprador cria, edita e publica.
const editor = await call('rfq-editor', 'PATCH', { organization_id: org, product: 'credit', title: 'Giro jornada', demand: { amount: 900000 }, expected_revision: 0 });
assert.equal(editor.revision, 1);
await expectError(call('rfq-editor', 'PATCH', { organization_id: org, product: 'credit', title: 'Outra aba', demand: {}, expected_revision: 0 }), 409, /outra aba/);
assert.equal((await call(`rfq-editor?organization_id=${org}`)).draft.payload.title, 'Giro jornada');
const created = await call('rfqs', 'POST', { organization_id: org, product: 'credit', title: 'Giro jornada', demand: { amount: 900000, purpose: 'capital_de_giro', term_months: 12 }, response_deadline: '2026-10-10' });
await call('rfq-editor', 'DELETE', { organization_id: org, expected_revision: 1 });
const rfqId = created.id;
assert.equal((await call('rfqs', 'PATCH', { rfq_id: rfqId, expected_revision: 1, title: 'Giro jornada', demand: { amount: 950000, purpose: 'capital_de_giro', term_months: 12 }, response_deadline: '2026-10-10' })).revision, 2);
await expectError(call('rfqs', 'PATCH', { rfq_id: rfqId, expected_revision: 1, title: 'Aba velha', demand: { amount: 1, purpose: 'capital_de_giro', term_months: 12 } }), 409, /revisão 2/);
await call('transition', 'POST', { kind: 'rfq', id: rfqId, from: 'draft', status: 'open' });
await expectError(call('transition', 'POST', { kind: 'rfq', id: rfqId, from: 'open', status: 'decided' }), 409);
const sent = await call('invites/send', 'POST', { rfq_id: rfqId, provider_id: P.atlas });
assert.match(sent.invitationToken, /^[0-9a-f]{64}$/);
await expectError(call('invites/send', 'POST', { rfq_id: rfqId, provider_id: P.atlas }), 409);

// 2. Aprovador não pode criar RFQ (papel viewer).
engine.setPersona('approver');
await expectError(call('rfqs', 'POST', { organization_id: org, product: 'credit', title: 'Sem permissão', demand: { amount: 1, purpose: 'outro', term_months: 1 } }), 403);

// 3. Provedor aceita, rascunha e envia sobre a revisão 2.
engine.setPersona('provider');
await expectError(call(`overview?organization_id=${org}`), 403);
const invites = await call(`assignments?organization_id=${O.atlas}`);
assert.ok(invites.pending_invites.some((row) => row.rfq_id === rfqId));
const accepted = await call('invites/accept', 'POST', { token: sent.invitationToken, provider_organization_id: O.atlas });
await expectError(call('invites/accept', 'POST', { token: sent.invitationToken, provider_organization_id: O.atlas }), 409);
const proposalId = accepted.proposal_id;
const draft = await call('proposal-draft', 'PATCH', { proposal_id: proposalId, terms: { interest_rate_month: 1.3 }, expected_revision: 0, base_version: 0 });
assert.equal(draft.revision, 1);
await expectError(call('proposal-draft', 'PATCH', { proposal_id: proposalId, terms: {}, expected_revision: 0, base_version: 0 }), 409);
const terms = { institution: 'Atlas Bank — DEMO', product_name: 'Giro', offered_amount: 950000, interest_rate_month: 1.3, term_months: 12 };
assert.equal((await call('proposals', 'POST', { proposal_id: proposalId, terms })).version, 1);
assert.equal((await call('proposals', 'POST', { proposal_id: proposalId, terms })).version, 1, 'reenvio idêntico é idempotente');
const comments = await call(`comments?organization_id=${O.atlas}&object_type=rfq&object_id=${R.capital}`);
assert.ok(comments.rows.every((row) => row.visibility === 'provider_visible'), 'provedor leu comentário interno');
await expectError(call('comments', 'POST', { organization_id: O.atlas, object_type: 'rfq', object_id: rfqId, visibility: 'internal', body: 'x', client_id: 'c1' }), 400);

// 4. Comprador revisa para 3: a proposta continua na revisão 2.
engine.setPersona('buyer');
await call('rfqs', 'PATCH', { rfq_id: rfqId, expected_revision: 2, title: 'Giro jornada', demand: { amount: 960000, purpose: 'capital_de_giro', term_months: 12 }, response_deadline: '2026-10-12' });
overview = await call(`overview?organization_id=${org}`);
const journey = overview.rfqs.find((row) => row.id === rfqId);
assert.equal(journey.revision, 3);
assert.equal(journey.proposals[0].rfq_revision, 2, 'linhagem reescrita retroativamente');
assert.equal(journey.status, 'collecting');

// 5. Aprovação sequencial, decisão, contrato e renovação.
await expectError(call('decisions', 'POST', { rfq_id: rfqId, proposal_id: proposalId }), 409, /aprovação/i);
await expectError(call('approvals/request', 'POST', { rfq_id: rfqId, proposal_id: proposalId, approver_ids: [U.marina], rationale: 'x' }), 400);
const approval = await call('approvals/request', 'POST', { rfq_id: rfqId, proposal_id: proposalId, approver_ids: [U.ricardo], rationale: 'Menor taxa.' });
await expectError(call('approvals/act', 'POST', { request_id: approval.id, action: 'approved' }), 403);
engine.setPersona('approver');
const inbox = await call(`notifications?organization_id=${org}`);
assert.ok(inbox.rows.some((row) => row.event_type === 'approval_requested' && row.object_id === rfqId && !row.read_at));
await expectError(call('approvals/act', 'POST', { request_id: approval.id, action: 'rejected', comment: '' }), 400);
assert.equal((await call('approvals/act', 'POST', { request_id: approval.id, action: 'approved' })).status, 'approved');
engine.setPersona('buyer');
const decision = await call('decisions', 'POST', { rfq_id: rfqId, proposal_id: proposalId, criteria: { weights: { interest_rate_month: 70, evil: 30 } } });
await expectError(call('decisions', 'POST', { rfq_id: rfqId, proposal_id: proposalId }), 409);
const snapshot = engine.snapshot();
assert.deepEqual(Object.keys(snapshot.data.decisions.find((row) => row.id === decision.id).criteria.weights), ['interest_rate_month']);
const contract = await call('contracts', 'POST', { decision_id: decision.id, starts_on: '2026-10-01', ends_on: '2026-12-01', renewal_notice_days: 30 });
overview = await call(`overview?organization_id=${org}`);
assert.equal(overview.rfqs.find((row) => row.id === rfqId).status, 'contracted');
assert.ok(overview.tasks.some((row) => row.related_id === contract.id), 'contrato curto precisa gerar tarefa de renovação');
assert.equal((await call('renewals', 'POST', { organization_id: org })).tasks_created, 0, 'renovação não é idempotente');
const renewal = await call('contract-renewal-rfq', 'POST', { organization_id: org, contract_id: C.ecommerce });
assert.equal((await call('contract-renewal-rfq', 'POST', { organization_id: org, contract_id: C.ecommerce })).id, renewal.id);

// 6. Colaboração: menção gera notificação para o mencionado.
await call('comments', 'POST', { organization_id: org, object_type: 'rfq', object_id: rfqId, visibility: 'internal', body: 'Veja isto', mention_ids: [U.ricardo], client_id: 'journey-1' });
await expectError(call('comments', 'POST', { organization_id: org, object_type: 'rfq', object_id: rfqId, visibility: 'internal', body: '<img src=x onerror=alert(1)>', client_id: 'journey-2' }), 400);
engine.setPersona('approver');
const mentions = await call(`notifications?organization_id=${org}`);
const mention = mentions.rows.find((row) => row.event_type === 'mention' && row.object_id === rfqId);
assert.ok(mention);
assert.equal((await call('notifications', 'PATCH', { organization_id: org, ids: [mention.id] })).count, 1);
assert.equal((await call('notifications', 'PATCH', { organization_id: org, ids: [mention.id] })).count, 0);

// 7. Busca, sinais e falha simulada.
engine.setPersona('buyer');
assert.ok((await call(`search?organization_id=${org}&q=adquirencia`)).rows.some((row) => row.kind === 'rfq'));
assert.equal((await call('signals', 'POST', { event: 'comparison_viewed' })).recorded, false);
engine.simulateFailure();
await expectError(call('tasks', 'POST', { organization_id: org, title: 'Falha' }), 503, /simulada/);
assert.ok((await call('tasks', 'POST', { organization_id: org, title: 'Depois da falha' })).row);

// 8. Persistência, estado adulterado e reset.
const raw = storage.getItem(DEMO_STORAGE_KEY);
assert.ok(validState(JSON.parse(raw)));
const again = createDemoEngine({ storage, now: () => clock });
assert.ok((await again.request(`overview?organization_id=${org}`)).rfqs.some((row) => row.id === rfqId), 'estado não sobreviveu à recarga');
storage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ schema: 99, persona: 'root', data: {} }));
const tampered = createDemoEngine({ storage, now: () => clock });
assert.ok(!(await tampered.request(`overview?organization_id=${org}`)).rfqs.some((row) => row.id === rfqId), 'estado inválido não foi descartado');
assert.equal(tampered.recovered(), true);
storage.setItem(DEMO_STORAGE_KEY, '{not json');
assert.equal((await createDemoEngine({ storage, now: () => clock }).request(`overview?organization_id=${org}`)).organization.id, org);
await again.request('tasks', { method: 'POST', body: JSON.stringify({ organization_id: org, title: 'antes do reset' }) });
again.reset();
assert.ok(!(await again.request(`tasks?organization_id=${org}`)).rows.some((row) => row.title === 'antes do reset'));
assert.throws(() => again.setPersona('superuser'));

// 9. Fonte: nenhuma API de rede ou credencial no motor.
for (const file of ['finance/demo/engine.js', 'finance/demo/seed.js']) {
  const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|supabase|service_role|SUPABASE/i, `${file} referencia rede ou credencial`);
}
console.log('Demo engine: jornada completa, permissões por persona, linhagem de revisão, idempotência, persistência, reset e ausência de rede validados.');

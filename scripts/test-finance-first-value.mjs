// Primeiro valor por objetivo: estado só vem de lista do servidor; ausência = não verificado.
import assert from 'node:assert/strict';
import { FIRST_VALUE_GOALS, firstValueSteps, firstValueProgress, suggestedGoal, showFirstValue } from '../lib/finance/first-value.mjs';

const states = (goal, facts) => Object.fromEntries(firstValueSteps(goal, facts).map((s) => [s.key, s.state]));
assert.deepEqual(FIRST_VALUE_GOALS.map((g) => g.key), ['contract', 'relationship', 'rfq']);

// Empresa nova: tudo a fazer, nada inventado.
const empty = { organization: { sector: null }, providers: [], contracts: [], rfqs: [], tasks: [] };
assert.deepEqual(states('contract', empty), { institution: 'todo', contract: 'todo', dates: 'todo', owner: 'todo' });
assert.deepEqual(firstValueProgress(firstValueSteps('contract', empty)).next.key, 'institution');

// Lista que não veio do servidor nunca vira concluído nem a fazer.
assert.deepEqual(states('contract', {}), { institution: 'unknown', contract: 'unknown', dates: 'unknown', owner: 'unknown' });
assert.equal(states('rfq', { rfqs: null }).rfq, 'unknown');
const unknown = firstValueProgress(firstValueSteps('contract', {}));
assert.equal(unknown.done, 0); assert.equal(unknown.unknown, 4); assert.equal(unknown.complete, false);

// Contrato encerrado não conta como contrato vigente; vencimento e responsável exigem fatos próprios.
const facts = { providers: [{ id: 'p1' }], contracts: [{ id: 'c0', status: 'ended', provider_id: 'p1', ends_on: '2026-01-01' }], tasks: [] };
assert.deepEqual(states('contract', facts), { institution: 'done', contract: 'todo', dates: 'todo', owner: 'todo' });
facts.contracts.push({ id: 'c1', status: 'active', provider_id: 'p1', ends_on: null });
assert.deepEqual(states('contract', facts), { institution: 'done', contract: 'done', dates: 'todo', owner: 'todo' });
facts.contracts[1].ends_on = '2027-03-31';
facts.tasks = [{ related_type: 'contract', related_id: 'c1', assignee_id: null }];
assert.equal(states('contract', facts).owner, 'todo', 'tarefa sem responsável não conta');
facts.tasks = [{ related_type: 'contract', related_id: 'c0', assignee_id: 'u' }];
assert.equal(states('contract', facts).owner, 'todo', 'tarefa de contrato encerrado não conta');
facts.tasks = [{ related_type: 'contract', related_id: 'c1', assignee_id: 'u' }];
const done = firstValueProgress(firstValueSteps('contract', facts));
assert.equal(done.complete, true); assert.equal(done.next, null);

// Relacionamento: vínculo só com instituição cadastrada; abrir a tela nunca é "concluído".
const rel = states('relationship', { providers: [{ id: 'p1' }], contracts: [{ provider_id: 'p9' }], rfqs: [] });
assert.equal(rel.linked, 'todo'); assert.equal(rel.open, 'guide');
assert.equal(states('relationship', { providers: [{ id: 'p1' }], contracts: [], rfqs: [{ invites: [{ provider_id: 'p1' }] }] }).linked, 'done');
const relProgress = firstValueProgress(firstValueSteps('relationship', { providers: [{ id: 'p1' }], contracts: [{ provider_id: 'p1' }], rfqs: [] }));
assert.equal(relProgress.total, 2, 'passo-guia fora da contagem'); assert.equal(relProgress.complete, true); assert.equal(relProgress.next.key, 'open');

// Solicitação: convites e propostas só com registros.
assert.deepEqual(states('rfq', { organization: { sector: 'food' }, providers: [{ id: 'p' }], rfqs: [{ invites: [], proposals: [] }] }),
  { profile: 'done', institution: 'done', rfq: 'done', invites: 'todo', proposals: 'todo' });
assert.equal(states('rfq', {}).profile, 'unknown');

assert.equal(suggestedGoal({ rfqs: [{}] }), 'rfq'); assert.equal(suggestedGoal({ contracts: [{}] }), 'contract'); assert.equal(suggestedGoal({}), 'contract');
assert.equal(showFirstValue({ rfqs: [{}] }), false);
assert.equal(showFirstValue({ rfqs: [] }), true);
assert.equal(showFirstValue({}), true);
assert.throws(() => firstValueSteps('marketplace', {}));
for (const goal of ['contract', 'relationship', 'rfq']) for (const step of firstValueSteps(goal, {})) assert.match(step.path, /^\/finance\/[a-z-]+\.html/, 'caminho de fluxo existente');
console.log('First value: estado só do servidor, desconhecido nunca concluído, passos por objetivo e próximo passo PASS.');

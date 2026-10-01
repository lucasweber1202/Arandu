#!/usr/bin/env node
// Gramática da próxima ação da demonstração (finance/demo/workspace/next-action.js):
// cada objeto responde estado · próxima ação · por quê · prazo · responsável,
// a partir dos dados fictícios do motor, sem nunca recomendar proposta.
import assert from 'node:assert/strict';
import { createDemoEngine } from '../finance/demo/engine.js';
import { R, U, O, demoId } from '../finance/demo/seed.js';
import { rfqNext, approvalNext, contractNext, taskNext, opportunityNext, workQueue, proposalFacts, responsesOf } from '../finance/demo/workspace/next-action.js';

globalThis.fetch = () => { throw new Error('A gramática da próxima ação tentou usar a rede.'); };
function memory() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
const engine = createDemoEngine({ storage: memory() });
const call = (path, method = 'GET', body) => engine.request(path, { method, body: body ? JSON.stringify(body) : undefined });
const overview = await call(`overview?organization_id=${O.acme}`);
const members = (await call(`members?organization_id=${O.acme}`)).rows;
const approvals = (await call(`approvals?organization_id=${O.acme}`)).rows;
const rfq = (id) => overview.rfqs.find((row) => row.id === id);
const context = (viewerId) => ({ approvals, viewerId, members, contracts: overview.contracts });
const FORBIDDEN = /vencedor|melhor|recomendad|ranking|ganhador/i;

// Toda próxima ação tem as cinco partes, e nenhuma fala em vencedor.
for (const row of overview.rfqs) {
  const next = rfqNext(row, context(U.marina));
  for (const key of ['state', 'action', 'why', 'owner', 'cta', 'href', 'stage']) assert.ok(next[key], `${row.title}: falta ${key}`);
  assert.doesNotMatch(`${next.action} ${next.why}`, FORBIDDEN, `${row.title}: linguagem de recomendação`);
  assert.ok(next.href.startsWith('/finance/'), 'href relativo ao portal (o ctx.href adiciona /demo)');
}

// Capital de giro: em aprovação, etapa 2 de 2, aguardando Ricardo.
const capitalAsMarina = rfqNext(rfq(R.capital), context(U.marina));
assert.equal(capitalAsMarina.stage, 'approval');
assert.equal(capitalAsMarina.action, 'Aguardando Ricardo Alves');
assert.match(capitalAsMarina.why, /Etapa 2 de 2/);
assert.equal(capitalAsMarina.owner.id, U.ricardo);
assert.equal(capitalAsMarina.mine, false);
// A mesma solicitação, vista por Ricardo: a ação é dele e leva à revisão, não a um "aprovar" direto.
const capitalAsRicardo = rfqNext(rfq(R.capital), context(U.ricardo));
assert.equal(capitalAsRicardo.mine, true);
assert.equal(capitalAsRicardo.cta, 'Revisar decisão');
assert.match(capitalAsRicardo.href, /approvals\.html#request-/);

// Coleta: 2 de 3 responderam, aguardando 1 provedor, versão compacta para o celular.
const acquiring = rfqNext(rfq(R.acquiring), context(U.marina));
assert.equal(acquiring.stage, 'collecting');
assert.equal(acquiring.action, 'Aguardando 1 provedor');
assert.equal(acquiring.why, '2 de 3 responderam.');
assert.match(acquiring.compact, /^2\/3 respostas · \d+d$/);
assert.deepEqual(responsesOf(rfq(R.acquiring)), { invited: 3, answered: 2 });

// Rascunho: completar → convidar → abrir.
const draft = rfqNext(rfq(R.expansion), context(U.joao));
assert.equal(draft.stage, 'draft');
assert.deepEqual(draft.steps, ['Completar demanda', 'Convidar provedores', 'Abrir para propostas']);
assert.equal(draft.mine, true);

// Decidida: registrar contrato.
assert.equal(rfqNext(rfq(R.refinancing), context(U.marina)).action, 'Registrar o contrato');

// Avaliação sem aprovação pendente: fatos das propostas, não julgamento.
const withoutApproval = rfqNext({ ...rfq(R.capital), pending_approval: false }, { ...context(U.marina), approvals: [] });
assert.equal(withoutApproval.action, 'Comparar as 3 propostas recebidas');
assert.match(withoutApproval.why, /campos não informados/);
assert.match(withoutApproval.why, /revisão anterior/);
const facts = proposalFacts(rfq(R.capital));
assert.equal(facts.total, 3);
assert.equal(facts.outdated.length, 1, 'Nexa respondeu à revisão 2');

// Aprovação: estado e ação do ponto de vista de quem vê.
const request = approvals.find((row) => row.rfq_id === R.capital);
assert.equal(approvalNext(request, rfq(R.capital), context(U.ricardo)).state, 'Aguardando você');
assert.equal(approvalNext(request, rfq(R.capital), context(U.marina)).action, 'Aguardando Ricardo Alves');

// Contrato em janela: o prazo é o do aviso prévio.
const windowContract = overview.contracts.find((row) => row.status === 'active' && row.product === 'acquiring');
const renewal = contractNext(windowContract, { members });
assert.match(renewal.action, /^Decidir renovação/);
assert.match(renewal.due.text, /^Aviso prévio em \d+ dias$/);

// Tarefa vencida.
const task = overview.tasks.find((row) => row.status !== 'done' && row.due_on && row.due_on < new Date().toISOString().slice(0, 10));
if (task) assert.equal(taskNext(task, { viewerId: task.assignee_id }).state, 'Vencida');

// Provedor: proposta desatualizada vira "Atualizar proposta"; enviada informa a revisão.
assert.equal(opportunityNext({ rfq_status: 'collecting', version: 2, submitted_rfq_revision: 2, rfq_revision: 3, title: 'x', proposal_id: demoId(6, 1) }).action, 'Atualizar proposta');
assert.match(opportunityNext({ rfq_status: 'collecting', version: 3, submitted_rfq_revision: 3, rfq_revision: 3, title: 'x' }).why, /revisar enquanto a coleta estiver aberta/);

// Fila de trabalho: comprador vê prazo, contrato e renovação; aprovador vê as duas aprovações dele.
const buyerQueue = workQueue({ rfqs: overview.rfqs, approvals, contracts: overview.contracts, tasks: overview.tasks, viewerId: U.marina, members, canManage: true });
assert.ok(buyerQueue.some((item) => item.id === R.acquiring), 'coleta com prazo próximo na fila');
assert.ok(buyerQueue.some((item) => item.id === R.refinancing), 'registrar contrato na fila');
assert.ok(buyerQueue.some((item) => item.kind === 'contract'), 'renovação na fila');
assert.ok(!buyerQueue.some((item) => item.id === R.capital), 'aprovação de outra pessoa não é trabalho da Marina');
const approverQueue = workQueue({ rfqs: overview.rfqs, approvals, contracts: overview.contracts, tasks: [], viewerId: U.ricardo, members, canManage: false });
assert.deepEqual(approverQueue.map((item) => item.id).sort(), [R.capital, R.overdraft].sort());
assert.ok(approverQueue.every((item) => item.cta === 'Revisar decisão'));

console.log('Próxima ação da demonstração: estado, ação, motivo, prazo e responsável coerentes em todos os objetos.');

// Dependências: quem espera quem e o que fica travado.
assert.equal(capitalAsRicardo.dependency.text, 'Marina está esperando sua decisão.');
assert.equal(capitalAsRicardo.dependency.blocks, 'Bloqueia o registro da decisão.');
assert.equal(acquiring.dependency.text, 'Aguardando Atlas Bank.');
assert.match(rfqNext(rfq(R.refinancing), context(U.marina)).dependency.blocks, /renovação/);
console.log('Dependências operacionais: quem espera quem e o que bloqueia, derivados dos dados.');

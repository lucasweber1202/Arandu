import assert from 'node:assert/strict';
import { commandItems, searchCommandItems } from '../lib/finance/command-center.mjs';

const data = {
  rfqs: [{
    id: 'a?b', title: 'Crédito expansão', status: 'open',
    proposals: [{ provider_name: 'Banco Árvore' }]
  }],
  providers: [{ name: 'Instituição Litoral', region: 'Rio' }],
  contracts: [{ provider_name: 'Banco Horizonte', ends_on: '2027-02-01' }],
  tasks: [{ title: 'Revisar garantias', due_on: '2026-10-01' }]
};
const items = commandItems(data);
assert.equal(searchCommandItems(items, '')[0].title, 'Criar solicitação');
assert.equal(searchCommandItems(items, 'credito expansao')[0].href, '/finance/rfq.html?id=a%3Fb');
assert.equal(searchCommandItems(items, 'arvore')[0].kind, 'Proposta');
assert.equal(searchCommandItems(items, 'litoral')[0].kind, 'Provedor');
assert.equal(searchCommandItems(items, '2027-02')[0].kind, 'Contrato');
assert.equal(searchCommandItems(items, 'garantias')[0].kind, 'Tarefa');
assert.deepEqual(searchCommandItems(commandItems({ rfqs: [] }), 'crédito'), []);
assert.equal(searchCommandItems(items, 'banco', 1).length, 1);
console.log('Financial command center: OK');

// Próxima ação de aprovação da RFQ (Arandu 12.1 / P2-D).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { approvalNextAction, validApproval } from '../lib/finance/approval-next-action.mjs';

const at = (d) => `2026-11-${String(d).padStart(2, '0')}T10:00:00Z`;
const req = (status, d, extra = {}) => ({ id: `${status}-${d}`, status, requested_at: at(d), ...extra });
const kind = (rows, required = true) => approvalNextAction(rows, { required }).kind;

assert.equal(kind([]), 'request', 'sem pedido: solicitar aprovação');
assert.equal(kind([], false), 'decide', 'política sem aprovação: registrar decisão');
assert.equal(kind([req('pending', 2)]), 'pending', 'pendente: acompanhar');
assert.equal(kind([req('approved', 3)]), 'decide', 'aprovação final válida: registrar decisão');
assert.equal(kind([req('approved', 3, { stale: true })]), 'rerequest', 'versão desatualizada não libera decisão');
for (const s of ['rejected', 'changes_requested', 'cancelled']) assert.equal(kind([req(s, 4)]), 'rerequest', s);
// Histórico preservado: pedido antigo rejeitado não esconde aprovação nova válida, e o inverso.
assert.equal(kind([req('rejected', 1), req('approved', 5)]), 'decide');
assert.equal(approvalNextAction([req('approved', 1, { stale: true }), req('rejected', 5)], { required: true }).reason, 'rejected');
assert.equal(validApproval([req('approved', 1, { stale: true })]), null);

// Cabeçalho, cartão e aba Decisão consomem a mesma regra (sem 'Solicitar aprovação' fixo após aprovação).
const rfq = readFileSync('finance/src/views/rfq.js', 'utf8');
assert.match(rfq, /approvalNextAction\(approvals, \{ required: policy\.required_for_decision \}\)/);
assert.doesNotMatch(rfq, /linkButton\(policy\.required_for_decision \? 'Solicitar aprovação'/);
assert.match(readFileSync('finance/src/views/rfq/decision-tab.js', 'utf8'), /const approved = validApproval\(approvals\)/);
console.log('RFQ: próxima ação de aprovação (pendente, válida, rejeitada, desatualizada, histórico) aprovada.');

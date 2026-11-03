#!/usr/bin/env node
// Quadro de respostas da negociação: portal + externas, de quem é a vez e
// "Antes de comparar". Puro, sem rede.
import assert from 'node:assert/strict';
import { negotiationBoard, missingComparable, BALL } from '../lib/finance/negotiation-board.mjs';
import { PRODUCTS } from '../lib/finance/products.mjs';

const today = '2026-11-03';
const fields = PRODUCTS.credit.proposalFields;
const comparable = fields.filter((f) => f.comparable);
assert.ok(comparable.length > 2, 'produto de crédito tem condições comparáveis');
const full = Object.fromEntries(comparable.map((f) => [f.key, f.type === 'number' || f.type === 'percent' ? 1 : 'x']));
const partial = { ...full }; delete partial[comparable[0].key];

assert.deepEqual(missingComparable(fields, full), []);
assert.deepEqual(missingComparable(fields, partial), [comparable[0].label.replace(/\s*\(.*\)$/, '')]);

const rfq = { status: 'collecting', revision: 2, response_deadline: '2026-11-10' };
const invites = [
  { provider_id: 'a', provider_name: 'Atlas', status: 'accepted' },
  { provider_id: 'b', provider_name: 'Boreal', status: 'invited' },
  { provider_id: 'c', provider_name: 'Cais', status: 'invited' },
  { provider_id: 'd', provider_name: 'Duna', status: 'declined' }
];
const proposals = [
  { id: 'pa', provider_id: 'a', provider_name: 'Atlas', version: 2, rfq_revision: 2, terms: { ...full, valid_until: '2026-12-01' } },
  { id: 'pc', provider_id: 'c', provider_name: 'Cais', version: 1, rfq_revision: 1, terms: { ...partial, valid_until: '2026-11-01' } }
];
const externals = [
  { id: 'xb', provider_id: 'b', provider_name: 'Boreal', state: 'pending_review', current_version: 1, rfq_revision_matches: true, terms: full },
  { id: 'xe', provider_id: 'e', provider_name: 'Estrela', state: 'reviewed', current_version: 3, rfq_revision_matches: true, terms: partial },
  { id: 'xs', provider_id: 'e', provider_name: 'Estrela', state: 'superseded', current_version: 2, terms: full }
];
const board = negotiationBoard({ rfq, invites, proposals, externals, fields, today });
const by = Object.fromEntries(board.rows.map((r) => [r.providerId, r]));

assert.deepEqual(board.rows.map((r) => r.providerId), ['a', 'b', 'c', 'd', 'e'], 'ordem do convite, sem ranking; externa sem convite ao fim');
assert.equal(by.a.ball, 'none'); assert.equal(by.a.status, 'Proposta v2 recebida');
assert.equal(by.b.ball, 'company', 'externa aguardando conferência: vez da empresa');
assert.match(by.b.notes.join(' '), /fora da comparação até alguém da gestão conferir/);
assert.equal(by.b.channels[0].kind, 'external');
assert.match(by.b.channels[0].label, /não autenticada pela instituição/, 'externa nunca aparece como enviada pela instituição');
assert.equal(by.b.channels[0].inComparison, false);
assert.equal(by.c.ball, 'institution', 'respondeu revisão antiga com coleta aberta');
assert.match(by.c.status, /revisão 1; a solicitação está na revisão 2/);
assert.match(by.c.notes.join(' '), /validade venceu em 01\/11\/2026/);
assert.equal(by.d.status, 'Recusou o convite'); assert.equal(by.d.ball, 'none');
assert.equal(by.e.status, 'Proposta externa conferida');
assert.equal(by.e.channels.length, 1, 'versão substituída não entra');
assert.equal(by.e.channels[0].inComparison, true);
assert.equal(by.e.relationshipHref, '/finance/providers.html?provider_id=e');
assert.equal(by.a.channels[0].href, '#proposal-pa'); assert.equal(by.b.channels[0].href, '#external-xb');
assert.equal(BALL[by.c.ball], by.c.ballLabel);

assert.deepEqual(board.summary, { institutions: 5, waitingInstitution: 1, waitingCompany: 1, inComparison: 3, deadline: 'prazo 10/11/2026' });

const texts = board.readiness.map((i) => i.text);
assert.ok(texts.some((t) => /^Boreal \(externa\): fora da comparação — aguardando conferência\.$/.test(t)), texts.join('\n'));
assert.ok(texts.some((t) => /^Cais \(portal\): responde a uma revisão anterior/.test(t)));
assert.ok(texts.some((t) => /^Cais \(portal\): condição comparável não informada/.test(t)));
assert.ok(texts.some((t) => /^Cais \(portal\): validade venceu/.test(t)));
assert.ok(texts.some((t) => /^Estrela \(externa\): condição comparável não informada/.test(t)));
assert.ok(!texts.some((t) => t.startsWith('Atlas')), 'resposta completa e vigente não gera pendência');
assert.ok(!/melhor|mais vantajos|recomend|ranking|econom/i.test(JSON.stringify(board)), 'sem linguagem de recomendação ou economia');

// Prazo encerrado: convite aberto deixa de ser "aguardando a instituição".
const late = negotiationBoard({ rfq: { ...rfq, response_deadline: '2026-11-01' }, invites: [invites[1]], proposals: [], externals: [], fields, today });
assert.equal(late.rows[0].ball, 'none'); assert.equal(late.rows[0].status, 'Sem proposta até o prazo');
assert.equal(late.summary.deadline, 'prazo encerrado em 01/11/2026');
// Coleta encerrada com resposta: vez da empresa avaliar.
const comparing = negotiationBoard({ rfq: { ...rfq, status: 'comparing' }, invites: [invites[0]], proposals: [proposals[0]], externals: [], fields, today });
assert.equal(comparing.rows[0].ball, 'company');
// Externa conferida para outra revisão: fora da comparação, com motivo.
const stale = negotiationBoard({ rfq, invites: [], proposals: [], externals: [{ ...externals[1], rfq_revision_matches: false }], fields, today });
assert.match(stale.readiness[0].text, /registrada para outra revisão da solicitação/);
assert.throws(() => negotiationBoard({ today: '03/11/2026' }));
console.log('negotiation-board: ok');

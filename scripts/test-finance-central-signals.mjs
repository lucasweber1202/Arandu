#!/usr/bin/env node
// Central 360°: sinais de CRM e Tarifas em "Precisa de você". Puro, sem rede.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { relationshipSignals, feeSignals, feeWindow, sourceCounts, sourceOf, sortSignals, crmProviderOf, shiftDay } from '../lib/finance/central-signals.mjs';

const today = '2026-11-03';
const P1 = 'p1', C1 = 'c1';
const providers = [{ id: P1, name: 'Atlas Bank' }];
const contracts = [{ id: C1, provider_id: P1 }];

assert.equal(shiftDay(today, 2), '2026-11-05');
assert.equal(crmProviderOf({ related_type: 'contract', related_id: C1 }, new Map([[C1, P1]])), P1);
assert.equal(crmProviderOf({ related_type: 'rfq', related_id: 'x' }, new Map()), null);
assert.throws(() => relationshipSignals({ today: '03/11/2026' }));

const activities = [
  { id: 'a1', status: 'planned', kind: 'follow_up', subject: 'Retornar sobre tarifa PIX', due_on: '2026-11-01', owner_id: 'me', related_type: 'provider', related_id: P1 },
  { id: 'a2', status: 'planned', kind: 'meeting', subject: 'Reunião trimestral', due_on: '2026-11-04', owner_id: null, related_type: 'contract', related_id: C1 },
  { id: 'a3', status: 'planned', kind: 'call', subject: 'Fora do horizonte', due_on: '2026-11-20', owner_id: 'me' },
  { id: 'a4', status: 'planned', kind: 'call', subject: 'De outra pessoa', due_on: '2026-11-02', owner_id: 'other' },
  { id: 'a5', status: 'recorded', kind: 'call', subject: 'Já realizada', due_on: '2026-11-02', owner_id: 'me' },
  { id: 'a6', status: 'planned', kind: 'call', subject: 'Sem prazo', due_on: null, owner_id: 'me' }
];
const processes = [
  { id: 'p1', status: 'active', stage: 'negotiation', title: 'Renegociar cash management', next_action: 'Enviar contraproposta', due_on: '2026-10-30', owner_id: 'me', related_type: 'provider', related_id: P1 },
  { id: 'p2', status: 'active', stage: 'engagement', title: 'Abrir conta escrow', next_action: 'Pedir documentação', due_on: null, owner_id: 'me' },
  { id: 'p3', status: 'active', stage: 'won', title: 'Encerrado', next_action: 'x', due_on: '2026-10-01', owner_id: 'me' },
  { id: 'p4', status: 'active', stage: 'qualification', title: 'Sem dono sem data', next_action: 'x', due_on: null, owner_id: null }
];

const editorView = relationshipSignals({ activities, processes, providers, contracts, viewerId: 'me', editor: true, today });
const ids = editorView.map((i) => i.record.id).sort();
assert.deepEqual(ids, ['a1', 'a2', 'p1', 'p2'], 'só o que é de quem lê, dentro do horizonte, ativo e não encerrado');
const late = editorView.find((i) => i.record.id === 'a1');
assert.equal(late.rank, 1); assert.equal(late.tone, 'danger');
assert.match(late.detail, /venceu há 2 dias/);
assert.equal(late.title, 'Retornar sobre tarifa PIX · Atlas Bank');
assert.equal(late.href, `/finance/providers.html?provider_id=${P1}`, 'leva ao relacionamento da instituição');
const viaContract = editorView.find((i) => i.record.id === 'a2');
assert.equal(viaContract.href, `/finance/providers.html?provider_id=${P1}`, 'instituição resolvida pelo contrato vinculado');
assert.match(viaContract.detail, /^Sem responsável · vence amanhã/);
assert.match(editorView.find((i) => i.record.id === 'p2').detail, /sem data/);
assert.equal(editorView.find((i) => i.record.id === 'p2').href, '/finance/providers.html#crm-agenda', 'sem instituição: agenda geral');

const readerView = relationshipSignals({ activities, processes, providers, contracts, viewerId: 'me', editor: false, today });
assert.ok(!readerView.some((i) => i.record.id === 'a2'), 'leitor não recebe compromisso sem responsável');

// Tarifas: uma linha por moeda, nunca somando moedas; zero revisão = nenhum item.
const span = feeWindow(today);
assert.deepEqual(span, { start: '2025-11-03', end: today });
const fees = feeSignals([
  { currency: 'BRL', open_review: 3, above: 2, above_total: 1234.5 },
  { currency: 'USD', open_review: 0, above: 1, above_total: 10 },
  { currency: 'EUR', open_review: 1, above: 0, above_total: 0 }
], span);
assert.equal(fees.length, 2);
assert.equal(fees[0].title, 'Revisar 3 cobranças de tarifa em BRL');
assert.match(fees[0].detail, /2 acima da referência contratada \(R\$\s1\.234,50/);
assert.match(fees[0].detail, /não é erro nem economia/);
const q = new URL(fees[0].href, 'https://x').searchParams;
assert.equal(q.get('review_status'), 'new'); assert.equal(q.get('currency'), 'BRL'); assert.equal(q.get('start'), span.start);
assert.equal(fees[1].title, 'Revisar 1 cobrança de tarifa em EUR');
assert.doesNotMatch(fees[1].detail, /diferença declarada/);
assert.ok(!/econom(ia|izar) de|recuperad/i.test(JSON.stringify(fees)), 'sem claim de economia recuperada');

// Origem e filtros.
assert.equal(sourceOf({ kind: 'Renovação' }), 'contract');
assert.equal(sourceOf({ kind: 'Tarefa' }), 'task');
assert.equal(sourceOf({ kind: 'Aprovação' }), 'negotiation');
const all = sortSignals([...fees, ...editorView, { kind: 'Renovação', rank: 2, due: 5 }]);
assert.equal(all[0].rank, 1);
assert.deepEqual(sourceCounts(all).map((c) => c.key), ['contract', 'relationship', 'fees']);

// O Painel consome o módulo e não cai em "Tudo em dia" quando uma fonte falha.
const dash = readFileSync('finance/src/views/dashboard.js', 'utf8');
assert.match(dash, /crossModuleSignals/);
assert.match(dash, /approvalsMissing \|\| signalsMissing/);
assert.match(dash, /ctx\.mode === 'demo'\) return result/, 'sandbox legado não ganha capacidade');
console.log('central-signals: ok');

#!/usr/bin/env node
// Carteira de contratos: exceções factuais, filtros pela URL e resumo por
// instituição. Puro, sem rede.
import assert from 'node:assert/strict';
import { contractExceptions, renewalPosition, readPortfolioFilters, writePortfolioFilters, filterContracts, exceptionCounts, institutionSummary, CONTRACT_EXCEPTIONS } from '../lib/finance/contract-portfolio.mjs';

const today = '2026-11-05';
const base = { status: 'active', starts_on: '2025-01-01', owner_id: 'u1', current_version: 1, document_reference: 'CCB 1', renewal_notice_days: 60, provider_id: 'pA', provider_name: 'Atlas', product: 'credit' };
const C = (id, over = {}) => ({ id, ...base, ...over });
const rows = [
  C('ok', { ends_on: '2028-01-01' }),
  C('window', { ends_on: '2027-01-10' }), // aviso 2026-11-11, janela aberta
  C('past', { ends_on: '2026-12-20' }), // aviso 2026-10-21 passou
  C('expired', { ends_on: '2026-10-01' }),
  C('noend', { ends_on: null, owner_id: null, provider_id: 'pB', provider_name: 'Boreal', product: 'acquiring' }),
  C('nonotice', { ends_on: '2027-06-01', renewal_notice_days: null, current_version: null, document_reference: null }),
  C('ended', { status: 'ended', ends_on: '2025-06-01', owner_id: null })
];
const ex = new Map(rows.map((r) => [r.id, contractExceptions(r, today)]));

assert.deepEqual(ex.get('ok'), []);
assert.deepEqual(ex.get('window'), ['window']);
assert.equal(renewalPosition(rows[1], today).deadline, '2026-11-11');
assert.deepEqual(ex.get('past'), ['past_notice']);
assert.deepEqual(ex.get('expired'), ['expired']);
assert.deepEqual(ex.get('noend'), ['no_end', 'no_owner']);
assert.deepEqual(ex.get('nonotice'), ['no_notice', 'no_terms', 'no_document'], 'sem aviso prévio: desconhecido, não zero');
assert.deepEqual(ex.get('ended'), [], 'encerrado não gera exceção');
assert.throws(() => contractExceptions(rows[0], '05/11/2026'));
for (const k of Object.keys(CONTRACT_EXCEPTIONS)) assert.ok(CONTRACT_EXCEPTIONS[k].label && CONTRACT_EXCEPTIONS[k].hint);
assert.ok(!/risco|score|nota|irregular/i.test(JSON.stringify(CONTRACT_EXCEPTIONS)), 'sem linguagem de risco/score');

// Filtros: só valores conhecidos sobrevivem à URL.
const lookups = { providers: [{ id: 'pA' }, { id: 'pB' }], products: ['credit', 'acquiring'], members: [{ user_id: 'u1' }] };
const f = readPortfolioFilters('?provider_id=pA&product=xx&status=live&owner=evil&excecao=window&q=atl', lookups);
assert.deepEqual(f, { provider_id: 'pA', product: '', status: 'live', owner: '', excecao: 'window', q: 'atl' });
assert.equal(writePortfolioFilters(f), 'provider_id=pA&status=live&excecao=window&q=atl');
assert.equal(readPortfolioFilters('?provider_id=zz', lookups).provider_id, '', 'instituição fora do escopo não filtra');

const all = { provider_id: '', product: '', status: '', owner: '', excecao: '', q: '' };
assert.deepEqual(filterContracts(rows, { ...all, excecao: 'any' }, ex).map((r) => r.id), ['window', 'past', 'expired', 'noend', 'nonotice']);
assert.deepEqual(filterContracts(rows, { ...all, provider_id: 'pB' }, ex).map((r) => r.id), ['noend']);
assert.deepEqual(filterContracts(rows, { ...all, owner: 'none' }, ex).map((r) => r.id), ['noend', 'ended']);
assert.deepEqual(filterContracts(rows, { ...all, status: 'ended' }, ex).map((r) => r.id), ['ended']);
assert.deepEqual(filterContracts(rows, { ...all, q: 'BOREAL' }, ex).map((r) => r.id), ['noend'], 'busca sem acento/caixa');

const counts = exceptionCounts(rows, ex);
assert.equal(counts.any, 5);
assert.deepEqual(counts.items.map((i) => [i.key, i.count]), [['past_notice', 1], ['window', 1], ['expired', 1], ['no_end', 1], ['no_notice', 1], ['no_owner', 1], ['no_terms', 1], ['no_document', 1]]);

const inst = institutionSummary(rows, ex);
assert.deepEqual(inst.map((i) => [i.providerId, i.live, i.withExceptions]), [['pA', 5, 4], ['pB', 1, 1]]);
console.log('contract-portfolio: ok');

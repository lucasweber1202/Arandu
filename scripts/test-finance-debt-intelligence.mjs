import assert from 'node:assert/strict';
import { debtIntelligence } from '../lib/finance/debt-intelligence.mjs';

const facilities = [
  { id: 'a', currency: 'BRL', status: 'active', indexer: 'pre', rate_pct_year: 14 },
  { id: 'b', currency: 'BRL', status: 'active', indexer: 'pre', rate_pct_year: 12 },
  { id: 'c', currency: 'BRL', status: 'active', indexer: 'cdi', spread_pct_year: 2 },
  { id: 'd', currency: 'BRL', status: 'active', indexer: 'cdi', spread_pct_year: 1 },
  { id: 'e', currency: 'BRL', status: 'active', indexer: 'cdi' },
  { id: 'f', currency: 'BRL', status: 'active', indexer: 'pre' },
  { id: 'g', currency: 'BRL', status: 'active', indexer: 'ipca', spread_pct_year: 6 },
  { id: 'h', currency: 'USD', status: 'active', indexer: 'sofr', spread_pct_year: 3 },
  { id: 'i', currency: 'BRL', status: 'active', indexer: 'cdi', spread_pct_year: 9 },
  { id: 'j', currency: 'BRL', status: 'matured', indexer: 'cdi', spread_pct_year: 99 },
  { id: 'k', currency: 'BRL', status: 'active' }
];
const balances = [
  { facility_id: 'a', as_of: '2026-09-30', outstanding_amount: 1000000 },
  { facility_id: 'b', as_of: '2026-09-30', outstanding_amount: 3000000 },
  { facility_id: 'c', as_of: '2026-09-30', outstanding_amount: 2000000 },
  { facility_id: 'c', as_of: '2026-06-30', outstanding_amount: 9999999 },
  { facility_id: 'd', as_of: '2026-09-30', outstanding_amount: 6000000 },
  { facility_id: 'e', as_of: '2026-09-30', outstanding_amount: 2000000 },
  { facility_id: 'f', as_of: '2026-09-30', outstanding_amount: 500000 },
  { facility_id: 'g', as_of: '2026-09-30', outstanding_amount: 1000000 },
  { facility_id: 'h', as_of: '2026-09-30', outstanding_amount: 4000000 },
  { facility_id: 'j', as_of: '2026-09-30', outstanding_amount: 1 },
  { facility_id: 'k', as_of: '2026-09-30', outstanding_amount: 7 }
];
const r = debtIntelligence({ facilities, balances, shocks: { cdi: 1, ipca: -0.5 } });
const brl = r.currencies.find((v) => v.currency === 'BRL');
const usd = r.currencies.find((v) => v.currency === 'USD');
// (1M×14 + 3M×12)/4M = 12.5
assert.deepEqual(brl.fixed_rate_avg, { pct_year: 12.5, covered_outstanding: 4000000, facilities_missing_rate: 1 });
const cdi = brl.spread_avg.find((s) => s.indexer === 'cdi');
// (2M×2 + 6M×1)/8M = 1.25; e sem spread conta à parte; i sem saldo
assert.deepEqual(cdi, { indexer: 'cdi', pct_year: 1.25, covered_outstanding: 8000000, facilities_missing_spread: 1 });
assert.equal(brl.facilities_without_balance, 1, 'i sem saldo');
assert.equal(brl.facilities_without_indexer, 1, 'k sem indexador');
const sCdi = brl.sensitivity.find((s) => s.indexer === 'cdi');
assert.equal(sCdi.exposed_outstanding, 10000000, 'inclui facility sem spread na exposição');
assert.equal(sCdi.annual_impact_estimate, 100000);
assert.equal(sCdi.per_1pp_estimate, 100000);
assert.equal(brl.sensitivity.find((s) => s.indexer === 'ipca').annual_impact_estimate, -5000);
assert.equal(usd.sensitivity[0].annual_impact_estimate, null, 'sem choque informado, sem número');
assert.equal(usd.sensitivity[0].per_1pp_estimate, 40000);
assert.equal(usd.fixed_rate_avg, null);
// nunca soma moedas
assert.ok(!brl.sensitivity.some((s) => s.indexer === 'sofr'));
// entradas inválidas
assert.throws(() => debtIntelligence({ shocks: { pre: 1 } }));
assert.throws(() => debtIntelligence({ shocks: { cdi: 80 } }));
assert.throws(() => debtIntelligence({ shocks: { cdi: Number.NaN } }));
// vazio
assert.deepEqual(debtIntelligence().currencies, []);
// só sem taxa → pct nulo, não zero
const only = debtIntelligence({ facilities: [{ id: 'x', currency: 'BRL', status: 'active', indexer: 'pre' }], balances: [{ facility_id: 'x', as_of: '2026-01-01', outstanding_amount: 10 }] });
assert.equal(only.currencies[0].fixed_rate_avg.pct_year, null);
assert.ok(!JSON.stringify(r).match(/"(score|rank|recommend|best)"/));
console.log('debt intelligence: ok');

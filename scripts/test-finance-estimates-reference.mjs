#!/usr/bin/env node
// Estimativas de custo (lib/finance/products.mjs) contra implementações de
// referência INDEPENDENTES, não contra a própria fórmula:
//
// - crédito PRICE: a parcela de referência é achada por bisseção, simulando o
//   saldo devedor mês a mês até zerar (sem a fórmula fechada); o custo total é
//   a soma das parcelas simuladas mais tarifas;
// - adquirência: soma fatia a fatia em centavos inteiros (BigInt).
//
// Mais propriedades que qualquer implementação correta respeita (taxa maior
// nunca barateia; custo total nunca fica abaixo do principal; taxa zero é
// principal/n) e casos que precisam ser RECUSADOS em vez de virar número.
// Gerador pseudoaleatório com semente fixa: reprodutível no CI.
import assert from 'node:assert/strict';
import { estimateCreditTotalCost, estimateAcquiringMonthlyCost } from '../lib/finance/products.mjs';

let seed = 0x5eed1234;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (min, max) => min + rand() * (max - min);

function referenceInstallment(principal, monthlyRatePct, months) {
  const i = monthlyRatePct / 100;
  const residual = (payment) => { let balance = principal; for (let k = 0; k < months; k += 1) balance = balance * (1 + i) - payment; return balance; };
  let low = 0;
  let high = principal * (1 + i) ** months; // pagar tudo de uma vez no fim é teto
  for (let step = 0; step < 200; step += 1) {
    const mid = (low + high) / 2;
    if (residual(mid) > 0) low = mid; else high = mid;
  }
  return (low + high) / 2;
}

let cases = 0;
// 1. Crédito PRICE pré-fixado sem carência: 400 cenários aleatórios.
for (let n = 0; n < 400; n += 1) {
  const principal = Math.round(pick(10_000, 50_000_000) * 100) / 100;
  const rate = Math.round(pick(0, 6) * 10_000) / 10_000;
  const term = 1 + Math.floor(pick(0, 120));
  const fees = Math.round(pick(0, 50_000) * 100) / 100;
  const result = estimateCreditTotalCost({ offered_amount: principal, interest_rate_month: rate, term_months: term, fees_amount: fees, index: 'pre', amortization: 'price', grace_months: 0 });
  assert.equal(result.estimate, true, `deveria estimar: ${JSON.stringify({ principal, rate, term, fees })}`);
  const installment = referenceInstallment(principal, rate, term);
  const total = installment * term + fees;
  assert(Math.abs(result.installment - installment) <= 0.01, `parcela ${result.installment} ≠ referência ${installment.toFixed(4)} (${principal}, ${rate}%, ${term}m)`);
  assert(Math.abs(result.total_cost - total) <= 0.01 * term + 0.01, `total ${result.total_cost} ≠ referência ${total.toFixed(4)}`);
  assert(result.total_cost + 0.01 >= principal + fees, 'custo total abaixo do principal');
  cases += 1;
}
// 2. Monotonicidade: taxa maior nunca reduz a parcela nem o total.
for (let n = 0; n < 200; n += 1) {
  const base = { offered_amount: Math.round(pick(10_000, 5_000_000)), term_months: 1 + Math.floor(pick(0, 96)), fees_amount: 0, index: 'pre', amortization: 'price', grace_months: 0 };
  const r1 = pick(0, 4);
  const r2 = r1 + pick(0.0001, 2);
  const a = estimateCreditTotalCost({ ...base, interest_rate_month: r1 });
  const b = estimateCreditTotalCost({ ...base, interest_rate_month: r2 });
  assert(b.installment >= a.installment && b.total_cost >= a.total_cost, `taxa maior barateou: ${r1} → ${r2}`);
  cases += 1;
}
// 3. Taxa zero: parcela é principal/n (sem divisão por zero).
for (const term of [1, 7, 360]) {
  const r = estimateCreditTotalCost({ offered_amount: 1_000_000, interest_rate_month: 0, term_months: term, fees_amount: 0, index: 'pre', amortization: 'price', grace_months: 0 });
  assert.equal(r.installment, Math.round((1_000_000 / term) * 100) / 100);
  cases += 1;
}
// 4. Recusas: nada de número quando faltam premissas ou a base não é PRICE pré.
const refuse = [
  { label: 'pós-fixado', terms: { index: 'cdi' } },
  { label: 'SAC', terms: { amortization: 'sac' } },
  { label: 'carência', terms: { grace_months: 3 } },
  { label: 'taxa negativa', terms: { interest_rate_month: -0.5 } },
  { label: 'principal negativo', terms: { offered_amount: -1 } },
  { label: 'prazo fracionário', terms: { term_months: 12.5 } },
  { label: 'prazo zero', terms: { term_months: 0 } },
  { label: 'taxa como texto', terms: { interest_rate_month: '1,5' } },
  { label: 'taxa ausente', terms: { interest_rate_month: null } },
  { label: 'principal absurdo', terms: { offered_amount: 1e15 } },
  { label: 'tarifa negativa', terms: { fees_amount: -10 } }
];
for (const { label, terms } of refuse) {
  const r = estimateCreditTotalCost({ offered_amount: 1_000_000, interest_rate_month: 1.2, term_months: 24, fees_amount: 0, index: 'pre', amortization: 'price', grace_months: 0, ...terms });
  assert.equal(r.estimate, false, `${label} deveria ser recusado`);
  assert.equal(r.total_cost, undefined, `${label} não pode trazer número`);
  cases += 1;
}

// 5. Adquirência: soma em centavos inteiros com fatias e taxas aleatórias.
const cents = (value) => BigInt(Math.round(value * 100));
for (let n = 0; n < 300; n += 1) {
  const volume = Math.round(pick(10_000, 50_000_000));
  const raw = [rand(), rand(), rand(), rand()];
  const sum = raw.reduce((a, b) => a + b, 0);
  const shares = raw.map((value) => Math.round((value / sum) * 10_000) / 100);
  const rates = [pick(0.3, 2), pick(1, 4), pick(1.5, 6), pick(0, 1.5)].map((value) => Math.round(value * 10_000) / 10_000);
  const terminals = Math.floor(pick(0, 50));
  const rent = Math.round(pick(0, 150) * 100) / 100;
  const gateway = Math.round(pick(0, 2_000) * 100) / 100;
  const demand = { monthly_volume: volume, share_debit: shares[0], share_credit_cash: shares[1], share_credit_installment: shares[2], share_pix: shares[3], terminals };
  const terms = { mdr_debit: rates[0], mdr_credit_cash: rates[1], mdr_credit_installment: rates[2], pix_fee: rates[3], terminal_rent: rent, gateway_cost: gateway };
  const result = estimateAcquiringMonthlyCost(demand, terms);
  assert.equal(result.estimate, true);
  // Referência em décimos de milésimo de centavo para não arredondar no meio.
  let variable = 0n;
  shares.forEach((share, index) => { variable += BigInt(Math.round(volume * share * rates[index] * 100)); });
  const variableCents = Number(variable) / 10_000; // volume × (share/100) × (rate/100) × 100 centavos
  const expected = Math.round(variableCents) / 100 + Number(cents(terminals * rent + gateway)) / 100;
  assert(Math.abs(result.total_cost - expected) <= 0.02, `adquirência ${result.total_cost} ≠ referência ${expected.toFixed(2)}`);
  cases += 1;
}
// 6. Adquirência: fatia declarada sem taxa correspondente é recusada; mix parcial é declarado.
assert.equal(estimateAcquiringMonthlyCost({ monthly_volume: 1e6, share_debit: 50, share_pix: 50 }, { mdr_debit: 1 }).estimate, false, 'PIX sem taxa');
const partial = estimateAcquiringMonthlyCost({ monthly_volume: 1e6, share_debit: 40 }, { mdr_debit: 1 });
assert.equal(partial.covers_full_volume, false, 'mix de 40% precisa ser declarado como cobertura parcial');
assert.equal(partial.declared_share, 40);
assert.equal(estimateAcquiringMonthlyCost({ monthly_volume: 1e6, share_debit: 150 }, { mdr_debit: 1 }).estimate, false, 'fatia acima de 100%');
cases += 3;

console.log(`Estimativas financeiras contra referência independente: ${cases} casos (PRICE simulado, monotonicidade, taxa zero, recusas, adquirência em centavos).`);

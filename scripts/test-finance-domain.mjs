import assert from 'node:assert/strict';
import {
  PRODUCT_IDS, normalizeDemand, normalizeProposal,
  estimateCreditTotalCost, estimateAcquiringMonthlyCost
} from '../lib/finance/products.mjs';
import {
  buildComparison, applyUserWeights, comparableFields,
  NEUTRAL_RANKING_NOTICE, USER_WEIGHTS_NOTICE
} from '../lib/finance/comparison.mjs';
import { canTransition, nextStates, RFQ_STATES } from '../lib/finance/workflow.mjs';
import { summarize, withRenewalWindow } from '../lib/api/domains/finance.mjs';

assert.deepEqual(PRODUCT_IDS, ['credit', 'acquiring']);

// --------------------------------------------------- normalização de demanda

{
  const result = normalizeDemand('credit', {
    amount: '500000', purpose: 'capital_de_giro', term_months: 24, grace_months: 3,
    // Campos não declarados são descartados, não persistidos.
    organization_id: 'x', status: 'decided', internal_score: 10
  });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.values, { amount: 500000, purpose: 'capital_de_giro', term_months: 24, grace_months: 3 });
  assert.deepEqual(result.rejected.sort(), ['internal_score', 'organization_id', 'status']);
}

assert.ok(normalizeDemand('credit', { purpose: 'capital_de_giro', term_months: 24 }).errors[0].includes('Valor desejado'));
assert.ok(normalizeDemand('credit', { amount: 1000, purpose: 'lavagem', term_months: 12 }).errors[0].includes('opção inválida'));
assert.ok(normalizeDemand('credit', { amount: 1000, purpose: 'outro', term_months: 12.5 }).errors[0].includes('inteiro'));
assert.ok(normalizeDemand('inexistente', {}).errors[0].includes('Produto financeiro inválido'));

{
  const result = normalizeDemand('acquiring', {
    monthly_volume: 1200000, share_credit_cash: '40', share_debit: 25, share_pix: 25,
    share_credit_installment: 10, channel_ecommerce: 'sim', terminals: 12
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.values.channel_ecommerce, true);
  assert.equal(result.values.share_credit_cash, 40);
}

// -------------------------------------------------- normalização de proposta

{
  const result = normalizeProposal('credit', {
    institution: 'Banco Alfa Demo', product_name: 'Capital de giro', offered_amount: 500000,
    interest_rate_month: 1.85, term_months: 24, status: 'accepted', provider_organization_id: 'spoof'
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.values.status, undefined);
  assert.equal(result.values.provider_organization_id, undefined);
  assert.deepEqual(result.rejected.sort(), ['provider_organization_id', 'status']);
}
assert.ok(normalizeProposal('acquiring', { institution: 'A', product_name: 'B', mdr_debit: 120, mdr_credit_cash: 2 }).errors[0].includes('acima do máximo'));

// --------------------------------------------------------- cálculos e CET

// Sem insumos completos não há estimativa: o Arandu não inventa custo.
assert.equal(estimateCreditTotalCost({ offered_amount: 500000, term_months: 24 }), null);
// Pós-fixado não é projetável sem curva; o campo fica sem estimativa.
assert.equal(estimateCreditTotalCost({ offered_amount: 1000, interest_rate_month: 1, term_months: 12, index: 'cdi' }), null);
{
  const estimate = estimateCreditTotalCost({ offered_amount: 500000, interest_rate_month: 1.85, term_months: 24, fees_amount: 1500 });
  assert.equal(estimate.estimate, true);
  assert.ok(estimate.formula.includes('parcela'));
  assert.deepEqual(Object.keys(estimate.inputs).sort(), ['fees_amount', 'interest_rate_month', 'offered_amount', 'term_months']);
  assert.ok(estimate.total_cost > 500000);
  // Conferência independente do fator PRICE.
  const i = 0.0185;
  const expected = (500000 * i) / (1 - (1 + i) ** -24) * 24 + 1500;
  assert.ok(Math.abs(estimate.total_cost - expected) < 0.05);
}
{
  const estimate = estimateAcquiringMonthlyCost(
    { monthly_volume: 1200000, share_debit: 25, share_credit_cash: 40, share_credit_installment: 10, share_pix: 25, terminals: 10 },
    { mdr_debit: 0.9, mdr_credit_cash: 2.4, mdr_credit_installment: 3.1, pix_fee: 0.4, terminal_rent: 59, gateway_cost: 0 }
  );
  const variable = 1200000 * (0.25 * 0.009 + 0.40 * 0.024 + 0.10 * 0.031 + 0.25 * 0.004);
  assert.ok(Math.abs(estimate.variable_cost - variable) < 0.05);
  assert.equal(estimate.fixed_cost, 590);
  assert.equal(estimate.estimate, true);
}
// Fatia declarada sem a taxa correspondente não vira estimativa parcial.
assert.equal(estimateAcquiringMonthlyCost({ monthly_volume: 1000, share_pix: 100 }, { mdr_debit: 1 }), null);

// ------------------------------------------------------- comparação factual

const proposals = [
  { id: 'a', provider_name: 'Banco Alfa Demo', terms: { institution: 'Banco Alfa Demo', product_name: 'Giro', offered_amount: 500000, interest_rate_month: 1.72, term_months: 24, grace_months: 3 } },
  { id: 'b', provider_name: 'Fintech Beta Demo', terms: { institution: 'Fintech Beta Demo', product_name: 'Giro', offered_amount: 500000, interest_rate_month: 2.10, term_months: 36, grace_months: 0 } },
  { id: 'c', provider_name: 'Credito Gama Demo', terms: { institution: 'Credito Gama Demo', product_name: 'Giro', offered_amount: 450000, interest_rate_month: 1.95, term_months: 30 } }
];

{
  const comparison = buildComparison('credit', proposals, { amount: 500000 });
  assert.equal(comparison.notice, NEUTRAL_RANKING_NOTICE);
  assert.equal(comparison.columns.length, 3);
  const rate = comparison.rows.find((row) => row.key === 'interest_rate_month');
  assert.deepEqual(rate.highlights, ['a']);
  assert.equal(rate.highlight_reason, 'menor valor informado');
  const term = comparison.rows.find((row) => row.key === 'term_months');
  assert.deepEqual(term.highlights, ['b']);
  // Campo sem valor em nenhuma proposta não inventa destaque.
  const cet = comparison.rows.find((row) => row.key === 'cet_year');
  assert.deepEqual(cet.highlights, []);
  // Nenhuma chave de ranking global existe na resposta factual.
  assert.ok(!('ranking' in comparison) && !('recommended' in comparison) && !('best' in comparison));
}

// Empate não gera destaque arbitrário de um único provedor.
{
  const tie = buildComparison('credit', [
    { id: 'x', terms: { interest_rate_month: 2, term_months: 12 } },
    { id: 'y', terms: { interest_rate_month: 2, term_months: 12 } }
  ]);
  assert.deepEqual(tie.rows.find((row) => row.key === 'interest_rate_month').highlights, []);
}

// --------------------------------------------- pesos definidos pelo usuário

// Sem pesos não existe ordenação ponderada.
assert.equal(applyUserWeights('credit', proposals, {}).applied, false);
assert.equal(applyUserWeights('credit', proposals, { interest_rate_month: 0 }).applied, false);
// Critério que não é comparável é ignorado, não inventado.
assert.equal(applyUserWeights('credit', proposals, { collateral_required: 50 }).applied, false);

{
  const weighted = applyUserWeights('credit', proposals, { interest_rate_month: 40, term_months: 25, grace_months: 20, fees_amount: 15 });
  assert.equal(weighted.applied, true);
  assert.equal(weighted.notice, USER_WEIGHTS_NOTICE);
  assert.equal(weighted.source, 'user_weights');
  assert.equal(weighted.results.length, 3);
  // Menor taxa + maior carência lidera com esses pesos; a ordem é consequência
  // aritmética dos pesos da empresa, não de uma opinião do Arandu.
  assert.equal(weighted.results[0].id, 'a');
  // Nenhuma proposta informou tarifas: a cobertura registra o critério em branco.
  assert.ok(weighted.results.every((row) => row.coverage < 1));
  assert.ok(weighted.results.every((row) => row.breakdown.some((item) => item.key === 'fees_amount' && item.normalized === null)));
}

assert.ok(comparableFields('acquiring').some((field) => field.key === 'mdr_debit' && field.direction === 'lower_is_better'));

// ---------------------------------------------------- máquina de estados

assert.deepEqual(RFQ_STATES[0], 'draft');
assert.equal(canTransition('rfq', 'draft', 'open'), true);
assert.equal(canTransition('rfq', 'draft', 'decided'), false);
assert.equal(canTransition('rfq', 'closed', 'open'), false);
assert.equal(canTransition('rfq', 'draft', 'DROP TABLE'), false);
assert.equal(canTransition('contract', 'terminated', 'active'), false);
assert.equal(canTransition('proposal', 'draft', 'submitted'), true);
assert.equal(canTransition('inexistente', 'draft', 'open'), false);
assert.deepEqual(nextStates('rfq', 'comparing').sort(), ['cancelled', 'collecting', 'decided']);
assert.deepEqual(nextStates('rfq', 'inexistente'), []);

// ------------------------------------------------------------- painel

{
  const summary = summarize({
    rfqs: [
      { id: '1', product: 'credit', status: 'open', demand: { amount: 500000 } },
      { id: '2', product: 'acquiring', status: 'comparing', demand: {} },
      { id: '3', product: 'credit', status: 'closed', demand: { amount: 100000 } }
    ],
    contracts: [{ id: 'c1', product: 'acquiring', status: 'active', ends_on: '2020-01-01', renewal_notice_days: 60 }],
    decisions: [{ id: 'd1' }],
    providers: [{ id: 'p1', status: 'active' }, { id: 'p2', status: 'archived' }]
  });
  assert.equal(summary.rfqs_open, 1);
  assert.equal(summary.rfqs_comparing, 1);
  assert.equal(summary.requested_credit_amount, 600000);
  assert.equal(summary.providers_active, 1);
  assert.equal(summary.contracts_expiring, 1);
  assert.equal(summary.repricing_opportunities, 1);
  // Economia nunca é estimada sem metodologia.
  assert.equal(summary.savings, null);
  assert.ok(summary.savings_note.includes('metodologia'));
}

assert.equal(withRenewalWindow({ ends_on: '2030-01-31', renewal_notice_days: 30 }).review_from, '2030-01-01');
assert.equal(withRenewalWindow({ ends_on: 'invalido', renewal_notice_days: 30 }).review_from, null);

console.log('Financial Procurement domain: normalização, cálculos com proveniência, comparação factual, pesos do usuário e máquina de estados aprovados.');

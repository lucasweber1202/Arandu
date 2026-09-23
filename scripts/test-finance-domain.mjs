import assert from 'node:assert/strict';
import {
  PRODUCT_IDS, normalizeDemand, normalizeProposal,
  estimateCreditTotalCost, estimateAcquiringMonthlyCost, checkAcquiringShares
} from '../lib/finance/products.mjs';
import { validateCnpj, normalizeCnpj, formatCnpj } from '../lib/finance/cnpj.mjs';
import {
  buildComparison, applyUserWeights, comparableFields,
  NEUTRAL_RANKING_NOTICE, USER_WEIGHTS_NOTICE
} from '../lib/finance/comparison.mjs';
import { canTransition, nextStates, RFQ_STATES } from '../lib/finance/workflow.mjs';
import { LOW_COVERAGE_THRESHOLD } from '../lib/finance/comparison.mjs';
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

// Sem insumos completos não há estimativa: o Arandu não inventa custo — e diz
// por que não calculou, em vez de devolver vazio sem explicação.
{
  const missing = estimateCreditTotalCost({ offered_amount: 500000, term_months: 24 });
  assert.equal(missing.estimate, false);
  assert.match(missing.reason, /taxa mensal/);
}
// Pós-fixado depende de projeção do indexador, que o Arandu não arbitra.
{
  const indexed = estimateCreditTotalCost({ offered_amount: 1000, interest_rate_month: 1, term_months: 12, index: 'cdi' });
  assert.equal(indexed.estimate, false);
  assert.match(indexed.reason, /CDI/);
}
// A fórmula é PRICE. Aplicá-la a SAC ou bullet daria número errado com cara de certo.
for (const amortization of ['sac', 'bullet', 'customizada']) {
  const result = estimateCreditTotalCost({ offered_amount: 1000, interest_rate_month: 1, term_months: 12, amortization });
  assert.equal(result.estimate, false, `${amortization} não pode usar a fórmula PRICE`);
  assert.match(result.reason, /PRICE/);
}
// Carência muda o tratamento dos juros e varia por contrato.
{
  const grace = estimateCreditTotalCost({ offered_amount: 1000, interest_rate_month: 1, term_months: 12, grace_months: 3 });
  assert.equal(grace.estimate, false);
  assert.match(grace.reason, /carência/);
}
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
{
  const partial = estimateAcquiringMonthlyCost({ monthly_volume: 1000, share_pix: 100 }, { mdr_debit: 1 });
  assert.equal(partial.estimate, false);
  assert.match(partial.reason, /PIX/);
}
// Antecipação fica de fora: exigiria volume antecipado e prazo médio.
{
  const estimate = estimateAcquiringMonthlyCost(
    { monthly_volume: 1000, share_debit: 100, terminals: 0 },
    { mdr_debit: 1, anticipation_rate: 99, terminal_rent: 0, gateway_cost: 0 }
  );
  assert.equal(estimate.total_cost, 10, 'a antecipação não pode entrar na conta');
  assert.ok(estimate.assumptions.some((item) => /antecipação/.test(item)));
  assert.equal(estimate.covers_full_volume, true);
  assert.equal(estimate.unit, 'BRL/mês');
}
// Quando o mix não fecha 100%, a estimativa diz que cobre só o declarado.
{
  const partial = estimateAcquiringMonthlyCost(
    { monthly_volume: 1000, share_debit: 50, terminals: 0 },
    { mdr_debit: 1, terminal_rent: 0, gateway_cost: 0 }
  );
  assert.equal(partial.covers_full_volume, false);
  assert.equal(partial.declared_share, 50);
}

// ------------------------------------------------ mix de recebimentos

assert.equal(checkAcquiringShares({ share_debit: 40, share_credit_cash: 30, share_credit_installment: 20, share_pix: 10 }).ok, true);
// 80 + 60 + 40 = 180 é erro de preenchimento.
{
  const broken = checkAcquiringShares({ share_debit: 80, share_credit_cash: 60, share_credit_installment: 40 });
  assert.equal(broken.ok, false);
  assert.match(broken.errors[0], /180%/);
}
// Diferença pequena é aviso, e o valor informado NÃO é normalizado em silêncio.
{
  const drift = checkAcquiringShares({ share_debit: 40, share_credit_cash: 30, share_credit_installment: 20, share_pix: 5 });
  assert.equal(drift.ok, true);
  assert.equal(drift.warnings.length, 1);
  assert.equal(drift.declared, 95);
}
// Arredondamento do dia a dia não incomoda ninguém.
assert.equal(checkAcquiringShares({ share_debit: 40, share_credit_cash: 30, share_credit_installment: 20, share_pix: 11 }).warnings.length, 0);
assert.equal(checkAcquiringShares({}).ok, true);

// ------------------------------------------------------------- CNPJ

assert.equal(validateCnpj('11.222.333/0001-81').format_valid, true);
// Dígitos conferidos nunca viram afirmação de que a empresa existe.
assert.equal(validateCnpj('11.222.333/0001-81').externally_verified, false);
assert.equal(validateCnpj('11222333000182').format_valid, false);
assert.equal(validateCnpj('11111111111111').format_valid, false);
assert.equal(validateCnpj('112223330001').format_valid, false);
assert.equal(validateCnpj('').format_valid, false);
assert.equal(normalizeCnpj('11.222.333/0001-81'), '11222333000181');
assert.equal(formatCnpj('11222333000181'), '11.222.333/0001-81');

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

// ------------------------------- pesos: empate, cobertura e uma proposta

// Empate não pode depender da direção do campo. Antes, um empate dava 1 para
// "maior é melhor" e 0 para "menor é melhor", e a ordem final mudava conforme
// os campos escolhidos, não conforme as condições.
{
  const tied = [
    { id: 'x', terms: { interest_rate_month: 2, term_months: 24 } },
    { id: 'y', terms: { interest_rate_month: 2, term_months: 24 } }
  ];
  const lower = applyUserWeights('credit', tied, { interest_rate_month: 100 });
  const higher = applyUserWeights('credit', tied, { term_months: 100 });
  assert.deepEqual(lower.results.map((row) => row.score), [1, 1]);
  assert.deepEqual(higher.results.map((row) => row.score), [1, 1]);
  assert.equal(lower.non_discriminating_criteria.length, 1);
  assert.ok(lower.results.every((row) => row.breakdown.every((item) => item.discriminates === false)));
}

// Uma única proposta não produz ordenação com sentido.
{
  const single = applyUserWeights('credit', [proposals[0]], { interest_rate_month: 100 });
  assert.equal(single.applied, true);
  assert.equal(single.ranking_meaningful, false);
}
assert.equal(applyUserWeights('credit', proposals, { interest_rate_month: 40 }).ranking_meaningful, true);

// Cobertura baixa não pode liderar em silêncio sobre uma proposta completa.
{
  const mixed = applyUserWeights('credit', [
    { id: 'completa', terms: { interest_rate_month: 2.0, term_months: 24, grace_months: 3, fees_amount: 1000 } },
    { id: 'quase-vazia', terms: { interest_rate_month: 1.0 } }
  ], { interest_rate_month: 25, term_months: 25, grace_months: 25, fees_amount: 25 });
  const sparse = mixed.results.find((row) => row.id === 'quase-vazia');
  const complete = mixed.results.find((row) => row.id === 'completa');
  assert.equal(sparse.coverage, 0.25);
  assert.equal(sparse.low_coverage, true);
  assert.equal(complete.low_coverage, false);
  assert.ok(sparse.score > complete.score, 'a nota da esparsa é maior sobre o pouco que respondeu');
  assert.equal(mixed.results[0].id, 'completa', 'mesmo assim a completa vem primeiro');
  assert.equal(mixed.has_low_coverage, true);
  assert.equal(mixed.coverage_threshold, LOW_COVERAGE_THRESHOLD);
  assert.deepEqual(sparse.missing_criteria.sort(), ['Carência (meses)', 'Prazo (meses)', 'Tarifas (R$)']);
}

// Peso absurdo vindo do cliente é descartado, não aplicado.
assert.equal(applyUserWeights('credit', proposals, { interest_rate_month: 1e9 }).applied, false);
assert.equal(applyUserWeights('credit', proposals, { interest_rate_month: -5 }).applied, false);
assert.equal(applyUserWeights('credit', proposals, { interest_rate_month: 'muito' }).applied, false);

// A soma dos pesos não precisa ser 100: o que importa é a proporção, e ela é
// devolvida explicitamente para a interface mostrar.
{
  const shares = applyUserWeights('credit', proposals, { interest_rate_month: 3, term_months: 1 });
  assert.equal(shares.criteria.find((item) => item.key === 'interest_rate_month').share, 0.75);
}

// Proposta sem nenhum critério respondido não recebe nota inventada.
{
  const empty = applyUserWeights('credit', [
    { id: 'a', terms: { interest_rate_month: 1 } },
    { id: 'vazia', terms: {} }
  ], { interest_rate_month: 100 });
  const blank = empty.results.find((row) => row.id === 'vazia');
  assert.equal(blank.score, null);
  assert.equal(blank.coverage, 0);
  assert.equal(blank.low_coverage, true);
}

console.log('Financial Procurement domain: normalização, cálculos com proveniência, comparação factual, pesos do usuário e máquina de estados, empates, cobertura e CNPJ aprovados.');

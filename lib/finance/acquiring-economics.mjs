// Versioned contract/proposal comparison over the existing acquiring estimator.
// Only declared monthly processing charges are modeled; never a value ledger.
import { estimateAcquiringMonthlyCost } from './products.mjs';

export const ACQUIRING_ECONOMICS_VERSION = 'acquiring-processing-cost-v2';
export const ACQUIRING_SLICES = Object.freeze([
  ['debit', 'share_debit', 'mdr_debit', 'mdr_debit_pct'],
  ['credit_cash', 'share_credit_cash', 'mdr_credit_cash', 'mdr_credit_pct'],
  ['credit_installment', 'share_credit_installment', 'mdr_credit_installment', 'mdr_installment_pct'],
  ['pix', 'share_pix', 'pix_fee', 'pix_pct']
]);
const numeric = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const day = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
const text = v => typeof v === 'string' && v.trim().length >= 3 && v.length <= 500 && !/[<>]/.test(v);
const cents = v => Math.round((v + Number.EPSILON) * 100);
const sum = values => values.reduce((n, v) => n + cents(v), 0) / 100;

export function validateAcquiringProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return ['profile_required'];
  const reasons = [];
  if (Object.keys(profile).some(k => !['period_start', 'period_end', 'currency', 'monthly_volume', 'terminals', 'source_reference', ...ACQUIRING_SLICES.map(s => s[1])].includes(k))) reasons.push('unknown_profile_field');
  if (!day(profile.period_start) || !day(profile.period_end)) reasons.push('invalid_period');
  else {
    const start = new Date(`${profile.period_start}T00:00:00Z`);
    const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    if (start.getUTCDate() !== 1 || profile.period_end !== last) reasons.push('period_requires_one_calendar_month');
  }
  if (profile.currency !== 'BRL') reasons.push('unsupported_profile_currency');
  if (!numeric(profile.monthly_volume, 1e12)) reasons.push('missing_or_invalid_volume');
  if (!numeric(profile.terminals, 100000) || !Number.isInteger(profile.terminals)) reasons.push('missing_or_invalid_terminals');
  if (!text(profile.source_reference)) reasons.push('missing_volume_source');
  if (ACQUIRING_SLICES.some(s => !numeric(profile[s[1]], 100))) reasons.push('incomplete_mix');
  else if (Math.abs(ACQUIRING_SLICES.reduce((n, s) => n + profile[s[1]], 0) - 100) > 1e-8) reasons.push('mix_must_total_100');
  return reasons;
}

// Resolve by effective date, then version. Fetching every intervening version is
// required: a single current row cannot establish period coverage.
export function resolveContractPeriod(contract, versions, profile) {
  const applicable = versions.filter(v => v.effective_from && v.effective_from <= profile.period_start)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.version - a.version);
  const version = applicable[0] || null;
  const reasons = [];
  if (!version) reasons.push('no_contract_version_for_period');
  if (!contract.starts_on || !contract.ends_on || contract.starts_on > profile.period_start || contract.ends_on < profile.period_end) reasons.push('contract_outside_period');
  if (versions.some(v => v.effective_from > profile.period_start && v.effective_from <= profile.period_end)) reasons.push('contract_changed_in_period');
  return { version, reasons };
}

function variableCost(profile, shareKey, rateKey, rate) {
  if (profile[shareKey] === 0 || profile.monthly_volume === 0) return 0;
  // Reuse the proven formula with only this slice; fixed charges are separate.
  const result = estimateAcquiringMonthlyCost({ monthly_volume: profile.monthly_volume, [shareKey]: profile[shareKey], terminals: 0 }, { [rateKey]: rate, terminal_rent: 0, gateway_cost: 0 });
  return result.estimate ? result.total_cost : null;
}

/** Sources are persisted rows loaded under the caller's JWT, never client terms. */
export function compareAcquiringEconomics({ contract, versions, proposal, proposalVersion, profile }) {
  const errors = validateAcquiringProfile(profile);
  if (errors.length) return { valid: false, reasons: errors, methodology: ACQUIRING_ECONOMICS_VERSION };
  const coverage = resolveContractPeriod(contract, versions, profile);
  const current = coverage.version?.terms || {};
  const offered = proposalVersion.terms || {};
  const globalReasons = [...coverage.reasons];
  const contractCurrency = current.currency; // historical currency must belong to the immutable terms
  const proposalCurrency = offered.currency || 'BRL'; // authenticated proposal schema v1 is BRL
  if (contractCurrency !== profile.currency || proposalCurrency !== profile.currency) globalReasons.push('currency_mismatch_or_missing');
  if (!day(offered.valid_until)) globalReasons.push('proposal_validity_missing');
  else if (offered.valid_until < profile.period_start) globalReasons.push('proposal_expired_for_period');
  const components = ACQUIRING_SLICES.map(([key, share, rate, contractRate]) => {
    const reasons = [...globalReasons];
    const applicable = profile[share] > 0 && profile.monthly_volume > 0;
    if (applicable && !numeric(current[contractRate], 100)) reasons.push('missing_contract_rate');
    if (applicable && !numeric(offered[rate], 100)) reasons.push('missing_proposal_rate');
    const baseline = reasons.length ? null : variableCost(profile, share, rate, current[contractRate]);
    const alternative = reasons.length ? null : variableCost(profile, share, rate, offered[rate]);
    return { key, unit: 'percent_of_volume', volume: profile.monthly_volume * profile[share] / 100, share_pct: profile[share], contract_rate: current[contractRate] ?? null, proposal_rate: offered[rate] ?? null,
      comparable: !reasons.length, reasons, contract_cost: baseline, proposal_cost: alternative, difference: baseline === null || alternative === null ? null : (cents(baseline) - cents(alternative)) / 100,
      formula: 'monthly_volume × share_pct / 100 × rate_pct / 100; rounded to cents per component' };
  });
  const fixedReasons = [...globalReasons];
  // Absence of fees cannot attest zero. Explicit [] is allowed in persisted
  // historical data, though the current contract editor omits empty arrays.
  if (!Array.isArray(current.fees)) fixedReasons.push('contract_fixed_fees_not_declared');
  const fees = Array.isArray(current.fees) ? current.fees : [];
  if (fees.some(f => f.unit !== 'per_month' || !numeric(f.amount, 1e9) || !text(f.service))) fixedReasons.push('unsupported_or_unreferenced_contract_fee');
  if (!numeric(offered.gateway_cost, 1e6) || profile.terminals > 0 && !numeric(offered.terminal_rent, 1e6)) fixedReasons.push('proposal_fixed_fees_not_declared');
  if (typeof offered.extra_services === 'string' && offered.extra_services.trim()) fixedReasons.push('additional_services_require_cost_reference');
  const baselineFixed = fixedReasons.length ? null : sum(fees.map(f => f.amount));
  const proposedFixed = fixedReasons.length ? null : sum([offered.gateway_cost, profile.terminals * (offered.terminal_rent ?? 0)]);
  components.push({ key: 'fixed_fees', unit: 'per_month', comparable: !fixedReasons.length, reasons: fixedReasons, contract_cost: baselineFixed, proposal_cost: proposedFixed,
    difference: baselineFixed === null || proposedFixed === null ? null : (cents(baselineFixed) - cents(proposedFixed)) / 100, formula: 'contract: sum(declared monthly fees); proposal: terminals × terminal_rent + gateway_cost' });
  const limitations = ['anticipation_not_modeled', 'settlement_funding_effect_not_modeled', 'taxes_not_modeled', 'transaction_fees_tiers_minima_and_caps_not_modeled', 'unrecorded_additional_charges_not_modeled', 'installment_specific_rates_not_modeled', 'contract_transition_costs_not_modeled'];
  const comparable = components.every(c => c.comparable);
  const total = side => comparable ? sum(components.map(c => c[side])) : null;
  const baseline = total('contract_cost'), alternative = total('proposal_cost');
  return { valid: true, methodology: ACQUIRING_ECONOMICS_VERSION, result_type: 'estimated_processing_charges', persistence: 'not_persisted', profile: { ...profile },
    sources: { contract: { id: contract.id, version: coverage.version?.version ?? null, effective_from: coverage.version?.effective_from ?? null, source: coverage.version?.source ?? null, amendment_id: coverage.version?.amendment_id ?? null, href: `/finance/contracts.html?abrir=contrato#contract-${contract.id}` },
      proposal: { id: proposal.id, version: proposalVersion.version, rfq_id: proposal.rfq_id, rfq_revision: proposalVersion.rfq_revision ?? null, submitted_at: proposalVersion.submitted_at ?? null, origin: 'provider_submission', href: `/finance/rfq.html?id=${proposal.rfq_id}` } },
    components, comparable, reasons: [...new Set(components.flatMap(c => c.reasons))],
    totals: { currency: profile.currency, unit: 'period_total', contract_cost: baseline, proposal_cost: alternative, estimated_difference: comparable ? (cents(baseline) - cents(alternative)) / 100 : null },
    fixed_inputs: { contract_fees: fees, terminals: profile.terminals, terminal_rent: offered.terminal_rent ?? null, gateway_cost: offered.gateway_cost ?? null },
    conditions: { contract_settlement_days: current.settlement_days ?? null, proposal_settlement_days: offered.settlement_days ?? null, contract_anticipation_pct_month: current.anticipation_pct_month ?? null, proposal_anticipation_pct_month: offered.anticipation_rate ?? null },
    limitations, notice: 'Estimativa dos componentes declarados; não representa economia negociada ou realizada, custo financeiro total ou recomendação.' };
}

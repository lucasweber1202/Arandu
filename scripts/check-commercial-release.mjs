import fs from 'node:fs';
import { inspectCommercialPolicy } from '../lib/commercial-policy.mjs';

const strict = process.argv.includes('--require-ready');
const policy = JSON.parse(fs.readFileSync('data/commercial-policy.json', 'utf8'));
const runtime = inspectCommercialPolicy();
const validDate = (value) => {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) && timestamp <= Date.now();
};
const reference = (value) => String(value || '').trim().length >= 8;
const checks = {
  approved: policy.approved === true
    && policy.status === 'approved'
    && reference(policy.approvedBy)
    && validDate(policy.approvedAt),
  version: reference(policy.version),
  currency: /^[A-Z]{3}$/.test(String(policy.currency || '')),
  commission: policy.commissionDefined === true
    && Number(policy.commissionPercent) >= 0
    && Number(policy.commissionPercent) < 100,
  reservation: Number.isInteger(Number(policy.reservationHours))
    && Number(policy.reservationHours) >= 1
    && Number(policy.reservationHours) <= 720,
  payment: reference(policy.paymentMode) && reference(policy.paymentPolicyReference),
  shipping: policy.shippingResponsibilityDefined === true
    && reference(policy.shippingModel)
    && reference(policy.shippingPolicyReference),
  insurance: policy.insuranceResponsibilityDefined === true
    && reference(policy.insuranceModel)
    && reference(policy.insurancePolicyReference),
  cancellation: policy.cancellationPolicyApproved === true
    && reference(policy.cancellationPolicyVersion),
  returns: policy.returnPolicyApproved === true
    && reference(policy.returnPolicyVersion),
  damage: policy.damagePolicyApproved === true
    && reference(policy.damagePolicyVersion),
  certificate: policy.certificatePolicyApproved === true
    && reference(policy.certificatePolicyVersion),
  fiscal: policy.invoiceModelDefined === true && reference(policy.invoiceModel),
  governance: reference(policy.operationalOwner)
    && reference(policy.approvedBy)
    && reference(policy.legalOrCommercialReference),
  runtime: runtime.ready
};
const pending = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);

console.log('Arandu Commercial Release Check');
console.log(`Critérios aprovados: ${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length}`);
console.log(`Operação comercial ativa: ${pending.length === 0}`);
if (pending.length) console.warn(`Pendências: ${pending.join(', ')}.`);
runtime.problems.forEach((problem) => console.warn(`Runtime: ${problem}`));
if (strict && pending.length) process.exit(1);

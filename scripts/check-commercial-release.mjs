import fs from 'node:fs';

const strict = process.argv.includes('--require-ready');
const policy = JSON.parse(fs.readFileSync('data/commercial-policy.json', 'utf8'));
const envReady = ['1','true','yes','sim'].includes(String(process.env.ARANDU_COMMERCIAL_READY || '').trim().toLowerCase());
const runtimeFeeRateRaw = String(process.env.ARANDU_PLATFORM_FEE_RATE || '').trim();
const runtimeFeeRate = Number(runtimeFeeRateRaw);
const runtimeReservationHours = Number(process.env.ARANDU_RESERVATION_HOURS);
const runtimeConfigured = Boolean(String(process.env.ARANDU_COMMERCIAL_POLICY_VERSION || '').trim())
  && /^[A-Z]{3}$/.test(String(process.env.ARANDU_COMMERCIAL_CURRENCY || '').trim().toUpperCase())
  && runtimeFeeRateRaw !== ''
  && Number.isFinite(runtimeFeeRate)
  && runtimeFeeRate >= 0
  && runtimeFeeRate < 1
  && Number.isFinite(runtimeReservationHours)
  && runtimeReservationHours >= 1
  && runtimeReservationHours <= 720;
const checks = {
  approved: policy.approved === true && policy.status === 'approved' && Boolean(policy.approvedBy) && Number.isFinite(Date.parse(policy.approvedAt)),
  commission: policy.commissionDefined === true && Number(policy.commissionPercent) > 0 && Number(policy.commissionPercent) < 100,
  reservation: Number(policy.reservationHours || 0) > 0,
  payment: Boolean(String(policy.paymentMode || '').trim()),
  shipping: policy.shippingResponsibilityDefined === true && Boolean(String(policy.shippingModel || '').trim()),
  insurance: policy.insuranceResponsibilityDefined === true && Boolean(String(policy.insuranceModel || '').trim()),
  cancellation: policy.cancellationPolicyApproved === true && Boolean(String(policy.cancellationPolicyVersion || '').trim()),
  certificate: policy.certificatePolicyApproved === true && Boolean(String(policy.certificatePolicyVersion || '').trim()),
  invoice: policy.invoiceModelDefined === true && Boolean(String(policy.invoiceModel || '').trim()),
  owner: Boolean(String(policy.operationalOwner || '').trim()),
  environment: envReady && runtimeConfigured
};
const pending = Object.entries(checks).filter(([, ok]) => !ok).map(([key]) => key);

console.log('Arandu Commercial Release Check');
console.log(`Critérios aprovados: ${Object.values(checks).filter(Boolean).length}/${Object.keys(checks).length}`);
console.log(`Operação comercial ativa: ${pending.length === 0}`);
if (pending.length) console.warn(`Pendências: ${pending.join(', ')}.`);
if (strict && pending.length) process.exit(1);

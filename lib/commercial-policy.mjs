const REQUIRED_REFERENCES = Object.freeze({
  payment: 'ARANDU_PAYMENT_POLICY_REFERENCE',
  shipping: 'ARANDU_SHIPPING_POLICY_REFERENCE',
  packaging: 'ARANDU_PACKAGING_POLICY_REFERENCE',
  insurance: 'ARANDU_INSURANCE_POLICY_REFERENCE',
  cancellation: 'ARANDU_CANCELLATION_POLICY_REFERENCE',
  returns: 'ARANDU_RETURN_POLICY_REFERENCE',
  damage: 'ARANDU_DAMAGE_POLICY_REFERENCE',
  certificate: 'ARANDU_CERTIFICATE_POLICY_REFERENCE',
  fiscalModel: 'ARANDU_FISCAL_MODEL_REFERENCE'
});

export class CommercialPolicyError extends Error {
  constructor(message, problems = []) {
    super(message);
    this.name = 'CommercialPolicyError';
    this.status = 503;
    this.code = 'commercial_policy_unconfigured';
    this.problems = problems;
  }
}

const clean = (value, max = 240) => String(value || '').trim().slice(0, max);
const enabled = (value) => ['1', 'true', 'yes', 'sim'].includes(clean(value).toLowerCase());
const validReference = (value) => clean(value).length >= 8
  && !/^(?:feito|ok|sim|yes|done|true|pronto|decision_required)$/i.test(clean(value));

export function inspectCommercialPolicy(env = process.env) {
  const version = clean(env.ARANDU_COMMERCIAL_POLICY_VERSION, 120);
  const currency = clean(env.ARANDU_COMMERCIAL_CURRENCY, 3).toUpperCase();
  const platformFeeRateRaw = clean(env.ARANDU_PLATFORM_FEE_RATE, 40);
  const platformFeeRate = Number(platformFeeRateRaw);
  const reservationHours = Number(env.ARANDU_RESERVATION_HOURS);
  const approvedAt = clean(env.ARANDU_COMMERCIAL_APPROVED_AT, 40);
  const approvedTimestamp = Date.parse(approvedAt);
  const references = Object.fromEntries(
    Object.entries(REQUIRED_REFERENCES).map(([key, name]) => [key, clean(env[name], 180)])
  );
  const snapshot = {
    version,
    currency,
    platformFeeRate,
    reservationHours,
    references,
    operationalOwner: clean(env.ARANDU_COMMERCIAL_OWNER, 80),
    approver: clean(env.ARANDU_COMMERCIAL_APPROVER, 80),
    approvedAt,
    approvalReference: clean(env.ARANDU_COMMERCIAL_APPROVAL_REFERENCE, 180)
  };
  const problems = [];
  if (!enabled(env.ARANDU_COMMERCIAL_READY)) problems.push('ARANDU_COMMERCIAL_READY não está aprovado.');
  if (!version) problems.push('Versão ausente.');
  if (!/^[A-Z]{3}$/.test(currency)) problems.push('Moeda ISO 4217 inválida.');
  if (!platformFeeRateRaw || !Number.isFinite(platformFeeRate) || platformFeeRate < 0 || platformFeeRate >= 1) problems.push('Comissão inválida.');
  if (!Number.isInteger(reservationHours) || reservationHours < 1 || reservationHours > 720) problems.push('Prazo de reserva inválido.');
  for (const [name, value] of Object.entries(references)) {
    if (!validReference(value)) problems.push(`Referência de ${name} ausente ou vaga.`);
  }
  if (!validReference(snapshot.operationalOwner)) problems.push('Responsável operacional ausente.');
  if (!validReference(snapshot.approver)) problems.push('Aprovador ausente.');
  if (!Number.isFinite(approvedTimestamp) || approvedTimestamp > Date.now()) problems.push('Data de aprovação inválida.');
  if (!validReference(snapshot.approvalReference)) problems.push('Referência de aprovação ausente ou vaga.');
  return { ready: problems.length === 0, problems, snapshot };
}

export function requireCommercialPolicy(env = process.env) {
  const result = inspectCommercialPolicy(env);
  if (!result.ready) {
    throw new CommercialPolicyError(
      'A política comercial completa e aprovada ainda não foi configurada.',
      result.problems
    );
  }
  return structuredClone(result.snapshot);
}

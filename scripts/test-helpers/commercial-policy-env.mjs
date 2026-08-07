export function configureTestCommercialPolicy(version = 'policy-test-v1') {
  Object.assign(process.env, {
    ARANDU_COMMERCIAL_READY: 'true',
    ARANDU_COMMERCIAL_POLICY_VERSION: version,
    ARANDU_COMMERCIAL_CURRENCY: 'BRL',
    ARANDU_PLATFORM_FEE_RATE: '0.2',
    ARANDU_RESERVATION_HOURS: '24',
    ARANDU_PAYMENT_POLICY_REFERENCE: 'test-payment-v1',
    ARANDU_SHIPPING_POLICY_REFERENCE: 'test-shipping-v1',
    ARANDU_PACKAGING_POLICY_REFERENCE: 'test-packaging-v1',
    ARANDU_INSURANCE_POLICY_REFERENCE: 'test-insurance-v1',
    ARANDU_CANCELLATION_POLICY_REFERENCE: 'test-cancellation-v1',
    ARANDU_RETURN_POLICY_REFERENCE: 'test-return-v1',
    ARANDU_DAMAGE_POLICY_REFERENCE: 'test-damage-v1',
    ARANDU_CERTIFICATE_POLICY_REFERENCE: 'test-certificate-v1',
    ARANDU_FISCAL_MODEL_REFERENCE: 'test-fiscal-v1',
    ARANDU_COMMERCIAL_OWNER: 'test-operations',
    ARANDU_COMMERCIAL_APPROVER: 'test-approver',
    ARANDU_COMMERCIAL_APPROVED_AT: '2026-07-01T00:00:00.000Z',
    ARANDU_COMMERCIAL_APPROVAL_REFERENCE: 'test-approval-v1'
  });
}

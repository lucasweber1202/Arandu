import { normalize, proposalFields, getProduct } from './products.mjs';
export const EXTERNAL_PROPOSAL_NOTICE = 'Registrada pela empresa a partir de fonte externa. Conferência de transcrição não é autenticação do banco, validação independente ou aceite institucional.';
export function normalizeExternalTerms(product, input) {
  if (!getProduct(product)) return { values: {}, errors: ['Produto inválido.'], rejected: [] };
  const fields = proposalFields(product);
  const values = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const cleaned = Object.fromEntries(Object.entries(values).map(([key,value]) => [key,typeof value === 'string' && !value.trim() ? null : value]));
  const result = normalize(fields.map(field => ({ ...field, required: false })), cleaned);
  for (const field of fields) {
    const value = cleaned[field.key];
    if (value == null) continue;
    if (['money','number','percent','int'].includes(field.type) ? !['number','string'].includes(typeof value) : field.type !== 'bool' && typeof value !== 'string') result.errors.push(`${field.label}: tipo inválido.`);
  }
  return result;
}
export function externalComparisonProposal(row) {
  return {
    id: row.id, rfq_id: row.rfq_id, provider_id: row.provider_id, provider_name: row.provider_name,
    origin: 'buyer_recorded_external', status: 'reviewed', version: row.current_version,
    terms: row.terms, currency: row.currency, rfq_revision: row.rfq_revision,
    submitted_at: null, recorded_at: row.recorded_at, decision_allowed: row.decision_allowed === true,
    provenance: {
      source: 'buyer_recorded_external', issuer_identity: 'buyer_attribution',
      author: row.recorded_by, recorded_at: row.recorded_at, received_at: row.received_at,
      channel: row.channel, source_reference: row.source_reference,
      version: row.current_version, review_scope: 'transcription_correspondence_only',
      reviewed_by: row.reviewed_by, reviewed_at: row.reviewed_at,
      document: row.document_id ? { id: row.document_id, version: row.document_version,
        sha256: row.document_sha256, sha256_origin: 'document_version_metadata', sha256_verified_against_bytes: false, availability: row.document_available ? 'metadata_available' : 'unavailable',
        read_by_reviewer: row.document_read } : null,
      verification: 'not_verified', external_validation: 'not_recorded', institution_acceptance: 'not_recorded',
      decision_allowed: row.decision_allowed === true, notice: EXTERNAL_PROPOSAL_NOTICE
    }
  };
}

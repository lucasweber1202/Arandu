// Read-only interpretation of authorized Passport rows, not a verification engine.
// Call only after tenant/entity authorization and resolvePassportRows. No I/O.
export function passportEvidence(rows = [], documents = []) {
  const available = new Map(documents.filter((doc) => !doc.removed_at).map((doc) => [doc.id, doc]));
  return {
    contract: 'passport-evidence-v1',
    notice: 'Origem é declarada. Confirmação de atualização não comprova correção econômica; vínculo documental não comprova autenticidade. Validação externa e aceite da instituição não são registrados neste contrato.',
    fields: rows.map((row) => {
      const document = row.document_id ? available.get(row.document_id) : null;
      return {
        field_key: row.field_key,
        legal_entity_id: row.legal_entity_id || null,
        inherited: Boolean(row.inherited),
        source: { declaration: row.source || null, recorded_by: row.updated_by || null, recorded_at: row.updated_at || null },
        supporting_document: {
          state: !row.document_id ? 'not_linked' : document ? 'metadata_available' : 'unavailable',
          document_id: row.document_id || null,
          // This is the current version, not the version at field recording time.
          current_version: document?.current_version ?? null,
          version_at_recording: null,
          authenticity: 'not_recorded'
        },
        currentness_confirmation: {
          state: row.verified_at && row.verified_by ? 'recorded' : 'not_established',
          confirmed_at: row.verified_at || null,
          confirmed_by: row.verified_by || null,
          scope: 'declared_currentness_only'
        },
        declared_valid_until: row.valid_until || null,
        document_review: 'not_recorded',
        external_validation: 'not_recorded',
        institution_acceptance: 'not_recorded'
      };
    })
  };
}

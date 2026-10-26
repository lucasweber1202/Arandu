import { SCHEMA_FINGERPRINT_VERSION, validSchemaDigest } from './recovery-schema.mjs';

// Assessment only. These fields come from the export manifest and the isolated
// restore receipt, not a new probe or an attestation that services were restored.
// Row counts and a schema marker cannot prove preservation of RLS/grants/DDL.
export function schemaRecoveryEvidenceMatches(backup, restore) {
  return backup?.schema_fingerprint_version === SCHEMA_FINGERPRINT_VERSION
    && validSchemaDigest(backup?.snapshot_schema_sha256)
    && restore?.schema_fingerprint_version === SCHEMA_FINGERPRINT_VERSION
    && restore?.schema_reconciliation === 'MATCH'
    && restore?.source_schema_sha256 === backup.snapshot_schema_sha256
    && restore?.target_schema_sha256 === backup.snapshot_schema_sha256;
}

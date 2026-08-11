export const EVIDENCE_STATES = Object.freeze(['not_started', 'prepared', 'ci_validated', 'staging_validated', 'externally_verified', 'failed']);
export const STATE_RANK = Object.freeze({ not_started: 0, prepared: 1, ci_validated: 2, staging_validated: 3, externally_verified: 4, failed: -1 });
export const REQUIRED_GATES = Object.freeze({
  migration_preflight: 'staging_validated', migration_ci: 'ci_validated', migration_staging: 'staging_validated',
  backup_restore: 'externally_verified', write_canary: 'staging_validated', rls_isolation: 'staging_validated',
  reservation_concurrency: 'staging_validated', catalog_real: 'externally_verified', commercial_policy: 'externally_verified',
  monitoring: 'externally_verified', privacy_contact: 'externally_verified', domain_https: 'externally_verified', pilot_closed: 'externally_verified'
});
const VAGUE = /^(?:feito|ok|sim|yes|done|true|pronto|conclu[ií]do|n\/?a)$/i;
const SECRET = /(?:eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|sb_(?:secret|publishable)_[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\/[^/\s]+:[^@\s]+@|service[_-]?role|api[_-]?key|bearer\s+[A-Za-z0-9._-]{12,})/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const validText = (value, min = 3, max = 200) => { const text = String(value || '').trim(); return text.length >= min && text.length <= max && !VAGUE.test(text) && !SECRET.test(text) && !EMAIL.test(text); };
const validPastDate = (value) => { const timestamp = Date.parse(String(value || '')); return Number.isFinite(timestamp) && timestamp <= Date.now(); };

export function validateGateEvidence(id, gate = {}) {
  const problems = [];
  const state = String(gate.state || 'not_started');
  if (!(id in REQUIRED_GATES)) problems.push('gate desconhecido');
  if (!EVIDENCE_STATES.includes(state)) problems.push(`estado inválido "${state}"`);
  if (state === 'not_started') {
    for (const field of ['owner', 'timestamp', 'reference', 'environment', 'origin', 'result']) if (gate[field] != null) problems.push(`${field} deve ser nulo em not_started`);
  } else {
    if (!validText(gate.owner, 3, 80)) problems.push('owner inválido ou contém PII');
    if (!validPastDate(gate.timestamp)) problems.push('timestamp ausente, futuro ou inválido');
    if (!validText(gate.reference, 8, 240)) problems.push('reference vaga, sensível ou inválida');
    if (!validText(gate.environment, 2, 40)) problems.push('environment inválido');
    if (!validText(gate.origin, 2, 80)) problems.push('origin inválido');
    if (!['passed', 'failed'].includes(gate.result)) problems.push('result deve ser passed ou failed');
    if (state === 'failed' && gate.result !== 'failed') problems.push('estado failed exige result failed');
    if (state !== 'failed' && gate.result !== 'passed') problems.push('estado promovido exige result passed');
    if (state === 'ci_validated' && gate.environment !== 'ci') problems.push('ci_validated exige environment=ci');
    if (state === 'staging_validated' && gate.environment !== 'staging') problems.push('staging_validated exige environment=staging');
    if (state === 'externally_verified' && ['local', 'ci', 'ci_rehearsal'].includes(gate.environment)) problems.push('externally_verified não pode vir de ambiente local/CI');
  }
  if (gate.notes && (!validText(gate.notes, 1, 1000) || SECRET.test(String(gate.notes)) || EMAIL.test(String(gate.notes)))) problems.push('notes contém PII, segredo ou valor inválido');
  const required = REQUIRED_GATES[id];
  const meetsRelease = problems.length === 0 && state !== 'failed' && STATE_RANK[state] >= STATE_RANK[required];
  return { id, state, required, problems, meetsRelease };
}

export function validateReleaseEvidence(evidence) {
  const problems = [];
  if (evidence?.version !== 3) problems.push('version: use o formato 3.');
  if (!evidence?.gates || Array.isArray(evidence.gates)) problems.push('gates: objeto obrigatório.');
  const rows = Object.keys(REQUIRED_GATES).map((id) => validateGateEvidence(id, evidence?.gates?.[id]));
  rows.forEach((row) => row.problems.forEach((problem) => problems.push(`${row.id}: ${problem}.`)));
  for (const id of Object.keys(evidence?.gates || {})) if (!(id in REQUIRED_GATES)) problems.push(`${id}: gate desconhecido.`);
  return { rows, problems, releaseReady: rows.every((row) => row.meetsRelease) && problems.length === 0 };
}

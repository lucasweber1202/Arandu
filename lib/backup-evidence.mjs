import { createHash } from 'node:crypto';

const VAGUE = /^(?:feito|ok|sim|yes|done|true|pronto|n\/?a|na|nenhum|decision_required)$/i;
const SENSITIVE = /(?:@|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20,}\.|service[_-]?role|api[_-]?key|bearer\s+)/i;
export const validOperationalReference = (value) => {
  const text = String(value || '').trim();
  return text.length >= 8 && text.length <= 200 && !VAGUE.test(text) && !SENSITIVE.test(text);
};
export function inspectBackupArtifact({ stat, reference, maxAgeHours = 48, now = Date.now() } = {}) {
  const problems = [];
  const ageMs = now - stat?.mtimeMs;
  if (stat?.isFile?.() !== true || !Number.isSafeInteger(stat?.size) || stat.size < 1024) problems.push('Artefato de backup ausente, vazio ou pequeno demais.');
  if (!validFreshnessWindow(maxAgeHours, now) || !Number.isFinite(stat?.mtimeMs) || stat.mtimeMs < 0 || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeHours * 3600000) problems.push('Backup possui idade ou janela máxima inválida, ou excede a janela permitida.');
  if (!validOperationalReference(reference)) problems.push('Referência de backup inválida, vaga ou sensível.');
  return { ok: problems.length === 0, ageHours: ageMs / 3600000, problems };
}

export function inspectRestoreEvidence({
  report,
  backupReference,
  restoreReference,
  backupSha256,
  maxAgeHours = 6,
  now = Date.now()
} = {}) {
  const problems = [];
  const generatedAt = Date.parse(String(report?.generatedAt || ''));
  const ageMs = now - generatedAt;
  if (report?.classification !== 'restore_verification') problems.push('Classificação de restore inválida.');
  if (report?.environment !== 'disposable_restore') problems.push('Restore não foi executado em ambiente descartável.');
  if (report?.backupScope !== 'public_schema') problems.push('Escopo do backup restaurado não é public_schema.');
  if (report?.result !== 'passed') problems.push('Restore não possui resultado passed.');
  if (!validFreshnessWindow(maxAgeHours, now) || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeHours * 3600000) {
    problems.push('Evidência de restore possui idade ou janela máxima inválida, ou excede a janela permitida.');
  }
  if (!validOperationalReference(backupReference) || report?.backupReference !== backupReference) {
    problems.push('Referência de backup não corresponde à evidência de restore.');
  }
  if (!validOperationalReference(restoreReference) || report?.restoreReference !== restoreReference) {
    problems.push('Referência de restore não corresponde à evidência informada.');
  }
  if (!/^[a-f0-9]{64}$/.test(String(backupSha256 || '')) || report?.backupSha256 !== backupSha256) {
    problems.push('Hash do backup não corresponde ao artefato restaurado.');
  }
  const checks = new Map();
  // A final true must never overwrite an earlier failed or duplicate check.
  // A report marked passed with any failed/inconclusive check is contradictory.
  for (const check of Array.isArray(report?.checks) ? report.checks : []) {
    if (typeof check?.name !== 'string' || !check.name.trim() || check.ok !== true || checks.has(check.name)) {
      problems.push('Evidência de restore contém check inválido, reprovado ou duplicado.');
    }
    checks.set(check?.name, check?.ok);
  }
  for (const name of ['backup-artifact', 'backup-readable', 'restore-executed', 'schema-fingerprint', 'post-restore-probes']) {
    if (checks.get(name) !== true) problems.push(`Check obrigatório ausente ou reprovado: ${name}.`);
  }
  return { ok: problems.length === 0, ageHours: ageMs / 3600000, problems };
}

function validFreshnessWindow(maxAgeHours, now) {
  return Number.isFinite(maxAgeHours) && maxAgeHours > 0 && Number.isFinite(maxAgeHours * 3600000)
    && Number.isFinite(now) && now >= 0;
}

export function schemaFingerprint(schemaDump) {
  const canonical = String(schemaDump || '')
    .replace(/^--.*$/gm, '')
    .replace(/^\\(?:un)?restrict\b.*$/gm, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return createHash('sha256').update(canonical).digest('hex');
}

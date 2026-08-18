import { createHash } from 'node:crypto';

const VAGUE = /^(?:feito|ok|sim|yes|done|true|pronto|n\/?a|na|nenhum|decision_required)$/i;
const SENSITIVE = /(?:@|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20,}\.|service[_-]?role|api[_-]?key|bearer\s+)/i;
export const validOperationalReference = (value) => {
  const text = String(value || '').trim();
  return text.length >= 8 && text.length <= 200 && !VAGUE.test(text) && !SENSITIVE.test(text);
};
export function inspectBackupArtifact({ stat, reference, maxAgeHours = 48, now = Date.now() } = {}) {
  const problems = [];
  const ageMs = now - Number(stat?.mtimeMs || 0);
  if (!stat?.isFile?.() || Number(stat?.size || 0) < 1024) problems.push('Artefato de backup ausente, vazio ou pequeno demais.');
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeHours * 3600000) problems.push(`Backup excede a idade máxima de ${maxAgeHours} horas.`);
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
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeHours * 3600000) {
    problems.push(`Evidência de restore excede ${maxAgeHours} horas ou possui data inválida.`);
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
  const checks = new Map(Array.isArray(report?.checks) ? report.checks.map((check) => [check?.name, check?.ok]) : []);
  for (const name of ['backup-artifact', 'backup-readable', 'restore-executed', 'schema-fingerprint', 'post-restore-probes']) {
    if (checks.get(name) !== true) problems.push(`Check obrigatório ausente ou reprovado: ${name}.`);
  }
  return { ok: problems.length === 0, ageHours: ageMs / 3600000, problems };
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

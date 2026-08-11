const VAGUE = /^(?:feito|ok|sim|yes|done|true|pronto)$/i;
export const validOperationalReference = (value) => {
  const text = String(value || '').trim();
  return text.length >= 8 && text.length <= 200 && !VAGUE.test(text) && !/@|postgres(?:ql)?:\/\//i.test(text);
};
export function inspectBackupArtifact({ stat, reference, maxAgeHours = 48, now = Date.now() } = {}) {
  const problems = [];
  const ageMs = now - Number(stat?.mtimeMs || 0);
  if (!stat?.isFile?.() || Number(stat?.size || 0) < 1024) problems.push('Artefato de backup ausente, vazio ou pequeno demais.');
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeHours * 3600000) problems.push(`Backup excede a idade máxima de ${maxAgeHours} horas.`);
  if (!validOperationalReference(reference)) problems.push('Referência de backup inválida, vaga ou sensível.');
  return { ok: problems.length === 0, ageHours: ageMs / 3600000, problems };
}

// npm can temporarily serve a stale advisory after GitHub withdraws it.
// This module examines the complete vulnerability graph, NOT just counts.
// Every other high/critical advisory remains fatal.
export const GHSA_ID = 'GHSA-fc5q-39xc-vjpf';
export const GHSA_URL = 'https://github.com/advisories/' + GHSA_ID;
export const GHSA_CVE = 'CVE-2026-112366';
export const GHSA_SOURCE = 'https://raw.githubusercontent.com/github/advisory-database/main/advisories/github-reviewed/2026/10/' + GHSA_ID + '/' + GHSA_ID + '.json';
export const EXCEPTION_EXPIRES = Date.parse('2026-12-18T00:00:00Z');

const severe = new Set(['high', 'critical']);
const validObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

export function classifyNpmAudit(report) {
  if (!validObject(report) || !validObject(report.vulnerabilities) ||
      !validObject(report.metadata?.vulnerabilities) || report.error) {
    return { kind: 'blocked', reason: 'Saída npm audit ausente, inválida ou erro da auditoria.' };
  }
  const all = report.vulnerabilities;
  const elevated = Object.entries(all).filter(([, value]) => severe.has(value?.severity));
  const meta = report.metadata.vulnerabilities;
  const count = Number(meta.high) + Number(meta.critical);
  if (!Number.isSafeInteger(count) || count !== elevated.length) {
    return { kind: 'blocked', reason: 'Contagens de vulnerabilidades não correspondem ao gráfico npm.' };
  }
  if (elevated.length === 0) return { kind: 'clean', names: [] };

  let officialIdFound = false;
  const memo = new Map();
  function onlyWithdrawn(name, visiting = new Set()) {
    if (memo.has(name)) return memo.get(name);
    if (visiting.has(name)) return false;
    const issue = all[name];
    if (!validObject(issue) || !Array.isArray(issue.via) || issue.via.length === 0) return false;
    const seen = new Set([...visiting, name]);
    const okay = issue.via.every((cause) => {
      if (typeof cause === 'string') {
        // Transitive impact is permitted only when ALL its causes eventually
        // terminate in the exact same withdrawn advisory, without cycles.
        return validObject(all[cause]) && onlyWithdrawn(cause, seen);
      }
      const exactlyTarget = validObject(cause) && name === 'picomatch' &&
        cause.name === 'picomatch' && cause.url === GHSA_URL &&
        severe.has(cause.severity);
      if (exactlyTarget) officialIdFound = true;
      return exactlyTarget;
    });
    memo.set(name, okay);
    return okay;
  }
  const names = elevated.map(([name]) => name);
  if (!elevated.every(([name]) => onlyWithdrawn(name)) || !officialIdFound) {
    return { kind: 'blocked', reason: 'Existe advisory alto/crítico não retirado, ciclo ou causa desconhecida.', names };
  }
  return { kind: 'withdrawn-candidate', names };
}

export function verifyOfficialWithdrawal(advisory, now = Date.now()) {
  if (!validObject(advisory) || advisory.id !== GHSA_ID || !Array.isArray(advisory.aliases) ||
      !advisory.aliases.includes(GHSA_CVE) || !Array.isArray(advisory.affected) ||
      !advisory.affected.some((entry) => entry?.package?.name === 'picomatch' &&
        entry.package.ecosystem === 'npm') ||
      advisory.database_specific?.github_reviewed !== true) return false;
  const withdrawn = Date.parse(advisory.withdrawn || '');
  const modified = Date.parse(advisory.modified || '');
  return Number.isFinite(now) && now < EXCEPTION_EXPIRES &&
    Number.isFinite(withdrawn) && withdrawn >= Date.parse('2026-11-18T00:00:00Z') &&
    withdrawn <= now && Number.isFinite(modified) && modified >= withdrawn;
}

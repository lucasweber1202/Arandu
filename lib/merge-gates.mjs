// Regra de merge: os quatro jobs obrigatórios precisam estar concluídos com
// sucesso no SHA EXATO do HEAD da PR. Run anterior não atesta HEAD posterior;
// pending/in_progress/queued, falha, cancelamento, skip ou ausência bloqueiam.
// Lógica pura (sem rede): scripts/check-merge-gates.mjs busca os dados.
export const REQUIRED_CHECKS = Object.freeze(['database', 'deploy-boundaries', 'validate', 'presentation']);

export function evaluateMergeGates({ headSha, checkRuns = [], required = REQUIRED_CHECKS } = {}) {
  const problems = [];
  if (!/^[0-9a-f]{40}$/.test(String(headSha || ''))) return { ok: false, problems: ['SHA do HEAD da PR ausente ou inválido.'], gates: [] };
  const gates = required.map((name) => {
    const runs = checkRuns.filter((run) => run?.name === name);
    const exact = runs.filter((run) => run.head_sha === headSha);
    // O run mais recente no HEAD exato decide (re-run substitui o anterior).
    const latest = exact.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')) || Number(b.id || 0) - Number(a.id || 0))[0];
    if (!latest) {
      problems.push(runs.length ? `${name}: só existe run de outro SHA (stale); o HEAD ${headSha.slice(0, 7)} não foi validado.` : `${name}: nenhum run no HEAD ${headSha.slice(0, 7)}.`);
      return { name, state: runs.length ? 'stale' : 'missing' };
    }
    if (latest.status !== 'completed') {
      problems.push(`${name}: ${latest.status} — aguarde a conclusão; não faça merge com gate rodando.`);
      return { name, state: latest.status };
    }
    if (latest.conclusion !== 'success') {
      problems.push(`${name}: ${latest.conclusion} — corrija a causa raiz antes do merge.`);
      return { name, state: latest.conclusion };
    }
    return { name, state: 'success', id: latest.id };
  });
  return { ok: problems.length === 0, problems, gates };
}

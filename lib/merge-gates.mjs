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

// A PR precisa conter a ponta atual da base. Dois PRs verdes contra a mesma
// base antiga, mergeados em sequência, produzem uma combinação que nenhum CI
// validou (#123 + #124 em pilot@556258c). `compareStatus` é o status da API
// compare `<ponta da base>...<HEAD da PR>`: só `ahead`/`identical` contêm a base.
export function evaluateBaseFreshness({ compareStatus, baseRef = 'base', behindBy = 0 } = {}) {
  if (compareStatus === 'ahead' || compareStatus === 'identical') return { ok: true, problems: [] };
  if (compareStatus === 'behind' || compareStatus === 'diverged') {
    return { ok: false, problems: [`PR desatualizada: ${baseRef} avançou${behindBy ? ` ${behindBy} commit(s)` : ''} depois do HEAD testado; atualize a branch e espere os quatro gates no novo HEAD.`] };
  }
  return { ok: false, problems: [`não foi possível confirmar que a PR contém a ponta de ${baseRef} (${compareStatus || 'sem resposta'}).`] };
}

// Auditoria depois do merge (detecção, não prevenção): o merge em pilot/main
// precisa vir de uma PR cujo HEAD tinha os quatro gates verdes e continha a
// base no momento do merge (primeiro pai do commit de merge).
export function auditMerge({ pr, checkRuns = [], compareStatus, behindBy = 0 } = {}) {
  if (!pr) return { ok: false, problems: ['push sem PR associada: pilot/main só recebem merge de PR.'], gates: [] };
  const gates = evaluateMergeGates({ headSha: pr.head?.sha, checkRuns });
  const fresh = evaluateBaseFreshness({ compareStatus, baseRef: pr.base?.ref || 'base', behindBy });
  const problems = [...gates.problems, ...fresh.problems];
  return { ok: problems.length === 0, problems, gates: gates.gates };
}

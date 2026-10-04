#!/usr/bin/env node
// Uso: GITHUB_TOKEN=... npm run merge:gates -- <número-da-PR> [owner/repo]
// Consulta o HEAD atual da PR e os check runs desse SHA exato. Sai com código
// diferente de zero se qualquer gate obrigatório não estiver verde. Não faz
// merge: é a verificação que precede a decisão humana/agente de mergear.
import { evaluateMergeGates } from '../lib/merge-gates.mjs';

const [number, repository = process.env.GITHUB_REPOSITORY || 'lucasweber1202/Arandu'] = process.argv.slice(2);
if (!/^\d+$/.test(String(number || '')) || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  console.error('Uso: npm run merge:gates -- <número-da-PR> [owner/repo]');
  process.exit(2);
}
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
async function get(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, { headers });
  if (!response.ok) throw new Error(`GitHub ${response.status} em ${path}`);
  return response.json();
}
try {
  const pr = await get(`pulls/${number}`);
  if (pr.state !== 'open') throw new Error(`PR #${number} não está aberta (${pr.state}).`);
  const headSha = pr.head.sha;
  const checks = await get(`commits/${headSha}/check-runs?per_page=100`);
  const result = evaluateMergeGates({ headSha, checkRuns: checks.check_runs || [] });
  console.log(`PR #${number} · HEAD ${headSha}`);
  for (const gate of result.gates) console.log(`  ${gate.state === 'success' ? 'OK  ' : 'BLOQ'} ${gate.name}: ${gate.state}`);
  if (pr.mergeable_state && ['dirty', 'unknown'].includes(pr.mergeable_state)) result.problems.push(`mergeable_state=${pr.mergeable_state}: resolva/aguarde antes do merge.`);
  if (result.problems.length) {
    console.error('MERGE BLOQUEADO:');
    for (const problem of result.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log('Quatro gates verdes no HEAD exato. A decisão de merge continua humana/registrada.');
} catch (error) {
  console.error(`MERGE BLOQUEADO: não foi possível verificar os gates (${error.message}).`);
  process.exit(1);
}

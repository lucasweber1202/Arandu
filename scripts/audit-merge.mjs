#!/usr/bin/env node
// Uso (CI, push em pilot/main): GITHUB_TOKEN=... node scripts/audit-merge.mjs <sha-do-merge> [owner/repo]
// Detecção pós-merge: falha se o commit não veio de uma PR cujo HEAD tinha os
// quatro gates verdes e continha a base no momento do merge. Não substitui a
// ruleset (que impede o merge); torna visível, no mesmo minuto, um merge que
// a escapou. Só leitura.
import { auditMerge } from '../lib/merge-gates.mjs';

const [sha, repository = process.env.GITHUB_REPOSITORY || 'lucasweber1202/Arandu'] = process.argv.slice(2);
if (!/^[0-9a-f]{40}$/.test(String(sha || '')) || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  console.error('Uso: node scripts/audit-merge.mjs <sha-de-40-caracteres> [owner/repo]');
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
  const commit = await get(`commits/${sha}`);
  const pulls = await get(`commits/${sha}/pulls`);
  const pr = (pulls || []).find((item) => item.merged_at && item.merge_commit_sha === sha) || null;
  let checkRuns = [];
  let compareStatus = null;
  let behindBy = 0;
  if (pr) {
    checkRuns = (await get(`commits/${pr.head.sha}/check-runs?per_page=100`)).check_runs || [];
    // Primeiro pai = ponta da base imediatamente antes do merge.
    const parent = commit.parents?.[0]?.sha;
    if (parent) {
      const compare = await get(`compare/${parent}...${pr.head.sha}`);
      compareStatus = compare.status;
      behindBy = compare.behind_by;
    }
  }
  const result = auditMerge({ pr, checkRuns, compareStatus, behindBy });
  console.log(`Merge ${sha}${pr ? ` · PR #${pr.number} · HEAD ${pr.head.sha}` : ''}`);
  for (const gate of result.gates) console.log(`  ${gate.state === 'success' ? 'OK  ' : 'BLOQ'} ${gate.name}: ${gate.state}`);
  if (!result.ok) {
    console.error('MERGE FORA DA REGRA (corrija em PR nova; não reescreva a história):');
    for (const problem of result.problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log('Merge auditado: quatro gates verdes no HEAD mergeado, base contida.');
} catch (error) {
  console.error(`AUDITORIA INCONCLUSIVA: ${error.message}`);
  process.exit(1);
}

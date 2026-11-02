#!/usr/bin/env node
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { assessRecoveryGithub } from '../lib/recovery-github.mjs';

const repository = process.argv[2] || process.env.GITHUB_REPOSITORY || 'lucasweber1202/Arandu';
fs.mkdirSync('reports', { recursive: true });
const output = 'reports/recovery-github.json';
// A failed/invalid invocation must not leave an older prepared result behind.
fs.writeFileSync(output, JSON.stringify(assessRecoveryGithub(), null, 2) + '\n');
if (process.argv.length > 3 || !/^[\w.-]+\/[\w.-]+$/.test(repository)) {
  console.error('Uso: npm run recovery:github:check -- [owner/repo]');
  process.exitCode = 2;
} else {
  function read(suffix = '') {
    const response = spawnSync('gh', ['api', `repos/${repository}/environments/database-recovery${suffix}`], {
      encoding: 'utf8', timeout: 20000, maxBuffer: 128000
    });
    // Never print stderr or raw API documents (including an unexpected value).
    let data;
    try { data = JSON.parse(response.stdout); } catch { return { status: 0 }; }
    return response.status === 0 ? { status: 200, data } : { status: Number(data?.status) || 0 };
  }
  const report = { ...assessRecoveryGithub({ environment: read(), branches: read('/deployment-branch-policies'), secrets: read('/secrets?per_page=100') }),
    repository, observed_at: new Date().toISOString() };
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.result === 'METADATA_PREPARED' ? 0 : 1;
}

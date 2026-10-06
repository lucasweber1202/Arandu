#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const requireReady = process.argv.includes('--require-ready');
// Frentes do go-live de produção. As frentes da vertical de arte aposentada
// (catálogo real, operação comercial, piloto fechado de vendas) saíram com ela;
// o piloto financeiro tem checklist própria em docs/FINANCIAL_PILOT_GO_LIVE.md.
const checks = [
  ['Código e contratos', ['run', 'check:all']],
  ['Ambiente de produção', ['run', 'check:env:release']],
  ['Evidências externas', ['run', 'check:evidence:release']],
  ['Domínio e marca', ['run', 'check:domain:release']],
  ['Plataforma e backup', ['run', 'check:platform:release']]
];
const results = checks.map(([name, args]) => {
  const run = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8'
  });
  return {
    name,
    ready: run.status === 0,
    exitCode: run.status,
    summary: `${run.stdout || ''}\n${run.stderr || ''}`.trim().split('\n').filter(Boolean).slice(-8)
  };
});
const pending = results.filter((item) => !item.ready);
const report = { generatedAt: new Date().toISOString(), ready: pending.length === 0, results };
fs.mkdirSync(path.join(root, 'reports'), { recursive: true });
fs.writeFileSync(path.join(root, 'reports/release-status.json'), JSON.stringify(report, null, 2));

console.log('Arandu Release Status');
for (const result of results) {
  console.log(`${result.ready ? 'PRONTO' : 'BLOQUEADO'} ${result.name}`);
  if (!result.ready) result.summary.forEach((line) => console.log(`  ${line}`));
}
console.log(`\nResultado: ${report.ready ? 'LIBERADO' : `${pending.length} frente(s) bloqueada(s)`}`);
console.log('Relatório: reports/release-status.json');
if (requireReady && pending.length) process.exit(1);

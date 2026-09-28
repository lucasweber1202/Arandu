#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const environment = String(process.env.VERCEL_ENV || 'local').trim().toLowerCase();
const arandu = String(process.env.ARANDU_ENV || '').trim().toLowerCase();
const target = 'deploy:check';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args) => spawnSync(args[0], args.slice(1), { cwd: process.cwd(), env: process.env, stdio: 'inherit' });

console.log(`Arandu Vercel build: technical deployment gate (${target}, environment=${environment}${arandu ? `, ARANDU_ENV=${arandu}` : ''})`);
console.log('Final public go-live remains protected by npm run predeploy / npm run release:check.');

// Piloto e produção só publicam com a topologia certa: banco próprio (nunca o
// do outro ambiente nem o legado), branch certa, sem demonstração, segredos de
// servidor presentes. O checker nunca imprime valores.
if (['pilot', 'production'].includes(arandu)) {
  const topology = run([process.execPath, 'scripts/check-finance-env.mjs']);
  if (topology.error || topology.status !== 0) {
    console.error(`finance:env:check reprovou o ambiente ${arandu}: deploy interrompido.`);
    process.exit(topology.status || 1);
  }
}

const result = run([npm, 'run', target]);
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);

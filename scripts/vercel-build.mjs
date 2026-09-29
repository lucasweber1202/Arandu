#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const environment = String(process.env.VERCEL_ENV || 'local').trim().toLowerCase();
const arandu = String(process.env.ARANDU_ENV || '').trim().toLowerCase();
// Projeto arandu-demo: o vercel.json fixa este script como buildCommand e
// sobrepõe o campo "Build Command" do painel. Por isso o projeto demonstrativo
// é identificado pela variável ARANDU_DEPLOYMENT_KIND=demo e cai aqui no
// build:demo (sem credencial real, com a fronteira da demo verificada no dist).
const demo = String(process.env.ARANDU_DEPLOYMENT_KIND || '').trim().toLowerCase() === 'demo';
const target = demo ? 'deploy:check:demo' : 'deploy:check';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const run = (args) => spawnSync(args[0], args.slice(1), { cwd: process.cwd(), env: process.env, stdio: 'inherit' });

console.log(`Arandu Vercel build: technical deployment gate (${target}, environment=${environment}${arandu ? `, ARANDU_ENV=${arandu}` : ''})`);
console.log('Final public go-live remains protected by npm run predeploy / npm run release:check.');

// Deploy de produção da Vercel precisa dizer qual ambiente é: arandu-demo
// (ARANDU_DEPLOYMENT_KIND=demo), arandu-pilot (ARANDU_ENV=pilot) ou arandu
// (ARANDU_ENV=production). Sem isso a topologia não é verificada e o build
// seguiria sem saber a que banco pertence.
if (environment === 'production' && !demo && !['pilot', 'production'].includes(arandu)) {
  console.error('Deploy de produção sem ARANDU_ENV (pilot|production) nem ARANDU_DEPLOYMENT_KIND=demo: deploy interrompido. Ver docs/FINANCIAL_DEPLOYMENT_WORKFLOW.md.');
  process.exit(1);
}

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

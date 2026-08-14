#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const environment = String(process.env.VERCEL_ENV || 'local').trim().toLowerCase();
const target = 'deploy:check';

console.log(`Arandu Vercel build: technical deployment gate (${target}, environment=${environment})`);
console.log('Final public go-live remains protected by npm run predeploy / npm run release:check.');
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', target], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit'
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);

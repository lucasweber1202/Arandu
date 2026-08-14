#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const production = process.env.VERCEL_ENV === 'production';
const target = production ? 'predeploy' : 'build';

console.log(`Arandu Vercel build: ${production ? 'production gate' : 'preview validation'} (${target})`);
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

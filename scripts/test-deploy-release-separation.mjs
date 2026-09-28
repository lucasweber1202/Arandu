import assert from 'node:assert/strict';
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const scripts = pkg.scripts || {};
const vercelBuild = fs.readFileSync('scripts/vercel-build.mjs', 'utf8');

assert.equal(scripts['vercel-build'], 'node scripts/vercel-build.mjs');
assert.ok(scripts['deploy:check'], 'deploy:check must exist');
assert.match(scripts['deploy:check'], /npm run build/);
assert.match(scripts['deploy:check'], /npm run check:all/);
assert.doesNotMatch(scripts['deploy:check'], /predeploy|release:check|:release|--require-ready/);
assert.match(scripts.predeploy, /npm run deploy:check/);
assert.match(scripts.predeploy, /npm run release:check/);
assert.match(scripts['release:check'], /--require-ready/);
assert.match(vercelBuild, /const target = 'deploy:check'/);
assert.doesNotMatch(vercelBuild, /target\s*=.*predeploy|VERCEL_ENV\s*===\s*['"]production['"]/);

// Piloto e produção passam pelo checker de topologia antes do build.
assert.match(vercelBuild, /\['pilot', 'production'\]\.includes\(arandu\)/);
assert.match(vercelBuild, /scripts\/check-finance-env\.mjs/);
import { spawnSync } from 'node:child_process';
const blocked = spawnSync(process.execPath, ['scripts/vercel-build.mjs'], { encoding: 'utf8', env: { PATH: process.env.PATH, ARANDU_ENV: 'production', SUPABASE_URL: 'https://offgpyysgdhfemjlchod.supabase.co' } });
assert.notEqual(blocked.status, 0, 'deploy de produção apontando para o piloto não pode seguir');
assert.match(blocked.stderr, /deploy interrompido/);

console.log('Technical deploy and final go-live gates are separated and fail-closed.');

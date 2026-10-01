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
assert.match(vercelBuild, /const target = demo \? 'deploy:check:demo' : 'deploy:check'/);
// Projeto arandu-demo: o vercel.json sobrepõe o Build Command do painel, então
// o build demonstrativo é escolhido pela variável e não por configuração manual.
assert.match(vercelBuild, /ARANDU_DEPLOYMENT_KIND/);
assert.match(scripts['deploy:check:demo'], /^npm run build:demo && /);
assert.doesNotMatch(scripts['deploy:check:demo'], /predeploy|release:check|--require-ready/);
assert.match(scripts['build:demo'], /test-demo-mode\.mjs --dist --expect-demo/);
assert.doesNotMatch(vercelBuild, /target\s*=.*predeploy|VERCEL_ENV\s*===\s*['"]production['"]/);

// Demo, piloto e produção passam pelo checker de topologia antes do build.
assert.match(vercelBuild, /SERVER_ENVIRONMENTS = \['demo', 'pilot', 'production'\]/);
assert.match(vercelBuild, /if \(SERVER_ENVIRONMENTS\.includes\(arandu\)\)/);
// Nenhum caminho de build ou deploy semeia ou reseta a demonstração: dado
// fictício só entra por comando manual (npm run demo:seed / demo:reset).
for (const name of ['build', 'vercel-build', 'deploy:check', 'deploy:check:demo', 'predeploy', 'build:demo', 'postinstall', 'prebuild', 'postbuild']) {
  assert.doesNotMatch(String(scripts[name] || ''), /demo:(seed|reset|setup)|scripts\/demo\//, `${name} executa o seed da demonstração`);
}
assert.doesNotMatch(vercelBuild, /demo:(seed|reset|setup)|scripts\/demo\//, 'vercel-build executa o seed da demonstração');
assert.match(vercelBuild, /scripts\/check-finance-env\.mjs/);
import { spawnSync } from 'node:child_process';
const blocked = spawnSync(process.execPath, ['scripts/vercel-build.mjs'], { encoding: 'utf8', env: { PATH: process.env.PATH, ARANDU_ENV: 'production', SUPABASE_URL: 'https://offgpyysgdhfemjlchod.supabase.co' } });
assert.notEqual(blocked.status, 0, 'deploy de produção apontando para o piloto não pode seguir');
assert.match(blocked.stderr, /deploy interrompido/);

// Produção da Vercel sem ambiente declarado não publica.
const undeclared = spawnSync(process.execPath, ['scripts/vercel-build.mjs'], { encoding: 'utf8', env: { PATH: process.env.PATH, VERCEL_ENV: 'production' } });
assert.notEqual(undeclared.status, 0, 'produção sem ARANDU_ENV publicou');
assert.match(undeclared.stderr, /sem ARANDU_ENV/);

// Demo com ARANDU_ENV real ou credencial real não publica.
for (const extra of [{ ARANDU_ENV: 'pilot' }, { SUPABASE_SERVICE_ROLE_KEY: 'x' }]) {
  const demo = spawnSync(process.execPath, ['scripts/vercel-build.mjs'], { encoding: 'utf8', env: { PATH: process.env.PATH, ARANDU_DEPLOYMENT_KIND: 'demo', ...extra } });
  assert.notEqual(demo.status, 0, `build demonstrativo seguiu com ${Object.keys(extra)[0]}`);
}

// Deploy real (piloto/produção): os testes de contrato do check:all rodam sem o
// ambiente de deploy. Antes, ARANDU_ENV=pilot herdado reprovava o deploy real.
assert.match(scripts['deploy:check'], /node scripts\/run-hermetic\.mjs npm run check:all/);
const { hermeticEnv } = await import('./run-hermetic.mjs');
const deployEnv = { PATH: '/bin', HOME: '/h', ARANDU_ENV: 'pilot', ARANDU_SITE_URL: 'https://p.example.com', VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'pilot',
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 's', CRON_SECRET: 'c', RESEND_API_KEY: 'r', ARANDU_PILOT_ALLOWLIST_CONFIRMED: 'true', ARANDU_DEPLOYMENT_KIND: 'demo' };
assert.deepEqual(hermeticEnv(deployEnv), { PATH: '/bin', HOME: '/h', ARANDU_SITE_URL: 'https://p.example.com' });
const pilotContract = spawnSync(process.execPath, ['scripts/run-hermetic.mjs', process.execPath, 'scripts/test-operational-status.mjs'], { encoding: 'utf8', env: { ...process.env, ARANDU_ENV: 'pilot', VERCEL_ENV: 'production' } });
assert.equal(pilotContract.status, 0, 'teste de contrato reprovou com o ambiente do piloto herdado:\n' + pilotContract.stderr);

console.log('Technical deploy and final go-live gates are separated and fail-closed.');

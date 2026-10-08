// finance:env:check recusa o piloto apontado para o projeto legado de arte,
// chaves de outro projeto e chave de serviço no lugar da anon; aceita o piloto
// dedicado. Nunca imprime o valor de uma chave.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { permanentSupabaseAssignmentProblem } from '../lib/deployment-topology.mjs';

const key = (claims) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.assinatura-0123456789abcdef`;
const pilotRef = 'offgpyysgdhfemjlchod';
const legacyRef = 'igacnfjeuqhxcmfyepgj';
const base = {
  PATH: process.env.PATH, ARANDU_ENV: 'pilot', ARANDU_SITE_URL: 'https://piloto.example.com', CRON_SECRET: 'c'.repeat(40),
  SUPABASE_URL: `https://${pilotRef}.supabase.co`,
  SUPABASE_ANON_KEY: key({ role: 'anon', ref: pilotRef }),
  SUPABASE_SERVICE_ROLE_KEY: key({ role: 'service_role', ref: pilotRef })
};
const run = (overrides) => {
  const env = { ...base, ...overrides };
  const result = spawnSync(process.execPath, ['scripts/check-finance-env.mjs'], { env, encoding: 'utf8' });
  for (const secret of [env.SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY, env.CRON_SECRET].filter(Boolean)) {
    assert.ok(!result.stdout.includes(secret), 'finance:env:check imprimiu um segredo');
  }
  return result;
};

assert.equal(run({}).status, 0, 'piloto dedicado deveria passar');
const legacy = run({ SUPABASE_URL: `https://${legacyRef}.supabase.co`, SUPABASE_ANON_KEY: key({ role: 'anon', ref: legacyRef }), SUPABASE_SERVICE_ROLE_KEY: key({ role: 'service_role', ref: legacyRef }) });
assert.equal(legacy.status, 1);
assert.match(legacy.stdout, /projeto legado de arte/);
const foreign = run({ SUPABASE_ANON_KEY: key({ role: 'anon', ref: legacyRef }) });
assert.equal(foreign.status, 1);
assert.match(foreign.stdout, /SUPABASE_ANON_KEY pertence a outro projeto/);
const swapped = run({ SUPABASE_ANON_KEY: base.SUPABASE_SERVICE_ROLE_KEY });
assert.equal(swapped.status, 1);
assert.match(swapped.stdout, /SUPABASE_ANON_KEY é uma chave de serviço/);
assert.equal(run({ ARANDU_PRESENTATION_MODE: 'true' }).status, 1, 'demo no piloto');
assert.equal(run({ ARANDU_DEMO_MODE: 'true' }).status, 1, 'ARANDU_DEMO_MODE no piloto');
assert.equal(run({ ARANDU_DEPLOYMENT_KIND: 'demo' }).status, 1, 'build demo com variáveis do piloto');
assert.equal(run({ VERCEL_GIT_COMMIT_REF: 'main' }).status, 0, 'staging/piloto publica a partir da main canônica');
assert.match(run({ VERCEL_GIT_COMMIT_REF: 'pilot' }).stdout, /só a branch main publica/, 'a branch pilot não é mais linha de produto');
assert.match(run({ VERCEL_GIT_COMMIT_REF: 'feature/x' }).stdout, /só a branch main publica/);
// Produção: banco próprio, branch main, service role e cron obrigatórios.
const prodRef = 'producaoarandu000000';
const production = { ARANDU_ENV: 'production', SUPABASE_URL: `https://${prodRef}.supabase.co`, SUPABASE_ANON_KEY: key({ role: 'anon', ref: prodRef }), SUPABASE_SERVICE_ROLE_KEY: key({ role: 'service_role', ref: prodRef }), VERCEL_GIT_COMMIT_REF: 'main' };
assert.equal(run(production).status, 1, 'ref desconhecido não comprova produção dedicada');
assert.match(run(production).stdout, /sem atribuição ativa aprovada/);
const onPilot = run({ ...production, SUPABASE_URL: base.SUPABASE_URL, SUPABASE_ANON_KEY: base.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: base.SUPABASE_SERVICE_ROLE_KEY });
assert.equal(onPilot.status, 1);
assert.match(onPilot.stdout, /produção aponta para o projeto do piloto/);
assert.match(run({ ...production, VERCEL_GIT_COMMIT_REF: 'pilot' }).stdout, /só a branch main publica/);
assert.equal(run({ ...production, CRON_SECRET: '' }).status, 1, 'produção sem CRON_SECRET');
// Demonstração canônica: a main com banco DEMO próprio; nunca o do piloto,
// nunca outra branch, nunca o sandbox; e a senha das personas não vai à produção.
const demoRef = 'demonstracaoarandu00';
const demo = { ARANDU_ENV: 'demo', ARANDU_SITE_URL: 'https://demo.example.com', SUPABASE_URL: `https://${demoRef}.supabase.co`, SUPABASE_ANON_KEY: key({ role: 'anon', ref: demoRef }), SUPABASE_SERVICE_ROLE_KEY: key({ role: 'service_role', ref: demoRef }), VERCEL_GIT_COMMIT_REF: 'main' };
assert.equal(run(demo).status, 1, 'ref desconhecido não comprova demo dedicada');
assert.match(run(demo).stdout, /sem atribuição ativa aprovada/);
assert.match(run({ ...demo, SUPABASE_URL: base.SUPABASE_URL, SUPABASE_ANON_KEY: base.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: base.SUPABASE_SERVICE_ROLE_KEY }).stdout, /demo apontando para o Supabase do piloto/);
assert.match(run({ ...demo, VERCEL_GIT_COMMIT_REF: 'demo' }).stdout, /só a branch main publica/);
assert.equal(run({ ...demo, ARANDU_DEPLOYMENT_KIND: 'demo' }).status, 1, 'sandbox junto da demo com banco');
assert.equal(run({ ...demo, CRON_SECRET: '' }).status, 1, 'demo sem CRON_SECRET');
assert.equal(run({ ...production, ARANDU_DEMO_PASSWORD: 'x'.repeat(20) }).status, 1, 'senha das personas na produção');
// Estado pós-cutover simulado, nunca aplicado às atribuições operacionais.
const assignments = { demo: [demoRef], production: [prodRef] };
for (const [environment, ref] of [['demo', demoRef], ['production', prodRef]]) {
  assert.equal(permanentSupabaseAssignmentProblem(environment, ref, assignments), null);
  assert.match(permanentSupabaseAssignmentProblem(environment, 'unknown', assignments), /sem atribuição ativa/);
  assert.match(permanentSupabaseAssignmentProblem(environment, null, assignments), /não verificável/);
  assert.equal(run({ ...production, ARANDU_ENV: environment, SUPABASE_URL: 'https://custom.example.invalid' }).status, 1, 'domínio próprio não comprova identidade Supabase');
}
assert.match(permanentSupabaseAssignmentProblem('demo', pilotRef), /sem atribuição ativa/);
assert.match(permanentSupabaseAssignmentProblem('production', legacyRef), /sem atribuição ativa/);
assert.equal(permanentSupabaseAssignmentProblem('pilot', pilotRef), null);
console.log('finance:env:check: permanentes exigem atribuição ativa aprovada; refs desconhecidos, destinos planejados e identidade não verificável bloqueados, sem imprimir segredo.');

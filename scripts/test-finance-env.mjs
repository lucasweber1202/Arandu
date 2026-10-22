// finance:env:check recusa o piloto apontado para o projeto legado de arte,
// chaves de outro projeto e chave de serviço no lugar da anon; aceita o piloto
// dedicado. Nunca imprime o valor de uma chave.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    assert.ok(!(result.stdout + result.stderr).includes(secret), 'finance:env:check imprimiu um segredo');
  }
  return result;
};

assert.equal(run({}).status, 0, 'piloto dedicado deveria passar');
for (const site of ['https://operator:synthetic-log-sentinel@pilot.example.com', 'https://pilot.example.com/?token=synthetic-log-sentinel', 'https://pilot.example.com/#synthetic-log-sentinel']) {
  const result = run({ ARANDU_SITE_URL: site });
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-log-sentinel/, 'URL de aplicação não pode vazar credenciais ou parâmetros no log');
  assert.equal(result.status, 1, 'URL de aplicação com credenciais, query ou fragmento deve falhar');
}
const legacy = run({ SUPABASE_URL: `https://${legacyRef}.supabase.co`, SUPABASE_ANON_KEY: key({ role: 'anon', ref: legacyRef }), SUPABASE_SERVICE_ROLE_KEY: key({ role: 'service_role', ref: legacyRef }) });
assert.equal(legacy.status, 1);
assert.match(legacy.stdout, /projeto legado de arte/);
const foreign = run({ SUPABASE_ANON_KEY: key({ role: 'anon', ref: legacyRef }) });
assert.equal(foreign.status, 1);
assert.match(foreign.stdout, /SUPABASE_ANON_KEY pertence a outro projeto/);
const swapped = run({ SUPABASE_ANON_KEY: base.SUPABASE_SERVICE_ROLE_KEY });
assert.equal(swapped.status, 1);
assert.match(swapped.stdout, /SUPABASE_ANON_KEY é uma chave de serviço/);
// O build aceitava anon no campo service role: presença/comprimento não
// comprovam o papel necessário às operações de servidor.
const publishable = `sb_publishable_${'p'.repeat(32)}`;
const secretKey = `sb_secret_${'s'.repeat(32)}`;
for (const bad of [base.SUPABASE_ANON_KEY, publishable, 'invalid-key-'.repeat(4), 'sb_secret_short', key({ ref: pilotRef }), key({ role: 'authenticated', ref: pilotRef }), `not-json-header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature123`]) {
  const result = run({ SUPABASE_SERVICE_ROLE_KEY: bad });
  assert.equal(result.status, 1, 'chave de servidor sem papel service_role aceita');
  assert.match(result.stdout, /SUPABASE_SERVICE_ROLE_KEY presente, mas não é uma chave service_role\/secret/);
}
for (const bad of [secretKey, 'invalid-public-key-'.repeat(3), 'sb_publishable_short', key({ role: 'authenticated', ref: pilotRef })]) {
  assert.equal(run({ SUPABASE_ANON_KEY: bad }).status, 1, 'chave pública inválida aceita');
}
assert.equal(run({ SUPABASE_ANON_KEY: publishable, SUPABASE_SERVICE_ROLE_KEY: secretKey }).status, 0, 'novas chaves de papéis corretos aceitas estruturalmente');
// O gate final de Production deve rejeitar os mesmos papéis trocados.
const releaseEnv = { ...base, ARANDU_ENV: 'production', ARANDU_SITE_URL: 'https://arandu.example.org', ARANDU_DISTRIBUTED_RATE_LIMIT: 'true', ARANDU_ERROR_MONITORING_READY: 'true', ARANDU_BACKUP_VERIFIED_AT: new Date().toISOString() };
for (const keys of [
  { SUPABASE_ANON_KEY: base.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: base.SUPABASE_SERVICE_ROLE_KEY, expected: 0 },
  { SUPABASE_ANON_KEY: publishable, SUPABASE_SERVICE_ROLE_KEY: secretKey, expected: 0 },
  { SUPABASE_ANON_KEY: base.SUPABASE_SERVICE_ROLE_KEY, expected: 1 },
  { SUPABASE_ANON_KEY: secretKey, expected: 1 },
  { SUPABASE_SERVICE_ROLE_KEY: base.SUPABASE_ANON_KEY, expected: 1 },
  { SUPABASE_SERVICE_ROLE_KEY: publishable, expected: 1 },
  { SUPABASE_SERVICE_ROLE_KEY: 'malformed-key-'.repeat(4), expected: 1 }
]) {
  const { expected, ...values } = keys;
  const env = { ...releaseEnv, ...values };
  const result = spawnSync(process.execPath, ['scripts/check-production-env.mjs', '--require-ready'], { env, encoding: 'utf8' });
  assert.equal(result.status, expected, 'papéis incorretos no gate final de Production');
  for (const value of [env.SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY]) assert.ok(!(result.stdout + result.stderr).includes(value), 'gate final imprimiu chave');
}
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
// Reprodução da falha do build de Production (arandu): ref legado e ARANDU_SITE_URL
// ausente. O legado é destino planejado, não atribuição: bloqueia e diz o que destrava.
const onLegacy = run({ ...production, ARANDU_SITE_URL: '', SUPABASE_URL: `https://${legacyRef}.supabase.co`, SUPABASE_ANON_KEY: key({ role: 'anon', ref: legacyRef }), SUPABASE_SERVICE_ROLE_KEY: key({ role: 'service_role', ref: legacyRef }) });
assert.equal(onLegacy.status, 1);
assert.match(onLegacy.stdout, /ARANDU_SITE_URL ausente/);
assert.match(onLegacy.stdout, /projeto legado, que ainda não tem atribuição ativa para production/);
assert.doesNotMatch(onLegacy.stdout, /começa vazio/, 'mensagem não pode contradizer o destino planejado da produção');
assert.equal(run({ ...production, CRON_SECRET: '' }).status, 1, 'produção sem CRON_SECRET');
// ARANDU_SITE_URL de Production observado no build da Vercel em 14/10/2026: o
// placeholder do .env.example passava porque só o prefixo https:// era conferido.
for (const environment of [{}, production]) {
  const placeholder = run({ ...environment, ARANDU_SITE_URL: 'https://sua-url-da-vercel' });
  assert.equal(placeholder.status, 1, 'placeholder sem domínio aceito como URL do site');
  assert.match(placeholder.stdout, /ARANDU_SITE_URL presente, mas não é um domínio publicável/);
}
assert.match(run({ ...production, ARANDU_SITE_URL: 'https://localhost:4443' }).stdout, /ARANDU_SITE_URL presente, mas não é um domínio publicável/, 'localhost em produção');
assert.equal(run({ ARANDU_SITE_URL: 'https://localhost:4443' }).status, 0, 'stack local (pilot-local, demo:setup) continua aceita');
assert.equal(run({ ARANDU_SITE_URL: 'https://arandu-pilot.vercel.app' }).status, 0, 'domínio da Vercel continua aceito fora de production');
// Demonstração canônica: a main com banco DEMO próprio; nunca o do piloto,
// nunca outra branch, nunca o sandbox; e a senha das personas não vai à produção.
const demoRef = 'demonstracaoarandu00';
const demo = { ARANDU_ENV: 'demo', ARANDU_SITE_URL: 'https://demo.example.com', SUPABASE_URL: `https://${demoRef}.supabase.co`, SUPABASE_ANON_KEY: key({ role: 'anon', ref: demoRef }), SUPABASE_SERVICE_ROLE_KEY: key({ role: 'service_role', ref: demoRef }), VERCEL_GIT_COMMIT_REF: 'main' };
assert.equal(run(demo).status, 1, 'ref desconhecido não comprova demo dedicada');
assert.match(run(demo).stdout, /ARANDU_DEMO_PASSWORD ausente ou fraco/);
assert.doesNotMatch(run({ ...demo, ARANDU_DEMO_PASSWORD: 'SyntheticOnlySecret9' }).stdout, /ARANDU_DEMO_PASSWORD ausente ou fraco/);
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
// Run the real CLI against a disposable hypothetical approved topology. This
// proves structural prerequisites, never authenticated credentials or M5.
const fixture = mkdtempSync(join(tmpdir(), 'arandu-production-env-'));
try {
  cpSync('lib', join(fixture, 'lib'), { recursive: true });
  mkdirSync(join(fixture, 'scripts'));
  cpSync('scripts/check-finance-env.mjs', join(fixture, 'scripts/check-finance-env.mjs'));
  writeFileSync(join(fixture, 'package.json'), '{"type":"module"}');
  const topologyFile = join(fixture, 'lib/deployment-topology.mjs');
  const topology = readFileSync(topologyFile, 'utf8');
  assert.match(topology, /production: Object.freeze\(\[\]\)/);
  writeFileSync(topologyFile, topology.replace('production: Object.freeze([])', `production: Object.freeze(['${prodRef}'])`));
  const configured = { ...base, ...production, ARANDU_SITE_URL: 'https://arandu.example.org' };
  const check = (overrides = {}) => {
    const env = { ...configured, ...overrides };
    const result = spawnSync(process.execPath, ['scripts/check-finance-env.mjs'], { cwd: fixture, env, encoding: 'utf8' });
    for (const secret of [env.SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY, env.CRON_SECRET].filter(Boolean)) {
      assert.ok(!(result.stdout + result.stderr).includes(secret), 'fixture diagnostics leaked a synthetic credential');
    }
    return result;
  };
  assert.equal(check().status, 0, 'approved isolated fixture with consistent configuration');
  for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'ARANDU_SITE_URL']) {
    const result = check({ [name]: '' });
    assert.equal(result.status, 1, `missing mandatory ${name}`);
    assert.match(result.stdout, new RegExp(`${name} ausente`));
  }
  assert.equal(check({ VERCEL_GIT_COMMIT_REF: 'feature/unapproved' }).status, 1);
  assert.equal(check({ ARANDU_PRESENTATION_MODE: 'true' }).status, 1);
  assert.equal(check({ SUPABASE_SERVICE_ROLE_KEY: configured.SUPABASE_ANON_KEY }).status, 1);
} finally { rmSync(fixture, { recursive: true, force: true }); }
assert.match(permanentSupabaseAssignmentProblem('production', prodRef), /sem atribuição ativa/,
  'fixture must not change the operational assignment');
console.log('finance:env:check: permanentes exigem atribuição ativa aprovada; refs desconhecidos, destinos planejados e identidade não verificável bloqueados, sem imprimir segredo.');

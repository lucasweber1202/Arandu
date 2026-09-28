// finance:env:check recusa o piloto apontado para o projeto legado de arte,
// chaves de outro projeto e chave de serviço no lugar da anon; aceita o piloto
// dedicado. Nunca imprime o valor de uma chave.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

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
  for (const secret of [env.SUPABASE_ANON_KEY, env.SUPABASE_SERVICE_ROLE_KEY, env.CRON_SECRET]) {
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
console.log('finance:env:check: piloto dedicado aceito; projeto legado, chave de outro projeto, service key como anon e demo no piloto recusados, sem imprimir segredo.');

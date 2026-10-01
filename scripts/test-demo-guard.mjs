#!/usr/bin/env node
// Travas do seed/reset da demonstração canônica (lib/finance/demo-guard.mjs):
// nada é escrito fora de um alvo DEMO explícito, confirmado e vazio ou marcado.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertDemoTarget, assertDemoDatabase, assertDemoApplication, demoTargetIdentity, DemoGuardError, isDemoEmail, DEMO_EMAIL_DOMAINS } from '../lib/finance/demo-guard.mjs';

const key = (claims) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.assinatura`;
const ref = 'demoarandu0000000000';
const ok = {
  ARANDU_ENV: 'demo', ARANDU_DEMO_CONFIRM: ref, SUPABASE_URL: `https://${ref}.supabase.co`,
  SUPABASE_SERVICE_ROLE_KEY: key({ role: 'service_role', ref }), SUPABASE_ANON_KEY: key({ role: 'anon', ref }),
  ARANDU_DEMO_APP_URL: 'https://demo.example.com', ARANDU_DEMO_PASSWORD: 'Vitta-Demo-2026x'
};
const refused = (env, pattern, label) => {
  assert.throws(() => assertDemoTarget(env), (error) => error instanceof DemoGuardError && error.reasons.some((reason) => pattern.test(reason)), label);
};

assert.equal(assertDemoTarget(ok).target.ref, ref);
assert.equal(assertDemoTarget({ ...ok, SUPABASE_URL: 'https://localhost:8443', ARANDU_DEMO_CONFIRM: 'local', SUPABASE_SERVICE_ROLE_KEY: key({ role: 'service_role' }), SUPABASE_ANON_KEY: key({ role: 'anon' }) }).target.kind, 'local');
for (const environment of ['', 'production', 'pilot', 'development']) refused({ ...ok, ARANDU_ENV: environment }, /ARANDU_ENV=demo/, `ARANDU_ENV=${environment || 'ausente'}`);
refused({ ...ok, NODE_ENV: 'development', ARANDU_ENV: '' }, /ARANDU_ENV=demo/, 'NODE_ENV não basta');
for (const vercel of ['production', 'preview']) refused({ ...ok, VERCEL_ENV: vercel }, /dentro de um deploy/, `VERCEL_ENV=${vercel}`);
refused({ ...ok, ARANDU_DEMO_CONFIRM: '' }, /ARANDU_DEMO_CONFIRM/, 'sem confirmação');
refused({ ...ok, ARANDU_DEMO_CONFIRM: 'local' }, /ARANDU_DEMO_CONFIRM/, 'confirmação de outro alvo');
for (const [target, pattern] of [['offgpyysgdhfemjlchod', /piloto/], ['igacnfjeuqhxcmfyepgj', /legado/]]) {
  refused({ ...ok, SUPABASE_URL: `https://${target}.supabase.co`, ARANDU_DEMO_CONFIRM: target, SUPABASE_SERVICE_ROLE_KEY: key({ role: 'service_role', ref: target }), SUPABASE_ANON_KEY: key({ role: 'anon', ref: target }) }, pattern, target);
}
refused({ ...ok, SUPABASE_URL: 'https://banco.empresa.com.br' }, /SUPABASE_URL/, 'domínio próprio não verificável');
refused({ ...ok, SUPABASE_SERVICE_ROLE_KEY: key({ role: 'service_role', ref: 'outroprojeto00000000' }) }, /outro projeto/, 'chave de outro projeto');
refused({ ...ok, SUPABASE_SERVICE_ROLE_KEY: ok.SUPABASE_ANON_KEY }, /chave de serviço/, 'anon no lugar da service role');
refused({ ...ok, SUPABASE_ANON_KEY: ok.SUPABASE_SERVICE_ROLE_KEY }, /SUPABASE_ANON_KEY/, 'service role no lugar da anon');
refused({ ...ok, ARANDU_DEMO_APP_URL: 'http://demo.example.com' }, /ARANDU_DEMO_APP_URL/, 'app sem https');
for (const password of ['', 'curta1A', 'semnumerosOuMaiusc']) refused({ ...ok, ARANDU_DEMO_PASSWORD: password }, /ARANDU_DEMO_PASSWORD/, `senha "${password}"`);
assert.equal(demoTargetIdentity('https://abc.supabase.co'), null, 'ref inválido');

// Trava 6: banco.
assert.equal(assertDemoDatabase({ marker: 'demo', organizations: 12 }), 'marked');
assert.equal(assertDemoDatabase({ marker: null, organizations: 0 }), 'empty');
assert.throws(() => assertDemoDatabase({ marker: null, organizations: 3 }), /nenhum marcador/);
assert.throws(() => assertDemoDatabase({ marker: 'production', organizations: 0 }), /marcado como "production"/);
// Trava 7: aplicação.
assertDemoApplication('demo');
for (const environment of [null, undefined, 'pilot', 'production']) assert.throws(() => assertDemoApplication(environment), /ARANDU_ENV=demo/);

// Personas só em domínios reservados (.example).
assert.ok(DEMO_EMAIL_DOMAINS.every((domain) => domain.endsWith('.example')));
assert.equal(isDemoEmail('juliana.ramos@vittafoods.example'), true);
assert.equal(isDemoEmail('cfo@empresa-real.com.br'), false);
assert.equal(isDemoEmail('x@vittafoods.example.com'), false);

// O seed passa pela API real e nunca carrega segredo versionado.
const seed = fs.readFileSync('scripts/demo/seed.mjs', 'utf8');
const dataset = fs.readFileSync('scripts/demo/dataset.mjs', 'utf8');
assert.match(seed, /assertDemoTarget\(process\.env\)/);
assert.match(seed, /assertDemoDatabase\(/);
assert.match(seed, /assertDemoApplication\(/);
assert.doesNotMatch(seed + dataset, /password\s*[:=]\s*['"][^'"]+['"]/i, 'senha fixa no seed');
assert.doesNotMatch(dataset, /@(?!(vittafoods|atlasbank|nexopay|orbecapital|meridianfinancial|luminapay)\.example)[a-z0-9.-]+\.[a-z]{2,}/i, 'e-mail fora dos domínios fictícios');
for (const brand of ['Itaú', 'Bradesco', 'Santander', 'Nubank', 'Cielo', 'Stone', 'Rede', 'Getnet', 'PagSeguro', 'Banco do Brasil', 'Caixa Econômica', 'BTG']) {
  assert.doesNotMatch(dataset, new RegExp(`\\b${brand}\\b`), `marca real no dataset: ${brand}`);
}
console.log('Demo guard: só ARANDU_ENV=demo explícito, fora de deploy, alvo confirmado, nunca piloto/legado/produção, chaves do mesmo projeto, banco vazio ou marcado e app em modo demo; dataset sem marca real nem senha.');

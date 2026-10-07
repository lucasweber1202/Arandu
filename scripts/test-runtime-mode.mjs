#!/usr/bin/env node
// Política única de runtime: Oficial, Staging/Pilot e Demo são o mesmo código
// com capacidades diferentes. Cada decisão aqui é uma fronteira de segurança.
import assert from 'node:assert/strict';
import { resolveRuntime, sideEffectBlockReason, CANONICAL_BRANCH, SERVER_ENVIRONMENTS, PERMANENT_HOSTED_ENVIRONMENTS, TRANSITIONAL_ENVIRONMENTS } from '../lib/runtime-mode.mjs';
import { inspectEmailConfiguration } from '../lib/email.mjs';
import { dispatchWebhooks } from '../lib/finance/webhook-dispatch.mjs';
import { createModelProvider } from '../lib/finance/extraction-providers.mjs';
import { mockSsoAdapter } from '../lib/finance/sso-adapters.mjs';
import { SERVER_ENVIRONMENTS as DEMO_MODE_ENVIRONMENTS } from '../lib/demo-mode.mjs';

assert.equal(CANONICAL_BRANCH, 'main');
assert.deepEqual(PERMANENT_HOSTED_ENVIRONMENTS, ['demo', 'production']);
assert.deepEqual(TRANSITIONAL_ENVIRONMENTS, ['pilot']);
assert.deepEqual([...SERVER_ENVIRONMENTS], ['demo', 'pilot', 'production']);
assert.equal(DEMO_MODE_ENVIRONMENTS, SERVER_ENVIRONMENTS, 'uma única lista de ambientes');

const official = resolveRuntime({ ARANDU_ENV: 'production' });
assert.equal(official.mode, 'official');
assert.equal(official.isPermanentEnvironment, true);
assert.equal(official.isTransitionalEnvironment, false);
assert.ok(official.isOfficial && !official.isDemo && !official.isStaging);
assert.equal(official.datasource, 'supabase');
assert.equal(official.expectedBranch, 'main');
assert.ok(official.canSendEmail && official.canDispatchWebhooks && official.canCallExternalProviders && official.canExecuteSideEffects && official.canPersistRealDocuments);
assert.equal(official.canUseSyntheticFixtures, false, 'oficial nunca carrega fixture demonstrativa');
assert.equal(official.canUseMockIdentity, false);
assert.equal(official.label, null);

const staging = resolveRuntime({ ARANDU_ENV: 'pilot', VERCEL_ENV: 'production' });
assert.equal(staging.mode, 'staging');
assert.equal(staging.isPermanentEnvironment, false);
assert.equal(staging.isTransitionalEnvironment, true);
assert.ok(staging.isStaging && !staging.isOfficial && !staging.isDemo);
assert.equal(staging.expectedBranch, 'main', 'staging não tem branch própria');
assert.equal(staging.canUseSyntheticFixtures, false);
assert.equal(staging.label, 'Ambiente de validação');

const demo = resolveRuntime({ ARANDU_ENV: 'demo', VERCEL_ENV: 'production' });
assert.equal(demo.mode, 'demo');
assert.equal(demo.datasource, 'supabase');
assert.equal(demo.expectedBranch, 'main');
for (const capability of ['canSendEmail', 'canDispatchWebhooks', 'canCallExternalProviders', 'canExecuteSideEffects', 'canPersistRealDocuments']) {
  assert.equal(demo[capability], false, `demo nunca: ${capability}`);
  assert.equal(sideEffectBlockReason(capability, { ARANDU_ENV: 'demo' }), 'runtime_demo');
  assert.equal(sideEffectBlockReason(capability, { ARANDU_ENV: 'production' }), null);
}
assert.equal(demo.canUseSyntheticFixtures, true);
assert.equal(demo.label, 'Ambiente de demonstração');

const sandbox = resolveRuntime({ ARANDU_DEPLOYMENT_KIND: 'demo', VERCEL_ENV: 'production' });
assert.equal(sandbox.mode, 'demo');
assert.equal(sandbox.isSandbox, true);
assert.equal(sandbox.datasource, 'synthetic-fixtures');
assert.equal(sandbox.canSendEmail, false);

// Falha fechada: configuração ambígua não libera nada nem vira oficial.
for (const env of [{ ARANDU_ENV: 'prod' }, { ARANDU_ENV: 'production', ARANDU_DEPLOYMENT_KIND: 'demo' }, { ARANDU_ENV: 'staging-x' }]) {
  const runtime = resolveRuntime(env);
  assert.equal(runtime.misconfigured, true, JSON.stringify(env));
  assert.equal(runtime.isOfficial, false);
  assert.equal(runtime.canSendEmail, false);
  assert.equal(runtime.canDispatchWebhooks, false);
  assert.equal(runtime.datasource, 'none');
  assert.equal(sideEffectBlockReason('canSendEmail', env), 'runtime_misconfigured');
}
const local = resolveRuntime({});
assert.equal(local.mode, 'development');
assert.equal(local.expectedBranch, null);
assert.equal(resolveRuntime({ VERCEL_ENV: 'production' }).canUseMockIdentity, false, 'deploy de produção sem ARANDU_ENV não usa IdP fictício');
assert.ok(Object.isFrozen(local));
assert.deepEqual(resolveRuntime({ ARANDU_ENV: ' Demo ' }), resolveRuntime({ ARANDU_ENV: 'demo' }), 'determinístico e normalizado');

// As fronteiras consultam a política, não ARANDU_ENV por conta própria.
const resend = { ARANDU_EMAIL_PROVIDER: 'resend', ARANDU_EMAIL_FROM: 'noreply@arandu.example.com', RESEND_API_KEY: 'r'.repeat(20), ARANDU_RECIPIENT_HMAC_SECRET: 's'.repeat(40), ARANDU_TRANSACTIONAL_EMAIL_READY: 'true' };
assert.equal(inspectEmailConfiguration({ ...resend, ARANDU_ENV: 'production' }).ready, true);
const demoMail = inspectEmailConfiguration({ ...resend, ARANDU_ENV: 'demo' });
assert.equal(demoMail.provider, 'disabled', 'demo com Resend configurado por engano continua sem enviar');
assert.equal(demoMail.ready, false);
assert.equal(demoMail.blockedBy, 'runtime_demo');

let claimed = false;
const blocked = await dispatchWebhooks({ rpc: async () => { claimed = true; return []; }, env: { ARANDU_ENV: 'demo' } });
assert.equal(claimed, false, 'demo nem reivindica a fila de webhooks');
assert.equal(blocked.blocked, 'runtime_demo');
assert.equal(blocked.claimed, 0);
await dispatchWebhooks({ rpc: async () => { claimed = true; return []; }, env: { ARANDU_ENV: 'production' } });
assert.equal(claimed, true);

const modelEnv = { ARANDU_EXTRACTION_MODEL_PROVIDER: 'x', ARANDU_EXTRACTION_DATA_AGREEMENT: 'signed' };
const client = { extract: async () => ({ pairs: [] }) };
assert.equal(createModelProvider({ env: { ...modelEnv, ARANDU_ENV: 'production' }, client }).configured, true);
assert.equal(createModelProvider({ env: { ...modelEnv, ARANDU_ENV: 'demo' }, client }).configured, false, 'demo nunca envia documento a modelo externo');

await assert.rejects(mockSsoAdapter({ issuer: 'i', audience: 'a', jwks: {}, env: { ARANDU_SSO_MOCK_IDP: 'true', ARANDU_ENV: 'production' } }).beginLogin(), (error) => error.reason === 'mock_disabled');
assert.ok(await mockSsoAdapter({ issuer: 'i', audience: 'a', jwks: {}, env: { ARANDU_SSO_MOCK_IDP: 'true', ARANDU_ENV: 'pilot' } }).beginLogin());

console.log('Runtime mode: official/staging/demo resolved from one policy; demo blocks e-mail, webhooks, external models and real documents; ambiguity fails closed; every hosted environment publishes from main.');

#!/usr/bin/env node
// Integrações na interface (admin): token e segredo gerados no servidor e
// devolvidos uma vez; o banco recebe só hash/cifrado; não admin para antes de
// qualquer RPC; o único uso de service role é "enviar pendentes agora",
// sempre filtrado pela organização confirmada.
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash, randomBytes } from 'node:crypto';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { decryptSecret } from '../lib/finance/public-api.mjs';

process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
process.env.ARANDU_WEBHOOK_SECRET_KEY = randomBytes(32).toString('base64');
process.env.ARANDU_ENV = 'pilot';

const ORG = '00000000-0000-4000-8000-000000000501', ACTOR = '00000000-0000-4000-8000-000000000502', ACCOUNT = '00000000-0000-4000-8000-000000000503';
let sent = [];
let role = 'admin';
let responder = () => [];
globalThis.fetch = async (url, options = {}) => {
  const entry = { url: String(url), method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null, authorization: options.headers?.Authorization, apikey: options.headers?.apikey };
  sent.push(entry);
  if (entry.url.includes('fin_organizations?select=id')) return Response.json([{ id: ORG, legal_name: 'Grupo', kind: 'BUYER' }]);
  if (entry.url.includes('fin_members?select=role')) return Response.json([{ role }]);
  return Response.json(responder(entry) ?? []);
};
const deps = { requireUser: async () => ({ user: { id: ACTOR }, accessToken: 'user-jwt', headers: {} }), enforceRateLimit: async () => {} };
async function call(method, path, body = null) {
  const req = Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), { method, url: `/api/finance/${path}`, headers: {} });
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.payload = JSON.parse(value); } };
  await handleFinance(req, res, path.split('?')[0], deps);
  return res;
}
async function rejects(method, path, body, status) {
  await assert.rejects(() => call(method, path, body), (error) => { assert.equal(error.status, status, `${path}: ${error.status} ${error.message}`); return true; });
}
const rpcs = () => sent.filter((entry) => entry.url.includes('/rpc/'));

// Não admin: 403 antes de qualquer RPC, inclusive leitura.
role = 'finance_manager';
sent = [];
await rejects('GET', `service-accounts?organization_id=${ORG}`, null, 403);
await rejects('POST', 'service-accounts', { organization_id: ORG, name: 'ERP', scopes: ['rfqs:read'] }, 403);
await rejects('POST', 'webhooks/dispatch', { organization_id: ORG }, 403);
assert.equal(rpcs().length, 0);
role = 'admin';

// Escopos e alcance validados antes do banco.
sent = [];
await rejects('POST', 'service-accounts', { organization_id: ORG, name: 'ERP', scopes: ['admin:all'] }, 400);
await rejects('POST', 'service-accounts', { organization_id: ORG, name: 'ERP', scopes: ['rfqs:read'], entity_scope: 'entities', entity_ids: [] }, 400);
assert.equal(rpcs().length, 0);

// Token: gerado aqui, hash para o banco, token só na resposta.
responder = (entry) => (entry.url.includes('rpc/fin_issue_api_credential') ? 'cred-1' : []);
sent = [];
const issued = await call('POST', 'service-accounts/credentials', { service_account_id: ACCOUNT, expires_in_days: 30 });
assert.equal(issued.statusCode, 201);
assert.match(issued.payload.token, /^arnd_pilot_[A-Za-z0-9]{43}$/);
const rpc = rpcs()[0];
assert.equal(rpc.authorization, 'Bearer user-jwt');
assert.equal(rpc.apikey, 'anon');
assert.equal(rpc.body.p_token_hash, createHash('sha256').update(issued.payload.token).digest('hex'));
assert.ok(!JSON.stringify(rpc.body).includes(issued.payload.token), 'token em claro chegou ao banco');
assert.equal(issued.headers['Cache-Control'], 'no-store');
await rejects('POST', 'service-accounts/credentials', { service_account_id: ACCOUNT, expires_in_days: 400 }, 400);

// Webhook: segredo uma vez; banco recebe o cifrado; URL interna recusada.
await rejects('POST', 'webhooks', { organization_id: ORG, url: 'https://192.168.0.10/x', events: ['rfq.created'] }, 400);
responder = (entry) => (entry.url.includes('rpc/fin_create_webhook_endpoint') ? 'wh-1' : []);
sent = [];
const hook = await call('POST', 'webhooks', { organization_id: ORG, url: 'https://erp.example.com/hook', events: ['rfq.created'] });
assert.equal(hook.statusCode, 201);
assert.match(hook.payload.secret, /^whsec_/);
const created = rpcs()[0].body;
assert.ok(!JSON.stringify(created).includes(hook.payload.secret));
assert.equal(decryptSecret(created.p_secret_ciphertext), hook.payload.secret);
const savedKey = process.env.ARANDU_WEBHOOK_SECRET_KEY;
delete process.env.ARANDU_WEBHOOK_SECRET_KEY;
await rejects('POST', 'webhooks', { organization_id: ORG, url: 'https://erp.example.com/hook', events: ['rfq.created'] }, 503);
process.env.ARANDU_WEBHOOK_SECRET_KEY = savedKey;

// Leitura das credenciais nunca pede o hash.
sent = [];
await call('GET', `service-accounts?organization_id=${ORG}`);
const credentialRead = sent.find((entry) => entry.url.includes('fin_api_credentials?'));
assert.ok(credentialRead && !credentialRead.url.includes('token_hash'), 'leitura pediu o hash');
const endpointRead = (await (async () => { sent = []; await call('GET', `webhooks?organization_id=${ORG}`); return sent.find((entry) => entry.url.includes('fin_webhook_endpoints?')); })());
assert.ok(endpointRead && !endpointRead.url.includes('secret'), 'leitura pediu o segredo cifrado');

// "Enviar agora": service role só para o worker, filtrado pela organização.
responder = () => [];
sent = [];
const dispatched = await call('POST', 'webhooks/dispatch', { organization_id: ORG });
assert.equal(dispatched.statusCode, 200);
const claim = sent.find((entry) => entry.url.includes('rpc/fin_webhook_claim'));
assert.equal(claim.apikey, 'service-role-test');
assert.equal(claim.body.p_org, ORG);
assert.ok(sent.filter((entry) => entry.apikey === 'service-role-test').every((entry) => /rpc\/fin_webhook_(claim|complete)/.test(entry.url)), 'service role fora do worker');
console.log('Integrações: admin exigido, token/segredo uma vez, banco só com hash/cifrado e service role restrito ao worker da própria organização.');

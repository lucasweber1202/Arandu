#!/usr/bin/env node
// Public API v1 & Webhooks: primitivas (token, impressão, cursor, assinatura,
// cifragem, SSRF), borda da API (envelopes, autenticação, limites, paginação,
// idempotência), worker de entrega e administração. O banco é provado em
// tests/database/financial-public-api.sql.
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHash, randomBytes } from 'node:crypto';
import {
  generateApiToken, hashToken, bearerToken, correlationId, canonicalJson, requestFingerprint, encodeCursor, decodeCursor, pageSize, paginate,
  signWebhook, verifyWebhook, encryptSecret, decryptSecret, isBlockedAddress, validWebhookUrl, generateWebhookSecret, API_SCOPES, WEBHOOK_EVENTS
} from '../lib/finance/public-api.mjs';
import { handlePublicApi } from '../lib/api/domains/public-api.mjs';
import { dispatchWebhooks } from '../lib/finance/webhook-dispatch.mjs';
import { handleFinanceJobs } from '../lib/api/domains/finance-jobs.mjs';

process.env.SUPABASE_URL = 'https://example.invalid';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
const KEY_ENV = { ARANDU_WEBHOOK_SECRET_KEY: randomBytes(32).toString('base64') };

// ------------------------------------------------------------ primitivas
const issued = generateApiToken({ ARANDU_ENV: 'pilot' });
assert.match(issued.token, /^arnd_pilot_[A-Za-z0-9]{43}$/);
assert.equal(issued.hash, createHash('sha256').update(issued.token).digest('hex'));
assert.equal(issued.prefix, issued.token.slice(0, 'arnd_pilot_'.length + 6));
assert.notEqual(generateApiToken().token, generateApiToken().token);
assert.equal(bearerToken(`Bearer ${issued.token}`), issued.token);
for (const header of ['', 'Basic abc', `Bearer ${issued.token}x<`, 'Bearer arnd_pilot_short', `bearer${issued.token}`]) assert.equal(bearerToken(header), null, header);
assert.equal(correlationId('erp-run-0001'), 'erp-run-0001');
assert.match(correlationId('<script>'), /^[0-9a-f-]{36}$/);
assert.equal(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
assert.equal(requestFingerprint('post', '/v1/rfqs', { b: 1, a: 2 }), requestFingerprint('POST', '/v1/rfqs', { a: 2, b: 1 }), 'ordem das chaves não muda a impressão');
assert.notEqual(requestFingerprint('POST', '/v1/rfqs', { a: 2 }), requestFingerprint('POST', '/v1/rfqs', { a: 3 }));
const cursor = encodeCursor({ c: '2026-10-01T00:00:00Z', i: 'x' });
assert.deepEqual(decodeCursor(cursor, ['c', 'i']), { c: '2026-10-01T00:00:00Z', i: 'x' });
assert.equal(decodeCursor('nao-e-cursor', ['c', 'i']), undefined);
assert.equal(decodeCursor(encodeCursor({ c: 1 }), ['c', 'i']), undefined);
assert.equal(pageSize(undefined), 25); assert.equal(pageSize('100'), 100); assert.equal(pageSize('101'), null); assert.equal(pageSize('0'), null); assert.equal(pageSize('2.5'), null);
assert.deepEqual(paginate([{ id: 1 }, { id: 2 }, { id: 3 }], 2, (row) => ({ i: String(row.id) })).page.next_cursor, encodeCursor({ i: '2' }));
assert.equal(paginate([{ id: 1 }], 2, () => ({})).page.has_more, false);
assert.equal(API_SCOPES.length, 7); assert.equal(WEBHOOK_EVENTS.length, 8);

// Assinatura: cobre timestamp + delivery id + corpo; janela de 5 min.
const secret = generateWebhookSecret();
const now = Date.parse('2026-10-03T12:00:00Z');
const body = '{"id":"evt","type":"rfq.created"}';
const header = signWebhook(secret, { timestamp: now / 1000, deliveryId: 'd1', body });
assert.deepEqual(verifyWebhook(secret, { header, deliveryId: 'd1', body, now }), { ok: true });
assert.equal(verifyWebhook(secret, { header, deliveryId: 'd1', body: body.replace('evt', 'evx'), now }).reason, 'signature_mismatch');
assert.equal(verifyWebhook(secret, { header, deliveryId: 'd2', body, now }).reason, 'signature_mismatch', 'delivery id faz parte da assinatura');
assert.equal(verifyWebhook(secret, { header, deliveryId: 'd1', body, now: now + 301000 }).reason, 'timestamp_out_of_tolerance');
assert.equal(verifyWebhook('outro', { header, deliveryId: 'd1', body, now }).reason, 'signature_mismatch');
assert.equal(verifyWebhook(secret, { header: 'v1=abc', deliveryId: 'd1', body, now }).reason, 'malformed');

// Segredo cifrado; rotação de chave; sem chave não cifra.
const sealed = encryptSecret(secret, KEY_ENV);
assert.match(sealed, /^v1\./);
assert.ok(!sealed.includes(secret));
assert.equal(decryptSecret(sealed, KEY_ENV), secret);
const rotated = { ARANDU_WEBHOOK_SECRET_KEY: randomBytes(32).toString('base64'), ARANDU_WEBHOOK_SECRET_KEY_PREVIOUS: KEY_ENV.ARANDU_WEBHOOK_SECRET_KEY };
assert.equal(decryptSecret(sealed, rotated), secret, 'chave anterior decifra durante a rotação');
assert.throws(() => decryptSecret(sealed, { ARANDU_WEBHOOK_SECRET_KEY: randomBytes(32).toString('base64') }), /secret unavailable/);
assert.throws(() => encryptSecret('x', {}), /unconfigured/);
{
  const [version, iv, tag, text] = sealed.split('.');
  const flipped = Buffer.from(tag, 'base64url'); flipped[0] ^= 0xff;
  assert.throws(() => decryptSecret([version, iv, flipped.toString('base64url'), text].join('.'), KEY_ENV), /secret unavailable/, 'tag adulterada');
  const body = Buffer.from(text, 'base64url'); body[0] ^= 0xff;
  assert.throws(() => decryptSecret([version, iv, tag, body.toString('base64url')].join('.'), KEY_ENV), /secret unavailable/, 'ciphertext adulterado');
}

// SSRF.
for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.10', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1', 'not-an-ip']) {
  assert.equal(isBlockedAddress(address), true, address);
}
for (const address of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) assert.equal(isBlockedAddress(address), false, address);
for (const url of ['https://erp.example.com/hook', 'https://erp.example.com:443/a?b=1']) assert.equal(validWebhookUrl(url), true, url);
for (const url of ['http://erp.example.com/hook', 'https://localhost/x', 'https://10.0.0.1/x', 'https://8.8.8.8/x', 'https://u:p@erp.example.com/', 'https://erp.example.com:8443/', 'https://intranet/x', 'https://a.internal/x', 'ftp://x.y/z']) {
  assert.equal(validWebhookUrl(url), false, url);
}

// ------------------------------------------------------------ borda da API v1
function request(method, url, { body = null, headers = {} } = {}) {
  return Object.assign(Readable.from(body ? [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))] : []), { method, url, headers });
}
async function call(method, route, { body = null, headers = {}, rpc = async () => [], rateLimit = async () => {}, env = KEY_ENV } = {}) {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.payload = JSON.parse(value); } };
  await handlePublicApi(request(method, `/api/v1/${route}`, { body, headers }), res, route.split('?')[0], { rpc, rateLimit, env });
  return res;
}
const AUTH = { authorization: `Bearer ${issued.token}` };

let res = await call('GET', '');
assert.equal(res.statusCode, 200); assert.equal(res.payload.version, 'v1');
res = await call('GET', 'rfqs');
assert.equal(res.statusCode, 401);
assert.equal(res.payload.error.code, 'unauthorized');
assert.equal(res.headers['WWW-Authenticate'], 'Bearer realm="arandu"');
assert.match(res.headers['X-Correlation-Id'], /^[0-9a-f-]{36}$/);
assert.equal(res.payload.error.correlation_id, res.headers['X-Correlation-Id']);
assert.equal(res.headers['Arandu-Api-Version'], 'v1');
assert.equal(res.headers['Cache-Control'], 'no-store');

// O banco recebe o hash, nunca o token.
let seen = [];
const recorder = (handler) => async (name, args) => { seen.push([name, args]); return handler(name, args); };
const rows = [{ id: 'r3', created_at: '2026-10-03T03:00:00Z' }, { id: 'r2', created_at: '2026-10-03T02:00:00Z' }, { id: 'r1', created_at: '2026-10-03T01:00:00Z' }];
res = await call('GET', 'rfqs?limit=2&status=collecting', { headers: { ...AUTH, 'x-correlation-id': 'erp-run-0001' }, rpc: recorder(() => rows) });
assert.equal(res.statusCode, 200);
assert.equal(res.payload.data.length, 2);
assert.equal(res.payload.page.has_more, true);
assert.equal(res.headers['X-Correlation-Id'], 'erp-run-0001');
assert.deepEqual(seen[0], ['fin_api_list_rfqs', { p_key_hash: issued.hash, p_limit: 2, p_after_created: null, p_after_id: null, p_status: 'collecting', p_entity: null, p_updated_since: null }]);
assert.ok(!JSON.stringify(seen).includes(issued.token), 'token não sai da borda');
seen = [];
await call('GET', `rfqs?limit=2&cursor=${res.payload.page.next_cursor}`, { headers: AUTH, rpc: recorder(() => []) });
assert.equal(seen[0][1].p_after_id, 'r2');
assert.equal(seen[0][1].p_after_created, '2026-10-03T02:00:00Z');
for (const [route, code] of [['rfqs?limit=500', 'invalid_query'], ['rfqs?cursor=xyz', 'invalid_query'], ['rfqs?organization_id=x', 'invalid_query'], ['rfqs?legal_entity_id=1', 'invalid_query'],
  ['rfqs?updated_since=ontem', 'invalid_query'], ['nada', 'route_not_found']]) {
  res = await call('GET', route, { headers: AUTH });
  assert.equal(res.payload.error.code, code, route);
}
// Erros nomeados do banco viram contrato estável; o resto, 500 sem detalhe.
for (const [message, status, code] of [['api scope denied', 403, 'insufficient_scope'], ['api unauthorized', 401, 'unauthorized'], ['api not found', 404, 'not_found'],
  ['api entity denied', 403, 'entity_forbidden'], ['idempotency key reuse', 422, 'idempotency_key_reuse']]) {
  res = await call('GET', 'contracts', { headers: AUTH, rpc: async () => { throw new Error(`${message} (relation fin_api_credentials)`); } });
  assert.equal(res.statusCode, status, message); assert.equal(res.payload.error.code, code);
  assert.doesNotMatch(JSON.stringify(res.payload), /fin_api|relation fin/);
}
const quiet = console.error; console.error = () => {};
res = await call('GET', 'contracts', { headers: AUTH, rpc: async () => { throw new Error('syntax error at or near "select" fin_contracts'); } });
console.error = quiet;
assert.equal(res.statusCode, 500); assert.equal(res.payload.error.code, 'internal_error');
assert.doesNotMatch(JSON.stringify(res.payload), /syntax|fin_contracts/);
// Limite por credencial e falha fechada do contador.
res = await call('GET', 'rfqs', { headers: AUTH, rateLimit: async () => { throw Object.assign(new Error('x'), { code: 'rate_limit_exceeded' }); } });
assert.equal(res.statusCode, 429); assert.equal(res.headers['Retry-After'], '60');
res = await call('GET', 'rfqs', { headers: AUTH, rateLimit: async () => { throw Object.assign(new Error('x'), { code: 'rate_limit_unavailable' }); } });
assert.equal(res.statusCode, 503);

// Escrita: Idempotency-Key obrigatória, allowlist de campos e de demanda.
const OWNER = '00000000-0000-4000-8000-000000000301';
const valid = { product: 'credit', title: 'Capital de giro via ERP', demand: { amount: 500000, purpose: 'capital_de_giro', term_months: 24 }, owner_id: OWNER };
res = await call('POST', 'rfqs', { headers: AUTH, body: valid });
assert.equal(res.payload.error.code, 'idempotency_key_required');
res = await call('POST', 'rfqs', { headers: { ...AUTH, 'idempotency-key': 'erp-0001-x' }, body: { ...valid, status: 'decided' } });
assert.equal(res.statusCode, 422); assert.match(res.payload.error.message, /status/);
res = await call('POST', 'rfqs', { headers: { ...AUTH, 'idempotency-key': 'erp-0001-x' }, body: { ...valid, demand: { amount: -1, rating: 'AAA' } } });
assert.equal(res.statusCode, 422); assert.ok(res.payload.error.details.length >= 1);
res = await call('POST', 'rfqs', { headers: { ...AUTH, 'idempotency-key': 'erp-0001-x' }, body: '[1,2]' });
assert.equal(res.payload.error.code, 'invalid_json');
seen = [];
res = await call('POST', 'rfqs', { headers: { ...AUTH, 'idempotency-key': 'erp-0001-x' }, body: valid, rpc: recorder(() => ({ id: 'n1', status: 'draft' })) });
assert.equal(res.statusCode, 201);
assert.equal(seen[0][0], 'fin_api_create_rfq');
assert.equal(seen[0][1].p_fingerprint, requestFingerprint('POST', '/v1/rfqs', valid));
assert.deepEqual(seen[0][1].p_payload.demand, { amount: 500000, purpose: 'capital_de_giro', term_months: 24 });
res = await call('POST', 'rfqs', { headers: { ...AUTH, 'idempotency-key': 'erp-0001-x' }, body: valid, rpc: async () => ({ id: 'n1', status: 'draft', idempotent_replay: true }) });
assert.equal(res.statusCode, 200); assert.equal(res.headers['Idempotent-Replayed'], 'true'); assert.equal(res.payload.data.idempotent_replay, undefined);

// Webhooks: URL pública, segredo uma vez, banco recebe só o cifrado.
res = await call('POST', 'webhooks', { headers: AUTH, body: { url: 'https://10.0.0.1/hook', events: ['rfq.created'] } });
assert.equal(res.payload.error.code, 'invalid_webhook');
res = await call('POST', 'webhooks', { headers: AUTH, body: { url: 'https://erp.example.com/hook', events: ['rfq.created'] }, env: {} });
assert.equal(res.statusCode, 503); assert.equal(res.payload.error.code, 'webhook_secrets_unconfigured');
seen = [];
res = await call('POST', 'webhooks', { headers: AUTH, body: { url: 'https://erp.example.com/hook', events: ['rfq.created', 'rfq.created'] }, rpc: recorder(() => 'w1') });
assert.equal(res.statusCode, 201);
assert.match(res.payload.data.secret, /^whsec_/);
assert.deepEqual(seen[0][1].p_events, ['rfq.created']);
assert.ok(!seen[0][1].p_secret_ciphertext.includes(res.payload.data.secret));
assert.equal(decryptSecret(seen[0][1].p_secret_ciphertext, KEY_ENV), res.payload.data.secret);
res = await call('POST', 'webhooks/00000000-0000-4000-8000-000000000401/deliveries/00000000-0000-4000-8000-000000000402/replay', { headers: AUTH, rpc: async () => 'new' });
assert.equal(res.statusCode, 202);

// ------------------------------------------------------------ worker
const sealedSecret = encryptSecret(secret, KEY_ENV);
const row = (extra = {}) => ({ delivery_id: 'd1', lease_token: 'l1', endpoint_id: 'e1', url: 'https://erp.example.com/hook', secret_ciphertext: sealedSecret, event_id: 'evt1',
  event_type: 'rfq.created', organization_id: 'o1', legal_entity_id: null, occurred_at: '2026-10-03T12:00:00Z', payload: { object: 'rfq', data: { rfq_id: 'r1', status: 'draft' } }, attempt: 1, ...extra });
async function runDispatch(claimRows, { fetchImpl, lookup = async () => [{ address: '93.184.216.34', family: 4 }] } = {}) {
  const completed = [];
  const out = await dispatchWebhooks({ env: KEY_ENV, lookup, now: () => now, fetchImpl,
    rpc: async (name, args) => { if (name === 'fin_webhook_claim') return claimRows; completed.push(args); return args.p_success ? 'succeeded' : 'failed'; } });
  return { out, completed };
}
let sent = null;
let result = await runDispatch([row()], { fetchImpl: async (url, init) => { sent = { url, init }; return new Response(null, { status: 204 }); } });
assert.equal(result.out.succeeded, 1);
assert.equal(sent.init.redirect, 'manual');
assert.equal(verifyWebhook(secret, { header: sent.init.headers['Arandu-Signature'], deliveryId: 'd1', body: sent.init.body, now }).ok, true, 'receptor verifica a assinatura');
assert.deepEqual(JSON.parse(sent.init.body).data, { rfq_id: 'r1', status: 'draft' });
assert.equal(JSON.parse(sent.init.body).delivery.id, 'd1');
assert.deepEqual(result.completed[0], { p_delivery: 'd1', p_lease: 'l1', p_success: true, p_status_code: 204, p_error_code: null });
let fetched = false;
result = await runDispatch([row()], { lookup: async () => [{ address: '10.0.0.5', family: 4 }], fetchImpl: async () => { fetched = true; return new Response(null); } });
assert.equal(fetched, false, 'DNS para endereço interno bloqueia antes do envio');
assert.equal(result.completed[0].p_error_code, 'ssrf_blocked');
for (const [status, code] of [[500, 'http_5xx'], [404, 'http_4xx'], [302, 'http_3xx']]) {
  result = await runDispatch([row()], { fetchImpl: async () => new Response(null, { status }) });
  assert.equal(result.completed[0].p_error_code, code); assert.equal(result.completed[0].p_status_code, status);
}
result = await runDispatch([row()], { fetchImpl: async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); } });
assert.equal(result.completed[0].p_error_code, 'timeout');
result = await runDispatch([row({ secret_ciphertext: 'v1.a.b.c' })], { fetchImpl: async () => new Response(null) });
assert.equal(result.completed[0].p_error_code, 'secret_unavailable');
result = await runDispatch([row({ url: 'http://erp.example.com/hook' })], { fetchImpl: async () => new Response(null) });
assert.equal(result.completed[0].p_error_code, 'invalid_url');

// Job de webhooks: só com o segredo do cron; execução registrada.
const cronSecret = 's'.repeat(40);
const jobCalls = [];
const jobRes = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.payload = JSON.parse(value); } });
let out = jobRes();
await handleFinanceJobs({ method: 'GET', headers: {} }, out, 'webhooks', { env: { CRON_SECRET: cronSecret }, rpc: async (name, args) => { jobCalls.push([name, args]); return []; }, databaseReady: () => true });
assert.equal(out.statusCode, 401); assert.equal(jobCalls.length, 0);
out = jobRes();
await handleFinanceJobs({ method: 'GET', headers: { authorization: `Bearer ${cronSecret}` } }, out, 'webhooks', { env: { CRON_SECRET: cronSecret, ...KEY_ENV }, rpc: async (name, args) => { jobCalls.push([name, args]); return name === 'fin_api_purge_idempotency' ? 3 : name === 'fin_job_begin' ? { run_id: 'run', lease_token: 'lease' } : name === 'fin_job_finish' ? true : []; }, databaseReady: () => true, now: () => new Date(now) });
assert.equal(out.statusCode, 200);
assert.equal(out.payload.idempotency_purged, 3);
assert.ok(jobCalls.some(([name, args]) => name === 'fin_job_finish' && args.p_status === 'succeeded'));
console.log('Public API v1 & Webhooks: token por hash, envelopes estáveis, limites, keyset, idempotência, assinatura com anti-replay, cifragem com rotação, SSRF e worker aprovados.');

// Contrato publicado: cada rota tratada pela borda está no OpenAPI e vice-versa.
{
  const { readFileSync } = await import('node:fs');
  const spec = JSON.parse(readFileSync('docs/openapi/arandu-public-api-v1.json', 'utf8'));
  const documented = Object.entries(spec.paths).flatMap(([path, methods]) => Object.keys(methods).map((method) => `${method.toUpperCase()} ${path}`)).sort();
  const implemented = ['GET /me', 'GET /rfqs', 'POST /rfqs', 'GET /rfqs/{id}', 'GET /contracts', 'GET /contracts/{id}', 'GET /providers', 'GET /portfolio/facilities', 'GET /approvals',
    'GET /webhooks', 'POST /webhooks', 'DELETE /webhooks/{id}', 'GET /webhooks/{id}/deliveries', 'POST /webhooks/{id}/deliveries/{delivery}/replay'].sort();
  assert.deepEqual(documented, implemented);
  const source = readFileSync('lib/api/domains/public-api.mjs', 'utf8');
  for (const scope of API_SCOPES) assert.ok(JSON.stringify(spec).includes(scope), `escopo ${scope} fora do contrato`);
  for (const rpcName of ['fin_api_whoami', 'fin_api_list_rfqs', 'fin_api_get_rfq', 'fin_api_create_rfq', 'fin_api_list_contracts', 'fin_api_get_contract', 'fin_api_list_providers',
    'fin_api_list_facilities', 'fin_api_list_approvals', 'fin_api_list_webhooks', 'fin_api_create_webhook', 'fin_api_disable_webhook', 'fin_api_list_deliveries', 'fin_api_replay_delivery']) {
    assert.ok(source.includes(`'${rpcName}'`), `${rpcName} sem rota`);
  }
  console.log('OpenAPI v1: rotas implementadas e documentadas coincidem.');
}

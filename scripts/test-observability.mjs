import assert from 'node:assert/strict';
import { reportError, safeErrorEvent } from '../lib/observability.mjs';

const event = safeErrorEvent({
  service: 'arandu-test',
  requestId: 'request-1',
  route: '/api/test',
  status: 503,
  error: new Error('Falha controlada'),
  email: 'nao-persistir@example.com',
  token: 'nao-persistir'
});
assert.equal(event.service, 'arandu-test');
assert.equal(event.status, 503);
assert.equal(event.email, undefined);
assert.equal(event.token, undefined);
assert.equal(JSON.stringify(event).includes('nao-persistir'), false);

process.env.ARANDU_ERROR_MONITORING_ENDPOINT = 'http://inseguro.example.com';
const insecure = await reportError({ service: 'arandu-test', status: 500, error: new Error('x') });
assert.equal(insecure.delivered, false);
assert.equal(insecure.reason, 'insecure_endpoint');

process.env.ARANDU_ERROR_MONITORING_ENDPOINT = 'https://monitor.example.com/events';
let delivered = null;
const result = await reportError(
  { service: 'arandu-test', requestId: 'request-2', status: 500, error: new Error('erro') },
  { fetchImpl: async (_url, options) => {
    delivered = JSON.parse(options.body);
    return new Response(null, { status: 202 });
  } }
);
assert.equal(result.delivered, true);
assert.equal(delivered.requestId, 'request-2');
delete process.env.ARANDU_ERROR_MONITORING_ENDPOINT;

// /api/health devolve o identificador recebido (ou gera um) para rastreio no log.
const { default: health } = await import('../api/health.js');
for (const [incoming, expected] of [['canario-obs-0001', 'canario-obs-0001'], [undefined, null]]) {
  const headers = new Map();
  health({ method: 'GET', headers: incoming ? { 'x-request-id': incoming } : {} }, { setHeader: (k, v) => headers.set(k, v), end() {} });
  const id = headers.get('X-Request-ID');
  if (expected) assert.equal(id, expected);
  else assert.match(String(id), /^[A-Za-z0-9-]{8,}$/);
}

console.log('Arandu Observability Tests');
console.log('Redação, transporte HTTPS e falha fechada validados.');

// Identidade pública: uma projeção da política única, nunca dump do ambiente.
const { releaseIdentity } = await import('../lib/runtime-mode.mjs');
for (const [environment, mode] of [['demo', 'demo'], ['pilot', 'staging'], ['production', 'official']]) {
  assert.deepEqual(releaseIdentity({ ARANDU_ENV: environment, VERCEL_GIT_COMMIT_REF: 'main', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), SUPABASE_SERVICE_ROLE_KEY: 'segredo' }),
    { environment, mode, datasource: 'supabase', misconfigured: false, branch: 'main', commit: 'a'.repeat(40) });
}
const invalid = releaseIdentity({ ARANDU_ENV: 'segredo', VERCEL_GIT_COMMIT_REF: 'segredo', VERCEL_GIT_COMMIT_SHA: 'segredo' });
assert.equal(invalid.misconfigured, true);
assert.equal(JSON.stringify(invalid).includes('segredo'), false);
assert.equal(releaseIdentity({ ARANDU_DEPLOYMENT_KIND: 'demo' }).datasource, 'synthetic-fixtures');
for (const method of ['GET', 'HEAD', 'POST']) {
  const headers = new Map(); let body;
  const res = { setHeader: (k, v) => headers.set(k, v), end(value) { body = value; } };
  health({ method, headers: {} }, res);
  assert.equal(res.statusCode, method === 'POST' ? 405 : 200);
  if (method === 'HEAD') assert.equal(body, undefined);
  if (method === 'GET') assert.deepEqual(JSON.parse(body).release, releaseIdentity());
}

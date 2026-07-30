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

console.log('Arandu Observability Tests');
console.log('Redação, transporte HTTPS e falha fechada validados.');

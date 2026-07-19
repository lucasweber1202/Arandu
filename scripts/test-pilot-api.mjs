import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

process.env.SUPABASE_URL = 'https://arandu-pilot-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-pilot-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-pilot-test';
process.env.ARANDU_ADMIN_TOKEN = 'admin-pilot-test';
process.env.ARANDU_PILOT_ENABLED = 'true';
process.env.ARANDU_PILOT_ACCESS_CODE = 'convite-piloto-2026';
process.env.ARANDU_PILOT_SECRET = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';

const { default: handler } = await import(`../api/[...path].js?pilot-test=${Date.now()}`);

function request(method, url, body, headers = {}) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  stream.method = method;
  stream.url = url;
  stream.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  stream.socket = { remoteAddress: '127.0.0.3' };
  return stream;
}

function response() {
  return { statusCode: 0, headers: {}, body: '', setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; }, end(value = '') { this.body = String(value); } };
}

async function call(method, url, body, headers) {
  const res = response();
  await handler(request(method, url, body, headers), res);
  return { status: res.statusCode, headers: res.headers, body: JSON.parse(res.body) };
}

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const originalFetch = global.fetch;

try {
  const invalid = await call('POST', '/api/pilot/access', { code: 'incorreto' });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.code, 'pilot_invalid_code');

  const access = await call('POST', '/api/pilot/access', { code: 'convite-piloto-2026' });
  assert.equal(access.status, 200);
  assert.match(access.headers['set-cookie'], /HttpOnly/);
  const pilotCookie = access.headers['set-cookie'].split(';')[0];

  const session = await call('GET', '/api/pilot/session', undefined, { cookie: pilotCookie });
  assert.equal(session.status, 200);
  assert.equal(session.body.authenticated, true);

  let eventRecord = null;
  global.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/rest\/v1\/pilot_events$/);
    eventRecord = JSON.parse(options.body);
    return new Response(null, { status: 201 });
  };
  const event = await call('POST', '/api/events', {
    sessionId: '123e4567-e89b-42d3-a456-426614174000',
    eventType: 'selection_add',
    path: '/obra.html',
    payload: { artworkId: 'obra-1', email: 'nao-deve@persistir.test', queryLength: 14 }
  }, { cookie: pilotCookie });
  assert.equal(event.status, 201);
  assert.equal(eventRecord.payload.artworkId, 'obra-1');
  assert.equal(eventRecord.payload.queryLength, 14);
  assert.equal(eventRecord.payload.email, undefined);

  let feedbackRecord = null;
  global.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/rest\/v1\/pilot_feedback$/);
    feedbackRecord = JSON.parse(options.body);
    return new Response(null, { status: 201 });
  };
  const feedback = await call('POST', '/api/pilot/feedback', {
    sessionId: '123e4567-e89b-42d3-a456-426614174000', task: 'catalog', rating: 4, message: 'Busca clara.', contactAllowed: true
  }, { cookie: pilotCookie });
  assert.equal(feedback.status, 201);
  assert.equal(feedbackRecord.rating, 4);
  assert.equal(feedbackRecord.contact_allowed, true);

  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('pilot_events?')) return json([{ session_id: '123e4567-e89b-42d3-a456-426614174000', event_type: 'page_view' }, { session_id: '123e4567-e89b-42d3-a456-426614174000', event_type: 'selection_add' }]);
    if (value.includes('pilot_feedback?')) return json([{ session_id: '123e4567-e89b-42d3-a456-426614174000', rating: 4 }]);
    throw new Error(`URL inesperada: ${value}`);
  };
  const metrics = await call('GET', '/api/pilot/metrics', undefined, { 'x-arandu-admin-token': 'admin-pilot-test' });
  assert.equal(metrics.status, 200);
  assert.equal(metrics.body.metrics.unique_sessions, 1);
  assert.equal(metrics.body.metrics.average_rating, 4);
  assert.equal(metrics.body.metrics.event_selection_add, 1);

  process.env.ARANDU_PILOT_ENABLED = 'false';
  const disabledSession = await call('GET', '/api/pilot/session');
  assert.equal(disabledSession.status, 200);
  assert.equal(disabledSession.body.enabled, false);
  assert.equal(disabledSession.body.authenticated, false);

  console.log('Arandu Pilot API Contract Tests');
  console.log('7 cenários aprovados.');
} finally {
  global.fetch = originalFetch;
}

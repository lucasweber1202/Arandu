import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { configureTestCommercialPolicy } from './test-helpers/commercial-policy-env.mjs';

process.env.SUPABASE_URL = 'https://arandu-transactions-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-transactions-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-transactions-test';
configureTestCommercialPolicy();
delete process.env.VERCEL_ENV;
delete process.env.ARANDU_DISTRIBUTED_RATE_LIMIT;

const { default: handler } = await import(`../api/[...path].js?transactions=${Date.now()}`);

function req(method, url, body, headers = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const request = Readable.from(chunks);
  request.method = method;
  request.url = url;
  request.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  request.socket = { remoteAddress: '127.0.0.41' };
  return request;
}

function res() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = '') { this.body = String(value); }
  };
}

async function call(method, url, body, headers) {
  const response = res();
  await handler(req(method, url, body, headers), response);
  return {
    status: response.statusCode,
    headers: response.headers,
    body: response.body ? JSON.parse(response.body) : null
  };
}

const responseJson = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' }
});
const originalFetch = global.fetch;

try {
  const calls = [];
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ value, body, headers: options.headers });
    if (value.includes('/rpc/acquire_idempotency')) return responseJson({ outcome: 'acquired' });
    if (value.includes('/rpc/create_reservation_atomic')) {
      assert.equal(body.p_artwork_id, 'obra-1');
      assert.equal(body.p_currency, 'BRL');
      assert.equal(body.p_policy_version, 'policy-test-v1');
      assert.equal(body.p_policy_snapshot.references.shipping, 'test-shipping-v1');
      assert.equal(body.p_policy_snapshot.references.packaging, 'test-packaging-v1');
      assert.equal('p_price' in body, false);
      return responseJson({ ok: true, stored: true, reservation: { id: 'reservation-1', status: 'requested' } });
    }
    if (value.includes('/rpc/create_proposal_atomic')) {
      assert.deepEqual(body.p_artwork_ids, ['obra-1', 'obra-2']);
      assert.equal(body.p_platform_fee_rate, 0.2);
      assert.equal(body.p_policy_snapshot.references.packaging, 'test-packaging-v1');
      assert.equal(body.p_policy_snapshot.approvalReference, 'test-approval-v1');
      assert.equal('p_total' in body, false);
      return responseJson({ ok: true, stored: true, proposal: { id: 'proposal-1', total: 7000 } });
    }
    throw new Error(`URL inesperada: ${value}`);
  };

  const reservation = await call('POST', '/api/reservations', {
    artwork_id: 'obra-1',
    name: 'Pessoa',
    whatsapp: '21999999999',
    price: 1,
    total: 1
  }, { 'Idempotency-Key': 'reservation-key-0001' });
  assert.equal(reservation.status, 201);
  assert.equal(reservation.body.reservation.id, 'reservation-1');

  const proposal = await call('POST', '/api/proposals', {
    client: 'Cliente',
    total: 1,
    platform_fee: 0,
    items: [
      { id: 'obra-1', price: 1, platform_fee: 0 },
      { id: 'obra-2', price: 1, artist_amount: 1 }
    ]
  }, { 'Idempotency-Key': 'proposal-key-0000001' });
  assert.equal(proposal.status, 201);
  assert.equal(proposal.body.proposal.total, 7000);
  assert.equal(calls.filter((item) => item.value.includes('/rpc/acquire_idempotency')).length, 2);

  const userCookie = Buffer.from(JSON.stringify({
    access_token: 'user-access-token',
    refresh_token: 'user-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600
  })).toString('base64url');
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) {
      assert.equal(options.headers.Authorization, 'Bearer user-access-token');
      return responseJson({ id: '11111111-1111-4111-8111-111111111111', email: 'user@example.com', user_metadata: {} });
    }
    if (value.includes('/rest/v1/saved_selections') || value.includes('/rest/v1/reservations')) {
      assert.equal(options.headers.apikey, 'anon-transactions-test');
      assert.equal(options.headers.Authorization, 'Bearer user-access-token');
      return responseJson([]);
    }
    throw new Error(`URL inesperada na conta: ${value}`);
  };
  const account = await call('GET', '/api/account', undefined, {
    cookie: `arandu_session=${encodeURIComponent(userCookie)}`
  });
  assert.equal(account.status, 200);
  assert.equal(account.body.user.id, '11111111-1111-4111-8111-111111111111');

  console.log('Arandu Transaction API Contract Tests');
  console.log('12 cenários aprovados.');
} finally {
  global.fetch = originalFetch;
}

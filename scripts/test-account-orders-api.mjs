import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

process.env.SUPABASE_URL = 'https://arandu-account-orders-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-account-orders-test';

const { default: handler } = await import(`../api/account-orders.js?test=${Date.now()}`);

function req(cookie) {
  const request = Readable.from([]);
  request.method = 'GET';
  request.url = '/api/account-orders';
  request.headers = { cookie };
  request.socket = { remoteAddress: '127.0.0.42' };
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

const userId = '11111111-1111-4111-8111-111111111111';
const cookieValue = Buffer.from(JSON.stringify({
  access_token: 'buyer-access-token',
  refresh_token: 'buyer-refresh-token',
  expires_at: Math.floor(Date.now() / 1000) + 3600
})).toString('base64url');
const originalFetch = global.fetch;

try {
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) {
      assert.equal(options.headers.Authorization, 'Bearer buyer-access-token');
      return new Response(JSON.stringify({ id: userId, email: 'buyer@example.com' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (value.includes('/rest/v1/orders?')) {
      assert.equal(options.headers.apikey, 'anon-account-orders-test');
      assert.equal(options.headers.Authorization, 'Bearer buyer-access-token');
      assert.equal(value.includes(`user_id=eq.${userId}`), true);
      assert.equal(value.includes('policy_snapshot'), false);
      assert.equal(value.includes('platform_fee'), false);
      assert.equal(value.includes('artist_amount'), false);
      return new Response(JSON.stringify([{
        id: 'order-1',
        order_number: 'ARANDU-20260807-ABC123',
        artwork_id: 'obra-1',
        artist_id: 'artista-1',
        reservation_id: 'reservation-1',
        price_snapshot: 2500,
        currency: 'BRL',
        status: 'confirmed',
        payment_status: 'paid',
        fulfillment_status: 'shipped',
        certificate_status: 'ready',
        tracking_code: 'TRACK-1',
        shipping_provider: 'Transportadora',
        created_at: '2026-08-07T00:00:00.000Z'
      }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`URL inesperada: ${value}`);
  };

  const response = res();
  await handler(req(`arandu_session=${encodeURIComponent(cookieValue)}`), response);
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.count, 1);
  assert.equal(body.orders[0].order_number, 'ARANDU-20260807-ABC123');
  assert.equal('policy_snapshot' in body.orders[0], false);
  assert.equal('platform_fee' in body.orders[0], false);
  assert.equal(response.headers['cache-control'].includes('no-store'), true);

  const anonymousResponse = res();
  await handler(req(''), anonymousResponse);
  assert.equal(anonymousResponse.statusCode, 401);

  console.log('Arandu Account Orders API Tests');
  console.log('Sessão, JWT/RLS e minimização de campos validados.');
} finally {
  global.fetch = originalFetch;
}

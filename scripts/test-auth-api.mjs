import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

process.env.SUPABASE_URL = 'https://arandu-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
process.env.ARANDU_ADMIN_TOKEN = 'admin-test-token';
process.env.ARANDU_COMMERCIAL_READY = 'true';

const { default: handler } = await import(`../api/[...path].js?test=${Date.now()}`);

function request(method, url, body, headers = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  req.socket = { remoteAddress: '127.0.0.1' };
  return req;
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = '') { this.body = String(value); }
  };
}

async function call(method, url, body, headers) {
  const res = response();
  await handler(request(method, url, body, headers), res);
  return { status: res.statusCode, headers: res.headers, body: res.body ? JSON.parse(res.body) : null };
}

function sessionCookie({ expired = false } = {}) {
  const value = Buffer.from(JSON.stringify({
    access_token: 'access-test',
    refresh_token: 'refresh-test',
    expires_at: Math.floor(Date.now() / 1000) + (expired ? -60 : 3600)
  })).toString('base64url');
  return `arandu_session=${encodeURIComponent(value)}`;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

const originalFetch = global.fetch;

try {
  global.fetch = async () => { throw new Error('Dashboard sem token não deve consultar o banco.'); };
  const dashboardDenied = await call('GET', '/api/dashboard');
  assert.equal(dashboardDenied.status, 401);

  let signupPayload = null;
  global.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/auth\/v1\/signup$/);
    signupPayload = JSON.parse(options.body);
    return jsonResponse({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      user: { id: 'user-123', email: signupPayload.email, user_metadata: signupPayload.data }
    });
  };
  const signup = await call('POST', '/api/auth/signup', {
    fullName: 'Compradora Teste',
    email: 'COMPRADORA@EXAMPLE.COM',
    password: 'senha-segura',
    profileType: 'admin'
  });
  assert.equal(signup.status, 201);
  assert.equal(signupPayload.email, 'compradora@example.com');
  assert.equal(signupPayload.data.profile_type, 'comprador');
  assert.match(signup.headers['set-cookie'], /HttpOnly/);

  global.fetch = async (url) => {
    assert.match(String(url), /select=public_token,status,items,briefing,created_at,updated_at/);
    return jsonResponse([{
      public_token: 'abcdefghijklmnop',
      status: 'sent',
      name: 'Não deve sair',
      email: 'privado@example.com',
      whatsapp: '5511999999999',
      items: [{ id: 'obra-1', title: 'Obra 1', url: 'javascript:alert(1)' }],
      briefing: { ambiente: 'Sala', nome: 'Pessoa', email: 'privado@example.com', whatsapp: '5511999999999' },
      created_at: '2026-07-17T00:00:00.000Z'
    }]);
  };
  const shared = await call('GET', '/api/selections?token=abcdefghijklmnop');
  assert.equal(shared.status, 200);
  assert.equal(shared.body.selection.name, undefined);
  assert.equal(shared.body.selection.email, undefined);
  assert.equal(shared.body.selection.whatsapp, undefined);
  assert.equal(shared.body.selection.briefing.nome, undefined);
  assert.equal(shared.body.selection.briefing.email, undefined);
  assert.equal(shared.body.selection.items[0].url, '');

  const accountDenied = await call('GET', '/api/account');
  assert.equal(accountDenied.status, 401);

  const accountQueries = [];
  global.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) {
      return jsonResponse({ id: 'user-123', email: 'compradora@example.com', user_metadata: { full_name: 'Compradora' } });
    }
    accountQueries.push(value);
    if (value.includes('/saved_selections?')) return jsonResponse([{ id: 'selection-1', public_token: 'abcdefghijklmnop', status: 'open', items: [{ id: 'obra-1', title: 'Obra 1' }], briefing: {} }]);
    if (value.includes('/reservations?')) return jsonResponse([{ id: 'reservation-1', artwork_id: 'obra-1', status: 'requested' }]);
    throw new Error(`URL inesperada: ${value}`);
  };
  const account = await call('GET', '/api/account', undefined, { cookie: sessionCookie() });
  assert.equal(account.status, 200);
  assert.equal(account.body.metrics.selections, 1);
  assert.equal(account.body.metrics.reservations, 1);
  assert.equal(accountQueries.length, 2);
  assert.ok(accountQueries.every((url) => url.includes('user_id=eq.user-123')));

  let reservationPayload = null;
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return jsonResponse({ id: 'user-123', email: 'compradora@example.com', user_metadata: { full_name: 'Compradora' } });
    if (value.includes('/rest/v1/reservations')) {
      reservationPayload = JSON.parse(options.body);
      return jsonResponse([{ id: 'reservation-2', artwork_id: reservationPayload.artwork_id, status: 'requested', user_id: reservationPayload.user_id, name: reservationPayload.name, whatsapp: reservationPayload.whatsapp }]);
    }
    throw new Error(`URL inesperada: ${value}`);
  };
  const reservation = await call('POST', '/api/reservations', { artwork_id: 'obra-2', name: 'Compradora', whatsapp: '(11) 99999-9999' }, { cookie: sessionCookie() });
  assert.equal(reservation.status, 201);
  assert.equal(reservationPayload.user_id, 'user-123');
  assert.equal(reservation.body.reservation.name, undefined);
  assert.equal(reservation.body.reservation.whatsapp, undefined);

  let deleteUrl = '';
  global.fetch = async (url, options = {}) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return jsonResponse({ id: 'user-123', email: 'compradora@example.com', user_metadata: {} });
    deleteUrl = value;
    assert.equal(options.method, 'DELETE');
    return jsonResponse([{ id: 'selection-1' }]);
  };
  const deleted = await call('DELETE', '/api/selections', undefined, { cookie: sessionCookie() });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, 1);
  assert.match(deleteUrl, /user_id=eq\.user-123/);
  assert.match(deleteUrl, /status=eq\.open/);

  global.fetch = async (url) => {
    assert.match(String(url), /grant_type=refresh_token/);
    return jsonResponse({
      access_token: 'refreshed-access',
      refresh_token: 'refreshed-refresh',
      expires_in: 3600,
      user: { id: 'user-123', email: 'compradora@example.com', user_metadata: {} }
    });
  };
  const refreshed = await call('GET', '/api/auth/session', undefined, { cookie: sessionCookie({ expired: true }) });
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.authenticated, true);
  const refreshedCookieValue = decodeURIComponent(refreshed.headers['set-cookie'].split(';')[0].split('=').slice(1).join('='));
  const refreshedSession = JSON.parse(Buffer.from(refreshedCookieValue, 'base64url').toString('utf8'));
  assert.equal(refreshedSession.access_token, 'refreshed-access');

  global.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/auth\/v1\/logout$/);
    assert.equal(options.headers.Authorization, 'Bearer access-test');
    return new Response(null, { status: 204 });
  };
  const logout = await call('POST', '/api/auth/logout', undefined, { cookie: sessionCookie() });
  assert.equal(logout.status, 200);
  assert.equal(logout.body.authenticated, false);
  assert.match(logout.headers['set-cookie'], /Max-Age=0/);

  const invalidJson = await call('POST', '/api/auth/login', '{invalido');
  assert.equal(invalidJson.status, 400);
  assert.equal(invalidJson.body.error, 'JSON inválido.');

  console.log('Arandu Auth API Contract Tests');
  console.log('10 cenários aprovados.');
} finally {
  global.fetch = originalFetch;
}

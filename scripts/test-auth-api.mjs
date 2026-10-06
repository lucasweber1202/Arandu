import assert from 'node:assert/strict';
import { Readable } from 'node:stream';

const originalVercelEnv = process.env.VERCEL_ENV;
const originalDistributedRateLimit = process.env.ARANDU_DISTRIBUTED_RATE_LIMIT;

// Keep API contract tests deterministic; distributed limiting has its own tests.
delete process.env.VERCEL_ENV;
delete process.env.ARANDU_DISTRIBUTED_RATE_LIMIT;

process.env.SUPABASE_URL = 'https://arandu-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';

// SSO (P0.9): nestes cenários o domínio não exige SSO, então a consulta de
// exigência responde "senha permitida"; os demais mocks seguem como antes. A
// exigência (403 sso_required) e a falha fechada têm teste próprio
// (scripts/test-finance-sso.mjs).
let currentFetch = globalThis.fetch;
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  get: () => async (url, init) => (String(url).includes('/rpc/fin_sso_password_allowed')
    ? new Response('true', { status: 200, headers: { 'Content-Type': 'application/json' } })
    : currentFetch(url, init)),
  set: (fn) => { currentFetch = fn; }
});

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

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const originalFetch = global.fetch;

try {
  // A antiga vertical de arte não tem handler: as rotas respondem 404 de rota
  // inexistente sem consultar banco nem provedor de identidade.
  global.fetch = async () => { throw new Error('Rota aposentada não deve consultar o banco.'); };
  const retiredRoutes = [
    ['GET', '/api/dashboard'], ['GET', '/api/account'], ['POST', '/api/reservations'], ['DELETE', '/api/selections'],
    ['POST', '/api/forms'], ['POST', '/api/proposals'], ['GET', '/api/catalog'], ['GET', '/api/artists'],
    ['GET', '/api/certificates?code=ABCD'], ['GET', '/api/certificate-document?code=ABCD'], ['GET', '/api/public-config'],
    ['POST', '/api/events'], ['POST', '/api/conversion-events'], ['GET', '/api/pilot/status'], ['GET', '/api/privacy/export'],
    ['GET', '/api/catalog-review'], ['GET', '/api/admin'], ['POST', '/api/admin-update'], ['GET', '/api/operational'],
    ['POST', '/api/media'], ['GET', '/api/portal/artist'], ['GET', '/api/artist-accounts'], ['GET', '/api/admin/quality']
  ];
  for (const [method, url] of retiredRoutes) {
    const retired = await call(method, url, method === 'GET' ? undefined : {}, { cookie: sessionCookie() });
    assert.equal(retired.status, 404, `${method} ${url}`);
    assert.equal(retired.body.code, 'route_not_found', `${method} ${url}`);
  }

  // A API financeira exige sessão antes de qualquer consulta.
  const financeDenied = await call('GET', '/api/finance/me');
  assert.equal(financeDenied.status, 401);

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

  // Regressão de enumeração de usuários: "Email not confirmed" só é devolvido
  // pelo Supabase para e-mails cadastrados. Se a mensagem chegar ao cliente,
  // basta comparar as respostas para descobrir quem tem conta na Arandu.
  const loginFailures = [
    { status: 400, payload: { error_description: 'Invalid login credentials' } },
    { status: 400, payload: { error_code: 'email_not_confirmed', msg: 'Email not confirmed' } },
    { status: 400, payload: { error_code: 'invalid_credentials', msg: 'Invalid login credentials' } }
  ];
  const loginResponses = [];
  for (const failure of loginFailures) {
    global.fetch = async () => jsonResponse(failure.payload, failure.status);
    loginResponses.push(await call('POST', '/api/auth/login', {
      email: `enumeracao-${loginResponses.length}@example.com`,
      password: 'senha-que-nao-serve'
    }));
  }
  for (const response of loginResponses) {
    assert.equal(response.status, 401);
    assert.equal(response.body.error, 'E-mail ou senha incorretos.');
    assert.equal(response.body.code, 'invalid_credentials');
  }
  assert.equal(new Set(loginResponses.map((item) => `${item.status}:${item.body.error}`)).size, 1);

  global.fetch = async () => jsonResponse({ error_code: 'over_request_rate_limit', msg: 'Request rate limit reached' }, 429);
  const throttled = await call('POST', '/api/auth/login', { email: 'limitada@example.com', password: 'senha-teste-1' });
  assert.equal(throttled.status, 429);
  assert.equal(throttled.body.code, 'auth_rate_limited');

  global.fetch = async () => jsonResponse({ msg: 'internal server error' }, 500);
  const upstreamDown = await call('POST', '/api/auth/login', { email: 'indisponivel@example.com', password: 'senha-teste-2' });
  assert.equal(upstreamDown.status, 503);
  assert.equal(upstreamDown.body.code, 'auth_unavailable');

  // Cadastro com e-mail já registrado responde igual a um cadastro novo.
  global.fetch = async () => jsonResponse({ id: 'user-novo', email: 'nova@example.com', user_metadata: {} }, 200);
  const freshSignup = await call('POST', '/api/auth/signup', {
    fullName: 'Pessoa Nova', email: 'nova@example.com', password: 'senha-forte-1'
  });
  global.fetch = async () => jsonResponse({ error_code: 'user_already_exists', msg: 'User already registered' }, 422);
  const repeatedSignup = await call('POST', '/api/auth/signup', {
    fullName: 'Pessoa Repetida', email: 'existente@example.com', password: 'senha-forte-1'
  });
  assert.equal(freshSignup.status, repeatedSignup.status);
  assert.equal(repeatedSignup.body.needsEmailConfirmation, true);
  assert.equal(repeatedSignup.body.authenticated, false);
  assert.equal(freshSignup.body.needsEmailConfirmation, repeatedSignup.body.needsEmailConfirmation);

  global.fetch = async () => jsonResponse({ error_code: 'weak_password', msg: 'Password is too weak' }, 422);
  const weakPassword = await call('POST', '/api/auth/signup', {
    fullName: 'Pessoa Fraca', email: 'fraca@example.com', password: 'senha-fraca-1'
  });
  assert.equal(weakPassword.status, 400);
  assert.equal(weakPassword.body.code, 'weak_password');

  global.fetch = async (url) => {
    assert.match(String(url), /\/auth\/v1\/recover/);
    return jsonResponse({});
  };
  const reset = await call('POST', '/api/auth/reset-password', { email: 'pessoa@example.com' });
  assert.equal(reset.status, 202);
  assert.match(reset.body.message, /existir uma conta/);

  // Rate limit distribuído (Vercel): contador do banco recusa => 429.
  process.env.VERCEL_ENV = 'preview';
  const { default: distributedHandler } = await import(`../api/[...path].js?distributed-test=${Date.now()}`);
  global.fetch = async (url) => {
    assert.match(String(url), /rpc\/consume_rate_limit/);
    return jsonResponse(false);
  };
  const res = response();
  await distributedHandler(request('POST', '/api/auth/reset-password', { email: 'pessoa@example.com' }), res);
  assert.equal(res.statusCode, 429);
  delete process.env.VERCEL_ENV;

  console.log('Arandu Auth API Contract Tests');
  console.log('Sessão, cadastro, login, logout, refresh, recuperação, rate limit distribuído, API financeira fechada sem sessão e 23 rotas aposentadas em 404 aprovados.');
} finally {
  global.fetch = originalFetch;
  restoreEnv('VERCEL_ENV', originalVercelEnv);
  restoreEnv('ARANDU_DISTRIBUTED_RATE_LIMIT', originalDistributedRateLimit);
}

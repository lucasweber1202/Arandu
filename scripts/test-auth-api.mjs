import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { decodeSessionValue, encodeSessionValue } from '../lib/session-cookie.mjs';

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

function sessionPayload({ expired = false, sso = null } = {}) {
  return {
    access_token: 'access-test',
    refresh_token: 'refresh-test',
    expires_at: Math.floor(Date.now() / 1000) + (expired ? -60 : 3600),
    ...(sso ? { sso } : {})
  };
}

function sessionCookie(options = {}) {
  return `arandu_session=${encodeURIComponent(encodeSessionValue(sessionPayload(options)))}`;
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
  const refreshedSession = decodeSessionValue(refreshedCookieValue);
  assert.equal(refreshedSession.access_token, 'refreshed-access');

  // Cookie de sessão assinado (lib/session-cookie.mjs). Antes, a carga era JSON
  // em base64url sem assinatura: apagar o marcador `sso` fazia a sessão escapar
  // do limite absoluto, da revogação e da desativação da conexão SSO.
  const SSO = { c: '00000000-0000-4000-8000-000000000901', s: 'user-123', i: Math.floor(Date.now() / 1000) - 60, u: Math.floor(Date.now() / 1000) + 8 * 3600 };
  const ssoChecks = [];
  let ssoValid = true;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/rpc/fin_sso_session_valid')) { ssoChecks.push(JSON.parse(options.body)); return jsonResponse(ssoValid); }
    assert.match(String(url), /\/auth\/v1\/user$/);
    return jsonResponse({ id: 'user-123', email: 'compradora@example.com', user_metadata: {} });
  };
  const unsigned = `arandu_session=${encodeURIComponent(Buffer.from(JSON.stringify(sessionPayload())).toString('base64url'))}`;
  const unsignedSession = await call('GET', '/api/auth/session', undefined, { cookie: unsigned });
  assert.equal(unsignedSession.body.authenticated, false, 'carga sem assinatura não é sessão');
  const signedSso = encodeSessionValue(sessionPayload({ sso: SSO }));
  const [, mac] = signedSso.split('.');
  const stripped = `${Buffer.from(JSON.stringify(sessionPayload())).toString('base64url')}.${mac}`;
  const strippedSession = await call('GET', '/api/auth/session', undefined, { cookie: `arandu_session=${encodeURIComponent(stripped)}` });
  assert.equal(strippedSession.body.authenticated, false, 'marcador sso removido invalida a assinatura');
  const forged = encodeSessionValue(sessionPayload(), { SUPABASE_SERVICE_ROLE_KEY: 'outra-chave' });
  const forgedSession = await call('GET', '/api/auth/session', undefined, { cookie: `arandu_session=${encodeURIComponent(forged)}` });
  assert.equal(forgedSession.body.authenticated, false, 'assinatura de outra chave é recusada');
  const ssoSession = await call('GET', '/api/auth/session', undefined, { cookie: sessionCookie({ sso: SSO }) });
  assert.equal(ssoSession.body.authenticated, true);
  assert.equal(ssoChecks.length, 1, 'sessão SSO conferida no banco mesmo com access token válido');
  assert.equal(ssoChecks[0].p_connection, SSO.c);
  // Revogada no banco: cai sem esperar o access token expirar (cache curto por sessão).
  ssoValid = false;
  const revokedSso = { ...SSO, i: SSO.i - 1 };
  const revoked = await call('GET', '/api/auth/session', undefined, { cookie: sessionCookie({ sso: revokedSso }) });
  assert.equal(revoked.body.authenticated, false, 'SSO revogado derruba a sessão com token ainda válido');
  assert.match(String(revoked.headers['set-cookie']), /Max-Age=0/);

  global.fetch = async (url, options = {}) => {
    assert.match(String(url), /\/auth\/v1\/logout\?scope=global$/);
    assert.equal(options.headers.Authorization, 'Bearer access-test');
    return new Response(null, { status: 204 });
  };
  const logout = await call('POST', '/api/auth/logout', undefined, { cookie: sessionCookie() });
  assert.equal(logout.status, 200);
  assert.equal(logout.body.authenticated, false);
  assert.match(logout.headers['set-cookie'], /Max-Age=0/);

  // Falha de revogação nunca equivale a logout global confirmado, mesmo
  // quando o cookie local foi limpo. Mensagens do Auth não atravessam.
  for (const failure of [
    { name: 'timeout', throws: new DOMException('sensitive-upstream timeout', 'TimeoutError') },
    { name: 'network', throws: new Error('sensitive-upstream network') },
    { name: 'server', status: 500, body: { msg: 'sensitive-upstream database detail' } },
    { name: 'missing-session', status: 403, body: { error_code: 'session_not_found', msg: 'sensitive-upstream session' } },
    { name: 'expired-token', status: 401, body: { error_code: 'bad_jwt', msg: 'sensitive-upstream expired' }, expired: true }
  ]) {
    const logoutRequests = [];
    global.fetch = async (url) => {
      logoutRequests.push(String(url));
      if (failure.throws) throw failure.throws;
      return jsonResponse(failure.body, failure.status);
    };
    const failedLogout = await call('POST', '/api/auth/logout', undefined, { cookie: sessionCookie({ expired: failure.expired }) });
    assert.deepEqual(logoutRequests, ['https://arandu-test.supabase.co/auth/v1/logout?scope=global'], failure.name);
    assert.equal(failedLogout.status, 503, failure.name);
    assert.equal(failedLogout.body.ok, false, failure.name);
    assert.equal(failedLogout.body.code, 'auth_logout_unconfirmed', failure.name);
    assert.match(failedLogout.headers['set-cookie'], /Max-Age=0/, failure.name);
    assert.doesNotMatch(JSON.stringify(failedLogout.body), /sensitive-upstream/, failure.name);
  }
  global.fetch = async () => { throw new Error('Logout sem cookie não consulta o Auth.'); };
  const localLogout = await call('POST', '/api/auth/logout');
  assert.equal(localLogout.status, 200);
  assert.equal(localLogout.body.authenticated, false);
  assert.match(localLogout.headers['set-cookie'], /Max-Age=0/);

  // Uma configuração Auth perdida não prova revogação de cookie ainda
  // autenticável pela chave de assinatura do servidor.
  const savedAnonKey = process.env.SUPABASE_ANON_KEY;
  try {
    delete process.env.SUPABASE_ANON_KEY;
    const { default: unconfiguredHandler } = await import(`../api/[...path].js?logout-unconfigured=${Date.now()}`);
    const unconfiguredLogout = response();
    await unconfiguredHandler(request('POST', '/api/auth/logout', undefined, { cookie: sessionCookie() }), unconfiguredLogout);
    assert.equal(unconfiguredLogout.statusCode, 503);
    assert.equal(JSON.parse(unconfiguredLogout.body).code, 'auth_logout_unconfirmed');
    assert.match(unconfiguredLogout.headers['set-cookie'], /Max-Age=0/);
    const noSessionLogout = response();
    await unconfiguredHandler(request('POST', '/api/auth/logout'), noSessionLogout);
    assert.equal(noSessionLogout.statusCode, 200);
  } finally {
    restoreEnv('SUPABASE_ANON_KEY', savedAnonKey);
  }

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

  // Tentativas distribuídas contra a mesma conta: cada IP fica abaixo do seu
  // limite, mas o teto por conta (qualquer IP) corta na 101ª.
  // Na Vercel (VERCEL=1) o IP vem da borda; o limitador segue em memória aqui.
  global.fetch = async () => jsonResponse({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
  process.env.VERCEL = '1';
  const sprayed = [];
  try {
    for (let i = 0; i < 101; i += 1) {
      sprayed.push((await call('POST', '/api/auth/login', { email: 'alvo@example.com', password: 'senha-errada-1' }, { 'x-vercel-forwarded-for': `198.51.100.${i}` })).status);
    }
    assert.deepEqual([...new Set(sprayed.slice(0, 100))], [401]);
    assert.equal(sprayed[100], 429, 'teto por conta em qualquer IP');
    const otherAccount = await call('POST', '/api/auth/login', { email: 'outra@example.com', password: 'senha-errada-1' }, { 'x-vercel-forwarded-for': '198.51.100.200' });
    assert.equal(otherAccount.status, 401, 'outra conta não é afetada');
  } finally { delete process.env.VERCEL; }


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
  // Falha do provedor que ecoa o e-mail: a resposta não muda e o log sai redigido.
  global.fetch = async () => jsonResponse({ msg: 'Error sending recovery email to pessoa@example.com' }, 500);
  const logged = [];
  const originalError = console.error;
  console.error = (line) => logged.push(String(line));
  let failedReset;
  try { failedReset = await call('POST', '/api/auth/reset-password', { email: 'pessoa@example.com' }); } finally { console.error = originalError; }
  assert.equal(failedReset.status, 202);
  assert.ok(logged.some((line) => line.includes('auth.password_recovery_failed')), 'falha registrada');
  assert.ok(!logged.join(' ').includes('pessoa@example.com'), 'log sem e-mail em claro');

  // Conclusão da recuperação: troca a senha com o token de recuperação, não abre sessão.
  let updateCall = null;
  global.fetch = async (url, options = {}) => { updateCall = { url: String(url), method: options.method, auth: options.headers.Authorization, body: JSON.parse(options.body) }; return jsonResponse({ id: 'user-123' }); };
  const recoveryToken = 'eyJhbGciOiJIUzI1NiJ9.recuperacao-teste.assinatura';
  const updated = await call('POST', '/api/auth/update-password', { recovery_token: recoveryToken, password: 'nova-senha-forte-1' });
  assert.equal(updated.status, 200);
  assert.deepEqual({ url: updateCall.url.endsWith('/auth/v1/user'), method: updateCall.method, auth: updateCall.auth, body: updateCall.body },
    { url: true, method: 'PUT', auth: `Bearer ${recoveryToken}`, body: { password: 'nova-senha-forte-1' } });
  assert.match(String(updated.headers['set-cookie']), /arandu_session=;.*Max-Age=0/, 'nenhuma sessão nasce da recuperação');
  global.fetch = async () => jsonResponse({ error_code: 'bad_jwt', msg: 'invalid JWT: token is expired' }, 401);
  const expiredLink = await call('POST', '/api/auth/update-password', { recovery_token: recoveryToken, password: 'nova-senha-forte-1' });
  assert.deepEqual([expiredLink.status, expiredLink.body.code], [400, 'recovery_link_expired']);
  global.fetch = async () => { throw new Error('senha curta ou token malformado não chegam ao provedor'); };
  const shortPassword = await call('POST', '/api/auth/update-password', { recovery_token: recoveryToken, password: 'curta' });
  assert.deepEqual([shortPassword.status, shortPassword.body.code], [400, 'weak_password']);
  const badToken = await call('POST', '/api/auth/update-password', { recovery_token: 'x y', password: 'nova-senha-forte-1' });
  assert.deepEqual([badToken.status, badToken.body.code], [400, 'invalid_recovery_link']);

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
  assert.equal(JSON.parse(res.body).code, 'rate_limited');
  assert.equal(res.headers['retry-after'], '3600');
  assert.equal(JSON.parse(res.body).requestId, res.headers['x-request-id']);
  for (const broken of [async () => { throw new Error('private timeout detail'); }, async () => jsonResponse(null)]) {
    global.fetch = broken;
    const unavailable = response();
    await distributedHandler(request('POST', '/api/auth/reset-password', { email: 'synthetic@example.invalid' }), unavailable);
    assert.equal(unavailable.statusCode, 503);
    assert.equal(JSON.parse(unavailable.body).code, 'rate_limit_unavailable');
    assert(!unavailable.body.includes('private timeout detail'));
    assert.equal(unavailable.headers['retry-after'], undefined);
  }
  for (const hosted of ['production', 'preview']) {
    process.env.VERCEL_ENV = hosted;
    global.fetch = async (url, init) => {
      assert.match(String(url), /rpc\/consume_rate_limit/);
      const quota = JSON.parse(init.body);
      assert.deepEqual([quota.p_limit, quota.p_window_seconds], [120, 600]);
      return jsonResponse(false);
    };
    const rejected = response();
    await distributedHandler(request('GET', '/api/finance/products?local=true', undefined, { 'x-local-rate-limit': 'unlimited' }), rejected);
    assert.equal(rejected.statusCode, 429);
    assert.equal(rejected.headers['retry-after'], '600');
    assert.equal(JSON.parse(rejected.body).code, 'rate_limited');
  }
  delete process.env.VERCEL_ENV;

  console.log('Arandu Auth API Contract Tests');
  // (no fim: esgota o limite por origem de 127.0.0.1)
  global.fetch = async (url) => (String(url).includes('/rpc/') ? jsonResponse(true) : jsonResponse({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400));
  // Fora da Vercel, girar X-Forwarded-For não renova o limite por origem
  // (antes, cada valor forjado ganhava um limite novo de 12 tentativas).
  const forgedProxy = [];
  for (let i = 0; i < 13; i += 1) {
    forgedProxy.push((await call('POST', '/api/auth/login', { email: `forjada-${i}@example.com`, password: 'senha-errada-1' }, { 'x-forwarded-for': `203.0.113.${i}`, 'x-real-ip': `203.0.113.${i}` })).status);
  }
  assert.equal(forgedProxy.at(-1), 429, 'cabeçalho de proxy forjado não contorna o limite por origem');
  const limited = await call('POST', '/api/auth/login', { email: 'limited@example.invalid', password: 'senha-errada-1' }, { 'x-request-id': 'ref\r\nunsafe!' });
  assert.equal(limited.body.code, 'rate_limited');
  assert.match(limited.headers['retry-after'], /^\d+$/);
  assert(Number(limited.headers['retry-after']) > 0 && Number(limited.headers['retry-after']) <= 600);
  assert.equal(limited.body.requestId, 'refunsafe');
  console.log('Sessão, cadastro, login, logout, refresh, recuperação, rate limit distribuído, API financeira fechada sem sessão e 23 rotas aposentadas em 404 aprovados.');
} finally {
  global.fetch = originalFetch;
  restoreEnv('VERCEL_ENV', originalVercelEnv);
  restoreEnv('ARANDU_DISTRIBUTED_RATE_LIMIT', originalDistributedRateLimit);
}

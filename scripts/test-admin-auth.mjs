import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { requireAdmin } from '../lib/admin-auth.mjs';
import { testAdminAccessToken, testAdminCookie, testAdminUser } from './test-helpers/admin-session.mjs';

const originalVercelEnv = process.env.VERCEL_ENV;
const originalDistributedRateLimit = process.env.ARANDU_DISTRIBUTED_RATE_LIMIT;

// Keep this contract suite deterministic; distributed limiting is tested separately.
delete process.env.VERCEL_ENV;
delete process.env.ARANDU_DISTRIBUTED_RATE_LIMIT;

process.env.SUPABASE_URL = 'https://arandu-admin-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-admin-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-admin-test';

const { default: adminAuthHandler } = await import(`../api/admin-auth.js?test=${Date.now()}`);
const { default: internalPageHandler } = await import(`../api/internal-page.js?test=${Date.now()}`);
const { default: healthHandler } = await import(`../api/health.js?test=${Date.now()}`);
const { default: readinessHandler } = await import(`../api/readiness.js?test=${Date.now()}`);

function request(method, url, body, headers = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = url;
  req.headers = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  req.socket = { remoteAddress: '127.0.0.11' };
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

async function call(handler, method, url, body, headers) {
  const res = response();
  await handler(request(method, url, body, headers), res);
  return {
    status: res.statusCode,
    headers: res.headers,
    body: res.body && String(res.headers['content-type'] || '').includes('json') ? JSON.parse(res.body) : res.body
  };
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type': 'application/json' }
});
function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const originalFetch = global.fetch;

try {
  await assert.rejects(() => requireAdmin(request('GET', '/')), (error) => error.status === 401 && error.code === 'admin_session_required');

  const health = await call(healthHandler, 'GET', '/api/health');
  assert.deepEqual(health.body, { ok: true, service: 'arandu-api', status: 'alive' });
  assert.doesNotMatch(JSON.stringify(health.body), /SUPABASE|missing|routes|environment|commit/i);

  const readinessDenied = await call(readinessHandler, 'GET', '/api/readiness');
  assert.equal(readinessDenied.status, 401);
  assert.equal(readinessDenied.body.code, 'admin_session_required');

  global.fetch = async (url) => {
    assert.match(String(url), /\/auth\/v1\/user$/);
    return json(testAdminUser({ role: '', includeUserMetadataRole: true }));
  };
  await assert.rejects(
    () => requireAdmin(request('GET', '/', undefined, { cookie: testAdminCookie() })),
    (error) => error.status === 403 && error.code === 'admin_role_required'
  );

  // finance_ops é papel de plataforma financeira: com MFA e tudo, não entra em
  // nenhuma superfície administrativa legada, nem no desafio MFA legado.
  global.fetch = async () => json(testAdminUser({ role: 'finance_ops' }));
  await assert.rejects(
    () => requireAdmin(request('GET', '/', undefined, { cookie: testAdminCookie() })),
    (error) => error.status === 403 && error.code === 'admin_role_required'
  );
  const financeOpsReadiness = await call(readinessHandler, 'GET', '/api/readiness', undefined, { cookie: testAdminCookie() });
  assert.equal(financeOpsReadiness.status, 403);
  assert.equal(financeOpsReadiness.body.code, 'admin_role_required');
  const financeOpsChallenge = await call(adminAuthHandler, 'POST', '/api/admin-auth?action=challenge', {}, { cookie: testAdminCookie() });
  assert.equal(financeOpsChallenge.status, 403);

  global.fetch = async () => json(testAdminUser());
  await assert.rejects(
    () => requireAdmin(request('GET', '/', undefined, {
      cookie: testAdminCookie({ accessToken: testAdminAccessToken({ aal: 'aal1' }) })
    })),
    (error) => error.status === 403 && error.code === 'admin_mfa_required'
  );

  const cookie = testAdminCookie();
  const admin = await requireAdmin(request('GET', '/', undefined, { cookie }));
  assert.equal(admin.actor.id, 'admin-user-1');
  assert.equal(admin.actor.role, 'admin');
  assert.equal(admin.actor.aal, 'aal2');

  const session = await call(adminAuthHandler, 'GET', '/api/admin-auth?action=session', undefined, { cookie });
  assert.equal(session.status, 200);
  assert.equal(session.body.authorized, true);
  assert.equal(session.body.mfaVerified, true);
  assert.equal(session.body.actor.email, 'admin@example.com');

  const deniedPage = await call(internalPageHandler, 'GET', '/api/internal-page?page=admin.html');
  assert.equal(deniedPage.status, 302);
  assert.match(deniedPage.headers.location, /admin-login\.html/);
  assert.equal(deniedPage.body, '');

  global.fetch = async () => json(testAdminUser());
  const internalPage = await call(internalPageHandler, 'GET', '/api/internal-page?page=admin.html', undefined, { cookie });
  assert.equal(internalPage.status, 200);
  assert.match(internalPage.body, /Painel administrativo/);
  assert.match(internalPage.body, /admin-session-bridge\.js/);
  assert.match(internalPage.headers['cache-control'], /no-store/);

  let challengeCalled = false;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json(testAdminUser());
    if (value.endsWith('/factors/totp-factor-1/challenge')) {
      challengeCalled = true;
      return json({ id: 'challenge-1', expires_at: 1234567890 });
    }
    throw new Error(`URL inesperada: ${value}`);
  };
  const challenge = await call(adminAuthHandler, 'POST', '/api/admin-auth?action=challenge', {}, { cookie });
  assert.equal(challenge.status, 201);
  assert.equal(challenge.body.factorId, 'totp-factor-1');
  assert.equal(challenge.body.challengeId, 'challenge-1');
  assert.equal(challengeCalled, true);

  global.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith('/auth/v1/user')) return json(testAdminUser());
    if (value.endsWith('/factors/totp-factor-1/verify')) {
      return json({
        access_token: testAdminAccessToken({ aal: 'aal2' }),
        refresh_token: 'verified-refresh',
        expires_in: 3600
      });
    }
    throw new Error(`URL inesperada: ${value}`);
  };
  const verified = await call(adminAuthHandler, 'POST', '/api/admin-auth?action=verify', {
    factorId: 'totp-factor-1',
    challengeId: 'challenge-1',
    code: '123456'
  }, { cookie });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.mfaVerified, true);
  assert.match(verified.headers['set-cookie'], /HttpOnly/);

  console.log('Arandu Admin Auth Contract Tests');
  console.log('12 cenários aprovados (inclui finance_ops recusado no admin legado).');
} finally {
  global.fetch = originalFetch;
  restoreEnv('VERCEL_ENV', originalVercelEnv);
  restoreEnv('ARANDU_DISTRIBUTED_RATE_LIMIT', originalDistributedRateLimit);
}

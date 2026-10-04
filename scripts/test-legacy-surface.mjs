// Com ARANDU_ENV=pilot, toda rota legada de arte responde 404 antes de tocar
// no banco; o domínio financeiro, auth/*, o cron e o health seguem vivos.
import assert from 'node:assert/strict';

const calls = [];
globalThis.fetch = async (url) => { calls.push(String(url)); throw new Error('rede proibida neste teste'); };

function request(method, url, body) {
  const chunks = body ? [Buffer.from(JSON.stringify(body))] : [];
  return {
    method, url,
    headers: { host: 'pilot.example', origin: 'https://pilot.example', 'content-type': 'application/json' },
    socket: { remoteAddress: '203.0.113.9' },
    async *[Symbol.asyncIterator]() { for (const chunk of chunks) yield chunk; },
    on() { return this; }
  };
}
function response() {
  const headers = new Map();
  return {
    statusCode: 200, headersSent: false, body: '',
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    getHeader(name) { return headers.get(String(name).toLowerCase()); },
    writeHead(status, extra = {}) { this.statusCode = status; for (const [k, v] of Object.entries(extra)) headers.set(k.toLowerCase(), v); return this; },
    write(chunk) { this.body += chunk; },
    end(chunk = '') { this.body += chunk; this.headersSent = true; }
  };
}
async function call(file, method, url, body) {
  const handler = (await import(`../api/${file}.js`)).default;
  const res = response();
  await handler(request(method, url, body), res);
  let data = null;
  try { data = JSON.parse(res.body); } catch { data = null; }
  return { status: res.statusCode, code: data?.code };
}

const previous = { ...process.env };
Object.assign(process.env, {
  ARANDU_ENV: 'pilot', SUPABASE_URL: 'https://offgpyysgdhfemjlchod.supabase.co', SUPABASE_ANON_KEY: 'anon-test', SUPABASE_SERVICE_ROLE_KEY: 'service-test'
});

const legacy = [
  ['[...path]', 'POST', '/api/forms', { type: 'contact', name: 'Spam', email: 'spam@example.invalid', message: 'x' }],
  ['[...path]', 'POST', '/api/reservations', {}], ['[...path]', 'GET', '/api/catalog'], ['[...path]', 'GET', '/api/artists'],
  ['[...path]', 'POST', '/api/events', {}], ['[...path]', 'POST', '/api/conversion-events', {}], ['[...path]', 'GET', '/api/public-config'],
  ['[...path]', 'GET', '/api/pilot/metrics'], ['[...path]', 'POST', '/api/privacy/request', {}], ['[...path]', 'GET', '/api/admin?panel=artworks'],
  ['[...path]', 'POST', '/api/admin-update', {}], ['[...path]', 'GET', '/api/operational?resource=artwork'], ['[...path]', 'GET', '/api/media'],
  ['[...path]', 'GET', '/api/selections'], ['[...path]', 'GET', '/api/account'], ['[...path]', 'GET', '/api/portal/artist'],
  ['[...path]', 'GET', '/api/dashboard'], ['[...path]', 'GET', '/api/admin/quality'], ['[...path]', 'GET', '/api/catalog-review'],
  ['[...path]', 'GET', '/api/artist-accounts'], ['[...path]', 'GET', '/api/certificates'], ['[...path]', 'GET', '/api/index'],
  ['account-orders', 'GET', '/api/account-orders'], ['admin-auth', 'GET', '/api/admin-auth?action=session'], ['collections', 'GET', '/api/collections'],
  ['commercial', 'GET', '/api/commercial'], ['internal-page', 'GET', '/api/internal-page?page=admin.html'], ['mvp-dashboard', 'GET', '/api/mvp-dashboard'],
  ['orders', 'GET', '/api/orders'], ['readiness', 'GET', '/api/readiness'], ['upload', 'POST', '/api/upload', {}]
];
for (const [file, method, url, body] of legacy) {
  const result = await call(file, method, url, body);
  assert.deepEqual(result, { status: 404, code: 'legacy_surface_closed' }, `${method} ${url} continua aberta no piloto`);
}
assert.equal(calls.length, 0, `rota legada chegou à rede: ${calls.join(', ')}`);

// O que o piloto usa continua roteado (sem sessão: 401, não 404).
for (const [method, url] of [['GET', '/api/finance/rfqs'], ['GET', '/api/jobs/renewals'], ['GET', '/api/jobs/webhooks'], ['GET', '/api/jobs/governance'], ['GET', '/api/auth/session']]) {
  const result = await call('[...path]', method, url);
  assert.notEqual(result.code, 'legacy_surface_closed', `${url} fechada por engano`);
  assert.notEqual(result.status, 404, `${url} sem rota no piloto`);
}
assert.equal((await call('health', 'GET', '/api/health')).status, 200);

// A produção oficial é o mesmo produto: também fechada.
process.env.ARANDU_ENV = 'production';
assert.deepEqual(await call('[...path]', 'POST', '/api/forms', { name: 'x' }), { status: 404, code: 'legacy_surface_closed' });
assert.deepEqual(await call('orders', 'GET', '/api/orders'), { status: 404, code: 'legacy_surface_closed' });
// A demonstração canônica (ARANDU_ENV=demo, banco DEMO) é o mesmo produto: fechada,
// com o domínio financeiro aberto.
process.env.ARANDU_ENV = 'demo';
assert.deepEqual(await call('[...path]', 'POST', '/api/forms', { name: 'x' }), { status: 404, code: 'legacy_surface_closed' }, 'demo reabriu /api/forms');
assert.deepEqual(await call('orders', 'GET', '/api/orders'), { status: 404, code: 'legacy_surface_closed' });
assert.notEqual((await call('[...path]', 'GET', '/api/finance/rfqs')).code, 'legacy_surface_closed', 'finance/* fechado na demo com banco');
// Deployment de produção da Vercel sem ARANDU_ENV (variável esquecida): fechado.
delete process.env.ARANDU_ENV;
process.env.VERCEL_ENV = 'production';
assert.deepEqual(await call('[...path]', 'POST', '/api/forms', { name: 'x' }), { status: 404, code: 'legacy_surface_closed' }, 'produção sem ARANDU_ENV reabriu /api/forms');
assert.deepEqual(await call('[...path]', 'GET', '/api/pilot/metrics'), { status: 404, code: 'legacy_surface_closed' });
assert.deepEqual(await call('commercial', 'GET', '/api/commercial'), { status: 404, code: 'legacy_surface_closed' });
assert.notEqual((await call('[...path]', 'GET', '/api/finance/me')).code, 'legacy_surface_closed', 'finance/* fechado na produção sem ARANDU_ENV');
delete process.env.VERCEL_ENV;
// Sem ARANDU_ENV (desenvolvimento/preview legado) nada muda.
assert.notEqual((await call('[...path]', 'GET', '/api/catalog')).code, 'legacy_surface_closed');

// Projeto demonstrativo: sem banco, toda a API fecha — inclusive finance/*,
// auth/*, os crons e o despacho de e-mail. Só health e security.txt respondem.
for (const key of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[key];
calls.length = 0;
process.env.ARANDU_DEPLOYMENT_KIND = 'demo';
process.env.ARANDU_EMAIL_DISPATCH_ENABLED = 'true';
const demoClosed = [
  ...legacy,
  ['[...path]', 'GET', '/api/finance/me'], ['[...path]', 'GET', '/api/finance/rfqs'], ['[...path]', 'POST', '/api/finance/rfqs', {}],
  ['[...path]', 'GET', '/api/jobs/renewals'], ['[...path]', 'GET', '/api/auth/session'], ['[...path]', 'POST', '/api/auth/otp', {}],
  ['email-dispatch', 'GET', '/api/email-dispatch']
];
for (const [file, method, url, body] of demoClosed) {
  const result = await call(file, method, url, body);
  assert.deepEqual(result, { status: 404, code: 'legacy_surface_closed' }, `${method} ${url} aberta no projeto demonstrativo`);
}
assert.equal((await call('health', 'GET', '/api/health')).status, 200);
assert.notEqual((await call('[...path]', 'GET', '/.well-known/security.txt')).code, 'legacy_surface_closed', 'security.txt fechado na demo');
assert.equal(calls.length, 0, `demo chegou à rede: ${calls.join(', ')}`);

process.env = previous;
console.log(`Legacy art surface: ${legacy.length} rotas de arte fechadas com 404 no piloto e na produção, sem tocar a rede; finance/*, auth/*, cron e health abertos. Demo: ${demoClosed.length} rotas fechadas, só health e security.txt.`);

#!/usr/bin/env node
// Enterprise SSO foundation: IdP de teste (chaves reais RS256/ES256) contra a
// verificação estrita de id_token; state assinado e PKCE; adapter Supabase;
// callback com cada motivo de recusa (e encerramento da sessão do broker);
// exigência de SSO no login por senha (403) e falha fechada (503); prontidão.
// Banco: tests/database/financial-sso.sql.
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createSign, generateKeyPairSync, createHash } from 'node:crypto';
import { SsoError, createState, verifyState, verifyIdToken, validateIdentity, readiness, reasonFromDatabase, txtContainsToken, domainVerificationToken, emailDomain, pkcePair, sha256 } from '../lib/finance/sso.mjs';
import { supabaseSsoAdapter, mockSsoAdapter, adapterFor } from '../lib/finance/sso-adapters.mjs';
import { createSsoRoutes, SSO_STATE_COOKIE } from '../lib/api/domains/sso.mjs';
import { readFileSync } from 'node:fs';
import { SSO_REASONS } from '../lib/finance/sso.mjs';

const ENV = { ARANDU_SSO_STATE_SECRET: 's'.repeat(40) };
const NOW = Date.parse('2026-10-04T12:00:00Z');
const SEC = Math.floor(NOW / 1000);

// ------------------------------------------------------------ IdP de teste
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = (key, kid, alg) => ({ ...key.export({ format: 'jwk' }), kid, alg, use: 'sig' });
const JWKS = { keys: [jwk(rsa.publicKey, 'rsa-1', 'RS256'), jwk(ec.publicKey, 'ec-1', 'ES256')] };
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
function sign(claims, { alg = 'RS256', kid = 'rsa-1', key = rsa.privateKey } = {}) {
  const head = b64({ alg, kid, typ: 'JWT' });
  const body = b64(claims);
  if (alg === 'none') return `${head}.${body}.`;
  const signer = createSign('SHA256');
  signer.update(`${head}.${body}`);
  const signature = signer.sign(alg === 'ES256' ? { key, dsaEncoding: 'ieee-p1363' } : key).toString('base64url');
  return `${head}.${body}.${signature}`;
}
const BASE = { iss: 'https://idp.example.com', aud: 'arandu-client', sub: 'user-123', email: 'analista@vitta.example', email_verified: true, nonce: 'n-1', iat: SEC - 10, exp: SEC + 300 };
const check = { jwks: JWKS, issuer: 'https://idp.example.com', audience: 'arandu-client', nonce: 'n-1', now: NOW };
assert.equal(verifyIdToken(sign(BASE), check).sub, 'user-123');
assert.equal(verifyIdToken(sign(BASE, { alg: 'ES256', kid: 'ec-1', key: ec.privateKey }), check).sub, 'user-123');
const reasonOf = (fn) => { try { fn(); return 'ok'; } catch (error) { assert.ok(error instanceof SsoError, error.message); return error.reason; } };
for (const [label, token, opts, reason] of [
  ['issuer', sign({ ...BASE, iss: 'https://evil.example.com' }), {}, 'issuer_mismatch'],
  ['audience', sign({ ...BASE, aud: 'other-client' }), {}, 'audience_mismatch'],
  ['várias audiências sem azp', sign({ ...BASE, aud: ['arandu-client', 'x'] }), {}, 'audience_mismatch'],
  ['nonce', sign({ ...BASE, nonce: 'n-2' }), {}, 'nonce_mismatch'],
  ['nonce ausente', sign({ ...BASE, nonce: undefined }), {}, 'nonce_mismatch'],
  ['expirado', sign({ ...BASE, exp: SEC - 120 }), {}, 'token_expired'],
  ['sem exp', sign({ ...BASE, exp: undefined }), {}, 'token_expired'],
  ['futuro (nbf)', sign({ ...BASE, nbf: SEC + 600 }), {}, 'token_not_yet_valid'],
  ['futuro (iat)', sign({ ...BASE, iat: SEC + 600 }), {}, 'token_not_yet_valid'],
  ['e-mail não verificado', sign({ ...BASE, email_verified: false }), {}, 'email_unverified'],
  ['alg none', sign(BASE, { alg: 'none' }), {}, 'alg_not_allowed'],
  ['alg HS256', `${b64({ alg: 'HS256', kid: 'rsa-1' })}.${b64(BASE)}.c2ln`, {}, 'alg_not_allowed'],
  ['chave de outro IdP', sign(BASE, { key: other.privateKey }), {}, 'signature_invalid'],
  ['kid desconhecido', sign(BASE, { kid: 'nope' }), {}, 'signature_invalid'],
  ['payload adulterado', (() => { const [h, , s] = sign(BASE).split('.'); return `${h}.${b64({ ...BASE, sub: 'admin' })}.${s}`; })(), {}, 'signature_invalid'],
  ['malformado', 'abc.def', {}, 'malformed_token']
]) {
  assert.equal(reasonOf(() => verifyIdToken(token, { ...check, ...opts })), reason, label);
}
assert.equal(verifyIdToken(sign({ ...BASE, aud: ['arandu-client', 'x'], azp: 'arandu-client' }), check).sub, 'user-123', 'azp resolve várias audiências');
assert.equal(verifyIdToken(sign({ ...BASE, exp: SEC - 30 }), check).sub, 'user-123', 'folga de relógio de 60 s');

// ------------------------------------------------------------ state e PKCE
const created = createState({ connectionId: 'c-1', redirect: '/finance/rfqs.html', now: NOW }, ENV);
const verified = verifyState(created.cookie, created.state, { now: NOW + 1000 }, ENV);
assert.deepEqual({ c: verified.connectionId, r: verified.redirect, n: verified.nonce }, { c: 'c-1', r: '/finance/rfqs.html', n: created.nonce });
assert.equal(createHash('sha256').update(verified.verifier).digest('base64url'), created.pkce.challenge, 'PKCE S256');
for (const [label, fn] of [
  ['state trocado', () => verifyState(created.cookie, 'outro', { now: NOW }, ENV)],
  ['cookie adulterado', () => verifyState(created.cookie.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')), created.state, { now: NOW }, ENV)],
  ['expirado', () => verifyState(created.cookie, created.state, { now: NOW + 601000 }, ENV)],
  ['sem segredo', () => verifyState(created.cookie, created.state, { now: NOW }, {})],
  ['sem cookie', () => verifyState(null, created.state, { now: NOW }, ENV)]
]) assert.equal(reasonOf(fn), 'state_invalid', label);
{
  const open = createState({ connectionId: 'c', redirect: '//evil.example/x', now: NOW }, ENV);
  assert.equal(verifyState(open.cookie, open.state, { now: NOW }, ENV).redirect, '/finance/dashboard.html', 'redirect aberto neutralizado');
  for (const bad of ['/finance/../admin.html', '/finance/x.html?u=//evil', '/finance/a/b.html', 'javascript:alert(1)']) {
    const attempt = createState({ connectionId: 'c', redirect: bad, now: NOW }, ENV);
    assert.equal(verifyState(attempt.cookie, attempt.state, { now: NOW }, ENV).redirect, '/finance/dashboard.html', bad);
  }
}
assert.equal(pkcePair().method, 'S256');

// ------------------------------------------------------------ identidade e banco
const connection = { id: 'c-1', status: 'testing', provider_ref: 'sso:abc', domains: ['vitta.example'] };
const identity = { issuer: 'https://proj.supabase.co/auth/v1', subject: 'u-1', email: 'analista@vitta.example', email_verified: true, provider_ref: 'sso:abc', issued_at: SEC - 5, expires_at: SEC + 3600 };
assert.equal(validateIdentity(identity, connection, { now: NOW }).domain, 'vitta.example');
assert.equal(validateIdentity(identity, connection, { now: NOW }).subject_hash, sha256('https://proj.supabase.co/auth/v1|u-1'));
for (const [label, id, conn, reason] of [
  ['provedor', { ...identity, provider_ref: 'sso:outro' }, connection, 'provider_mismatch'],
  ['domínio', { ...identity, email: 'x@outra.example' }, connection, 'domain_mismatch'],
  ['inativa', identity, { ...connection, status: 'disabled' }, 'connection_inactive'],
  ['não verificado', { ...identity, email_verified: false }, connection, 'email_unverified'],
  ['expirado', { ...identity, expires_at: SEC - 600 }, connection, 'token_expired']
]) assert.equal(reasonOf(() => validateIdentity(id, conn, { now: NOW })), reason, label);
for (const [message, reason] of [['sso session revoked', 'session_revoked'], ['sso member disabled', 'member_disabled'], ['sso member not found', 'member_not_found'],
  ['sso org mismatch', 'org_mismatch'], ['sso domain mismatch', 'domain_mismatch'], ['sso session expired', 'session_expired'], ['algo estranho', 'broker_failed']]) {
  assert.equal(reasonFromDatabase(`ERROR: ${message}`), reason);
}
assert.equal(emailDomain('A@Vitta.Example'), 'vitta.example'); assert.equal(emailDomain('sem-arroba'), null);
const challenge = domainVerificationToken();
assert.equal(txtContainsToken([['outro=1'], [challenge.record.slice(0, 10), challenge.record.slice(10)]], challenge.hash), challenge.token, 'TXT em partes');
assert.equal(txtContainsToken([['arandu-domain-verification=errado_errado_errado']], challenge.hash), null);

// Prontidão: nunca "operacional" sem broker real e login bem-sucedido.
let ready = readiness({ connection: { id: 'c', broker: 'mock', protocol: 'oidc', status: 'testing', provider_ref: 'mock:idp', metadata_url: 'https://x', issuer: 'https://x', audience: 'a' }, domains: [], events: [], env: ENV, brokerConfigured: true });
assert.equal(ready.ready, false); assert.equal(ready.operational, false);
assert.equal(ready.checks.find((item) => item.key === 'broker').status, 'blocked');
ready = readiness({ connection: { id: 'c', broker: 'supabase', protocol: 'saml', status: 'active', provider_ref: 'sso:x', metadata_url: 'https://x' },
  domains: [{ status: 'verified', connection_id: 'c' }], events: [{ outcome: 'success', connection_id: 'c' }], env: ENV, brokerConfigured: true });
assert.equal(ready.ready, true); assert.equal(ready.operational, true);
assert.equal(readiness({ connection: { id: 'c', broker: 'supabase', protocol: 'saml', status: 'active' }, env: {} }).checks.find((item) => item.key === 'state_secret').status, 'blocked');

// ------------------------------------------------------------ adapters
let calls = [];
const fakeFetch = (handler) => async (url, init = {}) => { calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null, headers: init.headers }); return handler(String(url), init); };
const accessToken = `${b64({ alg: 'HS256' })}.${b64({ iss: 'https://proj.supabase.co/auth/v1', iat: SEC - 5, exp: SEC + 3600, amr: [{ method: 'sso/saml' }] })}.sig`;
const supa = supabaseSsoAdapter({ url: 'https://proj.supabase.co', anonKey: 'anon', fetchImpl: fakeFetch((url) => {
  if (url.endsWith('/auth/v1/sso')) return Response.json({ url: 'https://login.microsoftonline.com/x' });
  if (url.includes('grant_type=pkce')) return Response.json({ access_token: accessToken, refresh_token: 'r', expires_in: 3600 });
  if (url.endsWith('/auth/v1/user')) return Response.json({ id: 'u-1', email: 'Analista@Vitta.example', email_confirmed_at: '2026-10-01', app_metadata: { provider: 'sso:abc' } });
  return Response.json({}, { status: 404 });
}) });
const pkce = pkcePair();
assert.equal((await supa.beginLogin({ connection: { provider_ref: 'sso:abc' }, pkce, redirectTo: 'https://app/cb' })).url, 'https://login.microsoftonline.com/x');
assert.deepEqual(calls[0].body, { provider_id: 'abc', redirect_to: 'https://app/cb', skip_http_redirect: true, code_challenge: pkce.challenge, code_challenge_method: 's256' });
const done = await supa.completeLogin({ code: 'abc-123-def', verifier: pkce.verifier });
assert.deepEqual({ email: done.identity.email, provider: done.identity.provider_ref, amr: done.identity.amr, verified: done.identity.email_verified },
  { email: 'analista@vitta.example', provider: 'sso:abc', amr: ['sso/saml'], verified: true });
assert.deepEqual(calls[1].body, { auth_code: 'abc-123-def', code_verifier: pkce.verifier });
await assert.rejects(() => supa.beginLogin({ connection: { provider_ref: 'mock:idp' }, pkce, redirectTo: 'x' }), (error) => error.reason === 'broker_failed');
await assert.rejects(() => supa.completeLogin({ code: '<script>', verifier: 'v' }), (error) => error.reason === 'state_invalid');
const mockOff = mockSsoAdapter({ issuer: 'https://idp.example.com', audience: 'arandu-client', jwks: JWKS, env: {} });
await assert.rejects(() => mockOff.beginLogin(), (error) => error.reason === 'mock_disabled');
const mockOn = mockSsoAdapter({ issuer: 'https://idp.example.com', audience: 'arandu-client', jwks: JWKS, env: { ARANDU_SSO_MOCK_IDP: 'true', ARANDU_ENV: 'test' } });
assert.equal((await mockOn.completeLogin({ idToken: sign(BASE), nonce: 'n-1', connection: { provider_ref: 'mock:idp' }, now: NOW })).identity.email, 'analista@vitta.example');
const mockProd = mockSsoAdapter({ issuer: 'x', audience: 'y', jwks: JWKS, env: { ARANDU_SSO_MOCK_IDP: 'true', ARANDU_ENV: 'production' } });
await assert.rejects(() => mockProd.beginLogin(), (error) => error.reason === 'mock_disabled');
assert.throws(() => adapterFor({ broker: 'ldap' }, { supabase: supa }), (error) => error.reason === 'broker_failed');

// ------------------------------------------------------------ rotas
const CONN = '00000000-0000-4000-8000-000000000901';
function routes({ rpc, supabase = supa, env = ENV }) {
  const recorded = [];
  const handlers = createSsoRoutes({
    adminRpc: async (name, args) => { if (name === 'fin_record_sso_event') { recorded.push(args); return null; } return rpc(name, args); },
    supabaseUrl: 'https://proj.supabase.co', anonKey: 'anon', siteUrl: () => 'https://app.arandu.example',
    sessionCookie: (session, sso) => `arandu_session=${Buffer.from(JSON.stringify({ a: session.access_token, sso })).toString('base64url')}; Path=/`,
    json: (res, status, body) => { res.statusCode = status; res.payload = body; res.end(JSON.stringify(body)); },
    readBody: async (req) => { const chunks = []; for await (const c of req) chunks.push(c); return chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; },
    enforceRateLimit: async () => {}, env, adapters: { supabase, mock: null }, now: () => NOW
  });
  return { handlers, recorded };
}
const req = (method, url, { body = null, cookie = '' } = {}) => Object.assign(Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []), { method, url, headers: { cookie } });
const res = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, end() {} });
const discovered = { connection_id: CONN, protocol: 'saml', broker: 'supabase', provider_ref: 'sso:abc', status: 'testing', enforce: false };

// Descoberta mínima; tenant não configurado responde "sem SSO".
let r = routes({ rpc: async (name, args) => (args.p_domain === 'vitta.example' ? discovered : null) });
let out = res(); await r.handlers.handle(req('POST', '/api/auth/sso/discover', { body: { email: 'a@vitta.example' } }), out, 'discover');
assert.deepEqual(out.payload, { ok: true, sso: true, required: false });
out = res(); await r.handlers.handle(req('POST', '/api/auth/sso/discover', { body: { email: 'a@semsso.example' } }), out, 'discover');
assert.deepEqual(out.payload, { ok: true, sso: false, required: false });
out = res(); await r.handlers.handle(req('GET', '/api/auth/sso/start?email=a@semsso.example'), out, 'start');
assert.equal(out.headers.Location, '/login.html?sso_error=sso_unconfigured');
// Início: state em cookie HttpOnly e redirecionamento ao broker.
out = res(); await r.handlers.handle(req('GET', '/api/auth/sso/start?email=a@vitta.example&next=/finance/rfqs.html'), out, 'start');
assert.equal(out.statusCode, 302); assert.equal(out.headers.Location, 'https://login.microsoftonline.com/x');
const stateCookie = out.headers['Set-Cookie'][0];
assert.match(stateCookie, new RegExp(`^${SSO_STATE_COOKIE}=.*HttpOnly; SameSite=Lax; Secure`));
const stateValue = decodeURIComponent(stateCookie.split(';')[0].split('=').slice(1).join('='));
const stateParam = new URL(calls.at(-1).body.redirect_to).searchParams.get('state');
// Sem segredo de state: nunca inicia.
r = routes({ rpc: async () => discovered, env: {} });
out = res(); await r.handlers.handle(req('GET', '/api/auth/sso/start?email=a@vitta.example'), out, 'start');
assert.equal(out.headers.Location, '/login.html?sso_error=broker_failed');

// Callback: sucesso grava trilha e sessão com limite da organização.
const authorizeOk = async (name) => (name === 'fin_sso_discover' ? discovered : name === 'fin_sso_authorize' ? { organization_id: 'o', role: 'analyst', max_session_hours: 8 } : null);
r = routes({ rpc: authorizeOk });
out = res(); await r.handlers.handle(req('GET', `/api/auth/sso/callback?state=${stateParam}&code=abc-123-def`, { cookie: `${SSO_STATE_COOKIE}=${encodeURIComponent(stateValue)}` }), out, 'callback');
assert.equal(out.headers.Location, '/finance/rfqs.html');
const session = JSON.parse(Buffer.from(out.headers['Set-Cookie'][1].split(';')[0].split('=')[1], 'base64url').toString());
assert.deepEqual({ c: session.sso.c, s: session.sso.s, u: session.sso.u }, { c: CONN, s: 'u-1', u: SEC - 5 + 8 * 3600 });
assert.deepEqual({ outcome: r.recorded[0].p_outcome, reason: r.recorded[0].p_reason, domain: r.recorded[0].p_email_domain }, { outcome: 'success', reason: 'ok', domain: 'vitta.example' });
assert.ok(!JSON.stringify(r.recorded).includes('analista@'), 'trilha sem e-mail em claro');
// Recusas: cada motivo do banco vira redirect sem sessão e encerra a sessão do broker.
for (const [message, reason] of [['sso member not found', 'member_not_found'], ['sso session revoked', 'session_revoked'], ['sso member disabled', 'member_disabled'], ['sso org mismatch', 'org_mismatch']]) {
  calls = [];
  r = routes({ rpc: async (name) => { if (name === 'fin_sso_discover') return discovered; throw new Error(message); } });
  out = res(); await r.handlers.handle(req('GET', `/api/auth/sso/callback?state=${stateParam}&code=abc-123-def`, { cookie: `${SSO_STATE_COOKIE}=${encodeURIComponent(stateValue)}` }), out, 'callback');
  assert.equal(out.headers.Location, `/login.html?sso_error=${reason}`);
  assert.equal(out.headers['Set-Cookie'].length, 1, 'nenhuma sessão emitida');
  assert.equal(r.recorded[0].p_reason, reason);
}
// Conexão do state diferente da do domínio (troca de organização no meio do fluxo).
r = routes({ rpc: async (name) => (name === 'fin_sso_discover' ? { ...discovered, connection_id: '00000000-0000-4000-8000-000000000902' } : null) });
out = res(); await r.handlers.handle(req('GET', `/api/auth/sso/callback?state=${stateParam}&code=abc-123-def`, { cookie: `${SSO_STATE_COOKIE}=${encodeURIComponent(stateValue)}` }), out, 'callback');
assert.equal(out.headers.Location, '/login.html?sso_error=org_mismatch');
// State inválido e erro devolvido pelo IdP.
out = res(); await r.handlers.handle(req('GET', '/api/auth/sso/callback?state=forjado&code=abc-123-def', { cookie: `${SSO_STATE_COOKIE}=${encodeURIComponent(stateValue)}` }), out, 'callback');
assert.equal(out.headers.Location, '/login.html?sso_error=state_invalid');
out = res(); await r.handlers.handle(req('GET', `/api/auth/sso/callback?state=${stateParam}&error=access_denied`, { cookie: `${SSO_STATE_COOKIE}=${encodeURIComponent(stateValue)}` }), out, 'callback');
assert.equal(out.headers.Location, '/login.html?sso_error=broker_failed');

// ------------------------------------------------------------ exigência no login por senha
process.env.SUPABASE_URL = 'https://arandu-test.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-test-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
delete process.env.VERCEL_ENV; delete process.env.ARANDU_DISTRIBUTED_RATE_LIMIT;
const { configureTestCommercialPolicy } = await import('./test-helpers/commercial-policy-env.mjs');
configureTestCommercialPolicy('policy-sso-test-v1');
const { default: handler } = await import(`../api/[...path].js?sso=${Date.now()}`);
async function login(rpcAnswer) {
  const seen = [];
  globalThis.fetch = async (url) => {
    seen.push(String(url));
    if (String(url).includes('/rpc/fin_sso_password_allowed')) return typeof rpcAnswer === 'function' ? rpcAnswer() : Response.json(rpcAnswer);
    return Response.json({ access_token: 'x', refresh_token: 'y', expires_in: 3600, user: { id: 'u', email: 'a@vitta.example' } });
  };
  const request = Object.assign(Readable.from([Buffer.from(JSON.stringify({ email: 'a@vitta.example', password: 'senha-teste-1' }))]), { method: 'POST', url: '/api/auth/login', headers: {}, socket: { remoteAddress: '127.0.0.9' } });
  const response = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, end(v) { this.body = JSON.parse(v || '{}'); } };
  const quiet = console.error; console.error = () => {};
  await handler(request, response);
  console.error = quiet;
  return { response, seen };
}
let attempt = await login(false);
assert.equal(attempt.response.statusCode, 403); assert.equal(attempt.response.body.code, 'sso_required');
assert.ok(!attempt.seen.some((url) => url.includes('grant_type=password')), 'senha nem chegou ao provedor');
attempt = await login(() => new Response('{"message":"boom"}', { status: 500 }));
assert.equal(attempt.response.statusCode, 503, 'consulta indisponível = falha fechada');
attempt = await login(true);
assert.equal(attempt.response.statusCode, 200);
// A página de login traduz os mesmos códigos (sem importar node:crypto no browser).
{
  const page = readFileSync('financial-auth.js', 'utf8');
  for (const [code, message] of Object.entries(SSO_REASONS)) if (code !== 'ok') assert.ok(page.includes(`${code}: '${message}'`), `login sem a mensagem de ${code}`);
}
console.log('SSO foundation: id_token estrito (issuer, audience, nonce, exp/nbf, alg, assinatura), state/PKCE, adapter Supabase, callback com motivos estáveis, exigência de SSO e prontidão aprovados.');

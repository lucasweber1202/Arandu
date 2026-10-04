// Rotas de login SSO (docs/FINANCIAL_SSO.md): descoberta por domínio, início
// (state assinado + PKCE, redireciona ao broker) e callback (valida state,
// conclui no broker, valida identidade, autoriza no banco, grava trilha).
// Falha fechada: qualquer passo inválido termina em /login.html?sso_error=<motivo>
// sem sessão — e a sessão do broker, se já criada, é encerrada.
import { randomUUID } from 'node:crypto';
import { SsoError, SSO_REASONS, createState, verifyState, validateIdentity, emailDomain, reasonFromDatabase, sha256, ssoStateConfigured } from '../../finance/sso.mjs';
import { adapterFor, supabaseSsoAdapter, mockSsoAdapter } from '../../finance/sso-adapters.mjs';

export const SSO_STATE_COOKIE = 'arandu_sso_state';

function readCookie(req, name) {
  const header = String(req.headers?.cookie || '');
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function redirect(res, location, cookies = []) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.setHeader('Cache-Control', 'no-store');
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
  res.end();
}

const stateCookie = (value) => `${SSO_STATE_COOKIE}=${encodeURIComponent(value)}; Path=/api/auth/sso; HttpOnly; SameSite=Lax; Secure; Max-Age=600`;
const clearStateCookie = () => `${SSO_STATE_COOKIE}=; Path=/api/auth/sso; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;

/**
 * @param {{ adminRpc: Function, supabaseUrl: string, anonKey: string, siteUrl: () => string|null, sessionCookie: Function,
 *           json: Function, readBody: Function, enforceRateLimit: Function, env?: object, adapters?: object, now?: () => number }} deps
 */
export function createSsoRoutes({ adminRpc, supabaseUrl, anonKey, siteUrl, sessionCookie, json, readBody, enforceRateLimit, env = process.env, adapters = null, now = () => Date.now() }) {
  const brokers = adapters || { supabase: supabaseSsoAdapter({ url: supabaseUrl, anonKey }), mock: env.ARANDU_SSO_MOCK_IDP === 'true' ? mockSsoAdapter({ env }) : null };
  const fail = (res, reason, cookies = []) => redirect(res, `/login.html?sso_error=${encodeURIComponent(Object.hasOwn(SSO_REASONS, reason) ? reason : 'broker_failed')}`, [clearStateCookie(), ...cookies]);
  const record = (connection, outcome, reason, domain, subjectHash, correlation) => adminRpc('fin_record_sso_event', {
    p_connection: connection || null, p_outcome: outcome, p_reason: reason, p_email_domain: domain || null, p_subject_hash: subjectHash || null, p_correlation: correlation
  }).catch(() => null);

  async function discover(req, res) {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'auth-sso-discover', 30, 10 * 60 * 1000);
    const body = await readBody(req);
    const domain = emailDomain(body.email);
    if (!domain) return json(res, 400, { ok: false, error: 'Informe um e-mail válido.', code: 'invalid_email' });
    const found = await adminRpc('fin_sso_discover', { p_domain: domain }).catch(() => { throw Object.assign(new Error('sso unavailable'), { status: 503 }); });
    // Resposta mínima: existe SSO? é exigido? Nada sobre organização ou provedor.
    return json(res, 200, { ok: true, sso: Boolean(found), required: Boolean(found?.enforce) });
  }

  async function start(req, res) {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'auth-sso-start', 20, 10 * 60 * 1000);
    const params = new URL(req.url, 'http://localhost').searchParams;
    const domain = emailDomain(params.get('email'));
    if (!domain) return fail(res, 'sso_unconfigured');
    if (!ssoStateConfigured(env) || !siteUrl()) return fail(res, 'broker_failed');
    const connection = await adminRpc('fin_sso_discover', { p_domain: domain }).catch(() => null);
    if (!connection) return fail(res, 'sso_unconfigured');
    try {
      const adapter = adapterFor(connection, brokers);
      const { cookie, state, pkce } = createState({ connectionId: connection.connection_id, redirect: params.get('next') || undefined, now: now() }, env);
      const { url } = await adapter.beginLogin({ connection, pkce, redirectTo: `${siteUrl()}/api/auth/sso/callback?state=${encodeURIComponent(state)}` });
      return redirect(res, url, [stateCookie(cookie)]);
    } catch (error) {
      return fail(res, error instanceof SsoError ? error.reason : 'broker_failed');
    }
  }

  async function callback(req, res) {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'auth-sso-callback', 30, 10 * 60 * 1000);
    const correlation = randomUUID();
    const params = new URL(req.url, 'http://localhost').searchParams;
    let state; let connectionId = null; let domain = null; let subjectHash = null; let session = null;
    try {
      state = verifyState(readCookie(req, SSO_STATE_COOKIE), params.get('state'), { now: now() }, env);
      connectionId = state.connectionId;
      if (params.get('error')) throw new SsoError('broker_failed');
      // Só o broker real emite sessão utilizável pelo RLS; o mock serve a testes.
      if (!brokers.supabase) throw new SsoError('broker_failed');
      const result = await brokers.supabase.completeLogin({ code: params.get('code'), verifier: state.verifier });
      session = result.session;
      domain = emailDomain(result.identity.email);
      const connection = domain ? await adminRpc('fin_sso_discover', { p_domain: domain }).catch(() => null) : null;
      if (!connection) throw new SsoError('domain_mismatch');
      if (connection.connection_id !== connectionId) throw new SsoError('org_mismatch');
      if (connection.broker !== 'supabase') throw new SsoError('mock_disabled');
      ({ subject_hash: subjectHash } = validateIdentity(result.identity, { ...connection, id: connection.connection_id }, { now: now() }));
      let access;
      try {
        access = await adminRpc('fin_sso_authorize', { p_connection: connectionId, p_user: result.userId, p_email: result.identity.email,
          p_provider_ref: result.identity.provider_ref, p_issued_at: new Date(result.identity.issued_at * 1000).toISOString() });
      } catch (error) {
        throw new SsoError(reasonFromDatabase(error?.details?.message || error?.message));
      }
      await record(connectionId, 'success', 'ok', domain, subjectHash, correlation);
      const until = Math.min(result.identity.issued_at + Number(access.max_session_hours || 12) * 3600, Math.floor(now() / 1000) + 7 * 24 * 3600);
      return redirect(res, state.redirect, [clearStateCookie(), sessionCookie(session, { c: connectionId, s: result.userId, i: result.identity.issued_at, u: until })]);
    } catch (error) {
      const reason = error instanceof SsoError ? error.reason : 'broker_failed';
      await record(connectionId, 'denied', reason, domain, subjectHash, correlation);
      // Sessão do broker criada antes da recusa: encerra.
      if (session?.access_token) {
        await fetch(`${String(supabaseUrl).replace(/\/$/, '')}/auth/v1/logout`, { method: 'POST', signal: AbortSignal.timeout(5000),
          headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}` } }).catch(() => null);
      }
      return fail(res, reason);
    }
  }

  return {
    async handle(req, res, action) {
      if (action === 'discover') return discover(req, res);
      if (action === 'start') return start(req, res);
      if (action === 'callback') return callback(req, res);
      return json(res, 404, { ok: false, error: 'Rota de SSO não encontrada.' });
    },
    sha256
  };
}

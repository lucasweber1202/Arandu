// Adapters de SSO (docs/FINANCIAL_SSO.md#adapters).
//
// Interface comum:
//   beginLogin({ connection, redirectTo, pkce }) -> { url }
//   completeLogin({ code, verifier, idToken, nonce, connection }) -> { identity, session, userId }
// `identity` = { issuer, subject, email, email_verified, provider_ref, issued_at, expires_at, amr }.
//
// * supabase: broker de produção. O Supabase Auth valida a asserção SAML do IdP
//   e devolve uma sessão via PKCE; o token é reconfirmado em /auth/v1/user.
// * mock: IdP OIDC de teste (JWKS em memória). Só existe quando
//   ARANDU_SSO_MOCK_IDP=true e o ambiente não é produção — e a conexão `mock`
//   nunca passa de `testing` no banco.
import { verifyIdToken, SsoError } from './sso.mjs';
import { resolveRuntime } from '../runtime-mode.mjs';

function claimsOf(accessToken) {
  try { return JSON.parse(Buffer.from(String(accessToken).split('.')[1], 'base64url').toString('utf8')); } catch { throw new SsoError('malformed_token'); }
}

export function supabaseSsoAdapter({ url, anonKey, fetchImpl = fetch, timeoutMs = 8000 }) {
  const base = String(url || '').replace(/\/$/, '');
  const call = async (path, init) => {
    const response = await fetchImpl(`${base}/auth/v1/${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs),
      headers: { apikey: anonKey, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new SsoError('broker_failed');
    return data;
  };
  return {
    kind: 'supabase',
    async beginLogin({ connection, redirectTo, pkce }) {
      if (!base || !anonKey || !connection?.provider_ref?.startsWith('sso:')) throw new SsoError('broker_failed');
      const data = await call('sso', { method: 'POST', body: JSON.stringify({
        provider_id: connection.provider_ref.slice(4), redirect_to: redirectTo, skip_http_redirect: true,
        code_challenge: pkce.challenge, code_challenge_method: 's256'
      }) });
      if (!/^https:\/\//.test(String(data?.url || ''))) throw new SsoError('broker_failed');
      return { url: data.url };
    },
    async completeLogin({ code, verifier }) {
      if (!/^[A-Za-z0-9-]{8,200}$/.test(String(code || '')) || !verifier) throw new SsoError('state_invalid');
      const session = await call('token?grant_type=pkce', { method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: verifier }) });
      if (!session?.access_token) throw new SsoError('broker_failed');
      // Reconfirma o token no broker (assinatura e validade são dele).
      const user = await call('user', { method: 'GET', headers: { Authorization: `Bearer ${session.access_token}` } });
      const claims = claimsOf(session.access_token);
      return {
        userId: user.id,
        session,
        identity: {
          issuer: claims.iss, subject: user.id, email: String(user.email || '').toLowerCase(), email_verified: Boolean(user.email_confirmed_at || user.confirmed_at),
          provider_ref: String(user.app_metadata?.provider || ''), issued_at: claims.iat, expires_at: claims.exp,
          amr: Array.isArray(claims.amr) ? claims.amr.map((entry) => entry?.method || entry) : []
        }
      };
    }
  };
}

export function mockSsoAdapter({ issuer, audience, jwks, env = process.env }) {
  const enabled = env.ARANDU_SSO_MOCK_IDP === 'true' && resolveRuntime(env).canUseMockIdentity;
  return {
    kind: 'mock',
    async beginLogin() {
      if (!enabled) throw new SsoError('mock_disabled');
      return { url: 'https://idp.mock.invalid/authorize' };
    },
    async completeLogin({ idToken, nonce, connection, now = Date.now() }) {
      if (!enabled) throw new SsoError('mock_disabled');
      const claims = verifyIdToken(idToken, { jwks, issuer, audience, nonce, now });
      return {
        userId: claims.sub,
        session: null,
        identity: { issuer: claims.iss, subject: claims.sub, email: String(claims.email || '').toLowerCase(), email_verified: claims.email_verified === true,
          provider_ref: connection?.provider_ref, issued_at: claims.iat, expires_at: claims.exp, amr: claims.amr || [] }
      };
    }
  };
}

/** Escolhe o adapter da conexão; broker desconhecido falha fechado. */
export function adapterFor(connection, { supabase, mock }) {
  if (connection?.broker === 'supabase' && supabase) return supabase;
  if (connection?.broker === 'mock' && mock) return mock;
  throw new SsoError(connection?.broker === 'mock' ? 'mock_disabled' : 'broker_failed');
}

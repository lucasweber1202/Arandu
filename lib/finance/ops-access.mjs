// Acesso ao console operacional financeiro.
//
// `finance_ops` é papel de PLATAFORMA (app_metadata.arandu_role, gravável só pelo
// service role), não papel de empresa e não papel administrativo legado:
// lib/admin-auth.mjs não o aceita, então nenhuma rota do admin de arte abre para
// ele. O console exige, além do papel, aal2 e o registro em
// fin_platform_operators — os dois últimos conferidos de novo no banco
// (fin_require_operator), com o JWT verificado pelo PostgREST.
//
// Como o login administrativo só emite aal2 para papéis legados, o próprio
// console faz o desafio TOTP do operador financeiro aqui.
import { authSessionCookie } from '../admin-auth.mjs';

export const FINANCE_OPS_ROLE = 'finance_ops';
const CODE = /^[0-9]{6}$/;
const ID = /^[0-9a-f-]{36}$/i;

export function tokenClaims(token) {
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1] || '', 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    return {};
  }
}

export function platformRole(token) {
  const meta = tokenClaims(token).app_metadata;
  return meta && typeof meta === 'object' ? String(meta.arandu_role || '').trim().toLowerCase() : '';
}

export function tokenAal(token) {
  return String(tokenClaims(token).aal || 'aal1');
}

export class OpsAccessError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

/** Papel e MFA do console, na ordem em que a pessoa precisa resolvê-los. */
export function requireFinanceOps(token, { mfa = true } = {}) {
  if (platformRole(token) !== FINANCE_OPS_ROLE) {
    throw new OpsAccessError(403, 'Esta área é só para operadores financeiros da plataforma (finance_ops). Papéis de empresa e o operador legado não dão acesso.', 'finance_ops_required');
  }
  if (mfa && tokenAal(token) !== 'aal2') {
    throw new OpsAccessError(403, 'Confirme o segundo fator de autenticação para abrir o console operacional.', 'mfa_required');
  }
}

export function createOpsMfa({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const base = () => {
    const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = String(env.SUPABASE_ANON_KEY || '');
    if (!url || !key) throw new OpsAccessError(503, 'Autenticação indisponível.', 'auth_unavailable');
    return { url, key };
  };
  const call = async (path, token, body) => {
    const { url, key } = base();
    const response = await fetchImpl(`${url}/auth/v1/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      signal: AbortSignal.timeout(8000),
      headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  };
  return {
    /** Abre um desafio para o fator TOTP verificado da própria conta. */
    async challenge(token) {
      requireFinanceOps(token, { mfa: false });
      const user = await call('user', token);
      if (!user.ok) throw new OpsAccessError(401, 'Entre na sua conta para continuar.', 'session_required');
      const factor = (Array.isArray(user.data?.factors) ? user.data.factors : [])
        .find((item) => item?.factor_type === 'totp' && item?.status === 'verified');
      if (!factor?.id) {
        throw new OpsAccessError(409, 'Cadastre o aplicativo autenticador antes (npm run finance:operator:mfa).', 'mfa_not_enrolled');
      }
      const challenge = await call(`factors/${encodeURIComponent(factor.id)}/challenge`, token, {});
      if (!challenge.ok || !challenge.data?.id) throw new OpsAccessError(502, 'Não foi possível iniciar a verificação. Tente de novo.', 'mfa_challenge_failed');
      return { factor_id: factor.id, challenge_id: challenge.data.id, expires_at: challenge.data.expires_at || null };
    },
    /** Confere o código e devolve o cookie da nova sessão aal2. */
    async verify(token, { factor_id: factorId, challenge_id: challengeId, code } = {}) {
      requireFinanceOps(token, { mfa: false });
      if (!ID.test(String(factorId || '')) || !ID.test(String(challengeId || '')) || !CODE.test(String(code || ''))) {
        throw new OpsAccessError(400, 'Informe o código de 6 dígitos do aplicativo autenticador.', 'mfa_payload_invalid');
      }
      const verified = await call(`factors/${encodeURIComponent(factorId)}/verify`, token, { challenge_id: challengeId, code: String(code) });
      if (!verified.ok || !verified.data?.access_token) throw new OpsAccessError(401, 'Código inválido ou expirado.', 'mfa_code_invalid');
      if (tokenAal(verified.data.access_token) !== 'aal2' || platformRole(verified.data.access_token) !== FINANCE_OPS_ROLE) {
        throw new OpsAccessError(403, 'O Supabase não confirmou o segundo fator.', 'mfa_not_confirmed');
      }
      return { cookie: authSessionCookie(verified.data) };
    }
  };
}

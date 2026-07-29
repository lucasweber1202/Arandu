const SESSION_COOKIE = 'arandu_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const ADMIN_ROLES = new Set(['admin', 'operator', 'curator']);

export class AdminAuthError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function clean(value) {
  return String(value || '').trim();
}

function supabaseConfig() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/$/, '');
  const anonKey = clean(process.env.SUPABASE_ANON_KEY);
  if (!url || !anonKey) {
    throw new AdminAuthError(503, 'Autenticação administrativa ainda não configurada.', 'admin_auth_unconfigured');
  }
  return { url, anonKey };
}

function cookieValue(req, name) {
  try {
    const pairs = String(req?.headers?.cookie || '').split(';').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, decodeURIComponent(value.join('=') || '')];
    });
    return Object.fromEntries(pairs.filter(([key]) => key))[name] || '';
  } catch {
    return '';
  }
}

export function readAuthSession(req) {
  try {
    const raw = cookieValue(req, SESSION_COOKIE);
    if (!raw) return null;
    const session = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return session?.access_token ? session : null;
  } catch {
    return null;
  }
}

export function authSessionCookie(session) {
  const value = Buffer.from(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || SESSION_MAX_AGE)
  })).toString('base64url');
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Priority=High; Max-Age=${SESSION_MAX_AGE}`;
}

export function clearAuthSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

function jwtPayload(token) {
  try {
    const part = String(token || '').split('.')[1];
    return part ? JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) : {};
  } catch {
    return {};
  }
}

async function authRequest(path, { method = 'GET', accessToken = '', body } = {}) {
  const { url, anonKey } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method,
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error_description || data.msg || data.message || `Auth ${response.status}`;
    throw new AdminAuthError(response.status === 401 ? 401 : 503, message, 'admin_auth_failed');
  }
  return data;
}

async function validatedSession(req) {
  const current = readAuthSession(req);
  if (!current?.access_token) {
    throw new AdminAuthError(401, 'Entre com uma conta administrativa.', 'admin_session_required');
  }

  const expiresSoon = Number(current.expires_at || 0) <= Math.floor(Date.now() / 1000) + 30;
  if (!expiresSoon) {
    try {
      const user = await authRequest('user', { accessToken: current.access_token });
      return { session: current, user, headers: {} };
    } catch (error) {
      if (!current.refresh_token) throw error;
    }
  }

  if (!current.refresh_token) {
    throw new AdminAuthError(401, 'A sessão administrativa expirou.', 'admin_session_expired');
  }

  try {
    const refreshed = await authRequest('token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: current.refresh_token }
    });
    const user = refreshed.user || await authRequest('user', { accessToken: refreshed.access_token });
    return {
      session: refreshed,
      user,
      headers: { 'Set-Cookie': authSessionCookie(refreshed) }
    };
  } catch {
    throw new AdminAuthError(401, 'A sessão administrativa expirou ou foi revogada.', 'admin_session_expired');
  }
}

function adminRole(user) {
  const appMetadata = user?.app_metadata && typeof user.app_metadata === 'object'
    ? user.app_metadata
    : {};
  const role = clean(appMetadata.arandu_role || appMetadata.role).toLowerCase();
  return ADMIN_ROLES.has(role) ? role : '';
}

function assuranceLevel(accessToken) {
  const payload = jwtPayload(accessToken);
  return clean(payload.aal).toLowerCase();
}

export async function requireAdmin(req, { requireMfa = true } = {}) {
  const validated = await validatedSession(req);
  const role = adminRole(validated.user);
  if (!role) {
    throw new AdminAuthError(403, 'Esta conta não possui papel administrativo.', 'admin_role_required');
  }
  if (validated.user?.banned_until || validated.user?.app_metadata?.arandu_disabled === true) {
    throw new AdminAuthError(403, 'A conta administrativa está desativada.', 'admin_account_disabled');
  }

  const aal = assuranceLevel(validated.session.access_token);
  if (requireMfa && aal !== 'aal2') {
    throw new AdminAuthError(403, 'Confirme o segundo fator para continuar.', 'admin_mfa_required');
  }

  return {
    ...validated,
    actor: {
      id: clean(validated.user.id),
      email: clean(validated.user.email).toLowerCase(),
      role,
      aal: aal || 'aal1'
    }
  };
}

export async function beginAdminMfa(req) {
  const admin = await requireAdmin(req, { requireMfa: false });
  const factor = (Array.isArray(admin.user?.factors) ? admin.user.factors : [])
    .find((item) => item?.factor_type === 'totp' && item?.status === 'verified');
  if (!factor?.id) {
    throw new AdminAuthError(409, 'A conta administrativa precisa cadastrar um fator TOTP no Supabase.', 'admin_mfa_not_enrolled');
  }
  const challenge = await authRequest(`factors/${encodeURIComponent(factor.id)}/challenge`, {
    method: 'POST',
    accessToken: admin.session.access_token,
    body: {}
  });
  return {
    factorId: factor.id,
    challengeId: challenge.id,
    expiresAt: challenge.expires_at || null,
    headers: admin.headers
  };
}

export async function verifyAdminMfa(req, { factorId, challengeId, code }) {
  const admin = await requireAdmin(req, { requireMfa: false });
  const verifiedFactor = (Array.isArray(admin.user?.factors) ? admin.user.factors : [])
    .find((item) => item?.id === factorId && item?.factor_type === 'totp' && item?.status === 'verified');
  if (!verifiedFactor) {
    throw new AdminAuthError(400, 'Fator administrativo inválido.', 'admin_mfa_factor_invalid');
  }
  if (!/^[0-9]{6}$/.test(clean(code)) || !clean(challengeId)) {
    throw new AdminAuthError(400, 'Código TOTP ou desafio inválido.', 'admin_mfa_payload_invalid');
  }
  const session = await authRequest(`factors/${encodeURIComponent(factorId)}/verify`, {
    method: 'POST',
    accessToken: admin.session.access_token,
    body: { challenge_id: clean(challengeId), code: clean(code) }
  });
  if (assuranceLevel(session.access_token) !== 'aal2') {
    throw new AdminAuthError(403, 'O Supabase não confirmou o nível MFA exigido.', 'admin_mfa_not_confirmed');
  }
  return {
    actor: admin.actor,
    headers: { 'Set-Cookie': authSessionCookie(session) }
  };
}

export function applyAdminResponseHeaders(res, headers = {}) {
  Object.entries(headers).forEach(([name, value]) => res.setHeader(name, value));
}

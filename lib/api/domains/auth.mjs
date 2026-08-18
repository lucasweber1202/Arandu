export function createAuthDomain(dependencies) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, COOKIE_NAME, MAX_AGE, EXTERNAL_REQUEST_TIMEOUT_MS, HttpError, clean, cleanEmail, json, limited, readBody, validEmail, publicProfileType, enforceRateLimit, publicSiteUrl, authConfigured, readCookie } = dependencies;

async function supabaseAuth(path, options = {}) {
  if (!authConfigured()) throw new Error('Autenticação Supabase não configurada.');
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/${path}`, {
    ...options,
    signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error_description || data.msg || data.message || `Auth ${response.status}`);
    error.upstreamStatus = response.status;
    error.upstreamCode = clean(data.error_code || data.code);
    throw error;
  }
  return data;
}

/**
 * Traduz falhas do provedor de identidade em respostas estáveis.
 *
 * As mensagens do Supabase chegam em inglês e distinguem casos que revelam a
 * existência da conta — "Email not confirmed" só aparece para e-mails
 * cadastrados, enquanto "Invalid login credentials" cobre os demais. Repassá-las
 * ao cliente entrega ao atacante um oráculo de enumeração de usuários e ainda
 * quebra o português da interface. O login passa a responder sempre a mesma
 * coisa, exceto quando o próprio provedor sinaliza excesso de tentativas.
 */
function authFailure(error, { scope }) {
  const upstream = Number(error?.upstreamStatus) || 0;
  const code = clean(error?.upstreamCode).toLowerCase();
  const detail = clean(error?.message).toLowerCase();

  if (upstream === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.', 'auth_rate_limited');
  }
  if (upstream >= 500 || upstream === 0) {
    return new HttpError(503, 'O serviço de contas está indisponível no momento. Tente novamente em instantes.', 'auth_unavailable');
  }
  if (scope === 'signup') {
    // Regras de formato podem ser devolvidas: elas não dizem nada sobre a
    // existência da conta e ajudam quem está criando o cadastro.
    if (code === 'weak_password' || detail.includes('password')) {
      return new HttpError(400, 'Escolha uma senha mais forte, com pelo menos 8 caracteres.', 'weak_password');
    }
    if (code === 'email_address_invalid' || code === 'validation_failed') {
      return new HttpError(400, 'Informe um e-mail válido.', 'invalid_email');
    }
  }
  return new HttpError(401, 'E-mail ou senha incorretos.', 'invalid_credentials');
}

/** `true` quando o provedor recusou o cadastro por a conta já existir. */
function signupAlreadyRegistered(error) {
  const code = clean(error?.upstreamCode).toLowerCase();
  const detail = clean(error?.message).toLowerCase();
  return code === 'user_already_exists' || code === 'email_exists' || detail.includes('already registered') || detail.includes('already been registered');
}


function readSessionCookie(req) {
  try {
    const value = readCookie(req, COOKIE_NAME);
    if (!value) return null;
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch { return null; }
}

function sessionCookie(session) {
  const value = Buffer.from(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || MAX_AGE)
  })).toString('base64url');
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Priority=High; Max-Age=${MAX_AGE}`;
}

function clearSessionCookie() { return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`; }

function publicUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email,
    full_name: limited(meta.full_name || meta.name || user.email, 160),
    profile_type: publicProfileType(meta.profile_type)
  };
}

async function resolveSession(req) {
  if (!authConfigured()) return { authenticated: false, mode: 'unconfigured', user: null, headers: {} };
  const session = readSessionCookie(req);
  if (!session?.access_token) return { authenticated: false, mode: 'supabase', user: null, headers: {} };

  const expiresSoon = Number(session.expires_at || 0) <= Math.floor(Date.now() / 1000) + 30;
  if (!expiresSoon) {
    try {
      const user = await supabaseAuth('user', { method: 'GET', headers: { Authorization: `Bearer ${session.access_token}` } });
      return { authenticated: true, mode: 'supabase', user: publicUser(user), accessToken: session.access_token, headers: {} };
    } catch {}
  }

  if (!session.refresh_token) return { authenticated: false, mode: 'supabase', user: null, headers: { 'Set-Cookie': clearSessionCookie() } };
  try {
    await enforceRateLimit(req, 'auth-refresh', 60, 10 * 60 * 1000);
    const refreshed = await supabaseAuth('token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const user = refreshed.user || await supabaseAuth('user', { method: 'GET', headers: { Authorization: `Bearer ${refreshed.access_token}` } });
    return {
      authenticated: true,
      mode: 'supabase',
      user: publicUser(user),
      accessToken: refreshed.access_token,
      headers: { 'Set-Cookie': sessionCookie(refreshed) }
    };
  } catch {
    return { authenticated: false, mode: 'supabase', user: null, headers: { 'Set-Cookie': clearSessionCookie() } };
  }
}

async function optionalUser(req) {
  const session = await resolveSession(req);
  return { session, user: session.authenticated ? session.user : null };
}

async function requireUser(req) {
  const session = await resolveSession(req);
  if (!session.authenticated || !session.user?.id) throw new HttpError(401, 'Entre na sua conta para acessar estes dados.');
  return session;
}


async function handleAuth(req, res, action) {
  if (action === 'session') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const session = await resolveSession(req);
    return json(res, 200, {
      ok: true,
      authenticated: session.authenticated,
      mode: session.mode,
      user: session.user
    }, session.headers);
  }

  if (action === 'logout') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const session = readSessionCookie(req);
    if (authConfigured() && session?.access_token) {
      try {
        await supabaseAuth('logout', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
      } catch {}
    }
    return json(res, 200, { ok: true, authenticated: false }, { 'Set-Cookie': clearSessionCookie() });
  }

  if (action === 'login') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'auth-login', 12, 10 * 60 * 1000);
    if (!authConfigured()) throw new HttpError(503, 'Autenticação Supabase ainda não configurada.');
    const body = await readBody(req);
    const email = cleanEmail(body.email);
    const password = String(body.password || '');
    if (!validEmail(email) || !password) throw new HttpError(400, 'Email e senha são obrigatórios.');
    await enforceRateLimit(req, 'auth-login-account', 20, 60 * 60 * 1000, email);
    let result;
    try {
      result = await supabaseAuth('token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    } catch (error) {
      throw authFailure(error, { scope: 'login' });
    }
    return json(res, 200, { ok: true, authenticated: true, user: publicUser(result.user) }, { 'Set-Cookie': sessionCookie(result) });
  }

  if (action === 'reset-password') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'auth-reset-password', 5, 60 * 60 * 1000);
    if (!authConfigured()) throw new HttpError(503, 'Autenticação Supabase ainda não configurada.');
    const body = await readBody(req);
    const email = cleanEmail(body.email);
    if (!validEmail(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    const redirectTo = publicSiteUrl() ? `${publicSiteUrl()}/login.html?recovery=1` : null;
    try {
      await supabaseAuth(`recover${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ''}`, { method: 'POST', body: JSON.stringify({ email }) });
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'auth.password_recovery_failed', message: limited(error?.message, 180) }));
    }
    return json(res, 202, { ok: true, message: 'Se existir uma conta para este e-mail, enviaremos as instruções de recuperação.' });
  }

  if (action === 'signup') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'auth-signup', 8, 60 * 60 * 1000);
    if (!authConfigured()) throw new HttpError(503, 'Autenticação Supabase ainda não configurada.');
    const body = await readBody(req);
    if (clean(body.website)) return json(res, 202, { ok: true, authenticated: false, needsEmailConfirmation: true });
    const email = cleanEmail(body.email);
    const password = String(body.password || '');
    const fullName = limited(body.fullName || body.full_name || body.name, 160);
    const profileType = 'comprador';
    if (!fullName) throw new HttpError(400, 'Nome completo é obrigatório.');
    if (!validEmail(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    if (password.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
    let result;
    try {
      result = await supabaseAuth('signup', {
        method: 'POST',
        body: JSON.stringify({ email, password, data: { full_name: fullName, profile_type: profileType } })
      });
    } catch (error) {
      // Um "já cadastrado" explícito distingue e-mails registrados dos demais e
      // vira oráculo de enumeração. A resposta é a mesma de um cadastro novo:
      // quem controla a caixa de entrada descobre o estado da conta, ninguém mais.
      if (!signupAlreadyRegistered(error)) throw authFailure(error, { scope: 'signup' });
      return json(res, 201, { ok: true, authenticated: false, needsEmailConfirmation: true, user: null });
    }
    const headers = result.access_token ? { 'Set-Cookie': sessionCookie(result) } : {};
    return json(res, 201, {
      ok: true,
      authenticated: Boolean(result.access_token),
      needsEmailConfirmation: !result.access_token,
      user: publicUser(result.user)
    }, headers);
  }

  return json(res, 404, { ok: false, error: 'Rota de autenticação não encontrada.' });
}


  return { handleAuth, optionalUser, requireUser };
}

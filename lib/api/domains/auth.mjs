import {resolveRuntime} from '../../runtime-mode.mjs';
import {BUYERS,PROVIDERS} from '../../finance/demo-personas.mjs';
import {demoTargetIdentity} from '../../finance/demo-guard.mjs';
import {LEGACY_SUPABASE_REFS,PILOT_SUPABASE_REFS,PRODUCTION_SUPABASE_REFS,DEMO_SUPABASE_REFS} from '../../finance/pilot-doctor.mjs';
import { adminSupabaseRpc, adminSupabaseRequest, hasSupabaseAccess } from '../../supabase.mjs';
import { createSsoRoutes } from './sso.mjs';
import { safeErrorEvent } from '../../observability.mjs';
import { emailDomain } from '../../finance/sso.mjs';
import { encodeSessionValue, decodeSessionValue } from '../../session-cookie.mjs';
import { WORKSPACE_COOKIE, WORKSPACE_LIMITS, clearWorkspaceCookie, newClaimToken, parseWorkspaceCookie, personaEmailIn, tokenHash, workspaceCookie, workspacePassword, workspaceSlugFromEmail } from '../../finance/demo-workspaces.mjs';

export function createAuthDomain(dependencies) {
  const { SUPABASE_URL, SUPABASE_ANON_KEY, COOKIE_NAME, MAX_AGE, EXTERNAL_REQUEST_TIMEOUT_MS, HttpError, clean, cleanEmail, json, limited, readBody, validEmail, enforceRateLimit, publicSiteUrl, authConfigured, readCookie } = dependencies;
  // SSO (docs/FINANCIAL_SSO.md): borda com service role só para as funções de
  // política fin_sso_* (descoberta, autorização, trilha); a sessão é do broker.
  const adminRpc = dependencies.adminRpc || adminSupabaseRpc;
  const ssoAvailable = dependencies.ssoAvailable || (() => hasSupabaseAccess('admin'));

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
    return decodeSessionValue(value);
  } catch { return null; }
}

// `sso` marca sessão nascida de SSO: conexão (c), usuário (s), emissão (i) e
// limite absoluto (u) definido pela política da organização.
function sessionCookie(session, sso = null) {
  const value = encodeSessionValue({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || MAX_AGE),
    ...(sso ? { sso } : {})
  });
  const maxAge = sso ? Math.max(60, Math.min(MAX_AGE, sso.u - Math.floor(Date.now() / 1000))) : MAX_AGE;
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Priority=High; Max-Age=${maxAge}`;
}

function clearSessionCookie() { return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`; }

function publicUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email,
    full_name: limited(meta.full_name || meta.name || user.email, 160)
  };
}

// Conta de workspace da Demo (e-mail +ws-<slug>, decidido pelo provedor de
// identidade, não pelo cookie) só opera enquanto o workspace está reivindicado
// e dentro da validade. Vencido ou em limpeza: a sessão cai na hora, mesmo com
// JWT ainda válido. Fora da Demo, ou conta sem workspace, nada muda.
const activeWorkspaces = new Map();
async function demoWorkspaceAllows(user) {
  const slug = workspaceSlugFromEmail(user?.email);
  if (!slug) return true;
  if (!resolveRuntime().isDemo) return false;
  const cached = activeWorkspaces.get(slug);
  if (cached && cached.until > Date.now()) return cached.active;
  let active = false;
  try { active = (await adminRpc('fin_demo_workspace_active', { p_slug: slug })) === true; } catch { active = false; }
  activeWorkspaces.set(slug, { active, until: Date.now() + (active ? 15_000 : 60_000) });
  return active;
}

/** Workspace do visitante: retoma o do cookie (token conferido no banco) ou reivindica um pronto. */
async function visitorWorkspace(req) {
  const cookie = parseWorkspaceCookie(readCookie(req, WORKSPACE_COOKIE));
  if (cookie) {
    const rows = await adminRpc('fin_demo_workspace_resume', { p_id: cookie.id, p_token_hash: tokenHash(cookie.token), p_idle_minutes: WORKSPACE_LIMITS.idleMinutes });
    if (rows?.[0]) return { workspace: rows[0], token: cookie.token, claimed: false };
  }
  await enforceRateLimit(req, 'auth-demo-claim', WORKSPACE_LIMITS.claimsPerHourPerOrigin, 60 * 60 * 1000);
  const token = newClaimToken();
  const rows = await adminRpc('fin_demo_workspace_claim', { p_token_hash: tokenHash(token), p_idle_minutes: WORKSPACE_LIMITS.idleMinutes,
    p_lifetime_minutes: WORKSPACE_LIMITS.lifetimeMinutes, p_max_active: WORKSPACE_LIMITS.maxActive });
  return rows?.[0] ? { workspace: rows[0], token, claimed: true } : null;
}

// Sessão SSO revogada, conexão desativada ou membro removido: antes só parava
// no refresh, então o access token seguia valendo até expirar (até 1 h). Agora
// a validade é conferida em toda requisição, com cache curto por sessão.
const ssoValidity = new Map();
async function ssoSessionValid(sso) {
  const key = `${sso.c}:${sso.s}:${sso.i}`;
  const cached = ssoValidity.get(key);
  if (cached && cached.until > Date.now()) return cached.valid;
  let valid = false;
  try { valid = (await adminRpc('fin_sso_session_valid', { p_connection: sso.c, p_user: sso.s, p_issued_at: new Date(Number(sso.i) * 1000).toISOString() })) === true; } catch { valid = false; }
  if (ssoValidity.size > 2000) for (const [entry, value] of ssoValidity) if (value.until <= Date.now()) ssoValidity.delete(entry);
  ssoValidity.set(key, { valid, until: Date.now() + (valid ? 30_000 : 60_000) });
  return valid;
}

async function resolveSession(req) {
  if (!authConfigured()) return { authenticated: false, mode: 'unconfigured', user: null, headers: {} };
  const session = readSessionCookie(req);
  if (!session?.access_token) return { authenticated: false, mode: 'supabase', user: null, headers: {} };
  // Sessão SSO além do limite da organização: encerra sem consultar ninguém.
  if (session.sso && Math.floor(Date.now() / 1000) > Number(session.sso.u || 0)) {
    return { authenticated: false, mode: 'supabase', user: null, headers: { 'Set-Cookie': clearSessionCookie() } };
  }
  if (session.sso && !(await ssoSessionValid(session.sso))) {
    return { authenticated: false, mode: 'supabase', user: null, headers: { 'Set-Cookie': clearSessionCookie() } };
  }

  const expiresSoon = Number(session.expires_at || 0) <= Math.floor(Date.now() / 1000) + 30;
  if (!expiresSoon) {
    try {
      const user = await supabaseAuth('user', { method: 'GET', headers: { Authorization: `Bearer ${session.access_token}` } });
      if (!(await demoWorkspaceAllows(user))) return { authenticated: false, mode: 'supabase', user: null, headers: { 'Set-Cookie': [clearSessionCookie(), clearWorkspaceCookie()] } };
      return { authenticated: true, mode: 'supabase', user: publicUser(user), accessToken: session.access_token, headers: {} };
    } catch {}
  }

  if (!session.refresh_token) return { authenticated: false, mode: 'supabase', user: null, headers: { 'Set-Cookie': clearSessionCookie() } };
  try {
    await enforceRateLimit(req, 'auth-refresh', 60, 10 * 60 * 1000);
    // No refresh, sessão SSO revogada, conexão desativada ou membro removido param aqui.
    if (session.sso) {
      ssoValidity.delete(`${session.sso.c}:${session.sso.s}:${session.sso.i}`);
      if (!(await ssoSessionValid(session.sso))) throw new Error('sso session no longer valid');
    }
    const refreshed = await supabaseAuth('token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const user = refreshed.user || await supabaseAuth('user', { method: 'GET', headers: { Authorization: `Bearer ${refreshed.access_token}` } });
    if (!(await demoWorkspaceAllows(user))) throw new Error('demo workspace no longer active');
    return {
      authenticated: true,
      mode: 'supabase',
      user: publicUser(user),
      accessToken: refreshed.access_token,
      headers: { 'Set-Cookie': sessionCookie(refreshed, session.sso || null) }
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


const sso = createSsoRoutes({ adminRpc, supabaseUrl: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, siteUrl: publicSiteUrl, sessionCookie, json, readBody, enforceRateLimit });

async function handleAuth(req, res, action) {
  if (String(action || '').startsWith('sso/')) {
    if (!authConfigured() || !ssoAvailable()) return json(res, 503, { ok: false, error: 'SSO indisponível neste ambiente.', code: 'sso_unavailable' });
    return sso.handle(req, res, action.slice(4));
  }
  if (action === 'demo-personas' || action === 'demo-login') {
    const target=demoTargetIdentity(SUPABASE_URL);
    const password=String(process.env.ARANDU_DEMO_PASSWORD||'');
    const forbidden=[...LEGACY_SUPABASE_REFS,...PILOT_SUPABASE_REFS,...PRODUCTION_SUPABASE_REFS];
    const enabled=resolveRuntime().canUseDemoPersonas && authConfigured() && target && !forbidden.includes(target.ref)
      && (target.kind==='local'||DEMO_SUPABASE_REFS.includes(target.ref))
      && password.length>=12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /[0-9]/.test(password);
    if (!enabled) throw new HttpError(404,'Recurso indisponível.','not_found');
    await enforceRateLimit(req,'auth-demo-entry',30,10*60*1000);
    let marker;
    try {marker=await adminSupabaseRequest('fin_settings?select=value&key=eq.deployment_environment&limit=1');}catch{}
    if (marker?.[0]?.value!=='demo') throw new HttpError(404,'Recurso indisponível.','not_found');
    const personas=[...Object.entries(BUYERS).map(([key,p])=>({key,...p})),...Object.entries(PROVIDERS).map(([key,p])=>({key,...p.person}))];
    if(action==='demo-personas') {
      if(req.method!=='GET')throw new HttpError(405,'Método indisponível.');
      return json(res,200,{ok:true,personas:personas.map(({key,name,title})=>({key,name,title}))});
    }
    if(req.method!=='POST')throw new HttpError(405,'Método indisponível.');
    await enforceRateLimit(req,'auth-demo-login',12,10*60*1000);
    const body=await readBody(req);
    const persona=personas.find(p=>p.key===body.persona);
    if(!persona)throw new HttpError(400,'Persona indisponível.','invalid_persona');
    // Cada visitante entra no próprio workspace; o baseline nunca é entregue.
    // A persona é só uma chave: e-mail e papel vêm do workspace gravado pelo seed.
    const visitor=await visitorWorkspace(req);
    if(!visitor)throw new HttpError(503,'A demonstração está cheia no momento. Tente novamente em alguns minutos.','demo_capacity');
    const email=personaEmailIn(visitor.workspace,persona.key);
    if(!email)throw new HttpError(503,'Demonstração indisponível.','demo_workspace_incomplete');
    await enforceRateLimit(req,'auth-login-account',20,60*60*1000,email);
    let result;
    try {result=await supabaseAuth('token?grant_type=password',{method:'POST',body:JSON.stringify({email,password:workspacePassword(password,email)})});}
    catch(error){throw authFailure(error,{scope:'login'});}
    if(result.user?.email!==email || !result.access_token)throw new HttpError(503,'Demonstração indisponível.');
    // Troca de persona: a sessão anterior é encerrada no provedor (refresh token
    // não volta a valer), não só substituída no cookie.
    const previous=readSessionCookie(req);
    if(previous?.access_token)await supabaseAuth('logout',{method:'POST',headers:{Authorization:`Bearer ${previous.access_token}`}}).catch(()=>null);
    const remaining=Math.floor((Date.parse(visitor.workspace.expires_at)-Date.now())/1000);
    return json(res,200,{ok:true,authenticated:true,user:publicUser(result.user),workspace:{expires_at:visitor.workspace.expires_at,idle_expires_at:visitor.workspace.idle_expires_at}},
      {'Set-Cookie':[sessionCookie(result),workspaceCookie(visitor.workspace.id,visitor.token,remaining)]});
  }
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
    // Teto por conta em qualquer IP: o limite acima é por IP + conta e não
    // segura tentativas distribuídas contra o mesmo e-mail (credential stuffing).
    await enforceRateLimit(req, 'auth-login-account-any', 100, 60 * 60 * 1000, email, { acrossOrigins: true });
    // Domínio com SSO exigido não entra por senha. Sem a consulta, falha fechada.
    if (ssoAvailable()) {
      let allowed;
      try { allowed = await adminRpc('fin_sso_password_allowed', { p_domain: emailDomain(email) }); } catch { allowed = null; }
      if (allowed === null) throw new HttpError(503, 'O serviço de contas está indisponível no momento. Tente novamente em instantes.', 'auth_unavailable');
      if (allowed === false) throw new HttpError(403, 'Sua empresa exige login pelo provedor corporativo (SSO). Use "Entrar com SSO".', 'sso_required');
    }
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
      // A mensagem do provedor de identidade pode ecoar o e-mail enviado: só sai redigida.
      console.error(JSON.stringify(safeErrorEvent({ status: 500, event: 'auth.password_recovery_failed', error })));
    }
    return json(res, 202, { ok: true, message: 'Se existir uma conta para este e-mail, enviaremos as instruções de recuperação.' });
  }

  // Conclusão da recuperação de senha: o link do e-mail traz um access token de
  // recuperação no fragmento da URL; a página o envia aqui uma única vez, junto
  // com a senha nova. Não abre sessão: a pessoa entra com a senha nova, e o
  // refresh token do fragmento nunca é aceito pelo servidor.
  if (action === 'update-password') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'auth-update-password', 10, 60 * 60 * 1000);
    if (!authConfigured()) throw new HttpError(503, 'Autenticação Supabase ainda não configurada.');
    const body = await readBody(req);
    const token = String(body.recovery_token || '');
    const password = String(body.password || '');
    if (!/^[A-Za-z0-9._~+/=-]{20,4096}$/.test(token)) throw new HttpError(400, 'Link de recuperação inválido. Peça um novo link.', 'invalid_recovery_link');
    if (password.length < 8 || password.length > 256) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.', 'weak_password');
    try {
      await supabaseAuth('user', { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ password }) });
    } catch (error) {
      const upstream = Number(error?.upstreamStatus) || 0;
      const code = clean(error?.upstreamCode).toLowerCase();
      if (upstream === 401 || upstream === 403 || code === 'bad_jwt' || code === 'session_not_found') {
        throw new HttpError(400, 'Este link de recuperação expirou ou já foi usado. Peça um novo link.', 'recovery_link_expired');
      }
      if (code === 'same_password') throw new HttpError(400, 'Escolha uma senha diferente da anterior.', 'same_password');
      throw authFailure(error, { scope: 'signup' });
    }
    return json(res, 200, { ok: true, message: 'Senha alterada. Entre com a nova senha.' }, { 'Set-Cookie': clearSessionCookie() });
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
    // Metadado fixo: o banco hospedado ainda anterior ao decommission da arte
    // (docs/LEGACY_ART_RETIREMENT.md) lê esse campo no gatilho de cadastro; o
    // cliente nunca escolhe papel nem perfil.
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

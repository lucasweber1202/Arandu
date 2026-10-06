// Enterprise SSO foundation — validação sem I/O (docs/FINANCIAL_SSO.md).
//
// O broker (Supabase Auth) valida a asserção/token do IdP; aqui ficam as
// regras do Arandu que valem para qualquer broker: state assinado (CSRF) com
// expiração, PKCE, verificação estrita de id_token OIDC (issuer, audience,
// nonce, exp/nbf/iat, algoritmo, assinatura por JWKS), domínio do e-mail,
// motivos de recusa estáveis e checagem de prontidão. Tudo falha fechado.
import { createHash, createHmac, createPublicKey, createVerify, randomBytes, timingSafeEqual } from 'node:crypto';

export const SSO_STATE_TTL_SECONDS = 600;
export const CLOCK_SKEW_SECONDS = 60;
const ALLOWED_ALGORITHMS = { RS256: 'RSA-SHA256', ES256: 'SHA256' };

/** Motivos estáveis (vão para a trilha e para a tela de login, nunca detalhe interno). */
export const SSO_REASONS = Object.freeze({
  ok: 'Login concluído.',
  sso_unconfigured: 'O domínio deste e-mail não tem SSO configurado. Entre com e-mail e senha.',
  sso_required: 'Sua empresa exige login pelo provedor corporativo (SSO).',
  state_invalid: 'A tentativa de login expirou ou não é válida. Comece de novo.',
  broker_failed: 'O provedor de identidade não concluiu o login. Tente de novo.',
  malformed_token: 'Resposta do provedor de identidade inválida.',
  alg_not_allowed: 'Algoritmo de assinatura não aceito.',
  signature_invalid: 'Assinatura do provedor de identidade inválida.',
  issuer_mismatch: 'O emissor da identidade não corresponde ao configurado.',
  audience_mismatch: 'A identidade não foi emitida para o Arandu.',
  nonce_mismatch: 'A resposta não corresponde a esta tentativa de login.',
  token_expired: 'A identidade expirou. Entre de novo.',
  token_not_yet_valid: 'A identidade ainda não é válida (relógio fora de sincronia).',
  email_unverified: 'O provedor não confirmou o e-mail desta conta.',
  domain_mismatch: 'O e-mail não pertence a um domínio da conexão SSO.',
  provider_mismatch: 'A conta veio de outro provedor de identidade.',
  org_mismatch: 'A conexão SSO não pertence à organização deste domínio.',
  connection_inactive: 'A conexão SSO desta organização não está ativa.',
  member_not_found: 'Sua conta ainda não foi convidada para a organização. Peça acesso ao administrador.',
  member_disabled: 'Sua conta está bloqueada nesta organização.',
  session_expired: 'Sua sessão passou do limite definido pela organização. Entre de novo.',
  session_revoked: 'As sessões SSO desta organização foram revogadas. Entre de novo.',
  mock_disabled: 'O provedor de teste não está disponível neste ambiente.'
});

/** Mapeia a exceção nomeada do banco (fin_sso_authorize) para o motivo estável. */
export function reasonFromDatabase(message) {
  const text = String(message || '');
  const table = [['sso connection inactive', 'connection_inactive'], ['sso provider mismatch', 'provider_mismatch'], ['sso domain mismatch', 'domain_mismatch'],
    ['sso org mismatch', 'org_mismatch'], ['sso session expired', 'session_expired'], ['sso session revoked', 'session_revoked'],
    ['sso member disabled', 'member_disabled'], ['sso member not found', 'member_not_found']];
  return table.find(([needle]) => text.includes(needle))?.[1] || 'broker_failed';
}

export class SsoError extends Error {
  constructor(reason) {
    super(SSO_REASONS[reason] || reason);
    this.reason = Object.hasOwn(SSO_REASONS, reason) ? reason : 'broker_failed';
  }
}

const b64url = (value) => Buffer.from(value).toString('base64url');
export const sha256 = (value) => createHash('sha256').update(String(value)).digest('hex');

export function emailDomain(email) {
  const match = /^[^@\s]+@([a-z0-9.-]+\.[a-z]{2,24})$/i.exec(String(email || '').trim());
  return match ? match[1].toLowerCase() : null;
}

// ------------------------------------------------------------- state e PKCE
export function pkcePair() {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url'), method: 'S256' };
}

function stateKey(env = process.env) {
  const secret = String(env.ARANDU_SSO_STATE_SECRET || '');
  return secret.length >= 32 ? secret : null;
}

export function ssoStateConfigured(env = process.env) {
  return Boolean(stateKey(env));
}

/** Cookie de state assinado: conexão, nonce, verificador PKCE, destino e expiração. */
export function createState({ connectionId, redirect = '/finance/dashboard.html', now = Date.now() }, env = process.env) {
  const key = stateKey(env);
  if (!key) throw new SsoError('broker_failed');
  const state = randomBytes(24).toString('base64url');
  const nonce = randomBytes(24).toString('base64url');
  const pkce = pkcePair();
  const safeRedirect = /^\/(?:provider|finance)\/[a-z-]+\.html$/.test(redirect) ? redirect : '/finance/dashboard.html';
  const payload = b64url(JSON.stringify({ s: state, n: nonce, v: pkce.verifier, c: connectionId, r: safeRedirect, e: Math.floor(now / 1000) + SSO_STATE_TTL_SECONDS }));
  const signature = createHmac('sha256', key).update(payload).digest('base64url');
  return { cookie: `${payload}.${signature}`, state, nonce, pkce };
}

/** Confere assinatura, expiração e o `state` devolvido pelo IdP (tempo constante). */
export function verifyState(cookie, returnedState, { now = Date.now() } = {}, env = process.env) {
  const key = stateKey(env);
  const [payload, signature] = String(cookie || '').split('.');
  if (!key || !payload || !signature) throw new SsoError('state_invalid');
  const expected = Buffer.from(createHmac('sha256', key).update(payload).digest('base64url'));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new SsoError('state_invalid');
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { throw new SsoError('state_invalid'); }
  if (!data?.s || !data.e || Math.floor(now / 1000) > data.e) throw new SsoError('state_invalid');
  const a = Buffer.from(String(data.s)); const b = Buffer.from(String(returnedState || ''));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new SsoError('state_invalid');
  return { state: data.s, nonce: data.n, verifier: data.v, connectionId: data.c, redirect: data.r };
}

// ------------------------------------------------------------- id_token OIDC
function decodeSegment(segment) {
  try { return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')); } catch { throw new SsoError('malformed_token'); }
}

/**
 * Verificação estrita de id_token (OIDC Core §3.1.3.7): assinatura RS256/ES256
 * por JWKS (nunca `none`/HS*), `iss` exato, `aud` contém o client_id (e `azp`
 * quando há várias audiências), `nonce` igual ao do state, `exp`/`nbf`/`iat`
 * com folga de relógio, e-mail verificado.
 */
export function verifyIdToken(token, { jwks, issuer, audience, nonce, now = Date.now(), skew = CLOCK_SKEW_SECONDS }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new SsoError('malformed_token');
  const header = decodeSegment(parts[0]);
  const claims = decodeSegment(parts[1]);
  const algorithm = ALLOWED_ALGORITHMS[header?.alg];
  if (!algorithm) throw new SsoError('alg_not_allowed');
  const keys = Array.isArray(jwks?.keys) ? jwks.keys : [];
  const jwk = keys.find((key) => (!header.kid || key.kid === header.kid) && (!key.alg || key.alg === header.alg) && (!key.use || key.use === 'sig'));
  if (!jwk) throw new SsoError('signature_invalid');
  let valid = false;
  try {
    const verifier = createVerify(algorithm);
    verifier.update(`${parts[0]}.${parts[1]}`);
    verifier.end();
    valid = verifier.verify({ key: createPublicKey({ key: jwk, format: 'jwk' }), ...(header.alg === 'ES256' ? { dsaEncoding: 'ieee-p1363' } : {}) }, Buffer.from(parts[2], 'base64url'));
  } catch { valid = false; }
  if (!valid) throw new SsoError('signature_invalid');
  if (claims.iss !== issuer) throw new SsoError('issuer_mismatch');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience) || (audiences.length > 1 && claims.azp !== audience)) throw new SsoError('audience_mismatch');
  const a = Buffer.from(String(claims.nonce || '')); const b = Buffer.from(String(nonce || ''));
  if (!nonce || a.length !== b.length || !timingSafeEqual(a, b)) throw new SsoError('nonce_mismatch');
  const seconds = Math.floor(now / 1000);
  if (!Number.isFinite(claims.exp) || seconds > claims.exp + skew) throw new SsoError('token_expired');
  if ((Number.isFinite(claims.nbf) && seconds + skew < claims.nbf) || (Number.isFinite(claims.iat) && seconds + skew < claims.iat)) throw new SsoError('token_not_yet_valid');
  if (claims.email_verified !== true) throw new SsoError('email_unverified');
  return claims;
}

// ------------------------------------------------------------- identidade
/**
 * Identidade normalizada (qualquer broker) contra a conexão descoberta.
 * O banco (fin_sso_authorize) ainda confere domínio verificado, organização,
 * membro, bloqueio, sessão máxima e revogação.
 */
export function validateIdentity(identity, connection, { now = Date.now(), skew = CLOCK_SKEW_SECONDS } = {}) {
  if (!identity || !connection) throw new SsoError('broker_failed');
  if (!['testing', 'active'].includes(connection.status)) throw new SsoError('connection_inactive');
  if (identity.provider_ref !== connection.provider_ref) throw new SsoError('provider_mismatch');
  if (identity.email_verified !== true) throw new SsoError('email_unverified');
  const domain = emailDomain(identity.email);
  if (!domain || (connection.domains && !connection.domains.includes(domain))) throw new SsoError('domain_mismatch');
  const seconds = Math.floor(now / 1000);
  if (!Number.isFinite(identity.expires_at) || seconds > identity.expires_at + skew) throw new SsoError('token_expired');
  if (Number.isFinite(identity.issued_at) && seconds + skew < identity.issued_at) throw new SsoError('token_not_yet_valid');
  return { domain, subject_hash: sha256(`${identity.issuer || ''}|${identity.subject || ''}`) };
}

// ------------------------------------------------------------- domínio
export function domainVerificationToken() {
  const token = randomBytes(24).toString('base64url');
  return { token, hash: sha256(token), record: `arandu-domain-verification=${token}` };
}

/** Procura o token esperado nos registros TXT (`dns.resolveTxt` devolve partes). */
export function txtContainsToken(records, tokenHash) {
  for (const parts of Array.isArray(records) ? records : []) {
    const value = (Array.isArray(parts) ? parts.join('') : String(parts)).trim();
    const match = /^arandu-domain-verification=([A-Za-z0-9_-]{16,64})$/.exec(value);
    if (match && sha256(match[1]) === tokenHash) return match[1];
  }
  return null;
}

// ------------------------------------------------------------- prontidão
/**
 * Checklist de prontidão de uma conexão. `blocked` = depende de ação externa
 * (IdP, Supabase, DNS); `missing` = falta configuração aqui; `ok` = feito.
 */
export function readiness({ connection, domains = [], events = [], env = process.env, brokerConfigured = false }) {
  const checks = [];
  const add = (key, status, detail) => checks.push({ key, status, detail });
  add('state_secret', ssoStateConfigured(env) ? 'ok' : 'blocked', 'ARANDU_SSO_STATE_SECRET (≥ 32 caracteres) configurado no ambiente');
  add('broker', connection?.broker === 'mock' ? 'blocked' : brokerConfigured ? 'ok' : 'blocked', 'Supabase Auth com SSO (SAML) habilitado no projeto e provedor cadastrado');
  add('provider_ref', connection?.provider_ref ? 'ok' : 'missing', 'Identificador do provedor no broker (ex.: sso:<uuid> do Supabase)');
  add('metadata', connection?.metadata_url ? 'ok' : 'missing', 'URL https de metadados SAML / discovery OIDC do IdP');
  if (connection?.protocol === 'oidc') add('oidc_claims', connection.issuer && connection.audience ? 'ok' : 'missing', 'Issuer e client_id (audience) do IdP');
  const verified = domains.filter((domain) => domain.status === 'verified' && domain.connection_id === connection?.id);
  add('domain', verified.length ? 'ok' : domains.some((domain) => domain.status === 'pending') ? 'blocked' : 'missing', 'Domínio verificado por TXT no DNS e ligado à conexão');
  add('test_login', events.some((event) => event.outcome === 'success' && event.connection_id === connection?.id) ? 'ok' : 'missing', 'Ao menos um login SSO bem-sucedido em modo de teste');
  add('status', connection?.status === 'active' ? 'ok' : 'missing', 'Conexão ativa');
  const ready = checks.every((check) => check.status === 'ok');
  // Operacional só com broker real e um login bem-sucedido registrado — nunca por configuração apenas.
  return { ready, operational: ready && connection?.broker === 'supabase', checks };
}

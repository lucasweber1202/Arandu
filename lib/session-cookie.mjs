import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Valor do cookie `arandu_session`: carga JSON em base64url + "." + HMAC-SHA256.
//
// Sem a assinatura, quem tinha o cookie (o próprio navegador, ou um cookie
// roubado) podia apagar o marcador `sso` e escapar do limite absoluto da
// organização, da revogação de sessões e da desativação da conexão SSO: o
// servidor só consultava fin_sso_session_valid quando o cookie dizia ser SSO.
// Carga sem assinatura válida é tratada como ausência de sessão.
//
// A chave deriva do segredo de servidor que já existe em todo ambiente
// hospedado (SUPABASE_SERVICE_ROLE_KEY; sem ela o limite distribuído recusa
// tudo na Vercel), com rótulo próprio: não há env novo para provisionar. Sem
// esse segredo (execução local), a chave é aleatória por processo e as sessões
// caem ao reiniciar. Trocar a service role invalida as sessões: efeito
// esperado de uma rotação de segredo.

const LABEL = 'arandu-session-cookie-v1';
let processKey = null;

function signingKey(env = process.env) {
  const secret = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (secret) return createHmac('sha256', secret).update(LABEL).digest();
  processKey ||= randomBytes(32);
  return processKey;
}

function mac(payload, env) {
  return createHmac('sha256', signingKey(env)).update(payload).digest('base64url');
}

/** Valor assinado (ainda sem encodeURIComponent) para o cookie de sessão. */
export function encodeSessionValue(session, env = process.env) {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${mac(payload, env)}`;
}

/** Carga do cookie, ou null quando falta, está malformada ou a assinatura não confere. */
export function decodeSessionValue(value, env = process.env) {
  const text = String(value || '');
  const dot = text.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = text.slice(0, dot);
  const given = Buffer.from(text.slice(dot + 1), 'base64url');
  const expected = Buffer.from(mac(payload, env), 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return session && typeof session === 'object' && !Array.isArray(session) ? session : null;
  } catch { return null; }
}

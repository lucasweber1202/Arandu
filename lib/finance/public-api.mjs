// Public API v1 & Webhooks — primitivas sem I/O (docs/FINANCIAL_PUBLIC_API.md).
//
// Token: gerado aqui (256 bits), mostrado uma vez; o banco guarda só sha256.
// Assinatura de webhook: HMAC-SHA256 sobre `timestamp.delivery_id.body`.
// Segredo do webhook: cifrado com AES-256-GCM antes de ir ao banco.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

export { API_VERSION, API_SCOPES, SCOPE_LABELS, WEBHOOK_EVENTS } from './api-catalog.mjs';
export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 25;

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Base62 sem viés: descarta bytes >= 248 (62 × 4). */
function base62(length) {
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte < 248) out += BASE62[byte % 62];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Ambiente no prefixo do token (`arnd_pilot_…`), para reconhecer vazamento por ambiente. */
export function tokenEnvironment(env = process.env) {
  const value = String(env.ARANDU_ENV || env.ARANDU_DEPLOYMENT_KIND || env.VERCEL_ENV || 'test').toLowerCase().replace(/[^a-z]/g, '');
  return (value.length >= 2 ? value : 'test').slice(0, 10);
}

/** Token novo: 43 caracteres base62 (~256 bits). Devolve token, hash e prefixo. */
export function generateApiToken(env = process.env) {
  const secret = base62(43);
  const token = `arnd_${tokenEnvironment(env)}_${secret}`;
  return { token, hash: hashToken(token), prefix: `arnd_${tokenEnvironment(env)}_${secret.slice(0, 6)}` };
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Bearer bem formado ou nulo (nunca registrado em log). */
export function bearerToken(header) {
  const match = /^Bearer\s+(arnd_[a-z]{2,10}_[A-Za-z0-9]{20,80})$/.exec(String(header || '').trim());
  return match ? match[1] : null;
}

export function correlationId(header) {
  const value = String(header || '').trim();
  return /^[A-Za-z0-9._:-]{8,80}$/.test(value) ? value : randomUUID();
}

/** JSON canônico (chaves ordenadas) para a impressão do pedido idempotente. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value ?? null);
}

export function requestFingerprint(method, route, body) {
  return createHash('sha256').update(`${String(method).toUpperCase()} ${route}\n${canonicalJson(body ?? {})}`).digest('hex');
}

export function validIdempotencyKey(value) {
  return /^[A-Za-z0-9._:-]{8,200}$/.test(String(value || ''));
}

// ------------------------------------------------------------- paginação
export function encodeCursor(parts) {
  return Buffer.from(JSON.stringify(parts)).toString('base64url');
}

/** Cursor opaco de keyset; inválido = erro do cliente, nunca página silenciosa. */
export function decodeCursor(value, keys) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || !keys.every((key) => typeof parsed[key] === 'string' && parsed[key].length <= 200)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

export function pageSize(value) {
  if (value === null || value === undefined || value === '') return DEFAULT_PAGE_SIZE;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= MAX_PAGE_SIZE ? number : null;
}

/** Recorta `limit + 1` linhas em página + próximo cursor. */
export function paginate(rows, limit, cursorOf) {
  const list = Array.isArray(rows) ? rows : [];
  const hasMore = list.length > limit;
  const data = list.slice(0, limit);
  return { data, page: { limit, has_more: hasMore, next_cursor: hasMore ? encodeCursor(cursorOf(data[data.length - 1])) : null } };
}

export function optionalUuid(value) {
  if (value === null || value === undefined || value === '') return null;
  return UUID.test(String(value)) ? String(value).toLowerCase() : undefined;
}

// ------------------------------------------------------------- webhooks
export function generateWebhookSecret() {
  return `whsec_${randomBytes(32).toString('base64url')}`;
}

/** `Arandu-Signature: t=<unix>,v1=<hex>` sobre `t.delivery_id.body`. */
export function signWebhook(secret, { timestamp, deliveryId, body }) {
  const t = Math.floor(Number(timestamp));
  const digest = createHmac('sha256', String(secret)).update(`${t}.${deliveryId}.${body}`).digest('hex');
  return `t=${t},v1=${digest}`;
}

/**
 * Verificação do lado de quem recebe (documentada e usada nos testes):
 * janela de tempo + HMAC em tempo constante. Deduplicar `delivery_id` é
 * responsabilidade do receptor (proteção contra replay dentro da janela).
 */
export function verifyWebhook(secret, { header, deliveryId, body, now = Date.now(), toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS }) {
  const parts = Object.fromEntries(String(header || '').split(',').map((item) => item.split('=').map((part) => part.trim())).filter((pair) => pair.length === 2));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(parts.v1 || '')) return { ok: false, reason: 'malformed' };
  if (Math.abs(Math.floor(now / 1000) - t) > toleranceSeconds) return { ok: false, reason: 'timestamp_out_of_tolerance' };
  const expected = createHmac('sha256', String(secret)).update(`${t}.${deliveryId}.${body}`).digest();
  const given = Buffer.from(parts.v1, 'hex');
  return expected.length === given.length && timingSafeEqual(expected, given) ? { ok: true } : { ok: false, reason: 'signature_mismatch' };
}

function webhookKeys(env = process.env) {
  const keys = new Map();
  for (const [version, raw] of [[1, env.ARANDU_WEBHOOK_SECRET_KEY], [0, env.ARANDU_WEBHOOK_SECRET_KEY_PREVIOUS]]) {
    if (!raw) continue;
    const key = Buffer.from(String(raw), 'base64');
    if (key.length === 32) keys.set(version, key);
  }
  return keys;
}

export function webhookSecretsConfigured(env = process.env) {
  return webhookKeys(env).has(1);
}

/** Cifra o segredo (AES-256-GCM, chave de 32 bytes em base64 no ambiente). */
export function encryptSecret(plain, env = process.env) {
  const key = webhookKeys(env).get(1);
  if (!key) throw Object.assign(new Error('webhook secret key unconfigured'), { code: 'webhook_secret_key_unconfigured' });
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptSecret(value, env = process.env) {
  const match = /^v([0-9]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(value || ''));
  if (!match) throw Object.assign(new Error('invalid secret ciphertext'), { code: 'secret_unavailable' });
  const keys = webhookKeys(env);
  const candidates = Number(match[1]) === 1 ? [keys.get(1), keys.get(0)] : [keys.get(Number(match[1]))];
  for (const key of candidates.filter(Boolean)) {
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(match[2], 'base64url'));
      decipher.setAuthTag(Buffer.from(match[3], 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(match[4], 'base64url')), decipher.final()]).toString('utf8');
    } catch { /* tenta a chave anterior (rotação) */ }
  }
  throw Object.assign(new Error('secret unavailable'), { code: 'secret_unavailable' });
}

// ------------------------------------------------------------- SSRF
/** Endereço que um webhook nunca pode alcançar (privado, loopback, link-local, CGNAT, multicast, ULA...). */
export function isBlockedAddress(address) {
  const ip = String(address || '').replace(/^\[|\]$/g, '').toLowerCase();
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (kind === 6) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('::ffff:')) return isBlockedAddress(ip.slice(7));
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(ip) || ip.startsWith('64:ff9b:') || ip.startsWith('2001:db8');
  }
  return true;
}

/** Mesmo critério de fin_valid_webhook_url: https público, porta 443, sem credencial. */
export function validWebhookUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || String(value).length > 500) return false;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host) || isIP(host.replace(/^\[|\]$/g, ''))) return false;
  return host.includes('.');
}

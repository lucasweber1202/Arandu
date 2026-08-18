/**
 * Guardas HTTP compartilhadas pelas funções serverless da Arandu.
 *
 * O cookie de sessão é `HttpOnly; SameSite=Lax; Secure`, o que já bloqueia a
 * maior parte dos ataques CSRF. Esta camada é defesa em profundidade: navegadores
 * sempre enviam `Origin` e `Sec-Fetch-Site` em requisições de escrita, então
 * qualquer escrita vinda de outro site é recusada antes de tocar no banco.
 *
 * Clientes não-navegador (scripts de verificação, integrações servidor a servidor)
 * não enviam esses cabeçalhos e continuam permitidos — eles não carregam cookies
 * de sessão de terceiros e autenticam por sessão administrativa.
 */

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

const REJECTION = Object.freeze({
  status: 403,
  error: 'Solicitação bloqueada por origem não autorizada.',
  code: 'cross_origin_blocked'
});

export function requestHost(req) {
  const host = String(req?.headers?.host || '').split(',')[0].trim().toLowerCase();
  const forwarded = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim().toLowerCase();
  const candidate = host || forwarded;
  if (!candidate || candidate.length > 255 || /[\s\\/@]/.test(candidate)) return '';
  try { return new URL(`https://${candidate}`).host.toLowerCase(); } catch { return ''; }
}

/**
 * @returns {null | { status: number, error: string, code: string }}
 *   `null` quando a requisição é aceitável; caso contrário, a recusa a devolver.
 */
export function crossOriginRejection(req) {
  if (!STATE_CHANGING_METHODS.has(String(req?.method || '').toUpperCase())) return null;

  const fetchSite = String(req?.headers?.['sec-fetch-site'] || '').trim().toLowerCase();
  if (fetchSite && !ALLOWED_FETCH_SITES.has(fetchSite)) return REJECTION;

  const origin = String(req?.headers?.origin || '').trim();
  // `Origin: null` é emitido por contextos sandboxados, arquivos locais e
  // documentos opacos. Nunca é uma prova aceitável de mesma origem.
  if (origin === 'null') return REJECTION;
  // Clientes servidor-a-servidor não enviam Fetch Metadata nem Origin. Se há
  // sinal de navegador, a ausência de Origin em uma escrita falha de forma
  // fechada.
  if (!origin) return fetchSite ? REJECTION : null;

  const host = requestHost(req);
  if (!host) return REJECTION;

  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    return REJECTION;
  }
  if (!['http:', 'https:'].includes(originUrl.protocol) || originUrl.host.toLowerCase() !== host) return REJECTION;

  const forwardedProtocol = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  if (forwardedProtocol && !['http', 'https'].includes(forwardedProtocol)) return REJECTION;
  if (forwardedProtocol && originUrl.protocol !== `${forwardedProtocol}:`) return REJECTION;
  if (process.env.VERCEL_ENV && originUrl.protocol !== 'https:') return REJECTION;
  return null;
}

/** Cabeçalhos de segurança aplicados a toda resposta de API. */
export function applyApiSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Vary', 'Origin, Cookie');
}

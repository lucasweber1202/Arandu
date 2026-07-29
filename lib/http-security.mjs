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
 * de sessão de terceiros e autenticam por token administrativo.
 */

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_FETCH_SITES = new Set(['same-origin', 'same-site', 'none']);

const REJECTION = Object.freeze({
  status: 403,
  error: 'Solicitação bloqueada por origem não autorizada.',
  code: 'cross_origin_blocked'
});

export function requestHost(req) {
  const forwarded = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim();
  return (forwarded || String(req?.headers?.host || '')).trim().toLowerCase();
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
  if (!origin || origin === 'null') return null;

  const host = requestHost(req);
  if (!host) return REJECTION;

  let originHost = '';
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return REJECTION;
  }
  return originHost === host ? null : REJECTION;
}

/** Cabeçalhos de segurança aplicados a toda resposta de API. */
export function applyApiSecurityHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Vary', 'Origin, Cookie');
}

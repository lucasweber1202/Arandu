import { ownSiteUrl } from '../../public-site-url.mjs';
import { clean, validEmail } from '../../api-core.mjs';

// /.well-known/security.txt (RFC 9116) e a URL canônica do site usada pelo
// login (recuperação de senha) e pelo SSO. Sem contato válido e prazo futuro
// configurados, responde 404: um security.txt vencido ou inventado é pior que
// nenhum.

export function publicSiteUrl() {
  return ownSiteUrl(clean(process.env.ARANDU_SITE_URL)) || null;
}

function validUrl(value) {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}

export async function handleSecurityText(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end();
  }
  const contact = clean(process.env.ARANDU_SECURITY_CONTACT);
  const expires = clean(process.env.ARANDU_SECURITY_EXPIRES);
  const expiresAt = Date.parse(expires);
  const mailto = contact.startsWith('mailto:') && validEmail(contact.slice(7));
  const https = contact.startsWith('https://') && validUrl(contact);
  if ((!mailto && !https) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    return res.end();
  }
  const canonical = publicSiteUrl();
  const body = [
    `Contact: ${contact}`,
    `Expires: ${new Date(expiresAt).toISOString()}`,
    ...(canonical ? [`Canonical: ${canonical}/.well-known/security.txt`] : []),
    'Preferred-Languages: pt-BR, en',
    ''
  ].join('\n');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
  return res.end(req.method === 'HEAD' ? undefined : body);
}

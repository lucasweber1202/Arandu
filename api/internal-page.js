import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AdminAuthError, applyAdminResponseHeaders, requireAdmin } from '../lib/admin-auth.mjs';
import { INTERNAL_PAGE_SET } from '../lib/internal-pages.mjs';

function pageName(req) {
  const url = new URL(req.url, 'http://localhost');
  return String(url.searchParams.get('page') || '').replace(/^\/+/, '');
}

function redirectToLogin(res, page) {
  res.statusCode = 302;
  res.setHeader('Location', `/admin-login.html?next=${encodeURIComponent(`/${page}`)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.end();
}

export default async function handler(req, res) {
  const page = pageName(req);
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end('Método não permitido.');
  }
  if (!INTERNAL_PAGE_SET.has(page)) {
    res.statusCode = 404;
    return res.end('Página interna não encontrada.');
  }

  try {
    const admin = await requireAdmin(req);
    const source = await readFile(resolve(process.cwd(), page), 'utf8');
    const bridge = '<script src="/js/admin-session-bridge.js"></script>';
    const html = source.includes('</head>') ? source.replace('</head>', `${bridge}</head>`) : `${bridge}${source}`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; frame-src 'none'; font-src 'self' data:; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://va.vercel-scripts.com; connect-src 'self' https://*.supabase.co https://va.vercel-scripts.com https://vitals.vercel-insights.com");
    applyAdminResponseHeaders(res, admin.headers);
    return res.end(html);
  } catch (error) {
    if (error instanceof AdminAuthError && ['admin_session_required', 'admin_session_expired', 'admin_mfa_required'].includes(error.code)) {
      return redirectToLogin(res, page);
    }
    res.statusCode = Number(error?.status) || 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.end(res.statusCode < 500 ? error.message : 'Não foi possível abrir a página interna.');
  }
}

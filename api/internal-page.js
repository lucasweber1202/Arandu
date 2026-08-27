import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AdminAuthError, applyAdminResponseHeaders, requireAdmin } from '../lib/admin-auth.mjs';
import { requireAdminPermission } from '../lib/admin-rbac.mjs';
import { INTERNAL_PAGE_SET, permissionForInternalPage } from '../lib/internal-pages.mjs';
import { presentationModeEnabled, withPresentationAssets } from '../lib/presentation-mode.mjs';
import { applyOwnerConsole, renderConsole } from '../lib/owner-console.mjs';
import { escapeHtml as escapeDocHtml, isSafeDocName, renderDoc, renderDocIndex } from '../lib/owner-docs.mjs';

const PRESENTATION_PAGES = new Set(['demo.html', 'admin-preview.html']);
const CONSOLE_ASSETS = '<link rel="stylesheet" href="/css/arandu-admin.css?v=20260825-console-1">';
const SESSION_BRIDGE = '<script src="/js/admin-session-bridge.js"></script>';

function pageName(req) {
  const url = new URL(req.url, 'http://localhost');
  return String(url.searchParams.get('page') || '').replace(/^\/+/, '');
}

function docName(req) {
  const url = new URL(req.url, 'http://localhost');
  return String(url.searchParams.get('doc') || '').replace(/^\/+/, '');
}

function docPage(title, content) {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8" />'
    + '<meta name="viewport" content="width=device-width, initial-scale=1.0" />'
    + '<meta name="robots" content="noindex,nofollow,noarchive" />'
    + `<title>${escapeDocHtml(title)} — Arandu</title>`
    + '<link rel="stylesheet" href="/css/arandu-system.css" />'
    + CONSOLE_ASSETS + SESSION_BRIDGE + '</head>'
    + '<body class="owner-console-page"><a class="skip-link" href="#conteudo-principal">Pular para o conteúdo</a>'
    + renderConsole('docs/README.md')
    + `<main id="conteudo-principal" class="owner-doc">${content}</main></body></html>`;
}

function applyInternalHeaders(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; frame-src 'none'; font-src 'self' data:; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' https://va.vercel-scripts.com; connect-src 'self' https://*.supabase.co https://va.vercel-scripts.com https://vitals.vercel-insights.com");
}

function redirectToLogin(res, target) {
  res.statusCode = 302;
  res.setHeader('Location', `/admin-login.html?next=${encodeURIComponent(`/${target}`)}`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.end();
}

export default async function handler(req, res) {
  const page = pageName(req);
  const doc = docName(req);
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end('Método não permitido.');
  }
  if (!doc && !INTERNAL_PAGE_SET.has(page)) {
    res.statusCode = 404;
    return res.end('Página interna não encontrada.');
  }
  if (doc && !isSafeDocName(doc)) {
    res.statusCode = 404;
    return res.end('Manual não encontrado.');
  }

  const target = doc ? `docs/${doc}` : page;

  try {
    if (!doc && presentationModeEnabled() && PRESENTATION_PAGES.has(page)) {
      const html = withPresentationAssets(await readFile(resolve(process.cwd(), page), 'utf8'));
      res.statusCode = 200;
      applyInternalHeaders(res);
      res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'");
      return res.end(html);
    }

    const admin = await requireAdmin(req);
    // Os manuais descrevem a operação e o go-live: mesma permissão das telas de
    // sistema que já os citavam.
    const [resource, action] = doc ? ['diagnostics', 'read'] : permissionForInternalPage(page);
    requireAdminPermission(admin.actor, resource, action);

    let html;
    if (doc) {
      const content = doc === 'README.md' ? await renderDocIndex() : await renderDoc(doc);
      if (!content) {
        res.statusCode = 404;
        applyInternalHeaders(res);
        applyAdminResponseHeaders(res, admin.headers);
        return res.end(docPage('Manual não encontrado', '<h1>Manual não encontrado</h1><p>Esse arquivo não existe em <code>docs/</code>. <a href="/docs/README.md">Ver a lista de manuais</a>.</p>'));
      }
      html = docPage(doc, content);
    } else {
      html = applyOwnerConsole(await readFile(resolve(process.cwd(), page), 'utf8'), page);
    }

    res.statusCode = 200;
    applyInternalHeaders(res);
    applyAdminResponseHeaders(res, admin.headers);
    return res.end(html);
  } catch (error) {
    if (error instanceof AdminAuthError && ['admin_session_required', 'admin_session_expired', 'admin_mfa_required'].includes(error.code)) {
      return redirectToLogin(res, target);
    }
    res.statusCode = Number(error?.status) || 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return res.end(res.statusCode < 500 ? error.message : 'Não foi possível abrir a página interna.');
  }
}

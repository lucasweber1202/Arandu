// Superfície legada de arte no ambiente do piloto financeiro.
//
// O piloto usa um Supabase dedicado com dados reais de empresas. As rotas da
// vertical de arte (formulários, reservas, catálogo, admin de arte, pedidos,
// upload de mídia, painéis) não têm interface publicada e, abertas, gravavam
// no banco do piloto com a service role — um POST anônimo em /api/forms
// criava lead com nome e e-mail. Com ARANDU_ENV=pilot ou production (a produção
// oficial é o mesmo produto financeiro, com banco próprio) elas respondem 404,
// como rota inexistente. Ficam abertos só o domínio financeiro, o cron de
// renovação, a conta (auth/*) usada pelo login financeiro, o despachante de
// e-mail e o health check.
//
// No projeto demonstrativo (ARANDU_DEPLOYMENT_KIND=demo) não há banco nem
// segredo: a demonstração roda inteira no navegador. Ali toda a API, inclusive
// o domínio financeiro, auth/* e os crons, responde 404 — só o health check e o
// security.txt seguem vivos.
import { applyApiSecurityHeaders } from './http-security.mjs';

export const PILOT_API_ROUTES = Object.freeze(['finance/*', 'jobs/renewals', 'jobs/webhooks', 'jobs/governance', 'v1/*', 'auth/*', 'security-contact']);

export function demoDeployment(env = process.env) {
  return String(env.ARANDU_DEPLOYMENT_KIND || '').trim().toLowerCase() === 'demo';
}

// ARANDU_ENV=demo (o ambiente de demonstração com banco DEMO próprio) é o
// mesmo produto financeiro: fecha a superfície legada como piloto e produção.
//
// Qualquer deployment de produção da Vercel também fecha, mesmo sem ARANDU_ENV:
// em 29/09/2026 o projeto de produção estava no ar sem a variável e roteava
// /api/forms, /api/catalog e /api/pilot/* para o banco configurado. Esquecer
// uma variável não pode reabrir a superfície aposentada.
export function legacyArtSurfaceClosed(env = process.env) {
  return demoDeployment(env)
    || String(env.VERCEL_ENV || '').trim().toLowerCase() === 'production'
    || ['demo', 'pilot', 'production'].includes(String(env.ARANDU_ENV || '').trim().toLowerCase());
}

export function pilotRouteAllowed(route, env = process.env) {
  const value = String(route || '');
  if (demoDeployment(env)) return value === 'security-contact';
  return value.startsWith('finance/') || value === 'jobs/renewals' || value === 'jobs/webhooks' || value === 'jobs/governance' || value === 'v1' || value.startsWith('v1/')
    || value.startsWith('auth/') || value === 'security-contact';
}

export function rejectLegacyArtRoute(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  applyApiSecurityHeaders(res);
  res.end(JSON.stringify({ ok: false, error: 'Rota de API não encontrada.', code: 'legacy_surface_closed' }));
  return undefined;
}

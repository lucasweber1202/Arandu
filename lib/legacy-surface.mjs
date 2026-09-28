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
import { applyApiSecurityHeaders } from './http-security.mjs';

export const PILOT_API_ROUTES = Object.freeze(['finance/*', 'jobs/renewals', 'auth/*', 'security-contact']);

export function legacyArtSurfaceClosed(env = process.env) {
  return ['pilot', 'production'].includes(String(env.ARANDU_ENV || '').trim().toLowerCase());
}

export function pilotRouteAllowed(route) {
  const value = String(route || '');
  return value.startsWith('finance/') || value === 'jobs/renewals' || value.startsWith('auth/') || value === 'security-contact';
}

export function rejectLegacyArtRoute(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  applyApiSecurityHeaders(res);
  res.end(JSON.stringify({ ok: false, error: 'Rota de API não encontrada.', code: 'legacy_surface_closed' }));
  return undefined;
}

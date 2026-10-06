// Superfície da API por tipo de deployment.
//
// Piloto, produção e o ambiente demo com banco (ARANDU_ENV=pilot|production|demo,
// ou qualquer deployment de produção da Vercel mesmo sem ARANDU_ENV) atendem só
// as rotas financeiras: finance/*, auth/*, v1/*, os crons e o security.txt. O
// roteador já não tem outra rota; esta lista é a segunda barreira e o contrato
// que o doctor do piloto confere de fora.
//
// No projeto demonstrativo (ARANDU_DEPLOYMENT_KIND=demo) não há banco nem
// segredo: a demonstração roda inteira no navegador. Ali toda a API, inclusive
// o domínio financeiro, auth/* e os crons, responde 404 — só o health check e o
// security.txt seguem vivos.
import { applyApiSecurityHeaders } from './http-security.mjs';
import { SERVER_ENVIRONMENTS } from './runtime-mode.mjs';

export const PILOT_API_ROUTES = Object.freeze(['finance/*', 'jobs/renewals', 'jobs/webhooks', 'jobs/governance', 'v1/*', 'auth/*', 'security-contact']);

export function demoDeployment(env = process.env) {
  return String(env.ARANDU_DEPLOYMENT_KIND || '').trim().toLowerCase() === 'demo';
}

// Em 29/09/2026 o projeto de produção estava no ar sem ARANDU_ENV e roteava
// rotas que não eram do produto financeiro para o banco configurado. Esquecer
// uma variável não pode reabrir a superfície.
export function restrictedDeployment(env = process.env) {
  return demoDeployment(env)
    || String(env.VERCEL_ENV || '').trim().toLowerCase() === 'production'
    || SERVER_ENVIRONMENTS.includes(String(env.ARANDU_ENV || '').trim().toLowerCase());
}

export function routeAllowed(route, env = process.env) {
  const value = String(route || '');
  if (demoDeployment(env)) return value === 'security-contact';
  return value.startsWith('finance/') || value === 'jobs/renewals' || value === 'jobs/webhooks' || value === 'jobs/governance' || value === 'v1' || value.startsWith('v1/')
    || value.startsWith('auth/') || value === 'security-contact';
}

export function rejectClosedRoute(res) {
  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  applyApiSecurityHeaders(res);
  res.end(JSON.stringify({ ok: false, error: 'Rota de API não encontrada.', code: 'route_not_found' }));
  return undefined;
}

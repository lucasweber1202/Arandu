import { createHash } from 'node:crypto';
import { createAuthDomain } from '../lib/api/domains/auth.mjs';
import { handleSecurityText, publicSiteUrl } from '../lib/api/domains/security-contact.mjs';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { handleFinanceJobs } from '../lib/api/domains/finance-jobs.mjs';
import { handlePublicApi } from '../lib/api/domains/public-api.mjs';
import { reportError } from '../lib/observability.mjs';
import { crossOriginRejection } from '../lib/http-security.mjs';
import { restrictedDeployment, routeAllowed, rejectClosedRoute } from '../lib/deployment-surface.mjs';
import {
  HttpError,
  clean,
  cleanEmail,
  json,
  limited,
  readBody,
  safeRequestId,
  trueFlag,
  validEmail
} from '../lib/api-core.mjs';

// Roteador único da API do Arandu Financial Procurement. Rotas atendidas:
// finance/*, auth/*, jobs/{renewals,webhooks,governance}, v1/* e
// /.well-known/security.txt. Qualquer outra rota é 404 — a antiga vertical de
// arte foi aposentada (docs/LEGACY_ART_RETIREMENT.md) e não tem handler aqui.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const COOKIE_NAME = 'arandu_session';
const MAX_AGE = 60 * 60 * 24 * 7;
const RATE_LIMITS = new Map();
const EXTERNAL_REQUEST_TIMEOUT_MS = Math.max(1_000, Math.min(Number(process.env.ARANDU_EXTERNAL_REQUEST_TIMEOUT_MS) || 8_000, 30_000));

function authConfigured() { return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY); }
function enforceSameOrigin(req) {
  const rejection = crossOriginRejection(req);
  if (rejection) throw new HttpError(rejection.status, rejection.error, rejection.code);
}

function clientFingerprint(req, scope, identity = '') {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';
  return createHash('sha256').update(`${scope}:${ip}:${clean(identity).toLowerCase()}`).digest('hex');
}

function enforceMemoryRateLimit(req, scope, limit, windowMs, identity = '') {
  const now = Date.now();
  if (RATE_LIMITS.size > 2000) {
    for (const [entryKey, value] of RATE_LIMITS) if (value.resetAt <= now) RATE_LIMITS.delete(entryKey);
  }
  const key = clientFingerprint(req, scope, identity);
  const current = RATE_LIMITS.get(key);
  if (!current || current.resetAt <= now) {
    RATE_LIMITS.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
}

async function enforceRateLimit(req, scope, limit, windowMs, identity = '') {
  const distributed = trueFlag(process.env.ARANDU_DISTRIBUTED_RATE_LIMIT) || Boolean(process.env.VERCEL_ENV);
  if (!distributed) return enforceMemoryRateLimit(req, scope, limit, windowMs, identity);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new HttpError(503, 'A proteção distribuída contra abuso ainda não foi configurada.', 'rate_limit_unconfigured');
  }
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/consume_rate_limit`, {
    method: 'POST',
    signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_scope: scope,
      p_fingerprint: clientFingerprint(req, scope, identity),
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000))
    })
  });
  const allowed = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(503, 'A proteção contra abuso está temporariamente indisponível.', 'rate_limit_unavailable');
  if (allowed !== true) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
}

function readCookie(req, name) {
  try {
    const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, decodeURIComponent(value.join('=') || '')];
    }).filter(([key]) => key));
    return cookies[name] || '';
  } catch { return null; }
}

const { handleAuth, requireUser } = createAuthDomain({
  SUPABASE_URL, SUPABASE_ANON_KEY, COOKIE_NAME, MAX_AGE, EXTERNAL_REQUEST_TIMEOUT_MS,
  HttpError, clean, cleanEmail, json, limited, readBody, validEmail,
  enforceRateLimit, publicSiteUrl, authConfigured, readCookie
});

// Na Vercel fora do Next.js, `api/[...path].js` só recebe um segmento: rotas
// como /api/finance/rfqs chegam aqui pelo rewrite `/api/:scope/:rest+` de
// vercel.json. Em rewrite, `req.url` mantém o caminho original — por isso
// /.well-known/security.txt precisa ser reconhecido pelo próprio caminho.
function routeFrom(req) {
  const original = new URL(req.url, 'http://localhost').pathname;
  if (original === '/.well-known/security.txt') return 'security-contact';
  const pathname = original.replace(/^\/api\/?/, '').replace(/\/$/, '');
  return pathname || 'index';
}

export default async function handler(req, res) {
  const requestId = safeRequestId(req.headers?.['x-request-id']);
  req.aranduRequestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  try {
    enforceSameOrigin(req);
    const route = routeFrom(req);
    // Demonstração: só o security.txt. Piloto/produção: só as rotas
    // financeiras abaixo (a mesma lista que o roteador atende).
    if (restrictedDeployment() && !routeAllowed(route)) return rejectClosedRoute(res);
    if (route === 'security-contact') return await handleSecurityText(req, res);
    // Agenda de renovação (cron do Vercel, segredo obrigatório, service role).
    if (route === 'jobs/renewals') return await handleFinanceJobs(req, res, 'renewals');
    // Entrega de webhooks (cron/agendador externo com o mesmo segredo, service role).
    if (route === 'jobs/webhooks') return await handleFinanceJobs(req, res, 'webhooks');
    // Governança de dados: retenção, export e offboarding (mesmo segredo, service role).
    if (route === 'jobs/governance') return await handleFinanceJobs(req, res, 'governance');
    // Public API v1: máquina-a-máquina com token de conta de serviço; o envelope
    // de erro é o da v1 (docs/FINANCIAL_PUBLIC_API.md).
    if (route === 'v1' || route.startsWith('v1/')) return await handlePublicApi(req, res, route.slice(2).replace(/^\//, ''));
    // Procurement financeiro B2B: sessão de usuário e isolamento multi-tenant
    // garantidos pelo RLS do Supabase.
    if (route.startsWith('finance/')) return await handleFinance(req, res, route.slice('finance/'.length), { requireUser, enforceRateLimit });
    if (route.startsWith('auth/')) return await handleAuth(req, res, route.slice('auth/'.length));
    return json(res, 404, { ok: false, error: 'Rota de API não encontrada.', code: 'route_not_found' });
  } catch (error) {
    const route = routeFrom(req);
    // O domínio financeiro nunca repassa a mensagem bruta do Postgres: ela
    // revelaria nomes de tabela, policies e a existência de registros de
    // outra organização.
    if (route.startsWith('finance/') && !(error instanceof HttpError)) {
      const upstream = Number(error?.status);
      const status = [400, 401, 403, 404, 409].includes(upstream) ? upstream : 503;
      if (status >= 500) {
        await reportError({
          service: 'arandu-finance-api', requestId, route: 'finance', status,
          code: 'upstream_unavailable', method: req.method,
          error: new Error('Financial procurement upstream unavailable')
        });
      }
      return json(res, status, {
        ok: false,
        error: status === 503 ? 'Serviço temporariamente indisponível.' : 'Operação inválida ou sem permissão.',
        requestId
      });
    }
    const fallbackStatus = route === 'auth/login' ? 401 : route === 'auth/signup' ? 400 : 500;
    const status = Number(error?.status) || fallbackStatus;
    const message = error instanceof HttpError || status < 500
      ? error.message || 'Não foi possível concluir a solicitação.'
      : 'Não foi possível concluir a solicitação agora.';
    if (status >= 500) {
      await reportError({ service: 'arandu-api', requestId, route, status, code: error?.code, method: req.method, error });
    }
    return json(res, status, { ok: false, error: message, requestId, ...(error?.code ? { code: error.code } : {}) });
  }
}

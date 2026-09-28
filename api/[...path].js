import { createHash, timingSafeEqual } from 'node:crypto';
import { createAuthDomain } from '../lib/api/domains/auth.mjs';
import { createPilotDomain } from '../lib/api/domains/pilot.mjs';
import { createPublicContentDomain } from '../lib/api/domains/public-content.mjs';
import { createIntakeDomain } from '../lib/api/domains/intake.mjs';
import { createAdminOperationsDomain } from '../lib/api/domains/admin-operations.mjs';
import { createSelectionsDomain } from '../lib/api/domains/selections.mjs';
import { createAccountsDomain } from '../lib/api/domains/accounts.mjs';
import { createPrivacyDomain } from '../lib/api/domains/privacy.mjs';
import { createDashboardDomain } from '../lib/api/domains/dashboard.mjs';
import { handleFinance } from '../lib/api/domains/finance.mjs';
import { handleFinanceJobs } from '../lib/api/domains/finance-jobs.mjs';

import { AdminAuthError, applyAdminResponseHeaders, requireAdmin } from '../lib/admin-auth.mjs';
import { requireAdminPermission } from '../lib/admin-rbac.mjs';
import {
  assertTransition,
  describeFlow,
  elevatedActionFor,
  entityForPanel,
  statusFieldFor
} from '../lib/operational-status.mjs';
import {
  ACCOUNT_CAPABILITIES,
  artistPortalArtist,
  artistPortalArtwork,
  companyPortalBrief,
  declaredProfileType,
  requireCapability,
  resolveCapabilities,
  ARTIST_PORTAL_ARTWORK_FIELDS,
  COMPANY_PORTAL_BRIEF_FIELDS
} from '../lib/profile-access.mjs';
import { requireCommercialPolicy } from '../lib/commercial-policy.mjs';
import { reportError } from '../lib/observability.mjs';
import { crossOriginRejection } from '../lib/http-security.mjs';
import { legacyArtSurfaceClosed, pilotRouteAllowed, rejectLegacyArtRoute } from '../lib/legacy-surface.mjs';
import {
  HttpError,
  clean,
  cleanEmail,
  cleanPhone,
  escapeHtml,
  html,
  json,
  limited,
  readBody,
  safeObject,
  safeRequestId,
  trueFlag,
  validEmail
} from '../lib/api-core.mjs';
import {
  accountReservation,
  accountSelection,
  normalizeFormPayload,
  normalizeProposal,
  normalizeReservation,
  normalizeSelection,
  publicSelection
} from '../lib/api-dtos.mjs';
import {
  adminSupabaseRequest,
  adminSupabaseCount,
  adminSupabaseRpc,
  auditRequestHeaders,
  hasSupabaseAccess,
  publicSupabaseRequest,
  userSupabaseRequest
} from '../lib/supabase.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const COOKIE_NAME = 'arandu_session';
const PILOT_COOKIE_NAME = 'arandu_pilot';
const MAX_AGE = 60 * 60 * 24 * 7;
const PILOT_MAX_AGE = 60 * 60 * 24 * 30;
const PUBLIC_PROFILE_TYPES = new Set(['comprador', 'artista', 'empresa', 'arquiteto']);
const RATE_LIMITS = new Map();
const PILOT_EVENT_TYPES = new Set(['page_view','search','artwork_view','selection_add','reservation_start','reservation_complete','form_submit','pilot_task']);
const PILOT_SEVERITIES = new Set(['info','low','medium','high','critical']);
const PILOT_BLOCKER_STATUSES = new Set(['open','mitigated','resolved','not_applicable']);
// `submit_artist_application` é o evento que mede a beta: sem ele não há como
// saber se o tráfego virou candidatura de artista. Exige a migration
// docs/supabase-beta-conversion-events.sql, que amplia o CHECK da tabela.
const CONVERSION_EVENT_TYPES = new Set(['search','catalog_view','artwork_view','selection_add','contact_start','reservation_start','reservation_complete','submit_artist_application']);
const PRIVACY_REQUEST_TYPES = new Set(['access','correction','deletion','portability']);
const EDITORIAL_STATUSES = new Set(['draft','documentation_pending','curatorial_review','approved','published','rejected','archived']);
const CONSENT_VERSION = String(process.env.ARANDU_CONSENT_VERSION || '').trim();
const EXTERNAL_REQUEST_TIMEOUT_MS = Math.max(1_000, Math.min(Number(process.env.ARANDU_EXTERNAL_REQUEST_TIMEOUT_MS) || 8_000, 30_000));

function hasDataConfig() { return hasSupabaseAccess('admin'); }
function hasPublicDataConfig() { return hasSupabaseAccess('public'); }
function authConfigured() { return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY); }
function requireDataConfig() {
  if (!hasDataConfig()) throw new HttpError(503, 'O banco de produção ainda não está configurado.', 'database_unconfigured');
}
function firstRecord(data) { return Array.isArray(data) ? data[0] || null : data; }
function consentVersionConfigured() {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/.test(CONSENT_VERSION);
}
function requireCommercialReady() {
  return requireCommercialPolicy();
}
function publicProfileType(value) { const type = clean(value).toLowerCase(); return PUBLIC_PROFILE_TYPES.has(type) ? type : 'comprador'; }
function validUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol); } catch { return false; } }
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

async function dataRequest(resource, options = {}) {
  return adminSupabaseRequest(resource, {
    ...options,
    prefer: options.headers?.Prefer ?? options.prefer,
    headers: Object.fromEntries(Object.entries(options.headers || {}).filter(([key]) => key.toLowerCase() !== 'prefer'))
  });
}

async function publicDataRequest(resource, options = {}) {
  if (!hasPublicDataConfig()) throw new HttpError(503, 'A leitura pública segura do Supabase ainda não foi configurada.', 'public_database_unconfigured');
  return publicSupabaseRequest(resource, options);
}

async function writeAudit({ actorType, actorRef, action, entityType = null, entityId = null, metadata = {} }) {
  await dataRequest('audit_logs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      actor_type: actorType,
      actor_ref: limited(actorRef, 160) || null,
      action: limited(action, 120),
      entity_type: limited(entityType, 80) || null,
      entity_id: limited(entityId, 160) || null,
      metadata: safeObject(metadata)
    })
  });
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function operationIdentity(req, user = null, actor = null) {
  const reference = actor?.id || user?.id || `visitor:${clientFingerprint(req, 'operation-identity')}`;
  return {
    reference,
    hash: createHash('sha256').update(reference).digest('hex'),
    actorType: actor ? 'admin' : user ? 'user' : 'system'
  };
}

async function beginIdempotency(req, scope, body, identity) {
  const rawKey = limited(req.headers?.['idempotency-key'], 128);
  if (!rawKey) throw new HttpError(400, 'Idempotency-Key é obrigatória para esta operação.', 'idempotency_key_required');
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(rawKey)) throw new HttpError(400, 'Idempotency-Key inválida.');
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const requestHash = createHash('sha256').update(canonicalJson(body || {})).digest('hex');
  const result = firstRecord(await adminSupabaseRpc('acquire_idempotency', {
    p_scope: scope,
    p_key_hash: keyHash,
    p_identity_hash: identity.hash,
    p_request_hash: requestHash,
    p_lock_seconds: 120,
    p_ttl_seconds: 86400
  }));
  const outcome = result?.outcome;
  if (outcome === 'replay') return { replay: true, status: result.response_status, payload: result.response_body };
  if (outcome === 'identity_conflict') throw new HttpError(409, 'Esta chave pertence a outra identidade.', 'idempotency_identity_conflict');
  if (outcome === 'payload_conflict') throw new HttpError(409, 'A mesma chave foi usada com dados diferentes.', 'idempotency_payload_conflict');
  if (outcome === 'in_progress') throw new HttpError(409, 'Esta solicitação já está sendo processada.', 'idempotency_in_progress');
  if (outcome !== 'acquired') throw new HttpError(503, 'Não foi possível adquirir a chave de idempotência.', 'idempotency_unavailable');
  return { replay: false, scope, keyHash, requestHash, identityHash: identity.hash };
}

async function failIdempotency(context, error) {
  if (!context || context.replay) return;
  await adminSupabaseRpc('fail_idempotency', {
    p_scope: context.scope,
    p_key_hash: context.keyHash,
    p_identity_hash: context.identityHash,
    p_request_hash: context.requestHash,
    p_error_code: limited(error?.code || error?.message || 'operation_failed', 120)
  }).catch(() => null);
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

async function adminGuard(req, res, resource = null, action = null) {
  try {
    await enforceRateLimit(req, 'admin-api', 300, 10 * 60 * 1000);
    const admin = await requireAdmin(req);
    await enforceRateLimit(req, 'admin-account', 600, 10 * 60 * 1000, admin.actor.id);
    applyAdminResponseHeaders(res, admin.headers);
    if (!hasDataConfig()) return { ok: false, status: 503, error: 'O banco de produção ainda não está configurado.', code: 'database_unconfigured' };
    if (resource && action) requireAdminPermission(admin.actor, resource, action);
    return { ok: true, actor: admin.actor };
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return { ok: false, status: error.status, error: error.message, code: error.code };
    }
    throw error;
  }
}

const baseDomainDependencies = {
  createHash,
  timingSafeEqual,
  requireAdminPermission,
  assertTransition,
  describeFlow,
  elevatedActionFor,
  entityForPanel,
  statusFieldFor,
  ACCOUNT_CAPABILITIES,
  artistPortalArtist,
  artistPortalArtwork,
  companyPortalBrief,
  declaredProfileType,
  requireCapability,
  resolveCapabilities,
  ARTIST_PORTAL_ARTWORK_FIELDS,
  COMPANY_PORTAL_BRIEF_FIELDS,
  HttpError,
  clean,
  cleanEmail,
  cleanPhone,
  escapeHtml,
  html,
  json,
  limited,
  readBody,
  safeObject,
  trueFlag,
  validEmail,
  accountReservation,
  accountSelection,
  normalizeFormPayload,
  normalizeProposal,
  normalizeReservation,
  normalizeSelection,
  publicSelection,
  adminSupabaseCount,
  adminSupabaseRpc,
  auditRequestHeaders,
  userSupabaseRequest,
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_ANON_KEY,
  COOKIE_NAME,
  PILOT_COOKIE_NAME,
  MAX_AGE,
  PILOT_MAX_AGE,
  PILOT_EVENT_TYPES,
  PILOT_SEVERITIES,
  PILOT_BLOCKER_STATUSES,
  CONVERSION_EVENT_TYPES,
  PRIVACY_REQUEST_TYPES,
  EDITORIAL_STATUSES,
  CONSENT_VERSION,
  EXTERNAL_REQUEST_TIMEOUT_MS,
  hasDataConfig,
  hasPublicDataConfig,
  authConfigured,
  requireDataConfig,
  firstRecord,
  consentVersionConfigured,
  requireCommercialReady,
  publicProfileType,
  validUrl,
  enforceRateLimit,
  dataRequest,
  publicDataRequest,
  writeAudit,
  operationIdentity,
  beginIdempotency,
  failIdempotency,
  readCookie,
  adminGuard
};

const pilotDomain = createPilotDomain(baseDomainDependencies);
const {
  handleEvents,
  handlePilot,
  pilotEnabled,
  pilotConfigured,
  pilotAuthenticated,
  validPilotSessionId
} = pilotDomain;
const {
  handleSecurityText,
  handleCertificates,
  handleCertificateDocument,
  handleCatalog,
  handleArtists,
  handlePublicConfig,
  publicSiteUrl
} = createPublicContentDomain({ ...baseDomainDependencies, ...pilotDomain });
const authDomain = createAuthDomain({ ...baseDomainDependencies, publicSiteUrl });
const { handleAuth, optionalUser, requireUser } = authDomain;
const sharedDomainDependencies = {
  ...baseDomainDependencies,
  ...pilotDomain,
  ...authDomain
};
const { handleForms, handleReservations, handleProposals } = createIntakeDomain(sharedDomainDependencies);
const {
  handleAdmin,
  handleAdminUpdate,
  handleOperational,
  handleMedia,
  handleCatalogReview
} = createAdminOperationsDomain(sharedDomainDependencies);
const { handleSelections } = createSelectionsDomain(sharedDomainDependencies);
const { handleAccount, handlePortal, handleArtistAccounts } = createAccountsDomain(sharedDomainDependencies);
const { handlePrivacy, handleConversionEvents } = createPrivacyDomain(sharedDomainDependencies);
const { handleDashboard, handleQuality } = createDashboardDomain(sharedDomainDependencies);

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
    if (legacyArtSurfaceClosed() && !pilotRouteAllowed(route)) return rejectLegacyArtRoute(res);
    if (route === 'security-contact') return await handleSecurityText(req, res);
    // Procurement financeiro B2B: domínio próprio, com sessão de usuário e
    // isolamento multi-tenant garantidos pelo RLS do Supabase.
    // Agenda de renovação (cron do Vercel, segredo obrigatório, service role).
    if (route === 'jobs/renewals') return await handleFinanceJobs(req, res, 'renewals');
    if (route.startsWith('finance/')) return await handleFinance(req, res, route.slice('finance/'.length), { requireUser, enforceRateLimit });
    if (route === 'forms') return await handleForms(req, res);
    if (route === 'reservations') return await handleReservations(req, res);
    if (route === 'proposals') { requireCommercialReady(); return await handleProposals(req, res); }
    if (route === 'certificates') return await handleCertificates(req, res);
    if (route === 'certificate-document') return await handleCertificateDocument(req, res);
    if (route === 'catalog') return await handleCatalog(req, res);
    if (route === 'artists') return await handleArtists(req, res);
    if (route === 'public-config') return await handlePublicConfig(req, res);
    if (route === 'events') return await handleEvents(req, res);
    if (route === 'conversion-events') return await handleConversionEvents(req, res);
    if (route.startsWith('pilot/')) return await handlePilot(req, res, route.split('/')[1]);
    if (route.startsWith('privacy/')) return await handlePrivacy(req, res, route.split('/')[1]);
    if (route === 'catalog-review') return await handleCatalogReview(req, res);
    if (route === 'admin') return await handleAdmin(req, res);
    if (route === 'admin-update') return await handleAdminUpdate(req, res);
    if (route === 'operational') return await handleOperational(req, res);
    if (route === 'media') return await handleMedia(req, res);
    if (route === 'selections') return await handleSelections(req, res);
    if (route === 'account') return await handleAccount(req, res);
    if (route.startsWith('portal/')) return await handlePortal(req, res, route.split('/')[1]);
    if (route === 'artist-accounts') return await handleArtistAccounts(req, res);
    if (route === 'dashboard') return await handleDashboard(req, res);
    if (route === 'admin/quality') return await handleQuality(req, res);
    if (route.startsWith('auth/')) return await handleAuth(req, res, route.split('/')[1]);
    return json(res, 404, { ok: false, error: 'Rota de API não encontrada.', route });
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
    const ownershipMigrationPending = /user_id/i.test(String(error?.message || '')) && /(column|schema cache|does not exist|não existe)/i.test(String(error?.message || ''));
    const status = ownershipMigrationPending ? 503 : Number(error?.status) || fallbackStatus;
    const message = ownershipMigrationPending
      ? 'Atualização do banco pendente. Aplique a migration do Sprint 1 antes de publicar esta versão.'
      : error instanceof HttpError || status < 500
        ? error.message || 'Não foi possível concluir a solicitação.'
        : 'Não foi possível concluir a solicitação agora.';
    if (status >= 500 && !(error instanceof HttpError && error.code === 'catalog_not_verified')) {
      await reportError({ service: 'arandu-api', requestId, route, status, code: error?.code, method: req.method, error });
    }
    if (route === 'certificate-document') return html(res, status, `<h1>Erro ao gerar certificado</h1><p>${escapeHtml(message)}</p>`);
    return json(res, status, { ok: false, error: message, requestId, ...(error?.code ? { code: error.code } : {}) });
  }
}

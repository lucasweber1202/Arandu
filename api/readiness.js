import { randomUUID } from 'node:crypto';
import { AdminAuthError, applyAdminResponseHeaders, requireAdmin } from '../lib/admin-auth.mjs';
import { requireAdminPermission } from '../lib/admin-rbac.mjs';
import { applyApiSecurityHeaders } from '../lib/http-security.mjs';
import { enforceSensitiveRateLimit } from '../lib/rate-limit.mjs';
import { inspectCommercialPolicy } from '../lib/commercial-policy.mjs';
import { inspectEmailConfiguration } from '../lib/email.mjs';

const PROBE_TIMEOUT_MS = 6000;
const REQUIRED_TABLES = [
  'artists',
  'artworks',
  'profiles',
  'saved_selections',
  'reservations',
  'orders',
  'privacy_requests',
  'api_rate_limits'
];
const REQUIRED_VIEWS = [
  'v_catalog_readiness',
  'v_public_artists',
  'v_public_catalog',
  'v_public_collections',
  'v_catalog_editorial_readiness',
  'v_sales_pipeline'
];

function clean(value) {
  return String(value || '').trim();
}

function enabled(name) {
  return ['1', 'true', 'yes', 'sim'].includes(clean(process.env[name]).toLowerCase());
}

function configured(name) {
  return Boolean(clean(process.env[name]));
}

function validCommercialConfiguration() {
  return inspectCommercialPolicy().ready;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function productionSiteConfigured() {
  try {
    const url = new URL(process.env.ARANDU_SITE_URL);
    return url.protocol === 'https:' && !url.hostname.endsWith('.vercel.app') && url.hostname !== 'localhost';
  } catch {
    return false;
  }
}

function recentBackupVerified() {
  const timestamp = Date.parse(clean(process.env.ARANDU_BACKUP_VERIFIED_AT));
  return Number.isFinite(timestamp) && timestamp <= Date.now() && Date.now() - timestamp <= 30 * 24 * 60 * 60 * 1000;
}

function buildChecks() {
  const whatsapp = clean(process.env.ARANDU_WHATSAPP_NUMBER).replace(/\D/g, '');
  return {
    supabaseUrl: configured('SUPABASE_URL'),
    supabaseAnonKey: configured('SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: configured('SUPABASE_SERVICE_ROLE_KEY'),
    adminAuth: configured('SUPABASE_URL') && configured('SUPABASE_ANON_KEY'),
    adminMfaRequired: true,
    siteUrl: productionSiteConfigured(),
    contactChannel: whatsapp.length >= 12 || validEmail(process.env.ARANDU_CONTACT_EMAIL),
    privacyContact: validEmail(process.env.ARANDU_PRIVACY_CONTACT_EMAIL || process.env.ARANDU_CONTACT_EMAIL),
    brandReady: enabled('ARANDU_BRAND_READY'),
    commercialReady: enabled('ARANDU_COMMERCIAL_READY'),
    commercialPolicyConfigured: validCommercialConfiguration(),
    transactionalEmail: inspectEmailConfiguration().ready,
    distributedRateLimit: enabled('ARANDU_DISTRIBUTED_RATE_LIMIT'),
    errorMonitoring: enabled('ARANDU_ERROR_MONITORING_READY'),
    backupVerified: recentBackupVerified(),
    pilotApproved: enabled('ARANDU_PILOT_APPROVED')
  };
}

async function probe(resource) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const base = clean(process.env.SUPABASE_URL).replace(/\/$/, '');
    const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    const response = await fetch(`${base}/rest/v1/${resource}?select=*&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      signal: controller.signal
    });
    return {
      resource,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - startedAt
    };
  } catch (error) {
    return {
      resource,
      ok: false,
      status: error?.name === 'AbortError' ? 'timeout' : 'error',
      ms: Date.now() - startedAt
    };
  } finally {
    clearTimeout(timeout);
  }
}

function json(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  applyApiSecurityHeaders(res);
  applyAdminResponseHeaders(res, headers);
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  const requestId = clean(req.headers?.['x-request-id']).slice(0, 80) || randomUUID();
  res.setHeader('X-Request-ID', requestId);
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.', requestId });
    const admin = await requireAdmin(req);
    requireAdminPermission(admin.actor, 'diagnostics', 'read');
    await enforceSensitiveRateLimit(req, 'admin-readiness', {
      limit: 30,
      windowMs: 10 * 60 * 1000,
      identity: admin.actor.id
    });
    const checks = buildChecks();
    const databaseConfigured = checks.supabaseUrl && checks.supabaseServiceRoleKey;
    const probes = databaseConfigured
      ? await Promise.all([...REQUIRED_TABLES, ...REQUIRED_VIEWS].map(probe))
      : [];
    const databaseReady = probes.length > 0 && probes.every((item) => item.ok);
    const productionReady = Object.values(checks).every(Boolean) && databaseReady;
    const missing = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name);
    const launchReadiness = {
      technical: checks.supabaseUrl && checks.supabaseAnonKey && checks.supabaseServiceRoleKey && checks.adminAuth,
      database: databaseReady,
      contact: checks.contactChannel,
      domain: checks.siteUrl,
      brand: checks.brandReady,
      commercial: checks.commercialReady && checks.commercialPolicyConfigured,
      transactionalEmail: checks.transactionalEmail,
      privacy: checks.privacyContact,
      abuseProtection: checks.distributedRateLimit,
      monitoring: checks.errorMonitoring,
      backup: checks.backupVerified,
      pilot: checks.pilotApproved,
      nextCriticalActions: missing.map((name) => `Concluir e comprovar: ${name}.`)
    };

    return json(res, 200, {
      ok: true,
      service: 'arandu-api',
      status: productionReady ? 'ready' : 'not_ready',
      checkedAt: new Date().toISOString(),
      environment: clean(process.env.VERCEL_ENV || process.env.NODE_ENV || 'local'),
      commit: clean(process.env.VERCEL_GIT_COMMIT_SHA) || null,
      actor: admin.actor,
      productionReady,
      verifiedReady: productionReady,
      databaseReady,
      missing,
      checks,
      launchReadiness,
      probes: {
        supabase: {
          configured: databaseConfigured,
          ok: databaseReady,
          resources: probes
        }
      }
    }, admin.headers);
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) {
      console.error(JSON.stringify({
        level: 'error',
        service: 'arandu-readiness',
        requestId,
        status,
        code: error?.code || null,
        message: clean(error?.message).slice(0, 180)
      }));
    }
    return json(res, status, {
      ok: false,
      error: status < 500 ? error.message : 'Não foi possível verificar a prontidão.',
      ...(error instanceof AdminAuthError && error.code ? { code: error.code } : {}),
      requestId
    });
  }
}

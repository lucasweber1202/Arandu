const ROUTES = [
  '/api/forms',
  '/api/reservations',
  '/api/proposals',
  '/api/catalog',
  '/api/artists',
  '/api/public-config',
  '/api/events',
  '/api/pilot/session',
  '/api/pilot/access',
  '/api/pilot/feedback',
  '/api/pilot/metrics',
  '/api/certificates',
  '/api/certificate-document',
  '/api/admin',
  '/api/admin-update',
  '/api/operational',
  '/api/media',
  '/api/selections',
  '/api/account',
  '/api/dashboard',
  '/api/auth/session',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout'
];

const REQUIRED_ENV = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ARANDU_ADMIN_TOKEN',
  'ARANDU_SITE_URL'
];

const CONTACT_ENV = ['ARANDU_WHATSAPP_NUMBER', 'ARANDU_CONTACT_EMAIL'];
const SUPABASE_TIMEOUT_MS = 6000;

function configured(name) {
  return Boolean(String(process.env[name] || '').trim());
}

function configuredAny(names) {
  return names.some((name) => configured(name));
}

function enabled(name) {
  return ['1','true','yes','sim'].includes(String(process.env[name] || '').trim().toLowerCase());
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function productionSiteConfigured() {
  try {
    const url = new URL(process.env.ARANDU_SITE_URL);
    return url.protocol === 'https:' && !url.hostname.endsWith('.vercel.app') && url.hostname !== 'localhost';
  } catch {
    return false;
  }
}

function cleanNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function getSupabaseProjectRef() {
  if (!configured('SUPABASE_URL')) return null;
  try {
    return new URL(process.env.SUPABASE_URL).hostname.split('.')[0] || null;
  } catch {
    return 'url-invalida';
  }
}

function sanitizeError(error) {
  return String(error?.message || error || 'Erro desconhecido')
    .replace(String(process.env.SUPABASE_SERVICE_ROLE_KEY || ''), '[service-role]')
    .replace(String(process.env.SUPABASE_ANON_KEY || ''), '[anon-key]')
    .slice(0, 220);
}

function baseSupabaseHeaders() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: ''
  };
}

async function probeSupabaseResource(label, resource, exposeSample = false) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  try {
    const baseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/rest/v1/${resource}`, {
      method: 'GET',
      headers: baseSupabaseHeaders(),
      signal: controller.signal
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {}

    return {
      label,
      ok: response.ok,
      status: response.status,
      ms: Date.now() - startedAt,
      count: Array.isArray(parsed) ? parsed.length : null,
      error: response.ok ? null : sanitizeError(parsed?.message || parsed?.error || text || `HTTP ${response.status}`),
      ...(exposeSample && Array.isArray(parsed) ? { sample: parsed[0] || null } : {})
    };
  } catch (error) {
    return {
      label,
      ok: false,
      status: error?.name === 'AbortError' ? 'timeout' : 'error',
      ms: Date.now() - startedAt,
      count: null,
      error: sanitizeError(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runSupabaseProbes(enabled) {
  if (!enabled) return { skipped: true, reason: 'Adicione ?probe=1 para validar conexão real com Supabase.' };
  if (!configured('SUPABASE_URL') || !configuredAny(['SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])) {
    return { skipped: false, configured: false, ok: false, resources: [], reason: 'Variáveis Supabase ausentes.' };
  }

  const resources = await Promise.all([
    probeSupabaseResource('Tabela artists', 'artists?select=id&limit=1'),
    probeSupabaseResource('Tabela artworks', 'artworks?select=id&limit=1'),
    probeSupabaseResource('Perfis de conta', 'profiles?select=id,profile_type&limit=1'),
    probeSupabaseResource('Propriedade das seleções', 'saved_selections?select=id,user_id,public_token&limit=1'),
    probeSupabaseResource('Propriedade das reservas', 'reservations?select=id,user_id&limit=1'),
    probeSupabaseResource('Prontidão do catálogo', 'v_catalog_readiness?select=id,dataset_version,dataset_kind,release_approved,write_verified_at,verified_artist_count,verified_artwork_count,required_artist_count,required_artwork_count,verified_ready&limit=1', true),
    probeSupabaseResource('View v_public_artists', 'v_public_artists?select=id&limit=1'),
    probeSupabaseResource('View v_public_catalog', 'v_public_catalog?select=id&limit=1'),
    probeSupabaseResource('View v_public_collections', 'v_public_collections?select=id&limit=1'),
    probeSupabaseResource('View v_sales_pipeline', 'v_sales_pipeline?select=id&limit=1')
  ]);

  return {
    skipped: false,
    configured: true,
    ok: resources.every((item) => item.ok),
    projectRef: getSupabaseProjectRef(),
    resources
  };
}

function buildChecks() {
  const whatsappDigits = cleanNumber(process.env.ARANDU_WHATSAPP_NUMBER);
  const pilotEnabled = enabled('ARANDU_PILOT_ENABLED');
  const pilotAccessCode = String(process.env.ARANDU_PILOT_ACCESS_CODE || '').length >= 10;
  const pilotSecret = String(process.env.ARANDU_PILOT_SECRET || '').length >= 32;
  const pilotApproved = enabled('ARANDU_PILOT_APPROVED');
  const checks = {
    api: true,
    mainRouter: true,
    supabaseUrl: configured('SUPABASE_URL'),
    supabaseAnonKey: configured('SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: configured('SUPABASE_SERVICE_ROLE_KEY'),
    adminToken: configured('ARANDU_ADMIN_TOKEN'),
    siteUrl: productionSiteConfigured(),
    whatsappNumber: whatsappDigits.length >= 12,
    contactEmail: validEmail(process.env.ARANDU_CONTACT_EMAIL),
    contactChannel: whatsappDigits.length >= 12 || validEmail(process.env.ARANDU_CONTACT_EMAIL),
    brandReady: enabled('ARANDU_BRAND_READY'),
    commercialReady: enabled('ARANDU_COMMERCIAL_READY'),
    pilotEnabled,
    pilotAccessCode,
    pilotSecret,
    pilotReady: pilotEnabled && pilotAccessCode && pilotSecret,
    pilotApproved
  };

  return checks;
}

function missingFrom(checks) {
  const missing = REQUIRED_ENV.filter((name) => !configured(name));
  if (!checks.siteUrl && !missing.includes('ARANDU_SITE_URL')) missing.push('ARANDU_SITE_URL válido em domínio próprio');
  if (!checks.contactChannel) missing.push('ARANDU_WHATSAPP_NUMBER ou ARANDU_CONTACT_EMAIL');
  if (!checks.brandReady) missing.push('ARANDU_BRAND_READY');
  if (!checks.commercialReady) missing.push('ARANDU_COMMERCIAL_READY');
  if (checks.pilotEnabled && !checks.pilotAccessCode) missing.push('ARANDU_PILOT_ACCESS_CODE');
  if (checks.pilotEnabled && !checks.pilotSecret) missing.push('ARANDU_PILOT_SECRET');
  if (!checks.pilotApproved) missing.push('ARANDU_PILOT_APPROVED');
  return missing;
}

function nextCriticalActions(checks, supabaseProbe, catalogReady) {
  const actions = [
    !checks.supabaseUrl || !checks.supabaseAnonKey || !checks.supabaseServiceRoleKey ? 'Configurar SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY na Vercel.' : null,
    !checks.adminToken ? 'Configurar ARANDU_ADMIN_TOKEN na Vercel.' : null,
    !checks.siteUrl ? 'Configurar ARANDU_SITE_URL com o domínio real de produção.' : null,
    !checks.contactChannel ? 'Configurar WhatsApp real ou e-mail de atendimento.' : null,
    !checks.brandReady ? 'Aprovar a identidade visual final e definir ARANDU_BRAND_READY=true.' : null,
    !checks.commercialReady ? 'Aprovar a política comercial e definir ARANDU_COMMERCIAL_READY=true.' : null,
    checks.pilotEnabled && !checks.pilotReady ? 'Completar código e segredo do piloto fechado.' : null,
    !checks.pilotApproved ? 'Concluir o piloto fechado, resolver bloqueadores e definir ARANDU_PILOT_APPROVED=true.' : null,
    supabaseProbe && supabaseProbe.skipped ? 'Rodar /api/health?probe=1 para testar tabelas e views reais do Supabase.' : null,
    supabaseProbe && !supabaseProbe.skipped && !supabaseProbe.ok ? 'Corrigir tabelas/views/policies do Supabase indicadas nos probes.' : null,
    supabaseProbe && !supabaseProbe.skipped && supabaseProbe.ok && !catalogReady ? 'Aprovar o catálogo real, validar 5 artistas e 20 obras e concluir o teste de escrita.' : null
  ];

  return actions.filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end(JSON.stringify({ ok: false, error: 'Método não permitido.' }));
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const shouldProbe = ['1', 'true', 'yes'].includes(String(url.searchParams.get('probe') || '').toLowerCase());
  const checks = buildChecks();
  const supabaseProbe = await runSupabaseProbes(shouldProbe);
  const catalogProbe = supabaseProbe?.resources?.find((item) => item.label === 'Prontidão do catálogo');
  const catalogReady = catalogProbe?.sample?.verified_ready === true;
  const productionReady = Boolean(
    checks.supabaseUrl &&
    checks.supabaseAnonKey &&
    checks.supabaseServiceRoleKey &&
    checks.adminToken &&
    checks.siteUrl &&
    checks.contactChannel &&
    checks.brandReady &&
    checks.commercialReady &&
    checks.pilotApproved
  );
  const verifiedReady = Boolean(productionReady && !supabaseProbe.skipped && supabaseProbe.ok && catalogReady);
  const missing = missingFrom(checks);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify({
    ok: true,
    service: 'arandu-api',
    architecture: 'catch-all-router-plus-health-check',
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'local',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || null,
    checkedAt: new Date().toISOString(),
    mode: productionReady ? 'production-configured' : 'pre-production',
    productionReady,
    verifiedReady,
    missing,
    launchReadiness: {
      technical: checks.supabaseUrl && checks.supabaseAnonKey && checks.supabaseServiceRoleKey && checks.adminToken,
      contact: checks.contactChannel,
      domain: checks.siteUrl,
      brand: checks.brandReady,
      commercial: checks.commercialReady,
      pilot: checks.pilotApproved,
      pilotRuntime: checks.pilotReady,
      database: !supabaseProbe.skipped && supabaseProbe.ok,
      catalog: catalogReady,
      nextCriticalActions: nextCriticalActions(checks, supabaseProbe, catalogReady)
    },
    checks,
    probes: {
      supabase: supabaseProbe
    },
    routes: ROUTES
  }));
}

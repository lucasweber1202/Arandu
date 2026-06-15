const ROUTES = [
  '/api/forms',
  '/api/reservations',
  '/api/proposals',
  '/api/catalog',
  '/api/artists',
  '/api/certificates',
  '/api/certificate-document',
  '/api/admin',
  '/api/admin-update',
  '/api/operational',
  '/api/media',
  '/api/selections',
  '/api/dashboard',
  '/api/auth/session',
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/logout'
];

function configured(name) {
  return Boolean(process.env[name]);
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

  const checks = {
    api: true,
    mainRouter: true,
    supabaseUrl: configured('SUPABASE_URL'),
    supabaseAnonKey: configured('SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: configured('SUPABASE_SERVICE_ROLE_KEY'),
    adminToken: configured('ARANDU_ADMIN_TOKEN')
  };

  const productionReady = Boolean(
    checks.supabaseUrl &&
    checks.supabaseAnonKey &&
    checks.supabaseServiceRoleKey &&
    checks.adminToken
  );

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
    productionReady,
    checks,
    routes: ROUTES
  }));
}

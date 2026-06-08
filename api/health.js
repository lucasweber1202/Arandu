import { hasSupabaseAuthConfig, hasSupabaseConfig } from './_supabase.js';

export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    service: 'Arandu API',
    timestamp: new Date().toISOString(),
    supabaseConfigured: hasSupabaseConfig(),
    authConfigured: hasSupabaseAuthConfig(),
    adminConfigured: Boolean(process.env.ARANDU_ADMIN_TOKEN),
    routes: [
      '/api/forms',
      '/api/leads',
      '/api/search?q=fotografia',
      '/api/public/catalog',
      '/api/public/artists',
      '/api/artworks',
      '/api/dashboard',
      '/api/admin/artists',
      '/api/admin/artworks',
      '/api/admin/certificates',
      '/api/admin/crm?type=leads',
      '/api/admin/crm?type=submissions',
      '/api/admin/crm?type=briefs',
      '/api/admin/operational?resource=notes',
      '/api/admin/operational?resource=tasks',
      '/api/admin/operational?resource=proposals',
      '/api/admin/operational?resource=reservations',
      '/api/admin/quality',
      '/api/admin/export?resource=artworks&format=csv',
      '/api/auth/signup',
      '/api/auth/login',
      '/api/auth/session',
      '/api/auth/logout',
      '/api/certificates?code=ARD-2026-0001'
    ]
  }));
}

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
      '/api/artworks',
      '/api/dashboard',
      '/api/admin/artists',
      '/api/admin/artworks',
      '/api/admin/certificates',
      '/api/auth/signup',
      '/api/auth/login',
      '/api/auth/session',
      '/api/auth/logout',
      '/api/certificates?code=ARD-2026-0001'
    ]
  }));
}

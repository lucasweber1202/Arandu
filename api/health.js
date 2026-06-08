import { hasSupabaseConfig } from './_supabase.js';

export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    ok: true,
    service: 'Arandu API',
    timestamp: new Date().toISOString(),
    supabaseConfigured: hasSupabaseConfig(),
    routes: ['/api/leads', '/api/certificates?code=ARD-2026-0001']
  }));
}

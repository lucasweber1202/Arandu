import { hasSupabaseConfig, supabaseRequest } from '../_supabase.js';
import { sendJson } from '../_normalize.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });

  const url = new URL(req.url, 'http://localhost');
  const language = url.searchParams.get('language');
  const status = url.searchParams.get('status') || 'available';
  const limit = Math.min(Number(url.searchParams.get('limit') || 24), 80);

  if (!hasSupabaseConfig()) {
    return sendJson(res, 200, { ok: true, mode: 'demo', artworks: [] });
  }

  try {
    const params = new URLSearchParams({ select: '*,artists(name,slug,city,state)', published: 'eq.true', order: 'created_at.desc', limit: String(limit) });
    if (language) params.set('language', `eq.${language}`);
    if (status !== 'all') params.set('status', `eq.${status}`);
    const artworks = await supabaseRequest(`artworks?${params.toString()}`, { method: 'GET', headers: { Prefer: '' } });
    return sendJson(res, 200, { ok: true, mode: 'supabase', artworks: artworks || [] });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro no catálogo público.' });
  }
}

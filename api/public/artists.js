import { hasSupabaseConfig, supabaseRequest } from '../_supabase.js';
import { sendJson } from '../_normalize.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });

  if (!hasSupabaseConfig()) return sendJson(res, 200, { ok: true, mode: 'demo', artists: [] });

  try {
    const artists = await supabaseRequest('artists?select=slug,name,city,state,bio_short,languages,axes,labels,status&status=eq.published&order=name.asc', { method: 'GET', headers: { Prefer: '' } });
    return sendJson(res, 200, { ok: true, mode: 'supabase', artists: artists || [] });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro em artistas públicos.' });
  }
}

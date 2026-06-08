import { hasSupabaseConfig, supabaseRequest } from './_supabase.js';

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function countTable(table) {
  const data = await supabaseRequest(`${table}?select=id`, {
    method: 'GET',
    headers: { Prefer: '' }
  });
  return Array.isArray(data) ? data.length : 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'Method not allowed.' });

  try {
    if (!hasSupabaseConfig()) {
      return send(res, 200, {
        ok: true,
        mode: 'demo',
        metrics: { artworks: 6, artists: 4, leads: 3, certificates: 1, briefs: 2, submissions: 1 }
      });
    }

    const [artworks, artists, leads, certificates] = await Promise.all([
      countTable('artworks'),
      countTable('artists'),
      countTable('leads'),
      countTable('certificates')
    ]);

    return send(res, 200, {
      ok: true,
      mode: 'supabase',
      metrics: { artworks, artists, leads, certificates }
    });
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message || 'Erro no painel.' });
  }
}

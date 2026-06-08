import { hasSupabaseConfig, supabaseRequest } from './_supabase.js';

const demoArtworks = [
  { slug: 'estudo-de-solo-04', title: 'Estudo de Solo Nº 04', artist: 'Marina Silveira', price_cents: 420000, status: 'available', technique: 'Óleo sobre tela' },
  { slug: 'sertao-silencioso', title: 'Sertão Silencioso', artist: 'Camila Rebouças', price_cents: 210000, status: 'available', technique: 'Fotografia fine art' },
  { slug: 'equilibrio-suspenso', title: 'Equilíbrio Suspenso', artist: "Arthur D'Avila", price_cents: 890000, status: 'reserved', technique: 'Bronze fundido' }
];

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'Method not allowed.' });

  try {
    if (!hasSupabaseConfig()) return send(res, 200, { ok: true, mode: 'demo', artworks: demoArtworks });

    const data = await supabaseRequest('artworks?select=*&order=created_at.desc', {
      method: 'GET',
      headers: { Prefer: '' }
    });

    return send(res, 200, { ok: true, mode: 'supabase', artworks: data || [] });
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message || 'Erro ao listar obras.' });
  }
}

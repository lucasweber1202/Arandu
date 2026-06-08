import { hasSupabaseConfig, supabaseRequest } from '../_supabase.js';
import { readJsonBody, sendJson, slugify, toArray } from '../_normalize.js';
import { requireAdmin } from '../_admin.js';

function normalizeArtist(body = {}) {
  const name = body.name || body.nome || body.artist_name || body.nome_artistico;
  return {
    slug: body.slug || slugify(name),
    name,
    legal_name: body.legal_name || body.nome_completo || null,
    city: body.city || body.cidade || null,
    state: body.state || body.estado || body.uf || null,
    country: body.country || 'Brasil',
    bio_short: body.bio_short || body.resumo || null,
    bio: body.bio || body.biografia || null,
    statement: body.statement || body.depoimento || null,
    languages: toArray(body.languages || body.linguagens),
    axes: toArray(body.axes || body.eixos),
    labels: toArray(body.labels || body.tags),
    portfolio_url: body.portfolio_url || body.portfolio || null,
    instagram: body.instagram || null,
    email: body.email || null,
    phone: body.phone || body.whatsapp || body.telefone || null,
    status: body.status || 'draft',
    curatorial_notes: body.curatorial_notes || body.notas_curatoriais || null
  };
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (!hasSupabaseConfig()) {
    return sendJson(res, 202, { ok: true, mode: 'demo', message: 'Supabase não configurado. Rota de artistas pronta.' });
  }

  try {
    if (req.method === 'GET') {
      const data = await supabaseRequest('artists?select=*&order=created_at.desc', { method: 'GET', headers: { Prefer: '' } });
      return sendJson(res, 200, { ok: true, artists: data || [] });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const artist = normalizeArtist(body);
      if (!artist.name) return sendJson(res, 400, { ok: false, error: 'Nome do artista é obrigatório.' });
      const data = await supabaseRequest('artists', { method: 'POST', body: JSON.stringify(artist) });
      return sendJson(res, 201, { ok: true, artist: Array.isArray(data) ? data[0] : data });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!body.id) return sendJson(res, 400, { ok: false, error: 'ID é obrigatório para atualizar.' });
      const artist = normalizeArtist(body);
      const data = await supabaseRequest(`artists?id=eq.${encodeURIComponent(body.id)}`, { method: 'PATCH', body: JSON.stringify(artist) });
      return sendJson(res, 200, { ok: true, artist: Array.isArray(data) ? data[0] : data });
    }

    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro em artistas.' });
  }
}

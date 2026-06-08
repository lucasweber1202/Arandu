import { hasSupabaseConfig, supabaseRequest } from '../_supabase.js';
import { readJsonBody, sendJson, slugify, toArray, toCents } from '../_normalize.js';
import { requireAdmin } from '../_admin.js';

function normalizeArtwork(body = {}) {
  const title = body.title || body.titulo;
  return {
    slug: body.slug || slugify(title),
    artist_id: body.artist_id || null,
    title,
    year: body.year ? Number(body.year) : body.ano ? Number(body.ano) : null,
    language: body.language || body.linguagem || null,
    technique: body.technique || body.tecnica || null,
    support: body.support || body.suporte || null,
    dimensions: body.dimensions || body.dimensoes || null,
    width_cm: body.width_cm || null,
    height_cm: body.height_cm || null,
    depth_cm: body.depth_cm || null,
    price_cents: body.price_cents || toCents(body.price || body.preco),
    currency: body.currency || 'BRL',
    status: body.status || 'available',
    edition_type: body.edition_type || body.tipo_edicao || null,
    edition_number: body.edition_number || body.numero_edicao || null,
    edition_total: body.edition_total ? Number(body.edition_total) : null,
    context_tags: toArray(body.context_tags || body.tags),
    curatorial_note: body.curatorial_note || body.nota_curatorial || null,
    provenance_note: body.provenance_note || body.procedencia || null,
    conservation_note: body.conservation_note || body.conservacao || null,
    image_url: body.image_url || body.imagem || null,
    certificate_required: body.certificate_required !== false,
    published: Boolean(body.published || body.publicado)
  };
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (!hasSupabaseConfig()) {
    return sendJson(res, 202, { ok: true, mode: 'demo', message: 'Supabase não configurado. Rota de obras pronta.' });
  }

  try {
    if (req.method === 'GET') {
      const data = await supabaseRequest('artworks?select=*,artists(name,slug)&order=created_at.desc', { method: 'GET', headers: { Prefer: '' } });
      return sendJson(res, 200, { ok: true, artworks: data || [] });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const artwork = normalizeArtwork(body);
      if (!artwork.title) return sendJson(res, 400, { ok: false, error: 'Título da obra é obrigatório.' });
      const data = await supabaseRequest('artworks', { method: 'POST', body: JSON.stringify(artwork) });
      return sendJson(res, 201, { ok: true, artwork: Array.isArray(data) ? data[0] : data });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!body.id) return sendJson(res, 400, { ok: false, error: 'ID é obrigatório para atualizar.' });
      const artwork = normalizeArtwork(body);
      const data = await supabaseRequest(`artworks?id=eq.${encodeURIComponent(body.id)}`, { method: 'PATCH', body: JSON.stringify(artwork) });
      return sendJson(res, 200, { ok: true, artwork: Array.isArray(data) ? data[0] : data });
    }

    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro em obras.' });
  }
}

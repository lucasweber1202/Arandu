import { envReady, json, readBody, requireAdmin, supabaseRest } from '../_supabase.js';

const demoArtworks = [
  { id: 'estudo-de-solo-04', title: 'Estudo de Solo Nº 04', artists: { name: 'Marina Silveira' }, language: 'Pintura', status: 'available', price_cents: 420000 },
  { id: 'sertao-silencioso', title: 'Sertão Silencioso', artists: { name: 'Camila Rebouças' }, language: 'Fotografia', status: 'available', price_cents: 210000 },
  { id: 'equilibrio-suspenso', title: 'Equilíbrio Suspenso', artists: { name: "Arthur D'Avila" }, language: 'Escultura', status: 'in_conversation', price_cents: 890000 }
];

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!envReady()) return json(res, 200, { ok: true, mode: 'demo', artworks: demoArtworks });
  try {
    if (req.method === 'GET') {
      const artworks = await supabaseRest('artworks?select=*,artists(name)&order=created_at.desc');
      return json(res, 200, { ok: true, artworks });
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const { id, ...changes } = body;
      const updated = await supabaseRest(`artworks?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
      return json(res, 200, { ok: true, artwork: updated?.[0] });
    }
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
}

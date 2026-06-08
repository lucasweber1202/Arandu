import { envReady, json, readBody, requireAdmin, supabaseRest } from '../_supabase.js';

const demoArtists = [
  { id: 'marina-silveira', name: 'Marina Silveira', city: 'São Paulo', state: 'SP', languages: ['pintura', 'matéria'], status: 'published' },
  { id: 'camila-reboucas', name: 'Camila Rebouças', city: 'Recife', state: 'PE', languages: ['fotografia', 'território'], status: 'published' },
  { id: 'arthur-davila', name: "Arthur D'Avila", city: 'Curitiba', state: 'PR', languages: ['escultura', 'bronze'], status: 'approved' }
];

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!envReady()) return json(res, 200, { ok: true, mode: 'demo', artists: demoArtists });
  try {
    if (req.method === 'GET') {
      const artists = await supabaseRest('artists?select=*&order=created_at.desc');
      return json(res, 200, { ok: true, artists });
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const { id, ...changes } = body;
      const updated = await supabaseRest(`artists?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
      return json(res, 200, { ok: true, artist: updated?.[0] });
    }
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
}

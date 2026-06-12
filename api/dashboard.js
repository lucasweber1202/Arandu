import { dataRequest, hasDataConfig, json } from './_arandu.js';

const RESOURCES = {
  artworks: 'artworks?select=id',
  artists: 'artists?select=id',
  leads: 'leads?select=id',
  certificates: 'certificates?select=id',
  reservations: 'reservations?select=id',
  proposals: 'proposals?select=id',
  submissions: 'artist_submissions?select=id',
  briefs: 'company_briefs?select=id',
  tasks: 'tasks?select=id'
};

async function countResource(resource) {
  const rows = await dataRequest(resource, { method: 'GET', headers: { Prefer: '' } });
  return Array.isArray(rows) ? rows.length : 0;
}

async function recentPipeline() {
  try {
    const rows = await dataRequest('v_sales_pipeline?select=*&order=created_at.desc&limit=8', { method: 'GET', headers: { Prefer: '' } });
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    if (!hasDataConfig()) {
      return json(res, 202, {
        ok: true,
        mode: 'demo',
        metrics: {
          artworks: 0,
          artists: 0,
          leads: 0,
          certificates: 0,
          reservations: 0,
          proposals: 0,
          submissions: 0,
          briefs: 0,
          tasks: 0
        },
        pipeline: []
      });
    }

    const entries = await Promise.all(
      Object.entries(RESOURCES).map(async ([key, resource]) => [key, await countResource(resource)])
    );
    const metrics = Object.fromEntries(entries);
    const pipeline = await recentPipeline();
    return json(res, 200, { ok: true, mode: 'supabase', metrics, pipeline });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

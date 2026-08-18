export function createDashboardDomain(dependencies) {
  const { json, adminGuard, hasDataConfig, dataRequest, adminSupabaseCount } = dependencies;

async function handleDashboard(req, res) {
  const guard = await adminGuard(req, res, 'dashboard', 'read');
  if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error, code: guard.code });
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const metrics = { artworks: 0, artists: 0, leads: 0, certificates: 0, reservations: 0, proposals: 0, submissions: 0, briefs: 0, tasks: 0 };
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', metrics, pipeline: [] });
  const resources = {
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
  // PostgREST calcula os totais no servidor via Content-Range. O dashboard não
  // transfere mais todos os IDs só para executar Array.length no runtime.
  const entries = await Promise.all(
    Object.entries(resources).map(async ([key, resource]) => [key, await adminSupabaseCount(resource)])
  );
  let pipeline = [];
  try { pipeline = await dataRequest('v_sales_pipeline?select=source,id,name,status,created_at&order=created_at.desc&limit=8', { method: 'GET', headers: { Prefer: '' } }); } catch {}
  return json(res, 200, { ok: true, mode: 'supabase', metrics: Object.fromEntries(entries), pipeline: Array.isArray(pipeline) ? pipeline : [] });
}


  return { handleDashboard };
}

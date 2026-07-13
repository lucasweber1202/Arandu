const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function hasDataConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function firstRecord(data) {
  return Array.isArray(data) ? data[0] || null : data;
}

async function dataRequest(resource, options = {}) {
  if (!hasDataConfig()) throw new Error('Banco não configurado.');
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${resource}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || '',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || `Supabase ${response.status}`);
  return data;
}

async function safeView(resource, fallback, errors) {
  try {
    return await dataRequest(resource);
  } catch (error) {
    errors.push({ resource, error: error.message });
    return fallback;
  }
}

async function countResource(resource, errors) {
  try {
    const rows = await dataRequest(`${resource}?select=id`);
    return Array.isArray(rows) ? rows.length : 0;
  } catch (error) {
    errors.push({ resource, error: error.message });
    return 0;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });

  const errors = [];
  const emptyDashboard = {
    artists_total: 0,
    artists_ready: 0,
    artworks_total: 0,
    artworks_live: 0,
    leads_30d: 0,
    artist_submissions_30d: 0,
    company_briefs_30d: 0,
    reservations_30d: 0,
    converted_reservations_total: 0,
    active_proposals: 0,
    valid_certificates: 0,
    open_tasks: 0
  };

  if (!hasDataConfig()) {
    return json(res, 202, {
      ok: true,
      mode: 'demo',
      installed: false,
      dashboard: emptyDashboard,
      scorecard: [],
      artistPipeline: [],
      submissionPipeline: [],
      priceBands: [],
      certificateReadiness: [],
      commercialPipeline: [],
      basicCounts: {},
      errors: [{ resource: 'env', error: 'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY não configurados.' }]
    });
  }

  const [dashboardRows, scorecard, artistPipeline, submissionPipeline, priceBands, certificateReadiness, commercialPipeline] = await Promise.all([
    safeView('v_mvp_operational_dashboard?select=*&limit=1', [], errors),
    safeView('v_mvp_validation_scorecard?select=*&order=metric.asc', [], errors),
    safeView('v_mvp_artist_pipeline?select=*&order=artists.desc&limit=40', [], errors),
    safeView('v_mvp_submission_pipeline?select=*&order=last_received_at.desc&limit=40', [], errors),
    safeView('v_mvp_artwork_price_bands?select=*&order=price_band.asc', [], errors),
    safeView('v_mvp_certificate_readiness?select=*&order=created_at.desc&limit=40', [], errors),
    safeView('v_mvp_commercial_pipeline?select=*&order=source.asc,status.asc', [], errors)
  ]);

  const basicCounts = {
    artists: await countResource('artists', errors),
    artworks: await countResource('artworks', errors),
    leads: await countResource('leads', errors),
    submissions: await countResource('artist_submissions', errors),
    briefs: await countResource('company_briefs', errors),
    reservations: await countResource('reservations', errors),
    proposals: await countResource('proposals', errors),
    certificates: await countResource('certificates', errors),
    tasks: await countResource('tasks', errors)
  };

  const dashboard = firstRecord(dashboardRows) || {
    ...emptyDashboard,
    artists_total: basicCounts.artists,
    artworks_total: basicCounts.artworks
  };

  return json(res, 200, {
    ok: true,
    mode: 'supabase',
    installed: errors.filter((item) => item.resource.startsWith('v_mvp_')).length === 0,
    dashboard,
    scorecard,
    artistPipeline,
    submissionPipeline,
    priceBands,
    certificateReadiness,
    commercialPipeline,
    basicCounts,
    errors
  });
}

const json = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

function hasSupabaseConfig() { return Boolean(SUPABASE_URL && SUPABASE_KEY); }
function hasAuthConfig() { return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY); }

async function supabaseRequest(resource, options = {}) {
  if (!hasSupabaseConfig()) throw new Error('Supabase não configurado.');
  const url = `${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${resource}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) },
    body: options.body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || `Supabase ${response.status}`);
  return data;
}

function requireAdmin(req, res) {
  const configured = process.env.ARANDU_ADMIN_TOKEN;
  const token = req.headers['x-arandu-admin-token'] || String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (configured && token === configured) return true;
  json(res, 401, { ok: false, error: 'Admin token inválido ou ausente.' });
  return false;
}

function fallbackSearch(q = '') {
  const query = q.toLowerCase();
  return [
    { type: 'obra', title: 'Estudo de Solo Nº 04', url: '/obra-estudo-de-solo-04.html', text: 'Pintura · matéria · memória' },
    { type: 'obra', title: 'Sertão Silencioso', url: '/obra-sertao-silencioso.html', text: 'Fotografia · primeira obra · silêncio' },
    { type: 'obra', title: 'Equilíbrio Suspenso', url: '/obra-equilibrio-suspenso.html', text: 'Escultura · matéria · tensão' },
    { type: 'artista', title: 'Marina Silveira', url: '/artista-marina-silveira.html', text: 'Pintura · terra · pigmento' },
    { type: 'artista', title: 'Camila Rebouças', url: '/artista-camila-reboucas.html', text: 'Fotografia · território · memória' }
  ].filter((item) => !query || `${item.title} ${item.text} ${item.type}`.toLowerCase().includes(query));
}

function tableForCrm(type) {
  return { leads: 'leads', submissions: 'artist_submissions', briefs: 'company_briefs', newsletters: 'newsletter_subscriptions', selections: 'saved_selections' }[type] || 'leads';
}

function tableForOperational(resource) {
  return { notes: 'crm_notes', tasks: 'tasks', proposals: 'proposals', proposal_items: 'proposal_items', reservations: 'reservations', events: 'artwork_events', media: 'media_assets' }[resource] || 'tasks';
}

async function listTable(res, table, select = '*') {
  if (!hasSupabaseConfig()) return json(res, 202, { ok: true, mode: 'demo', items: [], [table]: [] });
  const data = await supabaseRequest(`${table}?select=${select}&order=created_at.desc`, { method: 'GET', headers: { Prefer: '' } });
  return json(res, 200, { ok: true, items: data || [], [table]: data || [] });
}

async function patchTable(req, res, table) {
  const body = await readBody(req);
  if (!body.id) return json(res, 400, { ok: false, error: 'ID é obrigatório.' });
  const { id, ...patch } = body;
  if (!hasSupabaseConfig()) return json(res, 202, { ok: true, mode: 'demo', item: { id, ...patch } });
  const data = await supabaseRequest(`${table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  return json(res, 200, { ok: true, item: Array.isArray(data) ? data[0] : data });
}

async function createInTable(req, res, table) {
  const body = await readBody(req);
  if (!hasSupabaseConfig()) return json(res, 202, { ok: true, mode: 'demo', item: body });
  const data = await supabaseRequest(table, { method: 'POST', body: JSON.stringify(body) });
  return json(res, 201, { ok: true, item: Array.isArray(data) ? data[0] : data });
}

async function handleForms(req, res) {
  const body = await readBody(req);
  const type = body.type || body.form_type || 'contato';
  const data = body.data || body;
  let table = 'leads';
  let payload = { type, name: data.nome || data.name || data.nome_completo || null, email: data.email || null, whatsapp: data.whatsapp || data.telefone || data.phone || null, company: data.empresa || data.company || null, message: data.mensagem || data.message || null, source_page: body.page || body.source_page || null, status: 'new', payload: body };

  if (type === 'submissao-artista') {
    table = 'artist_submissions';
    payload = { name: data.nome_completo || data.nome || null, artist_name: data.nome_artistico || data.artist_name || data.nome || null, city: data.cidade || null, state: data.estado || data.uf || null, portfolio_url: data.portfolio || data.portfolio_url || null, instagram: data.instagram || null, email: data.email || null, whatsapp: data.whatsapp || data.telefone || null, languages: data.linguagens || data.languages || null, price_range: data.faixa_preco || data.orcamento || null, message: data.mensagem || null, status: 'received', payload: body };
  }
  if (type === 'empresa-intencao' || type === 'proposta-empresa') {
    table = 'company_briefs';
    payload = { ...payload, project_type: data.tipo_projeto || data.espaco || null, environment: data.ambiente || null, budget: data.orcamento || data.budget || null, deadline: data.prazo || null, status: 'received' };
  }
  if (type === 'newsletter') {
    table = 'newsletter_subscriptions';
    payload = { email: data.email, name: data.nome || data.name || null, source_page: body.page || null, payload: body };
  }
  if (!hasSupabaseConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, table, record: payload });
  const saved = await supabaseRequest(table, { method: 'POST', body: JSON.stringify(payload) });
  return json(res, 201, { ok: true, stored: true, table, record: Array.isArray(saved) ? saved[0] : saved });
}

async function handleSearch(res, url) {
  const q = url.searchParams.get('q') || '';
  if (!hasSupabaseConfig()) return json(res, 200, { ok: true, mode: 'demo', query: q, results: fallbackSearch(q) });
  const like = encodeURIComponent(`*${q}*`);
  const artworks = await supabaseRequest(`artworks?select=slug,title,language,status&published=eq.true&or=(title.ilike.${like},language.ilike.${like})&limit=12`, { method: 'GET', headers: { Prefer: '' } });
  return json(res, 200, { ok: true, mode: 'supabase', query: q, results: (artworks || []).map((item) => ({ type: 'obra', title: item.title, url: `/obra-${item.slug}.html`, text: item.language || '' })) });
}

async function handleQuality(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!hasSupabaseConfig()) return json(res, 202, { ok: true, mode: 'demo', issues: [], metrics: {} });
  const issues = await supabaseRequest('v_quality_issues?select=*', { method: 'GET', headers: { Prefer: '' } }).catch(() => []);
  return json(res, 200, { ok: true, score: Math.max(0, 100 - (issues || []).length * 5), issues: issues || [], metrics: { alerts: (issues || []).length } });
}

async function handleExport(req, res, url) {
  if (!requireAdmin(req, res)) return;
  const resource = url.searchParams.get('resource') || 'artworks';
  const table = { artworks: 'v_artworks_full', artists: 'artists', leads: 'leads', proposals: 'proposals', reservations: 'reservations', certificates: 'certificates', tasks: 'tasks', quality: 'v_quality_issues' }[resource] || 'artworks';
  if (!hasSupabaseConfig()) return json(res, 202, { ok: true, mode: 'demo', rows: [] });
  const rows = await supabaseRequest(`${table}?select=*`, { method: 'GET', headers: { Prefer: '' } });
  if (url.searchParams.get('format') === 'csv') {
    const keys = Array.from((rows || []).reduce((s, r) => { Object.keys(r).forEach((k) => s.add(k)); return s; }, new Set()));
    const body = [keys.join(','), ...(rows || []).map((r) => keys.map((k) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="arandu-${resource}.csv"`);
    return res.end(body);
  }
  return json(res, 200, { ok: true, resource, rows });
}

function health(res) {
  return json(res, 200, { ok: true, service: 'Arandu API Router', supabaseConfigured: hasSupabaseConfig(), authConfigured: hasAuthConfig(), adminConfigured: Boolean(process.env.ARANDU_ADMIN_TOKEN), consolidated: true });
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    if (p.endsWith('/api/health') || p.endsWith('/api/router')) return health(res);
    if (p.endsWith('/api/forms') || p.endsWith('/api/leads')) return handleForms(req, res);
    if (p.endsWith('/api/search')) return handleSearch(res, url);
    if (p.endsWith('/api/public/catalog')) return listTable(res, 'artworks', '*,artists(name,slug,city,state)');
    if (p.endsWith('/api/public/artists')) return listTable(res, 'artists');
    if (p.endsWith('/api/admin/quality')) return handleQuality(req, res);
    if (p.endsWith('/api/admin/export')) return handleExport(req, res, url);
    if (p.endsWith('/api/admin/operational')) {
      if (!requireAdmin(req, res)) return;
      const table = tableForOperational(url.searchParams.get('resource') || 'tasks');
      if (req.method === 'GET') return listTable(res, table);
      if (req.method === 'PATCH') return patchTable(req, res, table);
      if (req.method === 'POST') return createInTable(req, res, table);
    }
    if (p.endsWith('/api/admin/artists')) { if (!requireAdmin(req, res)) return; return req.method === 'GET' ? listTable(res, 'artists') : req.method === 'POST' ? createInTable(req, res, 'artists') : patchTable(req, res, 'artists'); }
    if (p.endsWith('/api/admin/artworks')) { if (!requireAdmin(req, res)) return; return req.method === 'GET' ? listTable(res, 'artworks', '*,artists(name,slug)') : req.method === 'POST' ? createInTable(req, res, 'artworks') : patchTable(req, res, 'artworks'); }
    if (p.endsWith('/api/admin/certificates')) { if (!requireAdmin(req, res)) return; return req.method === 'GET' ? listTable(res, 'certificates', '*,artworks(title,slug)') : req.method === 'POST' ? createInTable(req, res, 'certificates') : patchTable(req, res, 'certificates'); }
    if (p.endsWith('/api/admin/crm')) { if (!requireAdmin(req, res)) return; const table = tableForCrm(url.searchParams.get('type') || 'leads'); return req.method === 'GET' ? listTable(res, table) : patchTable(req, res, table); }
    return json(res, 404, { ok: false, error: 'Rota não encontrada no router consolidado.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

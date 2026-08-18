export function createAdminOperationsDomain(dependencies) {
  const { EDITORIAL_STATUSES, requireAdminPermission, assertTransition, describeFlow, elevatedActionFor, entityForPanel, statusFieldFor, HttpError, clean, json, limited, readBody, auditRequestHeaders, adminSupabaseRpc, adminGuard, dataRequest, firstRecord, validUrl, safeObject, enforceRateLimit } = dependencies;

function slugify(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function listFrom(value) { return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }
function money(value) { const parsed = Number(String(value || '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(parsed) && parsed > 0 ? parsed : null; }
function boolFrom(value) { return value === true || ['1','true','yes','sim','s'].includes(String(value || '').trim().toLowerCase()); }
function dateFrom(value) { const parsed = Date.parse(String(value || '')); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null; }

const PANELS = {
  obras: { table: 'artworks', read: 'v_artworks_full?select=*&order=created_at.desc', statusField: 'status', statuses: ['available', 'in_conversation', 'reserved', 'sold', 'not_published', 'archived'] },
  artistas: { table: 'artists', read: 'artists?select=*&order=created_at.desc', statusField: 'status', statuses: ['prospected', 'in_review', 'approved', 'published', 'paused', 'archived'] },
  certificados: { table: 'certificates', read: 'certificates?select=*&order=created_at.desc', statusField: 'verification_status', statuses: ['draft', 'valid', 'under_review', 'revoked'] },
  leads: { table: 'leads', read: 'leads?select=*&order=created_at.desc', statusField: 'status', statuses: ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'archived'] },
  submissions: { table: 'artist_submissions', read: 'artist_submissions?select=*&order=created_at.desc', statusField: 'status', statuses: ['received', 'screening', 'curatorial_review', 'approved', 'declined', 'archived'] },
  briefs: { table: 'company_briefs', read: 'company_briefs?select=*&order=created_at.desc', statusField: 'status', statuses: ['received', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'archived'] },
  proposals: { table: 'proposals', read: 'proposals?select=*&order=created_at.desc', statusField: 'status', statuses: ['draft', 'sent', 'approved', 'declined', 'expired', 'archived'] },
  reservations: { table: 'reservations', read: 'reservations?select=*&order=created_at.desc', statusField: 'status', statuses: ['requested', 'confirmed', 'expired', 'cancelled', 'converted'] },
  tasks: { table: 'tasks', read: 'tasks?select=*&order=created_at.desc', statusField: 'status', statuses: ['open', 'doing', 'done', 'cancelled'] }
};
const CREATE_ALIASES = { artist: 'artistas', artista: 'artistas', artists: 'artistas', artwork: 'obras', obra: 'obras', artworks: 'obras', certificate: 'certificados', certificado: 'certificados', certificates: 'certificados', task: 'tasks', tarefa: 'tasks' };
const TABLES = { obras: 'artworks', artistas: 'artists', certificados: 'certificates', leads: 'leads', submissions: 'artist_submissions', briefs: 'company_briefs', proposals: 'proposals', reservations: 'reservations', tasks: 'tasks' };
const ALLOWED = {
  obras: ['title','artist_id','language','type','technique','support','year','dimensions','price','price_label','status','edition','edition_size','certificate','thumb','main_image_url','detail_image_url','room_image_url','recommended_for','tags','moods','spaces','search','summary','curatorial_reading','first_artwork','logistics','published','image_authorized_at','price_verified_at','availability_verified_at','catalog_verified_at','source_reference'],
  artistas: ['name','legal_name','slug','city','state','region','languages','curatorial_axes','profile','trajectory','statement','portfolio_url','instagram','status','artist_level','image_url','studio_image_url','identity_verified','publishing_consent_at','verified_at','source_reference'],
  certificados: ['code','verification_status','artwork_id','artist_id','issued_to','issued_email','issued_at','certificate_hash','certificate_notes'],
  leads: ['type','name','email','whatsapp','company','message','source_page','status'],
  submissions: ['name','artist_name','city','state','portfolio_url','instagram','email','whatsapp','languages','price_range','message','status'],
  briefs: ['name','email','whatsapp','company','project_type','environment','budget','deadline','message','source_page','status'],
  proposals: ['lead_id','company_brief_id','client','space','goal','budget','deadline','notes','total','status'],
  reservations: ['artwork_id','lead_id','name','whatsapp','deadline','notes','status','expires_at'],
  tasks: ['entity_type','entity_id','title','owner_name','due_at','priority','status']
};
const ARRAYS = new Set(['languages','curatorial_axes','recommended_for','tags','moods','spaces']);
const NUMBERS = new Set(['price','total','edition_size']);
const BOOLEANS = new Set(['certificate','published','first_artwork','identity_verified']);
const JSONS = new Set(['logistics']);
const URL_FIELDS = new Set(['portfolio_url','image_url','studio_image_url','thumb','main_image_url','detail_image_url','room_image_url','source_reference']);

function panelConfig(panel) { return PANELS[String(panel || '').trim()] || null; }
function panelResource(panel) {
  return ({
    obras: 'artworks',
    artistas: 'artists',
    certificados: 'certificates',
    leads: 'leads',
    submissions: 'submissions',
    briefs: 'briefs',
    proposals: 'proposals',
    reservations: 'reservations',
    tasks: 'tasks'
  })[String(panel || '').trim()] || '';
}
function panelFromBody(body) { const raw = body.panel || body.type || body.resource || body.kind; return CREATE_ALIASES[String(raw || '').trim()] || String(raw || '').trim(); }
function normalizeArtist(body) {
  const name = body.name || body.artist_name;
  const id = body.id || slugify(name);
  return {
    id,
    name,
    legal_name: limited(body.legal_name, 200) || null,
    slug: body.slug || id,
    city: limited(body.city, 120) || null,
    state: limited(body.state, 60) || null,
    region: limited(body.region, 120) || null,
    languages: listFrom(body.languages),
    curatorial_axes: listFrom(body.axes || body.curatorial_axes),
    profile: limited(body.bio || body.profile, 4000) || null,
    trajectory: limited(body.trajectory || body.bio || body.profile, 6000) || null,
    statement: limited(body.statement, 6000) || null,
    portfolio_url: limited(body.portfolio_url, 1000) || null,
    instagram: limited(body.instagram, 200) || null,
    status: body.status && PANELS.artistas.statuses.includes(body.status) ? body.status : 'in_review',
    artist_level: limited(body.artist_level, 80) || 'emerging',
    image_url: limited(body.image_url, 2000) || null,
    studio_image_url: limited(body.studio_image_url, 2000) || null,
    identity_verified: boolFrom(body.identity_verified),
    publishing_consent_at: dateFrom(body.publishing_consent_at),
    verified_at: dateFrom(body.verified_at),
    source_reference: limited(body.source_reference, 1000) || null,
    payload: body
  };
}
function normalizeArtwork(body) {
  const title = body.title;
  const id = body.id || slugify(title);
  const status = body.status === 'temporarily_reserved' ? 'reserved' : body.status;
  return {
    id,
    slug: body.slug || id,
    title,
    artist_id: body.artist_id || body.artistId || null,
    language: limited(body.language, 120) || null,
    type: limited(body.type || body.language, 120) || null,
    technique: limited(body.technique, 300) || null,
    support: limited(body.support, 300) || null,
    year: limited(body.year, 20) || null,
    dimensions: limited(body.dimensions, 200) || null,
    price: money(body.price),
    price_label: limited(body.price_label, 120) || null,
    status: PANELS.obras.statuses.includes(status) ? status : 'available',
    edition: limited(body.edition, 120) || null,
    edition_size: Number(body.edition_size) > 0 ? Number(body.edition_size) : null,
    certificate: body.certificate === undefined ? true : boolFrom(body.certificate),
    thumb: limited(body.thumb, 2000) || null,
    main_image_url: limited(body.main_image_url || body.image_url, 2000) || null,
    detail_image_url: limited(body.detail_image_url, 2000) || null,
    room_image_url: limited(body.room_image_url, 2000) || null,
    recommended_for: listFrom(body.recommended_for),
    tags: listFrom(body.tags),
    moods: listFrom(body.moods),
    spaces: listFrom(body.spaces),
    search: [title, body.technique, body.tags].filter(Boolean).join(' '),
    summary: limited(body.summary || body.curatorial_note, 4000) || null,
    curatorial_reading: limited(body.curatorial_note || body.curatorial_reading, 6000) || null,
    first_artwork: boolFrom(body.first_artwork),
    published: body.published === undefined ? status !== 'not_published' : boolFrom(body.published),
    image_authorized_at: dateFrom(body.image_authorized_at),
    price_verified_at: dateFrom(body.price_verified_at),
    availability_verified_at: dateFrom(body.availability_verified_at),
    catalog_verified_at: dateFrom(body.catalog_verified_at),
    source_reference: limited(body.source_reference, 1000) || null,
    payload: body
  };
}
function normalizeCertificateRecord(body) { const status = body.status || body.verification_status || 'draft'; return { code: String(body.code || '').trim().toUpperCase(), artwork_id: body.artwork_id || body.artworkId || null, artist_id: body.artist_id || body.artistId || null, issued_to: body.issued_to || null, verification_status: PANELS.certificados.statuses.includes(status) ? status : 'draft', issued_at: status === 'valid' ? new Date().toISOString() : null, certificate_notes: body.criterios || body.certificate_notes || null, payload: body }; }
function normalizeTask(body) { return { title: body.title, entity_type: body.entity_type || null, entity_id: body.entity_id || null, owner_name: body.owner_name || 'Curadoria', due_at: body.due_at || null, priority: ['low','normal','high'].includes(body.priority) ? body.priority : 'normal', status: PANELS.tasks.statuses.includes(body.status) ? body.status : 'open' }; }
function normalizeRecord(panel, body) { if (panel === 'artistas') return normalizeArtist(body); if (panel === 'obras') return normalizeArtwork(body); if (panel === 'certificados') return normalizeCertificateRecord(body); if (panel === 'tasks') return normalizeTask(body); return null; }
function validateRecord(panel, record) { if (panel === 'artistas' && !record.name) return 'Nome do artista é obrigatório.'; if (panel === 'obras' && !record.title) return 'Título da obra é obrigatório.'; if (panel === 'obras' && !record.artist_id) return 'ID do artista é obrigatório para cadastrar obra.'; if (panel === 'certificados' && !record.code) return 'Código do certificado é obrigatório.'; if (panel === 'certificados' && !record.artwork_id) return 'ID da obra é obrigatório para certificado.'; if (panel === 'tasks' && !record.title) return 'Título da tarefa é obrigatório.'; return null; }
function normalizeField(field, value) { if (value === undefined) return undefined; if (value === '') return null; if (URL_FIELDS.has(field)) { const url = String(value).trim(); if (!validUrl(url)) throw new HttpError(400, `URL inválida para ${field}.`); return url; } if (ARRAYS.has(field)) return listFrom(value); if (NUMBERS.has(field)) { const parsed = Number(String(value).replace(/\./g, '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : null; } if (BOOLEANS.has(field)) return value === true || value === 'true' || value === '1' || value === 'on'; if (JSONS.has(field)) { if (value && typeof value === 'object') return value; try { return value ? JSON.parse(value) : {}; } catch { return {}; } } return String(value).trim(); }
function buildPayload(panel, fields) { return (ALLOWED[panel] || []).reduce((payload, field) => { const value = normalizeField(field, fields[field]); if (value !== undefined) payload[field] = value; return payload; }, {}); }

function normalizeNote(body) { return { entity_type: clean(body.entity_type), entity_id: clean(body.entity_id), author_name: body.author_name || 'Curadoria', note: clean(body.note) }; }
function normalizeOperationalTask(body) { return { entity_type: clean(body.entity_type), entity_id: clean(body.entity_id), title: clean(body.title), owner_name: body.owner_name || 'Curadoria', due_at: body.due_at ? new Date(body.due_at).toISOString() : null, priority: ['low','normal','high'].includes(body.priority) ? body.priority : 'normal', status: ['open','doing','done','cancelled'].includes(body.status) ? body.status : 'open' }; }
function validOperationalResource(resource) { return resource === 'notes' || resource === 'tasks' || resource === 'status-history'; }
function operationalTable(resource) { if (resource === 'notes') return 'crm_notes'; if (resource === 'status-history') return 'operational_status_history'; return 'tasks'; }
function operationalOrder(resource) { if (resource === 'notes') return 'created_at.desc'; if (resource === 'status-history') return 'created_at.desc'; return 'due_at.asc.nullslast,created_at.desc'; }

async function handleAdmin(req, res) {
  const guard = await adminGuard(req, res);
  if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error, code: guard.code });
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const panel = url.searchParams.get('panel');
    const config = panelConfig(panel);
    if (!config) return json(res, 400, { ok: false, error: 'Painel inválido.' });
    requireAdminPermission(guard.actor, panelResource(panel), 'read');
    const items = await dataRequest(config.read, { method: 'GET', headers: { Prefer: '' } });
    return json(res, 200, {
      ok: true,
      mode: 'stored',
      panel,
      statusOptions: config.statuses,
      flow: describeFlow(panel),
      items: items || []
    });
  }
  if (req.method === 'POST') {
    const body = await readBody(req);
    const panel = panelFromBody(body);
    const config = panelConfig(panel);
    if (!config) return json(res, 400, { ok: false, error: 'Tipo de cadastro inválido.' });
    requireAdminPermission(guard.actor, panelResource(panel), 'create');
    if (panel === 'certificados') {
      await enforceRateLimit(req, 'admin-certificate-write', 30, 60 * 60 * 1000, guard.actor.id);
    }
    const record = normalizeRecord(panel, body.data || body);
    if (!record) return json(res, 400, { ok: false, error: 'Este painel ainda não possui criação administrativa.' });
    const validation = validateRecord(panel, record);
    if (validation) return json(res, 400, { ok: false, error: validation });
    const saved = await dataRequest(config.table, {
      method: 'POST',
      headers: auditRequestHeaders(guard.actor, req.aranduRequestId, body.justification),
      body: JSON.stringify(record)
    });
    return json(res, 201, { ok: true, mode: 'stored', stored: true, panel, record: firstRecord(saved) });
  }
  if (req.method === 'PATCH') {
    const body = await readBody(req);
    const panel = clean(body.panel);
    const id = clean(body.id);
    const status = clean(body.status);
    const config = panelConfig(panel);
    if (!config) return json(res, 400, { ok: false, error: 'Painel inválido.' });
    requireAdminPermission(guard.actor, panelResource(panel), 'update');
    if (panel === 'certificados') {
      await enforceRateLimit(req, 'admin-certificate-write', 30, 60 * 60 * 1000, guard.actor.id);
    }
    if (!id) return json(res, 400, { ok: false, error: 'ID obrigatório.' });
    if (!config.statuses.includes(status)) return json(res, 400, { ok: false, error: 'Status inválido para este painel.' });
    const transition = await applyOperationalTransition(
      req,
      guard.actor,
      panel,
      id,
      status,
      body.note || body.justification
    );
    if (!transition.record) return json(res, 404, { ok: false, error: 'Registro não encontrado.' });
    return json(res, 200, {
      ok: true,
      mode: 'stored',
      stored: true,
      panel,
      record: transition.record,
      transition: { from: transition.from, to: transition.to }
    });
  }
  return json(res, 405, { ok: false, error: 'Método não permitido.' });
}
async function handleAdminUpdate(req, res) {
  const access = await adminGuard(req, res);
  if (!access.ok) return json(res, access.status, { ok: false, error: access.error, code: access.code });
  if (req.method !== 'PATCH') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const body = await readBody(req);
  const panel = clean(body.panel);
  const id = clean(body.id);
  const table = TABLES[panel];
  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
  const payload = buildPayload(panel, fields);
  if (!table) return json(res, 400, { ok: false, error: 'Painel inválido.' });
  requireAdminPermission(access.actor, panelResource(panel), 'update');
  if (!id) return json(res, 400, { ok: false, error: 'ID obrigatório.' });
  if (!Object.keys(payload).length) return json(res, 400, { ok: false, error: 'Nenhum campo válido para atualizar.' });
  const entity = entityForPanel(panel);
  const statusField = statusFieldFor(panel);
  const transition = entity && payload[statusField] !== undefined
    ? await applyOperationalTransition(req, access.actor, panel, id, payload[statusField], body.note || body.justification)
    : null;
  if (transition) delete payload[statusField];

  let record = transition?.record || null;
  if (Object.keys(payload).length) {
    const rows = await dataRequest(`${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: auditRequestHeaders(access.actor, req.aranduRequestId, body.justification),
      body: JSON.stringify(payload)
    });
    record = firstRecord(rows) || record;
  }
  if (!record) return json(res, 404, { ok: false, error: 'Registro não encontrado.' });
  return json(res, 200, {
    ok: true,
    mode: 'stored',
    stored: true,
    panel,
    record,
    ...(transition ? { transition: { from: transition.from, to: transition.to } } : {})
  });
}

async function loadOperationalRecord(table, id) {
  const rows = await dataRequest(
    `${table}?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
    { method: 'GET', headers: { Prefer: '' } }
  );
  return firstRecord(rows);
}

// Aplica a transição operacional sob lock e registra a trilha de histórico.
// O status nunca é gravado por PATCH direto: sem rota válida não há escrita.
async function applyOperationalTransition(req, actor, panel, id, nextStatus, note) {
  const entity = entityForPanel(panel);
  const statusField = statusFieldFor(panel);
  const current = await loadOperationalRecord(TABLES[panel], id);
  if (!current) throw new HttpError(404, 'Registro não encontrado.');
  const transition = assertTransition(panel, current[statusField], nextStatus, current);
  const elevated = elevatedActionFor(panel, transition.to);
  if (elevated) requireAdminPermission(actor, panelResource(panel), elevated);
  const result = firstRecord(await adminSupabaseRpc('apply_operational_status_atomic', {
    p_entity_type: entity,
    p_entity_id: id,
    p_next_status: transition.to,
    p_note: limited(note, 1000) || null,
    p_actor_ref: actor.id,
    p_actor_role: actor.role,
    p_request_id: req.aranduRequestId
  }));
  return { from: transition.from, to: transition.to, record: result?.record || null };
}
async function handleOperational(req, res) {
  const guard = await adminGuard(req, res);
  if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error, code: guard.code });
  const url = new URL(req.url, 'http://localhost');
  const resource = clean(url.searchParams.get('resource'));
  if (!validOperationalResource(resource)) return json(res, 400, { ok: false, error: 'Recurso operacional inválido.' });
  if (req.method === 'GET') {
    requireAdminPermission(guard.actor, resource, 'read');
    const entityType = clean(url.searchParams.get('entity_type'));
    const entityId = clean(url.searchParams.get('entity_id'));
    if (!entityType || !entityId) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' });
    const query = `${operationalTable(resource)}?select=*&entity_type=eq.${encodeURIComponent(entityType)}&entity_id=eq.${encodeURIComponent(entityId)}&order=${encodeURIComponent(operationalOrder(resource))}`;
    const rows = await dataRequest(query, { method: 'GET', headers: { Prefer: '' } });
    return json(res, 200, { ok: true, mode: 'stored', resource, items: rows || [] });
  }
  if (resource === 'status-history') {
    // A trilha operacional é imutável: só é escrita pela máquina de estados.
    return json(res, 405, { ok: false, error: 'A trilha de status é somente leitura.' });
  }
  if (req.method === 'POST') {
    requireAdminPermission(guard.actor, resource, 'create');
    const body = await readBody(req);
    const record = resource === 'notes' ? normalizeNote(body) : normalizeOperationalTask(body);
    if (!record.entity_type || !record.entity_id) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' });
    if (resource === 'notes' && !record.note) return json(res, 400, { ok: false, error: 'Nota obrigatória.' });
    if (resource === 'tasks' && !record.title) return json(res, 400, { ok: false, error: 'Título da tarefa obrigatório.' });
    const saved = await dataRequest(operationalTable(resource), {
      method: 'POST',
      headers: auditRequestHeaders(guard.actor, req.aranduRequestId, body.justification),
      body: JSON.stringify(record)
    });
    return json(res, 201, { ok: true, mode: 'stored', stored: true, resource, record: firstRecord(saved) });
  }
  if (req.method === 'PATCH') {
    requireAdminPermission(guard.actor, resource, 'update');
    if (resource !== 'tasks') return json(res, 400, { ok: false, error: 'Apenas tarefas aceitam atualização operacional.' });
    const body = await readBody(req);
    const id = clean(body.id);
    const status = clean(body.status);
    if (!id) return json(res, 400, { ok: false, error: 'ID da tarefa obrigatório.' });
    if (!['open','doing','done','cancelled'].includes(status)) return json(res, 400, { ok: false, error: 'Status de tarefa inválido.' });
    const saved = await dataRequest(`tasks?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: auditRequestHeaders(guard.actor, req.aranduRequestId, body.justification),
      body: JSON.stringify({ status, updated_at: new Date().toISOString() })
    });
    return json(res, 200, { ok: true, mode: 'stored', stored: true, record: firstRecord(saved) });
  }
  return json(res, 405, { ok: false, error: 'Método não permitido.' });
}
async function handleMedia(req, res) {
  const access = await adminGuard(req, res);
  if (!access.ok) return json(res, access.status, { ok: false, error: access.error, code: access.code });
  if (req.method === 'GET') {
    requireAdminPermission(access.actor, 'media', 'read');
    const url = new URL(req.url, 'http://localhost');
    const entityType = clean(url.searchParams.get('entity_type'));
    const entityId = clean(url.searchParams.get('entity_id'));
    if (!entityType || !entityId) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' });
    const rows = await dataRequest(`media_assets?select=*&entity_type=eq.${encodeURIComponent(entityType)}&entity_id=eq.${encodeURIComponent(entityId)}&order=position.asc,created_at.desc`, { method: 'GET', headers: { Prefer: '' } });
    return json(res, 200, { ok: true, mode: 'stored', items: rows || [] });
  }
  if (req.method === 'POST') {
    requireAdminPermission(access.actor, 'media', 'create');
    const body = await readBody(req);
    const record = {
      entity_type: clean(body.entity_type),
      entity_id: clean(body.entity_id),
      asset_type: clean(body.asset_type) || 'image',
      url: clean(body.url),
      alt: clean(body.alt) || null,
      position: Number.isFinite(Number(body.position)) ? Number(body.position) : 1,
      payload: body.payload && typeof body.payload === 'object' ? body.payload : {}
    };
    if (!record.entity_type || !record.entity_id) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' });
    if (!record.url || !validUrl(record.url)) return json(res, 400, { ok: false, error: 'URL de mídia inválida.' });
    const saved = await dataRequest('media_assets', {
      method: 'POST',
      headers: auditRequestHeaders(access.actor, req.aranduRequestId, body.justification),
      body: JSON.stringify(record)
    });
    return json(res, 201, { ok: true, mode: 'stored', stored: true, record: firstRecord(saved) });
  }
  return json(res, 405, { ok: false, error: 'Método não permitido.' });
}

function editorialRequirements(entityType) {
  return entityType === 'artist'
    ? ['identity','origin','publicationConsent','portfolio','profile']
    : ['artistApproved','imageAuthorization','provenance','price','availability','technicalSheet'];
}

function editorialChecklist(body, entityType) {
  const source = safeObject(body);
  return Object.fromEntries(editorialRequirements(entityType).map((key) => [key, source[key] === true]));
}

async function handleCatalogReview(req, res) {
  const guard = await adminGuard(req, res);
  if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error, code: guard.code });
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const entityType = clean(url.searchParams.get('entityType'));
    const entityId = limited(url.searchParams.get('entityId'), 160);
    requireAdminPermission(guard.actor, entityType === 'artist' ? 'artists' : 'artworks', 'read');
    const readiness = firstRecord(await dataRequest('v_catalog_editorial_readiness?select=*&limit=1', { method: 'GET', headers: { Prefer: '' } }));
    const history = entityType && entityId
      ? await dataRequest(`catalog_review_history?entity_type=eq.${encodeURIComponent(entityType)}&entity_id=eq.${encodeURIComponent(entityId)}&select=*&order=created_at.desc&limit=100`, { method: 'GET', headers: { Prefer: '' } })
      : [];
    return json(res, 200, { ok: true, readiness, history });
  }
  if (req.method !== 'PATCH') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const body = await readBody(req);
  const entityType = clean(body.entityType || body.entity_type);
  const entityId = limited(body.entityId || body.entity_id, 160);
  const nextStatus = clean(body.status);
  if (!['artist','artwork'].includes(entityType)) throw new HttpError(400, 'Tipo editorial inválido.');
  requireAdminPermission(guard.actor, entityType === 'artist' ? 'artists' : 'artworks', 'review');
  if (!entityId) throw new HttpError(400, 'Entidade editorial obrigatória.');
  if (!EDITORIAL_STATUSES.has(nextStatus)) throw new HttpError(400, 'Status editorial inválido.');
  const checklist = editorialChecklist(body.checklist, entityType);
  if (['approved','published'].includes(nextStatus) && Object.values(checklist).some((value) => value !== true)) {
    throw new HttpError(409, 'Complete toda a documentação antes de aprovar ou publicar.', 'editorial_checklist_incomplete');
  }
  const result = firstRecord(await adminSupabaseRpc('apply_catalog_review_atomic', {
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_next_status: nextStatus,
    p_checklist: checklist,
    p_note: limited(body.note, 1000) || null,
    p_actor_ref: guard.actor.id,
    p_actor_role: guard.actor.role,
    p_request_id: req.aranduRequestId
  }));
  return json(res, 200, result);
}


  return { handleAdmin, handleAdminUpdate, handleOperational, handleMedia, handleCatalogReview };
}

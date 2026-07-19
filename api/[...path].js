import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
const ADMIN_TOKEN = process.env.ARANDU_ADMIN_TOKEN;
const COOKIE_NAME = 'arandu_session';
const PILOT_COOKIE_NAME = 'arandu_pilot';
const MAX_AGE = 60 * 60 * 24 * 7;
const PILOT_MAX_AGE = 60 * 60 * 24 * 30;
const MAX_BODY_BYTES = 128 * 1024;
const PUBLIC_PROFILE_TYPES = new Set(['comprador', 'artista', 'empresa', 'arquiteto']);
const PUBLIC_SELECTION_STATUSES = new Set(['open', 'sent', 'reviewed']);
const RATE_LIMITS = new Map();
const PILOT_EVENT_TYPES = new Set(['page_view','search','artwork_view','selection_add','reservation_start','reservation_complete','form_submit','pilot_task']);
const CONVERSION_EVENT_TYPES = new Set(['search','catalog_view','artwork_view','selection_add','contact_start','reservation_start','reservation_complete']);
const PRIVACY_REQUEST_TYPES = new Set(['access','correction','deletion','portability']);
const EDITORIAL_STATUSES = new Set(['draft','documentation_pending','curatorial_review','approved','published','rejected','archived']);
const CONSENT_VERSION = '2026-07-17';

class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(res, status, payload, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  Object.entries(extraHeaders).forEach(([key, value]) => res.setHeader(key, value));
  res.end(JSON.stringify(payload));
}

function html(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  const declaredSize = Number(req.headers?.['content-length'] || 0);
  if (declaredSize > MAX_BODY_BYTES) throw new HttpError(413, 'Solicitação muito grande.');
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new HttpError(413, 'Solicitação muito grande.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'JSON inválido.'); }
}

function hasDataConfig() { return Boolean(SUPABASE_URL && SUPABASE_KEY); }
function hasPublicDataConfig() { return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY); }
function authConfigured() { return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY); }
function requireDataConfig() {
  if (!hasDataConfig()) throw new HttpError(503, 'O banco de produção ainda não está configurado.', 'database_unconfigured');
}
function firstRecord(data) { return Array.isArray(data) ? data[0] || null : data; }
function clean(value) { return String(value || '').trim(); }
function limited(value, max = 500) { return clean(value).slice(0, max); }
function cleanEmail(value) { return limited(value, 254).toLowerCase(); }
function cleanPhone(value) { return clean(value).replace(/\D/g, '').slice(0, 15); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(value)); }
function trueFlag(value) { return ['1','true','yes','sim'].includes(clean(value).toLowerCase()); }
function requireCommercialReady() {
  if (!trueFlag(process.env.ARANDU_COMMERCIAL_READY)) {
    throw new HttpError(503, 'Reservas e propostas aguardam a aprovação da política comercial.', 'commercial_policy_pending');
  }
}
function publicProfileType(value) { const type = clean(value).toLowerCase(); return PUBLIC_PROFILE_TYPES.has(type) ? type : 'comprador'; }
function validUrl(value) { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol); } catch { return false; } }
function safeSelectionUrl(value) {
  const raw = limited(value, 500);
  if (!raw) return '';
  try {
    const url = new URL(raw, 'https://arandu.local');
    return ['http:', 'https:'].includes(url.protocol) ? raw : '';
  } catch { return ''; }
}
function escapeHtml(value) { return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function safeObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }

function clientFingerprint(req, scope) {
  const forwarded = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.socket?.remoteAddress || 'unknown';
  return createHash('sha256').update(`${scope}:${ip}`).digest('hex');
}

function enforceMemoryRateLimit(req, scope, limit, windowMs) {
  const now = Date.now();
  if (RATE_LIMITS.size > 2000) {
    for (const [entryKey, value] of RATE_LIMITS) if (value.resetAt <= now) RATE_LIMITS.delete(entryKey);
  }
  const key = clientFingerprint(req, scope);
  const current = RATE_LIMITS.get(key);
  if (!current || current.resetAt <= now) {
    RATE_LIMITS.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  current.count += 1;
  if (current.count > limit) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
}

async function enforceRateLimit(req, scope, limit, windowMs) {
  const distributed = trueFlag(process.env.ARANDU_DISTRIBUTED_RATE_LIMIT) || Boolean(process.env.VERCEL_ENV);
  if (!distributed) return enforceMemoryRateLimit(req, scope, limit, windowMs);
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new HttpError(503, 'A proteção distribuída contra abuso ainda não foi configurada.', 'rate_limit_unconfigured');
  }
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/consume_rate_limit`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      p_scope: scope,
      p_fingerprint: clientFingerprint(req, scope),
      p_limit: limit,
      p_window_seconds: Math.max(1, Math.ceil(windowMs / 1000))
    })
  });
  const allowed = await response.json().catch(() => null);
  if (!response.ok) throw new HttpError(503, 'A proteção contra abuso está temporariamente indisponível.', 'rate_limit_unavailable');
  if (allowed !== true) throw new HttpError(429, 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
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
      Prefer: 'return=representation',
      ...(options.headers || {})
    },
    body: options.body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || `Banco ${response.status}`);
  return data;
}

async function publicDataRequest(resource, options = {}) {
  if (!hasPublicDataConfig()) throw new HttpError(503, 'A leitura pública segura do Supabase ainda não foi configurada.', 'public_database_unconfigured');
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${resource}`, {
    method: options.method || 'GET',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: '',
      ...(options.headers || {})
    },
    body: options.body
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || `Banco público ${response.status}`);
  return data;
}

async function writeAudit({ actorType, actorRef, action, entityType = null, entityId = null, metadata = {} }) {
  await dataRequest('audit_logs', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      actor_type: actorType,
      actor_ref: limited(actorRef, 160) || null,
      action: limited(action, 120),
      entity_type: limited(entityType, 80) || null,
      entity_id: limited(entityId, 160) || null,
      metadata: safeObject(metadata)
    })
  });
}

async function beginIdempotency(req, scope, body) {
  const rawKey = limited(req.headers?.['idempotency-key'], 128);
  if (!rawKey) return null;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(rawKey)) throw new HttpError(400, 'Idempotency-Key inválida.');
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const requestHash = createHash('sha256').update(JSON.stringify(body || {})).digest('hex');
  const existing = firstRecord(await dataRequest(`idempotency_keys?scope=eq.${encodeURIComponent(scope)}&key_hash=eq.${keyHash}&select=request_hash,response_status,response_body,expires_at&limit=1`, { method: 'GET', headers: { Prefer: '' } }));
  if (existing) {
    if (existing.request_hash !== requestHash) throw new HttpError(409, 'A mesma chave de idempotência foi usada com dados diferentes.');
    if (existing.response_body && existing.response_status) return { replay: true, status: existing.response_status, payload: existing.response_body };
    throw new HttpError(409, 'Esta solicitação já está sendo processada.', 'idempotency_in_progress');
  }
  await dataRequest('idempotency_keys', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ scope, key_hash: keyHash, request_hash: requestHash }) });
  return { replay: false, scope, keyHash };
}

async function finishIdempotency(context, status, payload) {
  if (!context || context.replay) return;
  await dataRequest(`idempotency_keys?scope=eq.${encodeURIComponent(context.scope)}&key_hash=eq.${context.keyHash}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ response_status: status, response_body: payload }) });
}

async function supabaseAuth(path, options = {}) {
  if (!authConfigured()) throw new Error('Autenticação Supabase não configurada.');
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/${path}`, {
    ...options,
    headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.msg || data.message || `Auth ${response.status}`);
  return data;
}

function readCookie(req, name) {
  try {
    const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, decodeURIComponent(value.join('=') || '')];
    }).filter(([key]) => key));
    return cookies[name] || '';
  } catch { return null; }
}

function readSessionCookie(req) {
  try {
    const value = readCookie(req, COOKIE_NAME);
    if (!value) return null;
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch { return null; }
}

function sessionCookie(session) {
  const value = Buffer.from(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || MAX_AGE)
  })).toString('base64url');
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Priority=High; Max-Age=${MAX_AGE}`;
}

function clearSessionCookie() { return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`; }
function constantTimeEqual(left, right) {
  const leftHash = createHash('sha256').update(String(left || '')).digest();
  const rightHash = createHash('sha256').update(String(right || '')).digest();
  return timingSafeEqual(leftHash, rightHash);
}
function pilotEnabled() { return trueFlag(process.env.ARANDU_PILOT_ENABLED); }
function pilotConfigured() {
  return pilotEnabled() && clean(process.env.ARANDU_PILOT_ACCESS_CODE).length >= 10 && clean(process.env.ARANDU_PILOT_SECRET).length >= 32;
}
function pilotToken() {
  if (!pilotConfigured()) return '';
  return createHash('sha256').update(`${process.env.ARANDU_PILOT_SECRET}:${process.env.ARANDU_PILOT_ACCESS_CODE}`).digest('base64url');
}
function pilotAuthenticated(req) {
  if (!pilotEnabled()) return false;
  const supplied = readCookie(req, PILOT_COOKIE_NAME);
  const expected = pilotToken();
  return Boolean(supplied && expected && constantTimeEqual(supplied, expected));
}
function requirePilotAccess(req) {
  if (!pilotEnabled()) throw new HttpError(403, 'O piloto fechado não está ativo.', 'pilot_disabled');
  if (!pilotConfigured()) throw new HttpError(503, 'O piloto ainda não foi configurado no servidor.', 'pilot_unconfigured');
  if (!pilotAuthenticated(req)) throw new HttpError(401, 'Código do piloto necessário.', 'pilot_access_required');
}
function pilotCookie() { return `${PILOT_COOKIE_NAME}=${encodeURIComponent(pilotToken())}; Path=/; HttpOnly; SameSite=Lax; Secure; Priority=High; Max-Age=${PILOT_MAX_AGE}`; }
function clearPilotCookie() { return `${PILOT_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`; }
function publicUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email,
    full_name: limited(meta.full_name || meta.name || user.email, 160),
    profile_type: publicProfileType(meta.profile_type)
  };
}

async function resolveSession(req) {
  if (!authConfigured()) return { authenticated: false, mode: 'unconfigured', user: null, headers: {} };
  const session = readSessionCookie(req);
  if (!session?.access_token) return { authenticated: false, mode: 'supabase', user: null, headers: {} };

  const expiresSoon = Number(session.expires_at || 0) <= Math.floor(Date.now() / 1000) + 30;
  if (!expiresSoon) {
    try {
      const user = await supabaseAuth('user', { method: 'GET', headers: { Authorization: `Bearer ${session.access_token}` } });
      return { authenticated: true, mode: 'supabase', user: publicUser(user), headers: {} };
    } catch {}
  }

  if (!session.refresh_token) return { authenticated: false, mode: 'supabase', user: null, headers: { 'Set-Cookie': clearSessionCookie() } };
  try {
    const refreshed = await supabaseAuth('token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    const user = refreshed.user || await supabaseAuth('user', { method: 'GET', headers: { Authorization: `Bearer ${refreshed.access_token}` } });
    return {
      authenticated: true,
      mode: 'supabase',
      user: publicUser(user),
      headers: { 'Set-Cookie': sessionCookie(refreshed) }
    };
  } catch {
    return { authenticated: false, mode: 'supabase', user: null, headers: { 'Set-Cookie': clearSessionCookie() } };
  }
}

async function optionalUser(req) {
  const session = await resolveSession(req);
  return { session, user: session.authenticated ? session.user : null };
}

async function requireUser(req) {
  const session = await resolveSession(req);
  if (!session.authenticated || !session.user?.id) throw new HttpError(401, 'Entre na sua conta para acessar estes dados.');
  return session;
}

function tokenFrom(req) {
  const authorization = req.headers.authorization || '';
  const bearer = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  return String(req.headers['x-arandu-admin-token'] || bearer || '').trim();
}

function adminGuard(req) {
  if (!ADMIN_TOKEN) return { ok: false, status: 503, error: 'ARANDU_ADMIN_TOKEN não configurado no servidor.' };
  if (!constantTimeEqual(tokenFrom(req), ADMIN_TOKEN)) return { ok: false, status: 401, error: 'Acesso administrativo não autorizado.' };
  if (!hasDataConfig()) return { ok: false, status: 503, error: 'O banco de produção ainda não está configurado.' };
  return { ok: true };
}

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

function panelConfig(panel) { return PANELS[String(panel || '').trim()] || null; }
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
function normalizeField(field, value) { if (value === undefined) return undefined; if (value === '') return null; if (ARRAYS.has(field)) return listFrom(value); if (NUMBERS.has(field)) { const parsed = Number(String(value).replace(/\./g, '').replace(',', '.')); return Number.isFinite(parsed) ? parsed : null; } if (BOOLEANS.has(field)) return value === true || value === 'true' || value === '1' || value === 'on'; if (JSONS.has(field)) { if (value && typeof value === 'object') return value; try { return value ? JSON.parse(value) : {}; } catch { return {}; } } return String(value).trim(); }
function buildPayload(panel, fields) { return (ALLOWED[panel] || []).reduce((payload, field) => { const value = normalizeField(field, fields[field]); if (value !== undefined) payload[field] = value; return payload; }, {}); }

function normalizeFormPayload(body) {
  const type = limited(body.type || body.form_type || 'contato', 80);
  const data = body.data || body;
  let table = 'leads';
  let record = {
    type,
    name: limited(data.nome || data.name || data.nome_completo, 160) || null,
    email: cleanEmail(data.email) || null,
    whatsapp: cleanPhone(data.whatsapp || data.telefone || data.phone) || null,
    company: limited(data.empresa || data.company, 180) || null,
    message: limited(data.mensagem || data.message, 4000) || null,
    source_page: limited(body.page || body.source_page, 240) || null,
    status: 'new',
    payload: body
  };
  if (type === 'submissao-artista') {
    table = 'artist_submissions';
    record = {
      name: limited(data.nome_completo || data.nome, 160) || null,
      artist_name: limited(data.nome_artistico || data.artist_name || data.nome, 160) || null,
      city: limited(data.cidade, 120) || null,
      state: limited(data.estado || data.uf, 40) || null,
      portfolio_url: limited(data.portfolio || data.portfolio_url, 500) || null,
      instagram: limited(data.instagram, 180) || null,
      email: cleanEmail(data.email) || null,
      whatsapp: cleanPhone(data.whatsapp || data.telefone) || null,
      languages: limited(data.linguagens || data.languages, 500) || null,
      price_range: limited(data.faixa_preco || data.orcamento, 160) || null,
      message: limited(data.mensagem, 4000) || null,
      status: 'received',
      payload: body
    };
  }
  if (type === 'empresa-intencao' || type === 'proposta-empresa') {
    table = 'company_briefs';
    record = {
      ...record,
      project_type: limited(data.tipo_projeto || data.espaco, 160) || null,
      environment: limited(data.ambiente, 500) || null,
      budget: limited(data.orcamento || data.budget, 160) || null,
      deadline: limited(data.prazo, 160) || null,
      status: 'received'
    };
    delete record.type;
  }
  if (type === 'newsletter') {
    table = 'newsletter_subscriptions';
    record = {
      email: cleanEmail(data.email),
      name: limited(data.nome || data.name, 160) || null,
      source_page: limited(body.page, 240) || null,
      payload: body
    };
  }
  return { table, record };
}

function normalizeReservation(body) {
  return {
    artwork_id: limited(body.artwork_id || body.artworkId || body.id, 180) || null,
    name: limited(body.name, 160) || null,
    whatsapp: cleanPhone(body.whatsapp) || null,
    deadline: limited(body.deadline, 160) || null,
    notes: limited(body.notes, 3000) || null,
    status: 'requested',
    payload: body
  };
}
function normalizeProposal(body) { const items = Array.isArray(body.items) ? body.items : []; const total = Number(body.total || 0) || null; return { proposal: { client: body.client || null, space: body.space || null, goal: body.goal || null, budget: body.budget || null, deadline: body.deadline || null, notes: body.notes || null, total, status: 'draft', payload: body }, items }; }
function normalizeSelectionItem(item) {
  return {
    id: limited(item?.id || item?.artwork_id, 180),
    title: limited(item?.title, 240),
    artist: limited(item?.artist || item?.artist_name, 180),
    context: limited(item?.context, 500),
    url: safeSelectionUrl(item?.url),
    price: Number.isFinite(Number(item?.price)) && Number(item.price) >= 0 ? Number(item.price) : null,
    priceLabel: limited(item?.priceLabel || item?.price_label, 120),
    technique: limited(item?.technique, 180),
    dimensions: limited(item?.dimensions, 120),
    status: limited(item?.status, 80),
    thumb: limited(item?.thumb, 500).replace(/[^a-zA-Z0-9 _-]/g, ''),
    note: limited(item?.note, 1000)
  };
}

function normalizeBriefing(value) {
  const briefing = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(briefing).slice(0, 30).map(([key, item]) => [limited(key, 80), limited(item, 1200)]));
}

function normalizeSelection(body) {
  const briefing = normalizeBriefing(body.briefing);
  const items = Array.isArray(body.items)
    ? body.items.slice(0, 40).map(normalizeSelectionItem).filter((item) => item.id)
    : [];
  return {
    name: limited(body.name || briefing.nome || briefing.name, 160) || null,
    email: cleanEmail(body.email || briefing.email) || null,
    whatsapp: cleanPhone(body.whatsapp || briefing.whatsapp || briefing.telefone) || null,
    items,
    briefing: {
      ...briefing,
      source: limited(body.source || briefing.source || 'minha-selecao', 120),
      shared_at: limited(body.createdAt, 80) || new Date().toISOString()
    },
    status: 'open'
  };
}

function withoutPersonalBriefingFields(value) {
  const briefing = normalizeBriefing(value);
  ['nome', 'name', 'email', 'whatsapp', 'telefone', 'phone'].forEach((key) => delete briefing[key]);
  return briefing;
}

function publicSelection(record) {
  if (!record || !PUBLIC_SELECTION_STATUSES.has(record.status)) return null;
  return {
    public_token: record.public_token,
    status: record.status,
    items: Array.isArray(record.items) ? record.items.map(normalizeSelectionItem) : [],
    briefing: withoutPersonalBriefingFields(record.briefing),
    updated_at: record.updated_at || record.created_at || null
  };
}

function accountSelection(record) {
  if (!record) return null;
  return {
    id: record.id,
    public_token: record.public_token,
    status: record.status,
    items: Array.isArray(record.items) ? record.items.map(normalizeSelectionItem) : [],
    briefing: normalizeBriefing(record.briefing),
    created_at: record.created_at || null,
    updated_at: record.updated_at || null
  };
}

function accountReservation(record) {
  if (!record) return null;
  return {
    id: record.id,
    artwork_id: record.artwork_id,
    status: record.status,
    deadline: record.deadline,
    notes: record.notes,
    created_at: record.created_at || null,
    updated_at: record.updated_at || null
  };
}
function normalizeNote(body) { return { entity_type: clean(body.entity_type), entity_id: clean(body.entity_id), author_name: body.author_name || 'Curadoria', note: clean(body.note) }; }
function normalizeOperationalTask(body) { return { entity_type: clean(body.entity_type), entity_id: clean(body.entity_id), title: clean(body.title), owner_name: body.owner_name || 'Curadoria', due_at: body.due_at ? new Date(body.due_at).toISOString() : null, priority: ['low','normal','high'].includes(body.priority) ? body.priority : 'normal', status: ['open','doing','done','cancelled'].includes(body.status) ? body.status : 'open' }; }
function validOperationalResource(resource) { return resource === 'notes' || resource === 'tasks'; }
function operationalTable(resource) { return resource === 'notes' ? 'crm_notes' : 'tasks'; }
function operationalOrder(resource) { return resource === 'notes' ? 'created_at.desc' : 'due_at.asc.nullslast,created_at.desc'; }
function hashCertificate(certificate) { const raw = [certificate.code, certificate.artwork_id, certificate.artist_id, certificate.issued_to, certificate.issued_at].filter(Boolean).join('|'); return createHash('sha256').update(raw || certificate.code || 'arandu').digest('hex'); }

function certificateDocumentHtml(certificate, artwork) {
  const hash = certificate.certificate_hash || hashCertificate(certificate);
  const valid = certificate.verification_status === 'valid';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Certificado ${escapeHtml(certificate.code)} — Arandu</title><style>body{margin:0;background:#efe3d1;color:#211713;font-family:Arial,sans-serif}.sheet{max-width:900px;margin:40px auto;padding:56px;background:#fff8ed;border:1px solid #ad8a62;box-shadow:0 24px 80px rgba(33,23,19,.18)}.brand{font-family:Georgia,serif;font-size:44px;color:#7b1f17;margin:0}.eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:12px;color:#7b1f17;font-weight:800}.title{font-family:Georgia,serif;font-size:32px;margin:24px 0 8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin:32px 0}.box{border:1px solid rgba(111,34,27,.25);padding:18px;border-radius:18px;background:#f7ead9}.status{display:inline-block;padding:8px 12px;border-radius:999px;background:${valid ? '#173f31' : '#7b1f17'};color:#fff8ed;font-weight:800}.hash{font-family:monospace;word-break:break-all;font-size:12px}.actions{margin-top:28px}.actions button{padding:12px 18px;border-radius:999px;border:0;background:#7b1f17;color:#fff8ed;font-weight:800}@media print{body{background:#fff}.sheet{box-shadow:none;margin:0;max-width:none;border:0}.actions{display:none}}</style></head><body><main class="sheet"><p class="eyebrow">Certificado de autenticidade</p><h1 class="brand">Arandu</h1><h2 class="title">${escapeHtml(artwork?.title || certificate.artwork_id || 'Obra certificada')}</h2><p>Este documento registra a verificação curatorial e documental da obra no acervo Arandu.</p><span class="status">${valid ? 'Certificado válido' : escapeHtml(certificate.verification_status || 'Em análise')}</span><div class="grid"><section class="box"><p class="eyebrow">Código</p><h3>${escapeHtml(certificate.code)}</h3><p><strong>Obra:</strong> ${escapeHtml(artwork?.title || certificate.artwork_id || '—')}</p><p><strong>Artista:</strong> ${escapeHtml(artwork?.artist_name || certificate.artist_id || '—')}</p><p><strong>Técnica:</strong> ${escapeHtml(artwork?.technique || '—')}</p><p><strong>Dimensões:</strong> ${escapeHtml(artwork?.dimensions || '—')}</p></section><section class="box"><p class="eyebrow">Emissão</p><p><strong>Emitido para:</strong> ${escapeHtml(certificate.issued_to || 'Registro curatorial')}</p><p><strong>Data:</strong> ${certificate.issued_at ? escapeHtml(new Date(certificate.issued_at).toLocaleDateString('pt-BR')) : '—'}</p><p><strong>Status:</strong> ${escapeHtml(certificate.verification_status)}</p><p><strong>Hash:</strong></p><p class="hash">${escapeHtml(hash)}</p></section></div><section class="box"><p class="eyebrow">Notas</p><p>${escapeHtml(certificate.certificate_notes || 'Certificado vinculado à obra, ao artista e à verificação pública por código.')}</p></section><div class="actions"><button onclick="window.print()">Imprimir / salvar PDF</button></div></main></body></html>`;
}

const PUBLIC_CATALOG_SELECT = [
  'id','slug','title','artist_id','artist_name','artist_city','artist_region','artist_languages',
  'language','type','technique','support','year','dimensions','price','price_label','status',
  'edition','edition_size','certificate','thumb','main_image_url','detail_image_url','room_image_url',
  'recommended_for','tags','moods','spaces','search','summary','curatorial_reading','first_artwork',
  'logistics','created_at','updated_at'
].join(',');
const PUBLIC_ARTIST_SELECT = [
  'id','name','slug','city','state','region','languages','curatorial_axes','profile','trajectory',
  'statement','status','artist_level','image_url','studio_image_url','created_at','updated_at'
].join(',');

async function catalogReadiness() {
  if (!hasPublicDataConfig()) throw new HttpError(503, 'A leitura pública segura do Supabase ainda não foi configurada.', 'public_database_unconfigured');
  let row;
  try {
    row = firstRecord(await publicDataRequest('v_catalog_readiness?select=*&id=eq.production&limit=1'));
  } catch (error) {
    throw new HttpError(503, 'A migration de prontidão do catálogo ainda não foi aplicada.', 'catalog_migration_pending');
  }
  if (!row?.verified_ready) {
    throw new HttpError(503, 'O catálogo real ainda está em validação e não foi liberado para publicação.', 'catalog_not_verified');
  }
  return row;
}

async function handleForms(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  await enforceRateLimit(req, 'forms', 30, 10 * 60 * 1000);
  const body = await readBody(req);
  if (clean(body.website || body.data?.website)) return json(res, 202, { ok: true, stored: false });
  const { table, record } = normalizeFormPayload(body);
  const { session, user } = await optionalUser(req);
  if (user && (table === 'leads' || table === 'company_briefs')) record.user_id = user.id;
  if (record.email && !validEmail(record.email)) throw new HttpError(400, 'Informe um e-mail válido.');
  if (table === 'newsletter_subscriptions' && !record.email) throw new HttpError(400, 'E-mail é obrigatório.');
  requireDataConfig();
  const saved = firstRecord(await dataRequest(table, { method: 'POST', body: JSON.stringify(record) }));
  return json(res, 201, {
    ok: true,
    mode: 'stored',
    stored: true,
    table,
    record: saved ? { id: saved.id, status: saved.status || 'received', created_at: saved.created_at || null } : null
  }, session.headers);
}

async function handleReservations(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  requireCommercialReady();
  await enforceRateLimit(req, 'reservations', 20, 10 * 60 * 1000);
  const body = await readBody(req);
  const idempotency = await beginIdempotency(req, 'reservation.create', body);
  if (idempotency?.replay) return json(res, idempotency.status, idempotency.payload, { 'Idempotency-Replayed': 'true' });
  if (clean(body.website)) return json(res, 202, { ok: true, stored: false });
  const record = normalizeReservation(body);
  if (!record.artwork_id) throw new HttpError(400, 'Obra é obrigatória.');
  if (!record.name) throw new HttpError(400, 'Nome é obrigatório.');
  if (!record.whatsapp || record.whatsapp.length < 10) throw new HttpError(400, 'Informe um WhatsApp válido com DDD.');
  const { session, user } = await optionalUser(req);
  if (user) record.user_id = user.id;
  requireDataConfig();
  const saved = firstRecord(await dataRequest('reservations', { method: 'POST', body: JSON.stringify(record) }));
  const payload = {
    ok: true,
    mode: 'stored',
    stored: true,
    reservation: accountReservation(saved)
  };
  await finishIdempotency(idempotency, 201, payload);
  return json(res, 201, payload, session.headers);
}
async function handleProposals(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const body = await readBody(req);
  const idempotency = await beginIdempotency(req, 'proposal.create', body);
  if (idempotency?.replay) return json(res, idempotency.status, idempotency.payload, { 'Idempotency-Replayed': 'true' });
  const { proposal, items } = normalizeProposal(body);
  requireDataConfig();
  const savedProposal = firstRecord(await dataRequest('proposals', { method: 'POST', body: JSON.stringify(proposal) }));
  if (savedProposal?.id && items.length) {
    const rows = items.map((item, index) => ({ proposal_id: savedProposal.id, artwork_id: item.id || item.artwork_id || null, position: index + 1, price: Number(item.price || 0) || null, note: item.note || item.context || null })).filter((row) => row.artwork_id);
    if (rows.length) await dataRequest('proposal_items', { method: 'POST', body: JSON.stringify(rows) });
  }
  const payload = { ok: true, mode: 'stored', stored: true, proposal: savedProposal };
  await finishIdempotency(idempotency, 201, payload);
  return json(res, 201, payload);
}
async function handleCertificates(req, res) { if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' }); const url = new URL(req.url, 'http://localhost'); const code = clean(url.searchParams.get('code') || url.searchParams.get('id')).toUpperCase(); if (!code) return json(res, 400, { ok: false, error: 'Código obrigatório.' }); if (!/^[A-Z0-9-]{4,80}$/.test(code)) return json(res, 400, { ok: false, error: 'Código inválido.' }); await enforceRateLimit(req, 'certificate-read', 60, 10 * 60 * 1000); const rows = await publicDataRequest(`certificates?code=eq.${encodeURIComponent(code)}&verification_status=eq.valid&select=code,verification_status,artwork_id,artist_id,issued_at,certificate_hash,certificate_notes&limit=1`); return json(res, 200, { ok: true, mode: 'stored', certificate: firstRecord(rows) }); }
async function handleCertificateDocument(req, res) { if (req.method !== 'GET') return html(res, 405, '<h1>Método não permitido.</h1>'); const url = new URL(req.url, 'http://localhost'); const code = clean(url.searchParams.get('code')).toUpperCase(); if (!code) return html(res, 400, '<h1>Código obrigatório.</h1>'); if (!/^[A-Z0-9-]{4,80}$/.test(code)) return html(res, 400, '<h1>Código inválido.</h1>'); await enforceRateLimit(req, 'certificate-document', 30, 10 * 60 * 1000); const certificate = firstRecord(await publicDataRequest(`certificates?code=eq.${encodeURIComponent(code)}&verification_status=eq.valid&select=code,verification_status,artwork_id,artist_id,issued_to,issued_at,certificate_hash,certificate_notes&limit=1`)); if (!certificate) return html(res, 404, '<h1>Certificado não encontrado.</h1>'); const artwork = certificate.artwork_id ? firstRecord(await publicDataRequest(`v_public_catalog?id=eq.${encodeURIComponent(certificate.artwork_id)}&select=id,title,artist_name,technique,dimensions&limit=1`)) : null; return html(res, 200, certificateDocumentHtml(certificate, artwork)); }
async function handleCatalog(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const readiness = await catalogReadiness();
  const rows = await publicDataRequest(`v_public_catalog?select=${PUBLIC_CATALOG_SELECT}&order=created_at.desc`);
  return json(res, 200, { ok: true, mode: 'supabase', verifiedReady: true, release: readiness.dataset_version, items: rows || [] });
}
async function handleArtists(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const readiness = await catalogReadiness();
  const rows = await publicDataRequest(`v_public_artists?select=${PUBLIC_ARTIST_SELECT}&order=name.asc`);
  return json(res, 200, { ok: true, mode: 'supabase', verifiedReady: true, release: readiness.dataset_version, items: rows || [] });
}
function publicSiteUrl() {
  const candidate = clean(process.env.ARANDU_SITE_URL).replace(/\/$/, '');
  if (!validUrl(candidate)) return null;
  const parsed = new URL(candidate);
  if (parsed.protocol !== 'https:' || parsed.hostname.endsWith('.vercel.app') || parsed.hostname === 'localhost') return null;
  return candidate;
}
async function handlePublicConfig(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const email = cleanEmail(process.env.ARANDU_CONTACT_EMAIL);
  const whatsappNumber = cleanPhone(process.env.ARANDU_WHATSAPP_NUMBER);
  const siteUrl = publicSiteUrl();
  const brandReady = trueFlag(process.env.ARANDU_BRAND_READY);
  const commercialReady = trueFlag(process.env.ARANDU_COMMERCIAL_READY);
  const isPilotEnabled = pilotEnabled();
  return json(res, 200, {
    ok: true,
    brand: { name: 'Arandu', ready: brandReady },
    pilot: { enabled: isPilotEnabled },
    siteUrl,
    contact: {
      email: validEmail(email) ? email : null,
      whatsappNumber: whatsappNumber.length >= 12 ? whatsappNumber : null
    },
    configured: {
      domain: Boolean(siteUrl),
      contact: Boolean(validEmail(email) || whatsappNumber.length >= 12),
      brand: brandReady,
      commercial: commercialReady
    }
  });
}
function validPilotSessionId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}
function pilotEventPayload(payload) {
  const source = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const result = {};
  ['artworkId','formType','status','target'].forEach((field) => {
    if (source[field] !== undefined) result[field] = limited(source[field], 160);
  });
  ['resultCount','queryLength'].forEach((field) => {
    const number = Number(source[field]);
    if (Number.isFinite(number)) result[field] = Math.max(0, Math.min(10000, Math.round(number)));
  });
  return result;
}
async function handleEvents(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  requirePilotAccess(req);
  requireDataConfig();
  await enforceRateLimit(req, 'pilot-events', 180, 10 * 60 * 1000);
  const body = await readBody(req);
  const sessionId = clean(body.sessionId || body.session_id);
  const eventType = clean(body.eventType || body.event_type);
  if (!validPilotSessionId(sessionId)) throw new HttpError(400, 'Sessão do piloto inválida.');
  if (!PILOT_EVENT_TYPES.has(eventType)) throw new HttpError(400, 'Evento do piloto inválido.');
  const record = {
    session_id: sessionId,
    event_type: eventType,
    path: limited(body.path, 240) || '/',
    payload: pilotEventPayload(body.payload)
  };
  await dataRequest('pilot_events', { method: 'POST', body: JSON.stringify(record), headers: { Prefer: 'return=minimal' } });
  return json(res, 201, { ok: true, stored: true });
}
async function handlePilot(req, res, action) {
  if (action === 'session') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const enabled = pilotEnabled();
    return json(res, 200, { ok: true, enabled, configured: pilotConfigured(), authenticated: enabled && pilotAuthenticated(req) });
  }
  if (action === 'access') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'pilot-access', 12, 10 * 60 * 1000);
    if (!pilotEnabled()) throw new HttpError(403, 'O piloto fechado não está ativo.', 'pilot_disabled');
    if (!pilotConfigured()) throw new HttpError(503, 'O piloto ainda não foi configurado no servidor.', 'pilot_unconfigured');
    const body = await readBody(req);
    if (clean(body.website)) return json(res, 202, { ok: true, authenticated: false });
    if (!constantTimeEqual(limited(body.code, 200), process.env.ARANDU_PILOT_ACCESS_CODE)) throw new HttpError(401, 'Código de convite inválido.', 'pilot_invalid_code');
    return json(res, 200, { ok: true, authenticated: true }, { 'Set-Cookie': pilotCookie() });
  }
  if (action === 'logout') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    return json(res, 200, { ok: true, authenticated: false }, { 'Set-Cookie': clearPilotCookie() });
  }
  if (action === 'feedback') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    requirePilotAccess(req);
    requireDataConfig();
    await enforceRateLimit(req, 'pilot-feedback', 20, 60 * 60 * 1000);
    const body = await readBody(req);
    const sessionId = clean(body.sessionId || body.session_id);
    const rating = Number(body.rating);
    if (!validPilotSessionId(sessionId)) throw new HttpError(400, 'Sessão do piloto inválida.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, 'Nota deve estar entre 1 e 5.');
    const record = {
      session_id: sessionId,
      task: limited(body.task, 120) || null,
      rating,
      message: limited(body.message, 2000) || null,
      contact_allowed: body.contactAllowed === true || body.contact_allowed === true
    };
    await dataRequest('pilot_feedback', { method: 'POST', body: JSON.stringify(record), headers: { Prefer: 'return=minimal' } });
    return json(res, 201, { ok: true, stored: true });
  }
  if (action === 'metrics') {
    const guard = adminGuard(req);
    if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error });
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const [events, feedback] = await Promise.all([
      dataRequest('pilot_events?select=session_id,event_type&order=created_at.desc&limit=5000', { method: 'GET', headers: { Prefer: '' } }),
      dataRequest('pilot_feedback?select=session_id,rating&order=created_at.desc&limit=1000', { method: 'GET', headers: { Prefer: '' } })
    ]);
    const eventRows = Array.isArray(events) ? events : [];
    const feedbackRows = Array.isArray(feedback) ? feedback : [];
    const metrics = {
      unique_sessions: new Set(eventRows.map((item) => item.session_id)).size,
      events_total: eventRows.length,
      feedback_total: feedbackRows.length,
      average_rating: feedbackRows.length ? Number((feedbackRows.reduce((sum, item) => sum + Number(item.rating || 0), 0) / feedbackRows.length).toFixed(2)) : 0
    };
    for (const type of PILOT_EVENT_TYPES) metrics[`event_${type}`] = eventRows.filter((item) => item.event_type === type).length;
    return json(res, 200, { ok: true, metrics });
  }
  return json(res, 404, { ok: false, error: 'Rota do piloto não encontrada.' });
}
async function handleAdmin(req, res) { const guard = adminGuard(req); if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error }); if (req.method === 'GET') { const url = new URL(req.url, 'http://localhost'); const panel = url.searchParams.get('panel'); const config = panelConfig(panel); if (!config) return json(res, 400, { ok: false, error: 'Painel inválido.' }); if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', panel, statusOptions: config.statuses, items: [] }); const items = await dataRequest(config.read, { method: 'GET', headers: { Prefer: '' } }); return json(res, 200, { ok: true, mode: 'stored', panel, statusOptions: config.statuses, items: items || [] }); } if (req.method === 'POST') { const body = await readBody(req); const panel = panelFromBody(body); const config = panelConfig(panel); if (!config) return json(res, 400, { ok: false, error: 'Tipo de cadastro inválido.' }); const record = normalizeRecord(panel, body.data || body); if (!record) return json(res, 400, { ok: false, error: 'Este painel ainda não possui criação administrativa.' }); const validation = validateRecord(panel, record); if (validation) return json(res, 400, { ok: false, error: validation }); if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, panel, record }); const saved = await dataRequest(config.table, { method: 'POST', body: JSON.stringify(record) }); return json(res, 201, { ok: true, mode: 'stored', stored: true, panel, record: firstRecord(saved) }); } if (req.method === 'PATCH') { const body = await readBody(req); const panel = clean(body.panel); const id = clean(body.id); const status = clean(body.status); const config = panelConfig(panel); if (!config) return json(res, 400, { ok: false, error: 'Painel inválido.' }); if (!id) return json(res, 400, { ok: false, error: 'ID obrigatório.' }); if (!config.statuses.includes(status)) return json(res, 400, { ok: false, error: 'Status inválido para este painel.' }); if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, panel, id, status }); const rows = await dataRequest(`${config.table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ [config.statusField]: status, updated_at: new Date().toISOString() }) }); const record = firstRecord(rows); if (!record) return json(res, 404, { ok: false, error: 'Registro não encontrado.' }); return json(res, 200, { ok: true, mode: 'stored', stored: true, panel, record }); } return json(res, 405, { ok: false, error: 'Método não permitido.' }); }
async function handleAdminUpdate(req, res) { const access = adminGuard(req); if (!access.ok) return json(res, access.status, { ok: false, error: access.error }); if (req.method !== 'PATCH') return json(res, 405, { ok: false, error: 'Método não permitido.' }); const body = await readBody(req); const panel = clean(body.panel); const id = clean(body.id); const table = TABLES[panel]; const fields = body.fields && typeof body.fields === 'object' ? body.fields : {}; const payload = buildPayload(panel, fields); if (!table) return json(res, 400, { ok: false, error: 'Painel inválido.' }); if (!id) return json(res, 400, { ok: false, error: 'ID obrigatório.' }); if (!Object.keys(payload).length) return json(res, 400, { ok: false, error: 'Nenhum campo válido para atualizar.' }); if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, panel, id, record: { id, ...payload } }); const rows = await dataRequest(`${table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }); const record = firstRecord(rows); if (!record) return json(res, 404, { ok: false, error: 'Registro não encontrado.' }); return json(res, 200, { ok: true, mode: 'stored', stored: true, panel, record }); }
async function handleOperational(req, res) { const guard = adminGuard(req); if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error }); const url = new URL(req.url, 'http://localhost'); const resource = clean(url.searchParams.get('resource')); if (!validOperationalResource(resource)) return json(res, 400, { ok: false, error: 'Recurso operacional inválido.' }); if (req.method === 'GET') { const entityType = clean(url.searchParams.get('entity_type')); const entityId = clean(url.searchParams.get('entity_id')); if (!entityType || !entityId) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' }); if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', resource, items: [] }); const query = `${operationalTable(resource)}?select=*&entity_type=eq.${encodeURIComponent(entityType)}&entity_id=eq.${encodeURIComponent(entityId)}&order=${encodeURIComponent(operationalOrder(resource))}`; const rows = await dataRequest(query, { method: 'GET', headers: { Prefer: '' } }); return json(res, 200, { ok: true, mode: 'stored', resource, items: rows || [] }); } if (req.method === 'POST') { const body = await readBody(req); const record = resource === 'notes' ? normalizeNote(body) : normalizeOperationalTask(body); if (!record.entity_type || !record.entity_id) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' }); if (resource === 'notes' && !record.note) return json(res, 400, { ok: false, error: 'Nota obrigatória.' }); if (resource === 'tasks' && !record.title) return json(res, 400, { ok: false, error: 'Título da tarefa obrigatório.' }); if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, resource, record }); const saved = await dataRequest(operationalTable(resource), { method: 'POST', body: JSON.stringify(record) }); return json(res, 201, { ok: true, mode: 'stored', stored: true, resource, record: firstRecord(saved) }); } if (req.method === 'PATCH') { if (resource !== 'tasks') return json(res, 400, { ok: false, error: 'Apenas tarefas aceitam atualização operacional.' }); const body = await readBody(req); const id = clean(body.id); const status = clean(body.status); if (!id) return json(res, 400, { ok: false, error: 'ID da tarefa obrigatório.' }); if (!['open','doing','done','cancelled'].includes(status)) return json(res, 400, { ok: false, error: 'Status de tarefa inválido.' }); if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, id, status }); const saved = await dataRequest(`tasks?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ status, updated_at: new Date().toISOString() }) }); return json(res, 200, { ok: true, mode: 'stored', stored: true, record: firstRecord(saved) }); } return json(res, 405, { ok: false, error: 'Método não permitido.' }); }
async function handleMedia(req, res) { const access = adminGuard(req); if (!access.ok) return json(res, access.status, { ok: false, error: access.error }); if (req.method === 'GET') { const url = new URL(req.url, 'http://localhost'); const entityType = clean(url.searchParams.get('entity_type')); const entityId = clean(url.searchParams.get('entity_id')); if (!entityType || !entityId) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' }); if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', items: [] }); const rows = await dataRequest(`media_assets?select=*&entity_type=eq.${encodeURIComponent(entityType)}&entity_id=eq.${encodeURIComponent(entityId)}&order=position.asc,created_at.desc`, { method: 'GET', headers: { Prefer: '' } }); return json(res, 200, { ok: true, mode: 'stored', items: rows || [] }); } if (req.method === 'POST') { const body = await readBody(req); const record = { entity_type: clean(body.entity_type), entity_id: clean(body.entity_id), asset_type: clean(body.asset_type) || 'image', url: clean(body.url), alt: clean(body.alt) || null, position: Number.isFinite(Number(body.position)) ? Number(body.position) : 1, payload: body.payload && typeof body.payload === 'object' ? body.payload : {} }; if (!record.entity_type || !record.entity_id) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' }); if (!record.url || !validUrl(record.url)) return json(res, 400, { ok: false, error: 'URL de mídia inválida.' }); if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, record }); const saved = await dataRequest('media_assets', { method: 'POST', body: JSON.stringify(record) }); return json(res, 201, { ok: true, mode: 'stored', stored: true, record: firstRecord(saved) }); } return json(res, 405, { ok: false, error: 'Método não permitido.' }); }
async function handleSelections(req, res) {
  requireDataConfig();
  if (req.method === 'GET') {
    await enforceRateLimit(req, 'selection-read', 120, 10 * 60 * 1000);
    const url = new URL(req.url, 'http://localhost');
    const token = limited(url.searchParams.get('token') || url.searchParams.get('id'), 128);
    if (!/^[A-Za-z0-9_-]{12,128}$/.test(token)) throw new HttpError(400, 'Token de seleção inválido.');
    const rows = await dataRequest(`saved_selections?public_token=eq.${encodeURIComponent(token)}&status=in.(open,sent,reviewed)&select=public_token,status,items,briefing,created_at,updated_at&limit=1`, { method: 'GET', headers: { Prefer: '' } });
    return json(res, 200, { ok: true, mode: 'stored', selection: publicSelection(firstRecord(rows)) });
  }

  if (req.method === 'POST') {
    await enforceRateLimit(req, 'selection-write', 40, 10 * 60 * 1000);
    const body = await readBody(req);
    const record = normalizeSelection(body);
    if (!record.items.length) throw new HttpError(400, 'Seleção sem obras.');
    if (record.email && !validEmail(record.email)) throw new HttpError(400, 'Informe um e-mail válido.');
    const { session, user } = await optionalUser(req);
    if (user) {
      record.user_id = user.id;
      record.name = record.name || user.full_name;
      record.email = record.email || user.email;
      record.status = 'open';
    } else {
      record.status = 'sent';
    }


    let saved = null;
    if (user) {
      const existing = firstRecord(await dataRequest(`saved_selections?user_id=eq.${encodeURIComponent(user.id)}&status=eq.open&select=id,public_token&order=updated_at.desc&limit=1`, { method: 'GET', headers: { Prefer: '' } }));
      if (existing?.id) {
        saved = firstRecord(await dataRequest(`saved_selections?id=eq.${encodeURIComponent(existing.id)}&user_id=eq.${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ ...record, updated_at: new Date().toISOString() })
        }));
      }
    }
    if (!saved) saved = firstRecord(await dataRequest('saved_selections', { method: 'POST', body: JSON.stringify(record) }));

    return json(res, 201, {
      ok: true,
      mode: 'stored',
      stored: true,
      selection: user ? accountSelection(saved) : publicSelection(saved)
    }, session.headers);
  }

  if (req.method === 'DELETE') {
    await enforceRateLimit(req, 'selection-delete', 20, 10 * 60 * 1000);
    const session = await requireUser(req);
    const rows = await dataRequest(`saved_selections?user_id=eq.${encodeURIComponent(session.user.id)}&status=eq.open`, {
      method: 'DELETE'
    });
    return json(res, 200, {
      ok: true,
      mode: 'stored',
      deleted: Array.isArray(rows) ? rows.length : 0
    }, session.headers);
  }

  return json(res, 405, { ok: false, error: 'Método não permitido.' });
}

async function handleAccount(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const session = await requireUser(req);
  requireDataConfig();

  const userId = encodeURIComponent(session.user.id);
  const [selectionRows, reservationRows] = await Promise.all([
    dataRequest(`saved_selections?user_id=eq.${userId}&select=id,public_token,status,items,briefing,created_at,updated_at&order=updated_at.desc&limit=20`, { method: 'GET', headers: { Prefer: '' } }),
    dataRequest(`reservations?user_id=eq.${userId}&select=id,artwork_id,status,deadline,notes,created_at,updated_at&order=created_at.desc&limit=20`, { method: 'GET', headers: { Prefer: '' } })
  ]);
  const selections = Array.isArray(selectionRows) ? selectionRows.map(accountSelection).filter(Boolean) : [];
  const reservations = Array.isArray(reservationRows) ? reservationRows.map(accountReservation).filter(Boolean) : [];
  return json(res, 200, {
    ok: true,
    mode: 'supabase',
    user: session.user,
    metrics: { selections: selections.length, reservations: reservations.length },
    selections,
    reservations
  }, session.headers);
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

function assertEditorialTransition(fromStatus, toStatus) {
  const transitions = {
    draft: ['documentation_pending','curatorial_review','archived'],
    documentation_pending: ['draft','curatorial_review','rejected','archived'],
    curatorial_review: ['documentation_pending','approved','rejected','archived'],
    approved: ['curatorial_review','published','archived'],
    published: ['approved','archived'],
    rejected: ['draft','documentation_pending','archived'],
    archived: ['draft']
  };
  if (!(transitions[fromStatus || 'draft'] || []).includes(toStatus)) {
    throw new HttpError(409, `Transição editorial inválida: ${fromStatus || 'draft'} → ${toStatus}.`, 'invalid_editorial_transition');
  }
}

async function handleCatalogReview(req, res) {
  const guard = adminGuard(req);
  if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error });
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const entityType = clean(url.searchParams.get('entityType'));
    const entityId = limited(url.searchParams.get('entityId'), 160);
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
  if (!entityId) throw new HttpError(400, 'Entidade editorial obrigatória.');
  if (!EDITORIAL_STATUSES.has(nextStatus)) throw new HttpError(400, 'Status editorial inválido.');
  const table = entityType === 'artist' ? 'artists' : 'artworks';
  const current = firstRecord(await dataRequest(`${table}?id=eq.${encodeURIComponent(entityId)}&select=id,editorial_status&limit=1`, { method: 'GET', headers: { Prefer: '' } }));
  if (!current) throw new HttpError(404, 'Registro editorial não encontrado.');
  assertEditorialTransition(current.editorial_status || 'draft', nextStatus);
  const checklist = editorialChecklist(body.checklist, entityType);
  if (['approved','published'].includes(nextStatus) && Object.values(checklist).some((value) => value !== true)) {
    throw new HttpError(409, 'Complete toda a documentação antes de aprovar ou publicar.', 'editorial_checklist_incomplete');
  }
  const reviewedAt = new Date().toISOString();
  const updated = firstRecord(await dataRequest(`${table}?id=eq.${encodeURIComponent(entityId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ editorial_status: nextStatus, editorial_checklist: checklist, reviewed_by: 'admin-token', reviewed_at: reviewedAt, updated_at: reviewedAt })
  }));
  await dataRequest('catalog_review_history', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ entity_type: entityType, entity_id: entityId, from_status: current.editorial_status || 'draft', to_status: nextStatus, checklist, note: limited(body.note, 1000) || null, actor_ref: 'admin-token' })
  });
  await writeAudit({ actorType: 'admin', actorRef: 'admin-token', action: 'catalog.review', entityType, entityId, metadata: { from: current.editorial_status || 'draft', to: nextStatus } });
  return json(res, 200, { ok: true, record: updated, checklist });
}

async function handlePrivacy(req, res, action) {
  const session = await requireUser(req);
  requireDataConfig();
  const userId = encodeURIComponent(session.user.id);
  if (action === 'export') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'privacy-export', 5, 60 * 60 * 1000);
    const [profile, selections, reservations, leads, briefs, requests] = await Promise.all([
      dataRequest(`profiles?id=eq.${userId}&select=id,email,full_name,phone,profile_type,created_at,updated_at&limit=1`, { method: 'GET', headers: { Prefer: '' } }),
      dataRequest(`saved_selections?user_id=eq.${userId}&select=id,status,items,briefing,created_at,updated_at&limit=100`, { method: 'GET', headers: { Prefer: '' } }),
      dataRequest(`reservations?user_id=eq.${userId}&select=id,artwork_id,status,deadline,notes,created_at,updated_at&limit=100`, { method: 'GET', headers: { Prefer: '' } }),
      dataRequest(`leads?user_id=eq.${userId}&select=id,status,source,created_at,updated_at&limit=100`, { method: 'GET', headers: { Prefer: '' } }),
      dataRequest(`company_briefs?user_id=eq.${userId}&select=id,status,created_at,updated_at&limit=100`, { method: 'GET', headers: { Prefer: '' } }),
      dataRequest(`privacy_requests?user_id=eq.${userId}&select=id,request_type,status,due_at,completed_at,created_at&limit=100`, { method: 'GET', headers: { Prefer: '' } })
    ]);
    await writeAudit({ actorType: 'user', actorRef: session.user.id, action: 'privacy.export', entityType: 'user', entityId: session.user.id });
    return json(res, 200, { ok: true, exportedAt: new Date().toISOString(), user: session.user, profile: firstRecord(profile), selections, reservations, leads, companyBriefs: briefs, privacyRequests: requests }, { ...session.headers, 'Content-Disposition': 'attachment; filename="arandu-dados.json"' });
  }
  if (action === 'request') {
    if (req.method === 'GET') {
      const requests = await dataRequest(`privacy_requests?user_id=eq.${userId}&select=id,request_type,status,due_at,completed_at,created_at&order=created_at.desc&limit=50`, { method: 'GET', headers: { Prefer: '' } });
      return json(res, 200, { ok: true, requests }, session.headers);
    }
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'privacy-request', 5, 24 * 60 * 60 * 1000);
    const body = await readBody(req);
    const requestType = clean(body.requestType || body.request_type);
    if (!PRIVACY_REQUEST_TYPES.has(requestType)) throw new HttpError(400, 'Tipo de solicitação LGPD inválido.');
    const record = firstRecord(await dataRequest('privacy_requests', { method: 'POST', body: JSON.stringify({ user_id: session.user.id, request_type: requestType, details: { message: limited(body.message, 1000) || null } }) }));
    await writeAudit({ actorType: 'user', actorRef: session.user.id, action: `privacy.${requestType}.requested`, entityType: 'privacy_request', entityId: record?.id || null });
    return json(res, 201, { ok: true, request: record ? { id: record.id, requestType: record.request_type, status: record.status, dueAt: record.due_at, createdAt: record.created_at } : null }, session.headers);
  }
  return json(res, 404, { ok: false, error: 'Rota de privacidade não encontrada.' });
}

function conversionPayload(value) {
  const source = safeObject(value);
  const result = {};
  ['artworkId','collectionId','source','target'].forEach((key) => { if (source[key] !== undefined) result[key] = limited(source[key], 160); });
  ['resultCount','queryLength'].forEach((key) => { const number = Number(source[key]); if (Number.isFinite(number)) result[key] = Math.max(0, Math.min(10000, Math.round(number))); });
  return result;
}

async function handleConversionEvents(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  await enforceRateLimit(req, 'conversion-events', 180, 10 * 60 * 1000);
  const body = await readBody(req);
  const eventType = clean(body.eventType || body.event_type);
  const anonymousId = clean(body.anonymousId || body.anonymous_id);
  const consentVersion = clean(body.consentVersion || body.consent_version);
  if (!CONVERSION_EVENT_TYPES.has(eventType)) throw new HttpError(400, 'Evento de conversão inválido.');
  if (!validPilotSessionId(anonymousId)) throw new HttpError(400, 'Identificador anônimo inválido.');
  if (consentVersion !== CONSENT_VERSION) throw new HttpError(403, 'Consentimento de métricas ausente ou desatualizado.', 'analytics_consent_required');
  const { user } = await optionalUser(req);
  requireDataConfig();
  await dataRequest('conversion_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ anonymous_id: anonymousId, user_id: user?.id || null, event_type: eventType, path: limited(body.path, 240) || '/', payload: conversionPayload(body.payload), consent_version: CONSENT_VERSION }) });
  return json(res, 201, { ok: true, stored: true });
}

async function handleDashboard(req, res) {
  const guard = adminGuard(req);
  if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error });
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const metrics = { artworks: 0, artists: 0, leads: 0, certificates: 0, reservations: 0, proposals: 0, submissions: 0, briefs: 0, tasks: 0 };
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', metrics, pipeline: [] });
  const resources = { artworks: 'artworks?select=id', artists: 'artists?select=id', leads: 'leads?select=id', certificates: 'certificates?select=id', reservations: 'reservations?select=id', proposals: 'proposals?select=id', submissions: 'artist_submissions?select=id', briefs: 'company_briefs?select=id', tasks: 'tasks?select=id' };
  const entries = await Promise.all(Object.entries(resources).map(async ([key, resource]) => {
    const rows = await dataRequest(resource, { method: 'GET', headers: { Prefer: '' } });
    return [key, Array.isArray(rows) ? rows.length : 0];
  }));
  let pipeline = [];
  try { pipeline = await dataRequest('v_sales_pipeline?select=*&order=created_at.desc&limit=8', { method: 'GET', headers: { Prefer: '' } }); } catch {}
  return json(res, 200, { ok: true, mode: 'supabase', metrics: Object.fromEntries(entries), pipeline: Array.isArray(pipeline) ? pipeline : [] });
}

async function handleAuth(req, res, action) {
  if (action === 'session') {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const session = await resolveSession(req);
    return json(res, 200, {
      ok: true,
      authenticated: session.authenticated,
      mode: session.mode,
      user: session.user
    }, session.headers);
  }

  if (action === 'logout') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const session = readSessionCookie(req);
    if (authConfigured() && session?.access_token) {
      try {
        await supabaseAuth('logout', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } });
      } catch {}
    }
    return json(res, 200, { ok: true, authenticated: false }, { 'Set-Cookie': clearSessionCookie() });
  }

  if (action === 'login') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'auth-login', 12, 10 * 60 * 1000);
    if (!authConfigured()) throw new HttpError(503, 'Autenticação Supabase ainda não configurada.');
    const body = await readBody(req);
    const email = cleanEmail(body.email);
    const password = String(body.password || '');
    if (!validEmail(email) || !password) throw new HttpError(400, 'Email e senha são obrigatórios.');
    const result = await supabaseAuth('token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password }) });
    return json(res, 200, { ok: true, authenticated: true, user: publicUser(result.user) }, { 'Set-Cookie': sessionCookie(result) });
  }

  if (action === 'reset-password') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'auth-reset-password', 5, 60 * 60 * 1000);
    if (!authConfigured()) throw new HttpError(503, 'Autenticação Supabase ainda não configurada.');
    const body = await readBody(req);
    const email = cleanEmail(body.email);
    if (!validEmail(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    const redirectTo = publicSiteUrl() ? `${publicSiteUrl()}/login.html?recovery=1` : null;
    try {
      await supabaseAuth(`recover${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ''}`, { method: 'POST', body: JSON.stringify({ email }) });
    } catch (error) {
      console.error(JSON.stringify({ level: 'error', event: 'auth.password_recovery_failed', message: limited(error?.message, 180) }));
    }
    return json(res, 202, { ok: true, message: 'Se existir uma conta para este e-mail, enviaremos as instruções de recuperação.' });
  }

  if (action === 'signup') {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    await enforceRateLimit(req, 'auth-signup', 8, 60 * 60 * 1000);
    if (!authConfigured()) throw new HttpError(503, 'Autenticação Supabase ainda não configurada.');
    const body = await readBody(req);
    if (clean(body.website)) return json(res, 202, { ok: true, authenticated: false, needsEmailConfirmation: true });
    const email = cleanEmail(body.email);
    const password = String(body.password || '');
    const fullName = limited(body.fullName || body.full_name || body.name, 160);
    const profileType = 'comprador';
    if (!fullName) throw new HttpError(400, 'Nome completo é obrigatório.');
    if (!validEmail(email)) throw new HttpError(400, 'Informe um e-mail válido.');
    if (password.length < 8) throw new HttpError(400, 'A senha deve ter pelo menos 8 caracteres.');
    const result = await supabaseAuth('signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, data: { full_name: fullName, profile_type: profileType } })
    });
    const headers = result.access_token ? { 'Set-Cookie': sessionCookie(result) } : {};
    return json(res, 201, {
      ok: true,
      authenticated: Boolean(result.access_token),
      needsEmailConfirmation: !result.access_token,
      user: publicUser(result.user)
    }, headers);
  }

  return json(res, 404, { ok: false, error: 'Rota de autenticação não encontrada.' });
}

function routeFrom(req) {
  const pathname = new URL(req.url, 'http://localhost').pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
  return pathname || 'index';
}

export default async function handler(req, res) {
  const requestId = limited(req.headers?.['x-request-id'], 80) || randomUUID();
  res.setHeader('X-Request-ID', requestId);
  try {
    const route = routeFrom(req);
    if (route === 'forms') return await handleForms(req, res);
    if (route === 'reservations') return await handleReservations(req, res);
    if (route === 'proposals') { requireCommercialReady(); return await handleProposals(req, res); }
    if (route === 'certificates') return await handleCertificates(req, res);
    if (route === 'certificate-document') return await handleCertificateDocument(req, res);
    if (route === 'catalog') return await handleCatalog(req, res);
    if (route === 'artists') return await handleArtists(req, res);
    if (route === 'public-config') return await handlePublicConfig(req, res);
    if (route === 'events') return await handleEvents(req, res);
    if (route === 'conversion-events') return await handleConversionEvents(req, res);
    if (route.startsWith('pilot/')) return await handlePilot(req, res, route.split('/')[1]);
    if (route.startsWith('privacy/')) return await handlePrivacy(req, res, route.split('/')[1]);
    if (route === 'catalog-review') return await handleCatalogReview(req, res);
    if (route === 'admin') return await handleAdmin(req, res);
    if (route === 'admin-update') return await handleAdminUpdate(req, res);
    if (route === 'operational') return await handleOperational(req, res);
    if (route === 'media') return await handleMedia(req, res);
    if (route === 'selections') return await handleSelections(req, res);
    if (route === 'account') return await handleAccount(req, res);
    if (route === 'dashboard') return await handleDashboard(req, res);
    if (route.startsWith('auth/')) return await handleAuth(req, res, route.split('/')[1]);
    return json(res, 404, { ok: false, error: 'Rota de API não encontrada.', route });
  } catch (error) {
    const route = routeFrom(req);
    const fallbackStatus = route === 'auth/login' ? 401 : route === 'auth/signup' ? 400 : 500;
    const ownershipMigrationPending = /user_id/i.test(String(error?.message || '')) && /(column|schema cache|does not exist|não existe)/i.test(String(error?.message || ''));
    const status = ownershipMigrationPending ? 503 : Number(error?.status) || fallbackStatus;
    const message = ownershipMigrationPending
      ? 'Atualização do banco pendente. Aplique a migration do Sprint 1 antes de publicar esta versão.'
      : error instanceof HttpError || status < 500
        ? error.message || 'Não foi possível concluir a solicitação.'
        : 'Não foi possível concluir a solicitação agora.';
    if (status >= 500 && !(error instanceof HttpError && error.code === 'catalog_not_verified')) console.error(JSON.stringify({ level: 'error', service: 'arandu-api', requestId, route, status, code: error?.code || null, message: limited(error?.message, 220) || 'Erro desconhecido' }));
    if (route === 'certificate-document') return html(res, status, `<h1>Erro ao gerar certificado</h1><p>${escapeHtml(message)}</p>`);
    return json(res, status, { ok: false, error: message, requestId, ...(error?.code ? { code: error.code } : {}) });
  }
}

import { dataRequest, hasDataConfig, json, readBody } from './_arandu.js';

const ADMIN_TOKEN = process.env.ARANDU_ADMIN_TOKEN;

const TABLES = {
  obras: 'artworks',
  artistas: 'artists',
  certificados: 'certificates',
  leads: 'leads',
  submissions: 'artist_submissions',
  briefs: 'company_briefs',
  proposals: 'proposals',
  reservations: 'reservations',
  tasks: 'tasks'
};

const ALLOWED = {
  obras: ['title','artist_id','language','type','technique','support','year','dimensions','price','price_label','status','edition','edition_size','certificate','thumb','main_image_url','detail_image_url','room_image_url','recommended_for','tags','moods','spaces','search','summary','curatorial_reading','first_artwork','logistics','published'],
  artistas: ['name','legal_name','slug','city','state','region','languages','curatorial_axes','profile','trajectory','statement','portfolio_url','instagram','status','artist_level','image_url','studio_image_url'],
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
const BOOLEANS = new Set(['certificate','published','first_artwork']);
const JSONS = new Set(['logistics']);

function guard(req) {
  const token = String(req.headers['x-arandu-admin-token'] || '').trim();
  if (!ADMIN_TOKEN) return { ok: false, status: 503, error: 'ARANDU_ADMIN_TOKEN não configurado no servidor.' };
  if (token !== ADMIN_TOKEN) return { ok: false, status: 401, error: 'Acesso administrativo não autorizado.' };
  return { ok: true };
}

function cleanList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function normalize(field, value) {
  if (value === undefined) return undefined;
  if (value === '') return null;
  if (ARRAYS.has(field)) return cleanList(value);
  if (NUMBERS.has(field)) {
    const parsed = Number(String(value).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (BOOLEANS.has(field)) return value === true || value === 'true' || value === '1' || value === 'on';
  if (JSONS.has(field)) {
    if (value && typeof value === 'object') return value;
    try { return value ? JSON.parse(value) : {}; } catch { return {}; }
  }
  return String(value).trim();
}

function buildPayload(panel, fields) {
  return (ALLOWED[panel] || []).reduce((payload, field) => {
    const value = normalize(field, fields[field]);
    if (value !== undefined) payload[field] = value;
    return payload;
  }, {});
}

export default async function handler(req, res) {
  try {
    const access = guard(req);
    if (!access.ok) return json(res, access.status, { ok: false, error: access.error });
    if (req.method !== 'PATCH') return json(res, 405, { ok: false, error: 'Método não permitido.' });

    const body = await readBody(req);
    const panel = String(body.panel || '').trim();
    const id = String(body.id || '').trim();
    const table = TABLES[panel];
    const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
    const payload = buildPayload(panel, fields);

    if (!table) return json(res, 400, { ok: false, error: 'Painel inválido.' });
    if (!id) return json(res, 400, { ok: false, error: 'ID obrigatório.' });
    if (!Object.keys(payload).length) return json(res, 400, { ok: false, error: 'Nenhum campo válido para atualizar.' });
    if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, panel, id, record: { id, ...payload } });

    const rows = await dataRequest(`${table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
    const record = Array.isArray(rows) ? rows[0] || null : rows;
    if (!record) return json(res, 404, { ok: false, error: 'Registro não encontrado.' });
    return json(res, 200, { ok: true, mode: 'stored', stored: true, panel, record });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

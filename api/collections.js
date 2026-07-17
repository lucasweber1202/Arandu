const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const COLLECTION_SELECT = [
  'id','slug','title','summary','curatorial_axis','audience','position','hero_image_url',
  'created_at','updated_at','artwork_count','starting_price','last_artwork_at'
].join(',');
const COLLECTION_ITEM_SELECT = [
  'collection_id','collection_slug','collection_title','position','collection_note',
  'id','slug','title','artist_id','artist_name','artist_city','artist_region','artist_languages',
  'language','type','technique','support','year','dimensions','price','price_label','status',
  'edition','edition_size','certificate','thumb','main_image_url','detail_image_url','room_image_url',
  'recommended_for','tags','moods','spaces','search','summary','curatorial_reading','first_artwork',
  'logistics','created_at','updated_at'
].join(',');

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(payload));
}

function hasDataConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

function clean(value) {
  return String(value || '').trim();
}

function validCollectionKey(value) {
  return /^[a-z0-9][a-z0-9-]{0,79}$/i.test(value);
}

async function dataRequest(resource) {
  if (!hasDataConfig()) throw new HttpError(503, 'O banco de produção ainda não está configurado.', 'database_unconfigured');
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${resource}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: ''
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || `Supabase ${response.status}`);
  return data;
}

async function requireCatalogReadiness() {
  if (!hasDataConfig()) throw new HttpError(503, 'O banco de produção ainda não está configurado.', 'database_unconfigured');
  let rows;
  try {
    rows = await dataRequest('v_catalog_readiness?select=dataset_version,verified_ready&id=eq.production&limit=1');
  } catch {
    throw new HttpError(503, 'As migrations do catálogo e das coleções ainda não foram aplicadas.', 'collections_migration_pending');
  }
  const readiness = Array.isArray(rows) ? rows[0] : null;
  if (readiness?.verified_ready !== true) {
    throw new HttpError(503, 'As coleções serão exibidas depois da aprovação do catálogo real.', 'catalog_not_verified');
  }
  return readiness;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const readiness = await requireCatalogReadiness();
    const url = new URL(req.url, 'http://localhost');
    const id = clean(url.searchParams.get('id') || url.searchParams.get('slug'));
    if (id && !validCollectionKey(id)) {
      throw new HttpError(400, 'Identificador de coleção inválido.', 'invalid_collection_id');
    }

    if (id) {
      const collections = await dataRequest(`v_public_collections?or=(id.eq.${encodeURIComponent(id)},slug.eq.${encodeURIComponent(id)})&select=${COLLECTION_SELECT}&limit=1`);
      const collection = Array.isArray(collections) ? collections[0] || null : null;
      const key = collection?.id || id;
      const items = collection
        ? await dataRequest(`v_public_collection_items?collection_id=eq.${encodeURIComponent(key)}&select=${COLLECTION_ITEM_SELECT}`)
        : [];
      return json(res, 200, { ok: true, mode: 'supabase', verifiedReady: true, release: readiness.dataset_version, collections: collection ? [collection] : [], items: items || [] });
    }

    const collections = await dataRequest(`v_public_collections?select=${COLLECTION_SELECT}`);
    return json(res, 200, { ok: true, mode: 'supabase', verifiedReady: true, release: readiness.dataset_version, collections: collections || [], items: [] });
  } catch (error) {
    const status = Number(error?.status) || 503;
    if (!error?.code) console.error('[Arandu Collections]', error?.message || error);
    return json(res, status, {
      ok: false,
      error: error?.code ? error.message : 'Não foi possível carregar as coleções verificadas agora.',
      ...(error?.code ? { code: error.code } : {})
    });
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

const FALLBACK_COLLECTIONS = [
  { id: 'primeira', slug: 'primeira-colecao', title: 'Primeira coleção', summary: 'Obras para começar com segurança, repertório e faixa de entrada.', curatorial_axis: 'Primeira aquisição', audience: 'Comprador iniciante', artwork_count: 0, starting_price: null },
  { id: 'casa', slug: 'casa-e-apartamento', title: 'Casa e apartamento', summary: 'Peças para convivência, sala, corredor, biblioteca e quarto.', curatorial_axis: 'Ambiente doméstico', audience: 'Comprador final', artwork_count: 0, starting_price: null },
  { id: 'empresa', slug: 'empresas-e-espacos', title: 'Empresas e espaços', summary: 'Obras para recepção, escritórios, clínicas, hotéis e restaurantes.', curatorial_axis: 'Arte para espaços', audience: 'Arquitetos e empresas', artwork_count: 0, starting_price: null },
  { id: 'brasil', slug: 'brasil-em-obra', title: 'Brasil em obra', summary: 'Território, cidade, rio, sertão, corpo, memória e linguagem.', curatorial_axis: 'Território e memória', audience: 'Colecionador em formação', artwork_count: 0, starting_price: null }
];

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function hasDataConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function clean(value) {
  return String(value || '').trim();
}

async function dataRequest(resource) {
  if (!hasDataConfig()) throw new Error('Banco não configurado.');
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${resource}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: ''
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.error || `Supabase ${response.status}`);
  return data;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const url = new URL(req.url, 'http://localhost');
  const id = clean(url.searchParams.get('id') || url.searchParams.get('slug'));

  if (!hasDataConfig()) {
    const collection = id ? FALLBACK_COLLECTIONS.find((item) => item.id === id || item.slug === id) : null;
    return json(res, 202, { ok: true, mode: 'demo', installed: false, collections: id ? (collection ? [collection] : []) : FALLBACK_COLLECTIONS, items: [] });
  }

  try {
    if (id) {
      const collections = await dataRequest(`v_public_collections?or=(id.eq.${encodeURIComponent(id)},slug.eq.${encodeURIComponent(id)})&select=*&limit=1`);
      const collection = Array.isArray(collections) ? collections[0] || null : null;
      const key = collection?.id || id;
      const items = await dataRequest(`v_public_collection_items?collection_id=eq.${encodeURIComponent(key)}&select=*`);
      return json(res, 200, { ok: true, mode: 'supabase', installed: true, collections: collection ? [collection] : [], items: items || [] });
    }
    const collections = await dataRequest('v_public_collections?select=*');
    return json(res, 200, { ok: true, mode: 'supabase', installed: true, collections: collections || [], items: [] });
  } catch (error) {
    const collection = id ? FALLBACK_COLLECTIONS.find((item) => item.id === id || item.slug === id) : null;
    return json(res, 200, { ok: true, mode: 'fallback', installed: false, collections: id ? (collection ? [collection] : []) : FALLBACK_COLLECTIONS, items: [], error: error.message });
  }
}

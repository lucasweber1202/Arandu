import { hasSupabaseConfig, supabaseRequest } from './_supabase.js';
import { sendJson } from './_normalize.js';

function fallbackResults(query) {
  const q = String(query || '').toLowerCase();
  const items = [
    { type: 'obra', title: 'Estudo de Solo Nº 04', url: '/obra-estudo-de-solo-04.html', text: 'Pintura · matéria · memória' },
    { type: 'obra', title: 'Sertão Silencioso', url: '/obra-sertao-silencioso.html', text: 'Fotografia · primeira obra · silêncio' },
    { type: 'obra', title: 'Equilíbrio Suspenso', url: '/obra-equilibrio-suspenso.html', text: 'Escultura · matéria · tensão' },
    { type: 'artista', title: 'Marina Silveira', url: '/artista-marina-silveira.html', text: 'Pintura · terra · pigmento' },
    { type: 'artista', title: 'Camila Rebouças', url: '/artista-camila-reboucas.html', text: 'Fotografia · território · memória' }
  ];
  return items.filter((item) => !q || `${item.title} ${item.text} ${item.type}`.toLowerCase().includes(q));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });

  const url = new URL(req.url, 'http://localhost');
  const query = url.searchParams.get('q') || '';
  const q = query.trim();

  try {
    if (!hasSupabaseConfig()) {
      return sendJson(res, 200, { ok: true, mode: 'demo', query: q, results: fallbackResults(q) });
    }

    const like = encodeURIComponent(`*${q}*`);
    const [artworks, artists, narratives] = await Promise.all([
      supabaseRequest(`artworks?select=slug,title,language,technique,status,context_tags,price_cents&published=eq.true&or=(title.ilike.${like},language.ilike.${like},technique.ilike.${like})&limit=12`, { method: 'GET', headers: { Prefer: '' } }),
      supabaseRequest(`artists?select=slug,name,city,state,languages,status&status=eq.published&or=(name.ilike.${like},city.ilike.${like},state.ilike.${like})&limit=12`, { method: 'GET', headers: { Prefer: '' } }),
      supabaseRequest(`narratives?select=slug,title,category,excerpt,status&status=eq.published&or=(title.ilike.${like},category.ilike.${like},excerpt.ilike.${like})&limit=12`, { method: 'GET', headers: { Prefer: '' } })
    ]);

    const results = [
      ...(artworks || []).map((item) => ({ type: 'obra', title: item.title, url: `/obra-${item.slug}.html`, text: `${item.language || ''} · ${item.status || ''}` })),
      ...(artists || []).map((item) => ({ type: 'artista', title: item.name, url: `/artista-${item.slug}.html`, text: `${item.city || ''} ${item.state || ''} · ${(item.languages || []).join(', ')}` })),
      ...(narratives || []).map((item) => ({ type: 'narrativa', title: item.title, url: `/narrativas.html`, text: item.excerpt || item.category || '' }))
    ];

    return sendJson(res, 200, { ok: true, mode: 'supabase', query: q, results });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro na busca.' });
  }
}

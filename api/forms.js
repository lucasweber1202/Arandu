import { envReady, json, readBody, supabaseRest } from './_supabase.js';

function normalizeType(type) {
  if (type === 'empresa-intencao') return 'briefing_empresa';
  if (type === 'submissao-artista') return 'submissao_artista';
  if (type === 'selecao') return 'selecao_curatorial';
  return type || 'contato';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const payload = await readBody(req);
  const type = normalizeType(payload.form_type || payload.type);
  const record = {
    source: 'site',
    type,
    status: 'new',
    name: payload.data?.nome || payload.data?.nome_artistico || null,
    email: payload.data?.email || null,
    whatsapp: payload.data?.whatsapp || null,
    company: payload.data?.empresa || null,
    environment: payload.data?.tipo_projeto || payload.data?.ambiente || null,
    budget: payload.data?.orcamento || null,
    payload,
    created_at: new Date().toISOString()
  };

  if (!envReady()) return json(res, 200, { ok: true, stored: false, mode: 'demo', lead: record });

  try {
    const data = await supabaseRest('crm_leads', { method: 'POST', body: JSON.stringify(record) });
    return json(res, 200, { ok: true, stored: true, lead: data?.[0] || record });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
}

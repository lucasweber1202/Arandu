import { envReady, json, readBody, supabaseRest } from './_supabase.js';

function normalizeType(type) {
  if (type === 'empresa-intencao') return 'briefing_empresa';
  if (type === 'submissao-artista') return 'submissao_artista';
  if (type === 'selecao') return 'selecao_curatorial';
  return type || 'contato';
}

function targetTable(type) {
  if (type === 'briefing_empresa') return 'company_briefs';
  if (type === 'submissao_artista') return 'artist_submissions';
  return 'leads';
}

function buildRecord(type, payload) {
  const data = payload.data || {};
  if (type === 'briefing_empresa') {
    return {
      name: data.nome || null,
      company: data.empresa || null,
      email: data.email || null,
      whatsapp: data.whatsapp || null,
      project_type: data.tipo_projeto || data.perfil || null,
      city: data.cidade || null,
      environment: data.ambiente || data.tipo_projeto || null,
      budget: data.orcamento || null,
      deadline: data.prazo || null,
      message: data.mensagem || null,
      status: 'received',
      payload
    };
  }
  if (type === 'submissao_artista') {
    return {
      name: data.nome_completo || data.nome_artistico || null,
      artist_name: data.nome_artistico || null,
      city: data.cidade || null,
      portfolio_url: data.portfolio || null,
      instagram: data.instagram || null,
      email: data.email || null,
      whatsapp: data.whatsapp || null,
      languages: data.linguagens || null,
      price_range: data.faixa_preco || null,
      message: data.mensagem || null,
      status: 'received',
      payload
    };
  }
  return {
    type,
    name: data.nome || data.nome_artistico || null,
    email: data.email || null,
    whatsapp: data.whatsapp || null,
    company: data.empresa || null,
    message: data.mensagem || null,
    source_page: payload.page || payload.url || null,
    status: 'new',
    payload
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
  const payload = await readBody(req);
  const type = normalizeType(payload.form_type || payload.type);
  const table = targetTable(type);
  const record = buildRecord(type, payload);

  if (!envReady()) return json(res, 200, { ok: true, stored: false, mode: 'demo', table, lead: record });

  try {
    const data = await supabaseRest(table, { method: 'POST', body: JSON.stringify(record) });
    return json(res, 200, { ok: true, stored: true, table, lead: data?.[0] || record });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
}

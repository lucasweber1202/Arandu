import { dataRequest, firstRecord, hasDataConfig, json, readBody } from './_arandu.js';

function normalizePayload(body) {
  const type = body.type || body.form_type || 'contato';
  const data = body.data || body;
  let table = 'leads';
  let record = {
    type,
    name: data.nome || data.name || data.nome_completo || null,
    email: data.email || null,
    whatsapp: data.whatsapp || data.telefone || data.phone || null,
    company: data.empresa || data.company || null,
    message: data.mensagem || data.message || null,
    source_page: body.page || body.source_page || null,
    status: 'new',
    payload: body
  };

  if (type === 'submissao-artista') {
    table = 'artist_submissions';
    record = {
      name: data.nome_completo || data.nome || null,
      artist_name: data.nome_artistico || data.artist_name || data.nome || null,
      city: data.cidade || null,
      state: data.estado || data.uf || null,
      portfolio_url: data.portfolio || data.portfolio_url || null,
      instagram: data.instagram || null,
      email: data.email || null,
      whatsapp: data.whatsapp || data.telefone || null,
      languages: data.linguagens || data.languages || null,
      price_range: data.faixa_preco || data.orcamento || null,
      message: data.mensagem || null,
      status: 'received',
      payload: body
    };
  }

  if (type === 'empresa-intencao' || type === 'proposta-empresa') {
    table = 'company_briefs';
    record = {
      ...record,
      project_type: data.tipo_projeto || data.espaco || null,
      environment: data.ambiente || null,
      budget: data.orcamento || data.budget || null,
      deadline: data.prazo || null,
      status: 'received'
    };
  }

  if (type === 'newsletter') {
    table = 'newsletter_subscriptions';
    record = { email: data.email, name: data.nome || data.name || null, source_page: body.page || null, payload: body };
  }

  return { table, record };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const body = await readBody(req);
    const { table, record } = normalizePayload(body);
    if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, table, record });
    const saved = await dataRequest(table, { method: 'POST', body: JSON.stringify(record) });
    return json(res, 201, { ok: true, mode: 'stored', stored: true, table, record: firstRecord(saved) });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

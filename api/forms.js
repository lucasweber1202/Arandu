import { hasSupabaseConfig, supabaseRequest } from './_supabase.js';
import { hasContact, normalizeContactPayload, pick, readJsonBody, sendJson } from './_normalize.js';

function normalizeArtistSubmission(body = {}) {
  const data = body.data || body;
  return {
    name: pick(data, ['nome_completo', 'name', 'nome']),
    artist_name: pick(data, ['nome_artistico', 'artist_name']) || pick(data, ['nome_completo', 'name', 'nome']),
    city: pick(data, ['cidade', 'city']),
    state: pick(data, ['estado', 'state', 'uf']),
    portfolio_url: pick(data, ['portfolio', 'portfolio_url', 'site']),
    instagram: pick(data, ['instagram']),
    email: pick(data, ['email']),
    whatsapp: pick(data, ['whatsapp', 'telefone', 'phone']),
    languages: pick(data, ['linguagens', 'languages']),
    price_range: pick(data, ['faixa_preco', 'price_range', 'orcamento']),
    message: pick(data, ['mensagem', 'message']),
    payload: body
  };
}

function normalizeCompanyBrief(body = {}) {
  const data = body.data || body;
  return {
    name: pick(data, ['nome', 'name', 'nome_completo']),
    company: pick(data, ['empresa', 'company']),
    email: pick(data, ['email']),
    whatsapp: pick(data, ['whatsapp', 'telefone', 'phone']),
    project_type: pick(data, ['project_type', 'tipo_projeto', 'espaco']),
    city: pick(data, ['cidade', 'city']),
    state: pick(data, ['estado', 'state', 'uf']),
    environment: pick(data, ['ambiente', 'environment', 'espaco']),
    budget: pick(data, ['budget', 'orcamento', 'faixa_preco']),
    deadline: pick(data, ['prazo', 'deadline']),
    wall_dimensions: pick(data, ['wall_dimensions', 'dimensoes', 'parede']),
    references_url: pick(data, ['references_url', 'referencias', 'portfolio']),
    message: pick(data, ['mensagem', 'message']),
    payload: body
  };
}

function normalizeNewsletter(body = {}) {
  const data = body.data || body;
  return {
    email: pick(data, ['email']),
    name: pick(data, ['nome', 'name']),
    source_page: body.page || body.source_page || null,
    consent_marketing: true,
    payload: body
  };
}

function formTarget(type) {
  if (type === 'submissao-artista') return 'artist_submissions';
  if (type === 'empresa-intencao' || type === 'proposta-empresa') return 'company_briefs';
  if (type === 'newsletter') return 'newsletter_subscriptions';
  return 'leads';
}

function normalizeByType(type, body) {
  if (type === 'submissao-artista') return normalizeArtistSubmission(body);
  if (type === 'empresa-intencao' || type === 'proposta-empresa') return normalizeCompanyBrief(body);
  if (type === 'newsletter') return normalizeNewsletter(body);
  return { type, ...normalizeContactPayload(body), status: 'new' };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      route: '/api/forms',
      supabaseConfigured: hasSupabaseConfig(),
      supportedTypes: ['contato', 'selecao', 'submissao-artista', 'empresa-intencao', 'proposta-empresa', 'newsletter']
    });
  }

  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });

  try {
    const body = await readJsonBody(req);
    const type = body.type || body.form_type || 'contato';
    const table = formTarget(type);
    const normalized = normalizeByType(type, body);

    if (table === 'artist_submissions' && !normalized.portfolio_url) {
      return sendJson(res, 400, { ok: false, error: 'Portfólio é obrigatório para submissão de artista.' });
    }
    if (table === 'newsletter_subscriptions' && !normalized.email) {
      return sendJson(res, 400, { ok: false, error: 'Email é obrigatório para newsletter.' });
    }
    if (table === 'leads' && !hasContact(normalized)) {
      return sendJson(res, 400, { ok: false, error: 'Informe nome, email ou WhatsApp.' });
    }

    if (!hasSupabaseConfig()) {
      return sendJson(res, 202, { ok: true, stored: false, mode: 'demo', table, record: normalized });
    }

    const data = await supabaseRequest(table, {
      method: 'POST',
      body: JSON.stringify(normalized)
    });
    const record = Array.isArray(data) ? data[0] : data;

    try {
      await supabaseRequest('form_submissions', {
        method: 'POST',
        body: JSON.stringify({ form_type: type, normalized_table: table, normalized_id: record?.id || null, source_page: body.page || body.source_page || null, payload: body })
      });
    } catch {
      // Registro secundário não deve bloquear o envio principal.
    }

    return sendJson(res, 201, { ok: true, stored: true, mode: 'supabase', table, record });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro inesperado no envio do formulário.' });
  }
}

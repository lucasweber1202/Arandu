import { hasSupabaseConfig, supabaseRequest } from './_supabase.js';

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function normalizeLead(body = {}) {
  const data = body.data || {};
  return {
    type: body.type || data.motivo || 'contato',
    name: data.nome || data.nome_completo || data.nome_artistico || body.name || null,
    email: data.email || body.email || null,
    whatsapp: data.whatsapp || data.telefone || body.whatsapp || null,
    message: data.mensagem || body.message || null,
    source_page: body.page || body.source_page || null,
    payload: body
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return send(res, 200, {
      ok: true,
      route: '/api/leads',
      supabaseConfigured: hasSupabaseConfig(),
      message: 'Use POST to register a lead.'
    });
  }

  if (req.method !== 'POST') {
    return send(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  try {
    const body = await readBody(req);
    const lead = normalizeLead(body);

    if (!lead.name && !lead.email && !lead.whatsapp) {
      return send(res, 400, { ok: false, error: 'Lead must include at least name, email or WhatsApp.' });
    }

    if (!hasSupabaseConfig()) {
      return send(res, 202, {
        ok: true,
        stored: false,
        mode: 'demo',
        message: 'Lead received by API, but Supabase is not configured yet.',
        lead
      });
    }

    const data = await supabaseRequest('leads', {
      method: 'POST',
      body: JSON.stringify(lead)
    });

    return send(res, 201, {
      ok: true,
      stored: true,
      mode: 'supabase',
      lead: Array.isArray(data) ? data[0] : data
    });
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message || 'Unexpected error.' });
  }
}

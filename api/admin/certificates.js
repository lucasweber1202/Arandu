import { hasSupabaseConfig, supabaseRequest } from '../_supabase.js';
import { readJsonBody, sendJson } from '../_normalize.js';
import { requireAdmin } from '../_admin.js';

function normalizeCertificate(body = {}) {
  return {
    code: body.code || body.codigo || `ARD-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    artwork_id: body.artwork_id || null,
    owner_id: body.owner_id || null,
    issued_to: body.issued_to || body.emitido_para || null,
    issued_at: body.issued_at || new Date().toISOString(),
    verification_status: body.verification_status || body.status || 'valid',
    criteria: body.criteria || body.criterios || {},
    payload: body
  };
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (!hasSupabaseConfig()) {
    return sendJson(res, 202, { ok: true, mode: 'demo', message: 'Supabase não configurado. Rota de certificados pronta.' });
  }

  try {
    if (req.method === 'GET') {
      const data = await supabaseRequest('certificates?select=*,artworks(title,slug)&order=created_at.desc', { method: 'GET', headers: { Prefer: '' } });
      return sendJson(res, 200, { ok: true, certificates: data || [] });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const certificate = normalizeCertificate(body);
      const data = await supabaseRequest('certificates', { method: 'POST', body: JSON.stringify(certificate) });
      return sendJson(res, 201, { ok: true, certificate: Array.isArray(data) ? data[0] : data });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!body.id) return sendJson(res, 400, { ok: false, error: 'ID é obrigatório para atualizar.' });
      const certificate = normalizeCertificate(body);
      const data = await supabaseRequest(`certificates?id=eq.${encodeURIComponent(body.id)}`, { method: 'PATCH', body: JSON.stringify(certificate) });
      return sendJson(res, 200, { ok: true, certificate: Array.isArray(data) ? data[0] : data });
    }

    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro em certificados.' });
  }
}

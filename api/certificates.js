import { hasSupabaseConfig, supabaseRequest } from './_supabase.js';

function send(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function demoCertificate(code) {
  if (code !== 'ARD-2026-0001') return null;
  return {
    code: 'ARD-2026-0001',
    verification_status: 'valid',
    issued_to: 'Colecionador demonstrativo',
    artwork: {
      title: 'Estudo de Solo Nº 04',
      artist: 'Marina Silveira',
      technique: 'Óleo sobre tela',
      dimensions: '120 x 100 cm',
      year: 2026
    }
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return send(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  const rawCode = req.query?.code || '';
  const code = String(rawCode).trim().toUpperCase();

  if (!code) {
    return send(res, 400, { ok: false, error: 'Certificate code is required.' });
  }

  try {
    if (!hasSupabaseConfig()) {
      const certificate = demoCertificate(code);
      return send(res, certificate ? 200 : 404, {
        ok: Boolean(certificate),
        mode: 'demo',
        found: Boolean(certificate),
        certificate
      });
    }

    const data = await supabaseRequest(`certificates?code=eq.${encodeURIComponent(code)}&select=*`, {
      method: 'GET',
      headers: { Prefer: '' }
    });

    const certificate = Array.isArray(data) ? data[0] : null;
    return send(res, certificate ? 200 : 404, {
      ok: Boolean(certificate),
      mode: 'supabase',
      found: Boolean(certificate),
      certificate
    });
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message || 'Unexpected error.' });
  }
}

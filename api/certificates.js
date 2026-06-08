import { envReady, json, supabaseRest } from './_supabase.js';

const DEMO_CERTIFICATES = {
  'ARD-2026-0001': {
    code: 'ARD-2026-0001',
    verification_status: 'valid',
    issued_at: '2026-06-08T12:00:00.000Z',
    issued_to: 'Comprador demonstrativo',
    payload: {
      title: 'Estudo de Solo Nº 04',
      artist: 'Marina Silveira',
      technique: 'Óleo sobre tela',
      dimensions: '120 x 100 cm',
      edition: 'Obra única',
      year: '2026'
    }
  },
  'ARD-2026-0002': {
    code: 'ARD-2026-0002',
    verification_status: 'valid',
    issued_at: '2026-06-08T12:00:00.000Z',
    issued_to: 'Empresa demonstrativa',
    payload: {
      title: 'Sertão Silencioso',
      artist: 'Camila Rebouças',
      technique: 'Fotografia fine art',
      dimensions: '60 x 90 cm',
      edition: 'Edição limitada',
      year: '2026'
    }
  }
};

export default async function handler(req, res) {
  const code = String(req.query?.code || '').trim().toUpperCase();
  if (!code) return json(res, 400, { ok: false, error: 'Informe o código do certificado.' });

  if (!envReady()) {
    const certificate = DEMO_CERTIFICATES[code] || null;
    return json(res, certificate ? 200 : 404, { ok: Boolean(certificate), mode: 'demo', certificate });
  }

  try {
    const data = await supabaseRest(`certificates?code=eq.${encodeURIComponent(code)}&select=*`);
    const certificate = data?.[0] || null;
    return json(res, certificate ? 200 : 404, { ok: Boolean(certificate), certificate });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
}

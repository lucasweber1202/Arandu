import { envReady, json, readBody, requireAdmin, supabaseRest } from '../_supabase.js';

const demoCertificates = [
  { id: 'cert-1', code: 'ARD-2026-0001', artworks: { title: 'Estudo de Solo Nº 04' }, issued_to: 'Comprador demonstrativo', verification_status: 'valid', issued_at: '2026-06-08T12:00:00.000Z' },
  { id: 'cert-2', code: 'ARD-2026-0002', artworks: { title: 'Sertão Silencioso' }, issued_to: 'Empresa demonstrativa', verification_status: 'valid', issued_at: '2026-06-08T12:00:00.000Z' }
];

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  if (!envReady()) return json(res, 200, { ok: true, mode: 'demo', certificates: demoCertificates });
  try {
    if (req.method === 'GET') {
      const certificates = await supabaseRest('certificates?select=*,artworks(title)&order=issued_at.desc');
      return json(res, 200, { ok: true, certificates });
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const { id, ...changes } = body;
      const updated = await supabaseRest(`certificates?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
      return json(res, 200, { ok: true, certificate: updated?.[0] });
    }
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
}

import { dataRequest, hasDataConfig, json } from './_arandu.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const url = new URL(req.url, 'http://localhost');
    const code = String(url.searchParams.get('code') || url.searchParams.get('id') || '').trim().toUpperCase();
    if (!code) return json(res, 400, { ok: false, error: 'Código obrigatório.' });
    if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', certificate: null });
    const rows = await dataRequest(`certificates?code=eq.${encodeURIComponent(code)}&select=*&limit=1`, { method: 'GET', headers: { Prefer: '' } });
    return json(res, 200, { ok: true, mode: 'stored', certificate: Array.isArray(rows) ? rows[0] || null : null });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

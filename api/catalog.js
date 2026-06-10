import { dataRequest, hasDataConfig, json } from './_arandu.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', items: [] });
    const rows = await dataRequest('v_public_catalog?select=*&order=created_at.desc', { method: 'GET', headers: { Prefer: '' } });
    return json(res, 200, { ok: true, mode: 'stored', items: rows || [] });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

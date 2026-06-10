import { dataRequest, firstRecord, hasDataConfig, json, readBody } from './_arandu.js';

function normalizeReservation(body) {
  return {
    artwork_id: body.artwork_id || body.artworkId || body.id || null,
    name: body.name || null,
    whatsapp: body.whatsapp || null,
    deadline: body.deadline || null,
    notes: body.notes || null,
    status: 'requested',
    payload: body
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const body = await readBody(req);
    const record = normalizeReservation(body);
    if (!record.artwork_id) return json(res, 400, { ok: false, error: 'Obra é obrigatória.' });
    if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, record });
    const saved = await dataRequest('reservations', { method: 'POST', body: JSON.stringify(record) });
    return json(res, 201, { ok: true, mode: 'stored', stored: true, record: firstRecord(saved) });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

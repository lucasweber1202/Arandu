import { dataRequest, firstRecord, hasDataConfig, json, readBody } from './_arandu.js';

function normalizeProposal(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  const total = Number(body.total || 0) || null;
  return {
    proposal: {
      client: body.client || null,
      space: body.space || null,
      goal: body.goal || null,
      budget: body.budget || null,
      deadline: body.deadline || null,
      notes: body.notes || null,
      total,
      status: 'draft',
      payload: body
    },
    items
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' });
    const body = await readBody(req);
    const { proposal, items } = normalizeProposal(body);
    if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, proposal, items });
    const saved = await dataRequest('proposals', { method: 'POST', body: JSON.stringify(proposal) });
    const savedProposal = firstRecord(saved);
    if (savedProposal?.id && items.length) {
      const rows = items.map((item, index) => ({
        proposal_id: savedProposal.id,
        artwork_id: item.id || item.artwork_id || null,
        position: index + 1,
        price: Number(item.price || 0) || null,
        note: item.note || item.context || null
      })).filter((row) => row.artwork_id);
      if (rows.length) await dataRequest('proposal_items', { method: 'POST', body: JSON.stringify(rows) });
    }
    return json(res, 201, { ok: true, mode: 'stored', stored: true, proposal: savedProposal });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

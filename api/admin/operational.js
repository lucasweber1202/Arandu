import { envReady, json, readBody, requireAdmin, supabaseRest } from '../_supabase.js';

const demo = {
  proposals: [
    { id: 'prop-1', title: 'Proposta para Clínica Horizonte', client_name: 'Marina', client_company: 'Clínica Horizonte', total_cents: 1530000, status: 'draft' },
    { id: 'prop-2', title: 'Seleção para Hotel Atlântico', client_name: 'Rafael', client_company: 'Hotel Atlântico', total_cents: 4100000, status: 'sent' }
  ],
  reservations: [
    { id: 'res-1', client_name: 'Clínica Horizonte', client_whatsapp: '+55 21 90000-0000', artwork_id: 'sertao-silencioso', reserved_until: '2026-06-15T12:00:00.000Z', status: 'active' }
  ],
  tasks: [
    { id: 'task-1', title: 'Enviar proposta revisada para clínica', entity_type: 'proposal', owner_name: 'Curadoria', due_at: '2026-06-12T12:00:00.000Z', status: 'open' }
  ]
};

function tableForResource(resource) {
  if (resource === 'proposals') return 'proposals';
  if (resource === 'reservations') return 'reservations';
  if (resource === 'tasks') return 'operational_tasks';
  return 'proposals';
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const resource = req.query?.resource || 'proposals';
  if (!envReady()) return json(res, 200, { ok: true, mode: 'demo', items: demo[resource] || [] });
  try {
    const table = tableForResource(resource);
    if (req.method === 'GET') {
      const items = await supabaseRest(`${table}?select=*&order=created_at.desc`);
      return json(res, 200, { ok: true, items });
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const { id, ...changes } = body;
      const updated = await supabaseRest(`${table}?id=eq.${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(changes) });
      return json(res, 200, { ok: true, item: updated?.[0] });
    }
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message });
  }
}

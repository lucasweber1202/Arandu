import { envReady, json, readBody, requireAdmin, supabaseRest } from '../_supabase.js';

const demoLeads = [
  { id: 'lead-1', name: 'Clínica Horizonte', type: 'briefing_empresa', email: 'contato@clinica.com', whatsapp: '+55 21 90000-0000', company: 'Clínica Horizonte', environment: 'Clínica / consultório', budget: 'R$ 15.000', status: 'new' },
  { id: 'lead-2', name: 'Hotel Atlântico', type: 'briefing_empresa', email: 'projetos@hotel.com', whatsapp: '+55 21 90000-0001', company: 'Hotel Atlântico', environment: 'Hotel / pousada', budget: 'R$ 40.000', status: 'proposal_sent' }
];

const demoSubmissions = [
  { id: 'sub-1', artist_name: 'Joana Terra', city: 'Salvador', languages: 'Pintura, matéria', portfolio_url: 'https://example.com', status: 'screening' }
];

const demoBriefs = [
  { id: 'brief-1', company: 'Clínica Horizonte', name: 'Marina', environment: 'Consultório', budget: 'R$ 15.000', status: 'reviewing' },
  { id: 'brief-2', company: 'Restaurante Nativo', name: 'Pedro', environment: 'Restaurante', budget: 'R$ 22.000', status: 'proposal_draft' }
];

function demoItems(type) {
  if (type === 'submissions') return demoSubmissions;
  if (type === 'briefs') return demoBriefs;
  return demoLeads;
}

function tableForType(type) {
  if (type === 'submissions') return 'artist_submissions';
  if (type === 'briefs') return 'company_briefs';
  return 'leads';
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const type = req.query?.type || 'leads';
  if (!envReady()) return json(res, 200, { ok: true, mode: 'demo', items: demoItems(type) });
  try {
    const table = tableForType(type);
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

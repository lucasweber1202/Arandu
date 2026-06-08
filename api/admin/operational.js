import { hasSupabaseConfig, supabaseRequest } from '../_supabase.js';
import { readJsonBody, sendJson, toCents } from '../_normalize.js';
import { requireAdmin } from '../_admin.js';

const RESOURCE_TABLE = {
  notes: 'crm_notes',
  tasks: 'tasks',
  proposals: 'proposals',
  proposal_items: 'proposal_items',
  reservations: 'reservations',
  events: 'artwork_events',
  media: 'media_assets'
};

function urlParts(req) {
  const url = new URL(req.url, 'http://localhost');
  const resource = url.searchParams.get('resource') || 'tasks';
  return { resource, table: RESOURCE_TABLE[resource] || 'tasks', url };
}

function normalizeRecord(resource, body = {}) {
  if (resource === 'notes') {
    return {
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      note: body.note || body.notes || body.observacao,
      author_name: body.author_name || body.autor || 'Curadoria Arandu'
    };
  }
  if (resource === 'tasks') {
    return {
      entity_type: body.entity_type || null,
      entity_id: body.entity_id || null,
      title: body.title || body.titulo,
      description: body.description || body.descricao || null,
      owner_name: body.owner_name || body.responsavel || null,
      due_at: body.due_at || body.prazo || null,
      status: body.status || 'open',
      priority: body.priority || body.prioridade || 'normal'
    };
  }
  if (resource === 'proposals') {
    return {
      lead_id: body.lead_id || null,
      company_brief_id: body.company_brief_id || null,
      saved_selection_id: body.saved_selection_id || null,
      title: body.title || body.titulo || 'Proposta curatorial Arandu',
      client_name: body.client_name || body.nome || null,
      client_email: body.client_email || body.email || null,
      client_company: body.client_company || body.empresa || null,
      status: body.status || 'draft',
      total_cents: body.total_cents || toCents(body.total || body.valor),
      currency: body.currency || 'BRL',
      valid_until: body.valid_until || body.validade || null,
      notes: body.notes || body.observacoes || null,
      payload: body
    };
  }
  if (resource === 'reservations') {
    return {
      artwork_id: body.artwork_id || null,
      lead_id: body.lead_id || null,
      client_name: body.client_name || body.nome || null,
      client_email: body.client_email || body.email || null,
      client_whatsapp: body.client_whatsapp || body.whatsapp || null,
      status: body.status || 'active',
      reserved_until: body.reserved_until || body.reservado_ate || null,
      notes: body.notes || body.observacoes || null
    };
  }
  if (resource === 'media') {
    return {
      entity_type: body.entity_type || 'site',
      entity_id: body.entity_id || null,
      file_name: body.file_name || body.nome_arquivo || null,
      file_url: body.file_url || body.url,
      mime_type: body.mime_type || null,
      alt: body.alt || null,
      usage: body.usage || body.uso || null,
      position: body.position ? Number(body.position) : 0
    };
  }
  if (resource === 'events') {
    return {
      artwork_id: body.artwork_id,
      event_type: body.event_type || body.tipo,
      payload: body.payload || body
    };
  }
  return body;
}

async function listRecords(table, url) {
  const params = new URLSearchParams('select=*');
  const entityType = url.searchParams.get('entity_type');
  const entityId = url.searchParams.get('entity_id');
  const status = url.searchParams.get('status');
  if (entityType) params.set('entity_type', `eq.${entityType}`);
  if (entityId) params.set('entity_id', `eq.${entityId}`);
  if (status) params.set('status', `eq.${status}`);
  return supabaseRequest(`${table}?${params.toString()}&order=created_at.desc`, { method: 'GET', headers: { Prefer: '' } });
}

export default async function handler(req, res) {
  if (!requireAdmin(req, res)) return;
  const { resource, table, url } = urlParts(req);

  if (!hasSupabaseConfig()) {
    return sendJson(res, 202, { ok: true, mode: 'demo', resource, table, items: [], message: 'Supabase não configurado. Rota operacional pronta.' });
  }

  try {
    if (req.method === 'GET') {
      const items = await listRecords(table, url);
      return sendJson(res, 200, { ok: true, resource, table, items: items || [] });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const record = normalizeRecord(resource, body);
      if (resource === 'notes' && (!record.entity_type || !record.entity_id || !record.note)) {
        return sendJson(res, 400, { ok: false, error: 'Nota precisa de entity_type, entity_id e note.' });
      }
      if (resource === 'tasks' && !record.title) return sendJson(res, 400, { ok: false, error: 'Tarefa precisa de título.' });
      if (resource === 'media' && !record.file_url) return sendJson(res, 400, { ok: false, error: 'Mídia precisa de URL.' });
      const data = await supabaseRequest(table, { method: 'POST', body: JSON.stringify(record) });
      return sendJson(res, 201, { ok: true, resource, item: Array.isArray(data) ? data[0] : data });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!body.id) return sendJson(res, 400, { ok: false, error: 'ID é obrigatório.' });
      const patch = normalizeRecord(resource, body);
      const data = await supabaseRequest(`${table}?id=eq.${encodeURIComponent(body.id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
      return sendJson(res, 200, { ok: true, resource, item: Array.isArray(data) ? data[0] : data });
    }

    return sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Erro operacional.' });
  }
}

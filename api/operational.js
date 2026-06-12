import { dataRequest, hasDataConfig, json, readBody } from './_arandu.js';

const ADMIN_TOKEN = process.env.ARANDU_ADMIN_TOKEN;

function tokenFrom(req) {
  return String(req.headers['x-arandu-admin-token'] || '').trim();
}

function adminGuard(req) {
  if (!ADMIN_TOKEN) return { ok: false, status: 503, error: 'ARANDU_ADMIN_TOKEN não configurado no servidor.' };
  if (tokenFrom(req) !== ADMIN_TOKEN) return { ok: false, status: 401, error: 'Acesso administrativo não autorizado.' };
  return { ok: true };
}

function clean(value) {
  return String(value || '').trim();
}

function normalizeNote(body) {
  return {
    entity_type: clean(body.entity_type),
    entity_id: clean(body.entity_id),
    author_name: body.author_name || 'Curadoria',
    note: clean(body.note)
  };
}

function normalizeTask(body) {
  return {
    entity_type: clean(body.entity_type),
    entity_id: clean(body.entity_id),
    title: clean(body.title),
    owner_name: body.owner_name || 'Curadoria',
    due_at: body.due_at ? new Date(body.due_at).toISOString() : null,
    priority: ['low', 'normal', 'high'].includes(body.priority) ? body.priority : 'normal',
    status: ['open', 'doing', 'done', 'cancelled'].includes(body.status) ? body.status : 'open'
  };
}

function validResource(resource) {
  return resource === 'notes' || resource === 'tasks';
}

function tableFor(resource) {
  return resource === 'notes' ? 'crm_notes' : 'tasks';
}

function orderFor(resource) {
  return resource === 'notes' ? 'created_at.desc' : 'due_at.asc.nullslast,created_at.desc';
}

async function listItems(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const resource = clean(url.searchParams.get('resource'));
  const entityType = clean(url.searchParams.get('entity_type'));
  const entityId = clean(url.searchParams.get('entity_id'));
  if (!validResource(resource)) return json(res, 400, { ok: false, error: 'Recurso operacional inválido.' });
  if (!entityType || !entityId) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' });
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', resource, items: [] });

  const query = `${tableFor(resource)}?select=*&entity_type=eq.${encodeURIComponent(entityType)}&entity_id=eq.${encodeURIComponent(entityId)}&order=${encodeURIComponent(orderFor(resource))}`;
  const rows = await dataRequest(query, { method: 'GET', headers: { Prefer: '' } });
  return json(res, 200, { ok: true, mode: 'stored', resource, items: rows || [] });
}

async function createItem(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const resource = clean(url.searchParams.get('resource'));
  if (!validResource(resource)) return json(res, 400, { ok: false, error: 'Recurso operacional inválido.' });
  const body = await readBody(req);
  const record = resource === 'notes' ? normalizeNote(body) : normalizeTask(body);
  if (!record.entity_type || !record.entity_id) return json(res, 400, { ok: false, error: 'Entidade obrigatória.' });
  if (resource === 'notes' && !record.note) return json(res, 400, { ok: false, error: 'Nota obrigatória.' });
  if (resource === 'tasks' && !record.title) return json(res, 400, { ok: false, error: 'Título da tarefa obrigatório.' });
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, resource, record });

  const saved = await dataRequest(tableFor(resource), { method: 'POST', body: JSON.stringify(record) });
  return json(res, 201, { ok: true, mode: 'stored', stored: true, resource, record: Array.isArray(saved) ? saved[0] || null : saved });
}

async function updateTask(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const resource = clean(url.searchParams.get('resource'));
  if (resource !== 'tasks') return json(res, 400, { ok: false, error: 'Apenas tarefas aceitam atualização operacional.' });
  const body = await readBody(req);
  const id = clean(body.id);
  const status = clean(body.status);
  if (!id) return json(res, 400, { ok: false, error: 'ID da tarefa obrigatório.' });
  if (!['open', 'doing', 'done', 'cancelled'].includes(status)) return json(res, 400, { ok: false, error: 'Status de tarefa inválido.' });
  if (!hasDataConfig()) return json(res, 202, { ok: true, mode: 'demo', stored: false, id, status });

  const saved = await dataRequest(`tasks?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, updated_at: new Date().toISOString() })
  });
  return json(res, 200, { ok: true, mode: 'stored', stored: true, record: Array.isArray(saved) ? saved[0] || null : saved });
}

export default async function handler(req, res) {
  try {
    const guard = adminGuard(req);
    if (!guard.ok) return json(res, guard.status, { ok: false, error: guard.error });
    if (req.method === 'GET') return listItems(req, res);
    if (req.method === 'POST') return createItem(req, res);
    if (req.method === 'PATCH') return updateTask(req, res);
    return json(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return json(res, 500, { ok: false, error: error.message || 'Erro inesperado.' });
  }
}

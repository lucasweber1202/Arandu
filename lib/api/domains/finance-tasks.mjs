import { createHash } from 'node:crypto';
import { HttpError, json, readBody, clean, limited } from '../../api-core.mjs';
import { userSupabaseRequest } from '../../supabase.mjs';
import { UUID, requireUuid, query, rest, upstream, memberOrganization } from './finance-core.mjs';

/** Add only same-organization member names to tasks already returned by task RLS. */
export function projectTaskAssignees(rows, members) {
  const names = new Map((members || []).map((member) => [member.user_id, member.display_name]));
  return (rows || []).map((task) => ({
    ...task,
    assignee_name: task.assignee_id ? names.get(task.assignee_id) || null : null
  }));
}

function decodeTaskCursor(value) {
  if (!value || value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new HttpError(400, 'Cursor de tarefas inválido.', 'invalid_task_cursor');
  let cursor;
  try { cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw new HttpError(400, 'Cursor de tarefas inválido.', 'invalid_task_cursor'); }
  const date = typeof cursor?.due_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cursor.due_on)
    ? new Date(`${cursor.due_on}T00:00:00.000Z`) : null;
  const validDate = Boolean(date && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === cursor.due_on);
  const validTimestamp = typeof cursor?.created_at === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.created_at)
    && Number.isFinite(Date.parse(cursor.created_at));
  try {
    if ((!validDate && cursor?.due_on !== null) || !validTimestamp) throw new Error('invalid cursor');
    return { due_on: cursor.due_on, created_at: cursor.created_at, id: requireUuid(cursor.id, 'cursor'), scope: cursor.scope ?? null };
  } catch {
    throw new HttpError(400, 'Cursor de tarefas inválido.', 'invalid_task_cursor');
  }
}

function encodeTaskCursor(task, scope = null) {
  return Buffer.from(JSON.stringify({ due_on: task.due_on, created_at: task.created_at, id: task.id, ...(scope ? { scope } : {}) })).toString('base64url');
}

function taskCursorFilter(cursor) {
  const stamp = cursor.created_at;
  const id = cursor.id;
  if (cursor.due_on === null) {
    return `(and(due_on.is.null,created_at.gt.${stamp}),and(due_on.is.null,created_at.eq.${stamp},id.gt.${id}))`;
  }
  const due = cursor.due_on;
  return `(due_on.gt.${due},and(due_on.eq.${due},created_at.gt.${stamp}),and(due_on.eq.${due},created_at.eq.${stamp},id.gt.${id}),due_on.is.null)`;
}

/** API-side guard for manual assignment; the database trigger repeats it atomically. */
async function requireTaskAssignmentRole(token, organizationId, userId) {
  const rows = await rest(token, `fin_members?select=role&organization_id=eq.${organizationId}&user_id=eq.${requireUuid(userId, 'user_id')}&limit=1`);
  if (!['admin', 'finance_manager'].includes(rows?.[0]?.role)) {
    throw new HttpError(403, 'Sua conta não tem permissão para atribuir esta tarefa.', 'task_assignment_forbidden');
  }
}

/** Collapse assignment-specific authorization failures without changing other API errors. */
async function writeTask(token, resource, options, assignmentRequested) {
  try { return await upstream(userSupabaseRequest(token, resource, options)); }
  catch (error) {
    const raw = String(error?.details?.message || error?.message || '');
    if (assignmentRequested && (error?.code === 'task_assignee_unavailable' || /^invalid task assignee$/i.test(raw.trim()))) {
      throw new HttpError(403, 'Responsável indisponível para esta tarefa.', 'task_assignee_unavailable');
    }
    if (assignmentRequested && (error?.code === 'forbidden' || /^(forbidden|organization offboarding)$/i.test(raw.trim()))) {
      throw new HttpError(403, 'Sua conta não tem permissão para atribuir esta tarefa.', 'task_assignment_forbidden');
    }
    throw error;
  }
}

export async function handleFinanceTasks(req, res, {resource, sub, token, headers, session}) {
  if (resource === 'tasks') {
    if (req.method === 'GET') {
      const organization = await memberOrganization(token, query(req).get('organization_id'));
      const params = query(req);
      const rawLimit = params.get('limit');
      const limit = rawLimit === null ? 200 : Number(rawLimit);
      if (rawLimit !== null && (!/^(?:[1-9]\d{0,2})$/.test(rawLimit) || !Number.isInteger(limit) || limit > 200)) {
        throw new HttpError(400, 'Limite de tarefas inválido.', 'invalid_task_pagination');
      }
      const taskId = params.has('task_id') ? requireUuid(params.get('task_id'), 'task_id') : null;
      const relatedId = params.has('contract_id') ? requireUuid(params.get('contract_id'), 'contract_id') : null;
      const relatedType = relatedId ? 'contract' : null;
      if (taskId && relatedId) throw new HttpError(400, 'Escolha um único contexto de tarefa.', 'invalid_task_filter');
      if (relatedId) {
        if (organization.kind !== 'BUYER') throw new HttpError(403, 'Contexto indisponível para esta conta.', 'forbidden');
        const parent = (await rest(token, `fin_contracts?select=id&organization_id=eq.${organization.id}&id=eq.${relatedId}&limit=1`))?.[0];
        if (!parent) throw new HttpError(404, 'Registro não encontrado neste escopo.', 'task_context_not_found');
      }
      if (taskId && ['status', 'assignee_id', 'unassigned', 'cursor'].some((key) => params.has(key))) throw new HttpError(400, 'Consulte a tarefa pelo link ou use os filtros da lista.', 'invalid_task_filter');
      const status = params.get('status');
      if (status !== null && !['open', 'done', 'cancelled'].includes(status)) {
        throw new HttpError(400, 'Situação de tarefa inválida.', 'invalid_task_status');
      }
      const assignee = params.get('assignee_id');
      const unassigned = params.get('unassigned');
      if (assignee !== null && unassigned !== null) throw new HttpError(400, 'Informe um único filtro de responsável.', 'invalid_task_filter');
      const assigneeId = assignee === null ? null : requireUuid(assignee, 'assignee_id');
      if (unassigned !== null && unassigned !== 'true') throw new HttpError(400, 'Filtro de tarefas sem responsável inválido.', 'invalid_task_filter');
      const cursor = params.has('cursor') ? decodeTaskCursor(params.get('cursor')) : null;
      const taskScope = relatedId ? `${organization.id}:${relatedType}:${relatedId}:${status || 'all'}:${assigneeId || unassigned || 'all'}` : `${organization.id}:task-list:${status || 'all'}:${assigneeId || unassigned || 'all'}`;
      if (taskScope && cursor && cursor.scope !== taskScope) throw new HttpError(400, 'Atualize a lista de tarefas deste contexto.', 'invalid_task_cursor');
      const filters = new URLSearchParams({
        select: 'id,title,due_on,status,related_type,related_id,created_at,assignee_id',
        organization_id: `eq.${organization.id}`,
        order: 'due_on.asc.nullslast,created_at.asc,id.asc',
        limit: String(taskId ? 1 : limit + 1)
      });
      if (taskId) filters.set('id', `eq.${taskId}`);
      if (relatedId) { filters.set('related_type', `eq.${relatedType}`); filters.set('related_id', `eq.${relatedId}`); }
      if (status !== null) filters.set('status', `eq.${status}`);
      if (assigneeId) filters.set('assignee_id', `eq.${assigneeId}`);
      else if (unassigned === 'true') filters.set('assignee_id', 'is.null');
      if (cursor) filters.set('or', taskCursorFilter(cursor));
      const fetched = await rest(token, `fin_tasks?${filters.toString()}`);
      const hasMore = !taskId && (fetched || []).length > limit;
      const rows = (fetched || []).slice(0, taskId ? 1 : limit);
      // First let task RLS determine the rows this caller can see. Only then
      // ask for names of assignees on those rows, constrained to this org.
      // If a member was removed between reads, the FK/trigger clears the ID;
      // a missing member row also yields a null name rather than stale data.
      const assigneeIds = [...new Set((rows || []).map((row) => row.assignee_id).filter(Boolean))];
      const members = assigneeIds.length
        ? await rest(token, `fin_members?select=user_id,display_name&organization_id=eq.${organization.id}&user_id=in.(${assigneeIds.join(',')})&limit=${assigneeIds.length}`)
        : [];
      return json(res, 200, {
        ok: true,
        rows: projectTaskAssignees(rows, members),
        page: { limit: taskId ? 1 : limit, has_more: hasMore, next_cursor: hasMore && rows.length ? encodeTaskCursor(rows.at(-1), taskScope) : null }
      }, headers);
    }
    if (req.method === 'POST') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      const title = limited(body.title, 200);
      if (title.length < 2) throw new HttpError(400, 'Informe um título para a tarefa.', 'invalid_title');
      const dueOn = clean(body.due_on);
      if (dueOn && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) throw new HttpError(400, 'Data da tarefa inválida.', 'invalid_due_on');
      const assignment = Object.hasOwn(body, 'assignee_id') ? {
        assignee_id: body.assignee_id === null ? null : requireUuid(body.assignee_id, 'assignee_id'),
        // This is server-owned provenance. Never accept source or role from the
        // request body; the database trigger validates who may assign whom.
        assignee_source: 'manual'
      } : {};
      if (Object.hasOwn(body, 'assignee_id')) await requireTaskAssignmentRole(token, organization.id, session.user.id);
      const taskInput = {
        organization_id: organization.id, title, due_on: dueOn || null,
        related_type: ['rfq', 'proposal', 'contract'].includes(clean(body.related_type)) ? clean(body.related_type) : null,
        related_id: clean(body.related_id) ? requireUuid(body.related_id, 'related_id') : null,
        created_by: session.user.id,
        ...assignment
      };
      const idempotencyKey = Object.hasOwn(body, 'idempotency_key')
        ? requireUuid(body.idempotency_key, 'idempotency_key') : null;
      const idempotencyHash = idempotencyKey
        ? createHash('sha256').update(JSON.stringify(taskInput)).digest('hex') : null;
      if (idempotencyKey) Object.assign(taskInput, { idempotency_key: idempotencyKey, idempotency_hash: idempotencyHash });
      const rows = await writeTask(token, idempotencyKey
        ? 'fin_tasks?on_conflict=organization_id,created_by,idempotency_key' : 'fin_tasks', {
        method: 'POST',
        body: taskInput,
        ...(idempotencyKey ? { prefer: 'resolution=ignore-duplicates,return=representation' } : {})
      }, Object.hasOwn(body, 'assignee_id'));
      if (idempotencyKey && !rows?.length) {
        const existing = (await rest(token,
          `fin_tasks?select=id,title,due_on,status,related_type,related_id,created_at,assignee_id,idempotency_hash&organization_id=eq.${organization.id}&created_by=eq.${session.user.id}&idempotency_key=eq.${idempotencyKey}&limit=1`))?.[0];
        if (!existing || !UUID.test(String(existing.id || ''))) throw new HttpError(409, 'Não foi possível confirmar a criação da tarefa. Recarregue a lista antes de tentar novamente.', 'task_creation_unknown');
        if (existing.idempotency_hash !== idempotencyHash) {
          throw new HttpError(409, 'Esta chave de criação já foi usada com outros dados. Gere uma nova chave.', 'idempotency_key_reused');
        }
        const row = { ...existing };
        delete row.idempotency_hash;
        return json(res, 200, { ok: true, row }, headers);
      }
      const created = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (!created || !UUID.test(String(created.id || ''))) {
        throw new HttpError(409, 'Não foi possível confirmar a criação da tarefa. Recarregue a lista antes de tentar novamente.', 'task_creation_unknown');
      }
      delete created.idempotency_hash;
      delete created.idempotency_key;
      return json(res, 201, { ok: true, row: created }, headers);
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      const organization = await memberOrganization(token, body.organization_id, ['BUYER']);
      const patch = {};
      if (Object.hasOwn(body, 'status')) {
        const status = clean(body.status);
        if (!['open', 'done', 'cancelled'].includes(status)) throw new HttpError(400, 'Estado de tarefa inválido.', 'invalid_task_status');
        patch.status = status;
      }
      if (Object.hasOwn(body, 'assignee_id')) {
        // Null explicitly unassigns; absent leaves the existing assignment
        // untouched. The database trigger validates actor role, membership,
        // entity scope and governance lock atomically with this update.
        patch.assignee_id = body.assignee_id === null ? null : requireUuid(body.assignee_id, 'assignee_id');
        patch.assignee_source = 'manual';
        await requireTaskAssignmentRole(token, organization.id, session.user.id);
      }
      if (!Object.keys(patch).length) throw new HttpError(400, 'Informe o estado ou responsável da tarefa.', 'empty_task_update');
      const updated = await writeTask(token, `fin_tasks?id=eq.${requireUuid(body.task_id, 'task_id')}&organization_id=eq.${organization.id}`, {
        method: 'PATCH', body: patch
      }, Object.hasOwn(body, 'assignee_id'));
      if (!Array.isArray(updated) || updated.length === 0) {
        throw new HttpError(404, 'Tarefa não encontrada ou sem acesso para esta conta.', 'not_found');
      }
      return json(res, 200, { ok: true }, headers);
    }
  }

  throw new HttpError(404, 'Recurso financeiro não encontrado.', 'finance_route_not_found');
}

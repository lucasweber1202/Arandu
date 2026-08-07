import { createHash, randomUUID } from 'node:crypto';
import { AdminAuthError, applyAdminResponseHeaders, requireAdmin } from '../lib/admin-auth.mjs';
import { requireAdminPermission } from '../lib/admin-rbac.mjs';
import { reportError } from '../lib/observability.mjs';
import { applyApiSecurityHeaders, crossOriginRejection } from '../lib/http-security.mjs';
import { enforceSensitiveRateLimit } from '../lib/rate-limit.mjs';
import {
  adminSupabaseRequest,
  adminSupabaseRpc,
  auditRequestHeaders,
  hasSupabaseAccess
} from '../lib/supabase.mjs';

const MAX_BODY_BYTES = 128 * 1024;
const ORDER_STATUS = new Set(['created', 'confirmed', 'completed', 'cancelled']);
const PAYMENT_STATUS = new Set(['pending', 'awaiting_confirmation', 'paid', 'refunded', 'failed', 'cancelled']);
const FULFILLMENT_STATUS = new Set(['pending', 'packing', 'shipped', 'delivered', 'returned', 'cancelled']);
const CERTIFICATE_STATUS = new Set(['pending', 'ready', 'issued', 'not_applicable']);

class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function clean(value, max = 240) {
  return String(value ?? '').trim().slice(0, max);
}

function json(res, status, payload, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  applyApiSecurityHeaders(res);
  applyAdminResponseHeaders(res, headers);
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  const chunks = [];
  let bytes = 0;
  const declared = Number(req.headers?.['content-length'] || 0);
  if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'Solicitação muito grande.');
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new HttpError(413, 'Solicitação muito grande.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function firstRecord(value) {
  return Array.isArray(value) ? value[0] || null : value;
}

async function acquireIdempotency(req, actor, accepted) {
  const rawKey = clean(req.headers?.['idempotency-key'], 128);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(rawKey)) {
    throw new HttpError(400, 'Idempotency-Key válida é obrigatória.', 'idempotency_key_required');
  }
  const scope = 'orders.create';
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const identityHash = createHash('sha256').update(actor.id).digest('hex');
  const requestHash = createHash('sha256').update(canonicalJson(accepted)).digest('hex');
  const result = firstRecord(await adminSupabaseRpc('acquire_idempotency', {
    p_scope: scope,
    p_key_hash: keyHash,
    p_identity_hash: identityHash,
    p_request_hash: requestHash,
    p_lock_seconds: 120,
    p_ttl_seconds: 86400
  }));
  if (result?.outcome === 'replay') return { replay: true, status: result.response_status, payload: result.response_body };
  if (result?.outcome === 'identity_conflict') throw new HttpError(409, 'Esta chave pertence a outra identidade.', 'idempotency_identity_conflict');
  if (result?.outcome === 'payload_conflict') throw new HttpError(409, 'A mesma chave foi usada com dados diferentes.', 'idempotency_payload_conflict');
  if (result?.outcome === 'in_progress') throw new HttpError(409, 'Esta solicitação já está sendo processada.', 'idempotency_in_progress');
  if (result?.outcome !== 'acquired') throw new HttpError(503, 'Não foi possível adquirir a chave de idempotência.', 'idempotency_unavailable');
  return { replay: false, scope, keyHash, identityHash, requestHash };
}

async function failIdempotency(context, error) {
  if (!context || context.replay) return;
  await adminSupabaseRpc('fail_idempotency', {
    p_scope: context.scope,
    p_key_hash: context.keyHash,
    p_identity_hash: context.identityHash,
    p_request_hash: context.requestHash,
    p_error_code: clean(error?.code || error?.message || 'operation_failed', 120)
  }).catch(() => null);
}

async function listOrders(req, res, admin) {
  requireAdminPermission(admin.actor, 'commercial', 'read');
  const id = clean(new URL(req.url, 'https://arandu.invalid').searchParams.get('id'), 80);
  const query = id
    ? `orders?id=eq.${encodeURIComponent(id)}&select=*&limit=1`
    : 'orders?select=*&order=created_at.desc&limit=100';
  const rows = await adminSupabaseRequest(query, { prefer: '' });
  return json(res, 200, { ok: true, mode: 'stored', items: rows || [] }, admin.headers);
}

async function createOrder(req, res, admin, requestId) {
  requireAdminPermission(admin.actor, 'commercial', 'create');
  const body = await readBody(req);
  const accepted = {
    reservationId: clean(body.reservation_id, 80),
    proposalId: clean(body.proposal_id, 80) || null,
    commercialRecordId: clean(body.commercial_record_id, 80) || null
  };
  if (!accepted.reservationId) throw new HttpError(400, 'reservation_id é obrigatório.');

  const idempotency = await acquireIdempotency(req, admin.actor, accepted);
  if (idempotency.replay) {
    return json(res, Number(idempotency.status) || 200, idempotency.payload, {
      ...admin.headers,
      'Idempotency-Replayed': 'true'
    });
  }

  try {
    const payload = firstRecord(await adminSupabaseRpc('create_order_atomic', {
      p_reservation_id: accepted.reservationId,
      p_proposal_id: accepted.proposalId,
      p_commercial_record_id: accepted.commercialRecordId,
      p_actor_ref: admin.actor.id,
      p_actor_role: admin.actor.role,
      p_request_id: requestId,
      p_idempotency_scope: idempotency.scope,
      p_idempotency_key_hash: idempotency.keyHash,
      p_identity_hash: idempotency.identityHash,
      p_request_hash: idempotency.requestHash
    }));
    return json(res, Number(payload?.statusCode) || 201, payload, admin.headers);
  } catch (error) {
    await failIdempotency(idempotency, error);
    throw error;
  }
}

async function updateOrder(req, res, admin, requestId) {
  requireAdminPermission(admin.actor, 'commercial', 'update');
  const body = await readBody(req);
  const id = clean(body.id, 80);
  if (!id) throw new HttpError(400, 'ID obrigatório.');

  const payload = {};
  if (body.status !== undefined) {
    if (!ORDER_STATUS.has(body.status)) throw new HttpError(400, 'Status do pedido inválido.');
    payload.status = body.status;
  }
  if (body.payment_status !== undefined) {
    if (!PAYMENT_STATUS.has(body.payment_status)) throw new HttpError(400, 'Status de pagamento inválido.');
    payload.payment_status = body.payment_status;
  }
  if (body.fulfillment_status !== undefined) {
    if (!FULFILLMENT_STATUS.has(body.fulfillment_status)) throw new HttpError(400, 'Status logístico inválido.');
    payload.fulfillment_status = body.fulfillment_status;
  }
  if (body.certificate_status !== undefined) {
    if (!CERTIFICATE_STATUS.has(body.certificate_status)) throw new HttpError(400, 'Status de certificado inválido.');
    payload.certificate_status = body.certificate_status;
  }
  if (!Object.keys(payload).length) throw new HttpError(400, 'Nenhum campo válido.');

  const rows = await adminSupabaseRequest(`orders?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: auditRequestHeaders(admin.actor, requestId, body.justification),
    body: payload
  });
  return json(res, 200, { ok: true, mode: 'stored', stored: true, order: firstRecord(rows) }, admin.headers);
}

export default async function handler(req, res) {
  const requestId = clean(req.headers?.['x-request-id'], 80) || randomUUID();
  res.setHeader('X-Request-ID', requestId);
  try {
    const rejection = crossOriginRejection(req);
    if (rejection) return json(res, rejection.status, { ok: false, error: rejection.error, code: rejection.code, requestId });

    const admin = await requireAdmin(req);
    if (req.method !== 'GET') {
      await enforceSensitiveRateLimit(req, 'admin-orders-write', {
        limit: 60,
        windowMs: 10 * 60 * 1000,
        identity: admin.actor.id
      });
    }
    if (!hasSupabaseAccess('admin')) throw new HttpError(503, 'O banco de produção ainda não está configurado.');

    if (req.method === 'GET') return listOrders(req, res, admin);
    if (req.method === 'POST') return createOrder(req, res, admin, requestId);
    if (req.method === 'PATCH') return updateOrder(req, res, admin, requestId);
    return json(res, 405, { ok: false, error: 'Método não permitido.', requestId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) {
      await reportError({
        service: 'arandu-orders',
        requestId,
        route: '/api/orders',
        status,
        code: error?.code,
        method: req.method,
        error
      });
    }
    return json(res, status, {
      ok: false,
      error: status < 500 ? error.message : 'Não foi possível concluir a operação do pedido agora.',
      ...(error instanceof AdminAuthError && error.code ? { code: error.code } : {}),
      ...(error?.code ? { code: error.code } : {}),
      requestId
    });
  }
}

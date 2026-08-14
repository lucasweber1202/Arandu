import { createHash, randomUUID } from 'node:crypto';
import { AdminAuthError, applyAdminResponseHeaders, requireAdmin } from '../lib/admin-auth.mjs';
import { requireAdminPermission } from '../lib/admin-rbac.mjs';
import { requireCommercialPolicy } from '../lib/commercial-policy.mjs';
import { reportError } from '../lib/observability.mjs';
import { applyApiSecurityHeaders, crossOriginRejection } from '../lib/http-security.mjs';
import { enforceSensitiveRateLimit } from '../lib/rate-limit.mjs';
import {
  adminSupabaseRequest,
  adminSupabaseRpc,
  auditRequestHeaders,
  hasSupabaseAccess
} from '../lib/supabase.mjs';

const STATUS = ['draft', 'confirmed', 'completed', 'cancelled'];
const MAX_BODY_BYTES = 256 * 1024;

class HttpError extends Error {
  constructor(status, message, code = null) {
    super(message);
    this.status = status;
    this.code = code;
  }
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
  const declaredSize = Number(req.headers?.['content-length'] || 0);
  if (declaredSize > MAX_BODY_BYTES) throw new HttpError(413, 'Solicitação muito grande.');
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

function clean(value) {
  return String(value || '').trim();
}

function limited(value, max) {
  return clean(value).slice(0, max);
}

function firstRecord(value) {
  return Array.isArray(value) ? value[0] || null : value;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

function acceptedRecord(body) {
  const artworkIds = Array.isArray(body.items)
    ? body.items.map((item) => limited(item?.artwork_id || item?.artworkId || item?.id, 180)).filter(Boolean)
    : [];
  return {
    artworkIds,
    proposalId: limited(body.proposal_id, 80) || null,
    reservationId: limited(body.reservation_id, 80) || null,
    leadId: limited(body.lead_id, 80) || null,
    client: limited(body.client, 240),
    email: limited(body.email, 254).toLowerCase() || null,
    whatsapp: clean(body.whatsapp).replace(/\D/g, '').slice(0, 15) || null,
    notes: limited(body.notes, 3000) || null
  };
}

async function acquireIdempotency(req, actor, accepted) {
  const rawKey = limited(req.headers?.['idempotency-key'], 128);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(rawKey)) {
    throw new HttpError(400, 'Idempotency-Key válida é obrigatória.', 'idempotency_key_required');
  }
  const scope = 'commercial.create';
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
    p_error_code: limited(error?.code || error?.message || 'operation_failed', 120)
  }).catch(() => null);
}

async function listRecords(res, admin) {
  requireAdminPermission(admin.actor, 'commercial', 'read');
  const rows = await adminSupabaseRequest('commercial_records?select=id,commercial_number,proposal_id,reservation_id,lead_id,client,email,whatsapp,total,platform_fee_rate,platform_fee,artist_amount,status,logistics_status,notes,created_at,updated_at&order=created_at.desc&limit=200', { prefer: '' });
  return json(res, 200, { ok: true, mode: 'stored', items: rows || [] }, admin.headers);
}

async function createRecord(req, res, admin, requestId) {
  requireAdminPermission(admin.actor, 'commercial', 'create');
  const body = await readBody(req);
  const record = acceptedRecord(body);
  if (!record.client) throw new HttpError(400, 'Cliente obrigatório.');
  if (!record.artworkIds.length) throw new HttpError(400, 'Inclua ao menos uma obra.');
  const commercialPolicy = requireCommercialPolicy();
  const idempotency = await acquireIdempotency(req, admin.actor, record);
  if (idempotency.replay) {
    return json(res, idempotency.status, idempotency.payload, {
      ...admin.headers,
      'Idempotency-Replayed': 'true'
    });
  }
  try {
    const payload = firstRecord(await adminSupabaseRpc('create_commercial_record_atomic', {
      p_artwork_ids: record.artworkIds,
      p_proposal_id: record.proposalId,
      p_reservation_id: record.reservationId,
      p_lead_id: record.leadId,
      p_client: record.client,
      p_email: record.email,
      p_whatsapp: record.whatsapp,
      p_currency: commercialPolicy.currency,
      p_platform_fee_rate: commercialPolicy.platformFeeRate,
      p_policy_version: commercialPolicy.version,
      p_policy_snapshot: commercialPolicy,
      p_notes: record.notes,
      p_actor_ref: admin.actor.id,
      p_actor_role: admin.actor.role,
      p_request_id: requestId,
      p_idempotency_scope: idempotency.scope,
      p_idempotency_key_hash: idempotency.keyHash,
      p_identity_hash: idempotency.identityHash,
      p_request_hash: idempotency.requestHash
    }));
    return json(res, 201, payload, admin.headers);
  } catch (error) {
    await failIdempotency(idempotency, error);
    throw error;
  }
}

async function updateRecord(req, res, admin, requestId) {
  requireAdminPermission(admin.actor, 'commercial', 'update');
  const body = await readBody(req);
  const id = limited(body.id, 80);
  const payload = {};
  if (!id) throw new HttpError(400, 'ID obrigatório.');
  if (STATUS.includes(body.status)) payload.status = body.status;
  if (body.logistics_status !== undefined) payload.logistics_status = limited(body.logistics_status, 80);
  if (body.notes !== undefined) payload.notes = limited(body.notes, 3000);
  if (!Object.keys(payload).length) throw new HttpError(400, 'Nenhum campo válido.');
  const rows = await adminSupabaseRequest(`commercial_records?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: auditRequestHeaders(admin.actor, requestId, body.justification),
    body: payload
  });
  return json(res, 200, { ok: true, mode: 'stored', stored: true, record: firstRecord(rows) }, admin.headers);
}

export default async function handler(req, res) {
  const requestId = limited(req.headers?.['x-request-id'], 80) || randomUUID();
  res.setHeader('X-Request-ID', requestId);
  try {
    const rejection = crossOriginRejection(req);
    if (rejection) return json(res, rejection.status, { ok: false, error: rejection.error, code: rejection.code, requestId });
    const admin = await requireAdmin(req);
    if (req.method !== 'GET') {
      await enforceSensitiveRateLimit(req, 'admin-commercial-write', {
        limit: 60,
        windowMs: 10 * 60 * 1000,
        identity: admin.actor.id
      });
    }
    if (!hasSupabaseAccess('admin')) throw new HttpError(503, 'O banco de produção ainda não está configurado.');
    if (req.method === 'GET') return listRecords(res, admin);
    if (req.method === 'POST') return createRecord(req, res, admin, requestId);
    if (req.method === 'PATCH') return updateRecord(req, res, admin, requestId);
    return json(res, 405, { ok: false, error: 'Método não permitido.', requestId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    if (status >= 500) {
      await reportError({ service: 'arandu-commercial', requestId, status, code: error?.code, method: req.method, error });
    }
    return json(res, status, {
      ok: false,
      error: status < 500 ? error.message : 'Não foi possível concluir a operação comercial agora.',
      ...(error instanceof AdminAuthError && error.code ? { code: error.code } : {}),
      ...(error?.code ? { code: error.code } : {}),
      requestId
    });
  }
}

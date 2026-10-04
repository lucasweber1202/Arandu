// Public API v1 (docs/FINANCIAL_PUBLIC_API.md, docs/openapi/arandu-public-api-v1.json).
//
// Máquina-a-máquina, sem sessão de navegador: `Authorization: Bearer arnd_…`.
// O servidor calcula o sha256 do token e o repassa a funções fin_api_* (service
// role), que conferem credencial + organização + entidade + escopo + objeto no
// banco. O token nunca é registrado; o hash não sai daqui.
//
// Contrato estável de v1: erros { error: { code, message, correlation_id } },
// páginas { data, page: { limit, has_more, next_cursor } }, ordem
// determinística, `X-Correlation-Id` e `Arandu-Api-Version` em toda resposta.
import { readBody } from '../../api-core.mjs';
import { adminSupabaseRpc, hasSupabaseAccess } from '../../supabase.mjs';
import { normalizeDemand } from '../../finance/products.mjs';
import { reportError } from '../../observability.mjs';
import {
  API_VERSION, WEBHOOK_EVENTS, bearerToken, hashToken, correlationId, requestFingerprint, validIdempotencyKey, decodeCursor, pageSize, paginate,
  optionalUuid, encryptSecret, generateWebhookSecret, webhookSecretsConfigured, validWebhookUrl
} from '../../finance/public-api.mjs';

class ApiError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// Exceções nomeadas do banco -> erro público estável. O resto vira 500 sem detalhe.
const DATABASE_ERRORS = [
  [/api unauthorized/i, 401, 'unauthorized', 'Credencial ausente, inválida, expirada ou revogada.'],
  [/api scope denied/i, 403, 'insufficient_scope', 'A credencial não tem o escopo exigido por esta operação.'],
  [/api entity denied/i, 403, 'entity_forbidden', 'A credencial não alcança a entidade informada.'],
  [/api not found/i, 404, 'not_found', 'Recurso não encontrado para esta credencial.'],
  [/invalid api query/i, 400, 'invalid_query', 'Parâmetros de consulta inválidos.'],
  [/idempotency key required/i, 400, 'idempotency_key_required', 'Envie o cabeçalho Idempotency-Key (8 a 200 caracteres: letras, números, . _ : -).'],
  [/idempotency key reuse/i, 422, 'idempotency_key_reuse', 'Esta Idempotency-Key já foi usada com outro conteúdo.'],
  [/invalid api owner/i, 422, 'invalid_owner', 'owner_id precisa ser uma pessoa da empresa com papel de gestão e acesso à entidade.'],
  [/invalid api payload/i, 422, 'invalid_payload', 'Conteúdo inválido.'],
  [/invalid webhook/i, 422, 'invalid_webhook', 'Webhook inválido: URL https pública (porta 443, sem credencial) e eventos do catálogo.'],
  [/too many webhooks/i, 409, 'webhook_limit', 'Limite de webhooks ativos da organização atingido.'],
  [/delivery not replayable/i, 409, 'delivery_not_replayable', 'Esta entrega ainda está em andamento.'],
  [/webhook disabled/i, 409, 'webhook_disabled', 'O webhook está desativado.']
];

function databaseError(error) {
  const raw = String(error?.details?.message || error?.message || '');
  for (const [pattern, status, code, message] of DATABASE_ERRORS) if (pattern.test(raw)) return new ApiError(status, code, message);
  return null;
}

function send(res, status, payload, correlation, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Correlation-Id', correlation);
  res.setHeader('Arandu-Api-Version', API_VERSION);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  res.end(JSON.stringify(payload));
}

function query(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

const ALLOWED_QUERY = {
  rfqs: ['limit', 'cursor', 'status', 'legal_entity_id', 'updated_since'],
  contracts: ['limit', 'cursor', 'status', 'legal_entity_id', 'ends_before'],
  providers: ['limit', 'cursor'],
  facilities: ['limit', 'cursor', 'legal_entity_id'],
  approvals: ['limit', 'cursor', 'status'],
  deliveries: ['limit', 'cursor']
};

/** Filtros fechados: parâmetro desconhecido é erro (sem export acidental por filtro ignorado). */
function filters(req, kind) {
  const params = query(req);
  for (const key of params.keys()) if (!ALLOWED_QUERY[kind].includes(key)) throw new ApiError(400, 'invalid_query', `Parâmetro não suportado: ${key}.`);
  const limit = pageSize(params.get('limit'));
  if (limit === null) throw new ApiError(400, 'invalid_query', 'limit deve ser um inteiro entre 1 e 100.');
  const entity = optionalUuid(params.get('legal_entity_id'));
  if (entity === undefined) throw new ApiError(400, 'invalid_query', 'legal_entity_id inválido.');
  const status = params.get('status');
  if (status !== null && !/^[a-z_]{3,30}$/.test(status)) throw new ApiError(400, 'invalid_query', 'status inválido.');
  const date = (key) => {
    const value = params.get(key);
    if (value === null) return null;
    if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/.test(value) || Number.isNaN(Date.parse(value))) throw new ApiError(400, 'invalid_query', `${key} inválido (ISO 8601).`);
    return value;
  };
  return { params, limit, entity, status, date };
}

function cursorParts(params, keys) {
  const cursor = decodeCursor(params.get('cursor'), keys);
  if (cursor === undefined) throw new ApiError(400, 'invalid_query', 'cursor inválido.');
  return cursor;
}

const MEMORY_BUCKETS = new Map();
/**
 * Limite por credencial (janela de 60 s). Em ambiente hospedado usa o contador
 * do banco (consume_rate_limit); falha do contador = 503, nunca passe livre.
 */
export function createApiRateLimit({ rpc = adminSupabaseRpc, env = process.env } = {}) {
  const limit = Math.min(Math.max(Number.parseInt(env.ARANDU_API_RATE_LIMIT_PER_MINUTE || '120', 10) || 120, 10), 6000);
  const distributed = ['1', 'true', 'yes', 'sim'].includes(String(env.ARANDU_DISTRIBUTED_RATE_LIMIT || '').toLowerCase()) || Boolean(env.VERCEL_ENV);
  return async (keyHash) => {
    if (!distributed) {
      const now = Date.now();
      const entry = MEMORY_BUCKETS.get(keyHash);
      if (!entry || entry.resetAt <= now) { MEMORY_BUCKETS.set(keyHash, { count: 1, resetAt: now + 60000 }); return; }
      entry.count += 1;
      if (entry.count > limit) throw Object.assign(new Error('rate limited'), { code: 'rate_limit_exceeded' });
      return;
    }
    let allowed;
    try {
      allowed = await rpc('consume_rate_limit', { p_scope: 'api_v1', p_fingerprint: keyHash.slice(0, 64), p_limit: limit, p_window_seconds: 60 });
    } catch {
      throw Object.assign(new Error('rate limit unavailable'), { code: 'rate_limit_unavailable' });
    }
    if (allowed !== true) throw Object.assign(new Error('rate limited'), { code: 'rate_limit_exceeded' });
  };
}

/**
 * @param {{ rpc?: Function, rateLimit?: Function, env?: object }} deps
 */
export async function handlePublicApi(req, res, route, { rpc = adminSupabaseRpc, rateLimit = createApiRateLimit({ rpc }), env = process.env } = {}) {
  const correlation = correlationId(req.headers?.['x-correlation-id']);
  const segments = route.split('/').filter(Boolean);
  try {
    if (!segments.length) {
      return send(res, 200, { api: 'arandu', version: API_VERSION, documentation: '/docs/FINANCIAL_PUBLIC_API.md',
        authentication: 'Authorization: Bearer <token de conta de serviço>' }, correlation);
    }
    if (!hasSupabaseAccess('admin')) throw new ApiError(503, 'service_unavailable', 'API indisponível neste ambiente.');
    const token = bearerToken(req.headers?.authorization);
    if (!token) throw new ApiError(401, 'unauthorized', 'Credencial ausente, inválida, expirada ou revogada.', { 'WWW-Authenticate': 'Bearer realm="arandu"' });
    const keyHash = hashToken(token);
    // Limite por credencial; sem o contador, falha fechada.
    if (rateLimit) await rateLimit(keyHash);
    const call = (name, body) => rpc(name, { p_key_hash: keyHash, ...body }).catch((error) => { throw databaseError(error) || error; });
    const method = req.method;
    const [resource, id, child, childId, action] = segments;

    if (resource === 'me' && method === 'GET' && !id) return send(res, 200, { data: await call('fin_api_whoami', {}) }, correlation);

    if (resource === 'rfqs' && !id && method === 'GET') {
      const { params, limit, entity, status, date } = filters(req, 'rfqs');
      const cursor = cursorParts(params, ['c', 'i']);
      const rows = await call('fin_api_list_rfqs', { p_limit: limit, p_after_created: cursor?.c ?? null, p_after_id: cursor?.i ?? null, p_status: status,
        p_entity: entity, p_updated_since: date('updated_since') });
      return send(res, 200, paginate(rows, limit, (row) => ({ c: row.created_at, i: row.id })), correlation);
    }
    if (resource === 'rfqs' && id && !child && method === 'GET') {
      if (!optionalUuid(id)) throw new ApiError(404, 'not_found', 'Recurso não encontrado para esta credencial.');
      return send(res, 200, { data: await call('fin_api_get_rfq', { p_id: id }) }, correlation);
    }
    if (resource === 'rfqs' && !id && method === 'POST') {
      const key = req.headers?.['idempotency-key'];
      if (!validIdempotencyKey(key)) throw new ApiError(400, 'idempotency_key_required', 'Envie o cabeçalho Idempotency-Key (8 a 200 caracteres: letras, números, . _ : -).');
      const body = await readBody(req, { maxBytes: 64 * 1024 });
      const allowed = ['product', 'title', 'description', 'demand', 'response_deadline', 'legal_entity_id', 'owner_id'];
      const unknown = Object.keys(body).filter((field) => !allowed.includes(field));
      if (unknown.length) throw new ApiError(422, 'invalid_payload', `Campos não aceitos: ${unknown.join(', ')}.`);
      const normalized = normalizeDemand(body.product, body.demand);
      if (!normalized || normalized.errors?.length || normalized.rejected?.length || !normalized.values) {
        throw new ApiError(422, 'invalid_payload', 'Demanda inválida para o produto.', { details: [...(normalized?.errors || []), ...(normalized?.rejected || []).map((key) => `Campo não aceito na demanda: ${key}.`)].slice(0, 20) });
      }
      const payload = { product: body.product, title: String(body.title || ''), description: body.description ?? null, demand: normalized.values,
        response_deadline: body.response_deadline ?? null, legal_entity_id: body.legal_entity_id ?? null, owner_id: body.owner_id ?? null };
      const result = await call('fin_api_create_rfq', { p_idempotency_key: key, p_fingerprint: requestFingerprint('POST', '/v1/rfqs', body), p_payload: payload, p_correlation: correlation });
      const replay = Boolean(result?.idempotent_replay);
      const { idempotent_replay: _ignored, ...data } = result || {};
      return send(res, replay ? 200 : 201, { data }, correlation, replay ? { 'Idempotent-Replayed': 'true' } : {});
    }

    if (resource === 'contracts' && !id && method === 'GET') {
      const { params, limit, entity, status, date } = filters(req, 'contracts');
      const cursor = cursorParts(params, ['c', 'i']);
      const rows = await call('fin_api_list_contracts', { p_limit: limit, p_after_created: cursor?.c ?? null, p_after_id: cursor?.i ?? null, p_status: status,
        p_entity: entity, p_ends_before: date('ends_before') });
      return send(res, 200, paginate(rows, limit, (row) => ({ c: row.created_at, i: row.id })), correlation);
    }
    if (resource === 'contracts' && id && !child && method === 'GET') {
      if (!optionalUuid(id)) throw new ApiError(404, 'not_found', 'Recurso não encontrado para esta credencial.');
      return send(res, 200, { data: await call('fin_api_get_contract', { p_id: id }) }, correlation);
    }
    if (resource === 'providers' && !id && method === 'GET') {
      const { params, limit } = filters(req, 'providers');
      const cursor = cursorParts(params, ['n', 'i']);
      const rows = await call('fin_api_list_providers', { p_limit: limit, p_after_name: cursor?.n ?? null, p_after_id: cursor?.i ?? null });
      return send(res, 200, paginate(rows, limit, (row) => ({ n: row.name, i: row.id })), correlation);
    }
    if (resource === 'portfolio' && id === 'facilities' && !child && method === 'GET') {
      const { params, limit, entity } = filters(req, 'facilities');
      const cursor = cursorParts(params, ['c', 'i']);
      const rows = await call('fin_api_list_facilities', { p_limit: limit, p_after_created: cursor?.c ?? null, p_after_id: cursor?.i ?? null, p_entity: entity });
      return send(res, 200, paginate(rows, limit, (row) => ({ c: row.created_at, i: row.id })), correlation);
    }
    if (resource === 'approvals' && !id && method === 'GET') {
      const { params, limit, status } = filters(req, 'approvals');
      const cursor = cursorParts(params, ['r', 'i']);
      const rows = await call('fin_api_list_approvals', { p_limit: limit, p_after_requested: cursor?.r ?? null, p_after_id: cursor?.i ?? null, p_status: status });
      return send(res, 200, paginate(rows, limit, (row) => ({ r: row.requested_at, i: row.id })), correlation);
    }

    if (resource === 'webhooks') {
      if (!id && method === 'GET') return send(res, 200, { data: await call('fin_api_list_webhooks', {}) }, correlation);
      if (!id && method === 'POST') {
        const body = await readBody(req, { maxBytes: 16 * 1024 });
        const events = Array.isArray(body.events) ? [...new Set(body.events)] : [];
        if (!validWebhookUrl(body.url) || !events.length || events.some((event) => !WEBHOOK_EVENTS.includes(event))) {
          throw new ApiError(422, 'invalid_webhook', 'Webhook inválido: URL https pública (porta 443, sem credencial) e eventos do catálogo.');
        }
        const entities = body.legal_entity_ids === undefined || body.legal_entity_ids === null ? null : body.legal_entity_ids;
        if (entities !== null && (!Array.isArray(entities) || !entities.length || entities.length > 50 || entities.some((value) => !optionalUuid(value)))) {
          throw new ApiError(422, 'invalid_webhook', 'legal_entity_ids deve ser uma lista de UUIDs.');
        }
        if (!webhookSecretsConfigured(env)) throw new ApiError(503, 'webhook_secrets_unconfigured', 'Webhooks indisponíveis: chave de cifragem não configurada no servidor.');
        const secret = generateWebhookSecret();
        const description = body.description === undefined ? null : String(body.description).slice(0, 300);
        const endpoint = await call('fin_api_create_webhook', { p_url: body.url, p_events: events, p_secret_ciphertext: encryptSecret(secret, env), p_description: description, p_entities: entities });
        // O segredo aparece só nesta resposta; depois, só a versão cifrada existe.
        return send(res, 201, { data: { id: endpoint, url: body.url, events, legal_entity_ids: entities, secret } }, correlation);
      }
      if (id && !child && method === 'DELETE') {
        if (!optionalUuid(id)) throw new ApiError(404, 'not_found', 'Recurso não encontrado para esta credencial.');
        await call('fin_api_disable_webhook', { p_endpoint: id });
        return send(res, 200, { data: { id, status: 'disabled' } }, correlation);
      }
      if (id && child === 'deliveries' && !childId && method === 'GET') {
        if (!optionalUuid(id)) throw new ApiError(404, 'not_found', 'Recurso não encontrado para esta credencial.');
        const { params, limit } = filters(req, 'deliveries');
        const cursor = cursorParts(params, ['c', 'i']);
        const rows = await call('fin_api_list_deliveries', { p_endpoint: id, p_limit: limit, p_after_created: cursor?.c ?? null, p_after_id: cursor?.i ?? null });
        return send(res, 200, paginate(rows, limit, (row) => ({ c: row.created_at, i: row.id })), correlation);
      }
      if (id && child === 'deliveries' && childId && action === 'replay' && method === 'POST') {
        if (!optionalUuid(id) || !optionalUuid(childId)) throw new ApiError(404, 'not_found', 'Recurso não encontrado para esta credencial.');
        const delivery = await call('fin_api_replay_delivery', { p_delivery: childId });
        return send(res, 202, { data: { id: delivery, replay_of: childId, status: 'pending' } }, correlation);
      }
    }
    throw new ApiError(404, 'route_not_found', 'Rota da API v1 não encontrada.');
  } catch (error) {
    let failure = error instanceof ApiError ? error : null;
    if (!failure && error?.status === 413) failure = new ApiError(413, 'payload_too_large', 'Corpo da requisição grande demais.');
    if (!failure && error?.code === 'invalid_json') failure = new ApiError(400, 'invalid_json', 'JSON inválido.');
    if (!failure && error?.code === 'invalid_json_shape') failure = new ApiError(400, 'invalid_json', 'O corpo JSON deve ser um objeto.');
    if (!failure && error?.code === 'rate_limit_exceeded') failure = new ApiError(429, 'rate_limited', 'Limite de requisições excedido. Tente de novo em instantes.', { 'Retry-After': '60' });
    if (!failure && error?.code === 'rate_limit_unavailable') failure = new ApiError(503, 'rate_limit_unavailable', 'Proteção contra abuso indisponível; tente novamente.');
    if (!failure) {
      // Nunca vaza mensagem do banco; registra só a classe do erro e a correlação.
      await reportError({ error, safeMessage: 'public api v1 internal error', service: 'arandu-api', route: `v1/${segments[0] || ''}`, requestId: correlation,
        status: 500, method: req.method }).catch(() => null);
      failure = new ApiError(500, 'internal_error', 'Erro interno. Informe o X-Correlation-Id ao suporte.');
    }
    const headers = {};
    const extra = { ...failure.extra };
    for (const key of ['WWW-Authenticate', 'Retry-After']) if (extra[key]) { headers[key] = extra[key]; delete extra[key]; }
    return send(res, failure.status, { error: { code: failure.code, message: failure.message, correlation_id: correlation, ...extra } }, correlation, headers);
  }
}

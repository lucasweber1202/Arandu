import { HttpError, json, readBody, clean, limited } from '../../api-core.mjs';
import { adminSupabaseRpc } from '../../supabase.mjs';
import { requireUuid, query, rest, rpc, memberOrganization } from './finance-core.mjs';
import { API_SCOPES, WEBHOOK_EVENTS, generateApiToken, generateWebhookSecret, encryptSecret, webhookSecretsConfigured, validWebhookUrl } from '../../finance/public-api.mjs';
import { dispatchWebhooks } from '../../finance/webhook-dispatch.mjs';

// Integrações (Public API v1 & Webhooks) na interface: só admin da compradora.
//
// O token da conta de serviço e o segredo do webhook são gerados AQUI e
// devolvidos uma única vez; o banco recebe só o hash (token) ou a versão
// cifrada (segredo). Toda escrita é RPC com o JWT do admin (RLS + papel no
// banco). A única chamada com service role é "enviar pendentes agora", que
// roda o worker filtrado pela organização depois de o banco confirmar, com o
// JWT da pessoa, que ela é admin dela.

const ACCOUNT_COLUMNS = 'id,name,description,scopes,entity_scope,status,created_by,created_at,updated_at,revoked_at,last_used_at';
const CREDENTIAL_COLUMNS = 'id,service_account_id,token_prefix,created_by,created_at,expires_at,revoked_at,revoked_by,last_used_at';
const ENDPOINT_COLUMNS = 'id,url,description,events,entity_ids,status,consecutive_failures,created_by_user,created_by_service_account,created_at,updated_at,disabled_at,disabled_reason';
const DELIVERY_COLUMNS = 'id,endpoint_id,event_id,status,attempts,next_attempt_at,last_attempt_at,last_status_code,last_error_code,delivered_at,replay_of,created_at';

async function requireAdmin(token, organizationId, session) {
  const organization = await memberOrganization(token, organizationId, ['BUYER']);
  const rows = await rest(token, `fin_members?select=role&organization_id=eq.${organization.id}&user_id=eq.${requireUuid(session.user.id, 'user_id')}&limit=1`);
  if (rows?.[0]?.role !== 'admin') throw new HttpError(403, 'Integrações são administradas por quem tem papel de administração.', 'forbidden');
  return organization;
}

function scopeList(value) {
  const scopes = Array.isArray(value) ? [...new Set(value.map(String))] : [];
  if (!scopes.length || scopes.some((scope) => !API_SCOPES.includes(scope))) throw new HttpError(400, 'Escolha escopos do catálogo da API.', 'invalid_service_account');
  return scopes;
}

function entityList(scope, value) {
  if (!['group', 'entities'].includes(scope)) throw new HttpError(400, 'Escopo de entidade inválido.', 'invalid_service_account');
  if (scope === 'group') return [];
  const list = Array.isArray(value) ? [...new Set(value)] : [];
  if (!list.length || list.length > 50) throw new HttpError(400, 'Escopo restrito exige ao menos uma entidade.', 'invalid_service_account');
  return list.map((id) => requireUuid(id, 'entity_id'));
}

/** @returns {Promise<boolean>} true quando a rota foi tratada aqui. */
export async function handleFinanceIntegrations(req, res, { resource, sub, token, session, headers, adminRpc = adminSupabaseRpc, env = process.env }) {
  if (resource === 'service-accounts' && !sub && req.method === 'GET') {
    const organization = await requireAdmin(token, query(req).get('organization_id'), session);
    const [accounts, credentials, grants] = await Promise.all([
      rest(token, `fin_service_accounts?select=${ACCOUNT_COLUMNS}&organization_id=eq.${organization.id}&order=created_at.desc&limit=100`),
      rest(token, `fin_api_credentials?select=${CREDENTIAL_COLUMNS}&organization_id=eq.${organization.id}&order=created_at.desc&limit=400`),
      rest(token, `fin_service_account_entities?select=service_account_id,entity_id&organization_id=eq.${organization.id}&limit=2000`)
    ]);
    json(res, 200, { ok: true, scopes: API_SCOPES, rows: (accounts || []).map((account) => ({
      ...account,
      entity_ids: (grants || []).filter((grant) => grant.service_account_id === account.id).map((grant) => grant.entity_id),
      credentials: (credentials || []).filter((credential) => credential.service_account_id === account.id)
    })) }, headers);
    return true;
  }

  if (resource === 'service-accounts' && !sub && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await requireAdmin(token, body.organization_id, session);
    const name = limited(body.name, 120);
    if (!name || name.length < 2 || /[<>]/.test(name)) throw new HttpError(400, 'Dê um nome à conta de serviço (2 a 120 caracteres, sem HTML).', 'invalid_service_account');
    const scope = clean(body.entity_scope) || 'group';
    const id = await rpc(token, 'fin_create_service_account', {
      p_org: organization.id, p_name: name, p_description: body.description ? limited(body.description, 500) : null,
      p_scopes: scopeList(body.scopes), p_entity_scope: scope, p_entities: entityList(scope, body.entity_ids)
    });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }

  if (resource === 'service-accounts' && sub === 'update' && req.method === 'POST') {
    const body = await readBody(req);
    const scope = clean(body.entity_scope) || 'group';
    const status = clean(body.status) || 'active';
    if (!['active', 'disabled'].includes(status)) throw new HttpError(400, 'Estado inválido.', 'invalid_service_account');
    await rpc(token, 'fin_update_service_account', { p_account: requireUuid(body.service_account_id, 'service_account_id'), p_scopes: scopeList(body.scopes),
      p_entity_scope: scope, p_entities: entityList(scope, body.entity_ids), p_status: status });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  if (resource === 'service-accounts' && sub === 'revoke' && req.method === 'POST') {
    const body = await readBody(req);
    await rpc(token, 'fin_revoke_service_account', { p_account: requireUuid(body.service_account_id, 'service_account_id') });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  // Emite token: gerado aqui, hash para o banco, token na resposta (uma vez).
  if (resource === 'service-accounts' && sub === 'credentials' && req.method === 'POST') {
    const body = await readBody(req);
    const days = Number(body.expires_in_days ?? 90);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new HttpError(400, 'Validade entre 1 e 365 dias.', 'invalid_credential');
    const issued = generateApiToken(env);
    const id = await rpc(token, 'fin_issue_api_credential', { p_account: requireUuid(body.service_account_id, 'service_account_id'), p_token_hash: issued.hash,
      p_token_prefix: issued.prefix, p_expires_at: new Date(Date.now() + days * 86400000).toISOString() });
    json(res, 201, { ok: true, id, token: issued.token, prefix: issued.prefix, notice: 'Copie agora: o token não será mostrado de novo.' }, { ...headers, 'Cache-Control': 'no-store' });
    return true;
  }

  if (resource === 'service-accounts' && sub === 'credentials-revoke' && req.method === 'POST') {
    const body = await readBody(req);
    await rpc(token, 'fin_revoke_api_credential', { p_credential: requireUuid(body.credential_id, 'credential_id') });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  // ------------------------------------------------------------ webhooks
  if (resource === 'webhooks' && !sub && req.method === 'GET') {
    const organization = await requireAdmin(token, query(req).get('organization_id'), session);
    const [endpoints, deliveries] = await Promise.all([
      rest(token, `fin_webhook_endpoints?select=${ENDPOINT_COLUMNS}&organization_id=eq.${organization.id}&order=created_at.desc&limit=50`),
      rest(token, `fin_webhook_deliveries?select=${DELIVERY_COLUMNS}&organization_id=eq.${organization.id}&order=created_at.desc&limit=200`)
    ]);
    json(res, 200, { ok: true, events: WEBHOOK_EVENTS, secrets_configured: webhookSecretsConfigured(env), rows: (endpoints || []).map((endpoint) => ({
      ...endpoint, deliveries: (deliveries || []).filter((delivery) => delivery.endpoint_id === endpoint.id).slice(0, 25)
    })) }, headers);
    return true;
  }

  if (resource === 'webhooks' && !sub && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await requireAdmin(token, body.organization_id, session);
    const events = Array.isArray(body.events) ? [...new Set(body.events)] : [];
    if (!validWebhookUrl(body.url) || !events.length || events.some((event) => !WEBHOOK_EVENTS.includes(event))) {
      throw new HttpError(400, 'Webhook inválido: use uma URL https pública (porta 443, sem usuário/senha) e eventos do catálogo.', 'invalid_webhook');
    }
    if (!webhookSecretsConfigured(env)) throw new HttpError(503, 'Webhooks indisponíveis: a chave de cifragem dos segredos não está configurada neste ambiente.', 'webhook_secrets_unconfigured');
    const entities = Array.isArray(body.entity_ids) && body.entity_ids.length ? body.entity_ids.map((id) => requireUuid(id, 'entity_id')) : null;
    const secret = generateWebhookSecret();
    const id = await rpc(token, 'fin_create_webhook_endpoint', { p_org: organization.id, p_url: body.url, p_events: events, p_secret_ciphertext: encryptSecret(secret, env),
      p_description: body.description ? limited(body.description, 300) : null, p_entities: entities });
    json(res, 201, { ok: true, id, secret, notice: 'Copie agora: o segredo de assinatura não será mostrado de novo.' }, { ...headers, 'Cache-Control': 'no-store' });
    return true;
  }

  if (resource === 'webhooks' && sub === 'status' && req.method === 'POST') {
    const body = await readBody(req);
    if (typeof body.active !== 'boolean') throw new HttpError(400, 'Informe se o webhook fica ativo.', 'invalid_webhook');
    await rpc(token, 'fin_set_webhook_status', { p_endpoint: requireUuid(body.endpoint_id, 'endpoint_id'), p_active: body.active });
    json(res, 200, { ok: true }, headers);
    return true;
  }

  if (resource === 'webhooks' && sub === 'replay' && req.method === 'POST') {
    const body = await readBody(req);
    const id = await rpc(token, 'fin_replay_webhook_delivery', { p_delivery: requireUuid(body.delivery_id, 'delivery_id') });
    json(res, 201, { ok: true, id }, headers);
    return true;
  }

  if (resource === 'webhooks' && sub === 'dispatch' && req.method === 'POST') {
    const body = await readBody(req);
    const organization = await requireAdmin(token, body.organization_id, session);
    if (!webhookSecretsConfigured(env)) throw new HttpError(503, 'Webhooks indisponíveis: a chave de cifragem dos segredos não está configurada neste ambiente.', 'webhook_secrets_unconfigured');
    const totals = await dispatchWebhooks({ rpc: adminRpc, env, limit: 10, organizationId: organization.id, budgetMs: 20000 });
    json(res, 200, { ok: true, ...totals }, headers);
    return true;
  }
  return false;
}

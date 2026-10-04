// Entrega de webhooks (docs/FINANCIAL_PUBLIC_API.md#webhooks).
//
// O banco reivindica entregas vencidas com lease (fin_webhook_claim) e só aceita
// a conclusão de quem tem o lease atual (fin_webhook_complete), que calcula
// backoff, dead-letter e desativação automática. Aqui: resolver o host e
// recusar endereço interno (SSRF), decifrar o segredo, assinar, enviar com
// timeout, sem seguir redirecionamento, e reportar só um código curto — nunca
// corpo de resposta, segredo ou mensagem crua.
import { lookup as dnsLookup } from 'node:dns/promises';
import { decryptSecret, isBlockedAddress, signWebhook, validWebhookUrl } from './public-api.mjs';

export const DELIVERY_TIMEOUT_MS = 10000;

function payloadBody(row, attempt) {
  return JSON.stringify({
    id: row.event_id,
    type: row.event_type,
    api_version: 'v1',
    created_at: row.occurred_at,
    organization_id: row.organization_id,
    legal_entity_id: row.legal_entity_id ?? null,
    ...(row.payload || {}),
    delivery: { id: row.delivery_id, attempt }
  });
}

async function resolveSafely(url, lookup) {
  const { hostname } = new URL(url);
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!Array.isArray(addresses) || !addresses.length) return 'dns_failed';
  return addresses.some((entry) => isBlockedAddress(entry.address)) ? 'ssrf_blocked' : null;
}

/**
 * @param {{ rpc: Function, fetchImpl?: Function, lookup?: Function, env?: object, now?: () => number, limit?: number, organizationId?: string|null, budgetMs?: number }} deps
 * @returns {Promise<{claimed: number, succeeded: number, failed: number, dead: number}>}
 */
export async function dispatchWebhooks({ rpc, fetchImpl = fetch, lookup = dnsLookup, env = process.env, now = () => Date.now(), limit = 20, organizationId = null, budgetMs = 50000 }) {
  const started = now();
  const rows = (await rpc('fin_webhook_claim', { p_limit: limit, p_lease_seconds: 60, p_org: organizationId })) || [];
  const totals = { claimed: rows.length, succeeded: 0, failed: 0, dead: 0 };
  for (const row of rows) {
    let success = false; let status = null; let code = null;
    if (now() - started > budgetMs) {
      code = 'budget_exhausted';
    } else if (!validWebhookUrl(row.url)) {
      code = 'invalid_url';
    } else {
      try {
        code = await resolveSafely(row.url, lookup);
      } catch {
        code = 'dns_failed';
      }
    }
    if (!code) {
      let secret = null;
      try { secret = decryptSecret(row.secret_ciphertext, env); } catch { code = 'secret_unavailable'; }
      if (secret) {
        const body = payloadBody(row, row.attempt);
        const timestamp = Math.floor(now() / 1000);
        try {
          const response = await fetchImpl(row.url, {
            method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS), body,
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Arandu-Webhooks/1', 'Arandu-Event-Type': row.event_type,
              'Arandu-Delivery-Id': row.delivery_id, 'Arandu-Timestamp': String(timestamp),
              'Arandu-Signature': signWebhook(secret, { timestamp, deliveryId: row.delivery_id, body }) }
          });
          status = response.status;
          success = status >= 200 && status < 300;
          if (!success) code = status >= 300 && status < 400 ? 'http_3xx' : status < 500 ? 'http_4xx' : 'http_5xx';
          await response.body?.cancel?.().catch(() => null);
        } catch (error) {
          code = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : 'network_error';
        }
      }
    }
    const outcome = await rpc('fin_webhook_complete', { p_delivery: row.delivery_id, p_lease: row.lease_token, p_success: success, p_status_code: status, p_error_code: code })
      .catch(() => 'stale');
    if (outcome === 'succeeded') totals.succeeded += 1;
    else if (outcome === 'dead') totals.dead += 1;
    else totals.failed += 1;
  }
  return totals;
}

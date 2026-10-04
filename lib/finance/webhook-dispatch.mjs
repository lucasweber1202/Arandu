// Entregas são at-least-once: o receptor deve deduplicar pelo delivery ID.
// DNS validado é fixado na conexão TLS; hostname e SNI permanecem originais.
import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { decryptSecret, isBlockedAddress, signWebhook, validWebhookUrl } from './public-api.mjs';
import { withDeadline, invalidResponse } from './operational-resilience.mjs';

export const DELIVERY_TIMEOUT_MS = 10000;
export const DNS_TIMEOUT_MS = 2000;

export function pinnedWebhookRequest(url, init, addresses, request = httpsRequest) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = request(target, {
      method: 'POST', headers: init.headers, signal: init.signal,
      // O socket nunca faz uma segunda resolução DNS. Não reutilizar conexão
      // estabelecida antes desta validação e não seguir redirect.
      agent: false,
      lookup(_hostname, options, callback) {
        const candidates = options.family ? addresses.filter(row => row.family === options.family) : addresses;
        if (!candidates.length) return callback(Object.assign(new Error('DNS indisponível.'), { code: 'ENOTFOUND' }));
        if (options.all) callback(null, candidates);
        else callback(null, candidates[0].address, candidates[0].family);
      }
    }, response => {
      const status = response.statusCode;
      response.destroy(); // conteúdo externo não é necessário, lido ou logado
      resolve({ status });
    });
    req.once('error', reject);
    req.end(init.body);
  });
}

function payloadBody(row) {
  return JSON.stringify({ id: row.event_id, type: row.event_type, api_version: 'v1', created_at: row.occurred_at,
    organization_id: row.organization_id, legal_entity_id: row.legal_entity_id ?? null, ...(row.payload || {}),
    delivery: { id: row.delivery_id, attempt: row.attempt } });
}

export async function dispatchWebhooks({ rpc, fetchImpl, lookup = dnsLookup, env = process.env, now = () => Date.now(), limit = 20, organizationId = null, budgetMs = 50000 }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isFinite(budgetMs) || budgetMs < 1 || budgetMs > 50000) throw invalidResponse();
  const started = now();
  const rows = await withDeadline(signal => rpc('fin_webhook_claim', { p_limit: limit, p_lease_seconds: 60, p_org: organizationId }, { signal }), 8000);
  if (!Array.isArray(rows) || rows.length > limit) throw invalidResponse();
  const totals = { claimed: rows.length, succeeded: 0, failed: 0, dead: 0, completion_failed: 0, deferred: 0 };
  for (const row of rows) {
    // As entregas restantes permanecem em lease e voltam à fila ao expirar.
    // Não gastar o tempo de cron tentando completar cada item sem orçamento.
    if (now() - started >= budgetMs) { totals.deferred += rows.length - totals.succeeded - totals.failed - totals.dead - totals.completion_failed; break; }
    let success = false; let status = null; let code = null; let addresses;
    if (!validWebhookUrl(row.url)) code = 'invalid_url';
    else {
      try {
        addresses = await withDeadline(() => lookup(new URL(row.url).hostname, { all: true, verbatim: true }), Math.min(DNS_TIMEOUT_MS, budgetMs - (now() - started)));
        if (!Array.isArray(addresses) || !addresses.length || addresses.some(entry => ![4, 6].includes(entry.family))) code = 'dns_failed';
        else if (addresses.some(entry => isBlockedAddress(entry.address))) code = 'ssrf_blocked';
      } catch (error) { code = error?.name === 'TimeoutError' ? 'dns_timeout' : 'dns_failed'; }
    }
    if (!code) {
      let secret;
      try { secret = decryptSecret(row.secret_ciphertext, env); } catch { code = 'secret_unavailable'; }
      if (secret) {
        const body = payloadBody(row);
        const timestamp = Math.floor(now() / 1000);
        const remaining = budgetMs - (now() - started);
        if (remaining <= 0) code = 'budget_exhausted';
        else try {
          const response = await withDeadline(signal => (fetchImpl || pinnedWebhookRequest)(row.url, {
            method: 'POST', redirect: 'manual', signal, body,
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'Arandu-Webhooks/1', 'Arandu-Event-Type': row.event_type,
              'Arandu-Delivery-Id': row.delivery_id, 'Arandu-Timestamp': String(timestamp),
              'Arandu-Signature': signWebhook(secret, { timestamp, deliveryId: row.delivery_id, body }) }
          }, addresses), Math.min(DELIVERY_TIMEOUT_MS, remaining));
          if (!Number.isInteger(response?.status) || response.status < 100 || response.status > 599) throw invalidResponse();
          status = response.status;
          success = status >= 200 && status < 300;
          if (!success) code = status >= 300 && status < 400 ? 'http_3xx' : status < 500 ? 'http_4xx' : 'http_5xx';
          // Nenhum corpo é consumido; cancelamento não participa da transação.
          try { Promise.resolve(response.body?.cancel?.()).catch(() => {}); } catch { /* corpo não participa da entrega */ }
        } catch (error) {
          code = error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 'timeout' : error?.code === 'invalid_response' ? 'invalid_response' : 'network_error';
        }
      }
    }
    try {
      const outcome = await withDeadline(signal => rpc('fin_webhook_complete', { p_delivery: row.delivery_id, p_lease: row.lease_token, p_success: success, p_status_code: status, p_error_code: code }, { signal }), Math.min(8000, Math.max(1, budgetMs - (now() - started))));
      if (outcome === 'succeeded') totals.succeeded += 1;
      else if (outcome === 'dead') totals.dead += 1;
      else if (outcome === 'failed') totals.failed += 1;
      else throw invalidResponse();
    } catch { totals.completion_failed += 1; }
  }
  return totals;
}

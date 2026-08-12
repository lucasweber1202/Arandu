import { randomUUID } from 'node:crypto';
import { inspectEmailConfiguration, sendTransactionalEmail } from './email.mjs';
import { reportError } from './observability.mjs';
import { adminSupabaseRpc } from './supabase.mjs';

function clean(value, max = 500) {
  return String(value ?? '').replace(/[\r\n\t]/g, ' ').trim().slice(0, max);
}

function normalizeClaimed(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    if (value.length === 1 && Array.isArray(value[0])) return value[0];
    return value;
  }
  if (Array.isArray(value.items)) return value.items;
  return [];
}

function retrySeconds(attempt) {
  const exponent = Math.max(0, Math.min(Number(attempt || 1) - 1, 10));
  return Math.min(86400, 30 * (2 ** exponent));
}

export async function dispatchTransactionalOutbox({
  limit = 10,
  workerRef = `worker-${randomUUID()}`,
  send = sendTransactionalEmail
} = {}) {
  const config = inspectEmailConfiguration();
  if (config.provider === 'disabled' || config.provider === 'mock') {
    return { processed: 0, delivered: 0, retried: 0, dead: 0, reason: config.provider };
  }
  if (!config.ready) {
    return { processed: 0, delivered: 0, retried: 0, dead: 0, reason: 'unconfigured', problems: config.problems };
  }

  const claimedRaw = await adminSupabaseRpc('claim_transactional_email_batch', {
    p_worker_ref: clean(workerRef, 120),
    p_limit: Math.max(1, Math.min(Number(limit) || 10, 50))
  });
  const items = normalizeClaimed(claimedRaw);
  let delivered = 0;
  let retried = 0;
  let dead = 0;

  for (const item of items) {
    const requestId = clean(item?.requestId, 80) || randomUUID();
    try {
      const result = await send({
        template: item.template,
        to: item.recipientAddress,
        data: item.payload || {}
      });
      if (result.delivered) {
        await adminSupabaseRpc('complete_transactional_email', {
          p_id: item.id,
          p_provider: result.event?.provider || config.provider,
          p_provider_reference: result.providerReference || null
        });
        delivered += 1;
        continue;
      }

      const failed = await adminSupabaseRpc('fail_transactional_email', {
        p_id: item.id,
        p_error_code: clean(result.reason || 'delivery_failed', 120),
        p_retry_after_seconds: retrySeconds(item.attempts)
      });
      const status = Array.isArray(failed) ? failed[0]?.status : failed?.status;
      if (status === 'dead') dead += 1;
      else retried += 1;
    } catch (error) {
      const failed = await adminSupabaseRpc('fail_transactional_email', {
        p_id: item.id,
        p_error_code: clean(error?.code || error?.name || 'dispatcher_error', 120),
        p_retry_after_seconds: retrySeconds(item.attempts)
      }).catch(() => null);
      const status = Array.isArray(failed) ? failed[0]?.status : failed?.status;
      if (status === 'dead') dead += 1;
      else retried += 1;
      await reportError({
        service: 'arandu-email-outbox',
        requestId,
        route: 'transactional-email-dispatch',
        status: 503,
        code: clean(error?.code || 'dispatcher_error', 120),
        error
      });
    }
  }

  return { processed: items.length, delivered, retried, dead, reason: null };
}

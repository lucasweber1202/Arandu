import { randomUUID } from 'node:crypto';
import { inspectEmailConfiguration, sendTransactionalEmail } from './email.mjs';
import { reportError } from './observability.mjs';
import { adminSupabaseRpc } from './supabase.mjs';
import { inviteLink, notificationLink } from './finance/email-templates.mjs';
import { deploymentBaseUrl } from '../scripts/seo-meta.mjs';

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
  const base = Math.min(86400, 30 * (2 ** exponent));
  const jitter = Math.round(base * (0.15 + Math.random() * 0.2));
  return Math.min(86400, base + jitter);
}

export async function prepareFinancialEmail(item, {
  resolveInviteToken = (ref) => adminSupabaseRpc('fin_resolve_provider_invite_token', { p_invite: ref }),
  baseUrl = deploymentBaseUrl()
} = {}) {
  if (item.template === 'finance_notification') {
    if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error('notification_base_url_unavailable');
    const payload = item.payload || {};
    return { kind: String(payload.kind || ''), link: notificationLink(baseUrl, payload.path) };
  }
  if (item.template !== 'finance_provider_invite') return item.payload || {};
  const payload = item.payload || {};
  const inviteRef = String(payload.invite_ref || '');
  if (!/^[a-f0-9-]{36}$/i.test(inviteRef)) throw new Error('invalid_invite_ref');
  if (!baseUrl || !/^https:\/\//.test(baseUrl)) throw new Error('invite_base_url_unavailable');
  const token = await resolveInviteToken(inviteRef);
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) throw new Error('invite_token_unavailable');
  return { ...payload, link: inviteLink(baseUrl, token) };
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

  const claimedRaw = await adminSupabaseRpc('claim_transactional_email_batch_v2', {
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
      const payload = await prepareFinancialEmail(item);
      const result = await send({
        template: item.template,
        to: item.recipientAddress,
        data: payload,
        idempotencyKey: clean(item.idempotencyKey, 256)
      });
      if (result.delivered) {
        await adminSupabaseRpc('complete_transactional_email_v2', {
          p_id: item.id,
          p_claim_token: item.claimToken,
          p_provider: result.event?.provider || config.provider,
          p_provider_reference: result.providerReference || null
        });
        delivered += 1;
        continue;
      }

      const failed = await adminSupabaseRpc('fail_transactional_email_v2', {
        p_id: item.id,
        p_claim_token: item.claimToken,
        p_error_code: clean(result.reason || 'delivery_failed', 120),
        p_retry_after_seconds: retrySeconds(item.attempts)
      });
      const status = Array.isArray(failed) ? failed[0]?.status : failed?.status;
      if (status === 'dead') dead += 1;
      else retried += 1;
    } catch (error) {
      const failed = await adminSupabaseRpc('fail_transactional_email_v2', {
        p_id: item.id,
        p_claim_token: item.claimToken,
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

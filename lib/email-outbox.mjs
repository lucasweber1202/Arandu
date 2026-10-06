import { withDeadline, safeFailure, invalidResponse } from './finance/operational-resilience.mjs';
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
  limit = 10, workerRef = `worker-${randomUUID()}`, send = sendTransactionalEmail,
  rpc = adminSupabaseRpc, config = inspectEmailConfiguration(), now = () => Date.now(), budgetMs = 45000,
  prepare = prepareFinancialEmail
} = {}) {
  if (config.provider === 'disabled' || config.provider === 'mock') return { processed: 0, delivered: 0, retried: 0, dead: 0, completion_failed: 0, deferred: 0, reason: config.provider };
  if (!config.ready) return { processed: 0, delivered: 0, retried: 0, dead: 0, completion_failed: 0, deferred: 0, reason: 'unconfigured' };
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isFinite(budgetMs) || budgetMs < 1 || budgetMs > 45000) throw invalidResponse();
  const started = now();
  const call = (name,args) => withDeadline(signal => rpc(name,args,{signal}),Math.min(8000,Math.max(1,budgetMs-(now()-started))));
  const raw = await call('claim_transactional_email_batch_v2',{p_worker_ref:clean(workerRef,120),p_limit:limit});
  if (!Array.isArray(raw)) throw invalidResponse();
  const items = normalizeClaimed(raw);
  if(items.length > limit) throw invalidResponse();
  const totals={processed:items.length,delivered:0,retried:0,dead:0,completion_failed:0,deferred:0,reason:null};
  for(let i=0;i<items.length;i++) {
    const item=items[i];
    if(now()-started >= budgetMs) {totals.deferred=items.length-i;break;}
    let code;
    try {
      const payload=await withDeadline(()=>prepare(item,{resolveInviteToken:ref=>call('fin_resolve_provider_invite_token',{p_invite:ref})}),Math.min(8000,Math.max(1,budgetMs-(now()-started))));
      const result=await withDeadline(()=>send({template:item.template,to:item.recipientAddress,data:payload,idempotencyKey:clean(item.idempotencyKey,256)}),Math.min(4000,Math.max(1,budgetMs-(now()-started))));
      if(typeof result?.delivered !== 'boolean') throw invalidResponse();
      if(result.delivered) {
        const done=await call('complete_transactional_email_v2',{p_id:item.id,p_claim_token:item.claimToken,p_provider:result.event?.provider||config.provider,p_provider_reference:result.providerReference||null});
        if(done?.ok !== true || done.status !== 'delivered') throw invalidResponse();
        totals.delivered++;continue;
      }
      code=/^http_[1-5][0-9]{2}$/.test(result.reason||'')?result.reason:['timeout','network_error','unconfigured','disabled','invalid_response'].includes(result.reason)?result.reason:'delivery_failed';
    } catch(error) {code=safeFailure(error,'dispatcher_error');}
    try {
      const failed=await call('fail_transactional_email_v2',{p_id:item.id,p_claim_token:item.claimToken,p_error_code:code,p_retry_after_seconds:retrySeconds(item.attempts)});
      if(failed?.ok !== true || !['dead','retry'].includes(failed.status)) throw invalidResponse();
      if(failed.status==='dead') totals.dead++;else totals.retried++;
    } catch {totals.completion_failed++;}
    await reportError({service:'arandu-email-outbox',requestId:clean(item?.requestId,80)||randomUUID(),route:'transactional-email-dispatch',status:503,code});
  }
  return totals;
}

-- Rollback do fencing v2. Use apenas em resposta controlada; reativa a API v1.
revoke all on function public.claim_transactional_email_batch_v2(text,integer) from service_role;
revoke all on function public.complete_transactional_email_v2(uuid,uuid,text,text) from service_role;
revoke all on function public.fail_transactional_email_v2(uuid,uuid,text,integer) from service_role;
drop function if exists public.claim_transactional_email_batch_v2(text,integer);
drop function if exists public.complete_transactional_email_v2(uuid,uuid,text,text);
drop function if exists public.fail_transactional_email_v2(uuid,uuid,text,integer);
grant execute on function public.claim_transactional_email_batch(text,integer) to service_role;
grant execute on function public.complete_transactional_email(uuid,text,text) to service_role;
grant execute on function public.fail_transactional_email(uuid,text,integer) to service_role;
drop index if exists public.idx_transactional_email_outbox_lease;
alter table public.transactional_email_outbox
  drop column if exists lease_expires_at,
  drop column if exists claim_token,
  drop column if exists worker_ref;

-- Rollback must not reopen the unversioned decision vulnerability.
-- Application rollback remains compatible with v2; retain this security patch.
-- Only the additive buyer-name RPC is removed. Retain the live-vote guard too;
-- reopening authorization races requires a separate reviewed security decision.
begin;
drop function if exists public.fin_assignment_buyer_names(uuid, uuid[]);
revoke all on function public.fin_record_decision(uuid, uuid, jsonb, text)
  from public, anon, authenticated, service_role;
insert into public.fin_settings(key,value) values('schema_version', 'financial-task-accountability-1')
on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

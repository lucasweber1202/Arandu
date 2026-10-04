-- Reverte docs/supabase-financial-public-api.sql.
-- Contas de serviço, credenciais, endpoints e entregas são trilha de integração
-- do cliente: o rollback ABORTA se existir qualquer uma delas. Revogue as
-- credenciais, exporte a trilha e faça backup antes; em produção prefira
-- forward-fix (revogar contas e desativar webhooks), que derruba o acesso sem
-- apagar histórico (docs/FINANCIAL_PUBLIC_API.md, seção Rollback).
do $$
begin
  if exists (select 1 from public.fin_service_accounts) or exists (select 1 from public.fin_webhook_endpoints)
     or exists (select 1 from public.fin_webhook_events) or exists (select 1 from public.fin_api_idempotency) then
    raise exception 'rollback abortado: existe trilha da Public API/Webhooks; revogue, exporte e trate antes';
  end if;
end $$;

drop trigger if exists fin_webhook_capture on public.fin_events;
drop function if exists public.fin_webhook_capture();
drop function if exists public.fin_api_purge_idempotency();
drop function if exists public.fin_webhook_complete(uuid, uuid, boolean, integer, text);
drop function if exists public.fin_webhook_claim(integer, integer, uuid);
drop function if exists public.fin_api_replay_delivery(text, uuid);
drop function if exists public.fin_api_list_deliveries(text, uuid, integer, timestamptz, uuid);
drop function if exists public.fin_api_disable_webhook(text, uuid);
drop function if exists public.fin_api_create_webhook(text, text, text[], text, text, uuid[]);
drop function if exists public.fin_api_list_webhooks(text);
drop function if exists public.fin_api_create_rfq(text, text, text, jsonb, text);
drop function if exists public.fin_api_list_approvals(text, integer, timestamptz, uuid, text);
drop function if exists public.fin_api_list_facilities(text, integer, timestamptz, uuid, uuid);
drop function if exists public.fin_api_list_providers(text, integer, text, uuid);
drop function if exists public.fin_api_get_contract(text, uuid);
drop function if exists public.fin_api_list_contracts(text, integer, timestamptz, uuid, text, uuid, date);
drop function if exists public.fin_api_get_rfq(text, uuid);
drop function if exists public.fin_api_list_rfqs(text, integer, timestamptz, uuid, text, uuid, timestamptz);
drop function if exists public.fin_api_whoami(text);
drop function if exists public.fin_api_entity_allowed(jsonb, uuid);
drop function if exists public.fin_api_context(text, text);
drop function if exists public.fin_replay_webhook_delivery(uuid);
drop function if exists public.fin_set_webhook_status(uuid, boolean);
drop function if exists public.fin_create_webhook_endpoint(uuid, text, text[], text, text, uuid[]);
drop function if exists public.fin_revoke_api_credential(uuid);
drop function if exists public.fin_issue_api_credential(uuid, text, text, timestamptz);
drop function if exists public.fin_revoke_service_account(uuid);
drop function if exists public.fin_update_service_account(uuid, text[], text, uuid[], text);
drop function if exists public.fin_create_service_account(uuid, text, text, text[], text, uuid[]);
drop table if exists public.fin_webhook_deliveries;
drop table if exists public.fin_webhook_events;
drop table if exists public.fin_webhook_endpoints;
drop table if exists public.fin_api_idempotency;
drop table if exists public.fin_api_credentials;
drop table if exists public.fin_service_account_entities;
drop table if exists public.fin_service_accounts;
drop function if exists public.fin_valid_webhook_url(text);
drop function if exists public.fin_api_valid_entities(uuid, text, uuid[]);
drop function if exists public.fin_webhook_event_catalog();
drop function if exists public.fin_api_scope_catalog();

-- Telemetria do job removido: não é registro de negócio.
delete from public.fin_job_runs where job = 'webhooks';
alter table public.fin_job_runs drop constraint if exists fin_job_runs_job_check;
alter table public.fin_job_runs add constraint fin_job_runs_job_check check (job in ('renewals','contract_milestones','approval_deadlines'));

insert into public.fin_settings (key, value) values ('schema_version', 'financial-policy-engine-1')
on conflict (key) do update set value = excluded.value, updated_at = now();

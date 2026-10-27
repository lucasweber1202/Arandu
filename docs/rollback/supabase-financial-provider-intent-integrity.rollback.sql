begin;
do $$ begin
 if (select value from public.fin_settings where key='schema_version') is distinct from 'financial-provider-intent-integrity-1' then raise exception 'rollback order: provider intent must be latest'; end if;
 if exists(select 1 from public.fin_providers where creation_request_key is not null) then raise exception 'provider receipt data exists: use forward-fix'; end if;
end $$;
drop trigger if exists fin_provider_creation_receipt on public.fin_providers;
drop function if exists public.fin_provider_receipt_guard();
drop function if exists public.fin_provider_creation_result(uuid,uuid);
drop function if exists public.fin_create_provider_intent(uuid,uuid,jsonb);
drop function if exists public.fin_provider_intent_actor(uuid,boolean);
alter table public.fin_providers drop constraint if exists fin_providers_creation_receipt;
drop index if exists public.fin_providers_creation_intent;
alter table public.fin_providers drop column if exists creation_request_key;
alter table public.fin_providers drop column if exists creation_request_hash;
update public.fin_settings set value=(select value from public.fin_settings where key='provider_intent_previous_marker'),updated_at=now() where key='schema_version';
delete from public.fin_settings where key='provider_intent_previous_marker';
notify pgrst,'reload schema';
commit;

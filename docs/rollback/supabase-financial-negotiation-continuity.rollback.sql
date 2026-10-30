-- Retain versioned events. Removing this projection never deletes evidence.
begin;
do $$ begin
 if (select value from public.fin_settings where key='schema_version') is distinct from 'financial-negotiation-continuity-1' then raise exception 'rollback order: negotiation continuity must be latest'; end if;
end $$;
drop function if exists public.fin_complete_opportunity_negotiation(uuid,text,uuid,boolean,text);
drop trigger if exists fin_contract_rfq_origin on public.fin_events;
drop function if exists public.fin_stamp_contract_rfq_origin();
drop index if exists public.fin_contract_rfq_origin_lookup;
update public.fin_settings set value='financial-provider-intent-integrity-1',updated_at=now() where key='schema_version';
notify pgrst,'reload schema';
commit;

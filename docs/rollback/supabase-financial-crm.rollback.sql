-- Withdraw new mutation entry point; retain all contacts, CRM data, RLS,
-- export datasets and events. Old clients remain compatible. No data reversal.
begin;
revoke execute on function public.fin_crm_command(uuid,text,uuid,integer,uuid,jsonb,jsonb) from authenticated;
update public.fin_settings set value=(select value from public.fin_settings where key='crm_previous_marker'),updated_at=now() where key='schema_version';
notify pgrst,'reload schema';
commit;

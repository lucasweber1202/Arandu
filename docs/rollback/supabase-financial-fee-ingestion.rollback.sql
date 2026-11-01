-- Withdraw ingestion and ERP configuration commands. Preserve observations,
-- variance reconciliation, configuration history and all command receipts.
begin;
revoke execute on function public.fin_configure_fee_integration(uuid,uuid,uuid,integer,uuid,jsonb,text) from authenticated;
revoke execute on function public.fin_import_fee_batch(uuid,uuid,uuid,text,text,jsonb,boolean,jsonb) from authenticated;
update public.fin_settings set value=(select value from public.fin_settings where key='fee_ingestion_previous_marker'),updated_at=now() where key='schema_version';
notify pgrst,'reload schema';
commit;

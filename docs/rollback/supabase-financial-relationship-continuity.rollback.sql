-- Revert the matching application first. No stored rows are removed.
begin;
drop view if exists public.fin_provider_contract_tasks;
drop index if exists public.fin_contracts_provider_page_idx;
drop index if exists public.fin_tasks_open_contract_page_idx;
update public.fin_settings set value='financial-external-proposals-1',updated_at=now()
where key='schema_version' and value='financial-relationship-continuity-1';
notify pgrst, 'reload schema';
commit;

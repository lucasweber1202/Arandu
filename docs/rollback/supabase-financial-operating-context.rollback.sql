-- Revert the matching application first. No stored customer rows are changed.
begin;
do $$ begin
 if (select value from public.fin_settings where key='schema_version') is distinct from 'financial-operating-context-1' then
  raise exception 'operating context rollback marker mismatch';
 end if;
end $$;
drop view if exists public.fin_contract_document_evidence;
drop view if exists public.fin_facility_current_repayment;
drop view if exists public.fin_facility_latest_balance;
drop view if exists public.fin_portfolio_guarantee_context;
drop view if exists public.fin_portfolio_facility_context;
update public.fin_settings set value='financial-crm-view-roundtrip-1',updated_at=now()
where key='schema_version' and value='financial-operating-context-1';
notify pgrst,'reload schema';
commit;

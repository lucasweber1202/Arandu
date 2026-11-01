-- Withdraw specialized writes while preserving all immutable versions/history.
-- Publish an application that stops writing product_terms before rollback.
begin;
drop view if exists public.fin_crm_institution_records;
create or replace function public.fin_check_product_terms() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.terms ? 'product_terms' then raise exception 'invalid contract terms'; end if;
 return new;
end $$;
revoke all on function public.fin_check_product_terms() from public,anon,authenticated;
update public.fin_settings set value=(select value from public.fin_settings where key='product_terms_previous_marker'),updated_at=now() where key='schema_version';
notify pgrst,'reload schema';
commit;

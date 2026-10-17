-- Compatible application rollback retains the authorization guard. Removing
-- it would restore the confirmed revocation race; use a reviewed forward-fix.
begin;
insert into public.fin_settings(key,value) values('schema_version', 'financial-enterprise-integrity-1')
on conflict(key) do update set value=excluded.value,updated_at=now();
commit;

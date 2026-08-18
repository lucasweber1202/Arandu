\set ON_ERROR_STOP on

begin read only;

do $$
declare
  missing_rls text[];
begin
  if not exists (select 1 from pg_namespace where nspname = 'public') then
    raise exception 'Schema public ausente no restore.';
  end if;

  if to_regclass('public.reservations') is null
    or to_regclass('public.proposals') is null
    or to_regclass('public.audit_logs') is null then
    raise exception 'Tabelas operacionais obrigatórias ausentes no restore.';
  end if;

  select array_agg(c.relname order by c.relname)
  into missing_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(array['reservations', 'proposals', 'audit_logs'])
    and not c.relrowsecurity;

  if coalesce(array_length(missing_rls, 1), 0) > 0 then
    raise exception 'RLS ausente em tabelas restauradas: %', array_to_string(missing_rls, ', ');
  end if;
end;
$$;

select count(*) from public.reservations;
select count(*) from public.proposals;
select count(*) from public.audit_logs;

rollback;

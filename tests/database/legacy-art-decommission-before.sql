\set ON_ERROR_STOP on
-- Fotografia (só contagens) de todas as tabelas financeiras antes da
-- aposentadoria da vertical de arte; o teste seguinte exige que nada mude.
drop table if exists public.test_decommission_snapshot;
create table public.test_decommission_snapshot(relname text primary key, kind char, row_count bigint);
do $$
declare r record; n bigint;
begin
  for r in select c.relname, c.relkind from pg_class c join pg_namespace s on s.oid = c.relnamespace
            where s.nspname = 'public' and c.relkind in ('r','v') and c.relname like 'fin\_%' loop
    execute format('select count(*) from public.%I', r.relname) into n;
    insert into public.test_decommission_snapshot values (r.relname, r.relkind, n);
  end loop;
end $$;

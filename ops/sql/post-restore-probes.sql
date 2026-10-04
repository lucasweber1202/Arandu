\set ON_ERROR_STOP on
-- Probes do restore descartável (verify-backup-restore): o schema financeiro
-- voltou inteiro e com RLS. Só leitura; a saída tem contagens, nunca conteúdo.
begin read only;

do $$
declare
  missing_rls text[];
begin
  if not exists (select 1 from pg_namespace where nspname = 'public') then
    raise exception 'Schema public ausente no restore.';
  end if;

  if to_regclass('public.fin_organizations') is null
    or to_regclass('public.fin_rfqs') is null
    or to_regclass('public.fin_contracts') is null
    or to_regclass('public.fin_events') is null then
    raise exception 'Tabelas financeiras obrigatórias ausentes no restore.';
  end if;

  select array_agg(c.relname order by c.relname)
  into missing_rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname like 'fin\_%'
    and not c.relrowsecurity;

  if coalesce(array_length(missing_rls, 1), 0) > 0 then
    raise exception 'RLS ausente em tabelas restauradas: %', array_to_string(missing_rls, ', ');
  end if;
end;
$$;

select value as schema_version from public.fin_settings where key = 'schema_version';
select count(*) as organizations from public.fin_organizations;
select count(*) as rfqs from public.fin_rfqs;
select count(*) as contracts from public.fin_contracts;
select count(*) as events from public.fin_events;

rollback;

\set ON_ERROR_STOP on
-- Probes depois de aplicar migrations (release-migrations): superfície do
-- produto financeiro, sem tocar dado. Rodam numa transação desfeita.
begin;

do $$
declare v_unforced text; v_anon text;
begin
  if to_regclass('public.fin_organizations') is null or to_regclass('public.fin_members') is null or to_regclass('public.fin_events') is null then
    raise exception 'Tabelas financeiras obrigatórias ausentes depois da migration.';
  end if;

  select string_agg(c.relname, ', ' order by c.relname) into v_unforced
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'fin\_%' and not c.relrowsecurity;
  if v_unforced is not null then raise exception 'Tabela financeira sem RLS: %', v_unforced; end if;

  select string_agg(c.relname, ', ' order by c.relname) into v_anon
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m') and c.relname like 'fin\_%' and has_table_privilege('anon', c.oid, 'SELECT');
  if v_anon is not null then raise exception 'Tabela financeira visível para anon: %', v_anon; end if;

  if to_regclass('public.transactional_email_outbox') is null
     or not has_function_privilege('service_role', 'public.consume_rate_limit(text,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.consume_rate_limit(text,text,integer,integer)', 'EXECUTE') then
    raise exception 'Infraestrutura compartilhada (outbox/rate limit) ausente ou exposta.';
  end if;

  -- Depois da aposentadoria, a vertical de arte não pode reaparecer no schema.
  if coalesce((select value from public.fin_settings where key = 'schema_version'), '') in ('financial-legacy-art-decommission-1','financial-p0-closure-1','financial-value-realization-1','financial-fee-intelligence-1')
     and (to_regclass('public.artworks') is not null or to_regclass('public.reservations') is not null or to_regclass('public.profiles') is not null) then
    raise exception 'Objetos da vertical de arte presentes depois da aposentadoria.';
  end if;
end;
$$;

rollback;

\set ON_ERROR_STOP on
-- Estado final depois de docs/supabase-financial-legacy-art-decommission.sql:
-- nenhum objeto de arte, infraestrutura compartilhada intacta, nenhuma tabela
-- financeira apagada ou alterada em contagem, cadastro e nome padrão do membro
-- funcionando sem public.profiles, evidência só com contagens.
do $$
declare v_left text; v_changed text;
begin
  if (select value from public.fin_settings where key = 'schema_version') <> 'financial-legacy-art-decommission-1' then
    raise exception 'marker final incorreto';
  end if;
  select string_agg(c.relname, ', ') into v_left from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','v','m','S') and c.relname not like 'fin\_%'
     and c.relname not in ('api_rate_limits', 'transactional_email_outbox', 'test_decommission_snapshot')
     and c.relname not like 'api_rate_limits%' and c.relname not like 'transactional_email_outbox%';
  if v_left is not null then raise exception 'objetos de arte restantes: %', v_left; end if;
  select string_agg(p.proname, ', ') into v_left from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname not like 'fin\_%'
     and p.proname not in ('consume_rate_limit', 'claim_transactional_email_batch', 'claim_transactional_email_batch_v2',
                           'complete_transactional_email', 'complete_transactional_email_v2', 'fail_transactional_email', 'fail_transactional_email_v2');
  if v_left is not null then raise exception 'funções de arte restantes: %', v_left; end if;
  if exists (select 1 from pg_trigger t where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal) then
    raise exception 'gatilho legado continua em auth.users';
  end if;
  -- Nenhuma tabela financeira sumiu nem mudou de contagem.
  if to_regclass('public.test_decommission_snapshot') is not null then
    select string_agg(s.relname, ', ') into v_changed from public.test_decommission_snapshot s
     where to_regclass('public.' || s.relname) is null;
    if v_changed is not null then raise exception 'tabelas financeiras apagadas: %', v_changed; end if;
    -- fin_settings ganha só a evidência (legacy_art_decommission) e o marker.
    for v_left in select relname from public.test_decommission_snapshot where relname <> 'fin_settings' loop
      execute format('select case when count(*) = (select row_count from public.test_decommission_snapshot where relname = %L) then null else %L end from public.%I',
                     v_left, v_left, v_left) into v_changed;
      if v_changed is not null then raise exception 'contagem mudou em %', v_changed; end if;
    end loop;
  end if;
  -- Infraestrutura compartilhada continua com a superfície certa.
  if not has_function_privilege('service_role', 'public.consume_rate_limit(text,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.consume_rate_limit(text,text,integer,integer)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.claim_transactional_email_batch_v2(text,integer)', 'EXECUTE')
     or has_table_privilege('authenticated', 'public.transactional_email_outbox', 'SELECT') then
    raise exception 'infraestrutura compartilhada alterada';
  end if;
  -- Evidência: contagens e reconhecimento, nunca dado pessoal.
  if exists (select 1 from public.fin_settings where key = 'legacy_art_decommission' and value ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}') then
    raise exception 'evidência da aposentadoria guarda e-mail';
  end if;
end $$;

-- Cadastro continua funcionando sem public.profiles, e o nome padrão do membro
-- vem dos metadados da conta.
insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-4000-8000-0000000de001', 'decommission@example.invalid', '{"full_name":"Paula Decom"}'::jsonb)
on conflict (id) do nothing;
insert into public.fin_organizations(id, legal_name, kind, created_by) values
  ('00000000-0000-4000-8000-0000000de101', 'Grupo Pós-Arte DEMO', 'BUYER', '00000000-0000-4000-8000-0000000de001') on conflict do nothing;
insert into public.fin_members(organization_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000de101', '00000000-0000-4000-8000-0000000de001', 'admin') on conflict do nothing;
do $$ begin
  if (select display_name from public.fin_members where user_id = '00000000-0000-4000-8000-0000000de001') is distinct from 'Paula Decom' then
    raise exception 'nome padrão do membro não veio dos metadados da conta';
  end if;
end $$;
-- Rate limit e outbox continuam operando para o service role.
set role service_role;
select public.consume_rate_limit('decommission-probe', repeat('f', 64), 5, 60);
select count(*) from public.claim_transactional_email_batch_v2('decommission-probe', 1);
reset role;
delete from public.fin_members where organization_id = '00000000-0000-4000-8000-0000000de101';
delete from public.fin_events where organization_id = '00000000-0000-4000-8000-0000000de101';
delete from public.fin_organizations where id = '00000000-0000-4000-8000-0000000de101';
drop table if exists public.test_decommission_snapshot;
select 'legacy art decommission ok';

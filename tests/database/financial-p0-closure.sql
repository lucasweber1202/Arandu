\set ON_ERROR_STOP on
-- P0 closure (docs/supabase-financial-p0-closure.sql): aviso de exceção de
-- policy (pedida -> quem decide; decidida -> quem pediu) e download do export
-- em faixas com o checksum do manifesto. Roda depois da suíte do Policy Engine
-- e da Data Governance (usa as exceções e organizações delas).
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

-- 1. Exceção pedida: avisa quem pode decidir, nunca quem pediu.
do $$
declare e public.fin_policy_exceptions%rowtype; r public.fin_approval_requests%rowtype; v_event uuid; v_n integer;
begin
  select * into e from public.fin_policy_exceptions order by created_at limit 1;
  if not found then raise exception 'fixture: nenhuma exceção da suíte do Policy Engine'; end if;
  select * into r from public.fin_approval_requests where id = e.request_id;
  -- Reabre o caso como "pedida" só para o gatilho (linha de teste, mesma exceção).
  update public.fin_policy_exceptions set status = 'requested', decided_by = null, decided_at = null, decision_comment = null where id = e.id;
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (e.organization_id, 'rfq', r.rfq_id, 'policy_exception_requested', e.requested_by,
            jsonb_build_object('request_id', e.request_id, 'exception_id', e.id, 'rule_id', e.rule_id)) returning id into v_event;
  select count(*) into v_n from public.fin_notifications where event_id = v_event and event_type = 'policy_exception_requested';
  if v_n = 0 then raise exception 'exceção pedida sem aviso para quem decide'; end if;
  if exists (select 1 from public.fin_notifications where event_id = v_event and user_id in (e.requested_by, r.requested_by)) then
    raise exception 'quem pediu recebeu aviso para decidir a própria exceção';
  end if;
  if exists (select 1 from public.fin_notifications n where n.event_id = v_event
              and not exists (select 1 from public.fin_members m where m.organization_id = e.organization_id and m.user_id = n.user_id)) then
    raise exception 'aviso de exceção para fora da organização';
  end if;
  if exists (select 1 from public.fin_notifications where event_id = v_event and (body ~* '[0-9]{3,}' or title ~* 'R\$')) then
    raise exception 'aviso de exceção com conteúdo do processo';
  end if;
  -- 2. Decidida (rejeitada): avisa quem pediu.
  insert into public.fin_events(organization_id, entity_type, entity_id, event_type, actor_id, metadata)
    values (e.organization_id, 'rfq', r.rfq_id, 'policy_exception_rejected',
            (select m.user_id from public.fin_members m where m.organization_id = e.organization_id and m.user_id not in (e.requested_by, r.requested_by) order by m.user_id limit 1),
            jsonb_build_object('request_id', e.request_id, 'exception_id', e.id, 'rule_id', e.rule_id)) returning id into v_event;
  if not exists (select 1 from public.fin_notifications where event_id = v_event and user_id = e.requested_by and event_type = 'policy_exception_decided') then
    raise exception 'exceção decidida sem aviso para quem pediu';
  end if;
  if (select count(*) from public.fin_notifications where event_id = v_event) <> 1 then raise exception 'decisão avisou além de quem pediu'; end if;
end $$;

-- Preferência aceita os tipos novos (silenciar continua possível).
do $$ begin
  begin
    insert into public.fin_notification_preferences(organization_id, user_id, event_type, in_app, email)
      select m.organization_id, m.user_id, 'policy_exception_requested', false, false from public.fin_members m limit 1
      on conflict do nothing;
  exception when undefined_column then null; -- forma da tabela coberta pela suíte de colaboração
  end;
  if exists (select 1 from pg_constraint where conname = 'fin_notifications_event_type_check'
              and pg_get_constraintdef(oid) not like '%policy_exception_decided%') then
    raise exception 'tipo novo fora do check de notificações';
  end if;
end $$;

-- 3. Export em faixas: admin baixa um conjunto em pedaços e o sha256 confere.
create temporary table pc_ids(key text primary key, value text);
grant all on pc_ids to authenticated;
insert into pc_ids
  select 'org', m.organization_id::text from public.fin_members m join public.fin_organizations o on o.id = m.organization_id
   where m.role = 'admin' and o.kind = 'BUYER'
     and not exists (select 1 from public.fin_offboarding_requests f where f.organization_id = o.id)
     and not exists (select 1 from public.fin_data_exports x where x.organization_id = o.id and x.status = 'requested')
   order by o.created_at limit 1;
insert into pc_ids select 'admin', m.user_id::text from public.fin_members m where m.organization_id = (select value from pc_ids where key='org')::uuid and m.role = 'admin' limit 1;
insert into pc_ids select 'viewer', m.user_id::text from public.fin_members m where m.organization_id = (select value from pc_ids where key='org')::uuid and m.role <> 'admin' limit 1;
set role authenticated;
select set_config('request.jwt.claim.sub', (select value from pc_ids where key='admin'), false);
insert into pc_ids select 'export', public.fin_governance_request_export((select value from pc_ids where key='org')::uuid, 'portability')::text;
reset role;
select set_config('request.jwt.claim.sub', '', false);
do $$ declare v jsonb; begin
  loop
    v := public.fin_governance_build_export(64000000);
    exit when (v->>'processed')::int = 0 or v->>'export_id' = (select value from pc_ids where key='export');
  end loop;
  if (select status from public.fin_data_exports where id = (select value from pc_ids where key='export')::uuid) <> 'ready' then
    raise exception 'export não ficou pronto';
  end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', (select value from pc_ids where key='admin'), false);
do $$
declare v_off integer := 0; v_buf text := ''; r record; v_sha text; v_dataset text; v_parts integer := 0;
begin
  select p.dataset into v_dataset from public.fin_governance_export_parts((select value from pc_ids where key='export')::uuid) p
   order by char_length(p.content) desc limit 1;
  loop
    select * into r from public.fin_governance_export_part_range((select value from pc_ids where key='export')::uuid, v_dataset, v_off, 7);
    v_buf := v_buf || r.content; v_parts := v_parts + 1;
    exit when r.next_offset is null;
    v_off := r.next_offset;
  end loop;
  select d->>'sha256' into v_sha from jsonb_array_elements(public.fin_governance_export_manifest((select value from pc_ids where key='export')::uuid)->'datasets') d
   where d->>'dataset' = v_dataset;
  if encode(sha256(convert_to(v_buf, 'UTF8')), 'hex') <> v_sha then raise exception 'faixas concatenadas não batem com o checksum do manifesto'; end if;
  if v_parts < 2 then raise exception 'conjunto não foi baixado em faixas'; end if;
end $$;
select pg_temp.expect_error(format($q$select * from public.fin_governance_export_part_range('%s','organization',-1,10)$q$, (select value from pc_ids where key='export')), 'invalid export range');
select pg_temp.expect_error(format($q$select * from public.fin_governance_export_part_range('%s','organization',0,4000001)$q$, (select value from pc_ids where key='export')), 'invalid export range');
select pg_temp.expect_error(format($q$select * from public.fin_governance_export_part_range('%s','organization',99999999,10)$q$, (select value from pc_ids where key='export')), 'invalid export range');
select pg_temp.expect_error(format($q$select * from public.fin_governance_export_part_range('%s','inexistente',0,10)$q$, (select value from pc_ids where key='export')), 'export not available');
select set_config('request.jwt.claim.sub', (select value from pc_ids where key='viewer'), false);
select pg_temp.expect_error(format($q$select * from public.fin_governance_export_part_range('%s','organization',0,10)$q$, (select value from pc_ids where key='export')), 'forbidden');
reset role;
do $$ begin
  if has_function_privilege('anon', 'public.fin_governance_export_part_range(uuid,text,integer,integer)', 'EXECUTE') then raise exception 'faixa do export exposta a anon'; end if;
  if (select value from public.fin_settings where key = 'schema_version') not in ('financial-p0-closure-1', 'financial-value-realization-1', 'financial-fee-intelligence-1', 'financial-opportunity-engine-1') then
    raise exception 'marker do P0 closure ausente';
  end if;
end $$;

-- Preferência pela RPC aceita os tipos novos e recusa tipo inventado.
set role authenticated;
select set_config('request.jwt.claim.sub', (select value from pc_ids where key='admin'), false);
select public.fin_set_notification_preference((select value from pc_ids where key='org')::uuid, 'policy_exception_requested', true, false);
select pg_temp.expect_error(format($q$select public.fin_set_notification_preference('%s','score_arandu',true,false)$q$, (select value from pc_ids where key='org')), '');
reset role;

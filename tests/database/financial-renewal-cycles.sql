\set ON_ERROR_STOP on
-- Ciclos de renovação (docs/supabase-financial-renewal-cycles.sql, defeito D1):
-- aditivo de prorrogação devolve o contrato a "vigente" e move a próxima ação;
-- o novo vencimento volta a gerar marco e aviso (agenda do job e processamento
-- pela organização); marcos do ciclo anterior ficam como histórico; gatilho
-- preenche o ciclo de quem não o informa; negações de papel e de tenant.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000ad97001','cyc-admin@example.invalid'),
('00000000-0000-4000-8000-00000ad97002','cyc-analyst@example.invalid'),
('00000000-0000-4000-8000-00000ad97003','cyc-other@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-00000ad97101','Empresa ciclos DEMO','BUYER','00000000-0000-4000-8000-00000ad97001'),
('00000000-0000-4000-8000-00000ad97102','Outra empresa ciclos DEMO','BUYER','00000000-0000-4000-8000-00000ad97003');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-00000ad97101','00000000-0000-4000-8000-00000ad97001','admin'),
('00000000-0000-4000-8000-00000ad97101','00000000-0000-4000-8000-00000ad97002','analyst'),
('00000000-0000-4000-8000-00000ad97102','00000000-0000-4000-8000-00000ad97003','admin');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-00000ad97201','00000000-0000-4000-8000-00000ad97101','Banco ciclos DEMO','bank','00000000-0000-4000-8000-00000ad97001');

create temporary table cyc_ids(key text primary key, value uuid);
grant all on cyc_ids to authenticated;
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

-- 1. Superfície: mesmas concessões; unicidade por ciclo no lugar da antiga.
do $$ begin
  if has_function_privilege('anon','public.fin_record_contract_amendment(uuid,text,date,date,text,jsonb,date,integer,uuid,integer)','EXECUTE')
     or has_function_privilege('authenticated','public.fin_run_renewal_schedule(date)','EXECUTE')
     or not has_function_privilege('authenticated','public.fin_process_renewals(uuid,date)','EXECUTE') then
    raise exception 'concessões mudaram';
  end if;
  if exists (select 1 from pg_constraint where conname = 'fin_renewal_milestones_contract_id_milestone_key') then raise exception 'unicidade antiga ainda ativa'; end if;
  if not exists (select 1 from pg_indexes where indexname = 'fin_renewal_milestones_cycle_key') then raise exception 'unicidade por ciclo ausente'; end if;
  if exists (select 1 from public.fin_renewal_milestones where cycle_ends_on is null) then raise exception 'marco sem ciclo'; end if;
end $$;

-- 2. Contrato a 20 dias do fim: em renovação; a agenda grava o marco do ciclo.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000ad97001',false);
insert into cyc_ids select 'c', public.fin_import_contract('00000000-0000-4000-8000-00000ad97101',null,
  '00000000-0000-4000-8000-00000ad97201','credit','Capital de giro ciclos DEMO', current_date - 340, current_date + 20, 60, false, null, '{}'::jsonb, null);
reset role;
select public.fin_run_renewal_schedule(current_date);
do $$ declare c uuid := (select value from cyc_ids where key = 'c'); begin
  if (select status from public.fin_contracts where id = c) <> 'renewing' then raise exception 'contrato deveria estar em renovação'; end if;
  if (select count(*) from public.fin_renewal_milestones where contract_id = c and cycle_ends_on = current_date + 20) <> 1 then raise exception 'marco do ciclo 1 ausente'; end if;
end $$;

-- 3. Negações: analista e outro tenant não registram aditivo.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000ad97002',false);
select pg_temp.expect_error(format($q$select public.fin_record_contract_amendment(%L,'Prorrogação',current_date,null,'Prorrogado',null,current_date+385,null,null,null)$q$,
  (select value from cyc_ids where key='c')), 'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000ad97003',false);
select pg_temp.expect_error(format($q$select public.fin_record_contract_amendment(%L,'Prorrogação',current_date,null,'Prorrogado',null,current_date+385,null,null,null)$q$,
  (select value from cyc_ids where key='c')), 'forbidden');

-- 4. Prorrogação por 12 meses: volta a vigente e a tarefa vai para o novo aviso prévio.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000ad97001',false);
select public.fin_record_contract_amendment((select value from cyc_ids where key='c'),'Prorrogação por 12 meses',current_date,current_date,
  'Prazo prorrogado por 12 meses.',null,current_date + 385,null,null,null);
reset role;
do $$ declare c uuid := (select value from cyc_ids where key = 'c'); begin
  if (select status from public.fin_contracts where id = c) <> 'active' then raise exception 'prorrogado deveria voltar a vigente'; end if;
  if (select count(*) from public.fin_tasks where related_type = 'contract' and related_id = c and status = 'open') <> 1 then raise exception 'tarefa de revisão duplicada ou ausente'; end if;
  if (select due_on from public.fin_tasks where related_type = 'contract' and related_id = c and status = 'open') <> current_date + 325 then
    raise exception 'tarefa não acompanhou o novo aviso prévio';
  end if;
  if (select metadata->>'status_after' from public.fin_events where entity_id = c and event_type = 'contract_amended' order by happened_at desc limit 1) <> 'active' then
    raise exception 'trilha sem o status resultante';
  end if;
  -- O marco do ciclo anterior continua como histórico.
  if (select count(*) from public.fin_renewal_milestones where contract_id = c) <> 1 then raise exception 'histórico de marcos alterado'; end if;
end $$;

-- 5. Só o aviso prévio muda (maior que o prazo restante): volta a "em renovação", tarefa para hoje.
set role authenticated;
select public.fin_record_contract_amendment((select value from cyc_ids where key='c'),'Aviso prévio ampliado',current_date,null,
  'Aviso prévio passa a 400 dias.',null,null,400,null,null);
reset role;
do $$ declare c uuid := (select value from cyc_ids where key = 'c'); begin
  if (select status from public.fin_contracts where id = c) <> 'renewing' then raise exception 'aviso prévio já alcançado deveria pôr em renovação'; end if;
  if (select due_on from public.fin_tasks where related_type = 'contract' and related_id = c and status = 'open') <> current_date then raise exception 'tarefa deveria vencer hoje'; end if;
end $$;

-- 6. Ciclo seguinte (fim novamente a 19 dias): a agenda volta a gerar marco e aviso, uma vez só.
set role authenticated;
select public.fin_record_contract_amendment((select value from cyc_ids where key='c'),'Fim ajustado',current_date,null,
  'Fim e aviso ajustados.',null,current_date + 19,60,null,null);
reset role;
select public.fin_run_renewal_schedule(current_date);
select public.fin_run_renewal_schedule(current_date);
do $$ declare c uuid := (select value from cyc_ids where key = 'c'); begin
  if (select count(*) from public.fin_renewal_milestones where contract_id = c) <> 2 then raise exception 'novo ciclo sem marco (ou marco duplicado)'; end if;
  if (select count(*) from public.fin_renewal_milestones where contract_id = c and cycle_ends_on = current_date + 19) <> 1 then raise exception 'marco sem o ciclo novo'; end if;
  if (select count(*) from public.fin_notifications where object_id = c and event_type = 'renewal_due') <> 2 then raise exception 'aviso do novo ciclo ausente'; end if;
  if (select count(*) from public.fin_tasks where related_type = 'contract' and related_id = c and status = 'open') <> 1 then raise exception 'tarefa duplicada no novo ciclo'; end if;
end $$;

-- 7. Processamento pela organização segue a mesma regra de ciclo.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000ad97001',false);
insert into cyc_ids select 'p', public.fin_import_contract('00000000-0000-4000-8000-00000ad97101',null,
  '00000000-0000-4000-8000-00000ad97201','credit','Linha processada ciclos DEMO', current_date - 300, current_date + 10, 5, false, null, '{}'::jsonb, null);
select public.fin_process_renewals('00000000-0000-4000-8000-00000ad97101', current_date);
select public.fin_record_contract_amendment((select value from cyc_ids where key='p'),'Fim ajustado',current_date,null,
  'Novo ciclo da linha.',null,current_date + 9,null,null,null);
select public.fin_process_renewals('00000000-0000-4000-8000-00000ad97101', current_date);
select public.fin_process_renewals('00000000-0000-4000-8000-00000ad97101', current_date);
reset role;
do $$ declare c uuid := (select value from cyc_ids where key = 'p'); begin
  if (select count(*) from public.fin_renewal_milestones where contract_id = c) <> 2 then raise exception 'processamento pela organização ignorou o ciclo novo'; end if;
end $$;

-- 8. Gravação sem ciclo (definição antiga, ferramenta): o gatilho usa o fim atual.
insert into public.fin_tasks(id,organization_id,title,status,related_type,related_id,created_by)
values ('00000000-0000-4000-8000-00000ad97301','00000000-0000-4000-8000-00000ad97101','Tarefa de marco manual DEMO','open','contract',
  (select value from cyc_ids where key='p'),'00000000-0000-4000-8000-00000ad97001');
insert into public.fin_renewal_milestones(organization_id,contract_id,milestone,task_id)
values ('00000000-0000-4000-8000-00000ad97101',(select value from cyc_ids where key='p'),'d180','00000000-0000-4000-8000-00000ad97301');
do $$ begin
  if (select cycle_ends_on from public.fin_renewal_milestones where task_id = '00000000-0000-4000-8000-00000ad97301') <> current_date + 9 then
    raise exception 'gatilho não preencheu o ciclo';
  end if;
end $$;

-- 9. Contrato encerrado prorrogado: a tarefa "vencido" vira revisão de renovação.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000ad97001',false);
insert into cyc_ids select 'e', public.fin_import_contract('00000000-0000-4000-8000-00000ad97101',null,
  '00000000-0000-4000-8000-00000ad97201','acquiring','Adquirência ciclos DEMO', current_date - 400, current_date + 1, 30, false, null, '{}'::jsonb, null);
reset role;
update public.fin_contracts set ends_on = current_date - 1 where id = (select value from cyc_ids where key = 'e');
update public.fin_tasks set status = 'done' where related_type = 'contract' and related_id = (select value from cyc_ids where key = 'e');
select public.fin_run_renewal_schedule(current_date);
set role authenticated;
select public.fin_record_contract_amendment((select value from cyc_ids where key='e'),'Prorrogação após o fim',current_date - 1,null,
  'Prorrogado por seis meses.',null,current_date + 180,null,null,null);
reset role;
do $$ declare c uuid := (select value from cyc_ids where key = 'e'); begin
  if not exists (select 1 from public.fin_tasks where related_type = 'contract' and related_id = c and status = 'open' and title = 'Revisar renovação de contrato') then
    raise exception 'tarefa de revisão do contrato prorrogado ausente';
  end if;
  if (select status from public.fin_contracts where id = c) <> 'active' then raise exception 'prorrogado após o fim deveria estar vigente'; end if;
  if exists (select 1 from public.fin_tasks where related_type = 'contract' and related_id = c and status = 'open' and title = 'Revisar contrato vencido') then
    raise exception 'tarefa continua dizendo "vencido"';
  end if;
end $$;

do $$ begin
  if (select value from public.fin_settings where key = 'schema_version') not in ('financial-renewal-cycles-1', 'financial-decision-integrity-1', 'financial-session-revocation-1', 'financial-document-upload-authorization-1', 'financial-implementation-task-labels-1', 'financial-task-accountability-1', 'financial-enterprise-integrity-1', 'financial-decision-authorization-1', 'financial-external-proposals-1', 'financial-relationship-continuity-1', 'financial-external-decision-1', 'financial-contract-import-integrity-1') then raise exception 'marcador de schema'; end if;
end $$;
select 'financial-renewal-cycles: prorrogação, novo ciclo, histórico, gatilho e negações aprovados' as result;

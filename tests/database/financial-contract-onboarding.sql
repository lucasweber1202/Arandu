\set ON_ERROR_STOP on
-- Contrato existente (docs/supabase-financial-contract-onboarding.sql): próxima
-- ação no registro, status pela data, duplicado recusado, contrato principal
-- coerente (provedor, entidade, organização), moeda coerente e negações de
-- papel, tenant, provedor e escopo de entidade.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000c0b0001','onb-admin@example.invalid'),
('00000000-0000-4000-8000-00000c0b0002','onb-analyst@example.invalid'),
('00000000-0000-4000-8000-00000c0b0003','onb-manager-b@example.invalid'),
('00000000-0000-4000-8000-00000c0b0004','onb-other@example.invalid'),
('00000000-0000-4000-8000-00000c0b0005','onb-provider@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-00000c0b1001','Empresa onboarding DEMO','BUYER','00000000-0000-4000-8000-00000c0b0001'),
('00000000-0000-4000-8000-00000c0b1002','Outra empresa onboarding DEMO','BUYER','00000000-0000-4000-8000-00000c0b0004'),
('00000000-0000-4000-8000-00000c0b1003','Banco onboarding DEMO','PROVIDER','00000000-0000-4000-8000-00000c0b0005');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-00000c0b1001','00000000-0000-4000-8000-00000c0b0001','admin'),
('00000000-0000-4000-8000-00000c0b1001','00000000-0000-4000-8000-00000c0b0002','analyst'),
('00000000-0000-4000-8000-00000c0b1001','00000000-0000-4000-8000-00000c0b0003','finance_manager'),
('00000000-0000-4000-8000-00000c0b1002','00000000-0000-4000-8000-00000c0b0004','admin'),
('00000000-0000-4000-8000-00000c0b1003','00000000-0000-4000-8000-00000c0b0005','provider_user');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-00000c0b1010','00000000-0000-4000-8000-00000c0b1001','Banco principal onboarding DEMO','bank','00000000-0000-4000-8000-00000c0b0001'),
('00000000-0000-4000-8000-00000c0b1012','00000000-0000-4000-8000-00000c0b1001','Adquirente onboarding DEMO','acquirer','00000000-0000-4000-8000-00000c0b0001'),
('00000000-0000-4000-8000-00000c0b1011','00000000-0000-4000-8000-00000c0b1002','Banco de outra empresa onboarding DEMO','bank','00000000-0000-4000-8000-00000c0b0004');

create temporary table onb_ids(key text primary key, value uuid);
grant all on onb_ids to authenticated;
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

-- 1. Superfície: mesma assinatura e mesmas concessões.
do $$ begin
  if has_function_privilege('anon','public.fin_import_contract(uuid,uuid,uuid,text,text,date,date,integer,boolean,text,jsonb,uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.fin_import_contract(uuid,uuid,uuid,text,text,date,date,integer,boolean,text,jsonb,uuid)','EXECUTE') then
    raise exception 'concessões de fin_import_contract mudaram';
  end if;
  if (select value from public.fin_settings where key='schema_version') not in ('financial-contract-onboarding-1', 'financial-renewal-cycles-1', 'financial-decision-integrity-1', 'financial-session-revocation-1', 'financial-document-upload-authorization-1', 'financial-implementation-task-labels-1', 'financial-task-accountability-1', 'financial-enterprise-integrity-1', 'financial-decision-authorization-1', 'financial-external-proposals-1', 'financial-relationship-continuity-1', 'financial-external-decision-1', 'financial-contract-import-integrity-1', 'financial-provider-intent-integrity-1') then raise exception 'marcador de schema'; end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c0b0001',false);
insert into onb_ids select 'A', public.fin_create_legal_entity('00000000-0000-4000-8000-00000c0b1001','legal_entity','Onboarding A DEMO','OA',null,'BR','BRL',null);
insert into onb_ids select 'B', public.fin_create_legal_entity('00000000-0000-4000-8000-00000c0b1001','legal_entity','Onboarding B DEMO','OB',null,'BR','BRL',null);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-00000c0b1001','00000000-0000-4000-8000-00000c0b0003','entities',array[(select value from onb_ids where key='B')]);

-- 2. Contrato vigente, longe do aviso: ativo, com a tarefa de revisão no início do aviso.
insert into onb_ids select 'future', public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',(select value from onb_ids where key='A'),
  '00000000-0000-4000-8000-00000c0b1010','credit','Capital de giro onboarding DEMO', current_date - 100, current_date + 400, 90, false, null,
  '{"principal_amount":2000000,"indexer":"cdi"}'::jsonb, null);
-- 3. Contrato já dentro do aviso prévio: em renovação, tarefa para hoje.
insert into onb_ids select 'notice', public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',null,
  '00000000-0000-4000-8000-00000c0b1012','acquiring','Adquirência onboarding DEMO', current_date - 300, current_date + 20, 60, true, 'brl',
  '{}'::jsonb, null);
-- 4. Contrato encerrado: memória institucional, sem tarefa de renovação no registro.
insert into onb_ids select 'ended', public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',null,
  '00000000-0000-4000-8000-00000c0b1010','credit','Crédito encerrado onboarding DEMO', current_date - 800, current_date - 10, 60, false, null,
  '{}'::jsonb, null);
-- 5. Filho coerente: mesmo provedor, mesma entidade do principal.
insert into onb_ids select 'child', public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',(select value from onb_ids where key='A'),
  '00000000-0000-4000-8000-00000c0b1010','cash_management','Pacote de serviços onboarding DEMO', current_date - 10, current_date + 500, 60, false, null,
  '{}'::jsonb, (select value from onb_ids where key='future'));

-- 6. Duplicado (mesma identidade com caixa e espaços diferentes) recusado; outro provedor passa.
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',null,'00000000-0000-4000-8000-00000c0b1010','credit','  CAPITAL DE GIRO onboarding demo ',current_date - 100,current_date + 400,90,false,null,'{}'::jsonb,null)$q$, 'contract duplicate');
select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',null,'00000000-0000-4000-8000-00000c0b1012','credit','Capital de giro onboarding DEMO',current_date - 100,current_date + 400,90,false,null,'{}'::jsonb,null);

-- 7. Contrato principal incoerente: outro provedor, outra entidade, outra organização.
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-00000c0b1012','acquiring','Filho de outro provedor DEMO',current_date,current_date + 100,30,false,null,'{}'::jsonb,(select value from onb_ids where key='future'))$q$, 'invalid parent contract');
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',(select value from onb_ids where key='B'),'00000000-0000-4000-8000-00000c0b1010','fx','Filho em outra entidade DEMO',current_date,current_date + 100,30,false,null,'{}'::jsonb,(select value from onb_ids where key='future'))$q$, 'invalid parent contract');
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',null,'00000000-0000-4000-8000-00000c0b1010','fx','Filho sem entidade DEMO',current_date,current_date + 100,30,false,null,'{}'::jsonb,(select value from onb_ids where key='future'))$q$, 'invalid parent contract');

-- 8. Moeda divergente e aviso fora do intervalo.
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',null,'00000000-0000-4000-8000-00000c0b1010','credit','Moeda divergente DEMO',current_date,current_date + 100,30,false,'USD','{"currency":"BRL"}'::jsonb,null)$q$, 'currency mismatch');
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',null,'00000000-0000-4000-8000-00000c0b1010','credit','Aviso absurdo DEMO',current_date,current_date + 100,4000,false,null,'{}'::jsonb,null)$q$, 'invalid period');

-- 9. Negações: analista, gestor fora da entidade, outro tenant, provedor.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c0b0002',false);
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',null,'00000000-0000-4000-8000-00000c0b1010','fx','Analista DEMO',current_date,current_date + 100,30,false,null,'{}'::jsonb,null)$q$, 'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c0b0003',false);
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-00000c0b1010','fx','Fora do escopo DEMO',current_date,current_date + 100,30,false,null,'{}'::jsonb,null)$q$, 'forbidden');
-- O gestor da entidade B não alcança o principal da entidade A: para ele, não existe.
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',(select value from onb_ids where key='B'),'00000000-0000-4000-8000-00000c0b1010','fx','Pai invisível DEMO',current_date,current_date + 100,30,false,null,'{}'::jsonb,(select value from onb_ids where key='future'))$q$, 'contract not found');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c0b0004',false);
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',null,'00000000-0000-4000-8000-00000c0b1010','fx','Outro tenant DEMO',current_date,current_date + 100,30,false,null,'{}'::jsonb,null)$q$, 'forbidden');
-- Na própria organização, o principal de outra organização não existe.
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1002',null,'00000000-0000-4000-8000-00000c0b1011','credit','Pai alheio DEMO',current_date,current_date + 100,30,false,null,'{}'::jsonb,(select value from onb_ids where key='future'))$q$, 'contract not found');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c0b0005',false);
select pg_temp.expect_error($q$select public.fin_import_contract('00000000-0000-4000-8000-00000c0b1001',null,'00000000-0000-4000-8000-00000c0b1010','fx','Provedor DEMO',current_date,current_date + 100,30,false,null,'{}'::jsonb,null)$q$, 'forbidden');
reset role;

-- 10. Estado gravado.
do $$ declare v record; t record; begin
  select * into v from public.fin_contracts where id=(select value from onb_ids where key='future');
  if v.status <> 'active' or v.origin <> 'imported' or v.current_version <> 1 then raise exception 'contrato vigente: %', row_to_json(v); end if;
  select * into t from public.fin_tasks where related_type='contract' and related_id=v.id;
  if t.id is null or t.status <> 'open' or t.due_on <> current_date + 310 or t.organization_id <> v.organization_id then raise exception 'tarefa do vigente: %', row_to_json(t); end if;
  if not exists (select 1 from public.fin_events e where e.entity_id=v.id and e.event_type='contract_imported'
       and e.metadata->>'task_id' = t.id::text and e.metadata->>'status'='active' and (e.metadata->>'review_from')::date = current_date + 310) then
    raise exception 'evento de importação sem a próxima ação';
  end if;

  select * into v from public.fin_contracts where id=(select value from onb_ids where key='notice');
  if v.status <> 'renewing' or v.currency <> 'BRL' then raise exception 'contrato no aviso: %', row_to_json(v); end if;
  if (select due_on from public.fin_tasks where related_type='contract' and related_id=v.id) <> current_date then raise exception 'tarefa do aviso fora de hoje'; end if;

  select * into v from public.fin_contracts where id=(select value from onb_ids where key='ended');
  if v.status <> 'active' then raise exception 'contrato encerrado: %', v.status; end if;
  if exists (select 1 from public.fin_tasks where related_type='contract' and related_id=v.id) then raise exception 'encerrado ganhou tarefa'; end if;

  if (select parent_contract_id from public.fin_contracts where id=(select value from onb_ids where key='child')) <> (select value from onb_ids where key='future') then
    raise exception 'filho sem principal';
  end if;
  if (select count(*) from public.fin_contracts where organization_id='00000000-0000-4000-8000-00000c0b1001') <> 5 then raise exception 'contratos inesperados na organização'; end if;
  if exists (select 1 from public.fin_contracts where organization_id='00000000-0000-4000-8000-00000c0b1002') then raise exception 'contrato vazou para outro tenant'; end if;
end $$;

-- 11. A agenda diária reaproveita a tarefa aberta: o contrato no aviso não ganha segunda tarefa.
select set_config('request.jwt.claim.sub','',false);
set role service_role;
select public.fin_run_renewal_schedule();
reset role;
do $$ declare v_contract uuid := (select value from onb_ids where key='notice'); begin
  if (select count(*) from public.fin_tasks where related_type='contract' and related_id=v_contract) <> 1 then raise exception 'agenda duplicou a tarefa'; end if;
  if not exists (select 1 from public.fin_renewal_milestones m join public.fin_tasks t on t.id=m.task_id
                  where m.contract_id=v_contract and t.related_id=v_contract) then raise exception 'marco sem a tarefa existente'; end if;
end $$;

-- 12. Renovação a partir do contrato: vigente passa a "Em renovação"; o segundo
--     clique devolve a mesma concorrência; cancelada, a próxima é nova.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c0b0001',false);
insert into onb_ids select 'rfq1', public.fin_start_contract_rfq((select value from onb_ids where key='future'));
insert into onb_ids select 'rfq2', public.fin_start_contract_rfq((select value from onb_ids where key='future'));
-- Gestor fora da entidade e outro tenant continuam sem acesso.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c0b0003',false);
select pg_temp.expect_error($q$select public.fin_start_contract_rfq((select value from onb_ids where key='future'))$q$, 'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c0b0004',false);
select pg_temp.expect_error($q$select public.fin_start_contract_rfq((select value from onb_ids where key='future'))$q$, 'forbidden');
reset role;
do $$ begin
  if (select value from onb_ids where key='rfq1') <> (select value from onb_ids where key='rfq2') then raise exception 'segundo clique criou outra concorrência'; end if;
  if (select status from public.fin_contracts where id=(select value from onb_ids where key='future')) <> 'renewing' then raise exception 'contrato não passou a Em renovação'; end if;
  if (select count(*) from public.fin_events where event_type='renewal_rfq_started' and entity_id=(select value from onb_ids where key='future')) <> 1 then raise exception 'trilha duplicada'; end if;
  update public.fin_rfqs set status='cancelled' where id=(select value from onb_ids where key='rfq1');
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c0b0001',false);
insert into onb_ids select 'rfq3', public.fin_start_contract_rfq((select value from onb_ids where key='future'));
reset role;
do $$ begin
  if (select value from onb_ids where key='rfq3') = (select value from onb_ids where key='rfq1') then raise exception 'concorrência cancelada foi reaproveitada'; end if;
  if (select status from public.fin_rfqs where id=(select value from onb_ids where key='rfq3')) <> 'draft' then raise exception 'nova concorrência não é rascunho'; end if;
end $$;
select set_config('request.jwt.claim.sub','',false);

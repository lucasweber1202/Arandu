\set ON_ERROR_STOP on
-- Post-award workflow and adversarial authorization; synthetic fixtures.
begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000a7101','pq-admin@example.invalid'),
('00000000-0000-4000-8000-0000000a7102','pq-analyst@example.invalid'),
('00000000-0000-4000-8000-0000000a7103','pq-viewer@example.invalid'),
('00000000-0000-4000-8000-0000000a7104','pq-entity-b@example.invalid'),
('00000000-0000-4000-8000-0000000a7105','pq-other@example.invalid'),
('00000000-0000-4000-8000-0000000a7106','pq-provider@example.invalid'),
('00000000-0000-4000-8000-0000000a7107','pq-manager@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000a7201','PQ Buyer','BUYER','00000000-0000-4000-8000-0000000a7101'),
('00000000-0000-4000-8000-0000000a7202','PQ Other Buyer','BUYER','00000000-0000-4000-8000-0000000a7105'),
('00000000-0000-4000-8000-0000000a7203','PQ Provider','PROVIDER','00000000-0000-4000-8000-0000000a7106');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7101','admin'),
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7102','analyst'),
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7103','viewer'),
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7104','finance_manager'),
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7107','finance_manager'),
('00000000-0000-4000-8000-0000000a7202','00000000-0000-4000-8000-0000000a7105','admin'),
('00000000-0000-4000-8000-0000000a7203','00000000-0000-4000-8000-0000000a7106','admin');
insert into public.fin_legal_entities(id,organization_id,legal_name,created_by) values
('00000000-0000-4000-8000-0000000a7401','00000000-0000-4000-8000-0000000a7201','PQ Entity A','00000000-0000-4000-8000-0000000a7101'),
('00000000-0000-4000-8000-0000000a7402','00000000-0000-4000-8000-0000000a7201','PQ Entity B','00000000-0000-4000-8000-0000000a7101');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000a7301','00000000-0000-4000-8000-0000000a7201','PQ bank fixture','bank','00000000-0000-4000-8000-0000000a7101');
update public.fin_members set entity_scope='entities' where user_id='00000000-0000-4000-8000-0000000a7104';
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7104','00000000-0000-4000-8000-0000000a7402','00000000-0000-4000-8000-0000000a7101');
create temporary table pq_fixture(key text primary key,id uuid);
grant all on pq_fixture to authenticated;
create or replace function pg_temp.fx(p_key text) returns uuid language sql as $$ select id from pq_fixture where key=p_key $$;
create or replace function pg_temp.as_user(p_user text) returns void language sql as $$ select set_config('request.jwt.claim.sub',p_user,true) $$;
create or replace function pg_temp.pq_expect_error(p_sql text,p_expected text) returns void language plpgsql as $$
begin
 begin execute p_sql;
 exception when others then
   if sqlerrm not like p_expected||'%' then raise exception 'unexpected failure: % (expected %)',sqlerrm,p_expected; end if;
   return;
 end;
 raise exception 'expected failure did not occur: %',p_sql;
end $$;
grant execute on function pg_temp.fx(text),pg_temp.as_user(text),pg_temp.pq_expect_error(text,text) to authenticated;
set role authenticated;

select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
insert into pq_fixture values('contract',public.fin_import_contract('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7401','00000000-0000-4000-8000-0000000a7301','credit','Contrato pós-award fictício',current_date-30,current_date+365,60,false,'BRL','{}',null));

insert into pq_fixture values('record',public.fin_record_spend(pg_temp.fx('contract'),null,jsonb_build_object('period_start',current_date-10,'period_end',current_date-1,'currency','BRL','value_kind','observed','amount','100.00','source_type','imported','source_reference','Arquivo 001','source_line','1','provenance','Extrato registrado manualmente com origem preservada')));
select pg_temp.pq_expect_error(format('select public.fin_reconcile_spend(%L,%L::jsonb)',pg_temp.fx('record'),'{"status":"confirmed","no_duplicate_confirmed":true,"reason":"Autorrevisão não permitida"}'),'spend independent review required');
select pg_temp.pq_expect_error(format('select public.fin_record_spend(%L,null,%L::jsonb)',pg_temp.fx('contract'),jsonb_build_object('period_start',current_date-10,'period_end',current_date-1,'currency','BRL','value_kind','observed','amount','100','source_type','imported','source_reference','Arquivo 001','source_line','1','provenance','Duplicata com mesma referência e linha')),'spend conflict');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7107');
select public.fin_reconcile_spend(pg_temp.fx('record'),'{"status":"confirmed","no_duplicate_confirmed":true,"reason":"Conferido com outras fontes e tarifas do contrato"}');
do $$ declare x jsonb;begin
 x:=public.fin_spend_summary('00000000-0000-4000-8000-0000000a7201',current_date-20,current_date);
 if not exists(select 1 from jsonb_array_elements(x->'rows') r where r->>'value_kind'='verified' and r->>'currency'='BRL' and (r->>'amount')::numeric=100) then raise exception 'verified total missing';end if;
 x:=public.fin_spend_summary('00000000-0000-4000-8000-0000000a7201',current_date-5,current_date);
 if exists(select 1 from jsonb_array_elements(x->'rows') r where r->>'amount' is not null) then raise exception 'partial-period amount invented';end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
insert into pq_fixture values('correction',public.fin_record_spend(pg_temp.fx('contract'),pg_temp.fx('record'),jsonb_build_object('period_start',current_date-10,'period_end',current_date-1,'currency','BRL','value_kind','observed','amount','95','source_type','imported','source_reference','Arquivo 001','source_line','1','provenance','Correção do documento de origem conferida','correction_reason','Valor do arquivo corrigido com evidência')));
insert into pq_fixture values('estimate',public.fin_record_spend(pg_temp.fx('contract'),null,jsonb_build_object('period_start',current_date-10,'period_end',current_date-1,'currency','USD','value_kind','estimated','amount','200','source_type','declared','source_reference','Orçamento estimado','source_line','1','provenance','Estimativa declarada pela empresa sem conversão')));
do $$ begin
 if exists(select 1 from public.fin_spend_monitor where id=pg_temp.fx('record')) then raise exception 'superseded record double counted';end if;
 if (select count(*) from public.fin_spend_records where source_reference='Arquivo 001')<>2 then raise exception 'correction overwrote history';end if;
 if exists(select 1 from public.fin_spend_monitor where id=pg_temp.fx('correction') and included) then raise exception 'old review reused for correction';end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7107');
select public.fin_reconcile_spend(pg_temp.fx('correction'),'{"status":"confirmed","no_duplicate_confirmed":true,"reason":"Correção conferida sem duplicata entre fontes"}');
select public.fin_reconcile_spend(pg_temp.fx('estimate'),'{"status":"confirmed","no_duplicate_confirmed":true,"reason":"Estimativa conferida com método e origem preservados"}');
do $$ declare x jsonb;begin
 x:=public.fin_spend_summary('00000000-0000-4000-8000-0000000a7201',current_date-20,current_date);
 if jsonb_array_length(x->'rows')<>2 or not exists(select 1 from jsonb_array_elements(x->'rows')r where r->>'currency'='BRL' and r->>'value_kind'='verified' and (r->>'amount')::numeric=95) or not exists(select 1 from jsonb_array_elements(x->'rows')r where r->>'currency'='USD' and r->>'value_kind'='estimated' and (r->>'amount')::numeric=200) then raise exception 'currencies or value kinds mixed';end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7104');
do $$ begin if exists(select 1 from public.fin_spend_monitor) or exists(select 1 from public.fin_spend_reconciliations) then raise exception 'entity spend leak';end if;end $$;
select pg_temp.pq_expect_error(format('select public.fin_reconcile_spend(%L,%L::jsonb)',pg_temp.fx('correction'),'{}'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7105');
do $$ begin if exists(select 1 from public.fin_spend_records) then raise exception 'tenant spend leak';end if;end $$;
reset role;rollback;

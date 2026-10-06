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

insert into pq_fixture values('dimension',public.fin_performance_dimension('00000000-0000-4000-8000-0000000a7201','{"dimension_key":"service_sla","title":"SLA contratual","metric":"sla_adherence","unit":"percent","methodology":"Entregas pontuais sobre entregas previstas no contrato"}'));
insert into pq_fixture values('period',public.fin_open_performance_period(pg_temp.fx('contract'),jsonb_build_object('title','Performance do contrato','period_start',current_date-20,'period_end',current_date-1,'review_due_on',current_date,'dimensions',jsonb_build_array(jsonb_build_object('dimension_id',pg_temp.fx('dimension'),'operator','ge','threshold','95','source_reference','Cláusula 10 SLA')))));
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7102');
insert into pq_fixture values('observation',public.fin_measure_performance(pg_temp.fx('period'),pg_temp.fx('dimension'),null,jsonb_build_object('source_type','declared','value','90','availability','measured','source_reference','Relatório operacional 01','provenance','Dez entregas previstas; nove entregues pontualmente','coverage_numerator',10,'coverage_denominator',10,'observed_on',current_date-1)));
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
insert into pq_fixture values('review',public.fin_review_performance(pg_temp.fx('observation'),'{"status":"confirmed","reason":"Fonte e cálculo conferidos independentemente"}'));
do $$ begin
 if not exists(select 1 from public.fin_provider_performance_monitor where period_id=pg_temp.fx('period') and target_met=false and actual='90') then raise exception 'factual target comparison missing';end if;
 if not exists(select 1 from public.fin_search('00000000-0000-4000-8000-0000000a7201','Performance','performance',12,0)) then raise exception 'search missing';end if;
 if not exists(select 1 from public.fin_graph_objects where object_type='performance' and object_id=pg_temp.fx('period')::text) then raise exception 'graph missing';end if;
end $$;

-- Unsupported automatic metrics cannot turn forged values into measured facts.
insert into pq_fixture values('correction',public.fin_measure_performance(pg_temp.fx('period'),pg_temp.fx('dimension'),pg_temp.fx('observation'),jsonb_build_object('source_type','internal','value','100','availability','measured','source_reference','Consulta interna sem fonte SLA','provenance','A fonte interna ainda não possui dados defensáveis','coverage_numerator',10,'coverage_denominator',10,'observed_on',current_date-1,'correction_reason','Registrar ausência de fonte verificável')));
select pg_temp.pq_expect_error(format('select public.fin_review_performance(%L,%L::jsonb)',pg_temp.fx('correction'),'{"status":"not_available","reason":"Mesma pessoa tentando revisar"}'),'performance independent review required');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7107');
select public.fin_review_performance(pg_temp.fx('correction'),'{"status":"not_available","reason":"Ausência de fonte conferida por revisor independente"}');
do $$ begin
 if not exists(select 1 from public.fin_provider_performance_monitor where period_id=pg_temp.fx('period') and actual is null and target_met is null and verification_status='not_available') then raise exception 'missing source became zero or compliance';end if;
 if (select count(*) from public.fin_provider_performance_observations where period_id=pg_temp.fx('period'))<>2 then raise exception 'correction overwrote evidence';end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select pg_temp.pq_expect_error(format('select public.fin_close_performance(%L,1,%L::jsonb)',pg_temp.fx('period'),'{"confirm":true,"reason":"Fechamento confirmado pela empresa"}'),'performance conflict');
select public.fin_close_performance(pg_temp.fx('period'),5,'{"confirm":true,"reason":"Fechamento confirmado pela empresa"}');
select pg_temp.pq_expect_error(format('select public.fin_measure_performance(%L,%L,%L,%L::jsonb)',pg_temp.fx('period'),pg_temp.fx('dimension'),pg_temp.fx('observation'),'{}'),'performance period closed');

insert into pq_fixture values('replacement',public.fin_open_performance_period(pg_temp.fx('contract'),jsonb_build_object('title','Correção de período fechado','period_start',current_date-20,'period_end',current_date-1,'review_due_on',current_date,'previous_period_id',pg_temp.fx('period'),'dimensions',jsonb_build_array(jsonb_build_object('dimension_id',pg_temp.fx('dimension'),'source_reference','Cláusula 10 preservada')))));
-- Exercise all existing internal adapters even with empty cohorts: runtime columns, no invented data.
do $$ declare metric text;d uuid;p uuid;f jsonb;begin
 foreach metric in array array['implementation_timeliness','issue_resolution','fee_accuracy','obligation_responsiveness'] loop
 d:=public.fin_performance_dimension('00000000-0000-4000-8000-0000000a7201',jsonb_build_object('dimension_key',metric,'title',metric,'metric',metric,'unit',case when metric='issue_resolution' then 'days' else 'percent' end,'methodology','Fonte interna registrada com cobertura explícita'));
 p:=public.fin_open_performance_period(pg_temp.fx('contract'),jsonb_build_object('title','Teste interno '||metric,'period_start',current_date-(array_position(array['implementation_timeliness','issue_resolution','fee_accuracy','obligation_responsiveness'],metric)*30),'period_end',current_date-(array_position(array['implementation_timeliness','issue_resolution','fee_accuracy','obligation_responsiveness'],metric)*30)+1,'review_due_on',current_date,'dimensions',jsonb_build_array(jsonb_build_object('dimension_id',d,'source_reference','Teste de fontes internas'))));
 f:=public.fin_performance_source(p,d);
 if f->>'availability'<>'not_available' or f->>'value' is not null then raise exception 'empty internal cohort fabricated data';end if;

 end loop;

end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7104');
do $$ begin if exists(select 1 from public.fin_provider_performance_periods) or exists(select 1 from public.fin_provider_performance_observations) then raise exception 'entity leak';end if;end $$;
select pg_temp.pq_expect_error(format('select public.fin_close_performance(%L,3,%L::jsonb)',pg_temp.fx('period'),'{}'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7105');
do $$ begin if exists(select 1 from public.fin_provider_performance_dimensions) or exists(select 1 from public.fin_provider_performance_monitor) then raise exception 'tenant leak';end if;end $$;
reset role;
rollback;

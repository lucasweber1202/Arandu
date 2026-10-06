\set ON_ERROR_STOP on
-- OD-01: covenant/performance candidates open opportunities without aborting the engine; synthetic fixtures.
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
-- Covenant due within the lead window and a performance period past review: both
-- emit period-scoped discriminators (uuid and uuid:uuid shapes).
insert into pq_fixture values('obligation',public.fin_open_obligation(pg_temp.fx('contract'),jsonb_build_object('title','Covenant em janela de aviso','kind','financial_covenant','source_clause','Cláusula 10.2','source_reference','CONTRACT-OD','frequency','once','first_period_start',current_date-40,'first_period_end',current_date-10,'first_due_on',current_date+5,'metric','Dívida líquida / EBITDA','operator','le','threshold',3,'unit','ratio')));
insert into pq_fixture select 'period',id from public.fin_obligation_periods where obligation_id=pg_temp.fx('obligation');
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000a7201','covenant_due',0,'{"enabled":true,"parameters":{"cooldown_days":30,"lead_days":30},"reason":"Monitoramento contratual periódico"}');
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000a7201','covenant_awaiting_data',0,'{"enabled":true,"parameters":{"cooldown_days":30,"lead_days":30},"reason":"Monitoramento contratual periódico"}');
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000a7201','performance_review_due',0,'{"enabled":true,"parameters":{"cooldown_days":30},"reason":"Revisão periódica de performance"}');
insert into pq_fixture values('dimension',public.fin_performance_dimension('00000000-0000-4000-8000-0000000a7201','{"dimension_key":"service_sla","title":"SLA contratual","metric":"sla_adherence","unit":"percent","methodology":"Entregas pontuais sobre entregas previstas no contrato"}'));
insert into pq_fixture values('perf_period',public.fin_open_performance_period(pg_temp.fx('contract'),jsonb_build_object('title','Performance vencida','period_start',current_date-20,'period_end',current_date-1,'review_due_on',current_date,'dimensions',jsonb_build_array(jsonb_build_object('dimension_id',pg_temp.fx('dimension'),'operator','ge','threshold','95','source_reference','Cláusula 10 SLA')))));
reset role;
select set_config('request.jwt.claim.sub','',true);
-- Antes de OD-01 a primeira chamada abortava com fin_opportunities_discriminator_check.
select public.fin_run_opportunity_engine(current_date, 50);
select public.fin_run_opportunity_engine(current_date, 50);
do $$ begin
 if (select count(*) from public.fin_opportunities where organization_id='00000000-0000-4000-8000-0000000a7201' and opportunity_type='covenant_due' and discriminator=pg_temp.fx('period')::text)<>1 then raise exception 'covenant opportunity missing or duplicated';end if;
 if (select count(*) from public.fin_opportunities where organization_id='00000000-0000-4000-8000-0000000a7201' and opportunity_type='performance_review_due' and discriminator=pg_temp.fx('perf_period')::text)<>1 then raise exception 'performance opportunity missing or duplicated';end if;
 if exists(select 1 from public.fin_opportunities where organization_id='00000000-0000-4000-8000-0000000a7202') then raise exception 'opportunity leaked to another tenant';end if;
end $$;
-- A regra continua fechada: texto livre, minúsculas fora de UUID e UUID malformado são recusados.
select pg_temp.pq_expect_error($q$update public.fin_opportunities set discriminator='periodo-livre' where false$q$ || '; insert into public.fin_opportunities(organization_id,opportunity_type,rule_id,rule_version,rule_snapshot,facts_snapshot,current_facts,facts_hash,source_object_type,source_object_id,discriminator,fingerprint,possible_action) select organization_id,opportunity_type,rule_id,rule_version,rule_snapshot,facts_snapshot,current_facts,facts_hash,source_object_type,source_object_id,''periodo-livre'',md5(random()::text),possible_action from public.fin_opportunities limit 1','new row for relation "fin_opportunities" violates check constraint "fin_opportunities_discriminator_check"');
select pg_temp.pq_expect_error('insert into public.fin_opportunities(organization_id,opportunity_type,rule_id,rule_version,rule_snapshot,facts_snapshot,current_facts,facts_hash,source_object_type,source_object_id,discriminator,fingerprint,possible_action) select organization_id,opportunity_type,rule_id,rule_version,rule_snapshot,facts_snapshot,current_facts,facts_hash,source_object_type,source_object_id,''00000000-0000-4000-8000-0000000a7201:x'',md5(random()::text),possible_action from public.fin_opportunities limit 1','new row for relation "fin_opportunities" violates check constraint "fin_opportunities_discriminator_check"');
rollback;

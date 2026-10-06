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
insert into pq_fixture values('plan',public.fin_open_implementation(pg_temp.fx('contract'),jsonb_build_object('title','Implantação crédito fictícia','starts_on',current_date-20,'target_go_live',current_date-1,'source_reference','CONTRACT-01')));
do $$ begin
 if (select count(*) from public.fin_implementation_milestones where plan_id=pg_temp.fx('plan'))<>10 then raise exception 'credit template incomplete'; end if;
 if (select count(*) from public.fin_implementation_dependencies where plan_id=pg_temp.fx('plan'))<>9 then raise exception 'dependencies incomplete'; end if;
 if (select count(*) from public.fin_tasks where related_id=pg_temp.fx('contract') and title like 'Implantação:%')<>10 then raise exception 'tasks missing'; end if;
 if not exists(select 1 from public.fin_notifications where event_id=pg_temp.fx('plan')) then raise exception 'assignment notification missing'; end if;
 if not exists(select 1 from public.fin_graph_objects where object_type='implementation' and object_id=pg_temp.fx('plan')::text) then raise exception 'graph missing'; end if;
 if not exists(select 1 from public.fin_search('00000000-0000-4000-8000-0000000a7201','Implantação','implementation',12,0)) then raise exception 'search missing'; end if;
end $$;
select pg_temp.pq_expect_error(format('select public.fin_open_implementation(%L,%L::jsonb)',pg_temp.fx('contract'),'{"title":"Duplicated","starts_on":"2026-01-01","target_go_live":"2026-02-01","source_reference":"Source"}'),'implementation already exists');
insert into pq_fixture select 'last',id from public.fin_implementation_milestones where plan_id=pg_temp.fx('plan') order by position desc limit 1;
select pg_temp.pq_expect_error(format('select public.fin_update_implementation_milestone(%L,1,%L::jsonb)',pg_temp.fx('last'),'{"status":"completed","evidence_reference":"FAKE-EARLY"}'),'implementation dependency pending');
select pg_temp.pq_expect_error(format('select public.fin_update_implementation_milestone(%L,999,%L::jsonb)',pg_temp.fx('last'),'{"status":"planned"}'),'implementation conflict');
select pg_temp.pq_expect_error(format('select public.fin_accept_implementation(%L,1,%L::jsonb)',pg_temp.fx('plan'),'{"confirm":true}'),'implementation not ready');

-- Buyer roles and entity, tenant, provider boundaries, direct writes.
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7103');
do $$ begin if (select count(*) from public.fin_implementation_plans)<>1 then raise exception 'viewer cannot read'; end if; end $$;
select pg_temp.pq_expect_error(format('select public.fin_update_implementation_milestone(%L,1,%L::jsonb)',pg_temp.fx('last'),'{"status":"planned"}'),'forbidden');
select pg_temp.pq_expect_error('update public.fin_implementation_plans set status=''accepted''','permission denied');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7104');
do $$ begin if exists(select 1 from public.fin_implementation_plans) or exists(select 1 from public.fin_implementation_milestones) or exists(select 1 from public.fin_search('00000000-0000-4000-8000-0000000a7201','Implantação','implementation',12,0)) then raise exception 'entity leak'; end if; end $$;
select pg_temp.pq_expect_error(format('select public.fin_implementation_issue(%L,null,%L::jsonb)',pg_temp.fx('plan'),'{"title":"Attack","due_on":"2026-12-01"}'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7105');
do $$ begin if exists(select 1 from public.fin_implementation_plans) or exists(select 1 from public.fin_implementation_dependencies) then raise exception 'tenant leak'; end if; end $$;
select pg_temp.pq_expect_error(format('select public.fin_cancel_implementation(%L,1,%L)',pg_temp.fx('plan'),'Forged tenant cancellation'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7106');
do $$ begin if exists(select 1 from public.fin_implementation_plans) or exists(select 1 from public.fin_implementation_acceptances) then raise exception 'provider leak'; end if; end $$;
select pg_temp.pq_expect_error(format('select public.fin_open_implementation(%L,%L::jsonb)',pg_temp.fx('contract'),'{}'),'forbidden');

-- Analysts work on milestones; no authority to accept go-live.
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7102');
insert into pq_fixture values('issue',public.fin_implementation_issue(pg_temp.fx('plan'),null,jsonb_build_object('title','Disponibilidade não confirmada','due_on',current_date+1)));
do $$ begin if (select status from public.fin_implementation_plans where id=pg_temp.fx('plan'))<>'blocked' then raise exception 'issue does not block'; end if; end $$;
select public.fin_implementation_issue(pg_temp.fx('plan'),pg_temp.fx('issue'),'{"resolution_reference":"BANK-CONFIRMATION-1"}');
select pg_temp.pq_expect_error(format('select public.fin_accept_implementation(%L,1,%L::jsonb)',pg_temp.fx('plan'),'{"confirm":true}'),'forbidden');
-- Missing evidence is never completion.
insert into pq_fixture select 'first',id from public.fin_implementation_milestones where plan_id=pg_temp.fx('plan') order by position limit 1;
select pg_temp.pq_expect_error(format('select public.fin_update_implementation_milestone(%L,1,%L::jsonb)',pg_temp.fx('first'),'{"status":"completed"}'),'new row for relation');
select pg_temp.pq_expect_error(format('select public.fin_update_implementation_milestone(%L,1,%L::jsonb)',pg_temp.fx('first'),'{"status":"planned","organization_id":"00000000-0000-4000-8000-0000000a7202"}'),'invalid implementation input');
do $$ declare m record; begin
 for m in select * from public.fin_implementation_milestones where plan_id=pg_temp.fx('plan') order by position loop
 perform public.fin_update_implementation_milestone(m.id,m.version,jsonb_build_object('status','completed','evidence_reference','EVIDENCE-'||m.position));
 end loop;
 if (select status from public.fin_implementation_plans where id=pg_temp.fx('plan'))<>'ready_for_acceptance' then raise exception 'readiness failed'; end if;
end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select pg_temp.pq_expect_error(format('select public.fin_accept_implementation(%L,%s,%L::jsonb)',pg_temp.fx('plan'),(select version from public.fin_implementation_plans where id=pg_temp.fx('plan')),'{"actual_go_live":"2026-01-01","evidence_reference":"NO-CONFIRM"}'),'implementation confirmation required');
insert into pq_fixture select 'acceptance',public.fin_accept_implementation(pg_temp.fx('plan'),version,jsonb_build_object('confirm',true,'actual_go_live',current_date,'evidence_reference','HANDOFF-1')) from public.fin_implementation_plans where id=pg_temp.fx('plan');
do $$ begin
 if not exists(select 1 from public.fin_implementation_plans where id=pg_temp.fx('plan') and status='accepted' and actual_go_live=current_date) then raise exception 'acceptance not saved'; end if;
 if exists(select 1 from public.fin_value_records where contract_id=pg_temp.fx('contract')) then raise exception 'acceptance invented savings'; end if;
 if not exists(select 1 from public.fin_events where event_type='implementation_accepted' and entity_id=pg_temp.fx('contract')) then raise exception 'audit missing'; end if;
end $$;
-- Acquiring template, reminders, factual opportunities and cancellation provenance.
insert into pq_fixture values('acquiring_contract',public.fin_import_contract('00000000-0000-4000-8000-0000000a7201','00000000-0000-4000-8000-0000000a7401','00000000-0000-4000-8000-0000000a7301','acquiring','Contrato acquiring fictício',current_date-30,current_date+365,60,false,'BRL','{}',null));
insert into pq_fixture values('acquiring_plan',public.fin_open_implementation(pg_temp.fx('acquiring_contract'),jsonb_build_object('title','Implantação acquiring fictícia','starts_on',current_date-20,'target_go_live',current_date-1,'source_reference','ACQ-01')));
do $$ begin if (select count(*) from public.fin_implementation_milestones where plan_id=pg_temp.fx('acquiring_plan'))<>8 then raise exception 'acquiring template incomplete'; end if; end $$;
select pg_temp.pq_expect_error(format('select public.fin_update_implementation_milestone(%L,1,%L::jsonb)',(select id from public.fin_implementation_milestones where plan_id=pg_temp.fx('acquiring_plan') and position=1),'{"owner_id":"00000000-0000-4000-8000-0000000a7104"}'),'invalid implementation owner');
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000a7201','implementation_overdue',0,'{"enabled":true,"parameters":{"cooldown_days":30},"reason":"Revisão operacional do cliente"}');
reset role;
select set_config('request.jwt.claim.sub','',true);
select public.fin_run_contract_milestones(current_date);
select public.fin_run_contract_milestones(current_date);
do $$ begin
 if (select count(*) from public.fin_notifications where event_id in(select id from public.fin_implementation_milestones where plan_id=pg_temp.fx('acquiring_plan')) and event_type='task_assigned')<>8 then raise exception 'reminders not idempotent'; end if;
 if not exists(select 1 from public.fin_opportunity_candidates('00000000-0000-4000-8000-0000000a7201',current_date) where rule_key='implementation_overdue' and source_id=pg_temp.fx('acquiring_contract')) then raise exception 'overdue opportunity missing'; end if;
 if not exists(select 1 from public.fin_governance_export_datasets() where dataset='implementation_acceptances') then raise exception 'export missing'; end if;
end $$;
select pg_temp.pq_expect_error(format('insert into public.fin_implementation_dependencies values(%L,%L,%L,%L)','00000000-0000-4000-8000-0000000a7201',pg_temp.fx('acquiring_plan'),(select id from public.fin_implementation_milestones where plan_id=pg_temp.fx('acquiring_plan') and position=1),(select id from public.fin_implementation_milestones where plan_id=pg_temp.fx('acquiring_plan') and position=2)),'invalid implementation dependency');
set role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select public.fin_cancel_implementation(pg_temp.fx('acquiring_plan'),1,'Cancelamento aprovado pela tesouraria');
do $$ begin if (select cancellation_reason from public.fin_implementation_plans where id=pg_temp.fx('acquiring_plan'))<>'Cancelamento aprovado pela tesouraria' then raise exception 'cancellation reason lost'; end if; end $$;
-- Revocation is checked live, even with retained JWT claims.
reset role;
delete from public.fin_members where organization_id='00000000-0000-4000-8000-0000000a7201' and user_id='00000000-0000-4000-8000-0000000a7102';
set role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7102');
do $$ begin if exists(select 1 from public.fin_implementation_plans) then raise exception 'revoked read'; end if; end $$;
select pg_temp.pq_expect_error(format('select public.fin_cancel_implementation(%L,1,%L)',pg_temp.fx('plan'),'Revoked member cancellation'),'forbidden');
reset role;
select set_config('request.jwt.claim.sub','',true);
-- Reapply guard doesn't permit destructive rollback of a used capability.
select pg_temp.pq_expect_error('delete from public.fin_implementation_acceptances','immutable record');
rollback;

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
insert into pq_fixture values('obligation',public.fin_open_obligation(pg_temp.fx('contract'),jsonb_build_object('title','Covenant de alavancagem','kind','financial_covenant','source_clause','Cláusula 10.2','source_reference','CONTRACT-01','frequency','monthly','first_period_start',date_trunc('month',current_date)-interval '2 months','first_period_end',date_trunc('month',current_date)-interval '1 month'-interval '1 day','first_due_on',date_trunc('month',current_date)-interval '1 month'+interval '4 days','metric','Dívida líquida / EBITDA','operator','le','threshold',3,'unit','ratio','grace_days',2)));
insert into pq_fixture select 'period',id from public.fin_obligation_periods where obligation_id=pg_temp.fx('obligation');
do $$ declare f jsonb;begin
 f:=public.fin_obligation_facts(pg_temp.fx('period'),current_date);
 if f->>'status'<>'awaiting_data' or f->>'factual_result' is not null or (f->>'has_data')::boolean then raise exception 'missing data invented compliance';end if;
 if not exists(select 1 from public.fin_graph_objects where object_type='covenant' and object_id=pg_temp.fx('period')::text) then raise exception 'covenant graph missing';end if;
 if not exists(select 1 from public.fin_search('00000000-0000-4000-8000-0000000a7201','alavancagem','covenant',12,0)) then raise exception 'covenant search missing';end if;
end $$;
select pg_temp.pq_expect_error(format('select public.fin_review_obligation(%L,null,%L::jsonb)',pg_temp.fx('period'),'{"status":"compliant","reason":"Dados não fornecidos"}'),'obligation data missing');
-- Starting a review without evidence still leaves the effective state awaiting data.
insert into pq_fixture values('empty_review',public.fin_review_obligation(pg_temp.fx('period'),null,'{"status":"under_review","reason":"Solicitação de dados à empresa"}'));
do $$ begin if public.fin_obligation_facts(pg_temp.fx('period'),current_date)->>'status'<>'awaiting_data' then raise exception 'review hid missing data';end if;end $$;
select pg_temp.pq_expect_error(format('select public.fin_open_obligation(%L,%L::jsonb)',pg_temp.fx('contract'),'{"title":"Covenant falsificado","kind":"financial_covenant","organization_id":"00000000-0000-4000-8000-0000000a7202"}'),'invalid obligation input');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7103');
do $$ begin if not exists(select 1 from public.fin_obligation_monitor where id=pg_temp.fx('period')) then raise exception 'viewer cannot read';end if;end $$;
select pg_temp.pq_expect_error(format('select public.fin_record_obligation_data(%L,%L::jsonb)',pg_temp.fx('period'),'{}'),'forbidden');
select pg_temp.pq_expect_error('update public.fin_obligations set status=''cancelled''','permission denied');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7104');
do $$ begin if exists(select 1 from public.fin_obligations) or exists(select 1 from public.fin_obligation_monitor) or public.fin_obligation_facts(pg_temp.fx('period'),current_date) is not null then raise exception 'entity leak';end if;end $$;
select pg_temp.pq_expect_error(format('select public.fin_covenant_waiver(%L,null,null,%L::jsonb)',pg_temp.fx('period'),'{}'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7105');
do $$ begin if exists(select 1 from public.fin_obligation_periods) or exists(select 1 from public.fin_obligation_reviews) then raise exception 'tenant leak';end if;end $$;
select pg_temp.pq_expect_error(format('select public.fin_cancel_obligation(%L,1,%L)',pg_temp.fx('obligation'),'Forged cancellation'),'forbidden');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7106');
do $$ begin if exists(select 1 from public.fin_obligations) or exists(select 1 from public.fin_covenants) or exists(select 1 from public.fin_obligation_evidence) then raise exception 'provider leak';end if;end $$;
-- Recorder cannot mark its own facts compliant. A false comparison cannot be overridden.
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
insert into pq_fixture values('measurement',public.fin_record_obligation_data(pg_temp.fx('period'),jsonb_build_object('measured_value',4,'measured_on',current_date,'source_reference','CFO-REPORT-01','provenance','Demonstração financeira aprovada pela empresa')));
do $$ begin if public.fin_obligation_facts(pg_temp.fx('period'),current_date)->>'status'<>'under_review' then raise exception 'measurement auto approved';end if;end $$;
select pg_temp.pq_expect_error(format('select public.fin_review_obligation(%L,%L,%L::jsonb)',pg_temp.fx('period'),pg_temp.fx('empty_review'),jsonb_build_object('status','non_compliant','reason','Covenant não atendido','measurement_id',pg_temp.fx('measurement'))),'obligation independent reviewer required');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7107');
select pg_temp.pq_expect_error(format('select public.fin_review_obligation(%L,%L,%L::jsonb)',pg_temp.fx('period'),pg_temp.fx('empty_review'),jsonb_build_object('status','compliant','reason','Tentativa de ignorar métrica','measurement_id',pg_temp.fx('measurement'))),'obligation factual result mismatch');
insert into pq_fixture values('review',public.fin_review_obligation(pg_temp.fx('period'),pg_temp.fx('empty_review'),jsonb_build_object('status','non_compliant','reason','Covenant não atendido após revisão','measurement_id',pg_temp.fx('measurement'))));
do $$ begin if public.fin_obligation_facts(pg_temp.fx('period'),current_date)->>'status'<>'non_compliant' then raise exception 'review not reflected';end if;end $$;
select pg_temp.pq_expect_error(format('select public.fin_review_obligation(%L,null,%L::jsonb)',pg_temp.fx('period'),'{"status":"under_review","reason":"Versão antiga do review"}'),'obligation conflict');
insert into pq_fixture values('waiver',public.fin_covenant_waiver(pg_temp.fx('period'),null,null,jsonb_build_object('valid_until',current_date+10,'reason','Exceção autorizada pelo credor','controls','Reporte semanal e monitoramento independente')));
select pg_temp.pq_expect_error(format('select public.fin_covenant_waiver(%L,%L,1,%L::jsonb)',pg_temp.fx('period'),pg_temp.fx('waiver'),'{"status":"approved","decision_reason":"Aprovada pela mesma pessoa"}'),'waiver independent reviewer required');
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select public.fin_covenant_waiver(pg_temp.fx('period'),pg_temp.fx('waiver'),1,'{"status":"approved","decision_reason":"Exceção revisada e aprovada com evidência do credor"}');
do $$ begin
 if public.fin_obligation_facts(pg_temp.fx('period'),current_date)->>'status'<>'waived' then raise exception 'approved waiver missing';end if;
 if (public.fin_obligation_facts(pg_temp.fx('period'),current_date)->>'factual_result')::boolean then raise exception 'waiver rewrote factual comparison';end if;
 if public.fin_obligation_facts(pg_temp.fx('period'),current_date+11)->>'status'<>'non_compliant' then raise exception 'expired waiver establishes compliance';end if;
end $$;
-- New data preserves the prior review and reopens review after waiver expiry.
insert into pq_fixture values('measurement2',public.fin_record_obligation_data(pg_temp.fx('period'),jsonb_build_object('measured_value',2,'measured_on',current_date,'source_reference','CFO-REPORT-02','provenance','Reapuração financeira aprovada pela empresa')));
do $$ begin if public.fin_obligation_facts(pg_temp.fx('period'),current_date+11)->>'status'<>'under_review' then raise exception 'new measurement reused old review';end if;end $$;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7107');
select pg_temp.pq_expect_error(format('select public.fin_review_obligation(%L,%L,%L::jsonb)',pg_temp.fx('period'),pg_temp.fx('review'),jsonb_build_object('status','non_compliant','reason','Uso de medição antiga recusado','measurement_id',pg_temp.fx('measurement'))),'obligation stale data');
select public.fin_review_obligation(pg_temp.fx('period'),pg_temp.fx('review'),jsonb_build_object('status','compliant','reason','Limiar atendido na reapuração independente','measurement_id',pg_temp.fx('measurement2')));
-- Decimal boundary remains exact through SQL comparison and JSON transport.
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select public.fin_record_obligation_data(pg_temp.fx('period'),jsonb_build_object('measured_value','3.00000000000000001','measured_on',current_date,'source_reference','CFO-EXACT-DECIMAL','provenance','Reapuração decimal sem arredondamento de fronteira'));
do $$ declare f jsonb;begin
 f:=public.fin_obligation_facts(pg_temp.fx('period'),current_date+11);
 if f->>'measured_value'<>'3.00000000000000001' or f->>'threshold'<>'3' or (f->>'factual_result')::boolean then raise exception 'decimal precision lost';end if;
end $$;
-- Reporting covenant: needs evidence of delivery, not a made-up number.
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
insert into pq_fixture values('reporting',public.fin_open_obligation(pg_temp.fx('contract'),jsonb_build_object('title','Entrega de demonstrações','kind','reporting_covenant','source_clause','Cláusula 12.1','source_reference','REPORT-CLAUSE-01','frequency','once','first_period_start',current_date-20,'first_period_end',current_date-10,'first_due_on',current_date-1)));
insert into pq_fixture select 'report_period',id from public.fin_obligation_periods where obligation_id=pg_temp.fx('reporting');
select pg_temp.pq_expect_error(format('select public.fin_record_obligation_data(%L,%L::jsonb)',pg_temp.fx('report_period'),'{"measured_value":1,"source_reference":"Fake","provenance":"Métrica indevida"}'),'invalid obligation metric');
insert into pq_fixture values('evidence',public.fin_record_obligation_data(pg_temp.fx('report_period'),'{"source_reference":"REPORT-DELIVERED","provenance":"Protocolo de envio ao credor e documento entregue"}'));
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7107');
select public.fin_review_obligation(pg_temp.fx('report_period'),null,jsonb_build_object('status','compliant','reason','Protocolo de entrega conferido pela gestão','evidence_id',pg_temp.fx('evidence')));
-- Rules and reminders use existing leased job; recurring periods have independent state.
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000a7201','covenant_awaiting_data',0,'{"enabled":true,"parameters":{"cooldown_days":30,"lead_days":30},"reason":"Monitoramento contratual periódico"}');
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000a7201','waiver_expiry',0,'{"enabled":true,"parameters":{"cooldown_days":30,"lead_days":30},"reason":"Monitoramento contratual periódico"}');
reset role;
select set_config('request.jwt.claim.sub','',true);
select public.fin_run_obligations(current_date);
select public.fin_run_obligations(current_date);
do $$ begin
 if (select count(*) from public.fin_obligation_periods where obligation_id=pg_temp.fx('obligation'))<>3 then raise exception 'recurrence missing or duplicate';end if;
 if (select count(*) from public.fin_notifications where event_id in(select id from public.fin_obligation_periods where obligation_id=pg_temp.fx('obligation')))<>1 then raise exception 'recurring reminder duplicate';end if;
 if not exists(select 1 from public.fin_opportunity_candidates('00000000-0000-4000-8000-0000000a7201',current_date) where rule_key='covenant_awaiting_data') then raise exception 'awaiting opportunity missing';end if;
 if not exists(select 1 from public.fin_opportunity_candidates('00000000-0000-4000-8000-0000000a7201',current_date+11) where rule_key='waiver_expiry') then raise exception 'waiver expiry opportunity missing';end if;
 if not exists(select 1 from public.fin_governance_export_datasets() where dataset='covenant_measurements') then raise exception 'covenant export missing';end if;
end $$;
select pg_temp.pq_expect_error('update public.fin_covenant_measurements set measured_value=0','immutable record');
select pg_temp.pq_expect_error('delete from public.fin_obligation_reviews','immutable record');
set role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7101');
do $$ begin if jsonb_array_length(public.fin_obligation_summary('00000000-0000-4000-8000-0000000a7201',null)->'rows')=0 then raise exception 'executive summary missing';end if;end $$;
select public.fin_cancel_obligation(pg_temp.fx('reporting'),1,'Obrigação encerrada pela tesouraria');
select pg_temp.pq_expect_error(format('select public.fin_record_obligation_data(%L,%L::jsonb)',pg_temp.fx('report_period'),'{}'),'obligation closed');
reset role;
delete from public.fin_members where organization_id='00000000-0000-4000-8000-0000000a7201' and user_id='00000000-0000-4000-8000-0000000a7102';
set role authenticated;
select pg_temp.as_user('00000000-0000-4000-8000-0000000a7102');
do $$ begin if exists(select 1 from public.fin_obligations) or exists(select 1 from public.fin_covenant_measurements) then raise exception 'revoked member read';end if;end $$;
select pg_temp.pq_expect_error(format('select public.fin_record_obligation_data(%L,%L::jsonb)',pg_temp.fx('period'),'{}'),'forbidden');
reset role;
rollback;

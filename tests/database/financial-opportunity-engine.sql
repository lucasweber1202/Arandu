\set ON_ERROR_STOP on
-- P1.3 Opportunity Engine. Transaction-scoped fictitious fixtures; runs on
-- clean install and on the final fresh install. Evaluation day is fixed.
begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000ab101','opp-admin@example.invalid'),
('00000000-0000-4000-8000-0000000ab102','opp-viewer@example.invalid'),
('00000000-0000-4000-8000-0000000ab103','opp-other@example.invalid'),
('00000000-0000-4000-8000-0000000ab104','opp-provider@example.invalid'),
('00000000-0000-4000-8000-0000000ab105','opp-entity-b@example.invalid'),
('00000000-0000-4000-8000-0000000ab106','opp-fm1@example.invalid'),
('00000000-0000-4000-8000-0000000ab107','opp-fm2@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000ab201','Opportunity Fixture BUYER','BUYER','00000000-0000-4000-8000-0000000ab101'),
('00000000-0000-4000-8000-0000000ab202','Other Opportunity Fixture','BUYER','00000000-0000-4000-8000-0000000ab103'),
('00000000-0000-4000-8000-0000000ab203','Provider Opportunity Fixture','PROVIDER','00000000-0000-4000-8000-0000000ab104');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000ab201','00000000-0000-4000-8000-0000000ab101','admin'),
('00000000-0000-4000-8000-0000000ab201','00000000-0000-4000-8000-0000000ab102','viewer'),
('00000000-0000-4000-8000-0000000ab201','00000000-0000-4000-8000-0000000ab105','finance_manager'),
('00000000-0000-4000-8000-0000000ab201','00000000-0000-4000-8000-0000000ab106','finance_manager'),
('00000000-0000-4000-8000-0000000ab201','00000000-0000-4000-8000-0000000ab107','finance_manager'),
('00000000-0000-4000-8000-0000000ab202','00000000-0000-4000-8000-0000000ab103','admin'),
('00000000-0000-4000-8000-0000000ab203','00000000-0000-4000-8000-0000000ab104','admin');
insert into public.fin_legal_entities(id,organization_id,legal_name,created_by) values
('00000000-0000-4000-8000-0000000ab401','00000000-0000-4000-8000-0000000ab201','Opportunity Entity A','00000000-0000-4000-8000-0000000ab101'),
('00000000-0000-4000-8000-0000000ab402','00000000-0000-4000-8000-0000000ab201','Opportunity Entity B','00000000-0000-4000-8000-0000000ab101');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000ab301','00000000-0000-4000-8000-0000000ab201','Opportunity bank one','bank','00000000-0000-4000-8000-0000000ab101'),
('00000000-0000-4000-8000-0000000ab302','00000000-0000-4000-8000-0000000ab201','Opportunity bank two','bank','00000000-0000-4000-8000-0000000ab101');
update public.fin_members set entity_scope='entities' where user_id='00000000-0000-4000-8000-0000000ab105';
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
('00000000-0000-4000-8000-0000000ab201','00000000-0000-4000-8000-0000000ab105','00000000-0000-4000-8000-0000000ab402','00000000-0000-4000-8000-0000000ab101');
create temporary table opp_fixture(key text primary key,id uuid);
grant all on opp_fixture to authenticated;
create or replace function pg_temp.ox(p_key text) returns uuid language sql as $$ select id from opp_fixture where key=p_key $$;
create or replace function pg_temp.opp_expect_error(p_sql text,p_expected text) returns void language plpgsql as $$
begin
 begin execute p_sql;
 exception when others then
   if sqlerrm not like p_expected||'%' then raise exception 'unexpected failure: % (expected %)',sqlerrm,p_expected; end if;
   return;
 end;
 raise exception 'expected failure did not occur: %',p_sql;
end $$;
create or replace function pg_temp.opp(p_type text) returns public.fin_opportunities language sql as $$
 select * from public.fin_opportunities where organization_id='00000000-0000-4000-8000-0000000ab201' and opportunity_type=p_type order by rule_version desc, opened_at desc limit 1
$$;
grant execute on function pg_temp.ox(text),pg_temp.opp_expect_error(text,text),pg_temp.opp(text) to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab101',true);
-- Contract A: ends 2026-04-15, 30-day notice → notice date 2026-03-16.
insert into opp_fixture values('contract',public.fin_import_contract('00000000-0000-4000-8000-0000000ab201','00000000-0000-4000-8000-0000000ab401','00000000-0000-4000-8000-0000000ab301','credit','Opportunity contract A','2025-04-16','2026-04-15',30,false,'BRL','{}',null));
-- Rules are customer-owned and versioned; financial thresholds have no default.
select pg_temp.opp_expect_error(format('select public.fin_set_opportunity_rule(%L,%L,0,%L::jsonb)','00000000-0000-4000-8000-0000000ab201','provider_concentration','{"enabled":true,"parameters":{"cooldown_days":10},"reason":"Missing threshold"}'),'invalid opportunity rule');
select pg_temp.opp_expect_error(format('select public.fin_set_opportunity_rule(%L,%L,0,%L::jsonb)','00000000-0000-4000-8000-0000000ab201','contract_renewal','{"enabled":true,"parameters":{"lead_days":30,"invented":1},"reason":"Unknown parameter"}'),'invalid opportunity rule');
select pg_temp.opp_expect_error(format('select public.fin_set_opportunity_rule(%L,%L,0,%L::jsonb)','00000000-0000-4000-8000-0000000ab201','contract_renewal','{"enabled":true,"parameters":{"lead_days":30.5},"reason":"Fractional"}'),'invalid opportunity rule');
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000ab201','contract_renewal',0,'{"enabled":true,"parameters":{"lead_days":30,"cooldown_days":10},"reason":"Treasury renewal policy"}');
select pg_temp.opp_expect_error(format('select public.fin_set_opportunity_rule(%L,%L,0,%L::jsonb)','00000000-0000-4000-8000-0000000ab201','contract_renewal','{"enabled":true,"parameters":{"lead_days":30},"reason":"Stale version"}'),'opportunity rule version conflict');
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000ab201','provider_concentration',0,'{"enabled":true,"parameters":{"max_share_pct":60},"reason":"Board concentration policy"}');
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000ab201','facility_utilization',0,'{"enabled":true,"parameters":{"max_utilization_pct":90},"reason":"Treasury utilization policy"}');
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000ab201','facility_maturity',0,'{"enabled":true,"parameters":{"lead_days":120,"cooldown_days":0},"reason":"Maturity watch"}');
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000ab201','fee_variance_review',0,'{"enabled":true,"parameters":{"min_age_days":0,"cooldown_days":30},"reason":"Fee differences need a reviewer"}');
reset role;
insert into public.fin_facilities(id,organization_id,legal_entity_id,provider_id,kind,name,currency,approved_limit,maturity_on,status,created_by) values
('00000000-0000-4000-8000-0000000ab501','00000000-0000-4000-8000-0000000ab201','00000000-0000-4000-8000-0000000ab401','00000000-0000-4000-8000-0000000ab301','term_loan','Facility one','BRL',800,'2026-05-01','active','00000000-0000-4000-8000-0000000ab101'),
('00000000-0000-4000-8000-0000000ab502','00000000-0000-4000-8000-0000000ab201','00000000-0000-4000-8000-0000000ab402','00000000-0000-4000-8000-0000000ab302','term_loan','Facility two','BRL',200,'2027-05-01','active','00000000-0000-4000-8000-0000000ab101');
insert into public.fin_facility_balances(organization_id,facility_id,as_of,outstanding_amount,used_limit_amount,source,recorded_by) values
('00000000-0000-4000-8000-0000000ab201','00000000-0000-4000-8000-0000000ab501','2026-02-28',760,760,'declared','00000000-0000-4000-8000-0000000ab101');
-- Engine runs without a user (job/service path).
select set_config('request.jwt.claim.sub','',true);
do $$ declare o public.fin_opportunities; v_seen timestamptz; begin
 perform public.fin_evaluate_opportunities('00000000-0000-4000-8000-0000000ab201','2026-03-01');
 o := pg_temp.opp('contract_renewal');
 if o.id is null or o.status<>'open' or o.deadline<>'2026-03-16' or o.rule_version<>1 or o.facts_snapshot->>'notice_date'<>'2026-03-16' or (o.facts_snapshot->>'lead_days')::int<>30
    or o.source_object_type<>'contract' or o.legal_entity_id<>'00000000-0000-4000-8000-0000000ab401' or o.possible_action<>'open_sourcing' then raise exception 'renewal opportunity wrong: %',row_to_json(o); end if;
 if (pg_temp.opp('facility_utilization')).facts_snapshot->>'utilization_pct'<>'95.00' then raise exception 'utilization fact wrong'; end if;
 o := pg_temp.opp('provider_concentration');
 if o.discriminator<>'BRL' or o.legal_entity_id is not null or o.facts_snapshot->>'share_pct'<>'80.00' or o.provider_id<>'00000000-0000-4000-8000-0000000ab301' then raise exception 'concentration wrong: %',row_to_json(o); end if;
 if (pg_temp.opp('facility_maturity')).deadline<>'2026-05-01' then raise exception 'maturity wrong'; end if;
 if exists(select 1 from public.fin_opportunities where opportunity_type='facility_data_stale') then raise exception 'unconfigured rule fired'; end if;
 -- Repeated run: no duplicate, last_seen_at advances.
 v_seen := (pg_temp.opp('contract_renewal')).last_seen_at;
 perform pg_sleep(0.01);
 perform public.fin_evaluate_opportunities('00000000-0000-4000-8000-0000000ab201','2026-03-02');
 if (select count(*) from public.fin_opportunities where organization_id='00000000-0000-4000-8000-0000000ab201')<>4 then raise exception 'duplicate opportunity'; end if;
 if (pg_temp.opp('contract_renewal')).last_seen_at <= v_seen or (pg_temp.opp('contract_renewal')).facts_snapshot->>'observed_at'<>'2026-03-01' or (pg_temp.opp('contract_renewal')).current_facts->>'observed_at'<>'2026-03-02' then raise exception 'repeat run did not only refresh'; end if;
 if (select count(*) from public.fin_opportunity_events where event_type='opened')<>4 then raise exception 'opened events wrong'; end if;
end $$;
-- Scheduled entry point: service path only, bounded and resumable.
do $$ begin
 if public.fin_run_opportunity_engine('2026-03-02',50) <> 0 then raise exception 'idempotent job changed state'; end if;
 if not exists(select 1 from public.fin_opportunity_scans where organization_id='00000000-0000-4000-8000-0000000ab201' and last_day='2026-03-02') then raise exception 'scan cursor not advanced'; end if;
end $$;
select pg_temp.opp_expect_error('select public.fin_run_opportunity_engine(current_date,0)','invalid opportunity evaluation');

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab106',true);
select pg_temp.opp_expect_error('select public.fin_run_opportunity_engine(current_date,10)','permission denied');
select pg_temp.opp_expect_error(format('select public.fin_set_opportunity_rule(%L,%L,1,%L::jsonb)','00000000-0000-4000-8000-0000000ab201','contract_renewal','{"enabled":false,"parameters":{"lead_days":30},"reason":"Manager is not policy owner"}'),'forbidden');
-- State machine and reviewer.
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('contract_renewal')).id,'open','{"to_status":"acted","resolution":"Skipping review"}'),'invalid opportunity transition');
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('contract_renewal')).id,'acknowledged','{"to_status":"under_review"}'),'opportunity state conflict');
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('contract_renewal')).id,'open','{"to_status":"under_review","reviewer_id":"00000000-0000-4000-8000-0000000ab105"}'),'invalid opportunity reviewer');
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('contract_renewal')).id,'open','{"to_status":"under_review","reviewer_id":"00000000-0000-4000-8000-0000000ab102"}'),'invalid opportunity reviewer');
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('contract_renewal')).id,'open','{"to_status":"under_review","reviewer_id":"00000000-0000-4000-8000-0000000ab103"}'),'invalid opportunity reviewer');
select public.fin_transition_opportunity((pg_temp.opp('contract_renewal')).id,'open','{"to_status":"acknowledged","note":"Seen by treasury"}');
select public.fin_transition_opportunity((pg_temp.opp('contract_renewal')).id,'acknowledged','{"to_status":"under_review"}');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab107',true);
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('contract_renewal')).id,'under_review','{"to_status":"acted","resolution":"Not my review"}'),'invalid opportunity reviewer');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab106',true);
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('contract_renewal')).id,'under_review','{"to_status":"dismissed"}'),'invalid opportunity transition');
select public.fin_transition_opportunity((pg_temp.opp('contract_renewal')).id,'under_review','{"to_status":"dismissed","dismissal_reason":"already_handled","note":"Renewal negotiated outside"}');
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('contract_renewal')).id,'dismissed','{"to_status":"acknowledged"}'),'invalid opportunity transition');
-- Opportunity → RFQ draft only with explicit confirmation and only from a contract source.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab101',true);
select pg_temp.opp_expect_error(format('select public.fin_opportunity_start_rfq(%L,false)',(pg_temp.opp('facility_maturity')).id),'opportunity rfq requires confirmation');
select pg_temp.opp_expect_error(format('select public.fin_opportunity_start_rfq(%L,true)',(pg_temp.opp('facility_maturity')).id),'opportunity rfq unavailable');
select pg_temp.opp_expect_error(format('select public.fin_opportunity_start_rfq(%L,true)',(pg_temp.opp('contract_renewal')).id),'opportunity rfq unavailable');
reset role;

-- Cooldown holds while facts are unchanged; a material change reopens.
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 perform public.fin_evaluate_opportunities('00000000-0000-4000-8000-0000000ab201','2026-03-03');
 if (pg_temp.opp('contract_renewal')).status<>'dismissed' or (pg_temp.opp('contract_renewal')).cooldown_until <= now() + interval '9 days' then raise exception 'cooldown not respected'; end if;
 update public.fin_contracts set renewal_notice_days=20 where id=pg_temp.ox('contract');
 perform public.fin_evaluate_opportunities('00000000-0000-4000-8000-0000000ab201','2026-03-03');
 if (pg_temp.opp('contract_renewal')).status<>'open' or (pg_temp.opp('contract_renewal')).reopen_count<>1 or (pg_temp.opp('contract_renewal')).facts_snapshot->>'notice_date'<>'2026-03-26' then raise exception 'material change did not reopen'; end if;
 if not exists(select 1 from public.fin_opportunity_events where opportunity_id=(pg_temp.opp('contract_renewal')).id and event_type='reopened' and note='material facts changed') then raise exception 'reopen reason missing'; end if;
 if (select facts->>'notice_date' from public.fin_opportunity_events where opportunity_id=(pg_temp.opp('contract_renewal')).id and event_type='opened')<>'2026-03-16' then raise exception 'historical reason rewritten'; end if;
end $$;
-- Expired cooldown reopens an unchanged fact.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab101',true);
select public.fin_transition_opportunity((pg_temp.opp('contract_renewal')).id,'open','{"to_status":"dismissed","dismissal_reason":"not_relevant"}');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.fin_opportunities set cooldown_until=now()-interval '1 second' where id=(pg_temp.opp('contract_renewal')).id;
do $$ begin
 perform public.fin_evaluate_opportunities('00000000-0000-4000-8000-0000000ab201','2026-03-04');
 if (pg_temp.opp('contract_renewal')).status<>'open' or (pg_temp.opp('contract_renewal')).reopen_count<>2
    or not exists(select 1 from public.fin_opportunity_events where opportunity_id=(pg_temp.opp('contract_renewal')).id and event_type='reopened' and note='cooldown expired') then raise exception 'cooldown expiry did not reopen'; end if;
end $$;
-- Human-confirmed RFQ draft from a contract-sourced opportunity; nothing sent.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab101',true);
insert into opp_fixture select 'rfq',public.fin_opportunity_start_rfq((pg_temp.opp('contract_renewal')).id,true);
do $$ begin
 if (select status from public.fin_rfqs where id=pg_temp.ox('rfq'))<>'draft' or (pg_temp.opp('contract_renewal')).linked_rfq_id<>pg_temp.ox('rfq') or (pg_temp.opp('contract_renewal')).status<>'open'
    or not exists(select 1 from public.fin_opportunity_events where opportunity_id=(pg_temp.opp('contract_renewal')).id and event_type='rfq_draft_created') then raise exception 'rfq draft path wrong'; end if;
 if exists(select 1 from public.fin_rfq_invites where rfq_id=pg_temp.ox('rfq')) then raise exception 'rfq contacted providers automatically'; end if;
end $$;
select pg_temp.opp_expect_error(format('select public.fin_opportunity_start_rfq(%L,true)',(pg_temp.opp('contract_renewal')).id),'opportunity rfq unavailable');
reset role;
select set_config('request.jwt.claim.sub','',true);
-- Rule versions: a new version supersedes; history never changes retroactively.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab101',true);
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000ab201','contract_renewal',1,'{"enabled":true,"parameters":{"lead_days":45,"cooldown_days":10},"reason":"Longer lead time"}');
reset role;
select set_config('request.jwt.claim.sub','',true);
do $$ declare v_old uuid := (select id from public.fin_opportunities where opportunity_type='contract_renewal' and rule_version=1); begin
 perform public.fin_evaluate_opportunities('00000000-0000-4000-8000-0000000ab201','2026-03-05');
 if (select status||':'||expiry_reason from public.fin_opportunities where id=v_old)<>'expired:rule_superseded' then raise exception 'old version not superseded'; end if;
 if (pg_temp.opp('contract_renewal')).rule_version<>2 or (pg_temp.opp('contract_renewal')).rule_snapshot->'parameters'->>'lead_days'<>'45' then raise exception 'new version not applied'; end if;
 if (select rule_snapshot->'parameters'->>'lead_days' from public.fin_opportunities where id=v_old)<>'30' then raise exception 'rule snapshot rewritten'; end if;
end $$;
-- Disabled rule: nothing new fires and open items expire with the reason.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab101',true);
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000ab201','contract_renewal',2,'{"enabled":false,"parameters":{"lead_days":45},"reason":"Paused during audit"}');
reset role;
select set_config('request.jwt.claim.sub','',true);
do $$ begin
 perform public.fin_evaluate_opportunities('00000000-0000-4000-8000-0000000ab201','2026-03-06');
 if (pg_temp.opp('contract_renewal')).status<>'expired' or (pg_temp.opp('contract_renewal')).expiry_reason<>'rule_disabled' then raise exception 'disabled rule still open'; end if;
 if exists(select 1 from public.fin_opportunities where opportunity_type='contract_renewal' and rule_version=3) then raise exception 'disabled rule fired'; end if;
 -- Deadline passed: maturity after its date expires with that reason.
 perform public.fin_evaluate_opportunities('00000000-0000-4000-8000-0000000ab201','2026-05-02');
 if (pg_temp.opp('facility_maturity')).expiry_reason<>'deadline_passed' then raise exception 'deadline expiry wrong'; end if;
end $$;
-- Condition cleared: utilization back under the customer's policy.
insert into public.fin_facility_balances(organization_id,facility_id,as_of,outstanding_amount,used_limit_amount,source,recorded_by) values
('00000000-0000-4000-8000-0000000ab201','00000000-0000-4000-8000-0000000ab501','2026-05-02',400,400,'declared','00000000-0000-4000-8000-0000000ab101');
do $$ begin
 perform public.fin_evaluate_opportunities('00000000-0000-4000-8000-0000000ab201','2026-05-03');
 if (pg_temp.opp('facility_utilization')).expiry_reason<>'condition_cleared' then raise exception 'cleared condition not expired'; end if;
end $$;

-- Event-driven: a new fee variance opens its review opportunity immediately,
-- and starting the fee review clears it, with no scheduled scan.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab101',true);
insert into opp_fixture select 'schedule',public.fin_create_fee_schedule('00000000-0000-4000-8000-0000000ab201',pg_temp.ox('contract'),'{"service":"TED","category":"transfers","charging_unit":"per_transaction","pricing_model":"per_unit","currency":"BRL","rate":5,"source":"contract_terms","source_reference":"OPP-ANNEX"}');
insert into opp_fixture select 'observation',public.fin_record_fee_observation('00000000-0000-4000-8000-0000000ab201',pg_temp.ox('contract'),'{"service":"TED","charging_unit":"per_transaction","currency":"BRL","period_start":"2025-06-01","period_end":"2025-06-30","volume":10,"observed_amount":60,"source_type":"bank_statement","source_reference":"OPP-STATEMENT","evidence_reference":"OPP-EVIDENCE"}');
do $$ begin
 if (pg_temp.opp('fee_variance_review')).status is distinct from 'open' or (pg_temp.opp('fee_variance_review')).possible_action<>'review_fee'
    or (pg_temp.opp('fee_variance_review')).source_object_id<>(select id from public.fin_fee_variances where observation_id=pg_temp.ox('observation')) then raise exception 'fee event did not open review'; end if;
end $$;
select public.fin_review_fee_variance((select id from public.fin_fee_variances where observation_id=pg_temp.ox('observation')),'new','{"to_status":"under_review","reason_code":"review_started","notes":"Treasury reviewing"}');
do $$ begin if (pg_temp.opp('fee_variance_review')).status<>'expired' or (pg_temp.opp('fee_variance_review')).expiry_reason<>'condition_cleared' then raise exception 'fee review did not clear opportunity'; end if; end $$;
-- Viewer reads, never acts.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab102',true);
do $$ begin if (select count(*) from public.fin_opportunities)<5 or not exists(select 1 from public.fin_opportunity_events) or not exists(select 1 from public.fin_opportunity_rules) then raise exception 'viewer cannot read'; end if; end $$;
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('provider_concentration')).id,'open','{"to_status":"acknowledged"}'),'forbidden');
-- Entity scope: the entity-B manager sees no entity-A or group-level item.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab105',true);
do $$ begin
 if exists(select 1 from public.fin_opportunities where legal_entity_id is distinct from '00000000-0000-4000-8000-0000000ab402') then raise exception 'entity scope leaked opportunities'; end if;
 if exists(select 1 from public.fin_financial_graph where object_type='opportunity') then raise exception 'graph leaked across entity'; end if;
 if exists(select 1 from public.fin_list_opportunities('00000000-0000-4000-8000-0000000ab201')) then raise exception 'list leaked across entity'; end if;
end $$;
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('provider_concentration')).id,'open','{"to_status":"acknowledged"}'),'forbidden');
-- Other tenant and provider organization.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab103',true);
do $$ begin
 if exists(select 1 from public.fin_opportunities) or exists(select 1 from public.fin_opportunity_events) or exists(select 1 from public.fin_opportunity_rules) then raise exception 'cross tenant leak'; end if;
 if exists(select 1 from public.fin_search('00000000-0000-4000-8000-0000000ab202','Opportunity contract')) then raise exception 'search leaked'; end if;
end $$;
select pg_temp.opp_expect_error(format('select * from public.fin_list_opportunities(%L)','00000000-0000-4000-8000-0000000ab201'),'forbidden');
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('provider_concentration')).id,'open','{"to_status":"acknowledged"}'),'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab104',true);
do $$ begin if exists(select 1 from public.fin_opportunities) or exists(select 1 from public.fin_opportunity_rules) then raise exception 'provider leaked opportunities'; end if; end $$;
-- Admin graph: opportunity is a projection linked to its contract.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab101',true);
do $$ begin
 if not exists(select 1 from public.fin_query_graph('00000000-0000-4000-8000-0000000ab201','contract',pg_temp.ox('contract'),'opportunity',null,null,null,null,50,0)) then raise exception 'graph relation missing'; end if;
 if not exists(select 1 from public.fin_query_graph('00000000-0000-4000-8000-0000000ab201','provider','00000000-0000-4000-8000-0000000ab301','opportunity',null,null,null,null,50,0)) then raise exception 'provider graph missing'; end if;
 if (select count(*) from public.fin_opportunity_summary('00000000-0000-4000-8000-0000000ab201')) < 2 then raise exception 'summary missing'; end if;
end $$;
-- Direct writes never possible.
select pg_temp.opp_expect_error(format('update public.fin_opportunities set status=%L where id=%L','acted',(pg_temp.opp('provider_concentration')).id),'permission denied');
select pg_temp.opp_expect_error('insert into public.fin_opportunity_rules(organization_id,rule_key,version,parameters,enabled,reason,created_by) values (''00000000-0000-4000-8000-0000000ab201'',''contract_renewal'',9,''{}'',true,''forged'',auth.uid())','permission denied');
reset role;
select pg_temp.opp_expect_error(format('update public.fin_opportunities set opportunity_type=%L where id=%L','contract_renewal',(pg_temp.opp('provider_concentration')).id),'immutable record');
select pg_temp.opp_expect_error(format('update public.fin_opportunities set facts_snapshot=facts_snapshot, rule_snapshot=%L where id=%L','{}',(pg_temp.opp('provider_concentration')).id),'immutable record');
select pg_temp.opp_expect_error('update public.fin_opportunity_rules set enabled=false','immutable record');
select pg_temp.opp_expect_error('delete from public.fin_opportunity_events','immutable record');
do $$ begin
 if has_table_privilege('anon','public.fin_opportunities','SELECT') or has_function_privilege('authenticated','public.fin_evaluate_opportunities(uuid,date,text[])','EXECUTE')
    or has_function_privilege('authenticated','public.fin_opportunity_candidates(uuid,date)','EXECUTE') or has_table_privilege('authenticated','public.fin_opportunity_scans','SELECT') then raise exception 'opportunity surface exposed'; end if;
 if (select count(*) from public.fin_governance_export_datasets() where dataset like 'opportunit%')<>3 then raise exception 'opportunity export incomplete'; end if;
 if not exists(select 1 from public.fin_events where organization_id='00000000-0000-4000-8000-0000000ab201' and event_type='opportunity_dismissed')
    or not exists(select 1 from public.fin_events where organization_id='00000000-0000-4000-8000-0000000ab201' and event_type='opportunity_rule_versioned') then raise exception 'opportunity audit missing'; end if;
 if exists(select 1 from public.fin_events where event_type like 'opportunity%' and (metadata ? 'facts' or metadata ? 'parameters' or metadata ? 'note')) then raise exception 'audit carries payload'; end if;
end $$;
-- Legal hold and offboarding: preview counts, freeze blocks humans and the engine.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab101',true);
select public.fin_governance_create_legal_hold('00000000-0000-4000-8000-0000000ab201','organization',null,null,'Opportunity evidence must be preserved');
reset role;
select set_config('request.jwt.claim.sub','',true);
do $$ declare p jsonb := public.fin_governance_deletion_preview('00000000-0000-4000-8000-0000000ab201'); begin
 if (p->'tables'->>'opportunities')::int<5 or (p->'tables'->>'opportunity_rules')::int<5 or (p->'tables'->>'opportunity_events')::int<5 then raise exception 'preview misses opportunities: %',p; end if;
 if not public.fin_governance_hold_blocks('00000000-0000-4000-8000-0000000ab201',null) then raise exception 'hold inactive'; end if;
end $$;
insert into public.fin_offboarding_requests(organization_id,status,reason,requested_by)
values('00000000-0000-4000-8000-0000000ab201','access_revocation','Freeze fixture for negative opportunity authorization','00000000-0000-4000-8000-0000000ab101');
do $$ declare n bigint := (select count(*) from public.fin_opportunity_events); begin
 if public.fin_evaluate_opportunities('00000000-0000-4000-8000-0000000ab201','2026-06-01')<>0 or (select count(*) from public.fin_opportunity_events)<>n then raise exception 'engine ran on frozen tenant'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab101',true);
select pg_temp.opp_expect_error(format('select public.fin_transition_opportunity(%L,%L,%L::jsonb)',(pg_temp.opp('provider_concentration')).id,'open','{"to_status":"acknowledged"}'),'organization offboarding');
select pg_temp.opp_expect_error(format('select public.fin_set_opportunity_rule(%L,%L,0,%L::jsonb)','00000000-0000-4000-8000-0000000ab201','passport_stale','{"enabled":true,"parameters":{"lead_days":30},"reason":"Frozen tenant"}'),'organization offboarding');
reset role;
-- Revoked member: existing JWT reads nothing.
delete from public.fin_members where organization_id='00000000-0000-4000-8000-0000000ab201' and user_id='00000000-0000-4000-8000-0000000ab106';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ab106',true);
do $$ begin if exists(select 1 from public.fin_opportunities) or exists(select 1 from public.fin_opportunity_events) then raise exception 'revoked user leak'; end if; end $$;
reset role;
rollback;

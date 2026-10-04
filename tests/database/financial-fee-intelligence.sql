\set ON_ERROR_STOP on
-- P1.2 Bank Fee Intelligence. Transaction-scoped fictitious fixtures; runs on
-- clean install and on the final fresh install.
begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000fe101','fee-admin@example.invalid'),
('00000000-0000-4000-8000-0000000fe102','fee-viewer@example.invalid'),
('00000000-0000-4000-8000-0000000fe103','fee-other@example.invalid'),
('00000000-0000-4000-8000-0000000fe104','fee-provider@example.invalid'),
('00000000-0000-4000-8000-0000000fe105','fee-entity-b@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000fe201','Fee Fixture BUYER','BUYER','00000000-0000-4000-8000-0000000fe101'),
('00000000-0000-4000-8000-0000000fe202','Other Fee Fixture','BUYER','00000000-0000-4000-8000-0000000fe103'),
('00000000-0000-4000-8000-0000000fe203','Provider Fee Fixture','PROVIDER','00000000-0000-4000-8000-0000000fe104');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000fe201','00000000-0000-4000-8000-0000000fe101','admin'),
('00000000-0000-4000-8000-0000000fe201','00000000-0000-4000-8000-0000000fe102','viewer'),
('00000000-0000-4000-8000-0000000fe201','00000000-0000-4000-8000-0000000fe105','finance_manager'),
('00000000-0000-4000-8000-0000000fe202','00000000-0000-4000-8000-0000000fe103','admin'),
('00000000-0000-4000-8000-0000000fe203','00000000-0000-4000-8000-0000000fe104','admin');
insert into public.fin_legal_entities(id,organization_id,legal_name,created_by) values
('00000000-0000-4000-8000-0000000fe401','00000000-0000-4000-8000-0000000fe201','Fee Entity A','00000000-0000-4000-8000-0000000fe101'),
('00000000-0000-4000-8000-0000000fe402','00000000-0000-4000-8000-0000000fe201','Fee Entity B','00000000-0000-4000-8000-0000000fe101');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000fe301','00000000-0000-4000-8000-0000000fe201','Fee bank fixture','bank','00000000-0000-4000-8000-0000000fe101');
-- Finance manager restricted to entity B: must not see entity A fees.
update public.fin_members set entity_scope='entities' where user_id='00000000-0000-4000-8000-0000000fe105';
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
('00000000-0000-4000-8000-0000000fe201','00000000-0000-4000-8000-0000000fe105','00000000-0000-4000-8000-0000000fe402','00000000-0000-4000-8000-0000000fe101');
create temporary table fee_fixture(key text primary key,id uuid);
grant all on fee_fixture to authenticated;
create or replace function pg_temp.fx(p_key text) returns uuid language sql as $$ select id from fee_fixture where key=p_key $$;
create or replace function pg_temp.fee_expect_error(p_sql text,p_expected text) returns void language plpgsql as $$
begin
 begin execute p_sql;
 exception when others then
   if sqlerrm not like p_expected||'%' then raise exception 'unexpected failure: % (expected %)',sqlerrm,p_expected; end if;
   return;
 end;
 raise exception 'expected failure did not occur: %',p_sql;
end $$;
-- Observation payload with overrides.
create or replace function pg_temp.obs(p_patch jsonb default '{}') returns jsonb language sql as $$
 select '{"service":"TED","charging_unit":"per_transaction","currency":"BRL","period_start":"2025-03-01","period_end":"2025-03-31","volume":100,"observed_amount":520,"source_type":"bank_statement","source_reference":"STATEMENT-2025-03","evidence_reference":"EVIDENCE-2025-03"}'::jsonb || p_patch
$$;
create or replace function pg_temp.record(p_contract uuid,p_patch jsonb) returns uuid language sql as $$
 select public.fin_record_fee_observation('00000000-0000-4000-8000-0000000fe201',p_contract,pg_temp.obs(p_patch))
$$;
create or replace function pg_temp.var(p_obs uuid) returns public.fin_fee_variances language sql as $$ select * from public.fin_fee_variances where observation_id=p_obs $$;
grant execute on function pg_temp.fx(text),pg_temp.fee_expect_error(text,text),pg_temp.obs(jsonb),pg_temp.record(uuid,jsonb),pg_temp.var(uuid) to authenticated;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000fe101',true);
insert into fee_fixture values('contract',public.fin_import_contract('00000000-0000-4000-8000-0000000fe201','00000000-0000-4000-8000-0000000fe401','00000000-0000-4000-8000-0000000fe301','credit','Fee contract A','2025-01-01','2026-12-31',30,false,'BRL','{"fees":[{"service":"TED","unit":"per_transaction","amount":5}]}',null));
insert into fee_fixture values('contract_b',public.fin_import_contract('00000000-0000-4000-8000-0000000fe201','00000000-0000-4000-8000-0000000fe402','00000000-0000-4000-8000-0000000fe301','credit','Fee contract B','2025-01-01','2026-12-31',30,false,'BRL','{}',null));
-- Amendment-like correction: contract version 2 effective July 2025.
select public.fin_record_contract_terms(pg_temp.fx('contract'),'{"fees":[{"service":"TED","unit":"per_transaction","amount":4}]}',1,'Renegotiated TED fee','2025-07-01');

-- Contracted schedules: invalid shapes fail closed.
select pg_temp.fee_expect_error(format('select public.fin_create_fee_schedule(%L,%L,%L::jsonb)','00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract'),'{"service":"TED","category":"transfers","charging_unit":"per_month","pricing_model":"per_unit","currency":"BRL","rate":5,"source":"contract_terms","source_reference":"CONTRACT-A-V1"}'),'invalid fee schedule');
select pg_temp.fee_expect_error(format('select public.fin_create_fee_schedule(%L,%L,%L::jsonb)','00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract'),'{"service":"MDR","category":"acquiring","charging_unit":"percent_of_volume","pricing_model":"percentage","currency":"BRL","rate":150,"source":"contract_terms","source_reference":"CONTRACT-A-V1"}'),'invalid fee schedule');
select pg_temp.fee_expect_error(format('select public.fin_create_fee_schedule(%L,%L,%L::jsonb)','00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract'),'{"service":"Boleto","category":"collections","charging_unit":"per_item","pricing_model":"tiered_per_unit","currency":"BRL","tiers":[{"up_to":100,"rate":2},{"up_to":50,"rate":1},{"up_to":null,"rate":1}],"source":"contract_terms","source_reference":"CONTRACT-A-V1"}'),'invalid fee schedule');
select pg_temp.fee_expect_error(format('select public.fin_create_fee_schedule(%L,%L,%L::jsonb)','00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract'),'{"service":"TED","category":"transfers","charging_unit":"per_transaction","pricing_model":"per_unit","currency":"BRL","rate":5,"source":"contract_terms","source_reference":"CONTRACT-A-V1","contract_version":9}'),'fee contract version unavailable');
insert into fee_fixture select 'ted',public.fin_create_fee_schedule('00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract'),'{"service":"TED","category":"transfers","charging_unit":"per_transaction","pricing_model":"per_unit","currency":"BRL","rate":5,"source":"contract_terms","source_reference":"CONTRACT-A-V1","contract_version":1}');
select pg_temp.fee_expect_error(format('select public.fin_create_fee_schedule(%L,%L,%L::jsonb)','00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract'),'{"service":" ted ","category":"transfers","charging_unit":"per_transaction","pricing_model":"per_unit","currency":"BRL","rate":5,"source":"contract_terms","source_reference":"CONTRACT-A-V1"}'),'fee schedule already exists');
select pg_temp.fee_expect_error(format('select public.fin_version_fee_schedule(%L,1,%L::jsonb)',pg_temp.fx('ted'),'{"pricing_model":"per_unit","currency":"BRL","rate":4,"source":"amendment","source_reference":"AMENDMENT-1","contract_version":2,"effective_from":"2025-07-01"}'),'fee schedule reason required');
select pg_temp.fee_expect_error(format('select public.fin_version_fee_schedule(%L,7,%L::jsonb)',pg_temp.fx('ted'),'{"pricing_model":"per_unit","currency":"BRL","rate":4,"source":"amendment","source_reference":"AMENDMENT-1","contract_version":2,"effective_from":"2025-07-01","reason":"Amendment renegotiated TED"}'),'fee schedule version conflict');
select pg_temp.fee_expect_error(format('select public.fin_version_fee_schedule(%L,1,%L::jsonb)',pg_temp.fx('ted'),'{"pricing_model":"per_unit","currency":"BRL","rate":4,"source":"amendment","source_reference":"AMENDMENT-1","contract_version":2,"effective_from":"2024-07-01","reason":"Backdated"}'),'fee schedule effective date regression');
select public.fin_version_fee_schedule(pg_temp.fx('ted'),1,'{"pricing_model":"per_unit","currency":"BRL","rate":4,"source":"amendment","source_reference":"AMENDMENT-1","contract_version":2,"effective_from":"2025-07-01","reason":"Amendment renegotiated TED"}');
insert into fee_fixture select 'maintenance',public.fin_create_fee_schedule('00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract'),'{"service":"Manutenção de conta","category":"account_maintenance","charging_unit":"per_month","pricing_model":"fixed_amount","currency":"BRL","rate":50,"source":"contract_document","source_reference":"CONTRACT-A-ANNEX","effective_from":"2025-01-01"}');
insert into fee_fixture select 'mdr',public.fin_create_fee_schedule('00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract'),'{"service":"MDR crédito","category":"acquiring","charging_unit":"percent_of_volume","pricing_model":"percentage","currency":"BRL","rate":2.5,"source":"contract_terms","source_reference":"CONTRACT-A-MDR","effective_from":"2025-01-01"}');
insert into fee_fixture select 'boleto',public.fin_create_fee_schedule('00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract'),'{"service":"Boleto","category":"collections","charging_unit":"per_item","pricing_model":"tiered_per_unit","currency":"BRL","tiers":[{"up_to":100,"rate":2},{"up_to":null,"rate":1}],"minimum_amount":50,"source":"contract_terms","source_reference":"CONTRACT-A-BOLETO","effective_from":"2025-01-01"}');

-- Observations: every comparison is decided and frozen in the database.
insert into fee_fixture select 'historical',pg_temp.record(pg_temp.fx('contract'),'{}');
insert into fee_fixture select 'negative',pg_temp.record(pg_temp.fx('contract'),'{"period_start":"2025-08-01","period_end":"2025-08-31","observed_amount":380,"source_reference":"STATEMENT-2025-08"}');
insert into fee_fixture select 'span',pg_temp.record(pg_temp.fx('contract'),'{"period_start":"2025-06-15","period_end":"2025-07-15","source_reference":"STATEMENT-SPAN"}');
insert into fee_fixture select 'currency',pg_temp.record(pg_temp.fx('contract'),'{"currency":"USD","source_reference":"STATEMENT-USD"}');
insert into fee_fixture select 'unit',pg_temp.record(pg_temp.fx('contract'),'{"charging_unit":"per_item","source_reference":"STATEMENT-UNIT"}');
insert into fee_fixture select 'volume',pg_temp.record(pg_temp.fx('contract'),'{"volume":null,"source_reference":"STATEMENT-NOVOL"}');
insert into fee_fixture select 'service',pg_temp.record(pg_temp.fx('contract'),'{"service":"DOC","source_reference":"STATEMENT-DOC"}');
insert into fee_fixture select 'period',pg_temp.record(pg_temp.fx('contract'),'{"period_start":"2024-12-01","period_end":"2024-12-31","source_reference":"STATEMENT-2024-12"}');
insert into fee_fixture select 'equal',pg_temp.record(pg_temp.fx('contract'),'{"period_start":"2025-09-01","period_end":"2025-09-30","volume":10,"observed_amount":40,"source_reference":"STATEMENT-2025-09"}');
insert into fee_fixture select 'fixed',pg_temp.record(pg_temp.fx('contract'),'{"service":"Manutenção de conta","charging_unit":"per_month","volume":null,"period_start":"2025-01-01","period_end":"2025-03-31","observed_amount":150,"source_reference":"STATEMENT-Q1"}');
insert into fee_fixture select 'partial_month',pg_temp.record(pg_temp.fx('contract'),'{"service":"Manutenção de conta","charging_unit":"per_month","volume":null,"period_start":"2025-01-05","period_end":"2025-02-04","observed_amount":50,"source_reference":"STATEMENT-ODD"}');
insert into fee_fixture select 'mdr_above',pg_temp.record(pg_temp.fx('contract'),'{"service":"MDR crédito","charging_unit":"percent_of_volume","volume":null,"base_amount":10000,"observed_amount":260,"source_reference":"ACQ-2025-03"}');
insert into fee_fixture select 'mdr_nobase',pg_temp.record(pg_temp.fx('contract'),'{"service":"MDR crédito","charging_unit":"percent_of_volume","volume":null,"observed_amount":260,"source_reference":"ACQ-NOBASE"}');
insert into fee_fixture select 'tiered',pg_temp.record(pg_temp.fx('contract'),'{"service":"Boleto","charging_unit":"per_item","volume":150,"observed_amount":250,"source_reference":"BOLETO-2025-03"}');
insert into fee_fixture select 'tier_min',pg_temp.record(pg_temp.fx('contract'),'{"service":"Boleto","charging_unit":"per_item","volume":10,"observed_amount":50,"period_start":"2025-04-01","period_end":"2025-04-30","source_reference":"BOLETO-2025-04"}');
do $$ declare v public.fin_fee_variances; begin
 v:=pg_temp.var(pg_temp.fx('historical'));
 if v.comparison_status<>'comparable' or v.contracted_amount<>500 or v.variance_amount<>20 or v.direction<>'above' or v.schedule_version<>1 or v.contract_version<>1 or v.review_status<>'new' then raise exception 'historical version not applied: %',row_to_json(v); end if;
 v:=pg_temp.var(pg_temp.fx('negative'));
 if v.contracted_amount<>400 or v.variance_amount<>-20 or v.direction<>'below' or v.schedule_version<>2 then raise exception 'negative variance or new version wrong: %',row_to_json(v); end if;
 v:=pg_temp.var(pg_temp.fx('span'));
 if v.comparison_status<>'not_comparable' or v.variance_amount is not null or v.contracted_amount is not null or not ('reference_changed_in_period'=any(v.reasons)) then raise exception 'span forced a number'; end if;
 if not ('currency_mismatch'=any((pg_temp.var(pg_temp.fx('currency'))).reasons)) or (pg_temp.var(pg_temp.fx('currency'))).variance_amount is not null then raise exception 'wrong currency compared'; end if;
 if not ('charging_unit_mismatch'=any((pg_temp.var(pg_temp.fx('unit'))).reasons)) then raise exception 'wrong charging unit compared'; end if;
 if not ('missing_volume'=any((pg_temp.var(pg_temp.fx('volume'))).reasons)) then raise exception 'missing volume compared'; end if;
 v:=pg_temp.var(pg_temp.fx('service'));
 if v.comparison_status<>'missing_reference' or v.schedule_id is not null or v.variance_amount is not null then raise exception 'wrong service matched'; end if;
 if not ('no_reference_for_period'=any((pg_temp.var(pg_temp.fx('period'))).reasons)) then raise exception 'period before reference compared'; end if;
 v:=pg_temp.var(pg_temp.fx('equal'));
 if v.direction<>'equal' or v.review_status<>'not_required' or v.variance_amount<>0 then raise exception 'equal fee requires review'; end if;
 if (pg_temp.var(pg_temp.fx('fixed'))).contracted_amount<>150 or (pg_temp.var(pg_temp.fx('fixed'))).direction<>'equal' then raise exception 'monthly normalization wrong'; end if;
 if not ('period_not_normalizable'=any((pg_temp.var(pg_temp.fx('partial_month'))).reasons)) then raise exception 'pro-rata invented'; end if;
 if (pg_temp.var(pg_temp.fx('mdr_above'))).contracted_amount<>250 or (pg_temp.var(pg_temp.fx('mdr_above'))).variance_amount<>10 then raise exception 'percentage wrong'; end if;
 if not ('missing_base_amount'=any((pg_temp.var(pg_temp.fx('mdr_nobase'))).reasons)) then raise exception 'missing base compared'; end if;
 if (pg_temp.var(pg_temp.fx('tiered'))).contracted_amount<>250 then raise exception 'graduated tiers wrong'; end if;
 if (pg_temp.var(pg_temp.fx('tier_min'))).contracted_amount<>50 or (pg_temp.var(pg_temp.fx('tier_min'))).direction<>'equal' then raise exception 'monthly minimum not applied'; end if;
 if (pg_temp.var(pg_temp.fx('historical'))).methodology->>'formula'<>'observed_amount - contracted_reference' or (pg_temp.var(pg_temp.fx('historical'))).reference_snapshot->>'rate'<>'5.000000' then raise exception 'comparison not reproducible from snapshot'; end if;
end $$;

-- Duplicate: same fact replays idempotently; a different fact under the same key conflicts.
do $$ begin
 if pg_temp.record(pg_temp.fx('contract'),'{}')<>pg_temp.fx('historical') then raise exception 'replay created duplicate'; end if;
 if (select count(*) from public.fin_fee_observations where source_reference='STATEMENT-2025-03')<>1 or (select count(*) from public.fin_fee_variances where observation_id=pg_temp.fx('historical'))<>1 then raise exception 'duplicate observation'; end if;
end $$;
select pg_temp.fee_expect_error(format('select pg_temp.record(%L,%L::jsonb)',pg_temp.fx('contract'),'{"observed_amount":999}'),'fee observation conflict');
select pg_temp.fee_expect_error(format('select pg_temp.record(%L,%L::jsonb)',pg_temp.fx('contract'),'{"source_type":"api","source_reference":"API-1"}'),'invalid fee observation source');
select pg_temp.fee_expect_error(format('select pg_temp.record(%L,%L::jsonb)',pg_temp.fx('contract'),'{"source_type":"confirmed_document_extraction","source_reference":"EXTRACT-1"}'),'invalid fee observation source');
select pg_temp.fee_expect_error(format('select pg_temp.record(%L,%L::jsonb)',pg_temp.fx('contract'),'{"period_start":"2099-01-01","period_end":"2099-01-31","source_reference":"FUTURE"}'),'invalid fee observation');
select pg_temp.fee_expect_error(format('select pg_temp.record(%L,%L::jsonb)',pg_temp.fx('contract'),'{"observed_amount":"abc","source_reference":"TYPE"}'),'invalid fee observation');
select pg_temp.fee_expect_error(format('select pg_temp.record(%L,%L::jsonb)',pg_temp.fx('contract'),'{"observed_amount":10.001,"source_reference":"PRECISION"}'),'invalid fee observation');
select pg_temp.fee_expect_error(format('select pg_temp.record(%L,%L::jsonb)',pg_temp.fx('contract'),'{"invented":true,"source_reference":"EXTRA"}'),'invalid fee observation');

-- Review lifecycle: interpretation is human and transitions are closed.
select pg_temp.fee_expect_error(format('select public.fin_review_fee_variance(%L,%L,%L::jsonb)',(pg_temp.var(pg_temp.fx('historical'))).id,'new','{"to_status":"confirmed","reason_code":"contract_terms_confirmed","notes":"Skip review","evidence_reference":"EV-1"}'),'invalid fee review transition');
select pg_temp.fee_expect_error(format('select public.fin_review_fee_variance(%L,%L,%L::jsonb)',(pg_temp.var(pg_temp.fx('historical'))).id,'under_review','{"to_status":"under_review","reason_code":"review_started","notes":"Stale expected state"}'),'fee review conflict');
select public.fin_review_fee_variance((pg_temp.var(pg_temp.fx('historical'))).id,'new','{"to_status":"under_review","reason_code":"review_started","notes":"Treasury started the review"}');
select pg_temp.fee_expect_error(format('select public.fin_review_fee_variance(%L,%L,%L::jsonb)',(pg_temp.var(pg_temp.fx('historical'))).id,'under_review','{"to_status":"confirmed","reason_code":"contract_terms_confirmed","notes":"No evidence attached"}'),'invalid fee review');
select public.fin_review_fee_variance((pg_temp.var(pg_temp.fx('historical'))).id,'under_review','{"to_status":"confirmed","reason_code":"contract_terms_confirmed","notes":"Contract annex checked against statement","evidence_reference":"ANNEX-CHECK-1"}');
select pg_temp.fee_expect_error(format('select public.fin_review_fee_variance(%L,%L,%L::jsonb)',(pg_temp.var(pg_temp.fx('historical'))).id,'confirmed','{"to_status":"resolved","reason_code":"credit_received","notes":"Credit posted","evidence_reference":"CREDIT-1"}'),'invalid fee review');
select public.fin_review_fee_variance((pg_temp.var(pg_temp.fx('historical'))).id,'confirmed','{"to_status":"resolved","reason_code":"credit_received","notes":"Credit posted","evidence_reference":"CREDIT-1","resolution":"Provider credited the difference on the next statement"}');
select pg_temp.fee_expect_error(format('select public.fin_review_fee_variance(%L,%L,%L::jsonb)',(pg_temp.var(pg_temp.fx('historical'))).id,'resolved','{"to_status":"under_review","reason_code":"other","notes":"Reopen attempt"}'),'invalid fee review transition');
-- A non-comparable fact cannot be "confirmed" as a difference; it can be explained.
select public.fin_review_fee_variance((pg_temp.var(pg_temp.fx('span'))).id,'new','{"to_status":"under_review","reason_code":"review_started","notes":"Split the statement by month"}');
select pg_temp.fee_expect_error(format('select public.fin_review_fee_variance(%L,%L,%L::jsonb)',(pg_temp.var(pg_temp.fx('span'))).id,'under_review','{"to_status":"confirmed","reason_code":"contract_terms_confirmed","notes":"Not comparable","evidence_reference":"EV-2"}'),'invalid fee review transition');
select public.fin_review_fee_variance((pg_temp.var(pg_temp.fx('span'))).id,'under_review','{"to_status":"explained","reason_code":"timing_difference","notes":"Period spans the amendment date","evidence_reference":"AMENDMENT-1"}');
select public.fin_review_fee_variance((pg_temp.var(pg_temp.fx('negative'))).id,'new','{"to_status":"dismissed","reason_code":"pricing_exception_agreed","notes":"Promotional rate below contract"}');
-- Single human verification of the observed fact.
select public.fin_verify_fee_observation(pg_temp.fx('historical'),'{"status":"verified","reason":"Statement reconciled by treasury"}');
select pg_temp.fee_expect_error(format('select public.fin_verify_fee_observation(%L,%L::jsonb)',pg_temp.fx('historical'),'{"status":"rejected","reason":"Second verification"}'),'fee observation already verified');
select pg_temp.fee_expect_error(format('select public.fin_verify_fee_observation(%L,%L::jsonb)',pg_temp.fx('negative'),'{"status":"maybe","reason":"x"}'),'invalid fee verification');

-- Direct writes are never possible for authenticated users.
select pg_temp.fee_expect_error(format('update public.fin_fee_variances set variance_amount=0 where id=%L',(pg_temp.var(pg_temp.fx('negative'))).id),'permission denied');
select pg_temp.fee_expect_error(format('delete from public.fin_fee_observations where id=%L',pg_temp.fx('negative')),'permission denied');
select pg_temp.fee_expect_error('insert into public.fin_fee_reviews(organization_id,variance_id,from_status,to_status,reason_code,notes,reviewer_id) values (gen_random_uuid(),gen_random_uuid(),''new'',''resolved'',''other'',''forged'',auth.uid())','permission denied');

do $$ declare s record; begin
 -- Summary per currency; above and below never netted; coverage from facts.
 select * into s from public.fin_fee_summary('00000000-0000-4000-8000-0000000fe201','2024-01-01','2025-12-31') where currency='BRL';
 if s.above<>2 or s.below<>1 or s.above_total<>30 or s.below_total<>-20 or s.not_comparable<>6 or s.comparable<>7 or s.equal<>4 or s.missing_reference<>1 or s.verified<>1 or s.schedules<>4 or s.schedules_observed<>4 then raise exception 'summary wrong: %',row_to_json(s); end if;
 if not exists(select 1 from public.fin_fee_summary('00000000-0000-4000-8000-0000000fe201','2024-01-01','2025-12-31') where currency='USD' and observations=1 and comparable=0) then raise exception 'currencies mixed'; end if;
 if (select count(*) from public.fin_list_fee_variances('00000000-0000-4000-8000-0000000fe201','2024-01-01','2025-12-31',p_review=>'resolved'))<>1 then raise exception 'review filter wrong'; end if;
 if exists(select 1 from public.fin_list_fee_variances('00000000-0000-4000-8000-0000000fe201','2024-01-01','2025-12-31',p_category=>'fx')) then raise exception 'category filter leaked'; end if;
 -- Variance is not savings: nothing reached the value ledger.
 if exists(select 1 from public.fin_value_records where organization_id='00000000-0000-4000-8000-0000000fe201') then raise exception 'variance became savings'; end if;
 -- Graph relates schedule, observation, variance and review to the contract.
 if (select count(distinct object_type) from public.fin_query_graph('00000000-0000-4000-8000-0000000fe201','contract',pg_temp.fx('contract'),null,null,null,null,null,50,0) where object_type like 'fee_%')<>4 then raise exception 'graph fee relations missing'; end if;
 if not exists(select 1 from public.fin_query_graph('00000000-0000-4000-8000-0000000fe201','provider','00000000-0000-4000-8000-0000000fe301','fee_variance',null,null,null,null,50,0)) then raise exception 'provider graph missing variance'; end if;
end $$;
select pg_temp.fee_expect_error(format('select * from public.fin_list_fee_variances(%L,%L,%L,p_limit=>51)','00000000-0000-4000-8000-0000000fe201','2025-01-01','2025-12-31'),'invalid fee filters');

-- Viewer reads but never writes.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000fe102',true);
do $$ begin if (select count(*) from public.fin_fee_variances)<15 then raise exception 'viewer cannot read'; end if; end $$;
select pg_temp.fee_expect_error(format('select pg_temp.record(%L,%L::jsonb)',pg_temp.fx('contract'),'{"source_reference":"VIEWER"}'),'forbidden');
select pg_temp.fee_expect_error(format('select public.fin_review_fee_variance(%L,%L,%L::jsonb)',(pg_temp.var(pg_temp.fx('mdr_above'))).id,'new','{"to_status":"under_review","reason_code":"review_started","notes":"Viewer review"}'),'forbidden');
select pg_temp.fee_expect_error(format('select public.fin_create_fee_schedule(%L,%L,%L::jsonb)','00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract'),'{"service":"PIX","category":"transfers","charging_unit":"per_transaction","pricing_model":"per_unit","currency":"BRL","rate":1,"source":"declared","source_reference":"VIEWER"}'),'forbidden');
-- Cross entity: a manager scoped to entity B sees nothing from entity A and cannot act on it.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000fe105',true);
do $$ begin
 if exists(select 1 from public.fin_fee_schedules) or exists(select 1 from public.fin_fee_observations) or exists(select 1 from public.fin_fee_variances) or exists(select 1 from public.fin_fee_reviews) or exists(select 1 from public.fin_fee_schedule_versions) then raise exception 'entity scope leaked fees'; end if;
 if exists(select 1 from public.fin_fee_summary('00000000-0000-4000-8000-0000000fe201','2024-01-01','2025-12-31')) then raise exception 'entity summary leaked'; end if;
 if exists(select 1 from public.fin_financial_graph where object_type like 'fee_%') then raise exception 'graph leaked across entity'; end if;
end $$;
select pg_temp.fee_expect_error(format('select pg_temp.record(%L,%L::jsonb)',pg_temp.fx('contract'),'{"source_reference":"CROSS-ENTITY"}'),'forbidden');
select pg_temp.fee_expect_error(format('select public.fin_review_fee_variance(%L,%L,%L::jsonb)',(pg_temp.var(pg_temp.fx('mdr_above'))).id,'new','{"to_status":"under_review","reason_code":"review_started","notes":"Cross entity"}'),'forbidden');
insert into fee_fixture select 'own_entity',public.fin_create_fee_schedule('00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract_b'),'{"service":"PIX","category":"transfers","charging_unit":"per_transaction","pricing_model":"per_unit","currency":"BRL","rate":1,"source":"declared","source_reference":"ENTITY-B"}');
-- Other tenant and provider organization see nothing.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000fe103',true);
do $$ begin if exists(select 1 from public.fin_fee_schedules) or exists(select 1 from public.fin_fee_observations) or exists(select 1 from public.fin_fee_variances) or exists(select 1 from public.fin_fee_reviews) then raise exception 'cross tenant leak'; end if; end $$;
select pg_temp.fee_expect_error(format('select public.fin_fee_summary(%L,%L,%L)','00000000-0000-4000-8000-0000000fe201','2025-01-01','2025-12-31'),'forbidden');
select pg_temp.fee_expect_error(format('select pg_temp.record(%L,%L::jsonb)',pg_temp.fx('contract'),'{"source_reference":"OTHER-TENANT"}'),'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000fe104',true);
do $$ begin if exists(select 1 from public.fin_fee_schedules) or exists(select 1 from public.fin_fee_variances) or exists(select 1 from public.fin_fee_observations) then raise exception 'provider leaked buyer fees'; end if; end $$;
select pg_temp.fee_expect_error(format('select public.fin_version_fee_schedule(%L,2,%L::jsonb)',pg_temp.fx('ted'),'{"pricing_model":"per_unit","currency":"BRL","rate":1,"source":"declared","source_reference":"PROVIDER","reason":"Provider edit"}'),'forbidden');
reset role;

-- Immutability holds even for the table owner path.
select pg_temp.fee_expect_error(format('update public.fin_fee_variances set variance_amount=0 where id=%L',(pg_temp.var(pg_temp.fx('negative'))).id),'immutable record');
select pg_temp.fee_expect_error(format('update public.fin_fee_observations set observed_amount=1 where id=%L',pg_temp.fx('negative')),'immutable record');
select pg_temp.fee_expect_error(format('update public.fin_fee_schedule_versions set rate=1 where schedule_id=%L',pg_temp.fx('ted')),'immutable record');
select pg_temp.fee_expect_error(format('delete from public.fin_fee_reviews where variance_id=%L',(pg_temp.var(pg_temp.fx('historical'))).id),'immutable record');
select pg_temp.fee_expect_error(format('update public.fin_fee_schedules set service=%L where id=%L','Renamed',pg_temp.fx('ted')),'immutable record');
do $$ begin
 if has_table_privilege('anon','public.fin_fee_variances','SELECT') or has_function_privilege('anon','public.fin_record_fee_observation(uuid,uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.fin_compare_fee(public.fin_fee_observations)','EXECUTE') then raise exception 'fee surface exposed'; end if;
 if (select count(*) from public.fin_governance_export_datasets() where dataset like 'fee_%')<>5 then raise exception 'fee export incomplete'; end if;
 if (select count(distinct event_type) from public.fin_events where organization_id='00000000-0000-4000-8000-0000000fe201' and event_type in ('fee_schedule_created','fee_schedule_versioned','fee_observation_recorded','fee_variance_detected','fee_variance_reviewed','fee_variance_resolved','fee_observation_verified'))<>7 then raise exception 'fee audit incomplete'; end if;
 if exists(select 1 from public.fin_events where organization_id='00000000-0000-4000-8000-0000000fe201' and event_type like 'fee_%'
    and (metadata ?| array['observed_amount','contracted_amount','variance_amount','rate','notes','evidence_reference','source_reference'])) then raise exception 'audit contains financial payload'; end if;
 -- Fee events carry the contract entity for scoped audit reads.
 if exists(select 1 from public.fin_events where organization_id='00000000-0000-4000-8000-0000000fe201' and event_type like 'fee_%' and entity_id=pg_temp.fx('contract') and legal_entity_id is distinct from '00000000-0000-4000-8000-0000000fe401') then raise exception 'fee audit without entity'; end if;
end $$;

-- Legal hold: tenant deletion is blocked and the preview counts fee facts.
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000fe101',true);
select public.fin_governance_create_legal_hold('00000000-0000-4000-8000-0000000fe201','contract',pg_temp.fx('contract'),null,'Fee dispute evidence must be preserved');
reset role;
select set_config('request.jwt.claim.sub','',true);
do $$ declare p jsonb := public.fin_governance_deletion_preview('00000000-0000-4000-8000-0000000fe201'); begin
 if not public.fin_governance_hold_blocks('00000000-0000-4000-8000-0000000fe201',null) then raise exception 'hold not active'; end if;
 if (p->'tables'->>'fee_variances')::int<>15 or (p->'tables'->>'fee_reviews')::int<6 or (p->'tables'->>'fee_schedules')::int<5 then raise exception 'deletion preview misses fee facts: %',p; end if;
end $$;
-- Offboarding freeze blocks every fee write while membership and JWT still exist.
insert into public.fin_offboarding_requests(organization_id,status,reason,requested_by)
values('00000000-0000-4000-8000-0000000fe201','access_revocation','Freeze fixture for negative fee authorization','00000000-0000-4000-8000-0000000fe101');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000fe101',true);
select pg_temp.fee_expect_error(format('select pg_temp.record(%L,%L::jsonb)',pg_temp.fx('contract'),'{"source_reference":"FROZEN"}'),'organization offboarding');
select pg_temp.fee_expect_error(format('select public.fin_review_fee_variance(%L,%L,%L::jsonb)',(pg_temp.var(pg_temp.fx('mdr_above'))).id,'new','{"to_status":"under_review","reason_code":"review_started","notes":"Frozen"}'),'organization offboarding');
select pg_temp.fee_expect_error(format('select public.fin_create_fee_schedule(%L,%L,%L::jsonb)','00000000-0000-4000-8000-0000000fe201',pg_temp.fx('contract'),'{"service":"Frozen","category":"other","charging_unit":"one_off","pricing_model":"fixed_amount","currency":"BRL","rate":1,"source":"declared","source_reference":"FROZEN"}'),'organization offboarding');
select pg_temp.fee_expect_error(format('select public.fin_verify_fee_observation(%L,%L::jsonb)',pg_temp.fx('negative'),'{"status":"verified","reason":"Frozen"}'),'organization offboarding');
reset role;
-- Revoked member: existing JWT reads nothing and writes nothing.
delete from public.fin_members where organization_id='00000000-0000-4000-8000-0000000fe201' and user_id='00000000-0000-4000-8000-0000000fe101';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000fe101',true);
do $$ begin if exists(select 1 from public.fin_fee_variances) or exists(select 1 from public.fin_fee_schedules) then raise exception 'revoked user fee leak'; end if; end $$;
select pg_temp.fee_expect_error(format('select public.fin_verify_fee_observation(%L,%L::jsonb)',pg_temp.fx('negative'),'{"status":"verified","reason":"Revoked"}'),'forbidden');
reset role;
rollback;

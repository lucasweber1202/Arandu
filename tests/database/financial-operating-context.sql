\set ON_ERROR_STOP on
-- Real PostgreSQL/RLS and domain RPCs. Storage bytes/Auth HTTP are separate CI.
begin;
create temporary table operating_ids(key text primary key,id uuid) on commit drop;
insert into operating_ids values
 ('admin','8a000000-0000-4000-8000-000000000001'),('analyst','8a000000-0000-4000-8000-000000000002'),
 ('restricted','8a000000-0000-4000-8000-000000000003'),('outsider','8a000000-0000-4000-8000-000000000004'),
 ('provider_user','8a000000-0000-4000-8000-000000000005'),('org','8a000000-0000-4000-8000-000000000010'),
 ('other_org','8a000000-0000-4000-8000-000000000011'),('provider_org','8a000000-0000-4000-8000-000000000012'),
 ('A','8a000000-0000-4000-8000-000000000020'),('B','8a000000-0000-4000-8000-000000000021'),('bank','8a000000-0000-4000-8000-000000000030');
grant all on operating_ids to authenticated,service_role;
create function pg_temp.oid(p_key text) returns uuid language sql as $$ select id from operating_ids where key=p_key $$;
create function pg_temp.operating_denied(p_sql text,p_pattern text) returns void language plpgsql as $$ begin
 begin execute p_sql; exception when others then
  if sqlerrm not like p_pattern||'%' then raise exception 'unexpected denial: %',sqlerrm; end if;return;
 end;
 raise exception 'expected denial missing';
end $$;
grant execute on function pg_temp.oid(text),pg_temp.operating_denied(text,text) to authenticated,service_role;
insert into auth.users(id,email) select id,key||'-operating@example.invalid' from operating_ids where key in ('admin','analyst','restricted','outsider','provider_user');
insert into public.fin_organizations(id,legal_name,kind,created_by) values
 (pg_temp.oid('org'),'Operating buyer DEMO','BUYER',pg_temp.oid('admin')),
 (pg_temp.oid('other_org'),'Operating outsider DEMO','BUYER',pg_temp.oid('outsider')),
 (pg_temp.oid('provider_org'),'Operating institution DEMO','PROVIDER',pg_temp.oid('provider_user'));
insert into public.fin_members(organization_id,user_id,role) values
 (pg_temp.oid('org'),pg_temp.oid('admin'),'admin'),(pg_temp.oid('org'),pg_temp.oid('analyst'),'analyst'),
 (pg_temp.oid('org'),pg_temp.oid('restricted'),'finance_manager'),(pg_temp.oid('other_org'),pg_temp.oid('outsider'),'admin'),
 (pg_temp.oid('provider_org'),pg_temp.oid('provider_user'),'provider_user');
insert into public.fin_legal_entities(id,organization_id,legal_name,created_by) values
 (pg_temp.oid('A'),pg_temp.oid('org'),'Operating A DEMO',pg_temp.oid('admin')),
 (pg_temp.oid('B'),pg_temp.oid('org'),'Operating B DEMO',pg_temp.oid('admin'));
insert into public.fin_providers(id,organization_id,name,kind,created_by,provider_organization_id)
 values(pg_temp.oid('bank'),pg_temp.oid('org'),'Operating bank DEMO','bank',pg_temp.oid('admin'),pg_temp.oid('provider_org'));
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.oid('admin')::text,true);
select public.fin_set_member_entity_scope(pg_temp.oid('org'),pg_temp.oid('restricted'),'entities',array[pg_temp.oid('A')]);

-- A: existing contract, canonical task and authorized evidence metadata.
insert into operating_ids select 'contract_A',public.fin_import_contract(pg_temp.oid('org'),pg_temp.oid('A'),pg_temp.oid('bank'),'credit','Operating contract A DEMO',current_date-30,current_date+300,60,false,'BRL','{}',null);
insert into operating_ids select 'contract_B',public.fin_import_contract(pg_temp.oid('org'),pg_temp.oid('B'),pg_temp.oid('bank'),'credit','Operating contract B DEMO',current_date-30,current_date+400,60,false,'USD','{}',null);
insert into operating_ids select 'document_A',document_id from public.fin_document_begin_upload(pg_temp.oid('org'),'contract',pg_temp.oid('contract_A'),'Operating document A DEMO','internal','application/pdf',100);
insert into operating_ids select 'document_B',document_id from public.fin_document_begin_upload(pg_temp.oid('org'),'contract',pg_temp.oid('contract_B'),'Operating document B DEMO','internal','application/pdf',100);
do $$ begin
 if not exists(select 1 from public.fin_tasks where related_type='contract' and related_id=pg_temp.oid('contract_A')) then raise exception 'contract task missing'; end if;
 if not exists(select 1 from public.fin_contract_document_evidence where id=pg_temp.oid('document_A') and contract_id=pg_temp.oid('contract_A') and available_version is null) then raise exception 'pending document mislabeled available'; end if;
end $$;
reset role;
set local role service_role;
select public.fin_document_finalize_upload(pg_temp.oid('document_A'),1,100,'application/pdf');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.oid('admin')::text,true);
-- A newer pending slot must not hide the older available current version.
select document_id from public.fin_document_begin_upload(pg_temp.oid('org'),'contract',pg_temp.oid('contract_A'),'Operating document A DEMO','internal','application/pdf',100,null,pg_temp.oid('document_A'));
do $$ begin
 if not exists(select 1 from public.fin_contract_document_evidence where id=pg_temp.oid('document_A') and current_version=1 and available_version=1 and size_bytes=100) then raise exception 'available evidence version lost'; end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='fin_contract_document_evidence' and column_name in ('storage_path','storage_bucket')) then raise exception 'Storage locator exposed'; end if;
end $$;

-- B: same institution, two entities/currencies, latest snapshot and schedule.
insert into operating_ids select 'facility_A',public.fin_save_facility(p_org=>pg_temp.oid('org'),p_facility=>null,p_entity=>pg_temp.oid('A'),p_provider=>pg_temp.oid('bank'),p_kind=>'revolving_credit',p_name=>'Operating BRL DEMO',p_currency=>'BRL',p_approved_limit=>10000,p_contract=>pg_temp.oid('contract_A'));
insert into operating_ids select 'facility_B',public.fin_save_facility(p_org=>pg_temp.oid('org'),p_facility=>null,p_entity=>pg_temp.oid('B'),p_provider=>pg_temp.oid('bank'),p_kind=>'term_loan',p_name=>'Operating USD DEMO',p_currency=>'USD',p_approved_limit=>50000,p_contract=>pg_temp.oid('contract_B'));
select public.fin_record_facility_balance(pg_temp.oid('facility_A'),current_date-10,500,400,'declared','Operating older source');
select public.fin_record_facility_balance(pg_temp.oid('facility_A'),current_date-1,1000,300,'declared','Operating latest source');
select public.fin_record_facility_schedule(pg_temp.oid('facility_A'),jsonb_build_array(jsonb_build_object('due_on',current_date+30,'principal_amount',1000)),0);
select public.fin_record_facility_schedule(pg_temp.oid('facility_A'),jsonb_build_array(jsonb_build_object('due_on',current_date+60,'principal_amount',750)),1);
insert into operating_ids select 'guarantee',public.fin_save_guarantee(p_org=>pg_temp.oid('org'),p_guarantee=>null,p_entity=>pg_temp.oid('A'),p_kind=>'receivables',p_description=>'Operating guarantee DEMO',p_currency=>'BRL',p_committed=>500,p_facility=>pg_temp.oid('facility_A'));
do $$ begin
 if (select count(*) from public.fin_portfolio_facility_context where organization_id=pg_temp.oid('org'))<>2 then raise exception 'portfolio cardinality'; end if;
 if not exists(select 1 from public.fin_facility_latest_balance where facility_id=pg_temp.oid('facility_A') and outstanding_amount=1000 and used_limit_amount=300) then raise exception 'latest snapshot incorrect'; end if;
 if exists(select 1 from public.fin_facility_latest_balance where facility_id=pg_temp.oid('facility_B')) then raise exception 'unknown USD fabricated'; end if;
 if (select count(*) from public.fin_facility_current_repayment where facility_id=pg_temp.oid('facility_A'))<>1
 or (select sum(principal_amount) from public.fin_facility_current_repayment where facility_id=pg_temp.oid('facility_A'))<>750 then raise exception 'old schedule leaked into current projection'; end if;
 if not exists(select 1 from public.fin_portfolio_guarantee_context where id=pg_temp.oid('guarantee') and facility_contract_id=pg_temp.oid('contract_A') and facility_contract_product='credit' and provider_id is null and facility_provider_id=pg_temp.oid('bank')) then raise exception 'guarantee association fabricated or missing'; end if;
end $$;

-- C: evidence is data, and a human independent reviewer concludes the period.
insert into operating_ids select 'obligation',public.fin_open_obligation(pg_temp.oid('contract_A'),jsonb_build_object('title','Operating leverage DEMO','kind','financial_covenant','source_clause','Cláusula sintética 1','source_reference','Operating contract source','owner_id',pg_temp.oid('analyst'),'frequency','once','first_period_start',current_date-30,'first_period_end',current_date-1,'first_due_on',current_date+10,'metric','leverage','operator','le','threshold',3,'unit','ratio'));
insert into operating_ids select 'period',id from public.fin_obligation_monitor where obligation_id=pg_temp.oid('obligation');
do $$ begin
 if exists(select 1 from public.fin_obligation_monitor where id=pg_temp.oid('period') and ((facts->>'has_data')::boolean or facts->>'status' in ('compliant','non_compliant'))) then raise exception 'missing evidence concluded'; end if;
end $$;
select set_config('request.jwt.claim.sub',pg_temp.oid('analyst')::text,true);
insert into operating_ids select 'measurement',public.fin_record_obligation_data(pg_temp.oid('period'),jsonb_build_object('measured_value',4,'measured_on',current_date,'source_reference','Operating measured source','provenance','Apuração sintética com documento de origem','document_id',pg_temp.oid('document_A')));
select pg_temp.operating_denied($q$select public.fin_review_obligation(pg_temp.oid('period'),null,jsonb_build_object('status','non_compliant','reason','Analyst cannot review','measurement_id',pg_temp.oid('measurement')))$q$,'forbidden');
select set_config('request.jwt.claim.sub',pg_temp.oid('admin')::text,true);
insert into operating_ids select 'measurement_admin',public.fin_record_obligation_data(pg_temp.oid('period'),jsonb_build_object('measured_value',4,'measured_on',current_date,'source_reference','Operating measured source reviewed','provenance','Apuração sintética registrada pela administração','document_id',pg_temp.oid('document_A')));
select pg_temp.operating_denied($q$select public.fin_review_obligation(pg_temp.oid('period'),null,jsonb_build_object('status','non_compliant','reason','Same author rejected','measurement_id',pg_temp.oid('measurement_admin')))$q$,'obligation independent');
select set_config('request.jwt.claim.sub',pg_temp.oid('restricted')::text,true);
select public.fin_review_obligation(pg_temp.oid('period'),null,jsonb_build_object('status','non_compliant','reason','Fonte conferida por revisão humana independente','measurement_id',pg_temp.oid('measurement_admin')));
do $$ begin
 if not exists(select 1 from public.fin_obligation_monitor where id=pg_temp.oid('period') and contract_id=pg_temp.oid('contract_A') and facts->>'status'='non_compliant' and (facts->>'has_data')::boolean) then raise exception 'reviewed obligation context wrong'; end if;
end $$;

-- D: one legitimate origin survives replay, and remains linked to contract.
select set_config('request.jwt.claim.sub',pg_temp.oid('admin')::text,true);
insert into operating_ids select 'renewal_rfq',public.fin_start_contract_rfq(pg_temp.oid('contract_A'));
do $$ declare again uuid; begin
 again:=public.fin_start_contract_rfq(pg_temp.oid('contract_A'));
 if again<>pg_temp.oid('renewal_rfq') then raise exception 'renewal replay duplicated RFQ'; end if;
 if (select count(*) from public.fin_events where organization_id=pg_temp.oid('org') and event_type='rfq_created_from_contract' and metadata->>'contract_id'=pg_temp.oid('contract_A')::text)<>1 then raise exception 'renewal origin missing or duplicated'; end if;
end $$;

-- RLS negatives across derived views, and immediate entity revocation.
select set_config('request.jwt.claim.sub',pg_temp.oid('restricted')::text,true);
do $$ begin
 if (select count(*) from public.fin_portfolio_facility_context where organization_id=pg_temp.oid('org'))<>1 then raise exception 'entity B facility exposed'; end if;
 if exists(select 1 from public.fin_contract_document_evidence where contract_id=pg_temp.oid('contract_B')) then raise exception 'entity B document exposed'; end if;
 if exists(select 1 from public.fin_facility_current_repayment where facility_id=pg_temp.oid('facility_B')) then raise exception 'entity B schedule exposed'; end if;
end $$;
select set_config('request.jwt.claim.sub',pg_temp.oid('outsider')::text,true);
do $$ begin
 if exists(select 1 from public.fin_portfolio_facility_context where organization_id=pg_temp.oid('org')) or exists(select 1 from public.fin_contract_document_evidence where contract_organization_id=pg_temp.oid('org')) then raise exception 'other tenant context exposed'; end if;
end $$;
select set_config('request.jwt.claim.sub',pg_temp.oid('provider_user')::text,true);
do $$ begin
 if exists(select 1 from public.fin_contract_document_evidence where contract_organization_id=pg_temp.oid('org')) then raise exception 'provider saw buyer internal evidence'; end if;
end $$;
reset role;
delete from public.fin_member_entity_grants where organization_id=pg_temp.oid('org') and user_id=pg_temp.oid('restricted');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.oid('restricted')::text,true);
do $$ begin
 if exists(select 1 from public.fin_portfolio_facility_context where organization_id=pg_temp.oid('org')) or exists(select 1 from public.fin_facility_latest_balance where organization_id=pg_temp.oid('org')) then raise exception 'revoked entity retained context'; end if;
end $$;
reset role;
rollback;
\echo 'Operating contexts: four real SQL/RPC journeys, current evidence, currencies, schedule version, replay, entity/tenant/provider isolation and revocation PASS; HTTP/Auth/Storage binaries separate.'

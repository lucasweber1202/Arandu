\set ON_ERROR_STOP on
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('00000000-0000-4000-8000-0000000cc101','continuity-buyer@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000cc102','continuity-provider@example.invalid',now()),
 ('00000000-0000-4000-8000-0000000cc103','continuity-viewer@example.invalid',now());
insert into public.fin_organizations(id,legal_name,kind,created_by) values
 ('00000000-0000-4000-8000-0000000cc201','Continuity buyer','BUYER','00000000-0000-4000-8000-0000000cc101'),
 ('00000000-0000-4000-8000-0000000cc202','Continuity provider','PROVIDER','00000000-0000-4000-8000-0000000cc102');
insert into public.fin_members(organization_id,user_id,role) values
 ('00000000-0000-4000-8000-0000000cc201','00000000-0000-4000-8000-0000000cc101','admin'),
 ('00000000-0000-4000-8000-0000000cc202','00000000-0000-4000-8000-0000000cc102','admin'),
 ('00000000-0000-4000-8000-0000000cc201','00000000-0000-4000-8000-0000000cc103','viewer');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
 ('00000000-0000-4000-8000-0000000cc301','00000000-0000-4000-8000-0000000cc201','Continuity acquirer','acquirer','00000000-0000-4000-8000-0000000cc101');
create temporary table nc_ids(k text primary key,v text); grant all on nc_ids to authenticated;
create function pg_temp.nc(k text) returns uuid language sql as $$select v::uuid from nc_ids where nc_ids.k=$1$$;
create function pg_temp.nc_error(q text,expected text) returns void language plpgsql as $$begin
 begin execute q; exception when others then if sqlerrm not like expected||'%' then raise exception 'unexpected: % expected %',sqlerrm,expected; end if; return; end;
 raise exception 'expected failure: %',q;
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc101',true);
insert into nc_ids values('contract', public.fin_import_contract('00000000-0000-4000-8000-0000000cc201',null,'00000000-0000-4000-8000-0000000cc301','acquiring','Existing acquiring contract',current_date-365,current_date+20,10,false,'BRL','{"currency":"BRL","mdr_debit_pct":1.5}',null)::text);
select public.fin_record_contract_terms(pg_temp.nc('contract'),'{"currency":"BRL","mdr_debit_pct":3}',1,'Future terms not effective',current_date+90);
select public.fin_set_opportunity_rule('00000000-0000-4000-8000-0000000cc201','contract_renewal',0,'{"enabled":true,"parameters":{"lead_days":30,"cooldown_days":30},"reason":"Synthetic renewal review"}');
reset role;
select public.fin_evaluate_opportunities('00000000-0000-4000-8000-0000000cc201',current_date);
set role authenticated;
insert into nc_ids select 'opportunity',id::text from public.fin_opportunities where source_object_id=pg_temp.nc('contract') and opportunity_type='contract_renewal';
select pg_temp.nc_error(format('select public.fin_opportunity_start_rfq(%L,false)',pg_temp.nc('opportunity')),'opportunity rfq requires confirmation');
insert into nc_ids values('rfq',public.fin_opportunity_start_rfq(pg_temp.nc('opportunity'),true)::text);
do $$begin
 if not exists(select 1 from public.fin_events where entity_id=pg_temp.nc('rfq') and event_type='rfq_created_from_contract' and metadata->>'contract_version'='1' and metadata->>'contract_id'=pg_temp.nc('contract')::text) then raise exception 'origin version missing'; end if;
 if exists(select 1 from public.fin_rfq_invites where rfq_id=pg_temp.nc('rfq')) then raise exception 'automatic invitation'; end if;
 if public.fin_start_contract_rfq(pg_temp.nc('contract'))<>pg_temp.nc('rfq') then raise exception 'duplicate draft'; end if;
end$$;
select public.fin_record_contract_terms(pg_temp.nc('contract'),'{"currency":"BRL","mdr_debit_pct":2}',2,'Synthetic new terms',current_date);
do $$begin if not exists(select 1 from public.fin_events where entity_id=pg_temp.nc('rfq') and event_type='rfq_created_from_contract' and metadata->>'contract_version'='1') then raise exception 'origin rewritten'; end if; end$$;
select public.fin_revise_rfq(pg_temp.nc('rfq'),1,'Renegotiation acquiring',null,'{"monthly_volume":100000}',null);
select public.fin_transition('rfq',pg_temp.nc('rfq'),'open');
insert into nc_ids values('token',public.fin_invite_provider(pg_temp.nc('rfq'),'00000000-0000-4000-8000-0000000cc301'));
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc102',true);
select public.fin_accept_provider_invite((select v from nc_ids where k='token'),'00000000-0000-4000-8000-0000000cc202');
insert into nc_ids select 'proposal',id::text from public.fin_proposals where rfq_id=pg_temp.nc('rfq');
select public.fin_submit_proposal(pg_temp.nc('proposal'),'{"institution":"Synthetic acquiring","mdr_debit":1,"mdr_credit_cash":2}');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc101',true);
select public.fin_transition('rfq',pg_temp.nc('rfq'),'comparing');
insert into nc_ids values('decision',public.fin_record_decision_v2(pg_temp.nc('rfq'),pg_temp.nc('proposal'),1,'{}','Human synthetic decision')::text);
select public.fin_transition_opportunity(pg_temp.nc('opportunity'),'open','{"to_status":"acknowledged"}');
select pg_temp.nc_error(format('select public.fin_complete_opportunity_negotiation(%L,%L,%L,false,%L)',pg_temp.nc('opportunity'),'acknowledged',pg_temp.nc('decision'),'Human review completed'),'opportunity result confirmation required');
select pg_temp.nc_error(format('select public.fin_complete_opportunity_negotiation(%L,%L,%L,true,%L)',pg_temp.nc('opportunity'),'acknowledged',gen_random_uuid(),'Human review completed'),'opportunity result unavailable');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc103',true);
select pg_temp.nc_error(format('select public.fin_complete_opportunity_negotiation(%L,%L,%L,true,%L)',pg_temp.nc('opportunity'),'acknowledged',pg_temp.nc('decision'),'Human review completed'),'forbidden');
-- A finance manager restricted to entities cannot complete group work.
reset role;
update public.fin_members set role='finance_manager',entity_scope='entities' where organization_id='00000000-0000-4000-8000-0000000cc201' and user_id='00000000-0000-4000-8000-0000000cc103';
set role authenticated;
select pg_temp.nc_error(format('select public.fin_complete_opportunity_negotiation(%L,%L,%L,true,%L)',pg_temp.nc('opportunity'),'acknowledged',pg_temp.nc('decision'),'Human review completed'),'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc102',true);
select pg_temp.nc_error(format('select public.fin_complete_opportunity_negotiation(%L,%L,%L,true,%L)',pg_temp.nc('opportunity'),'acknowledged',pg_temp.nc('decision'),'Human review completed'),'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000cc101',true);
select public.fin_complete_opportunity_negotiation(pg_temp.nc('opportunity'),'acknowledged',pg_temp.nc('decision'),true,'Human review completed');
do $$begin
 if not (public.fin_complete_opportunity_negotiation(pg_temp.nc('opportunity'),'acknowledged',pg_temp.nc('decision'),true,'Human review completed')->>'replayed')::boolean then raise exception 'retry not idempotent'; end if;
 if (select count(*) from public.fin_events where entity_id=pg_temp.nc('opportunity') and event_type='opportunity_negotiation_completed')<>1 then raise exception 'duplicate completion'; end if;
 if exists(select 1 from public.fin_contracts where decision_id=pg_temp.nc('decision')) then raise exception 'automatic contract'; end if;
end$$;
insert into nc_ids values('result_contract',public.fin_register_contract(pg_temp.nc('decision'),current_date,current_date+365,30)::text);
do $$begin
 if not exists(select 1 from public.fin_contracts c join public.fin_decisions d on d.id=c.decision_id join public.fin_opportunities o on o.linked_rfq_id=d.rfq_id where c.id=pg_temp.nc('result_contract') and o.id=pg_temp.nc('opportunity') and o.status='acted') then raise exception 'result chain lost'; end if;
 if exists(select 1 from public.fin_value_records where contract_id=pg_temp.nc('result_contract')) then raise exception 'invented savings'; end if;
end$$;
reset role;
rollback;
\echo 'Negotiation continuity: real RPC chain, provenance, human confirmation, authorization and replay PASS'

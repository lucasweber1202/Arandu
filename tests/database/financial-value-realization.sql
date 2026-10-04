\set ON_ERROR_STOP on
-- Transaction-scoped fictitious fixtures. Same suite runs on clean and final fresh install.
begin;
insert into auth.users(id,email) values
('00000000-0000-4000-8000-0000000aa101','value-admin@example.invalid'),
('00000000-0000-4000-8000-0000000aa102','value-viewer@example.invalid'),
('00000000-0000-4000-8000-0000000aa103','value-other@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-0000000aa201','Value Fixture BUYER','BUYER','00000000-0000-4000-8000-0000000aa101'),
('00000000-0000-4000-8000-0000000aa202','Other Value Fixture','BUYER','00000000-0000-4000-8000-0000000aa103');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-0000000aa201','00000000-0000-4000-8000-0000000aa101','admin'),
('00000000-0000-4000-8000-0000000aa201','00000000-0000-4000-8000-0000000aa102','viewer'),
('00000000-0000-4000-8000-0000000aa202','00000000-0000-4000-8000-0000000aa103','admin');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-0000000aa301','00000000-0000-4000-8000-0000000aa201','Value provider fixture','bank','00000000-0000-4000-8000-0000000aa101');
create temporary table value_fixture(key text primary key,id uuid);
grant all on value_fixture to authenticated;
create or replace function pg_temp.value_input() returns jsonb language sql as $$
 select '{"kind":"NEGOTIATED_SAVINGS","title":"Declared period cost","currency":"BRL","period_start":"2025-01-01","period_end":"2025-12-31","target_amount":800,"comparability":"comparable","evidence_reference":"TEST-DOC-001","reason":"Customer verified total costs","baseline":{"source":"manual","reference":"TEST-BASE-001","as_of":"2024-12-01","amount":1000,"currency":"BRL","unit":"period_total","period_start":"2025-01-01","period_end":"2025-12-31","dimensions":{"service":"credit","unit":"total cost","volume":"10000","indexer":"fixed","term_months":"12","amortization":"price","fees":"included","guarantee":"none","grace_months":"0"}},"target_dimensions":{"service":"credit","unit":"total cost","volume":"10000","indexer":"fixed","term_months":"12","amortization":"price","fees":"included","guarantee":"none","grace_months":"0"}}'::jsonb;
$$;
create or replace function pg_temp.value_expect_error(p_sql text,p_expected text) returns void language plpgsql as $$
begin
 begin execute p_sql;
 exception when others then
   if sqlerrm not like p_expected||'%' then raise exception 'unexpected failure: % (expected %)',sqlerrm,p_expected; end if;
   return;
 end;
 raise exception 'expected failure did not occur: %',p_sql;
end $$;
grant execute on function pg_temp.value_input(),pg_temp.value_expect_error(text,text) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa101',true);
insert into value_fixture values('contract',public.fin_import_contract('00000000-0000-4000-8000-0000000aa201',null,'00000000-0000-4000-8000-0000000aa301','credito','Value contract fixture','2025-01-01','2025-12-31',30,false,'BRL','{}',null));
insert into value_fixture select 'record',public.fin_record_value('00000000-0000-4000-8000-0000000aa201',(select id from value_fixture where key='contract'),pg_temp.value_input());
insert into value_fixture select 'avoidance',public.fin_record_value('00000000-0000-4000-8000-0000000aa201',(select id from value_fixture where key='contract'),pg_temp.value_input()||'{"kind":"COST_AVOIDANCE"}');
insert into value_fixture select 'incomparable',public.fin_record_value('00000000-0000-4000-8000-0000000aa201',(select id from value_fixture where key='contract'),pg_temp.value_input()||'{"comparability":"not_comparable"}');
select pg_temp.value_expect_error(format('select public.fin_record_value(%L,%L,%L::jsonb)','00000000-0000-4000-8000-0000000aa201',(select id from value_fixture where key='contract'),pg_temp.value_input()-'baseline'),'invalid value baseline');
select pg_temp.value_expect_error(format('select public.fin_record_value(%L,%L,%L::jsonb)','00000000-0000-4000-8000-0000000aa201',(select id from value_fixture where key='contract'),jsonb_set(pg_temp.value_input(),'{target_dimensions,indexer}','"CDI"')),'value not comparable');
select pg_temp.value_expect_error(format('select public.fin_record_value(%L,%L,%L::jsonb)','00000000-0000-4000-8000-0000000aa201',(select id from value_fixture where key='contract'),pg_temp.value_input()||'{"kind":"REALIZED_SAVINGS"}'),'invalid value kind');
select pg_temp.value_expect_error(format('select public.fin_observe_value(%L,%L::jsonb)',(select id from value_fixture where key='record'),'{"observed_amount":700,"currency":"BRL","coverage":"partial"}'),'value observation incomplete');
insert into value_fixture select 'realized',public.fin_observe_value((select id from value_fixture where key='record'),'{"observed_amount":900,"currency":"BRL","period_start":"2025-01-01","period_end":"2025-12-31","coverage":"complete","verified":true,"source":"statement","evidence_reference":"TEST-OBS-001","verification_reason":"Verified full period statement"}');
do $$ begin
 if (select value_amount from public.fin_value_records where id=(select id from value_fixture where key='record'))<>200 then raise exception 'estimated amount wrong'; end if;
 if (select value_amount from public.fin_value_records where id=(select id from value_fixture where key='realized'))<>100 then raise exception 'realized confused with negotiated'; end if;
 if (select value_amount from public.fin_value_records where id=(select id from value_fixture where key='incomparable')) is not null then raise exception 'incomparable value invented'; end if;
 if (select count(*) from public.fin_value_totals('00000000-0000-4000-8000-0000000aa201','2025-01-01','2025-12-31'))<>3 then raise exception 'kinds mixed'; end if;
 if not exists(select 1 from public.fin_query_graph('00000000-0000-4000-8000-0000000aa201','contract',(select id from value_fixture where key='contract'),'value_realization',null,null,null,null,20,0)) then raise exception 'graph relation missing'; end if;
end $$;
select pg_temp.value_expect_error(format('delete from public.fin_value_records where id=%L',(select id from value_fixture where key='record')),'permission denied');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa102',true);
select pg_temp.value_expect_error(format('select public.fin_record_value(%L,%L,%L::jsonb)','00000000-0000-4000-8000-0000000aa201',(select id from value_fixture where key='contract'),pg_temp.value_input()),'forbidden');
select pg_temp.value_expect_error(format('select public.fin_invalidate_value(%L,%L::jsonb)',(select id from value_fixture where key='record'),'{"reason":"Viewer must not invalidate"}'),'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa103',true);
do $$ begin if exists(select 1 from public.fin_value_records) or exists(select 1 from public.fin_value_observations) or exists(select 1 from public.fin_value_methodologies) then raise exception 'cross tenant leak'; end if; end $$;
select pg_temp.value_expect_error(format('select public.fin_observe_value(%L,%L::jsonb)',(select id from value_fixture where key='record'),'{}'),'forbidden');
reset role;
-- A restricted member without grants cannot read group-level facts.
update public.fin_members set entity_scope='entities' where user_id='00000000-0000-4000-8000-0000000aa102';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa102',true);
do $$ begin if exists(select 1 from public.fin_value_records) or exists(select 1 from public.fin_value_observations) then raise exception 'entity scope leaked group value'; end if; end $$;
reset role;
select pg_temp.value_expect_error('update public.fin_value_methodologies set version=2','immutable record');
select pg_temp.value_expect_error('update public.fin_value_records set target_amount=0','immutable record');
do $$ begin
 if has_table_privilege('anon','public.fin_value_records','SELECT') or has_function_privilege('anon','public.fin_record_value(uuid,uuid,jsonb)','EXECUTE') then raise exception 'anonymous value exposed'; end if;
 if (select count(*) from public.fin_governance_export_datasets() where dataset in ('value_records','value_observations','value_methodologies'))<>3 then raise exception 'portability incomplete'; end if;
 if exists(select 1 from public.fin_events where organization_id='00000000-0000-4000-8000-0000000aa201' and event_type like 'value_%' and (metadata ? 'baseline' or metadata ? 'amount' or metadata ? 'evidence_reference')) then raise exception 'audit contains sensitive value payload'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa101',true);
select public.fin_invalidate_value((select id from value_fixture where key='realized'),'{"reason":"Corrected statement requires new evidence"}');
do $$ begin if exists(select 1 from public.fin_value_totals('00000000-0000-4000-8000-0000000aa201','2025-01-01','2025-12-31') where kind='REALIZED_SAVINGS') then raise exception 'invalidated amount still counted'; end if; end $$;
reset role;
-- Revocation is enforced by membership reads, including an existing JWT.
delete from public.fin_members where organization_id='00000000-0000-4000-8000-0000000aa201' and user_id='00000000-0000-4000-8000-0000000aa101';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa101',true);
do $$ begin if exists(select 1 from public.fin_value_records) or exists(select 1 from public.fin_value_observations) then raise exception 'revoked user value leak'; end if; end $$;
select pg_temp.value_expect_error(format('select public.fin_invalidate_value(%L,%L::jsonb)',(select id from value_fixture where key='record'),'{"reason":"Revoked actor must fail"}'),'forbidden');
reset role;
rollback;

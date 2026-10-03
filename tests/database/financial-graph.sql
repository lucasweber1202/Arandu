\set ON_ERROR_STOP on
begin;
create temporary table graph_ids(key text primary key,value uuid);
insert into graph_ids select 'A',id from public.fin_legal_entities where organization_id='00000000-0000-4000-8000-0000000ab001' and short_name='A';
insert into graph_ids select 'B',id from public.fin_legal_entities where organization_id='00000000-0000-4000-8000-0000000ab001' and short_name='B';
insert into graph_ids select 'facility',id from public.fin_facilities where organization_id='00000000-0000-4000-8000-0000000ab001' and name='Conta garantida A';
insert into graph_ids select 'snapshot_rfq',rfq_id from public.fin_rfq_profile_snapshots where organization_id='00000000-0000-4000-8000-0000000ef001' and field_value='100' limit 1;
grant select on graph_ids to authenticated;
create function pg_temp.graph_denied(p_sql text,p_error text) returns void language plpgsql as $$ begin
 execute p_sql; raise exception 'Graph probe unexpectedly succeeded';
exception when others then if sqlerrm<>p_error then raise; end if; end $$;
grant execute on function pg_temp.graph_denied(text,text) to authenticated;
-- Existing guarantee RLS hides a legacy link into B entirely.
-- A facility itself is entity-scoped; its legacy hidden contract must be redacted.
insert into public.fin_facilities(id,organization_id,legal_entity_id,provider_id,kind,name,currency,principal_amount,source,created_by)
values ('00000000-0000-4000-8000-0000000ab099','00000000-0000-4000-8000-0000000ab001',(select value from graph_ids where key='B'),'00000000-0000-4000-8000-0000000ab010','term_loan','Hidden Graph B','BRL',100,'declared','00000000-0000-4000-8000-0000000aa001');
insert into public.fin_guarantees(organization_id,legal_entity_id,kind,description,currency,committed_amount,facility_id,source,created_by)
values ('00000000-0000-4000-8000-0000000ab001',(select value from graph_ids where key='A'),'receivables','Legacy visible guarantee','BRL',10,'00000000-0000-4000-8000-0000000ab099','declared','00000000-0000-4000-8000-0000000aa001');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa001',false);
insert into public.fin_contracts(id,organization_id,legal_entity_id,provider_id,origin,title,product,starts_on,ends_on,owner_id)
values ('00000000-0000-4000-8000-0000000ab098','00000000-0000-4000-8000-0000000ab001',(select value from graph_ids where key='B'),'00000000-0000-4000-8000-0000000ab010','imported','Hidden Graph contract B','credit',current_date,current_date+365,'00000000-0000-4000-8000-0000000aa001');
insert into public.fin_facilities(organization_id,legal_entity_id,provider_id,contract_id,kind,name,currency,principal_amount,source,created_by)
values ('00000000-0000-4000-8000-0000000ab001',(select value from graph_ids where key='A'),'00000000-0000-4000-8000-0000000ab010','00000000-0000-4000-8000-0000000ab098','term_loan','Legacy visible facility','BRL',100,'declared','00000000-0000-4000-8000-0000000aa001');
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa002',false);
do $$ begin
 if not exists(select 1 from public.fin_query_graph('00000000-0000-4000-8000-0000000ab001','provider','00000000-0000-4000-8000-0000000ab010','facility') where object_id=(select value::text from graph_ids where key='facility')) then raise exception 'own facility missing'; end if;
 if not exists(select 1 from public.fin_query_graph('00000000-0000-4000-8000-0000000ab001','facility',(select value from graph_ids where key='facility'),'guarantee')) then raise exception 'facility guarantee relation missing'; end if;
 if exists(select 1 from public.fin_financial_graph where legal_entity_id=(select value from graph_ids where key='B') or title='Hidden Graph B' or facility_id='00000000-0000-4000-8000-0000000ab099') then raise exception 'cross entity or hidden ancestor leak'; end if;
 if exists(select 1 from public.fin_query_graph('00000000-0000-4000-8000-0000000ab001','provider','00000000-0000-4000-8000-0000000ab010',p_query=>'Hidden Graph B')) then raise exception 'Graph search leak'; end if;
 if exists(select 1 from public.fin_financial_graph where title='Legacy visible guarantee') then raise exception 'hidden guarantee discovered'; end if;
 if not exists(select 1 from public.fin_financial_graph where title='Legacy visible facility' and contract_id is null) or exists(select 1 from public.fin_financial_graph where contract_id='00000000-0000-4000-8000-0000000ab098') then raise exception 'hidden contract not redacted'; end if;
 if (select count(*) from public.fin_query_graph('00000000-0000-4000-8000-0000000ab001','provider','00000000-0000-4000-8000-0000000ab010',p_limit=>1))<>2 then raise exception 'pagination sentinel wrong'; end if;
end $$;
select pg_temp.graph_denied($q$select * from public.fin_query_graph('00000000-0000-4000-8000-0000000ab001','entity',(select value from graph_ids where key='B'))$q$,'graph root unavailable');
select pg_temp.graph_denied($q$select * from public.fin_query_graph('00000000-0000-4000-8000-0000000ab001','facility','00000000-0000-4000-8000-0000000ab099')$q$,'graph root unavailable');
select pg_temp.graph_denied($q$select * from public.fin_query_graph('00000000-0000-4000-8000-0000000ab001','organization','00000000-0000-4000-8000-0000000ab001',p_limit=>null)$q$,'invalid graph query');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa004',false);
do $$ begin if exists(select 1 from public.fin_financial_graph where organization_id='00000000-0000-4000-8000-0000000ab001') then raise exception 'cross tenant traversal'; end if; end $$;
select pg_temp.graph_denied($q$select * from public.fin_query_graph('00000000-0000-4000-8000-0000000ab001','provider','00000000-0000-4000-8000-0000000ab010')$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000aa005',false);
do $$ begin if exists(select 1 from public.fin_financial_graph) then raise exception 'provider buyer traversal'; end if; end $$;
select pg_temp.graph_denied($q$select * from public.fin_query_graph('00000000-0000-4000-8000-0000000ab001','organization','00000000-0000-4000-8000-0000000ab001')$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee003',false);
do $$ begin if not exists(select 1 from public.fin_query_graph('00000000-0000-4000-8000-0000000ef001','rfq',(select value from graph_ids where key='snapshot_rfq'),'passport_snapshot') where facts->>'value'='100') then raise exception 'snapshot facts not point in time'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee004',false);
do $$ begin if exists(select 1 from public.fin_financial_graph where rfq_id=(select value from graph_ids where key='snapshot_rfq')) then raise exception 'snapshot traversal leak'; end if; end $$;
select pg_temp.graph_denied($q$select * from public.fin_query_graph('00000000-0000-4000-8000-0000000ef001','rfq',(select value from graph_ids where key='snapshot_rfq'))$q$,'graph root unavailable');
reset role;
rollback;
\echo 'Graph: canonical traversal, hidden ancestor redaction, tenant/entity/provider/search/snapshot denial and pagination passed.'

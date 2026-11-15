\set ON_ERROR_STOP on
begin;
create function pg_temp.a10(n integer) returns uuid language sql immutable as $$select ('00000000-0000-4000-8000-000000aa'||lpad(n::text,4,'0'))::uuid$$;
create function pg_temp.fail(q text,expected text) returns void language plpgsql as $$begin
 begin execute q; exception when others then if sqlerrm not like '%'||expected||'%' then raise exception 'unexpected % expected %',sqlerrm,expected; end if; return; end;
 raise exception 'expected rejection: %',q;
end$$;
insert into auth.users(id,email) select pg_temp.a10(n),'arandu10-'||n||'@example.invalid' from generate_series(1,7)n;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
(pg_temp.a10(100),'A10 buyer','BUYER',pg_temp.a10(1)),(pg_temp.a10(101),'A10 other','BUYER',pg_temp.a10(4)),(pg_temp.a10(102),'A10 institution','PROVIDER',pg_temp.a10(5));
insert into public.fin_members(organization_id,user_id,role) values
(pg_temp.a10(100),pg_temp.a10(1),'admin'),(pg_temp.a10(100),pg_temp.a10(2),'analyst'),(pg_temp.a10(100),pg_temp.a10(3),'viewer'),
(pg_temp.a10(101),pg_temp.a10(4),'admin'),(pg_temp.a10(102),pg_temp.a10(5),'provider_user'),(pg_temp.a10(100),pg_temp.a10(6),'analyst'),(pg_temp.a10(100),pg_temp.a10(7),'analyst');
insert into public.fin_legal_entities(id,organization_id,kind,legal_name,country,currency,created_by) values
(pg_temp.a10(300),pg_temp.a10(100),'legal_entity','A10 entity A','BR','BRL',pg_temp.a10(1)),(pg_temp.a10(301),pg_temp.a10(100),'legal_entity','A10 entity B','BR','BRL',pg_temp.a10(1));
update public.fin_members set entity_scope='entities' where user_id in(pg_temp.a10(6),pg_temp.a10(7));
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
(pg_temp.a10(100),pg_temp.a10(6),pg_temp.a10(300),pg_temp.a10(1)),(pg_temp.a10(100),pg_temp.a10(7),pg_temp.a10(301),pg_temp.a10(1));
insert into public.fin_rfqs(id,organization_id,legal_entity_id,product,title,status,owner_id,demand) values
(pg_temp.a10(400),pg_temp.a10(100),pg_temp.a10(300),'acquiring','A10 scoped RFQ','draft',pg_temp.a10(1),'{}');
create temporary table a10_records(k text primary key,v jsonb); grant all on a10_records to authenticated;
create function pg_temp.sid(k text) returns uuid language sql as $$select (v->>'id')::uuid from a10_records where a10_records.k=$1$$;
create function pg_temp.cmd(op text,id uuid default null,ver integer default null,vals jsonb default '{"name":"Human analysis","weights":{"mdr_debit":40},"request_key":"a10-create-0001"}') returns jsonb language sql as $$select public.fin_scenario_command(pg_temp.a10(400),id,ver,op,vals)$$;
do $$begin
 if has_table_privilege('authenticated','public.fin_decision_scenarios','INSERT') or has_table_privilege('authenticated','public.fin_decision_scenarios','UPDATE')
 or has_table_privilege('authenticated','public.fin_decision_scenarios','DELETE')
 or has_table_privilege('anon','public.fin_decision_scenarios','SELECT') or has_function_privilege('anon','public.fin_scenario_command(uuid,uuid,integer,text,jsonb)','EXECUTE')
 or not has_table_privilege('service_role','public.fin_decision_scenarios','SELECT')
 or not has_table_privilege('service_role','public.fin_decision_scenarios','UPDATE')
 or not has_table_privilege('service_role','public.fin_decision_scenarios','DELETE')
 or has_table_privilege('service_role','public.fin_decision_scenarios','INSERT') then raise exception 'scenario privileges'; end if;
end$$;
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.a10(1)::text,true);
insert into a10_records values('original',pg_temp.cmd('create'));
-- The canonical demo seed calls REST with service_role to read, backdate, and
-- delete scenario rows. Exercise the actual role, then roll back its mutations
-- so all downstream RPC, audit, version and RLS assertions remain unchanged.
savepoint a10_demo_operator;
reset role;
set role service_role;
do $declare changed integer;begin
 if (select count(*) from public.fin_decision_scenarios where request_key='a10-create-0001')<>1
 then raise exception 'demo operator cannot read scenario'; end if;
 update public.fin_decision_scenarios set created_at=created_at-interval '1 day',
   updated_at=updated_at-interval '1 day' where request_key='a10-create-0001';
 get diagnostics changed=row_count;
 if changed<>1 then raise exception 'demo operator cannot backdate scenario'; end if;
 delete from public.fin_decision_scenarios where request_key='a10-create-0001';
 get diagnostics changed=row_count;
 if changed<>1 or exists(select 1 from public.fin_decision_scenarios where request_key='a10-create-0001')
 then raise exception 'demo operator cannot clean scenario'; end if;
end$;
reset role;
rollback to savepoint a10_demo_operator;
release savepoint a10_demo_operator;
set role authenticated;
do $$declare s jsonb;begin
 s:=pg_temp.cmd('create');
 if s is distinct from (select v from a10_records where k='original') then raise exception 'idempotent replay';end if;
 if (select count(*) from public.fin_events where entity_id=pg_temp.sid('original'))<>1 then raise exception 'duplicate event';end if;
 if (select count(*) from public.fin_decision_scenarios where rfq_id=pg_temp.a10(400))<>1 then raise exception 'duplicate create';end if;
end$$;
select pg_temp.fail($q$select pg_temp.cmd('create',null,null,'{"name":"Different payload","weights":{"mdr_debit":40},"request_key":"a10-create-0001"}')$q$,'scenario request conflict');
select pg_temp.fail($q$select pg_temp.cmd('create',null,null,'{"name":"Bad weight","weights":{"mdr_debit":101},"request_key":"a10-create-0002"}')$q$,'invalid scenario');
select pg_temp.fail($q$select pg_temp.cmd('update',pg_temp.sid('original'),2)$q$,'scenario version conflict');
insert into a10_records values('updated',pg_temp.cmd('update',pg_temp.sid('original'),1,'{"name":"Updated analysis","weights":{"mdr_debit":60}}'));
select pg_temp.fail($q$select pg_temp.cmd('update',pg_temp.sid('original'),1)$q$,'scenario version conflict');
insert into a10_records values('copy',pg_temp.cmd('duplicate',pg_temp.sid('original'),null,'{"name":"Copied analysis","request_key":"a10-duplicate-01"}'));
do $$begin
 if (select v->'weights' from a10_records where k='copy') is distinct from (select v->'weights' from a10_records where k='updated') then raise exception 'copy lost definition';end if;
 if (select count(*) from public.fin_events where entity_id=pg_temp.sid('original'))<>2 then raise exception 'history missing';end if;
end$$;
-- Viewer reads but cannot mutate, including direct RPC and direct table writes.
select set_config('request.jwt.claim.sub',pg_temp.a10(3)::text,true);
do $$begin if (select count(*) from public.fin_decision_scenarios where rfq_id=pg_temp.a10(400))<>2 then raise exception 'viewer read';end if;end$$;
select pg_temp.fail($q$select pg_temp.cmd('create')$q$,'forbidden');
select pg_temp.fail($q$update public.fin_decision_scenarios set name='Tampered' where id=pg_temp.sid('original')$q$,'permission denied');
-- Other organization, institution and entity-restricted colleague see no row/history.
select set_config('request.jwt.claim.sub',pg_temp.a10(4)::text,true);
do $$begin if exists(select 1 from public.fin_decision_scenarios where rfq_id=pg_temp.a10(400)) or exists(select 1 from public.fin_events where entity_id=pg_temp.sid('original')) then raise exception 'tenant leak';end if;end$$;
select pg_temp.fail($q$select public.fin_scenario_context(pg_temp.a10(400))$q$,'forbidden');
select set_config('request.jwt.claim.sub',pg_temp.a10(5)::text,true);
select pg_temp.fail($q$select public.fin_scenario_context(pg_temp.a10(400))$q$,'forbidden');
do $$begin if exists(select 1 from public.fin_decision_scenarios where rfq_id=pg_temp.a10(400)) then raise exception 'provider leak';end if;end$$;
select set_config('request.jwt.claim.sub',pg_temp.a10(7)::text,true);
do $$begin if exists(select 1 from public.fin_decision_scenarios where rfq_id=pg_temp.a10(400)) or exists(select 1 from public.fin_events where entity_id=pg_temp.sid('original')) then raise exception 'entity leak';end if;end$$;
select pg_temp.fail($q$select pg_temp.cmd('create')$q$,'forbidden');
select set_config('request.jwt.claim.sub',pg_temp.a10(6)::text,true);
do $$begin if (select count(*) from public.fin_decision_scenarios where rfq_id=pg_temp.a10(400))<>2 or (select count(*) from public.fin_events where entity_id=pg_temp.sid('original'))<>2 then raise exception 'entity grant/history';end if;end$$;
-- Context is preserved until explicit refresh, and duplication preserves staleness.
reset role;
update public.fin_rfqs set title='A10 revised demand',updated_at=clock_timestamp() where id=pg_temp.a10(400);
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.a10(1)::text,true);
do $$begin if public.fin_scenario_context(pg_temp.a10(400))=(select context from public.fin_decision_scenarios where id=pg_temp.sid('original')) then raise exception 'context did not change';end if;end$$;
insert into a10_records values('stale_copy',pg_temp.cmd('duplicate',pg_temp.sid('original'),null,'{"name":"Stale copy","request_key":"a10-duplicate-02"}'));
insert into a10_records values('refreshed',pg_temp.cmd('update',pg_temp.sid('original'),2,'{"name":"Refreshed analysis","weights":{"mdr_debit":60},"refresh_context":true}'));
do $$begin if (select context from public.fin_decision_scenarios where id=pg_temp.sid('original')) is distinct from public.fin_scenario_context(pg_temp.a10(400)) then raise exception 'refresh missing';end if;end$$;
insert into a10_records values('archived',pg_temp.cmd('archive',pg_temp.sid('original'),3,'{}'));
select pg_temp.fail($q$select pg_temp.cmd('update',pg_temp.sid('original'),4)$q$,'scenario version conflict');
do $$begin
 if (select status from public.fin_decision_scenarios where id=pg_temp.sid('original'))<>'archived' then raise exception 'archive failed';end if;
 if (select count(*) from public.fin_events where entity_id=pg_temp.sid('original'))<>4 then raise exception 'audit versions';end if;
 if (select count(*) from public.fin_decision_scenarios where rfq_id=pg_temp.a10(400))<>3 then raise exception 'scenario recovery';end if;
end$$;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.fail($q$select public.fin_scenario_context(pg_temp.a10(400))$q$,'forbidden');
reset role;
do $$begin if not exists(select 1 from public.fin_governance_export_datasets() where dataset='decision_scenarios') then raise exception 'export missing';end if;end$$;
-- Real canonical approvals: stale proposal and RFQ, SoD, then successful vote.
select set_config('request.jwt.claim.sub','',true);
update public.fin_rfqs set status='collecting' where id=pg_temp.a10(400);
insert into public.fin_providers(id,organization_id,name,kind,created_by) values(pg_temp.a10(200),pg_temp.a10(100),'A10 approval bank','bank',pg_temp.a10(1));
insert into public.fin_rfq_invites(id,buyer_organization_id,rfq_id,provider_id,provider_organization_id,token_hash,created_by,status,recipient_mode) values
(pg_temp.a10(500),pg_temp.a10(100),pg_temp.a10(400),pg_temp.a10(200),pg_temp.a10(102),repeat('a',64),pg_temp.a10(1),'accepted','organization_open');
insert into public.fin_proposals(id,invite_id,rfq_id,buyer_organization_id,provider_id,provider_organization_id,product,status,current_version) values
(pg_temp.a10(600),pg_temp.a10(500),pg_temp.a10(400),pg_temp.a10(100),pg_temp.a10(200),pg_temp.a10(102),'acquiring','submitted',1);
insert into public.fin_proposal_versions(proposal_id,version,terms,submitted_by) values(pg_temp.a10(600),1,'{"mdr_debit":1.5}',pg_temp.a10(5));
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.a10(1)::text,true);
select pg_temp.fail($q$select public.fin_request_approval(pg_temp.a10(400),pg_temp.a10(600),array[pg_temp.a10(1)],'self')$q$,'invalid approver');
insert into a10_records values('approval',jsonb_build_object('id',public.fin_request_approval(pg_temp.a10(400),pg_temp.a10(600),array[pg_temp.a10(3)],'A10 manual review')));
select pg_temp.fail($q$select public.fin_act_on_approval_v2(pg_temp.sid('approval'),'approved')$q$,'forbidden');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.fin_proposals set status='withdrawn' where id=pg_temp.a10(600);
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.a10(3)::text,true);
select pg_temp.fail($q$select public.fin_act_on_approval_v2(pg_temp.sid('approval'),'approved')$q$,'approval stale');
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.fin_proposals set status='submitted' where id=pg_temp.a10(600);
update public.fin_rfqs set updated_at=clock_timestamp() where id=pg_temp.a10(400);
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.a10(3)::text,true);
select pg_temp.fail($q$select public.fin_act_on_approval_v2(pg_temp.sid('approval'),'approved')$q$,'approval stale');
select set_config('request.jwt.claim.sub',pg_temp.a10(1)::text,true);
select public.fin_supersede_approval(pg_temp.sid('approval'),'RFQ context changed; request a new human review');
insert into a10_records values('current_approval',jsonb_build_object('id',public.fin_request_approval(pg_temp.a10(400),pg_temp.a10(600),array[pg_temp.a10(3)],'Current A10 manual review')));
select set_config('request.jwt.claim.sub',pg_temp.a10(3)::text,true);
do $$begin if public.fin_act_on_approval_v2(pg_temp.sid('current_approval'),'approved')<>'approved' then raise exception 'current approval failed';end if;end$$;
reset role;
-- Expired is a canonical lifecycle state, not only a past end date.
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.a10(1)::text,true);
insert into a10_records values('expired_contract',jsonb_build_object('id',public.fin_import_contract(pg_temp.a10(100),pg_temp.a10(300),pg_temp.a10(200),'acquiring','A10 expired renewal',current_date-100,current_date-1,30,false,'BRL','{"currency":"BRL"}',null)));
reset role;
select set_config('request.jwt.claim.sub','',true);
update public.fin_contracts set status='expired',owner_id=pg_temp.a10(6) where id=pg_temp.sid('expired_contract');
delete from public.fin_members where organization_id=pg_temp.a10(100) and user_id=pg_temp.a10(6);
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.a10(3)::text,true);
do $$begin if not exists(select 1 from public.fin_renewal_operations where id=pg_temp.sid('expired_contract') and urgency='expired' and unassigned) then raise exception 'canonical expired contract missing from renewal portfolio';end if;end$$;
select set_config('request.jwt.claim.sub',pg_temp.a10(5)::text,true);
do $$begin if exists(select 1 from public.fin_renewal_operations where id=pg_temp.sid('expired_contract')) then raise exception 'provider renewal leak';end if;end$$;
select pg_temp.fail($q$select public.fin_scenario_context(pg_temp.a10(400))$q$,'forbidden');
reset role;
rollback;
select 'Arandu 10 scenarios CRUD/replay/version/history/auth/tenant/entity/provider/refresh/archive passed' as result;

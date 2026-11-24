\set ON_ERROR_STOP on
-- OPS-POOL-01: maintenance jobs of one Demo workspace never touch the shared
-- baseline nor another visitor. Real PostgreSQL; rolled back.
begin;
create function pg_temp.p(n integer) returns uuid language sql immutable as $$select ('00000000-0000-4000-8000-0000001c'||lpad(n::text,4,'0'))::uuid$$;
create function pg_temp.fail(q text,expected text) returns void language plpgsql as $$begin
 begin execute q; exception when others then if sqlerrm not like '%'||expected||'%' then raise exception 'unexpected % expected %',sqlerrm,expected; end if; return; end;
 raise exception 'expected rejection: %',q;
end$$;
-- Hash of every row, in every public table with organization_id, outside the
-- organisations of the workspace being provisioned (includes child tables).
create function pg_temp.snapshot(excluded uuid[]) returns table(t text, rows bigint, digest text) language plpgsql as $$
declare r record; begin
 for r in select c.table_name from information_schema.columns c join information_schema.tables x on x.table_schema=c.table_schema and x.table_name=c.table_name and x.table_type='BASE TABLE'
          where c.table_schema='public' and c.column_name='organization_id' order by 1 loop
   t:=r.table_name;
   execute format('select count(*), coalesce(md5(string_agg(md5(x::text), '','' order by md5(x::text))), '''') from public.%I x where not (organization_id = any($1))', r.table_name)
     into rows, digest using excluded;
   return next;
 end loop;
end$$;

delete from public.fin_settings where key='deployment_environment';
insert into public.fin_settings(key,value) values('deployment_environment','demo');
insert into auth.users(id,email) values
 (pg_temp.p(1),'helena@vitta-demo.example'),
 (pg_temp.p(2),'helena+ws-aaaaaaaaaa@vitta-demo.example'),
 (pg_temp.p(3),'helena+ws-bbbbbbbbbb@vitta-demo.example'),
 (pg_temp.p(4),'ana+ws-bbbbbbbbbb@atlas-demo.example');
insert into public.fin_organizations(id,legal_name,kind,created_by) values
 (pg_temp.p(100),'Baseline Vitta','BUYER',pg_temp.p(1)),
 (pg_temp.p(101),'Visitor A Vitta','BUYER',pg_temp.p(2)),
 (pg_temp.p(102),'Workspace B Vitta','BUYER',pg_temp.p(3)),
 (pg_temp.p(103),'Workspace B Atlas','PROVIDER',pg_temp.p(4)),
 (pg_temp.p(104),'Hijack attempt','BUYER',pg_temp.p(3));
insert into public.fin_members(organization_id,user_id,role) values
 (pg_temp.p(100),pg_temp.p(1),'admin'),(pg_temp.p(101),pg_temp.p(2),'admin'),(pg_temp.p(102),pg_temp.p(3),'admin'),
 (pg_temp.p(103),pg_temp.p(4),'provider_user'),
 -- Created by a B account but with a baseline member: never in B's scope.
 (pg_temp.p(104),pg_temp.p(3),'admin'),(pg_temp.p(104),pg_temp.p(1),'viewer');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
 (pg_temp.p(200),pg_temp.p(100),'Bank base','bank',pg_temp.p(1)),(pg_temp.p(201),pg_temp.p(101),'Bank A','bank',pg_temp.p(2)),
 (pg_temp.p(202),pg_temp.p(102),'Bank B','bank',pg_temp.p(3)),(pg_temp.p(204),pg_temp.p(104),'Bank H','bank',pg_temp.p(3));
-- Every buyer has a contract in its notice window: the global cron would mark all of them.
insert into public.fin_contracts(id,organization_id,provider_id,product,starts_on,ends_on,owner_id,origin) values
 (pg_temp.p(300),pg_temp.p(100),pg_temp.p(200),'credit',current_date-300,current_date+20,pg_temp.p(1),'imported'),
 (pg_temp.p(301),pg_temp.p(101),pg_temp.p(201),'credit',current_date-300,current_date+20,pg_temp.p(2),'imported'),
 (pg_temp.p(302),pg_temp.p(102),pg_temp.p(202),'credit',current_date-300,current_date+20,pg_temp.p(3),'imported'),
 (pg_temp.p(304),pg_temp.p(104),pg_temp.p(204),'credit',current_date-300,current_date+20,pg_temp.p(3),'imported');
insert into public.fin_opportunity_scans(organization_id,last_touched) values (pg_temp.p(100),7),(pg_temp.p(101),3) on conflict do nothing;
insert into public.fin_demo_workspaces(slug,baseline_version,status,buyer_organization_id,provider_organization_ids,user_ids,claim_token_hash,claimed_at,expires_at,idle_expires_at) values
 ('aaaaaaaaaa','vitta-2026-10','claimed',pg_temp.p(101),'{}',array[pg_temp.p(2)],repeat('a',64),now(),now()+interval '1 day',now()+interval '1 hour');
insert into public.fin_demo_workspaces(slug,baseline_version,status) values ('bbbbbbbbbb','vitta-2026-10','provisioning');

-- Scope is derived from accounts only; the hijack org and other tenants are excluded.
do $$begin
 if public.fin_demo_workspace_orgs('bbbbbbbbbb') <> array[pg_temp.p(102),pg_temp.p(103)] then raise exception 'scope %',public.fin_demo_workspace_orgs('bbbbbbbbbb'); end if;
 if has_function_privilege('authenticated','public.fin_demo_workspace_run_jobs(text,date)','EXECUTE')
 or has_function_privilege('anon','public.fin_demo_workspace_run_jobs(text,date)','EXECUTE')
 or has_function_privilege('service_role','public.fin_demo_workspace_orgs(text)','EXECUTE')
 or not has_function_privilege('service_role','public.fin_demo_workspace_run_jobs(text,date)','EXECUTE') then raise exception 'pool job privileges'; end if;
end$$;

create temporary table before_snap as select * from pg_temp.snapshot(array[pg_temp.p(102),pg_temp.p(103)]);
set role service_role;
create temporary table ran as select public.fin_demo_workspace_run_jobs('bbbbbbbbbb', current_date) v;
-- Negative: claimed workspace, unknown/invalid slug.
select pg_temp.fail($q$select public.fin_demo_workspace_run_jobs('aaaaaaaaaa', current_date)$q$,'not provisioning');
select pg_temp.fail($q$select public.fin_demo_workspace_run_jobs('cccccccccc', current_date)$q$,'not provisioning');
select pg_temp.fail($q$select public.fin_demo_workspace_run_jobs('x'' or 1=1', current_date)$q$,'invalid demo workspace job');
reset role;
-- Authenticated visitor cannot run maintenance even for its own workspace.
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.p(3)::text,true);
select pg_temp.fail($q$select public.fin_demo_workspace_run_jobs('bbbbbbbbbb', current_date)$q$,'permission denied');
reset role;

do $$declare d text; begin
 if (select (v->>'renewals')::int from ran)<>1 or (select (v->>'scope_organizations')::int from ran)<>2 then raise exception 'scoped run %',(select v from ran); end if;
 if not exists(select 1 from public.fin_renewal_milestones where contract_id=pg_temp.p(302)) then raise exception 'workspace story missing'; end if;
 if exists(select 1 from public.fin_renewal_milestones where contract_id in (pg_temp.p(300),pg_temp.p(301),pg_temp.p(304))) then raise exception 'scope leaked'; end if;
 select string_agg(coalesce(a.t,b.t),', ') into d from before_snap a full join pg_temp.snapshot(array[pg_temp.p(102),pg_temp.p(103)]) b on a.t=b.t
   where a.rows is distinct from b.rows or a.digest is distinct from b.digest;
 if d is not null then raise exception 'rows outside the workspace changed: %',d; end if;
 if (select heartbeat_at from public.fin_demo_workspaces where slug='bbbbbbbbbb') is null then raise exception 'heartbeat'; end if;
end$$;

-- Outside the Demo the runner refuses.
update public.fin_settings set value='production' where key='deployment_environment';
set role service_role;
select pg_temp.fail($q$select public.fin_demo_workspace_run_jobs('bbbbbbbbbb', current_date)$q$,'demo workspaces unavailable outside demo');
reset role;
update public.fin_settings set value='demo' where key='deployment_environment';

-- The legitimate global cron is unchanged: without scope it reaches every tenant.
set role service_role;
select public.fin_run_renewal_schedule(current_date);
reset role;
do $$begin
 if (select count(distinct contract_id) from public.fin_renewal_milestones where contract_id in (pg_temp.p(300),pg_temp.p(301),pg_temp.p(302),pg_temp.p(304)))<>4 then raise exception 'global cron regressed'; end if;
end$$;
rollback;

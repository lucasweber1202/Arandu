\set ON_ERROR_STOP on
begin;
create function pg_temp.cid(n integer) returns uuid language sql immutable as $$select ('00000000-0000-4000-8000-000000c3'||lpad(n::text,4,'0'))::uuid$$;
insert into auth.users(id,email,email_confirmed_at) select pg_temp.cid(n),'crm-'||n||'@example.invalid',now() from generate_series(1,8) n;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
 (pg_temp.cid(100),'CRM buyer','BUYER',pg_temp.cid(1)),(pg_temp.cid(101),'CRM other buyer','BUYER',pg_temp.cid(4)),
 (pg_temp.cid(102),'CRM institution','PROVIDER',pg_temp.cid(5)),(pg_temp.cid(103),'CRM other institution','PROVIDER',pg_temp.cid(6));
insert into public.fin_members(organization_id,user_id,role) values
 (pg_temp.cid(100),pg_temp.cid(1),'admin'),(pg_temp.cid(100),pg_temp.cid(2),'analyst'),(pg_temp.cid(100),pg_temp.cid(3),'viewer'),
 (pg_temp.cid(101),pg_temp.cid(4),'admin'),(pg_temp.cid(102),pg_temp.cid(5),'provider_user'),(pg_temp.cid(103),pg_temp.cid(6),'provider_user'),
 (pg_temp.cid(100),pg_temp.cid(7),'analyst'),(pg_temp.cid(100),pg_temp.cid(8),'analyst');
insert into public.fin_legal_entities(id,organization_id,kind,legal_name,country,currency,created_by) values
 (pg_temp.cid(300),pg_temp.cid(100),'legal_entity','CRM entity A','BR','BRL',pg_temp.cid(1)),(pg_temp.cid(301),pg_temp.cid(100),'legal_entity','CRM entity B','BR','BRL',pg_temp.cid(1));
update public.fin_members set entity_scope='entities' where organization_id=pg_temp.cid(100) and user_id in(pg_temp.cid(2),pg_temp.cid(7));
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
 (pg_temp.cid(100),pg_temp.cid(2),pg_temp.cid(300),pg_temp.cid(1)),(pg_temp.cid(100),pg_temp.cid(7),pg_temp.cid(301),pg_temp.cid(1));
insert into public.fin_providers(id,organization_id,name,kind,contact_email,created_by) values
 (pg_temp.cid(200),pg_temp.cid(100),'CRM bank','bank','crm-5@example.invalid',pg_temp.cid(1)),(pg_temp.cid(201),pg_temp.cid(101),'Other CRM bank','bank',null,pg_temp.cid(4));
insert into public.fin_rfqs(id,organization_id,legal_entity_id,product,title,status,owner_id,response_deadline,demand) values
 (pg_temp.cid(400),pg_temp.cid(100),pg_temp.cid(300),'acquiring','CRM scoped negotiation','open',pg_temp.cid(1),current_date+30,'{"monthly_volume":10000}'),
 (pg_temp.cid(401),pg_temp.cid(100),null,'acquiring','CRM group negotiation','open',pg_temp.cid(1),current_date+30,'{"monthly_volume":10000}');
create temporary table crm_ids(k text primary key,v jsonb); grant all on crm_ids to authenticated;
create function pg_temp.crm_id(k text) returns uuid language sql as $$select (v->>'id')::uuid from crm_ids where crm_ids.k=$1$$;
create function pg_temp.crm_error(q text,expected text) returns void language plpgsql as $$begin
 begin execute q; exception when others then if sqlerrm not like expected||'%' then raise exception 'unexpected % expected %',sqlerrm,expected; end if; return; end;
 raise exception 'expected failure: %',q;
end$$;
create function pg_temp.crm(kind text,vals jsonb,id uuid default null,version integer default null,scope jsonb default '{"legal_entity_id":"00000000-0000-4000-8000-000000c30300"}',request uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.fin_crm_command(pg_temp.cid(100),kind,id,version,request,case when id is not null then '{}'::jsonb else scope end,vals)
$$;
do $$ begin
 if has_table_privilege('authenticated','public.fin_crm_activities','INSERT') or has_table_privilege('authenticated','public.fin_crm_processes','UPDATE')
 or has_table_privilege('anon','public.fin_crm_activities','SELECT') or has_function_privilege('anon','public.fin_crm_command(uuid,text,uuid,integer,uuid,jsonb,jsonb)','EXECUTE')
 or has_function_privilege('authenticated','public.fin_crm_actor(uuid,uuid,uuid)','EXECUTE') then raise exception 'CRM privileges'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.cid(1)::text,true);
insert into crm_ids values('contract',jsonb_build_object('id',public.fin_import_contract(pg_temp.cid(100),pg_temp.cid(300),pg_temp.cid(200),'acquiring','Contrato de contexto CRM',current_date-100,current_date+60,10,false,'BRL','{"currency":"BRL"}',null)));
insert into crm_ids values('contact',pg_temp.crm('contact','{"name":"Contato do banco","source_reference":"Reunião informada"}',null,null,jsonb_build_object('legal_entity_id',pg_temp.cid(300),'provider_id',pg_temp.cid(200))));
insert into crm_ids values('process',pg_temp.crm('process',jsonb_build_object('title','Processo relacionado','stage','engagement','next_action','Revisar contrato','source_reference','Reunião','related_type','contract','related_id',pg_temp.crm_id('contract'))));
select pg_temp.crm('activity',jsonb_build_object('kind','follow_up','status','planned','subject','Atividade pelo contato','due_on',current_date+2,'source_reference','Reunião','contact_id',pg_temp.crm_id('contact')));
select pg_temp.crm('activity',jsonb_build_object('kind','commitment','status','planned','subject','Atividade pelo contrato','due_on',current_date+2,'source_reference','Reunião','related_type','contract','related_id',pg_temp.crm_id('contract')));
select pg_temp.crm('activity',jsonb_build_object('kind','meeting','status','planned','subject','Atividade pelo processo','due_on',current_date+2,'source_reference','Reunião','process_id',pg_temp.crm_id('process')));
do $$ begin
 if (select count(*) from public.fin_crm_institution_records where provider_ids @> array[pg_temp.cid(200)])<>4 then raise exception 'institution composition incomplete';end if;
 if (select count(*) from public.fin_crm_institution_records where provider_ids @> array[pg_temp.cid(200)] and record_type='activity')<>3 then raise exception 'inherited activities missing';end if;
end $$;
select set_config('request.jwt.claim.sub',pg_temp.cid(7)::text,true);
do $$ begin if exists(select 1 from public.fin_crm_institution_records where provider_ids @> array[pg_temp.cid(200)]) then raise exception 'institution view entity leak';end if;end $$;
select set_config('request.jwt.claim.sub',pg_temp.cid(4)::text,true);
do $$ begin if exists(select 1 from public.fin_crm_institution_records where organization_id=pg_temp.cid(100)) then raise exception 'institution view tenant leak';end if;end $$;
select set_config('request.jwt.claim.sub',pg_temp.cid(5)::text,true);
do $$ begin if exists(select 1 from public.fin_crm_institution_records where organization_id=pg_temp.cid(100)) then raise exception 'institution view provider leak';end if;end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.fin_crm_institution_records','SELECT') or has_table_privilege('authenticated','public.fin_crm_institution_records','INSERT') then raise exception 'institution view privileges';end if;
 if not exists(select 1 from pg_class where oid='public.fin_crm_institution_records'::regclass and 'security_invoker=true'=any(reloptions)) then raise exception 'view bypasses caller RLS';end if;
end $$;
rollback;

\set ON_ERROR_STOP on
begin;
create function pg_temp.cid(n integer) returns uuid language sql immutable as $$select ('00000000-0000-4000-8000-000000c1'||lpad(n::text,4,'0'))::uuid$$;
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
create function pg_temp.crm(kind text,vals jsonb,id uuid default null,version integer default null,scope jsonb default '{"legal_entity_id":"00000000-0000-4000-8000-000000c10300"}',request uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.fin_crm_command(pg_temp.cid(100),kind,id,version,request,case when id is not null then '{}'::jsonb else scope end,vals)
$$;
do $$ begin
 if has_table_privilege('authenticated','public.fin_crm_activities','INSERT') or has_table_privilege('authenticated','public.fin_crm_processes','UPDATE')
 or has_table_privilege('anon','public.fin_crm_activities','SELECT') or has_function_privilege('anon','public.fin_crm_command(uuid,text,uuid,integer,uuid,jsonb,jsonb)','EXECUTE')
 or has_function_privilege('authenticated','public.fin_crm_actor(uuid,uuid,uuid)','EXECUTE') then raise exception 'CRM privileges'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.cid(1)::text,true);
insert into crm_ids values('contract',jsonb_build_object('id',public.fin_import_contract(pg_temp.cid(100),pg_temp.cid(300),pg_temp.cid(200),'acquiring','CRM original contract',current_date-100,current_date+60,10,false,'BRL','{"currency":"BRL"}',null)));
insert into crm_ids values('invite',to_jsonb(public.fin_invite_provider(pg_temp.cid(401),pg_temp.cid(200))));
insert into crm_ids values('contact',pg_temp.crm('contact','{"name":"Contato autorizado","email":"contact@example.invalid","source_reference":"Reunião registrada"}',null,null,jsonb_build_object('legal_entity_id',pg_temp.cid(300),'provider_id',pg_temp.cid(200)),pg_temp.cid(600)));
do $$ declare replay jsonb; begin
 replay:=pg_temp.crm('contact','{"name":"Contato autorizado","email":"contact@example.invalid","source_reference":"Reunião registrada"}',null,null,jsonb_build_object('legal_entity_id',pg_temp.cid(300),'provider_id',pg_temp.cid(200)),pg_temp.cid(600));
 if replay->>'id'<>(select v->>'id' from crm_ids where k='contact') or replay->>'replayed'<>'true' then raise exception 'CRM replay'; end if;
 if (select count(*) from public.fin_events where event_type='crm_command_recorded' and metadata->>'request_key'=pg_temp.cid(600)::text)<>1 then raise exception 'duplicate CRM event'; end if;
end $$;
select pg_temp.crm_error(format('select pg_temp.crm(%L,%L,null,null,%L,%L)','contact','{"name":"Changed intent","source_reference":"Meeting"}',jsonb_build_object('legal_entity_id',pg_temp.cid(300),'provider_id',pg_temp.cid(200)),pg_temp.cid(600)),'crm request conflict');
select pg_temp.crm('contact',jsonb_build_object('name','Nome atualizado','owner_id',pg_temp.cid(8)),pg_temp.crm_id('contact'),1);
do $$ begin
 if not exists(select 1 from public.fin_events where entity_type='crm_contact' and entity_id=pg_temp.crm_id('contact') and metadata->'changes'->'name'->>'before'='Contato autorizado' and metadata->'changes'->'name'->>'after'='Nome atualizado') then raise exception 'contact correction history missing'; end if;
end $$;
select pg_temp.crm_error(format('select pg_temp.crm(%L,%L,%L,1)','contact','{"name":"Stale edit"}',pg_temp.crm_id('contact')),'crm version conflict');
insert into crm_ids values('process',pg_temp.crm('process',jsonb_build_object('title','Renegociar condições','stage','negotiation','next_action','Conferir proposta','source_reference','Planejamento da equipe','contact_id',pg_temp.crm_id('contact'),'related_type','rfq','related_id',pg_temp.cid(400))));
insert into crm_ids values('activity',pg_temp.crm('activity',jsonb_build_object('kind','email_record','subject','Condições discutidas','notes','Declaração manual, não comprovante de envio','occurred_at',now(),'source_reference','Anotação da equipe','contact_id',pg_temp.crm_id('contact'),'process_id',pg_temp.crm_id('process'),'related_type','contract','related_id',pg_temp.crm_id('contract'))));
select pg_temp.crm_error(format('select pg_temp.crm(%L,%L)','process',jsonb_build_object('title','Invalid reference','stage','prospect','next_action','Review','source_reference','Fixture','related_type','provider','related_id',pg_temp.cid(201))),'invalid crm reference');
select pg_temp.crm_error(format('select pg_temp.crm(%L,%L)','activity',jsonb_build_object('kind','note','subject','Wrong entity','occurred_at',now(),'source_reference','Fixture','related_type','rfq','related_id',pg_temp.cid(401))),'invalid crm reference');
select pg_temp.crm_error(format('select pg_temp.crm(%L,%L,%L,1)','process','{"stage":"won"}',pg_temp.crm_id('process')),'invalid crm');
select pg_temp.crm('process','{"stage":"won","outcome":"Acordo comercial declarado, sem alterar RFQ"}',pg_temp.crm_id('process'),1);
do $$ begin
 if not exists(select 1 from public.fin_rfqs where id=pg_temp.cid(400) and status='open') then raise exception 'CRM changed canonical RFQ'; end if;
 if not exists(select 1 from public.fin_events where entity_type='crm_process' and entity_id=pg_temp.crm_id('process') and metadata->>'previous_stage'='negotiation' and metadata->>'stage'='won') then raise exception 'missing stage history'; end if;
end $$;
-- The legacy archive increments the new version; it cannot be overwritten by
-- a stale CRM client. Existing activity retains its original contact link.
select public.fin_archive_provider_contact(pg_temp.crm_id('contact'));
select pg_temp.crm_error(format('select pg_temp.crm(%L,%L,%L,2)','contact','{"name":"Overwrite archive"}',pg_temp.crm_id('contact')),'crm version conflict');
select pg_temp.crm_error(format('select pg_temp.crm(%L,%L)','activity',jsonb_build_object('kind','note','subject','Archived contact','occurred_at',now(),'source_reference','Fixture','contact_id',pg_temp.crm_id('contact'))),'invalid crm contact');
select set_config('request.jwt.claim.sub',pg_temp.cid(2)::text,true);
do $$ begin if not exists(select 1 from public.fin_crm_activities where id=pg_temp.crm_id('activity')) then raise exception 'eligible entity invisible'; end if; end $$;
select set_config('request.jwt.claim.sub',pg_temp.cid(7)::text,true);
do $$ begin
 if exists(select 1 from public.fin_crm_activities where organization_id=pg_temp.cid(100)) or exists(select 1 from public.fin_provider_contacts where id=pg_temp.crm_id('contact'))
 or exists(select 1 from public.fin_events where entity_type like 'crm_%' and entity_id in(pg_temp.crm_id('activity'),pg_temp.crm_id('process'))) then raise exception 'CRM entity leak'; end if;
end $$;
select set_config('request.jwt.claim.sub',pg_temp.cid(3)::text,true);
select pg_temp.crm_error('select pg_temp.crm(''activity'',''{"kind":"note","subject":"Viewer write","source_reference":"Fixture"}'')','forbidden');
select set_config('request.jwt.claim.sub',pg_temp.cid(4)::text,true);
do $$ begin if exists(select 1 from public.fin_crm_processes where organization_id=pg_temp.cid(100)) then raise exception 'CRM tenant leak'; end if; end $$;
select set_config('request.jwt.claim.sub',pg_temp.cid(5)::text,true);
select public.fin_accept_provider_invite((select v#>>'{}' from crm_ids where k='invite'),pg_temp.cid(102));
do $$ begin if exists(select 1 from public.fin_crm_activities where organization_id=pg_temp.cid(100)) or exists(select 1 from public.fin_provider_contacts where organization_id=pg_temp.cid(100)) then raise exception 'buyer notes leaked to institution'; end if; end $$;
insert into crm_ids values('provider_contact',public.fin_crm_command(pg_temp.cid(102),'contact',null,null,pg_temp.cid(601),jsonb_build_object('counterparty_organization_id',pg_temp.cid(100)),'{"name":"Contato privado institucional","source_reference":"Cadastro da instituição"}'));
insert into crm_ids values('provider_process',public.fin_crm_command(pg_temp.cid(102),'process',null,null,pg_temp.cid(602),'{}',jsonb_build_object('title','Atendimento institucional','stage','engagement','next_action','Preparar resposta','source_reference','Demanda aceita','contact_id',pg_temp.crm_id('provider_contact'),'related_type','rfq','related_id',pg_temp.cid(401))));
select public.fin_crm_command(pg_temp.cid(102),'activity',null,null,pg_temp.cid(603),'{}',jsonb_build_object('kind','follow_up','status','planned','subject','Revisar atendimento','due_on',current_date+2,'source_reference','Próxima interação','process_id',pg_temp.crm_id('provider_process'),'related_type','rfq','related_id',pg_temp.cid(401)));
select pg_temp.crm_error(format('select public.fin_crm_command(%L,%L,null,null,%L,%L,%L)',pg_temp.cid(102),'activity',gen_random_uuid(),'{}',jsonb_build_object('kind','note','subject','Private contract','occurred_at',now(),'source_reference','Fixture','related_type','contract','related_id',pg_temp.crm_id('contract'))),'invalid crm reference');
select set_config('request.jwt.claim.sub',pg_temp.cid(6)::text,true);
do $$ begin if exists(select 1 from public.fin_crm_processes where organization_id=pg_temp.cid(102)) or exists(select 1 from public.fin_provider_contacts where organization_id=pg_temp.cid(102)) then raise exception 'provider cross-org leak'; end if; end $$;
reset role;
delete from public.fin_members where organization_id=pg_temp.cid(100) and user_id=pg_temp.cid(8);
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.cid(8)::text,true);
select pg_temp.crm_error('select pg_temp.crm(''process'',''{"title":"Revoked","stage":"prospect","next_action":"Review","source_reference":"Fixture"}'')','forbidden');
do $$ begin if exists(select 1 from public.fin_crm_activities where organization_id=pg_temp.cid(100)) then raise exception 'revoked CRM read'; end if; end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.fin_governance_export_datasets() where dataset='crm_activities') or not exists(select 1 from public.fin_governance_export_datasets() where dataset='crm_processes') then raise exception 'CRM export coverage'; end if;
end $$;
rollback;

\set ON_ERROR_STOP on
begin;
create function pg_temp.cid(n integer) returns uuid language sql immutable as $$select ('00000000-0000-4000-8000-000000c4'||lpad(n::text,4,'0'))::uuid$$;
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
create function pg_temp.crm(kind text,vals jsonb,id uuid default null,version integer default null,scope jsonb default '{"legal_entity_id":"00000000-0000-4000-8000-000000c40300"}',request uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.fin_crm_command(pg_temp.cid(100),kind,id,version,request,case when id is not null then '{}'::jsonb else scope end,vals)
$$;
do $$ begin
 if has_table_privilege('authenticated','public.fin_crm_activities','INSERT') or has_table_privilege('authenticated','public.fin_crm_processes','UPDATE')
 or has_table_privilege('anon','public.fin_crm_activities','SELECT') or has_function_privilege('anon','public.fin_crm_command(uuid,text,uuid,integer,uuid,jsonb,jsonb)','EXECUTE')
 or has_function_privilege('authenticated','public.fin_crm_actor(uuid,uuid,uuid)','EXECUTE') then raise exception 'CRM privileges'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.cid(1)::text,true);
insert into crm_ids values('contract',jsonb_build_object('id',public.fin_import_contract(pg_temp.cid(100),pg_temp.cid(300),pg_temp.cid(200),'cash_management','Contrato de tarifas de importação',current_date-100,current_date+365,30,false,'BRL','{"currency":"BRL"}',null)));
select public.fin_create_fee_schedule(pg_temp.cid(100),pg_temp.crm_id('contract'),jsonb_build_object('service','Tarifa de teste','category','account_maintenance','charging_unit','one_off','pricing_model','fixed_amount','currency','BRL','rate',10,'source','declared','source_reference','Condição contratual sintética','effective_from',current_date-100));
create function pg_temp.fee_rows(amount numeric default 12) returns jsonb language sql as $$
 select jsonb_build_array(jsonb_build_object('line',2,'values',jsonb_build_object('service','Tarifa de teste','charging_unit','one_off','currency','BRL','period_start',current_date-5,'period_end',current_date-5,'observed_amount',amount,'source_type','other_import','source_reference','Extrato/entry-1','source_object_id','entry-1','evidence_reference','Arquivo sintético confirmado')))
$$;
create function pg_temp.import_fee(request integer,rows jsonb default pg_temp.fee_rows(),origin jsonb default '{}') returns jsonb language sql as $$
 select public.fin_import_fee_batch(pg_temp.cid(100),pg_temp.crm_id('contract'),pg_temp.cid(request),repeat('a',64),'Tarifas.csv',rows,true,origin)
$$;
-- A later invalid line rolls back the earlier valid observation and receipt.
select pg_temp.crm_error('select pg_temp.import_fee(700,pg_temp.fee_rows()||jsonb_build_array(jsonb_build_object(''line'',3,''values'',jsonb_build_object(''service'',''Tarifa inválida'',''charging_unit'',''one_off'',''currency'',''BRL'',''period_start'',current_date-5,''period_end'',current_date-5,''observed_amount'',-1,''source_type'',''other_import'',''source_reference'',''Extrato/entry-2'',''source_object_id'',''entry-2'',''evidence_reference'',''Arquivo sintético''))))','invalid fee observation');
do $$ begin if exists(select 1 from public.fin_fee_observations where contract_id=pg_temp.crm_id('contract')) then raise exception 'partial import survived rollback';end if;end $$;
insert into crm_ids values('import',pg_temp.import_fee(701));
do $$ declare r jsonb;begin
 r:=pg_temp.import_fee(701);if r->>'replayed'<>'true' or r->>'imported'<>'1' then raise exception 'batch replay failed';end if;
 r:=pg_temp.import_fee(702);if r->>'imported'<>'0' or r->>'ignored'<>'1' then raise exception 'file dedupe failed';end if;
 if not exists(select 1 from public.fin_graph_objects where object_type='fee_observation' and object_id in(select id::text from public.fin_fee_observations where contract_id=pg_temp.crm_id('contract'))) then raise exception 'imported observation missing from financial graph';end if;
 if not exists(select 1 from public.fin_fee_variances where contract_id=pg_temp.crm_id('contract') and comparison_status='comparable' and variance_amount=2) then raise exception 'canonical difference not reconciled';end if;
 if not exists(select 1 from public.fin_fee_observations where contract_id=pg_temp.crm_id('contract') and ingestion_channel='structured_file' and verification_status='unverified') then raise exception 'capture channel or verification invented';end if;
 if (select count(*) from public.fin_fee_observations where contract_id=pg_temp.crm_id('contract'))<>1 or (select count(*) from public.fin_fee_variances where contract_id=pg_temp.crm_id('contract'))<>1 then raise exception 'observation/reconciliation duplicated';end if;
end $$;
select pg_temp.crm_error('select pg_temp.import_fee(701,pg_temp.fee_rows(13))','fee import request conflict');
select pg_temp.crm_error('select pg_temp.import_fee(703,pg_temp.fee_rows(13))','fee import source conflict');
select pg_temp.crm_error(format('select public.fin_import_fee_batch(%L,%L,%L,%L,%L,%L,false)',pg_temp.cid(100),pg_temp.crm_id('contract'),pg_temp.cid(704),repeat('a',64),'Tarifas.csv',pg_temp.fee_rows()),'fee import confirmation required');
create temporary table integration_settings(s jsonb);grant all on integration_settings to authenticated;
insert into integration_settings values(jsonb_build_object('tenant_id',pg_temp.cid(900),'environment','sandbox','company_id',pg_temp.cid(901),'account_id',pg_temp.cid(902),'currency','BRL','service','Tarifa ERP','charging_unit','one_off'));
select public.fin_configure_fee_integration(pg_temp.cid(100),pg_temp.cid(800),pg_temp.crm_id('contract'),0,pg_temp.cid(801),(select s from integration_settings),'configured');
do $$ declare r jsonb;begin
 r:=public.fin_configure_fee_integration(pg_temp.cid(100),pg_temp.cid(800),pg_temp.crm_id('contract'),0,pg_temp.cid(801),(select s from integration_settings),'configured');
 if r->>'replayed'<>'true' then raise exception 'configuration replay';end if;
end $$;
select public.fin_configure_fee_integration(pg_temp.cid(100),pg_temp.cid(800),pg_temp.crm_id('contract'),1,pg_temp.cid(802),(select s from integration_settings),'suspended');
select pg_temp.crm_error(format('select pg_temp.import_fee(705,pg_temp.fee_rows(),%L::jsonb)',jsonb_build_object('integration_id',pg_temp.cid(800),'expected_version',1)),'fee integration version conflict');
select public.fin_configure_fee_integration(pg_temp.cid(100),pg_temp.cid(800),pg_temp.crm_id('contract'),2,pg_temp.cid(803),(select s from integration_settings),'revoked');
select pg_temp.crm_error(format('select public.fin_configure_fee_integration(%L,%L,%L,3,%L,%L::jsonb,%L)',pg_temp.cid(100),pg_temp.cid(800),pg_temp.crm_id('contract'),pg_temp.cid(804),(select s from integration_settings),'configured'),'fee integration version conflict');
select set_config('request.jwt.claim.sub',pg_temp.cid(3)::text,true);
select pg_temp.crm_error('select pg_temp.import_fee(706)','forbidden');
select set_config('request.jwt.claim.sub',pg_temp.cid(7)::text,true);
do $$ begin if public.fin_fee_integration(pg_temp.cid(100),pg_temp.cid(800)) is not null then raise exception 'integration entity leak';end if;end $$;
select pg_temp.crm_error('select pg_temp.import_fee(707)','forbidden');
select set_config('request.jwt.claim.sub',pg_temp.cid(4)::text,true);
do $$ begin if public.fin_fee_integration(pg_temp.cid(100),pg_temp.cid(800)) is not null then raise exception 'integration tenant leak';end if;end $$;
reset role;
do $$ begin if has_function_privilege('authenticated','public.fin_record_fee_observation_internal(uuid,uuid,jsonb,text)','EXECUTE') then raise exception 'private ingestion helper exposed';end if;end $$;
do $$ begin if has_function_privilege('anon','public.fin_import_fee_batch(uuid,uuid,uuid,text,text,jsonb,boolean,jsonb)','EXECUTE') or has_function_privilege('anon','public.fin_configure_fee_integration(uuid,uuid,uuid,integer,uuid,jsonb,text)','EXECUTE') then raise exception 'ingestion anonymous grants';end if;end $$;
rollback;

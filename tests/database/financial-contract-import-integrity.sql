\set ON_ERROR_STOP on
begin;

-- Fixture com ids próprios (c1b): o runner canônico aplica este teste em bancos
-- onde financial-contract-onboarding.sql já gravou os ids c0b.
-- Contrato existente (docs/supabase-financial-contract-onboarding.sql): próxima
-- ação no registro, status pela data, duplicado recusado, contrato principal
-- coerente (provedor, entidade, organização), moeda coerente e negações de
-- papel, tenant, provedor e escopo de entidade.
insert into auth.users(id,email) values
('00000000-0000-4000-8000-00000c1b0001','onb-admin@example.invalid'),
('00000000-0000-4000-8000-00000c1b0002','onb-analyst@example.invalid'),
('00000000-0000-4000-8000-00000c1b0003','onb-manager-b@example.invalid'),
('00000000-0000-4000-8000-00000c1b0004','onb-other@example.invalid'),
('00000000-0000-4000-8000-00000c1b0005','onb-provider@example.invalid')
on conflict(id) do nothing;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('00000000-0000-4000-8000-00000c1b1001','Empresa onboarding DEMO','BUYER','00000000-0000-4000-8000-00000c1b0001'),
('00000000-0000-4000-8000-00000c1b1002','Outra empresa onboarding DEMO','BUYER','00000000-0000-4000-8000-00000c1b0004'),
('00000000-0000-4000-8000-00000c1b1003','Banco onboarding DEMO','PROVIDER','00000000-0000-4000-8000-00000c1b0005');
insert into public.fin_members(organization_id,user_id,role) values
('00000000-0000-4000-8000-00000c1b1001','00000000-0000-4000-8000-00000c1b0001','admin'),
('00000000-0000-4000-8000-00000c1b1001','00000000-0000-4000-8000-00000c1b0002','analyst'),
('00000000-0000-4000-8000-00000c1b1001','00000000-0000-4000-8000-00000c1b0003','finance_manager'),
('00000000-0000-4000-8000-00000c1b1002','00000000-0000-4000-8000-00000c1b0004','admin'),
('00000000-0000-4000-8000-00000c1b1003','00000000-0000-4000-8000-00000c1b0005','provider_user');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('00000000-0000-4000-8000-00000c1b1010','00000000-0000-4000-8000-00000c1b1001','Banco principal onboarding DEMO','bank','00000000-0000-4000-8000-00000c1b0001'),
('00000000-0000-4000-8000-00000c1b1012','00000000-0000-4000-8000-00000c1b1001','Adquirente onboarding DEMO','acquirer','00000000-0000-4000-8000-00000c1b0001'),
('00000000-0000-4000-8000-00000c1b1011','00000000-0000-4000-8000-00000c1b1002','Banco de outra empresa onboarding DEMO','bank','00000000-0000-4000-8000-00000c1b0004');

create temporary table onb_ids(key text primary key, value uuid);
grant all on onb_ids to authenticated;
create or replace function pg_temp.expect_error(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'esperava falha "%" em: %', p_message, p_sql;
exception when others then
  if sqlerrm not like p_message || '%' then raise exception 'falha inesperada em %: % (esperava %)', p_sql, sqlerrm, p_message; end if;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;


set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c1b0001',true);
insert into onb_ids select 'A',public.fin_create_legal_entity('00000000-0000-4000-8000-00000c1b1001','legal_entity','Intent entity A','IA',null,'BR','BRL',null);
insert into onb_ids select 'B',public.fin_create_legal_entity('00000000-0000-4000-8000-00000c1b1001','legal_entity','Intent entity B','IB',null,'BR','BRL',null);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-00000c1b1001','00000000-0000-4000-8000-00000c1b0003','entities',array[(select value from onb_ids where key='B')]);
create temporary table payload(v jsonb);
grant all on payload to authenticated;
insert into payload values(jsonb_build_object('provider_id','00000000-0000-4000-8000-00000c1b1010','product','credit','title','Intent import DEMO','starts_on',current_date,'ends_on',current_date+500,'renewal_notice_days',60,'auto_renew',false,'currency','BRL','terms','{}'::jsonb,'parent_contract_id',null));
insert into onb_ids select 'intent',(public.fin_import_contract_intent('00000000-0000-4000-8000-00000c1b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-0000000b0001',(select v from payload),'00000000-0000-4000-8000-00000c1b0002')->>'id')::uuid;
do $$ declare r jsonb; begin
 r:=public.fin_import_contract_intent('00000000-0000-4000-8000-00000c1b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-0000000b0001',(select v from payload),'00000000-0000-4000-8000-00000c1b0002');
 if not (r->>'replayed')::boolean or r->>'id'<>(select value::text from onb_ids where key='intent') then raise exception 'replay identity'; end if;
 if (select count(*) from public.fin_tasks where related_id=(select value from onb_ids where key='intent'))<>1 then raise exception 'duplicate task'; end if;
 if exists(select 1 from public.fin_tasks where related_id=(select value from onb_ids where key='intent') and assignee_id is not null) then raise exception 'owner inherited by task'; end if;
end $$;
select pg_temp.expect_error($q$select public.fin_import_contract_intent('00000000-0000-4000-8000-00000c1b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-0000000b0001',(select v||'{"title":"Different"}'::jsonb from payload),'00000000-0000-4000-8000-00000c1b0002')$q$,'duplicate request');
select pg_temp.expect_error($q$select public.fin_import_contract_intent('00000000-0000-4000-8000-00000c1b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-0000000b0002',(select v from payload),'00000000-0000-4000-8000-00000c1b0003')$q$,'invalid task assignee');
-- Distinct intent legitimately permits identical economics; no attribute heuristic.
insert into onb_ids select 'same-terms',(public.fin_import_contract_intent('00000000-0000-4000-8000-00000c1b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-0000000b0002',(select v from payload),null)->>'id')::uuid;
do $$ declare r jsonb; begin
 if (select owner_id from public.fin_contracts where id=(select value from onb_ids where key='same-terms'))<>auth.uid() then raise exception 'default owner'; end if;
 r:=public.fin_contract_import_result('00000000-0000-4000-8000-00000c1b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-0000000b0001');
 if r->>'state'<>'confirmed' or r->>'id'<>(select value::text from onb_ids where key='intent') then raise exception 'receipt'; end if;
 r:=public.fin_contract_import_result('00000000-0000-4000-8000-00000c1b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-0000000b0099');
 if r->>'state'<>'unconfirmed' or r->>'id' is not null then raise exception 'uncertain must not be 404'; end if;
end $$;
select public.fin_assign_contract_owner((select value from onb_ids where key='intent'),'00000000-0000-4000-8000-00000c1b0002','00000000-0000-4000-8000-00000c1b0001');
select pg_temp.expect_error($q$select public.fin_assign_contract_owner((select value from onb_ids where key='intent'),'00000000-0000-4000-8000-00000c1b0002','00000000-0000-4000-8000-00000c1b0002')$q$,'contract version conflict');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c1b0003',true);
select pg_temp.expect_error($q$select public.fin_contract_import_result('00000000-0000-4000-8000-00000c1b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-0000000b0001')$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c1b0004',true);
select pg_temp.expect_error($q$select public.fin_contract_import_result('00000000-0000-4000-8000-00000c1b1001',null,'00000000-0000-4000-8000-0000000b0001')$q$,'forbidden');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c1b0005',true);
select pg_temp.expect_error($q$select public.fin_contract_import_result('00000000-0000-4000-8000-00000c1b1001',null,'00000000-0000-4000-8000-0000000b0001')$q$,'forbidden');
reset role;
update public.fin_members set role='viewer' where user_id='00000000-0000-4000-8000-00000c1b0002';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000c1b0001',true);
select pg_temp.expect_error($q$select public.fin_assign_contract_owner((select value from onb_ids where key='intent'),'00000000-0000-4000-8000-00000c1b0001','00000000-0000-4000-8000-00000c1b0002')$q$,'invalid task assignee');
reset role;
update public.fin_members set role='analyst' where user_id='00000000-0000-4000-8000-00000c1b0002';
set local role authenticated;
select public.fin_assign_contract_owner((select value from onb_ids where key='intent'),'00000000-0000-4000-8000-00000c1b0001','00000000-0000-4000-8000-00000c1b0002');
reset role;
delete from public.fin_members where user_id='00000000-0000-4000-8000-00000c1b0002';
set local role authenticated;
do $$ declare r jsonb; begin
 r:=public.fin_contract_import_result('00000000-0000-4000-8000-00000c1b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-0000000b0001');
 if (r->>'owner_eligible')::boolean then raise exception 'departed owner eligible'; end if;
 r:=public.fin_import_contract_intent('00000000-0000-4000-8000-00000c1b1001',(select value from onb_ids where key='A'),'00000000-0000-4000-8000-0000000b0001',(select v||jsonb_build_object('title','  Intent import DEMO  ','currency','brl') from payload),'00000000-0000-4000-8000-00000c1b0002');
 if not (r->>'replayed')::boolean then raise exception 'normalized replay after exit'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.fin_import_contract_intent(uuid,uuid,uuid,jsonb,uuid)','EXECUTE') or has_function_privilege('authenticated','public.fin_import_contract_core(uuid,uuid,uuid,text,text,date,date,integer,boolean,text,jsonb,uuid,uuid,boolean)','EXECUTE') then raise exception 'private RPC grant'; end if;
end $$;
rollback;
\echo 'Contract intent: persistent replay, conflicts, owner, scope and isolation passed.'

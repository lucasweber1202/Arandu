\set ON_ERROR_STOP on
begin;
create function pg_temp.cid(n integer) returns uuid language sql immutable as $$select ('00000000-0000-4000-8000-000000c2'||lpad(n::text,4,'0'))::uuid$$;
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
create function pg_temp.crm(kind text,vals jsonb,id uuid default null,version integer default null,scope jsonb default '{"legal_entity_id":"00000000-0000-4000-8000-000000c20300"}',request uuid default gen_random_uuid()) returns jsonb language sql as $$
 select public.fin_crm_command(pg_temp.cid(100),kind,id,version,request,case when id is not null then '{}'::jsonb else scope end,vals)
$$;
do $$ begin
 if has_table_privilege('authenticated','public.fin_crm_activities','INSERT') or has_table_privilege('authenticated','public.fin_crm_processes','UPDATE')
 or has_table_privilege('anon','public.fin_crm_activities','SELECT') or has_function_privilege('anon','public.fin_crm_command(uuid,text,uuid,integer,uuid,jsonb,jsonb)','EXECUTE')
 or has_function_privilege('authenticated','public.fin_crm_actor(uuid,uuid,uuid)','EXECUTE') then raise exception 'CRM privileges'; end if;
end $$;

create temporary table pt_samples(modality text,terms jsonb);
grant all on pt_samples to authenticated;
insert into pt_samples values ('bank_guarantee','{"currency": "BRL", "product_terms": {"schema_version": "financial-product-terms-1", "modality": "bank_guarantee", "values": {"source_reference": "Contrato sintético 01", "beneficiary": "Beneficiário sintético", "currency": "BRL", "guaranteed_amount": 1000000, "valid_from": "2026-01-01", "valid_until": "2027-01-01", "commission_pct_year": 2, "day_count": "ACT/365F", "upfront_fee": 100, "other_expenses": 50}}}'::jsonb),
('fx_spot','{"currency": "BRL", "product_terms": {"schema_version": "financial-product-terms-1", "modality": "fx_spot", "values": {"source_reference": "Contrato sintético 02", "base_currency": "USD", "quote_currency": "BRL", "base_amount": 10000, "agreed_rate": 5.2, "trade_on": "2026-10-01", "settles_on": "2026-10-03", "side": "buy_base"}}}'::jsonb),
('fx_forward','{"currency": "BRL", "product_terms": {"schema_version": "financial-product-terms-1", "modality": "fx_forward", "values": {"source_reference": "Contrato sintético 03", "base_currency": "USD", "quote_currency": "BRL", "base_amount": 10000, "agreed_rate": 5.3, "trade_on": "2026-10-01", "settles_on": "2026-12-01", "side": "sell_base"}}}'::jsonb),
('ndf','{"currency": "BRL", "product_terms": {"schema_version": "financial-product-terms-1", "modality": "ndf", "values": {"source_reference": "Contrato sintético 04", "base_currency": "USD", "quote_currency": "BRL", "base_amount": 10000, "agreed_rate": 5.3, "trade_on": "2026-10-01", "settles_on": "2026-12-01", "side": "sell_base", "fixing_on": "2026-11-30", "settlement_currency": "BRL", "fixing_source": "PTAX declarada no contrato"}}}'::jsonb),
('swap','{"currency": "BRL", "product_terms": {"schema_version": "financial-product-terms-1", "modality": "swap", "values": {"source_reference": "Contrato sintético 05", "currency": "BRL", "notional": 1000000, "starts_on": "2026-01-01", "ends_on": "2027-01-01", "pay_index": "CDI", "receive_index": "IPCA", "pay_spread_pct_year": 1, "receive_spread_pct_year": 2, "day_count": "ACT/365F", "payment_frequency": "Semestral", "notional_exchange": "none"}}}'::jsonb);
set role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.cid(1)::text,true);
insert into crm_ids select modality,jsonb_build_object('id',public.fin_import_contract(pg_temp.cid(100),pg_temp.cid(300),pg_temp.cid(200),case when modality='bank_guarantee' then 'guarantee' else 'fx' end,'Produto sintético '||modality,'2026-01-01','2027-12-31',30,false,'BRL',terms,null)) from pt_samples;
do $$ declare c uuid; t jsonb; begin
 select pg_temp.crm_id('bank_guarantee') into c;
 select terms into t from pt_samples where modality='bank_guarantee';
 if (select terms from public.fin_contract_versions where contract_id=c and version=1) is distinct from t then raise exception 'specialized terms not persisted'; end if;
 perform public.fin_record_contract_terms(c,jsonb_set(t,'{product_terms,values,commission_pct_year}','3'),1,'Correção sintética','2026-01-01');
 if (select terms#>>'{product_terms,values,commission_pct_year}' from public.fin_contract_versions where contract_id=c and version=1)<>'2' then raise exception 'historical terms overwritten'; end if;
 perform pg_temp.crm_error(format('select public.fin_record_contract_terms(%L,%L::jsonb,2,%L)',c,jsonb_set(t,'{product_terms,values,commission_pct_year}','"not-number"'),'Teste inválido'),'invalid contract terms');
 perform pg_temp.crm_error(format('select public.fin_record_contract_terms(%L,%L::jsonb,1,%L)',c,t,'Teste versão'),'contract version conflict');
 perform pg_temp.crm_error(format('select public.fin_record_contract_terms(%L,%L::jsonb,2,%L)',c,(select terms from pt_samples where modality='ndf'),'Teste modalidade'),'invalid contract terms');
end $$;
select set_config('request.jwt.claim.sub',pg_temp.cid(3)::text,true);
select pg_temp.crm_error(format('select public.fin_record_contract_terms(%L,%L::jsonb,2,%L)',pg_temp.crm_id('bank_guarantee'),(select terms from pt_samples where modality='bank_guarantee'),'Sem papel'),'forbidden');
select set_config('request.jwt.claim.sub',pg_temp.cid(7)::text,true);
do $$ begin if exists(select 1 from public.fin_contract_versions where contract_id in(select (v->>'id')::uuid from crm_ids)) then raise exception 'specialized cross entity leak';end if;end $$;
select set_config('request.jwt.claim.sub',pg_temp.cid(4)::text,true);
do $$ begin if exists(select 1 from public.fin_contract_versions where organization_id=pg_temp.cid(100)) then raise exception 'specialized cross tenant leak';end if;end $$;
reset role;
rollback;

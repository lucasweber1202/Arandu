\set ON_ERROR_STOP on
-- Real JWT/RLS probes on fixtures created by financial-multi-entity.sql.
create temporary table pe_ids(key text primary key,value uuid);
insert into pe_ids select 'A',id from public.fin_legal_entities where organization_id='00000000-0000-4000-8000-0000000ef001' and short_name='Vitta Alimentos';
insert into pe_ids select 'B',id from public.fin_legal_entities where organization_id='00000000-0000-4000-8000-0000000ef001' and short_name='Vitta Log';
grant all on pe_ids to authenticated;
create or replace function pg_temp.pe_denied(p_sql text) returns void language plpgsql as $$ begin
 execute p_sql; raise exception 'probe unexpectedly succeeded';
exception when others then if sqlerrm not in ('forbidden','immutable record','invalid passport usage','invalid search') then raise; end if; end $$;
grant execute on function pg_temp.pe_denied(text) to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee001',false);
select public.fin_passport_set_field('00000000-0000-4000-8000-0000000ef001','receita_anual','900','extrato');
select public.fin_passport_set_field('00000000-0000-4000-8000-0000000ef001','moeda_base','BRL','declarado_pela_empresa');
select public.fin_passport_set_scoped_field('00000000-0000-4000-8000-0000000ef001',(select value from pe_ids where key='A'),'receita_anual','100','extrato');
select public.fin_passport_set_scoped_field('00000000-0000-4000-8000-0000000ef001',(select value from pe_ids where key='B'),'receita_anual','200','extrato');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee003',false);
do $$ begin
 if exists(select 1 from public.fin_company_profiles where field_value in ('900','200')) then raise exception 'entity or group balance leak'; end if;
 if not exists(select 1 from public.fin_company_profiles where field_key='moeda_base' and field_value='BRL') then raise exception 'permitted group default hidden'; end if;
 if exists(select 1 from public.fin_company_profile_history where new_value in ('900','200')) then raise exception 'history leak'; end if;
end $$;
select pg_temp.pe_denied($q$select public.fin_passport_set_scoped_field('00000000-0000-4000-8000-0000000ef001',(select value from pe_ids where key='B'),'receita_anual','999','extrato')$q$);
select pg_temp.pe_denied($q$select public.fin_passport_set_field('00000000-0000-4000-8000-0000000ef001','receita_anual','999','extrato')$q$);
insert into pe_ids select 'rfq',public.fin_create_rfq_in_entity('00000000-0000-4000-8000-0000000ef001',(select value from pe_ids where key='A'),'credit','Passport entity A DEMO',null,'{"amount":1,"purpose":"outro","term_months":1,"annual_revenue":100}',null,'[{"demand_key":"annual_revenue","field_key":"receita_anual"}]');
do $$ begin
 if not exists(select 1 from public.fin_rfq_profile_snapshots where rfq_id=(select value from pe_ids where key='rfq') and field_value='100' and original_scope='entity' and legal_entity_id=(select value from pe_ids where key='A') and source_legal_entity_id=legal_entity_id and vintage is not null and profile_updated_by is not null) then raise exception 'snapshot scope/provenance missing'; end if;
end $$;
select public.fin_passport_set_scoped_field('00000000-0000-4000-8000-0000000ef001',(select value from pe_ids where key='A'),'receita_anual','101','extrato');
do $$ begin if exists(select 1 from public.fin_search_passport('00000000-0000-4000-8000-0000000ef001',(select value from pe_ids where key='A'),'200')) then raise exception 'search sibling leak'; end if; end $$;
select pg_temp.pe_denied($q$select * from public.fin_search_passport('00000000-0000-4000-8000-0000000ef001',(select value from pe_ids where key='B'),'200')$q$);
select pg_temp.pe_denied($q$select * from public.fin_search_passport('00000000-0000-4000-8000-0000000ef001',(select value from pe_ids where key='A'),'100',null,0)$q$);
do $$ begin
 if (select field_value from public.fin_rfq_profile_snapshots where rfq_id=(select value from pe_ids where key='rfq'))<>'100' then raise exception 'snapshot mutated after update'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee004',false);
do $$ begin if exists(select 1 from public.fin_rfq_profile_snapshots where rfq_id=(select value from pe_ids where key='rfq')) then raise exception 'sibling snapshot leak'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee007',false);
do $$ begin if exists(select 1 from public.fin_company_profiles where organization_id='00000000-0000-4000-8000-0000000ef001') or exists(select 1 from public.fin_company_profile_history where organization_id='00000000-0000-4000-8000-0000000ef001') or exists(select 1 from public.fin_rfq_profile_snapshots where rfq_id=(select value from pe_ids where key='rfq')) then raise exception 'provider passport leak'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee006',false);
do $$ begin if exists(select 1 from public.fin_company_profiles where organization_id='00000000-0000-4000-8000-0000000ef001') then raise exception 'tenant passport leak'; end if; end $$;
reset role;
-- Loss of access changes authorization, never historical facts.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee001',false);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee003','entities',array[(select value from pe_ids where key='B')]);
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee003',false);
do $$ begin if exists(select 1 from public.fin_rfq_profile_snapshots where rfq_id=(select value from pe_ids where key='rfq')) then raise exception 'revoked entity snapshot leak'; end if; end $$;
reset role;
do $$ begin if (select field_value from public.fin_rfq_profile_snapshots where rfq_id=(select value from pe_ids where key='rfq'))<>'100' then raise exception 'revocation mutated snapshot'; end if; end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000ee001',false);
select public.fin_set_member_entity_scope('00000000-0000-4000-8000-0000000ef001','00000000-0000-4000-8000-0000000ee003','entities',array[(select value from pe_ids where key='A')]);
select set_config('request.jwt.claim.sub','',false);

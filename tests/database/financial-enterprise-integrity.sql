\set ON_ERROR_STOP on
begin;
do $$ begin
  if has_function_privilege('authenticated','public.fin_record_decision(uuid,uuid,jsonb,text)','EXECUTE')
    or has_function_privilege('anon','public.fin_record_decision(uuid,uuid,jsonb,text)','EXECUTE')
    or has_function_privilege('service_role','public.fin_record_decision(uuid,uuid,jsonb,text)','EXECUTE') then
    raise exception 'unversioned decision entry point still exposed';
  end if;
  if not has_function_privilege('authenticated','public.fin_record_decision_v2(uuid,uuid,integer,jsonb,text)','EXECUTE') then
    raise exception 'versioned decision entry point unavailable';
  end if;
  if has_function_privilege('anon','public.fin_assignment_buyer_names(uuid,uuid[])','EXECUTE') then raise exception 'buyer identity exposed to anon'; end if;
end $$;
set local role authenticated;
do $$ begin
  begin
    perform public.fin_record_decision(gen_random_uuid(),gen_random_uuid());
    raise exception 'old RPC callable';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
-- Reuse the existing integrity suite's two-tenant/provider fixture. No new
-- permanent rows: all additional identity checks roll back with this test.
create temporary table ei_ids as
select 'buyer'::text key,id value from public.fin_organizations where created_by='00000000-0000-4000-8000-00000000d201'
union all select 'provider',id from public.fin_organizations where created_by='00000000-0000-4000-8000-00000000d202';
grant select on ei_ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d202',true);
do $$ declare rows integer; names text; begin
  select count(*),min(buyer_name) into rows,names from public.fin_assignment_buyer_names(
    (select value from ei_ids where key='provider'),array(select id from public.fin_rfqs));
  if rows<>1 or names<>'Compradora integridade DEMO' then raise exception 'accepted assignment buyer name unavailable: %',rows; end if;
  if exists(select 1 from public.fin_organizations where id=(select value from ei_ids where key='buyer')) then
    raise exception 'buyer identity RPC widened organization RLS';
  end if;
  if exists(select 1 from public.fin_assignment_buyer_names((select value from ei_ids where key='provider'),array[gen_random_uuid()])) then
    raise exception 'unrelated RFQ name leaked';
  end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d204',true);
do $$ begin
  begin
    perform public.fin_assignment_buyer_names((select value from ei_ids where key='provider'),array[gen_random_uuid()]);
    raise exception 'cross-tenant assignment names accessible';
  exception when others then if sqlerrm<>'forbidden' then raise; end if; end;
end $$;
reset role;
insert into auth.users(id,email) values('00000000-0000-4000-8000-00000000ec01','competing-provider@example.invalid');
insert into public.fin_organizations(id,legal_name,kind,created_by)
values('00000000-0000-4000-8000-00000000ec02','Other provider DEMO','PROVIDER','00000000-0000-4000-8000-00000000ec01');
insert into public.fin_members(organization_id,user_id,role)
values('00000000-0000-4000-8000-00000000ec02','00000000-0000-4000-8000-00000000ec01','provider_user');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ec01',true);
do $$ begin
  if exists(select 1 from public.fin_assignment_buyer_names('00000000-0000-4000-8000-00000000ec02',array(select id from public.fin_rfqs))) then
    raise exception 'competing provider read buyer names';
  end if;
  begin
    perform public.fin_assignment_buyer_names((select value from ei_ids where key='provider'),array[gen_random_uuid()]);
    raise exception 'competing provider forged organization';
  exception when others then if sqlerrm<>'forbidden' then raise; end if; end;
end $$;
reset role;
delete from public.fin_members where organization_id=(select value from ei_ids where key='provider') and user_id='00000000-0000-4000-8000-00000000d202';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000d202',true);
do $$ begin
  begin
    perform public.fin_assignment_buyer_names((select value from ei_ids where key='provider'),array[gen_random_uuid()]);
    raise exception 'removed member read buyer identity';
  exception when others then if sqlerrm<>'forbidden' then raise; end if; end;
end $$;
rollback;
select 'Enterprise integrity: legacy RPC closed, v2 available, buyer identity isolated and revoked members denied' as result;

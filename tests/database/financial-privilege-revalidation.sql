\set ON_ERROR_STOP on
-- Current-schema attack: the same caller/session loses entity and membership
-- access immediately between statements. Entire synthetic fixture rolls back.
begin;
do $$
begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname like 'fin\_%' escape '\' and p.prosecdef
   and (p.proconfig is null or not ('search_path=""'=any(p.proconfig))
     or has_function_privilege('anon',p.oid,'execute')
     or exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'))) then
   raise exception 'Financial definer exposed or unsafe search_path';
 end if;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fin_record_decision' and has_function_privilege('authenticated',p.oid,'execute')) then raise exception 'Old decision entry reopened';end if;
end $$;
insert into auth.users(id) values('77000000-0000-4000-8000-000000000001'),('77000000-0000-4000-8000-000000000002');
insert into public.fin_organizations(id,legal_name,kind,created_by) values('77000000-0000-4000-8000-000000000010','Privilege revalidation synthetic','BUYER','77000000-0000-4000-8000-000000000001');
insert into public.fin_members(organization_id,user_id,role,entity_scope) values
 ('77000000-0000-4000-8000-000000000010','77000000-0000-4000-8000-000000000001','admin','group'),
 ('77000000-0000-4000-8000-000000000010','77000000-0000-4000-8000-000000000002','viewer','entities');
insert into public.fin_legal_entities(id,organization_id,legal_name,created_by) values
 ('77000000-0000-4000-8000-000000000020','77000000-0000-4000-8000-000000000010','Synthetic entity A','77000000-0000-4000-8000-000000000001'),
 ('77000000-0000-4000-8000-000000000021','77000000-0000-4000-8000-000000000010','Synthetic entity B','77000000-0000-4000-8000-000000000001');
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
 ('77000000-0000-4000-8000-000000000010','77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000020','77000000-0000-4000-8000-000000000001');
insert into public.fin_rfqs(id,organization_id,legal_entity_id,product,title,owner_id) values
 ('77000000-0000-4000-8000-000000000030','77000000-0000-4000-8000-000000000010','77000000-0000-4000-8000-000000000020','credit','Synthetic RFQ A','77000000-0000-4000-8000-000000000001'),
 ('77000000-0000-4000-8000-000000000031','77000000-0000-4000-8000-000000000010','77000000-0000-4000-8000-000000000021','credit','Synthetic RFQ B','77000000-0000-4000-8000-000000000001');
insert into public.fin_tasks(organization_id,related_type,related_id,title,created_by) values
 ('77000000-0000-4000-8000-000000000010','rfq','77000000-0000-4000-8000-000000000030','Synthetic revalidation task A','77000000-0000-4000-8000-000000000001'),
 ('77000000-0000-4000-8000-000000000010','rfq','77000000-0000-4000-8000-000000000031','Synthetic revalidation task B','77000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','77000000-0000-4000-8000-000000000002',true);
do $$begin
 if (select count(*) from public.fin_tasks where organization_id='77000000-0000-4000-8000-000000000010')<>1 then raise exception 'Entity isolation failed';end if;
 if not public.fin_has_role('77000000-0000-4000-8000-000000000010') then raise exception 'Fixture membership absent';end if;
end $$;
reset role;
delete from public.fin_member_entity_grants where organization_id='77000000-0000-4000-8000-000000000010' and user_id='77000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$begin
 if exists(select 1 from public.fin_tasks where organization_id='77000000-0000-4000-8000-000000000010') then raise exception 'Revoked entity still visible';end if;
end $$;
reset role;
delete from public.fin_members where organization_id='77000000-0000-4000-8000-000000000010' and user_id='77000000-0000-4000-8000-000000000002';
set local role authenticated;
do $$begin
 if public.fin_has_role('77000000-0000-4000-8000-000000000010') then raise exception 'Revoked membership cached';end if;
 if exists(select 1 from public.fin_tasks where organization_id='77000000-0000-4000-8000-000000000010') then raise exception 'Revoked membership still reads';end if;
 begin
   perform public.fin_search('77000000-0000-4000-8000-000000000010','Synthetic',null,12,0);
   raise exception 'Revoked membership RPC accepted';
 exception when others then
   if sqlerrm not like 'forbidden%' then raise;end if;
 end;
end $$;
rollback;

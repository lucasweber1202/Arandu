\set ON_ERROR_STOP on
begin;
-- Synthetic data; real caller RLS on both sides of the derived projection.
insert into auth.users(id,email) select ('30000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'continuity-'||i||'@example.invalid' from generate_series(1,5) i;
insert into public.fin_organizations(id,legal_name,kind,created_by) values
('30000000-0000-4000-8000-000000000011','Continuity buyer DEMO','BUYER','30000000-0000-4000-8000-000000000001'),
('30000000-0000-4000-8000-000000000012','Other buyer DEMO','BUYER','30000000-0000-4000-8000-000000000004'),
('30000000-0000-4000-8000-000000000013','Provider DEMO','PROVIDER','30000000-0000-4000-8000-000000000005');
insert into public.fin_members(organization_id,user_id,role) values
('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000001','admin'),
('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000002','viewer'),
('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000003','analyst'),
('30000000-0000-4000-8000-000000000012','30000000-0000-4000-8000-000000000004','admin'),
('30000000-0000-4000-8000-000000000013','30000000-0000-4000-8000-000000000005','provider_user');
insert into public.fin_providers(id,organization_id,name,kind,created_by) values
('30000000-0000-4000-8000-000000000101','30000000-0000-4000-8000-000000000011','Bank DEMO','bank','30000000-0000-4000-8000-000000000001');
insert into public.fin_legal_entities(id,organization_id,kind,legal_name,created_by) values
('30000000-0000-4000-8000-000000000201','30000000-0000-4000-8000-000000000011','legal_entity','Visible DEMO','30000000-0000-4000-8000-000000000001'),
('30000000-0000-4000-8000-000000000202','30000000-0000-4000-8000-000000000011','legal_entity','Hidden DEMO','30000000-0000-4000-8000-000000000001');
update public.fin_members set entity_scope='entities' where user_id='30000000-0000-4000-8000-000000000003';
insert into public.fin_member_entity_grants(organization_id,user_id,entity_id,granted_by) values
('30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000201','30000000-0000-4000-8000-000000000001');
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000001',true);
insert into public.fin_contracts(id,organization_id,provider_id,product,starts_on,ends_on,owner_id,origin,title,legal_entity_id,created_at,status)
select ('30000000-0000-4000-8000-'||lpad((1000+i)::text,12,'0'))::uuid,'30000000-0000-4000-8000-000000000011','30000000-0000-4000-8000-000000000101','credit',current_date-500,current_date+300,'30000000-0000-4000-8000-000000000001','imported','Continuity contract '||i,
 case when i=202 then '30000000-0000-4000-8000-000000000202'::uuid else '30000000-0000-4000-8000-000000000201'::uuid end,
 '2026-01-01'::timestamptz+(204-i)*interval '1 second',case when i=203 then 'terminated' else 'active' end
from generate_series(1,203) i;
insert into public.fin_tasks(organization_id,title,due_on,status,related_type,related_id,created_by)
select '30000000-0000-4000-8000-000000000011','Continuity task '||i,case when i=203 then null else current_date-1 end,'open','contract',('30000000-0000-4000-8000-'||lpad((1000+i)::text,12,'0'))::uuid,'30000000-0000-4000-8000-000000000001' from generate_series(201,203) i;
insert into public.fin_tasks(organization_id,title,status,related_type,related_id,created_by) values
('30000000-0000-4000-8000-000000000011','Completed task','done','contract','30000000-0000-4000-8000-000000001201','30000000-0000-4000-8000-000000000001');
set local role authenticated;
do $$ begin
 if (select count(*) from public.fin_provider_contract_tasks where organization_id='30000000-0000-4000-8000-000000000011' and status='open')<>3 then raise exception 'buyer lost authorized tasks'; end if;
 if exists(select 1 from public.fin_provider_contract_tasks where assignee_id is not null) then raise exception 'owner was copied into assignee'; end if;
 if not exists(select 1 from public.fin_provider_contract_tasks where related_id='30000000-0000-4000-8000-000000001201' and status='open') then raise exception 'contract 201 hidden'; end if;
 if exists(select 1 from (select id from public.fin_contracts where organization_id='30000000-0000-4000-8000-000000000011' order by created_at desc,id desc limit 200) c where id='30000000-0000-4000-8000-000000001201') then raise exception 'fixture did not cross page boundary'; end if;
end $$;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
do $$ begin if (select count(*) from public.fin_provider_contract_tasks where status='open')<>3 then raise exception 'reader lost access'; end if; end $$;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',true);
do $$ begin
 if (select count(*) from public.fin_provider_contract_tasks where status='open')<>2 then raise exception 'entity isolation failed'; end if;
 if exists(select 1 from public.fin_provider_contract_tasks where legal_entity_id='30000000-0000-4000-8000-000000000202') then raise exception 'hidden entity leaked'; end if;
end $$;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000004',true);
do $$ begin if exists(select 1 from public.fin_provider_contract_tasks) then raise exception 'other tenant leaked'; end if; end $$;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000005',true);
do $$ begin if exists(select 1 from public.fin_provider_contract_tasks) then raise exception 'provider leaked'; end if; end $$;
reset role;
delete from public.fin_members where user_id='30000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000002',true);
do $$ begin if exists(select 1 from public.fin_provider_contract_tasks) then raise exception 'removed member leaked'; end if; end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.fin_provider_contract_tasks','SELECT') or has_table_privilege('authenticated','public.fin_provider_contract_tasks','INSERT,UPDATE,DELETE') then raise exception 'projection grants unsafe'; end if;
end $$;
rollback;
